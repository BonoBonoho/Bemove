/* ================================================================
   BE:MOVE GYM 24 — 채용 사이트 스크립트
   ================================================================ */
(function () {
  "use strict";

  var APPLY_EMAIL = "bonoxbonho@gmail.com";
  var API = (window.BEMOVE_CONFIG || {}).apiUrl || "";

  /* ---------- 모바일 내비게이션 ---------- */
  var navToggle = document.getElementById("navToggle");
  var gnb = document.getElementById("gnb");
  navToggle.addEventListener("click", function () {
    var open = gnb.classList.toggle("open");
    navToggle.setAttribute("aria-expanded", open ? "true" : "false");
  });
  gnb.addEventListener("click", function (e) {
    if (e.target.tagName === "A") {
      gnb.classList.remove("open");
      navToggle.setAttribute("aria-expanded", "false");
    }
  });

  /* ---------- 채용 공고 필터 + 렌더링 ---------- */
  var state = { role: "전체", branch: "전체" };

  function dday(deadline) {
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var end = new Date(deadline + "T00:00:00");
    return Math.round((end - today) / 86400000);
  }

  function renderChips(containerId, values, key) {
    var box = document.getElementById(containerId);
    var all = ["전체"].concat(values);
    box.innerHTML = all
      .map(function (v) {
        return (
          '<button type="button" class="chip' +
          (state[key] === v ? " active" : "") +
          '" data-key="' + key + '" data-value="' + v + '">' + v + "</button>"
        );
      })
      .join("");
  }

  function renderJobs() {
    var list = document.getElementById("jobList");
    var empty = document.getElementById("jobEmpty");
    var visible = JOBS.filter(function (job) {
      var d = dday(job.deadline);
      if (d < 0) return false; // 마감 지난 공고 숨김
      if (state.role !== "전체" && job.role !== state.role) return false;
      if (state.branch !== "전체" && job.branch !== state.branch) return false;
      return true;
    });

    empty.hidden = visible.length > 0;
    list.innerHTML = visible
      .map(function (job) {
        var d = dday(job.deadline);
        var ddayLabel = d === 0 ? "오늘 마감" : "D-" + d;
        var closing = d <= 7 ? " closing" : "";
        var tags = (job.tags || [])
          .map(function (t) { return "#" + t; })
          .join("  ");
        return (
          '<article class="job-card">' +
          '<div class="job-card-top">' +
          '<span class="job-badge role">' + job.role + "</span>" +
          '<span class="job-badge branch">' + job.branch + "</span>" +
          '<span class="job-badge type">' + job.type + "</span>" +
          '<span class="job-dday' + closing + '">' + ddayLabel + "</span>" +
          "</div>" +
          '<h3 class="job-title">' + job.title + "</h3>" +
          '<p class="job-desc">' + job.desc + "</p>" +
          '<div class="job-meta">' +
          "<span>모집 " + job.headcount + "명</span>" +
          "<span>~" + job.deadline.replace(/-/g, ".") + "</span>" +
          (tags ? "<span>" + tags + "</span>" : "") +
          "</div>" +
          '<a class="job-apply" href="#apply" data-role="' + job.role + '" data-branch="' + job.branch + '">이 공고에 지원하기</a>' +
          "</article>"
        );
      })
      .join("");
  }

  document.getElementById("jobs").addEventListener("click", function (e) {
    var chip = e.target.closest(".chip");
    if (chip) {
      state[chip.dataset.key] = chip.dataset.value;
      renderChips("roleChips", ROLES, "role");
      renderChips("branchChips", BRANCHES.map(function (b) { return b.name; }), "branch");
      renderJobs();
      return;
    }
    var apply = e.target.closest(".job-apply");
    if (apply) {
      // 공고 카드에서 지원하기 → 폼에 직무/지점 미리 선택
      preselectForm(apply.dataset.role, apply.dataset.branch);
    }
  });

  function preselectForm(role, branch) {
    var roleSelect = document.getElementById("fRole");
    var branchSelect = document.getElementById("fBranch");
    var roleMap = {
      "트레이너": "트레이너 (PT)",
      "FC/상담": "FC / 프론트·상담",
      "GX 강사": "GX 강사",
      "청소/시설": "청소 / 시설 관리",
    };
    var mapped = roleMap[role];
    if (mapped) roleSelect.value = mapped;
    for (var i = 0; i < branchSelect.options.length; i++) {
      if (branchSelect.options[i].value === branch) {
        branchSelect.value = branch;
        break;
      }
    }
  }

  /* ---------- 지점 카드 렌더링 + 폼 지점 옵션 ---------- */
  function renderLocations() {
    var grid = document.getElementById("locationGrid");
    grid.innerHTML = BRANCHES.map(function (b) {
      var hiring = JOBS.some(function (j) {
        return j.branch === b.name && dday(j.deadline) >= 0;
      });
      return (
        '<article class="location-card">' +
        '<span class="location-region">' + b.region + "</span>" +
        "<h3>" + (b.brand || "비무브짐24") + " " + b.name + "</h3>" +
        "<p>" + b.desc + "</p>" +
        (hiring ? '<span class="loc-badge">지금 채용 중</span>' : "") +
        "</article>"
      );
    }).join("");

    var branchSelect = document.getElementById("fBranch");
    BRANCHES.forEach(function (b) {
      var opt = document.createElement("option");
      opt.value = b.name;
      opt.textContent = b.name + " (" + b.region + ")";
      branchSelect.appendChild(opt);
    });
    var anyOpt = document.createElement("option");
    anyOpt.value = "지점 무관";
    anyOpt.textContent = "지점 무관 (어디든 가능)";
    branchSelect.appendChild(anyOpt);
  }

  /* ---------- 지원 폼 → API 접수 (미설정 시 mailto) ---------- */
  document.getElementById("applyForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var form = e.target;
    var name = document.getElementById("fName").value.trim();
    var phone = document.getElementById("fPhone").value.trim();
    var role = document.getElementById("fRole").value;
    var branch = document.getElementById("fBranch").value;
    var msg = document.getElementById("fMsg").value.trim();

    if (API) {
      var btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.textContent = "접수 중...";
      fetch(API + "/applications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name, phone: phone, role: role, branch: branch, message: msg }),
      })
        .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
        .then(function () {
          form.reset();
          alert("지원서가 접수되었습니다!\n서류 검토 후 48시간 이내에 연락드리겠습니다.");
        })
        .catch(function () {
          alert("접수 중 문제가 발생했습니다. 잠시 후 다시 시도하거나 이메일로 지원해주세요.");
        })
        .finally(function () {
          btn.disabled = false;
          btn.textContent = "지원서 보내기";
        });
      return;
    }

    var subject = "[비무브짐 지원] " + role + " / " + branch + " — " + name;
    var body =
      "■ 이름: " + name + "\n" +
      "■ 연락처: " + phone + "\n" +
      "■ 지원 직무: " + role + "\n" +
      "■ 희망 지점: " + branch + "\n\n" +
      "■ 자기소개\n" + (msg || "(작성 안 함)") + "\n\n" +
      "※ 이력서(PDF)를 첨부해서 보내주세요.";

    window.location.href =
      "mailto:" + APPLY_EMAIL +
      "?subject=" + encodeURIComponent(subject) +
      "&body=" + encodeURIComponent(body);
  });

  /* ---------- 초기 렌더링 ---------- */
  renderChips("roleChips", ROLES, "role");
  renderChips("branchChips", BRANCHES.map(function (b) { return b.name; }), "branch");
  renderJobs();
  renderLocations();

  /* ---------- API 공고 로드 (어드민에서 게시한 공고 자동 반영) ---------- */
  if (API) {
    fetch(API + "/jobs")
      .then(function (r) { return r.json(); })
      .then(function (list) {
        if (!Array.isArray(list)) return;
        JOBS.length = 0;
        list.forEach(function (j) { JOBS.push(j); });
        renderJobs();
        renderLocations();
      })
      .catch(function () { /* API 실패 시 data.js 정적 공고 유지 */ });
  }
})();
