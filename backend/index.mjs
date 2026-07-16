/* ================================================================
   BE:MOVE GYM 채용 API (AWS Lambda, Node.js 20)
   - 공개:  GET /jobs, POST /applications
   - 어드민: /admin/* (x-admin-token 헤더 필요)
   ================================================================ */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient, ScanCommand, PutCommand,
  UpdateCommand, DeleteCommand, GetCommand,
} from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const JOBS_TABLE = process.env.JOBS_TABLE;
const APPS_TABLE = process.env.APPS_TABLE;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

// 채용 파이프라인 단계 (노션 채용 시스템 기준)
export const STAGES = ["신규 접수", "전화 스크리닝", "면접·실기", "최종·처우협의", "합격·입사", "불합격"];

const res = (status, body) => ({
  statusCode: status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type,x-admin-token",
    "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
  },
  body: JSON.stringify(body),
});

const todayKST = () =>
  new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

export const handler = async (event) => {
  const method = event.requestContext?.http?.method ?? event.httpMethod;
  const path = (event.rawPath ?? event.path ?? "/").replace(/\/+$/, "") || "/";
  const body = event.body ? JSON.parse(event.body) : {};

  if (method === "OPTIONS") return res(200, { ok: true });

  try {
    /* ---------- 공개 엔드포인트 ---------- */
    if (method === "GET" && path === "/jobs") {
      const { Items = [] } = await db.send(new ScanCommand({ TableName: JOBS_TABLE }));
      const today = todayKST();
      const list = Items
        .filter((j) => j.active !== false && (!j.deadline || j.deadline >= today))
        .sort((a, b) => (b.posted || "").localeCompare(a.posted || ""));
      return res(200, list);
    }

    if (method === "POST" && path === "/applications") {
      const { name, phone, role, branch, message } = body;
      if (!name || !phone || !role || !branch) return res(400, { error: "필수 항목이 비었습니다." });
      const item = {
        id: randomUUID(),
        name: String(name).slice(0, 60),
        phone: String(phone).slice(0, 30),
        role: String(role).slice(0, 40),
        branch: String(branch).slice(0, 40),
        message: String(message || "").slice(0, 2000),
        status: STAGES[0],
        memo: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await db.send(new PutCommand({ TableName: APPS_TABLE, Item: item }));
      return res(201, { ok: true, id: item.id });
    }

    /* ---------- 어드민 엔드포인트 ---------- */
    if (path.startsWith("/admin")) {
      const token = event.headers?.["x-admin-token"];
      if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) return res(401, { error: "인증 실패" });

      if (method === "GET" && path === "/admin/jobs") {
        const { Items = [] } = await db.send(new ScanCommand({ TableName: JOBS_TABLE }));
        return res(200, Items.sort((a, b) => (b.posted || "").localeCompare(a.posted || "")));
      }

      if (method === "POST" && path === "/admin/jobs") {
        const item = sanitizeJob(body);
        item.id = randomUUID();
        item.createdAt = new Date().toISOString();
        await db.send(new PutCommand({ TableName: JOBS_TABLE, Item: item }));
        return res(201, item);
      }

      const jobMatch = path.match(/^\/admin\/jobs\/([\w-]+)$/);
      if (jobMatch) {
        const id = jobMatch[1];
        if (method === "PUT") {
          const prev = await db.send(new GetCommand({ TableName: JOBS_TABLE, Key: { id } }));
          if (!prev.Item) return res(404, { error: "공고 없음" });
          const item = { ...sanitizeJob(body), id, createdAt: prev.Item.createdAt };
          await db.send(new PutCommand({ TableName: JOBS_TABLE, Item: item }));
          return res(200, item);
        }
        if (method === "DELETE") {
          await db.send(new DeleteCommand({ TableName: JOBS_TABLE, Key: { id } }));
          return res(200, { ok: true });
        }
      }

      if (method === "GET" && path === "/admin/applications") {
        const { Items = [] } = await db.send(new ScanCommand({ TableName: APPS_TABLE }));
        return res(200, Items.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")));
      }

      const appMatch = path.match(/^\/admin\/applications\/([\w-]+)$/);
      if (appMatch) {
        const id = appMatch[1];
        if (method === "PUT") {
          const sets = [];
          const vals = {};
          if (body.status && STAGES.includes(body.status)) { sets.push("#s = :s"); vals[":s"] = body.status; }
          if (typeof body.memo === "string") { sets.push("memo = :m"); vals[":m"] = body.memo.slice(0, 2000); }
          if (!sets.length) return res(400, { error: "변경할 내용 없음" });
          sets.push("updatedAt = :u"); vals[":u"] = new Date().toISOString();
          await db.send(new UpdateCommand({
            TableName: APPS_TABLE, Key: { id },
            UpdateExpression: "SET " + sets.join(", "),
            ExpressionAttributeNames: { "#s": "status" },
            ExpressionAttributeValues: vals,
          }));
          return res(200, { ok: true });
        }
        if (method === "DELETE") {
          await db.send(new DeleteCommand({ TableName: APPS_TABLE, Key: { id } }));
          return res(200, { ok: true });
        }
      }
    }

    return res(404, { error: "not found" });
  } catch (e) {
    console.error(e);
    return res(500, { error: "서버 오류" });
  }
};

function sanitizeJob(b) {
  return {
    title: String(b.title || "").slice(0, 120),
    role: String(b.role || "트레이너").slice(0, 30),
    branch: String(b.branch || "").slice(0, 30),
    type: String(b.type || "정규직").slice(0, 20),
    headcount: Number(b.headcount) || 1,
    posted: String(b.posted || todayKST()).slice(0, 10),
    deadline: String(b.deadline || "").slice(0, 10),
    desc: String(b.desc || "").slice(0, 1000),
    tags: Array.isArray(b.tags) ? b.tags.slice(0, 8).map((t) => String(t).slice(0, 20)) : [],
    active: b.active !== false,
  };
}
