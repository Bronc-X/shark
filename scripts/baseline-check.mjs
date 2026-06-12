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

const checks = [
  {
    name: "five product presets and four-view locks are available",
    pass:
      allPresetFiles.every((file) => existsSync(file)) &&
      appSource.includes("SHARK_INFLATABLE_PRESET_VIEWS") &&
      appSource.includes("BULL_INFLATABLE_PRESET_VIEWS") &&
      appSource.includes("GRAY_MOUSE_INFLATABLE_PRESET_VIEWS") &&
      appSource.includes("FROG_INFLATABLE_PRESET_VIEWS") &&
      appSource.includes("SUMO_INFLATABLE_PRESET_VIEWS") &&
      appSource.includes("lockedNodePayload") &&
      serverSource.includes("validateFourViewImages(body)"),
  },
  {
    name: "current user flow is combined setup -> video",
    pass:
      appSource.includes('type StepId = "setup" | "upload" | "storyboard" | "video"') &&
      appSource.includes('data-testid="setup-screen"') &&
      appSource.includes('data-testid="upload-screen"') &&
      appSource.includes('data-testid="video-screen"') &&
      appSource.includes('data-testid="script-input"') &&
      appSource.includes('data-testid="generate-first-frame"') &&
      appSource.includes('data-testid="confirm-first-frame"') &&
      appSource.includes('data-testid="generate-video"') &&
      appSource.includes('data-testid="video-parameter-panel"') &&
      appSource.includes('data-testid="aspect-ratio-control"') &&
      appSource.includes('data-testid="video-model-select"') &&
      !appSource.includes('data-testid="video-provider-select"') &&
      appSource.includes('fetch("/api/first-frame"') &&
      appSource.includes('fetch("/api/video-package"') &&
      appSource.includes('fetch("/api/video-safety"') &&
      appSource.includes('fetch("/api/video"'),
  },
  {
    name: "first-frame generation consumes user script and product views",
    pass:
      appSource.includes("stripPostProductionTextFromScript(intent.storyIntent)") &&
      appSource.includes("prepareFirstFramePayloadForSubmit") &&
      appSource.includes("image_urls") &&
      appSource.includes("support_image_urls") &&
      appSource.includes("setStoryboards([firstFrame])") &&
      appSource.includes("setSelectedStoryboardIds([firstFrame.id])") &&
      appSource.includes("isRenderableImageUrl(firstFrameUrl)") &&
      appSource.includes("waitForImageLoad(firstFrameUrl)") &&
      appSource.includes("onStoryboardImageError") &&
      appSource.includes("broken-first-frame") &&
      serverSource.includes('path: "/api/first-frame"') &&
      serverSource.includes("buildFirstFramePayload") &&
      serverSource.includes("ABSOLUTE NO-READABLE-TEXT RULE"),
  },
  {
    name: "Kling direct video submit uses first frame, full script, and reference views",
    pass:
      appSource.includes('"kling"') &&
      appSource.includes("usesKlingDirect") &&
      appSource.includes("storyboards: usesKlingDirect ? selectedStoryboards") &&
      appSource.includes("firstFrameUrl: selectedStoryboardAnchor || undefined") &&
      serverSource.includes("KLING_OMNI_VIDEO_PATH") &&
      serverSource.includes("createKlingJwtToken") &&
      serverSource.includes("buildKlingOmniVideoPayload") &&
      serverSource.includes("buildKlingShotPrompts") &&
      serverSource.includes("model_name: payload.model || KLING_VIDEO_MODEL") &&
      serverSource.includes("No readable text in the image"),
  },
  {
    name: "back-view authority protects rear product consistency",
    pass:
      appSource.includes("BACK_VIEW 是背面唯一真源") &&
      appSource.includes("背面不得出现侧面黑眼睛、黑色鳃线、正面白肚、透明脸窗或正面拉链") &&
      appSource.includes("绿色阀门位置、大小、颜色、方向、圆环/网格细节不变") &&
      serverSource.includes("BACK_VIEW AUTHORITY HARD LOCK") &&
      serverSource.includes("SHARK BACK_VIEW AUTHORITY") &&
      serverSource.includes("SHARK BACK_VIEW NEGATIVE") &&
      serverSource.includes("MOUSE BACK_VIEW AUTHORITY") &&
      serverSource.includes("MOUSE BACK_VIEW NEGATIVE") &&
      serverSource.includes("REAR TURN HARD LOCK: a controlled body turn is allowed and may reveal the back, but every rear-facing shark frame must match BACK_VIEW exactly") &&
      serverSource.includes("Never move the green valve above the tail, onto the tail root, onto the side surface, onto the cream belly, or into the tail as a decoration"),
  },
  {
    name: "video screen is Kling-only with Chinese model explanations and slower polling",
    pass:
      appSource.includes('const KLING_VIDEO_PROVIDER = "kling"') &&
      appSource.includes('const DEFAULT_VIDEO_BASE_URL = "https://api-singapore.klingai.com"') &&
      appSource.includes('const VIDEO_STATUS_POLL_INTERVAL_MS = 8750') &&
      appSource.includes("Kling VIDEO 3.0 Omni：主力图生视频") &&
      appSource.includes("Kling O1 Omni：更偏首尾帧和复杂参考控制") &&
      appSource.includes("Kling") &&
      appSource.includes("video-side-params") &&
      !appSource.includes("高一致性") &&
      !appSource.includes('["balanced", "平衡"]') &&
      !appSource.includes('["creative", "创意"]'),
  },
  {
    name: "video generation remains gated by execution package and safety preflight",
    pass:
      serverSource.includes("function hasPassingVideoExecutionPackage") &&
      serverSource.includes('path: "/api/video-package"') &&
      serverSource.includes('path: "/api/video-safety"') &&
      serverSource.includes('path: "/api/video"') &&
      serverSource.indexOf('path: "/api/video-safety"') < serverSource.indexOf('path: "/api/video-status"') &&
      appSource.includes("if (!videoExecutionPackage?.ok || !selectedStoryboardAnchor)") &&
      appSource.indexOf('fetch("/api/video-safety"') < appSource.indexOf('fetch("/api/video"') &&
      appSource.includes("body: JSON.stringify(videoSafetyPayload)") &&
      appSource.includes("body: JSON.stringify(requestPayload)"),
  },
  {
    name: "local backend history and migrated asset routes are connected",
    pass:
      serverSource.includes("LOCAL_HISTORY_FILE") &&
      serverSource.includes("LOCAL_HISTORY_ASSET_DIR") &&
      serverSource.includes("function readLocalHistoryItems") &&
      serverSource.includes("function writeLocalHistoryItems") &&
      serverSource.includes("function sanitizeLocalHistoryItem") &&
      serverSource.includes("function persistHistoryDataImage") &&
      serverSource.includes("function serveHistoryAsset") &&
      serverSource.includes('path: "/api/history"') &&
      serverSource.includes('path: "/api/history-asset/:file"') &&
      serverSource.includes('path: "/api/local-video"') &&
      appSource.includes("syncHistoryFromBackend") &&
      appSource.includes("mergeHistoryItems") &&
      appSource.includes("resolveHistoryItemAssets") &&
      appSource.includes("sanitizeHistoryItemForBackend") &&
      appSource.includes("getLocalVideoAssetUrl"),
  },
  {
    name: "subtitle and voiceover editor has toggles, gender choice, render, and download",
    pass:
      appSource.includes("PostProductionPanel") &&
      appSource.includes('data-testid="post-production-panel"') &&
      appSource.includes('testId: "subtitle-toggle"') &&
      appSource.includes('testId: "voiceover-toggle"') &&
      appSource.includes("data-testid={option.testId}") &&
      appSource.includes('data-testid={`voice-${value}`}') &&
      appSource.includes('data-testid="generate-post-assets"') &&
      appSource.includes('data-testid="download-final-mp4"') &&
      appSource.includes('data-testid="add-caption-segment"') &&
      appSource.includes('data-testid="auto-layout-segments"') &&
      appSource.includes('data-testid={`caption-start-${index}`}') &&
      appSource.includes('data-testid={`caption-end-${index}`}') &&
      appSource.includes("cascadeEditableSegments") &&
      appSource.includes("autoLayoutEditableSegments") &&
      appSource.includes("clampWholeSeconds") &&
      appSource.includes("caption-time-fields") &&
      appSource.includes("createEditablePostSegmentsFromScript") &&
      appSource.includes("collectLabeledBlock(cleanLines, [\"字幕\", \"subtitle\", \"caption\"])") &&
      appSource.includes('fetch("/api/voiceover"') &&
      appSource.includes("renderPostVideoToDownloads") &&
      serverSource.includes('path: "/api/voiceover"') &&
      serverSource.includes('path: "/api/render-post-video"') &&
      serverSource.includes("includeSubtitles") &&
      serverSource.includes("includeVoiceover") &&
      serverSource.includes("resolveWorkingBinary") &&
      serverSource.includes("spawnSync(candidate, [\"-version\"]") &&
      serverSource.includes("imageio_ffmpeg") &&
      packageSource.includes('"ffmpeg-static"') &&
      packageSource.includes('"ffprobe-static"'),
  },
  {
    name: "download and local video serving preserve openable MP4 assets",
    pass:
      appSource.includes("saveVideoAssetToDownloads") &&
      appSource.includes("renderPostVideoToDownloads") &&
      appSource.includes('data-testid="download-location"') &&
      appSource.includes('data-testid="history-download-location"') &&
      appSource.includes("triggerBrowserDownload(getLocalVideoAssetUrl(filePath)") &&
      appSource.includes("revealLocalVideoInFolder") &&
      appSource.includes('data-testid="reveal-final-mp4"') &&
      appSource.includes('data-testid="reveal-history-mp4"') &&
      appSource.includes("打开所在位置") &&
      appSource.includes("createDownloadStatus(filePath") &&
      appSource.includes("浏览器下载已触发") &&
      appSource.includes("保存下载") &&
      appSource.includes("renderedVideoPath") &&
      appSource.includes("renderedVideoFileName") &&
      serverSource.includes('path: "/api/save-video-download"') &&
      serverSource.includes('path: "/api/reveal-local-video"') &&
      serverSource.includes("revealLocalVideo") &&
      serverSource.includes("explorer.exe") &&
      serverSource.includes("saveVideoDownload") &&
      serverSource.includes("renderPostVideo") &&
      serverSource.includes("serveLocalVideo") &&
      serverSource.includes("Content-Type") &&
      serverSource.includes("video/mp4"),
  },
  {
    name: "dev server ignores runtime cache folders and proxies API to local backend",
    pass:
      viteConfigSource.includes('"/api": "http://127.0.0.1:6000"') &&
      viteConfigSource.includes("**/.codex-run/**") &&
      viteConfigSource.includes("**/.playwright-mcp/**") &&
      appSource.includes("WORKSPACE_STATE_STORAGE_KEY") &&
      appSource.includes("loadWorkspaceState") &&
      appSource.includes("saveWorkspaceState") &&
      appSource.includes("resetWorkspaceFlow") &&
      styleSource.includes(".post-production-panel") &&
      styleSource.includes(".caption-voice-editor") &&
      styleSource.includes(".caption-time-fields input") &&
      styleSource.includes("object-fit: cover") &&
      styleSource.includes(".post-toggle-group") &&
      styleSource.includes(".auto-layout-segments") &&
      styleSource.includes(".history-inline-panel") &&
      packageSource.includes('"test:baseline"'),
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
