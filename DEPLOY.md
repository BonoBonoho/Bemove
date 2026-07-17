# 비무브짐 채용 사이트 — AWS 실서비스 배포 가이드

이 저장소에는 실제 운영에 필요한 모든 것이 들어 있습니다.

```
┌─ 공개 사이트 (index.html) ── 방문자: 공고 열람 + 지원서 제출
├─ 어드민 (admin/)          ── 관리자: 공고 게시·수정, 지원자 파이프라인 관리
├─ 백엔드 (backend/)        ── AWS Lambda API (공고·지원자 저장소)
└─ 인프라 (infra/)          ── 배포 스크립트 + CloudFormation 템플릿
```

**아키텍처** — 전부 서버리스라 트래픽이 적을 땐 비용이 사실상 0원입니다.

| 구성 | AWS 서비스 | 월 예상 비용 |
|---|---|---|
| 정적 사이트 호스팅 | Amplify Hosting (또는 S3) | 무료 티어 내 |
| API | API Gateway (HTTP API) + Lambda | 무료 티어 내 |
| 데이터 (공고·지원자) | DynamoDB (온디맨드) | 무료 티어 내 |

---

## 1단계 — AWS 준비 (최초 1회)

1. [aws.amazon.com](https://aws.amazon.com)에서 계정 생성
2. IAM 콘솔 → 사용자 생성 → **액세스 키** 발급
   (간단히 하려면 `AdministratorAccess` 권한, 운영 안정화 후 최소권한으로 축소 권장)
3. 로컬 터미널에서:
   ```bash
   pip install awscli        # 또는 공식 설치 프로그램
   aws configure             # 액세스 키 / 시크릿 키 / 리전(ap-northeast-2) 입력
   ```
   > 💡 **Claude 세션에서 자동 배포를 원하면**: Claude Code 환경 설정의 환경변수에
   > `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION=ap-northeast-2`를
   > 실제 값으로 등록해주세요. 그러면 제가 이 저장소에서 바로 배포할 수 있습니다.

## 2단계 — 백엔드 배포 (공고 API + 지원자 DB)

```bash
./infra/deploy.sh ap-northeast-2 "나만의-어드민-토큰"
```

- 완료되면 `API URL`이 출력됩니다 (예: `https://xxxx.execute-api.ap-northeast-2.amazonaws.com`)
- **어드민 토큰은 관리자 로그인 비밀번호입니다.** 길고 무작위로 만들고 공유하지 마세요.

## 3단계 — 사이트에 API 연결

`js/config.js` 한 줄만 수정합니다:

```js
window.BEMOVE_CONFIG = {
  apiUrl: "https://xxxx.execute-api.ap-northeast-2.amazonaws.com",
};
```

커밋하면:
- 공개 사이트 공고 목록이 **어드민에서 게시한 공고**로 자동 교체됩니다
- 지원 폼이 이메일 대신 **API로 접수**되어 어드민 파이프라인에 쌓입니다
- `apiUrl`이 비어 있으면 기존처럼 정적 공고 + 이메일 지원으로 동작합니다 (안전한 폴백)

## 4단계 — 사이트 호스팅

**방법 A — AWS Amplify Hosting (권장: 푸시하면 자동 배포)**
1. AWS 콘솔 → Amplify → "새 앱 호스팅" → GitHub 연결
2. `BonoBonoho/Bemove` 저장소, `main` 브랜치 선택 (PR #1 머지 후)
3. 빌드 설정 없음(정적 사이트) → 배포
4. 기본 도메인(`https://main.xxxx.amplifyapp.com`) 즉시 발급,
   "도메인 관리"에서 보유 도메인(예: recruit.bemovegym.com) 연결 가능

**방법 B — S3 정적 호스팅 (스크립트 제공)**
```bash
./infra/deploy-site.sh ap-northeast-2
```
HTTP 주소가 나옵니다. HTTPS·커스텀 도메인이 필요하면 CloudFront를 앞에 두거나 방법 A를 사용하세요.

## 5단계 — 어드민 사용법

- 주소: `https://<사이트주소>/admin/`
- 로그인: 2단계에서 정한 어드민 토큰 입력
- **공고 관리**: 새 공고 작성 → 저장 즉시 공개 사이트에 게시. 마감일이 지나면 자동으로 내려갑니다.
- **지원자 파이프라인**: 신규 접수 → 전화 스크리닝 → 면접·실기 → 최종·처우협의 → 합격·입사 (+불합격)
  - 카드의 ◀ ▶ 버튼으로 단계 이동, 메모 버튼으로 평가 기록 (노션 채용 시스템의 SLA 원칙 그대로)

## 6단계 (선택) — ✨ AI 공고문 생성 켜기

어드민의 공고 목록에서 **"✨ AI 공고문"** 버튼을 누르면 Claude AI가
**알바천국용(짧은 조건 중심) / 사람인·잡코리아용(상세) / 인스타그램용(캡션+해시태그)**
세 가지 버전을 한 번에 작성해줍니다. 복사해서 각 사이트에 붙여넣기만 하면 됩니다.

활성화 방법:

1. [console.anthropic.com](https://console.anthropic.com) 가입 → **API Keys**에서 키 발급 (`sk-ant-...`)
2. 터미널에서 배포 스크립트를 키와 함께 한 번 실행:
   ```bash
   ./infra/deploy.sh ap-northeast-2 '어드민토큰' 'sk-ant-발급받은키'
   ```
   (이후 배포에서는 키를 생략해도 유지됩니다)

- 비용: 공고문 1회 생성(3버전)에 수십 원 수준 — 사용한 만큼만 과금됩니다.
- **API 키는 비밀번호처럼 다루세요.** 채팅·커밋에 붙여넣지 말고 위 명령으로만 등록하세요.
- 키를 등록하지 않아도 나머지 기능은 전부 정상 동작합니다 (버튼만 안내 문구 표시).

## 보안 참고

- 어드민은 토큰 1개로 보호되는 단순 구조입니다. 실운영에서 계정별 관리가 필요해지면
  Amazon Cognito 로그인으로 업그레이드할 수 있습니다.
- 지원자 개인정보(이름·연락처)가 DynamoDB에 저장되므로, 채용 종료 후 파기 정책을 정해두세요.
