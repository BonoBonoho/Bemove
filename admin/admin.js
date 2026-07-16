/* ================================================================
   비무브짐 채용 어드민 — 공고 CRUD + 지원자 파이프라인
   백엔드: backend/index.mjs (AWS Lambda)
   ================================================================ */
(function () {
  "use strict";

  var API = (window.BEMOVE_CONFIG || {}).apiUrl || "";
  var STAGES = ["신규 접수", "전화 스크리닝", "면접·실기", "최종·처우협의", "합격·입사", "불합격"];
  var token = sessionStorage.getItem("bemoveAdminToken") || "";

  var $ = function (id) { return document.getElementById(id); };

  /* ---------- API 헬퍼 ---------- */
  function call(method, path, body) {
    return fetch(API + path, {
      method: method,
      headers: {
        "content-type": "application/json",
        "x-admin-token": token,
      },
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (r) {
      if (r.status === 401) throw new Error("AUTH");
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }

  /* ---------- 로그인 ---------- */
  var apiStatus = $("apiStatus");
  if (API) { apiStatus.textContent = "API 연결됨"; apiStatus.classList.add("ok"); }

  function showMain() {
    $("loginView").hidden = true;
    $("mainView").hidden = false;
    $("logoutBtn").hidden = false;
    loadAll();
  }

  $("loginBtn").addEventListener("click", tryLogin);
  $("tokenInput").addEventListener("keydown", function (e) { if (e.key === "Enter") tryLogin(); });

  function tryLogin() {
    if (!API) { alert("js/config.js의 apiUrl이 비어 있습니다. 백엔드 배포 후 API 주소를 넣어주세요."); return; }
    token = $("tokenInput").value.trim();
    if (!token) return;
    call("GET", "/admin/jobs")
      .then(function () {
        sessionStorage.setItem("bemoveAdminToken", token);
        $("loginErr").hidden = true;
        showMain();
      })
      .catch(function () { $("loginErr").hidden = false; });
  }

  $("logoutBtn").addEventListener("click", function () {
    sessionStorage.removeItem("bemoveAdminToken");
    location.reload();
  });

  if (token && API) {
    call("GET", "/admin/jobs").then(showMain).catch(function () {
      sessionStorage.removeItem("bemoveAdminToken");
    });
  }

  /* ---------- 탭 ---------- */
  document.querySelectorAll(".tab").forEach(function (t) {
    t.addEventListener("click", function () {
      document.querySelectorAll(".tab").forEach(function (x) { x.classList.remove("active"); });
      t.classList.add("active");
      $("jobsTab").hidden = t.dataset.tab !== "jobs";
      $("appsTab").hidden = t.dataset.tab !== "apps";
    });
  });
  $("refreshBtn").addEventListener("click", loadAll);

  /* ---------- 공고 관리 ---------- */
  var jobs = [];
  var editingId = null;

  // 지점 옵션 (data.js의 BRANCHES 재사용)
  var branchSel = $("jobBranchSel");
  (window.BRANCHES || []).forEach(function (b) {
    var o = document.createElement("option");
    o.value = b.name; o.textContent = b.name + " (" + b.region + ")";
    branchSel.appendChild(o);
  });

  function loadJobs() {
    return call("GET", "/admin/jobs").then(function (list) {
      jobs = list;
      renderJobs();
    });
  }

  function renderJobs() {
    var box = $("jobList");
    if (!jobs.length) { box.innerHTML = '<p class="empty-note">공고가 없습니다. "+ 새 공고"로 첫 공고를 게시하세요.</p>'; return; }
    box.innerHTML = jobs.map(function (j) {
      var dday = Math.round((new Date(j.deadline + "T00:00:00") - new Date().setHours(0,0,0,0)) / 86400000);
      var state = j.active === false ? '<span class="jr-badge off">숨김</span>'
        : dday < 0 ? '<span class="jr-badge off">마감</span>'
        : '<span class="jr-badge">게시중 D-' + dday + "</span>";
      return '<div class="job-row' + (j.active === false ? " inactive" : "") + '">' +
        '<span class="jr-title">' + esc(j.title) + "</span>" +
        state +
        '<span class="jr-badge gray">' + esc(j.role) + "</span>" +
        '<span class="jr-badge gray">' + esc(j.branch) + "</span>" +
        '<span class="jr-meta">' + esc(j.type) + " · " + j.headcount + "명 · ~" + esc(j.deadline || "") + "</span>" +
        '<span class="jr-actions">' +
        '<button class="btn-sm" data-edit="' + j.id + '">수정</button>' +
        '<button class="btn-sm ghost" data-del="' + j.id + '">삭제</button>' +
        "</span></div>";
    }).join("");
  }

  $("jobList").addEventListener("click", function (e) {
    var ed = e.target.closest("[data-edit]");
    var del = e.target.closest("[data-del]");
    if (ed) openJobForm(jobs.find(function (j) { return j.id === ed.dataset.edit; }));
    if (del && confirm("이 공고를 삭제할까요? 사이트에서 즉시 내려갑니다.")) {
      call("DELETE", "/admin/jobs/" + del.dataset.del).then(loadJobs);
    }
  });

  $("newJobBtn").addEventListener("click", function () { openJobForm(null); });
  $("jobCancelBtn").addEventListener("click", function () { $("jobFormWrap").hidden = true; });

  function openJobForm(job) {
    editingId = job ? job.id : null;
    var f = $("jobForm");
    $("jobFormTitle").textContent = job ? "공고 수정" : "새 공고";
    f.title.value = job ? job.title : "";
    f.role.value = job ? job.role : "트레이너";
    f.branch.value = job ? job.branch : branchSel.options[0].value;
    f.type.value = job ? job.type : "프리랜서";
    f.headcount.value = job ? job.headcount : 1;
    f.posted.value = job ? job.posted : new Date().toISOString().slice(0, 10);
    f.deadline.value = job ? job.deadline : "";
    f.desc.value = job ? job.desc : "";
    f.tags.value = job && job.tags ? job.tags.join(", ") : "";
    f.active.checked = job ? job.active !== false : true;
    $("jobFormWrap").hidden = false;
  }

  $("jobForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var f = e.target;
    var payload = {
      title: f.title.value.trim(),
      role: f.role.value,
      branch: f.branch.value,
      type: f.type.value,
      headcount: Number(f.headcount.value) || 1,
      posted: f.posted.value,
      deadline: f.deadline.value,
      desc: f.desc.value.trim(),
      tags: f.tags.value.split(",").map(function (t) { return t.trim(); }).filter(Boolean),
      active: f.active.checked,
    };
    var p = editingId
      ? call("PUT", "/admin/jobs/" + editingId, payload)
      : call("POST", "/admin/jobs", payload);
    p.then(function () {
      $("jobFormWrap").hidden = true;
      loadJobs();
    }).catch(function (err) { alert("저장 실패: " + err.message); });
  });

  /* ---------- 지원자 파이프라인 ---------- */
  var apps = [];

  function loadApps() {
    return call("GET", "/admin/applications").then(function (list) {
      apps = list;
      renderKanban();
    });
  }

  function renderKanban() {
    var kb = $("kanban");
    kb.innerHTML = STAGES.map(function (stage, si) {
      var cards = apps.filter(function (a) { return (a.status || STAGES[0]) === stage; });
      var cls = stage === "합격·입사" ? " col-done" : stage === "불합격" ? " col-fail" : "";
      return '<div class="kb-col' + cls + '"><h3>' + stage +
        ' <span class="cnt">' + cards.length + "</span></h3>" +
        cards.map(function (a) { return cardHtml(a, si); }).join("") +
        "</div>";
    }).join("");
  }

  function cardHtml(a, si) {
    var d = (a.createdAt || "").slice(0, 16).replace("T", " ");
    return '<div class="kb-card">' +
      '<p class="kc-name">' + esc(a.name) + "</p>" +
      '<div class="kc-badges"><span>' + esc(a.role) + '</span><span class="gray">' + esc(a.branch) + "</span></div>" +
      '<p class="kc-phone"><a href="tel:' + esc(a.phone) + '">' + esc(a.phone) + "</a></p>" +
      (a.message ? '<p class="kc-msg">' + esc(a.message) + "</p>" : "") +
      (a.memo ? '<p class="kc-memo">📝 ' + esc(a.memo) + "</p>" : "") +
      '<p class="kc-date">' + d + "</p>" +
      '<div class="kc-actions">' +
      (si > 0 ? '<button data-move="-1" data-id="' + a.id + '">◀ 이전</button>' : "") +
      (si < STAGES.length - 2 ? '<button data-move="1" data-id="' + a.id + '">다음 ▶</button>' : "") +
      (si !== STAGES.length - 1 ? '<button data-fail="' + a.id + '">불합격</button>' : "") +
      '<button data-memo="' + a.id + '">메모</button>' +
      "</div></div>";
  }

  $("kanban").addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    var id = b.dataset.id || b.dataset.fail || b.dataset.memo;
    var app = apps.find(function (a) { return a.id === id; });
    if (!app) return;

    if (b.dataset.move) {
      var si = STAGES.indexOf(app.status || STAGES[0]);
      var next = STAGES[Math.max(0, Math.min(STAGES.length - 2, si + Number(b.dataset.move)))];
      call("PUT", "/admin/applications/" + id, { status: next }).then(loadApps);
    } else if (b.dataset.fail) {
      if (confirm(app.name + " 님을 불합격 처리할까요?")) {
        call("PUT", "/admin/applications/" + id, { status: "불합격" }).then(loadApps);
      }
    } else if (b.dataset.memo) {
      var memo = prompt("평가 메모 (면접 당일 바로 기록하세요)", app.memo || "");
      if (memo !== null) call("PUT", "/admin/applications/" + id, { memo: memo }).then(loadApps);
    }
  });

  function loadAll() {
    Promise.all([loadJobs(), loadApps()]).catch(function (err) {
      if (err.message === "AUTH") { sessionStorage.removeItem("bemoveAdminToken"); location.reload(); }
    });
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
})();
