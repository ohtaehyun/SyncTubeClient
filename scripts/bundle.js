/**
 * esbuild 번들링 스크립트
 * Socket.IO 클라이언트를 포함하여 Service Worker용으로 번들링
 */

const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const isWatch = args.includes("--watch");

const buildDir = path.join(__dirname, "..", "dist");

// 빌드 디렉토리 생성
if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true });
}

const buildOptions = {
  entryPoints: {
    background: "src/background.ts",
    content: "src/content.ts",
    popup: "src/popup.ts",
  },
  bundle: true,
  outdir: buildDir,
  format: "esm",
  platform: "browser",
  target: ["chrome96"],
  sourcemap: true,
  minify: false,
  treeShaking: true,
  logLevel: "info",
};

async function build() {
  try {
    console.log("🔨 esbuild 번들링 중...");
    await esbuild.build(buildOptions);
    console.log("✅ 번들링 완료!");
    console.log(`📦 Output: ${buildDir}`);
  } catch (error) {
    console.error("❌ 번들링 실패:", error);
    process.exit(1);
  }
}

if (isWatch) {
  console.log("👀 Watch 모드 시작 (변경 감지 중)...");
  esbuild
    .context(buildOptions)
    .then((ctx) => {
      ctx.watch();
      console.log("✅ Watch 모드 활성화");
    })
    .catch((error) => {
      console.error("❌ Watch 모드 시작 실패:", error);
      process.exit(1);
    });
} else {
  build();
}
