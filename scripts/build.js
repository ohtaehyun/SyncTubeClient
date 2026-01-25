/**
 * TypeScript to JavaScript Build Script
 * 
 * 번들러 없이 TypeScript를 JavaScript로 변환합니다.
 * 사용: node scripts/build.js
 * Watch 모드: node scripts/build.js --watch
 */

const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const args = process.argv.slice(2);
const isWatch = args.includes("--watch");

const buildDir = path.join(__dirname, "..", "dist");
const srcDir = path.join(__dirname, "..", "src");

// 빌드 디렉토리 생성
if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true });
}

// TypeScript 컴파일
function compile() {
  console.log("🔨 TypeScript 컴파일 중...");

  exec("npx tsc", (error, stdout, stderr) => {
    if (error) {
      console.error("❌ 컴파일 실패:");
      console.error(stderr || error.message);
      return;
    }

    if (stdout) {
      console.log(stdout);
    }

    console.log("✅ 컴파일 완료!");
    console.log(`📦 Output: ${buildDir}`);

    if (!isWatch) {
      console.log("💡 Watch 모드로 실행하려면: npm run dev");
    }
  });
}

// 초기 컴파일
compile();

// Watch 모드
if (isWatch) {
  console.log("👀 Watch 모드 시작 (변경 감지 중)...");

  // 간단한 파일 감시 구현
  const watchDir = (dir) => {
    fs.watch(dir, { recursive: true }, (eventType, filename) => {
      if (filename && filename.endsWith(".ts")) {
        console.log(`\n📝 변경 감지: ${filename}`);
        compile();
      }
    });
  };

  watchDir(srcDir);
}
