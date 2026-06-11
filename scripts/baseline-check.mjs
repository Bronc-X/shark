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
      appSource.includes("buildManualTimelineStoryIntent") &&
      appSource.includes("parseManualTimelineBeats") &&
      appSource.includes("manual-story-action") &&
      appSource.includes("USER-SUPPLIED TIMELINE SCRIPT") &&
      appSource.includes("字幕只进入后期 overlay") &&
      appSource.includes("isEditingStoryIntent") &&
      appSource.includes("updateStoryIntentText") &&
      !appSource.includes("requestStoryIntent") &&
      !appSource.includes('fetch("/api/story-intent"') &&
      !appSource.includes("dice-action") &&
      !styleSource.includes(".dice-action") &&
      appSource.includes("requestStoryboards") &&
      appSource.includes("compileVideoPackage") &&
      appSource.includes("toggleStoryboardSelection") &&
      appSource.includes("StoryboardStep") &&
      appSource.includes("storyIntentCanGenerate = uploadReady && allLocksConfirmed") &&
      appSource.includes("storyboardReady = storyIntentCanGenerate && storyIntentReady") &&
      appSource.includes("确认脚本") &&
      appSource.includes("生成首帧分镜") &&
      appSource.includes("videoReady = uploadReady && Boolean(videoExecutionPackage?.ok) && Boolean(videoFirstFrameAnchor)") &&
      appSource.includes('fetch("/api/storyboards"') &&
      appSource.includes('fetch("/api/video-package"'),
  },
  {
    name: "story intent can be generated then edited inline before storyboard generation",
    pass:
      serverSource.includes("function buildStoryIntentPayload") &&
      serverSource.includes("Generate or revise only the story/action intent") &&
      serverSource.includes("preserve those lines as timing and post-production overlay context") &&
      serverSource.includes("caption lines are overlay context only") &&
      serverSource.includes("revision_instruction") &&
      serverSource.includes("current_intent") &&
      serverSource.includes("proxyStoryIntent") &&
      appSource.includes("story-intent-editor") &&
      appSource.includes("setIsEditingStoryIntent(!props.isEditingStoryIntent)") &&
      appSource.includes("buildEditableStoryBeats"),
  },
  {
    name: "one three-shot storyboard version is generated from confirmed story intent and four-view locks",
    pass:
      serverSource.includes("function buildStoryboardGenerationPrompt") &&
      serverSource.includes("function buildStoryboardFrameImagePayload") &&
      serverSource.includes("Promise.all(selectedBeats.map") &&
      !serverSource.includes("imageUrls[index] || imageUrls[0]") &&
      serverSource.includes("Create exactly one storyboard version with exactly three clear panels") &&
      serverSource.includes("Do not add subtitles, signs, labels, price tags, CTA") &&
      serverSource.includes("formatProductLockContract(contract)") &&
      serverSource.includes("proxyStoryboards") &&
      serverSource.includes("Please generate or confirm story intent before creating storyboards") &&
      appSource.includes("prepareFirstFramePayloadForSubmit(storyboardPayload)") &&
      appSource.includes("storyboard-set-card") &&
      appSource.includes("storyboard-frame-card") &&
      appSource.includes("storyboard-frame-image-button") &&
      appSource.includes("storyboard-shot-list") &&
      appSource.includes("storyboard-next-actions") &&
      appSource.includes("video-main-actions") &&
      appSource.includes("StoryboardPreviewModal"),
  },
  {
    name: "storyboard review keeps Chinese annotations and removes selective regeneration",
    pass:
      appSource.includes("localizeStoryboardLabel") &&
      appSource.includes("localizeStoryboardAction") &&
      appSource.includes("removeRemainingEnglishTokens") &&
      appSource.includes("storyboard-frame-card") &&
      appSource.includes("storyboard-frame-image-button") &&
      !appSource.includes("STORYBOARD_REGENERATE_REASONS") &&
      !appSource.includes("regenerateSelectedStoryboards") &&
      !appSource.includes("onToggleStoryboardRegenerate") &&
      !appSource.includes("storyboard-regenerate-panel") &&
      !appSource.includes("storyboard-regenerate-toggle") &&
      !styleSource.includes(".storyboard-frame-card.needs-regenerate") &&
      !styleSource.includes(".storyboard-regenerate-panel") &&
      !styleSource.includes(".storyboard-reason-grid") &&
      !appSource.includes('["strict", "高一致性"]') &&
      !appSource.includes('["balanced", "平衡"]') &&
      !appSource.includes('["creative", "创意"]') &&
      !appSource.includes("props.motionMode") &&
      !appSource.includes("props.setMotionMode"),
  },
  {
    name: "video package uses a real first-frame anchor and preserves four-view references",
    pass:
      appSource.includes("videoFirstFrameAnchor") &&
      appSource.includes("storyboardImagesAreUnique") &&
      appSource.includes("image_url: videoFirstFrameAnchor") &&
      !appSource.includes("image_url: selectedStoryboardAnchor") &&
      !appSource.includes("image_urls: [],") &&
      !appSource.includes("support_image_urls: [],") &&
      serverSource.includes("storyboard_frame_urls") &&
      serverSource.includes("VIDEO STORYBOARD PATH"),
  },
  {
    name: "wisech-only video visual harness gates first-last inputs",
    pass:
      serverSource.includes("VIDEO_VISUAL_INPUT_CAPABILITIES") &&
      serverSource.includes("buildVideoVisualSubmissionPlan") &&
      serverSource.includes("summarizeVideoVisualSubmissionPlan") &&
      serverSource.includes("visualSummary") &&
      serverSource.includes("VIDEO_VISUAL_INPUT_CAPABILITIES.wisech.default") &&
      serverSource.includes('return "wisech"') &&
      serverSource.includes("videoBaseUrl: WISECH_VIDEO_BASE_URL") &&
      serverSource.includes("model: WISECH_VIDEO_MODEL") &&
      !appSource.includes("toapis") &&
      !appSource.includes("ToAPI") &&
      !appSource.includes("kling-v3") &&
      serverSource.includes("referenceImagesDropped") &&
      serverSource.includes("middleStoryboardOnlyInPrompt") &&
      serverSource.includes("image_with_roles: visualPlan.imageRoleItems") &&
      serverSource.includes("for (const key of [\"storyboardFrameUrls\", \"productReferenceUrls\"])") &&
      serverSource.includes('type: "last_frame"') &&
      appSource.includes("extractVisualHarnessSummary") &&
      appSource.includes("Visual harness") &&
      !appSource.includes("storyboard_frame_urls: emptyImageList"),
  },
  {
    name: "frontend hides internal prompt and harness diagnostics from operators",
    pass:
      !appSource.includes('className="video-prompt-editor"') &&
      !styleSource.includes(".video-prompt-editor") &&
      appSource.includes("video-package-summary") &&
      !appSource.includes("ProgressPanel") &&
      !styleSource.includes(".progress-panel") &&
      !styleSource.includes(".progress-event") &&
      !appSource.includes("getProgressDisplayTitle") &&
      !appSource.includes("getProgressDisplayDetail") &&
      !appSource.includes("getProgressStatusLabel") &&
      !appSource.includes("<span>{event.type}</span>") &&
      !appSource.includes("{event.detail && <small>{event.detail}</small>}") &&
      appSource.includes("extractVisualHarnessSummary") &&
      !appSource.includes("FINAL VIDEO EXECUTION PACKAGE|VIDEO STORYBOARD PATH|Visual harness|modelLimits|promptPreview"),
  },
  {
    name: "first-frame errors identify local API versus upstream failure",
    pass:
      appSource.includes("function formatOperationError") &&
      appSource.includes("浏览器没有连到本地 API") &&
      appSource.includes("这一步还没到图片/视频上游，所以不会有上游 trace") &&
      appSource.includes('formatOperationError(error, "生成首帧分镜", "POST /api/storyboards")') &&
      appSource.includes("readApiResponseBody(response)"),
  },
  {
    name: "first-frame image prompts use domestic review-safe text",
    pass:
      serverSource.includes("function sanitizeImageGenerationText") &&
      serverSource.includes("IMAGE_REVIEW_TEXT_REPLACEMENTS") &&
      serverSource.includes("sanitizeImageStoryIntent(normalizeStoryIntentPayload") &&
      serverSource.includes("Review-safe scene rule") &&
      serverSource.includes("prompt: sanitizeImageGenerationText(promptText)") &&
      serverSource.includes("prompt: sanitizeImageGenerationText(prompt)") &&
      serverSource.includes("api.unhandled_route_error"),
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
      appSource.includes("if (!videoExecutionPackage?.ok || !videoFirstFrameAnchor)") &&
      !appSource.includes('await callBackend("video")'),
  },
  {
    name: "forbidden sales-copy and final fake QA are removed",
    pass:
      (!serverSource.includes("channel targeting") || serverSource.includes("Do not invent sign text, price, SKU, discount, CTA, channel targeting")) &&
      !appSource.includes("参考视频") &&
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
      serverSource.includes("buildVideoPayload(payload)") &&
      serverSource.includes("Full video prompt is still too long"),
  },
  {
    name: "shishi video chain is removed from app and backend",
    pass:
      !appSource.match(/shishi|Shishi|SHISHI|api\.shishikeji|compactShishi|buildShishi|X-License-Key/) &&
      !serverSource.match(/shishi|Shishi|SHISHI|api\.shishikeji|compactShishi|buildShishi|X-License-Key/),
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
    name: "lean workbench UI keeps only core production controls",
    pass:
      appSource.includes("type ProgressEvent") &&
      appSource.includes("resetProgress(kind") &&
      appSource.includes("addProgressEvent") &&
      styleSource.includes(".storyboard-grid") &&
      !styleSource.includes(".progress-panel") &&
      !styleSource.includes(".progress-event") &&
      styleSource.includes(".storyboard-card") &&
      styleSource.includes(".storyboard-frame-card") &&
      styleSource.includes(".storyboard-frame-image-button") &&
      styleSource.includes(".frame-placeholder.working") &&
      styleSource.includes("@keyframes storyboardWaiting") &&
      styleSource.includes(".video-generating-card") &&
      styleSource.includes("@keyframes videoProgress") &&
      styleSource.includes(".preflight-card") &&
      appSource.includes("站点") &&
      appSource.includes("模型") &&
      appSource.includes("时长") &&
      !appSource.includes("视频接口") &&
      !appSource.includes("视频 API Key") &&
      !appSource.includes("测试接口") &&
      !appSource.includes("测试分镜接口") &&
      packageSource.includes('"motion"') &&
      viteConfigSource.includes('tailwindcss()'),
  },
  {
    name: "video provider settings and history persistence remain connected",
    pass:
      appSource.includes('const DEFAULT_VIDEO_BASE_URL = "https://ai.wisech.com/v1"') &&
      appSource.includes('const DEFAULT_VIDEO_MODEL = "yunshu-2-0-260128-720p"') &&
      appSource.includes("VIDEO_PROVIDER_OPTIONS") &&
      appSource.includes("Wisech / 云书 Seedance") &&
      !appSource.includes('{ value: "shishi"') &&
      !appSource.includes('{ value: "toapis"') &&
      !appSource.includes('videoProvider: "wisech" | "toapis"') &&
      appSource.includes("getVideoModelDurationCap") &&
      appSource.includes("clampVideoDurationForModel") &&
      appSource.includes('const HISTORY_STORAGE_KEY = "videoai.historyItems"') &&
      appSource.includes("function loadHistoryItems") &&
      appSource.includes("function saveHistoryItems") &&
      appSource.includes("function resolveHistoryItemAssets") &&
      appSource.includes("firstFrameUrl: videoFirstFrameAnchor || undefined") &&
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
