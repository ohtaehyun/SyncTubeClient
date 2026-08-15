/**
 * esbuild 번들링 스크립트
 * Socket.IO 클라이언트를 포함하여 Service Worker용으로 번들링
 */

const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const isWatch = args.includes("--watch");
const modeArg = args.find((arg) => arg.startsWith("--mode="));
const serverUrlArg = args.find((arg) => arg.startsWith("--server-url="));

const buildDir = path.join(__dirname, "..", "dist");
const PRODUCTION_SERVER_URL = "https://api.synch-tube.com";
const LOCAL_SERVER_URL = "http://localhost:3000";
const mode = modeArg?.slice("--mode=".length);

if (mode !== "development" && mode !== "production") {
  console.error(
    "❌ 빌드 모드를 지정해야 합니다. --mode=development 또는 --mode=production",
  );
  process.exit(1);
}

// Production artifacts must always use the public API. This deliberately
// ignores environment variables and --server-url so a local test URL cannot
// be included in a Chrome Web Store upload by mistake.
const serverUrl =
  mode === "production"
    ? PRODUCTION_SERVER_URL
    : serverUrlArg?.slice("--server-url=".length) ||
      process.env.SYNCTUBE_SERVER_URL ||
      LOCAL_SERVER_URL;

function validateServerUrl() {
  let parsedUrl;

  try {
    parsedUrl = new URL(serverUrl);
  } catch {
    console.error(`❌ 올바르지 않은 서버 주소입니다: ${serverUrl}`);
    process.exit(1);
  }

  if (mode === "production") {
    if (serverUrl !== PRODUCTION_SERVER_URL || parsedUrl.protocol !== "https:") {
      console.error("❌ 운영 빌드는 승인된 HTTPS 운영 API만 사용할 수 있습니다.");
      process.exit(1);
    }

    if (parsedUrl.hostname === "localhost" || parsedUrl.hostname === "127.0.0.1") {
      console.error("❌ 운영 빌드에 로컬 서버 주소를 사용할 수 없습니다.");
      process.exit(1);
    }
  }
}

validateServerUrl();

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
  define: {
    __SERVER_URL__: JSON.stringify(serverUrl),
  },
};

async function build() {
  try {
    console.log(`🔨 ${mode} 빌드 시작: ${serverUrl}`);
    await esbuild.build(buildOptions);

    if (mode === "production") {
      const backgroundBundle = fs.readFileSync(
        path.join(buildDir, "background.js"),
        "utf8",
      );
      if (
        backgroundBundle.includes(LOCAL_SERVER_URL) ||
        !backgroundBundle.includes(PRODUCTION_SERVER_URL)
      ) {
        throw new Error("운영 번들 서버 주소 검증에 실패했습니다.");
      }
    }

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
