# BE:MOVE GYM 24 채용 사이트

비무브짐24(BE:MOVE GYM)의 구인구직(채용) 정적 웹사이트입니다.
[비무브짐24 채용 시스템 노션 페이지](https://selective-tangelo-29b.notion.site/39511492e62280e5a51dcbbd7cf9ed52)의
채용 원칙·프로세스·직무별 JD와 [bemovegym.com](https://bemovegym.com/) 브랜드를 기반으로 제작했습니다.

> 🚀 **실서비스(AWS) 운영**: 어드민에서 공고를 게시하고 지원자를 파이프라인으로 관리하려면
> [DEPLOY.md](DEPLOY.md) 가이드를 따라 백엔드를 배포하세요. `js/config.js`의 `apiUrl`이
> 비어 있으면 아래 정적 모드(data.js + 이메일 지원)로 동작합니다.

## 구성

| 파일 | 설명 |
|---|---|
| `index.html` | 단일 페이지 사이트 (히어로 / 브랜드 / 인재상 / 채용공고 / 직무안내 / 보상제도 / 복리후생 / 채용절차 / 지점 / FAQ / 지원 폼) |
| `admin/` | 채용 어드민 (공고 게시·수정, 지원자 파이프라인 칸반) — API 배포 후 사용 |
| `backend/` + `infra/` | AWS Lambda API와 배포 스크립트 ([DEPLOY.md](DEPLOY.md)) |
| `banners/` | 메타 광고 배너 시안 3종 (1080×1080 PNG + HTML 원본) |
| `js/config.js` | API 주소 설정 (비우면 정적 모드) |
| `css/style.css` | 브랜드 스타일 (오렌지 `#EE6325` × 차콜 `#33393F`, 로고 SVG 배지 포함) |
| `js/data.js` | **채용 공고·지점 데이터** — 공고 추가/수정은 이 파일만 고치면 됩니다 |
| `js/main.js` | 공고 필터링, D-day 계산, 지점 렌더링, 지원 폼(mailto) 처리 |
| `assets/logo-badge.png` | BMG 헥사곤 배지 (헤더·푸터·파비콘) |
| `assets/logo-full.png` | 배지 + 워드마크 조합 (히어로) |
| `assets/logo-wordmark.png` | BE:MOVE GYM 워드마크 (예비) |
| `assets/favicon.svg` | SVG 재현본 파비콘 (예비) |

## 공고 관리 방법

`js/data.js`의 `JOBS` 배열에 항목을 추가하면 사이트에 자동 반영됩니다.

```js
{
  title: "트레이너 정규직 채용 — 상인점",  // 공고명
  role: "트레이너",                        // 트레이너 | FC/상담 | GX 강사 | 청소/시설
  branch: "상인점",                        // BRANCHES에 있는 지점명
  type: "정규직",                          // 정규직 | 파트타임 | 프리랜서 | 계약직
  headcount: 2,                            // 모집 인원
  posted: "2026-06-20",                    // 게시일
  deadline: "2026-07-31",                  // 마감일 — 지나면 자동으로 숨겨짐
  desc: "공고 설명…",
  tags: ["5분 PT 시연", "인센티브"],
}
```

- **마감일이 지난 공고는 자동으로 목록에서 사라집니다** (D-day 자동 계산).
- 마감 7일 이내 공고는 D-day가 붉게 강조됩니다.
- 지점 추가는 `BRANCHES` 배열에, 지원 접수 이메일 변경은 `js/main.js`의 `APPLY_EMAIL`에서 합니다.

## 카카오톡 채널 버튼

우측 하단 플로팅 버튼과 지원 폼 아래 버튼이 카카오톡 채널로 연결됩니다.
현재 `http://pf.kakao.com/_bemovegym` 은 **자리표시자 주소**입니다 —
실제 채널 개설 후 `index.html`에서 `pf.kakao.com` 링크 2곳을 실제 채널 URL로 바꿔주세요.

## 실행

정적 사이트라 별도 빌드가 없습니다.

```bash
# 로컬 미리보기
python3 -m http.server 8000
# → http://localhost:8000
```

GitHub Pages, Netlify, Vercel 등에 그대로 배포할 수 있습니다.
