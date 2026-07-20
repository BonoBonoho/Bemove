#!/usr/bin/env bash
# ================================================================
# BE:MOVE GYM 채용 백엔드 배포 스크립트
# 사용법: ./infra/deploy.sh [리전] [어드민토큰] [Anthropic API 키(선택)]
#   예:   ./infra/deploy.sh ap-northeast-2 my-secret-token-123
#   예:   ./infra/deploy.sh ap-northeast-2 my-secret-token-123 sk-ant-xxxx
# Anthropic 키를 생략하면 이전에 설정한 값이 유지됩니다 (처음이면 AI 기능만 꺼짐).
# 사전조건: aws cli 설치 + `aws configure`로 자격 증명 등록
# ================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

REGION="${1:-ap-northeast-2}"
ADMIN_TOKEN="${2:-}"
ANTHROPIC_KEY="${3:-}"
if [ -z "$ADMIN_TOKEN" ]; then
  echo "어드민 토큰을 입력하세요: ./infra/deploy.sh $REGION <토큰> [Anthropic키]"; exit 1
fi

ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
BUCKET="bemove-recruit-code-${ACCOUNT}-${REGION}"

echo "▶ 람다 코드 압축"
rm -f /tmp/backend.zip
(cd backend && zip -q -r /tmp/backend.zip index.mjs)

echo "▶ 코드 버킷 준비: $BUCKET"
aws s3 mb "s3://$BUCKET" --region "$REGION" 2>/dev/null || true
aws s3 cp /tmp/backend.zip "s3://$BUCKET/backend.zip" --region "$REGION"

echo "▶ CloudFormation 배포"
# Anthropic 키는 인자로 준 경우에만 갱신 — 생략 시 스택의 기존 값 유지
PARAMS=(CodeBucket="$BUCKET" CodeKey=backend.zip AdminToken="$ADMIN_TOKEN")
if [ -n "$ANTHROPIC_KEY" ]; then
  PARAMS+=(AnthropicApiKey="$ANTHROPIC_KEY")
fi
aws cloudformation deploy \
  --region "$REGION" \
  --stack-name bemove-recruit \
  --template-file infra/template.yaml \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides "${PARAMS[@]}"

echo "▶ 람다 코드 최신화"
aws lambda update-function-code --region "$REGION" \
  --function-name bemove-recruit-api \
  --s3-bucket "$BUCKET" --s3-key backend.zip >/dev/null

API_URL=$(aws cloudformation describe-stacks --region "$REGION" \
  --stack-name bemove-recruit \
  --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" --output text)

echo ""
echo "✅ 배포 완료!"
echo "   API URL: $API_URL"
echo ""
echo "다음 단계:"
echo "  1) js/config.js 의 apiUrl 에 위 URL을 넣고 커밋하세요."
echo "  2) admin/ 페이지에서 어드민 토큰으로 로그인하세요."
