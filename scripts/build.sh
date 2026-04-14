#!/bin/bash

# 빠른 빌드 스크립트
# 사용: ./scripts/build.sh 또는 npm run build

# 에러 발생 시 중단
set -e

echo "🔨 esbuild로 번들링 중..."

# node_modules 확인
if [ ! -d "node_modules" ]; then
  echo "📦 npm 패키지 설치 중..."
  npm install --legacy-peer-deps
fi

# esbuild 번들링 (socket.io-client 포함)
node scripts/bundle.js

echo "✅ 빌드 완료!"
echo "📂 Output directory: ./dist"
echo ""
echo "다음 단계:"
echo "1. Chrome에서 chrome://extensions 열기"
echo "2. '개발자 모드' 활성화"
echo "3. '압축해제된 확장 프로그램 로드' 클릭"
echo "4. 이 폴더 선택"
