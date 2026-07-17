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
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

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

      // AI 공고문 생성 — Claude API로 채널별 맞춤 공고문 작성
      if (method === "POST" && path === "/admin/generate") {
        if (!ANTHROPIC_API_KEY) return res(400, { error: "NO_KEY" });
        const job = body.job || {};
        const channel = String(body.channel || "알바천국").slice(0, 30);
        const siteUrl = String(body.siteUrl || "").slice(0, 200);
        try {
          const text = await generateJobPost(job, channel, siteUrl);
          return res(200, { text });
        } catch (e) {
          console.error("AI generate:", e);
          return res(502, { error: "AI_FAIL" });
        }
      }

      const appMatch = path.match(/^\/admin\/applications\/([\w-]+)$/);
      if (appMatch) {
        const id = appMatch[1];
        if (method === "PUT") {
          const sets = [];
          const vals = {};
          if (body.status && STAGES.includes(body.status)) { sets.push("#s = :s"); vals[":s"] = body.status; }
          if (typeof body.memo === "string") { sets.push("memo = :m"); vals[":m"] = body.memo.slice(0, 2000); }
          if (body.score !== undefined) {
            const sc = Math.max(0, Math.min(5, Number(body.score) || 0));
            sets.push("score = :sc"); vals[":sc"] = sc;
          }
          if (Array.isArray(body.onboarding)) {
            sets.push("onboarding = :ob");
            vals[":ob"] = body.onboarding.slice(0, 20).map((k) => String(k).slice(0, 40));
          }
          if (!sets.length) return res(400, { error: "변경할 내용 없음" });
          sets.push("updatedAt = :u"); vals[":u"] = new Date().toISOString();
          const params = {
            TableName: APPS_TABLE, Key: { id },
            UpdateExpression: "SET " + sets.join(", "),
            ExpressionAttributeValues: vals,
          };
          // #s(status)를 실제로 사용할 때만 이름 매핑 포함 (미사용 시 DynamoDB 오류)
          if (vals[":s"] !== undefined) params.ExpressionAttributeNames = { "#s": "status" };
          await db.send(new UpdateCommand(params));
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

/* ---------- AI 공고문 생성 (Claude API) ---------- */
// 단일 파일·무빌드 람다라 SDK 대신 Messages API를 직접 호출 (Node 20 내장 fetch)
const BRAND_CONTEXT = `당신은 비무브짐24(BE:MOVE GYM)의 채용 공고문을 작성하는 카피라이터입니다.

[브랜드 정보]
- 비무브짐24: 울산·양산·대구 10개 지점을 운영하는 24시간 피트니스 (자매 브랜드: 박터짐24 덕신점)
- 슬로건: "멈추지 마라, 움직여라" / BE:MOVE = 변화와 발전을 향해 움직이는 사람들
- 2023~2025년 매년 3개 지점씩 오픈하며 성장 중

[트레이너 보상 체계 — 트레이너 공고일 때만 활용]
- 프리랜서, 페이롤 Type-A/B 본인 선택
- Type-A: 영업지원금 200만원 + 수업료(기존 충족 시) + 성과금, 4대보험 가입 가능
- Type-B: 영업지원금 100만원 + 수업료 최대 60% + 성과금 + 매출 인센티브 최대 105만원 + 분기 최대 100만원
- 실제 팀원들이 월 500~1,000만원 수령 중 (평균 월 500 이상)

[복리후생]
빠른 진급·보상 / 우수직원 포상 / 본사 교육 지원 / 워크숍 / 경조사비 / 월차 / 지분 투자 기회

[채용 약속]
서류 검토 48시간 이내, 연락 24시간 이내

[작성 규칙]
- 한국어로 작성. 과장·허위 금지, 위 정보에 없는 급여·조건을 지어내지 말 것.
- 결과물 텍스트만 출력 (설명·머리말 없이 바로 붙여넣을 수 있게).`;

const CHANNEL_GUIDES = {
  "알바천국": "알바천국 게시용: 500자 내외로 짧고 명확하게. 급여·근무시간·근무지 등 조건을 최상단에. 이모지는 ■, ✔ 정도만 절제해서 사용. 마지막에 지원 방법 안내.",
  "사람인·잡코리아": "사람인/잡코리아 게시용: 1,000자 내외 상세 버전. [회사 소개] → [담당 업무] → [자격 요건/우대] → [급여·보상] → [복리후생] → [전형 절차] 순서로 섹션을 나눠 작성.",
  "인스타그램": "인스타그램 피드/스토리 캡션용: 첫 줄은 스크롤을 멈추게 하는 후킹 문장. 짧은 문단과 줄바꿈, 이모지를 자연스럽게 활용. 마지막에 관련 해시태그 10~15개 (#비무브짐 #BEMOVEGYM #울산트레이너 등 지역·직무 해시태그 포함).",
};

async function generateJobPost(job, channel, siteUrl) {
  const guide = CHANNEL_GUIDES[channel] || ("'" + channel + "' 채널에 어울리는 톤과 길이로 작성.");
  const userPrompt =
    "아래 채용 공고 데이터로 " + channel + "에 게시할 공고문을 작성해주세요.\n\n" +
    "[채널 가이드]\n" + guide + "\n\n" +
    "[공고 데이터]\n" +
    "- 공고명: " + (job.title || "") + "\n" +
    "- 직무: " + (job.role || "") + "\n" +
    "- 근무지: 비무브짐24 " + (job.branch || "") + "\n" +
    "- 고용형태: " + (job.type || "") + " / 모집 " + (job.headcount || 1) + "명\n" +
    "- 마감일: " + (job.deadline || "채용 시 마감") + "\n" +
    (job.desc ? "- 설명: " + job.desc + "\n" : "") +
    (job.tags && job.tags.length ? "- 태그: " + job.tags.join(", ") + "\n" : "") +
    (siteUrl ? "- 지원 링크(반드시 포함): " + siteUrl + "\n" : "");

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-opus-4-8",
      max_tokens: 1500,
      system: BRAND_CONTEXT,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error("Anthropic API " + r.status + ": " + t.slice(0, 300));
  }
  const data = await r.json();
  return (data.content || [])
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n")
    .trim();
}

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
    channels: Array.isArray(b.channels) ? b.channels.slice(0, 10).map((c) => String(c).slice(0, 20)) : [],
    note: String(b.note || "").slice(0, 500),
    active: b.active !== false,
  };
}
