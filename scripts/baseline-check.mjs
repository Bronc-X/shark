import { existsSync, readFileSync } from "node:fs";

const serverSource = readFileSync(new URL("../server/index.js", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const styleSource = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const packageSource = readFileSync(new URL("../package.json", import.meta.url), "utf8");
const viteConfigSource = readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");

const productPresetFiles = {
  shark: [
    "../public/product-presets/shark-inflatable/front.png",
    "../public/product-presets/shark-inflatable/left.png",
    "../public/product-presets/shark-inflatable/right.png",
    "../public/product-presets/shark-inflatable/back.jpg",
  ],
  bull: [
    "../public/product-presets/bull-inflatable/front.jpg",
    "../public/product-presets/bull-inflatable/left.jpg",
    "../public/product-presets/bull-inflatable/right.jpg",
    "../public/product-presets/bull-inflatable/back.jpg",
  ],
  grayMouse: [
    "../public/product-presets/gray-mouse-inflatable/front.jpg",
    "../public/product-presets/gray-mouse-inflatable/left.jpg",
    "../public/product-presets/gray-mouse-inflatable/right.jpg",
    "../public/product-presets/gray-mouse-inflatable/back.jpg",
  ],
  frog: [
    "../public/product-presets/frog-inflatable/front.jpg",
    "../public/product-presets/frog-inflatable/left.jpg",
    "../public/product-presets/frog-inflatable/right.jpg",
    "../public/product-presets/frog-inflatable/back.jpg",
    "../public/product-presets/frog-inflatable/support-right-alt.jpg",
  ],
  sumo: [
    "../public/product-presets/sumo-inflatable/front.jpg",
    "../public/product-presets/sumo-inflatable/left.jpg",
    "../public/product-presets/sumo-inflatable/right.jpg",
    "../public/product-presets/sumo-inflatable/back.jpg",
    "../public/product-presets/sumo-inflatable/support-rear-valve.jpg",
  ],
};

const allPresetFiles = Object.values(productPresetFiles)
  .flat()
  .map((path) => new URL(path, import.meta.url));

const forbiddenAppTokens = [
  "PromptPairMeta",
  "ProductReferenceVideo",
  "REFERENCE_VIDEOS",
  "referenceVideos",
  "referenceVideoUrls",
  "firstFrameReviewChecks",
  "FirstFrameStep",
  "QaStep",
  "Score label=",
  "货对版",
  "动作趣味",
  "场景丰富",
];

const checks = [
  {
    name: "five product presets exist without reference-video dependency",
    pass:
      allPresetFiles.every((file) => existsSync(file)) &&
      appSource.includes("SHARK_INFLATABLE_PRESET_VIEWS") &&
      appSource.includes("BULL_INFLATABLE_PRESET_VIEWS") &&
      appSource.includes("GRAY_MOUSE_INFLATABLE_PRESET_VIEWS") &&
      appSource.includes("FROG_INFLATABLE_PRESET_VIEWS") &&
      appSource.includes("SUMO_INFLATABLE_PRESET_VIEWS") &&
      appSource.includes("PRODUCT_GRAY_MOUSE_001") &&
      appSource.includes("PRODUCT_FROG_001") &&
      appSource.includes("PRODUCT_SUMO_001") &&
      forbiddenAppTokens.every((token) => !appSource.includes(token)),
  },
  {
    name: "frontend exposes upload storyboard video workflow",
    pass:
      appSource.includes('type StepId = "upload" | "storyboard" | "video"') &&
      appSource.includes('const [storyDirection, setStoryDirection] = useState("")') &&
      appSource.includes("requestStoryIntent") &&
      appSource.includes("requestStoryboards") &&
      appSource.includes("compileVideoPackage") &&
      appSource.includes("toggleStoryboardSelection") &&
      appSource.includes("StoryboardStep") &&
      appSource.includes("storyIntentCanGenerate = uploadReady && allLocksConfirmed") &&
      appSource.includes("storyboardReady = storyIntentCanGenerate && storyIntentReady") &&
      appSource.includes("先生成或确认剧情意图，再生成候选分镜") &&
      appSource.includes("videoReady = uploadReady && Boolean(videoExecutionPackage?.ok) && Boolean(selectedStoryboardAnchor)") &&
      appSource.includes('fetch("/api/story-intent"') &&
      appSource.includes('fetch("/api/storyboards"') &&
      appSource.includes('fetch("/api/video-package"'),
  },
  {
    name: "story intent can be generated and revised by model before storyboard generation",
    pass:
      serverSource.includes("function buildStoryIntentPayload") &&
      serverSource.includes("Generate or revise only the story/action intent") &&
      serverSource.includes("Do not write subtitles, sign text, price, SKU, discount, CTA") &&
      serverSource.includes("revision_instruction") &&
      serverSource.includes("current_intent") &&
      serverSource.includes("proxyStoryIntent") &&
      appSource.includes("onReviseIntent={() => requestStoryIntent(storyRevision)}"),
  },
  {
    name: "storyboards are generated from confirmed story intent and four-view locks",
    pass:
      serverSource.includes("function buildStoryboardGenerationPrompt") &&
      serverSource.includes("Create one storyboard contact sheet or a single keyframe candidate") &&
      serverSource.includes("Do not add subtitles, signs, labels, price tags, CTA") &&
      serverSource.includes("formatProductLockContract(contract)") &&
      serverSource.includes("proxyStoryboards") &&
      serverSource.includes("Please generate or confirm story intent before creating storyboards") &&
      appSource.includes("prepareFirstFramePayloadForSubmit(storyboardPayload)") &&
      appSource.includes("selectedStoryboardIds"),
  },
  {
    name: "preflight and execution package gate expensive video generation",
    pass:
      serverSource.includes("function collectStoryboardPreflightIssues") &&
      serverSource.includes("function collectPreflightRequestText") &&
      serverSource.includes("stripNegativeGuardrailPhrases") &&
      serverSource.includes("function buildStoryboardPreflight") &&
      serverSource.includes("function buildVideoExecutionPackage") &&
      serverSource.includes("function hasPassingVideoExecutionPackage") &&
      serverSource.includes("requested_text_or_sales_copy") &&
      !serverSource.includes("forbidden_text_or_sales_copy") &&
      !serverSource.includes("forbiddenText") &&
      serverSource.includes('path: "/api/storyboard-preflight"') &&
      serverSource.includes('path: "/api/video-package"') &&
      serverSource.includes("Please pass storyboard preflight and compile a video execution package before generating video") &&
      appSource.includes("video_execution_package: videoExecutionPackage") &&
      appSource.includes("videoSubmitPayload") &&
      appSource.includes("videoSafetyPayload") &&
      appSource.includes("createSlimVideoExecutionPackage") &&
      appSource.includes("action_prompt: videoExecutionPackage?.finalVideoPrompt") &&
      appSource.includes("if (!videoExecutionPackage?.ok || !selectedStoryboardAnchor)") &&
      !appSource.includes('await callBackend("video")'),
  },
  {
    name: "forbidden sales-copy and final fake QA are removed",
    pass:
      !serverSource.includes("channel targeting") || serverSource.includes("Do not write subtitles, sign text, price, SKU, discount, CTA, channel targeting") &&
      !appSource.includes("参考视频") &&
      !appSource.includes("生成首帧") &&
      !appSource.includes("首帧审核") &&
      !appSource.includes("Score label") &&
      !appSource.includes("QaStep") &&
      !appSource.includes("货对版") &&
      !appSource.includes("动作趣味") &&
      !appSource.includes("场景丰富"),
  },
  {
    name: "video safety preflight still runs before upstream video submit",
    pass:
      appSource.includes('fetch("/api/video-safety"') &&
      appSource.indexOf('fetch("/api/video-safety"') < appSource.indexOf('fetch("/api/video"') &&
      serverSource.includes('path: "/api/video-safety"') &&
      serverSource.includes("proxyVideoSafety") &&
      serverSource.includes("MAX_JSON_BODY_BYTES") &&
      serverSource.includes("video_execution_package,") &&
      serverSource.includes("storyboards,") &&
      serverSource.includes("buildVideoPayload(payload, { compactShishiPrompt"),
  },
  {
    name: "backend routes remain table-driven and include storyboard harness routes",
    pass:
      serverSource.includes("const apiRoutes = [") &&
      serverSource.includes("function findApiRoute") &&
      serverSource.includes("async function handleApiRequest") &&
      serverSource.includes('path: "/api/product-locks"') &&
      serverSource.includes('path: "/api/story-intent"') &&
      serverSource.includes('path: "/api/storyboards"') &&
      serverSource.includes('path: "/api/storyboard-preflight"') &&
      serverSource.includes('path: "/api/video-package"') &&
      serverSource.includes('path: "/api/video"'),
  },
  {
    name: "progress and workbench UI are present for production interaction",
    pass:
      appSource.includes("type ProgressEvent") &&
      appSource.includes("ProgressPanel") &&
      appSource.includes("resetProgress(kind") &&
      appSource.includes("addProgressEvent") &&
      styleSource.includes(".progress-panel") &&
      styleSource.includes(".progress-event") &&
      styleSource.includes(".storyboard-grid") &&
      styleSource.includes(".storyboard-card") &&
      styleSource.includes(".preflight-card") &&
      packageSource.includes('"motion"') &&
      viteConfigSource.includes('tailwindcss()'),
  },
  {
    name: "video provider settings and history persistence remain connected",
    pass:
      appSource.includes('const DEFAULT_VIDEO_BASE_URL = "https://api.shishikeji.com"') &&
      appSource.includes("VIDEO_PROVIDER_OPTIONS") &&
      appSource.includes("getVideoModelDurationCap") &&
      appSource.includes("clampVideoDurationForModel") &&
      appSource.includes('const HISTORY_STORAGE_KEY = "videoai.historyItems"') &&
      appSource.includes("function loadHistoryItems") &&
      appSource.includes("function saveHistoryItems") &&
      appSource.includes("function resolveHistoryItemAssets") &&
      appSource.includes("firstFrameUrl: selectedStoryboardAnchor || undefined") &&
      appSource.includes('detailUrl: nextVideoUrl, videoUrl: nextVideoUrl'),
  },
];

const failed = checks.filter((check) => !check.pass);

for (const check of checks) {
  console.log(`${check.pass ? "PASS" : "FAIL"} ${check.name}`);
}

if (failed.length > 0) {
  console.error(`\nBaseline failed: ${failed.length} check(s).`);
  process.exit(1);
}

console.log("\nBaseline passed.");
