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
      renderStats();
    });
  }

  function renderJobs() {
    var box = $("jobList");
    if (!jobs.length) {
      box.innerHTML = '<p class="empty-note">공고가 없습니다. "+ 새 공고"로 첫 공고를 게시하거나,<br/><br/>' +
        '<button id="seedBtn" class="btn-main">🧪 예시 데이터 불러오기 (공고 ' + (window.JOBS || []).length + '건 + 시연용 지원자 3명)</button></p>';
      var sb = document.getElementById("seedBtn");
      if (sb) sb.addEventListener("click", seedDemo);
      return;
    }
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
        '<span class="jr-meta">' + esc(j.type) + " · " + j.headcount + "명 · ~" + esc(j.deadline || "") +
        (j.channels && j.channels.length ? " · 📣 " + esc(j.channels.join("/")) : "") +
        (j.note ? " · 📝 " + esc(j.note) : "") + "</span>" +
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
    f.note.value = job ? job.note || "" : "";
    document.querySelectorAll("#channelChips input").forEach(function (c) {
      c.checked = !!(job && job.channels && job.channels.indexOf(c.value) !== -1);
    });
    f.active.checked = job ? job.active !== false : true;
    $("jobFormWrap").hidden = false;
  }

  $("jobForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var f = e.target;
    var channels = Array.prototype.slice
      .call(document.querySelectorAll("#channelChips input:checked"))
      .map(function (c) { return c.value; });
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
      channels: channels,
      note: f.note.value.trim(),
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

  var OB_DOCS = ["근로계약서 2부", "개인정보 수집·이용 동의서", "비밀유지·경업금지 서약서", "주민등록등본",
                 "신분증 사본", "통장 사본(급여계좌)", "증명사진", "자격증 사본(해당자)", "보건증(해당 직무)"];
  var OB_TASKS = ["근로계약 체결·취업규칙 안내", "급여 시스템(바디코디/급여박사) 등록", "4대보험 취득신고", "유니폼·출입·계정(노션/카톡방) 지급"];
  var OB_ALL = OB_DOCS.concat(OB_TASKS);

  function loadApps() {
    return call("GET", "/admin/applications").then(function (list) {
      apps = list;
      renderStats();
      renderKanban();
    });
  }

  /* 현황 바 — 단계별 카운트 + SLA(48h) 경고 */
  function renderStats() {
    var bar = $("statsBar");
    var now = Date.now();
    var overdue = apps.filter(function (a) {
      return (a.status || STAGES[0]) === STAGES[0] &&
        now - new Date(a.createdAt).getTime() > 48 * 3600 * 1000;
    }).length;
    var activeJobs = jobs.filter(function (j) { return j.active !== false; }).length;
    var html = '<div class="stat"><b>' + activeJobs + '</b><span>게시중 공고</span></div>';
    STAGES.forEach(function (s) {
      var n = apps.filter(function (a) { return (a.status || STAGES[0]) === s; }).length;
      html += '<div class="stat"><b>' + n + "</b><span>" + s + "</span></div>";
    });
    html += overdue > 0
      ? '<div class="stat alert"><b>' + overdue + '</b><span>⚠️ 서류검토 48h 초과</span></div>'
      : '<div class="stat ok"><b>0</b><span>✓ SLA 준수 중</span></div>';
    bar.innerHTML = html;
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
    var hours = (Date.now() - new Date(a.createdAt).getTime()) / 3600000;
    var slaWarn = si === 0 && hours > 48;
    var stars = a.score
      ? '<span class="kc-stars">' + "★".repeat(a.score) + "☆".repeat(5 - a.score) + "</span>"
      : "";
    var obDone = (a.onboarding || []).length;
    var obBadge = STAGES[si] === "합격·입사"
      ? '<p class="kc-ob' + (obDone === OB_ALL.length ? " done" : "") + '">🚀 온보딩 ' + obDone + "/" + OB_ALL.length + "</p>"
      : "";
    return '<div class="kb-card' + (slaWarn ? " sla-warn" : "") + '">' +
      '<p class="kc-name">' + esc(a.name) + stars + "</p>" +
      '<div class="kc-badges"><span>' + esc(a.role) + '</span><span class="gray">' + esc(a.branch) + "</span></div>" +
      '<p class="kc-phone"><a href="tel:' + esc(a.phone) + '">' + esc(a.phone) + "</a></p>" +
      (a.message ? '<p class="kc-msg">' + esc(a.message) + "</p>" : "") +
      (a.memo ? '<p class="kc-memo">📝 ' + esc(a.memo) + "</p>" : "") +
      obBadge +
      '<p class="kc-date">' + d + (slaWarn ? ' · <b class="warn-txt">48h 초과</b>' : "") + "</p>" +
      '<div class="kc-actions">' +
      (si > 0 ? '<button data-move="-1" data-id="' + a.id + '">◀</button>' : "") +
      (si < STAGES.length - 2 ? '<button data-move="1" data-id="' + a.id + '">다음 ▶</button>' : "") +
      '<button data-score="' + a.id + '">★점수</button>' +
      '<button data-memo="' + a.id + '">메모</button>' +
      (STAGES[si] === "합격·입사" ? '<button data-ob="' + a.id + '">온보딩</button>' : "") +
      (si !== STAGES.length - 1 ? '<button data-fail="' + a.id + '">불합격</button>' : "") +
      "</div></div>";
  }

  $("kanban").addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    var id = b.dataset.id || b.dataset.fail || b.dataset.memo || b.dataset.score || b.dataset.ob;
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
    } else if (b.dataset.score) {
      var sc = prompt("평가 점수 (1~5)", app.score || "");
      if (sc !== null) {
        var n = Math.max(0, Math.min(5, Number(sc) || 0));
        call("PUT", "/admin/applications/" + id, { score: n }).then(loadApps);
      }
    } else if (b.dataset.ob) {
      openOnboarding(app);
    }
  });

  /* ---------- 온보딩 체크리스트 ---------- */
  var obAppId = null;

  function openOnboarding(app) {
    obAppId = app.id;
    $("obName").textContent = app.name;
    var checked = app.onboarding || [];
    function renderList(boxId, items) {
      $(boxId).innerHTML = items.map(function (it) {
        return '<label class="ob-item"><input type="checkbox" value="' + esc(it) + '"' +
          (checked.indexOf(it) !== -1 ? " checked" : "") + " /> " + esc(it) + "</label>";
      }).join("");
    }
    renderList("obDocs", OB_DOCS);
    renderList("obTasks", OB_TASKS);
    $("obWrap").hidden = false;
  }

  $("obWrap").addEventListener("change", function () {
    if (!obAppId) return;
    var checked = Array.prototype.slice
      .call(document.querySelectorAll("#obWrap input:checked"))
      .map(function (c) { return c.value; });
    call("PUT", "/admin/applications/" + obAppId, { onboarding: checked });
    var app = apps.find(function (a) { return a.id === obAppId; });
    if (app) app.onboarding = checked;
  });

  $("obClose").addEventListener("click", function () {
    $("obWrap").hidden = true;
    obAppId = null;
    renderKanban();
  });

  /* ---------- 시연용 예시 데이터 ---------- */
  function seedDemo() {
    if (!confirm("사이트의 예시 공고와 시연용 지원자를 불러올까요?\n공고는 저장 즉시 사이트에 게시됩니다.")) return;
    var jobPosts = (window.JOBS || []).map(function (j) {
      return call("POST", "/admin/jobs", {
        title: j.title, role: j.role, branch: j.branch, type: j.type,
        headcount: j.headcount, posted: j.posted, deadline: j.deadline,
        desc: j.desc, tags: j.tags || [], active: true,
      });
    });
    var demoApps = [
      { name: "김성장 (예시)", phone: "010-1111-2222", role: "트레이너 (PT)", branch: "상인점",
        message: "3년차 트레이너입니다. OT→PT 전환율에 자신 있습니다. 생활스포츠지도사 2급 보유.", to: "전화 스크리닝" },
      { name: "박열정 (예시)", phone: "010-3333-4444", role: "FC / 프론트·상담", branch: "야음점",
        message: "콜센터 상담 2년 경력. 등록 전환 상담에 강합니다. 주말 근무 가능합니다.", to: "면접·실기" },
      { name: "이지원 (예시)", phone: "010-5555-6666", role: "GX 강사", branch: "구영리점",
        message: "요가·필라테스 자격 보유, 주 3회 저녁 수업 희망합니다.", to: null },
    ];
    Promise.all(jobPosts)
      .then(function () {
        return demoApps.reduce(function (p, a) {
          return p.then(function () {
            return fetch(API + "/applications", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ name: a.name, phone: a.phone, role: a.role, branch: a.branch, message: a.message }),
            }).then(function (r) { return r.json(); }).then(function (res) {
              var updates = [];
              if (a.to) updates.push(call("PUT", "/admin/applications/" + res.id, { status: a.to }));
              updates.push(call("PUT", "/admin/applications/" + res.id, { memo: "시연용 예시 데이터입니다" }));
              return Promise.all(updates);
            });
          });
        }, Promise.resolve());
      })
      .then(function () {
        alert("예시 데이터를 불러왔습니다! 공고는 사이트에 게시되었고, 지원자 파이프라인 탭에서 예시 지원자를 확인하세요.");
        loadAll();
      })
      .catch(function (e) { alert("불러오기 중 오류: " + e.message); loadAll(); });
  }

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
