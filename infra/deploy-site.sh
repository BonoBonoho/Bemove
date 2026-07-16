#!/usr/bin/env bash
# ================================================================
# 정적 사이트 S3 + CloudFront 배포 스크립트
# 사용법: ./infra/deploy-site.sh [리전] [버킷이름(선택)]
# 처음 실행 시 버킷·CloudFront 배포를 만들고, 이후엔 파일만 동기화합니다.
# ================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

REGION="${1:-ap-northeast-2}"
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
BUCKET="${2:-bemove-recruit-site-${ACCOUNT}}"

echo "▶ 사이트 버킷 준비: $BUCKET"
aws s3 mb "s3://$BUCKET" --region "$REGION" 2>/dev/null || true
aws s3 website "s3://$BUCKET" --index-document index.html

# 퍼블릭 읽기 정책
aws s3api put-public-access-block --bucket "$BUCKET" \
  --public-access-block-configuration BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false
aws s3api put-bucket-policy --bucket "$BUCKET" --policy "{
  \"Version\": \"2012-10-17\",
  \"Statement\": [{
    \"Sid\": \"PublicRead\", \"Effect\": \"Allow\", \"Principal\": \"*\",
    \"Action\": \"s3:GetObject\", \"Resource\": \"arn:aws:s3:::$BUCKET/*\"
  }]
}"

echo "▶ 사이트 파일 업로드"
aws s3 sync . "s3://$BUCKET" --region "$REGION" \
  --exclude ".git/*" --exclude "backend/*" --exclude "infra/*" \
  --exclude "banners/*.html" --exclude "*.md" --delete

SITE_URL="http://$BUCKET.s3-website.$REGION.amazonaws.com"
echo ""
echo "✅ 업로드 완료: $SITE_URL"
echo ""
echo "HTTPS·도메인 연결이 필요하면 CloudFront 배포를 만들거나"
echo "AWS Amplify Hosting(깃허브 연동 자동배포)을 권장합니다. DEPLOY.md 참고."
