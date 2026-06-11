import {
  Check,
  ChevronDown,
  ClipboardCheck,
  CloudUpload,
  Database,
  FileImage,
  Film,
  LoaderCircle,
  Maximize2,
  Pencil,
  Play,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { LucideIcon } from "lucide-react";
import type { DragEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

type StepId = "upload" | "storyboard" | "video";
type MotionMode = "strict" | "balanced" | "creative";
type VideoStatus = "idle" | "submitted" | "polling" | "succeeded" | "failed";
type WorkflowJobKind = "storyIntent" | "storyboard" | "video";
type JobEventType =
  | "job.started"
  | "step.started"
  | "tool.started"
  | "tool.completed"
  | "artifact.created"
  | "step.failed"
  | "job.completed";

type ProgressEvent = {
  id: string;
  jobId: string;
  type: JobEventType;
  title: string;
  detail: string;
  status: "running" | "done" | "failed";
  at: string;
};
type StoryBeat = {
  id: string;
  beat: string;
  action: string;
  camera: string;
  risk?: string;
};

type StoryIntent = {
  storyTitle: string;
  storyIntent: string;
  sceneAnchor: string;
  motionMode: MotionMode;
  productType: string;
  stableProductName: string;
  beats: StoryBeat[];
  riskNotes: string[];
  model?: string;
  upstreamUrl?: string;
};

type ProductLockContract = {
  productType: string;
  stableProductName: string;
  family: string;
  locks: Array<{
    id: string;
    label: string;
    ownedByViews: string[];
    allowedAngles: string[];
    forbiddenPlacements: string[];
    failureExamples: string[];
    critical: boolean;
  }>;
  supplementalLocks: Array<{ id: string; label: string; detail?: string; critical?: boolean }>;
  forbiddenContent: string[];
};

type StoryboardCheck = {
  id: string;
  status: "pending" | "pass" | "risky" | "fail";
  detail: string;
};

type StoryboardFrame = {
  id: string;
  imageUrl: string;
  beat: string;
  action: string;
  viewAngle: string;
  checks?: StoryboardCheck[];
};

type StoryboardPreflightIssue = {
  severity: "fail" | "risky" | "info";
  code: string;
  message: string;
};

type StoryboardPreflight = {
  ok: boolean;
  status: "pass" | "risky" | "fail";
  issues: StoryboardPreflightIssue[];
  cameraPath: string;
  selectedStoryboardCount: number;
};

type VideoExecutionPackage = {
  ok: boolean;
  preflight: StoryboardPreflight;
  productType: string;
  stableProductName: string;
  storyIntent: StoryIntent;
  motionMode: MotionMode;
  selectedStoryboards: StoryboardFrame[];
  productLockContract: ProductLockContract;
  cameraPath: string;
  finalVideoPrompt: string;
  createdAt: string;
};

function redactStoryboardImageForSubmit(storyboard: StoryboardFrame): StoryboardFrame {
  return {
    ...storyboard,
    imageUrl: storyboard.imageUrl ? "[storyboard image omitted from submit payload]" : "",
  };
}

function createSlimVideoExecutionPackage(pkg: VideoExecutionPackage | null): VideoExecutionPackage | null {
  if (!pkg) return null;
  return {
    ...pkg,
    selectedStoryboards: pkg.selectedStoryboards.map(redactStoryboardImageForSubmit),
  };
}

type UploadSlot = {
  id: string;
  label: string;
  badge: string;
  hint: string;
  accept: string;
  fileName: string;
  localUrl: string;
  dataUrl?: string;
  file?: File;
  source?: "preset" | "manual";
};

type LockNode = {
  id: string;
  label: string;
  code: string;
  detail: string;
  confidence: number;
  critical: boolean;
  confirmed: boolean;
};

type ApiSettings = {
  imagePath: string;
  imageModel: string;
  videoProvider: "wisech";
  videoBaseUrl: string;
  videoPath: string;
  videoApiKey: string;
  videoModel: string;
  promptModel: string;
};

type HistoryItem = {
  id: string;
  type: "分镜" | "首帧" | "视频";
  title: string;
  time: string;
  createdAt: string;
  status: "成功" | "失败" | "处理中";
  productType?: string;
  sceneTitle?: string;
  scenePrompt?: string;
  videoPrompt?: string;
  model?: string;
  aspectRatio?: string;
  duration?: number;
  requestedDuration?: number;
  motionMode?: MotionMode;
  taskId?: string;
  detailUrl?: string;
  firstFrameUrl?: string;
  videoUrl?: string;
  productViewUrls?: string[];
  supportImageUrls?: string[];
  error?: string;
};

type ProductAsset = {
  id: string;
  name: string;
  type: string;
  viewMode: "四视图";
  viewUrls: string[];
  supportViewUrls: string[];
  lockedNodeCodes: string[];
  updatedAt: string;
};

type ProductPresetView = {
  slotId: string;
  fileName: string;
  localUrl: string;
};

type ProductPresetSupportView = {
  fileName: string;
  localUrl: string;
};

type ProductPreset = {
  productType: string;
  views: readonly ProductPresetView[];
  supportViews?: readonly ProductPresetSupportView[];
  lockNodes: readonly LockNode[];
};

const STORAGE_KEY = "videoai.apiSettings";
const HISTORY_STORAGE_KEY = "videoai.historyItems";
const HISTORY_ASSET_DB_NAME = "videoai.historyAssets";
const HISTORY_ASSET_STORE_NAME = "assets";
const HISTORY_ASSET_REF_PREFIX = "videoai-history-asset:";
const MAX_HISTORY_ITEMS = 30;
const HISTORY_ASSET_FIELDS = ["detailUrl", "firstFrameUrl", "videoUrl"] as const;
const FIRST_FRAME_REFERENCE_MAX_EDGE = 1536;
const FIRST_FRAME_REFERENCE_MAX_BYTES = 900_000;
const FIRST_FRAME_REFERENCE_JPEG_QUALITY = 0.86;
const DEFAULT_PROMPT_MODEL = "gpt-5.4-mini";
const DEFAULT_IMAGE_MODEL = "gpt-image-2";
const DEFAULT_VIDEO_BASE_URL = "https://ai.wisech.com/v1";
const DEFAULT_VIDEO_MODEL = "yunshu-2-0-260128-720p";
const MANUAL_TIMELINE_SCRIPT_MAX_CHARS = 5200;
const SENSITIVE_PRODUCT_WORD_REPLACEMENTS: Array<[RegExp, string]> = [
  [new RegExp("\\u5976\\u5934", "g"), "粉色小圆点"],
  [new RegExp("\\u4e73\\u623f", "g"), "粉色下腹组件"],
  [new RegExp("\\u80f8\\u8179", "g"), "侧面躯干"],
  [new RegExp("\\u80f8\\u53e3", "g"), "上身正面"],
  [new RegExp("\\u80f8\\u7ebf", "g"), "上身简线"],
  [new RegExp("\\u80f8\\u90e8", "g"), "上身"],
  [new RegExp("\\u80f8", "g"), "上身"],
  [new RegExp("\\bu" + "dders?\\b", "gi"), "front belly pad"],
  [new RegExp("\\bn" + "ipples?\\b", "gi"), "small pink dots"],
  [new RegExp("\\bb" + "reasts?\\b", "gi"), "front belly pad"],
  [new RegExp("\\bc" + "hest\\b", "gi"), "upper torso"],
  [new RegExp("\\bb" + "ust\\b", "gi"), "upper torso"],
];

function sanitizeProductText(text: string) {
  return SENSITIVE_PRODUCT_WORD_REPLACEMENTS.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), String(text || ""))
    .replace(/\s{2,}/g, " ")
    .trim();
}

function sanitizeLockNode(node: LockNode): LockNode {
  return {
    ...node,
    label: sanitizeProductText(node.label),
    detail: sanitizeProductText(node.detail),
  };
}

const STORY_BEAT_FALLBACKS = [
  { beat: "setup", camera: "front" },
  { beat: "tiny reversal", camera: "front_three_quarter" },
  { beat: "recovery pose", camera: "front" },
];

const STORYBOARD_LABEL_TRANSLATIONS: Record<string, string> = {
  setup: "开场建立",
  "tiny reversal": "轻微反转",
  "tiny recoil": "轻微后缩",
  "recovery pose": "收束姿态",
  front: "正面",
  front_three_quarter: "正面三分之二",
  three_quarter_front: "正面三分之二",
  left: "左侧",
  right: "右侧",
  back: "背面",
};

const STORYBOARD_ACTION_FALLBACKS = [
  "建立场景，产品完整入镜，保持关键结构清楚。",
  "出现轻微反转，动作幅度更明显，但产品外形不漂移。",
  "回到收束姿态，画面稳定，继续保持产品一致。",
];

function removeRemainingEnglishTokens(value: string) {
  return value.replace(/[A-Za-z][A-Za-z0-9_-]*/g, "").replace(/\s{2,}/g, " ").trim();
}

function localizeStoryboardLabel(value: string) {
  const text = sanitizeProductText(value);
  if (!text) return "";
  const key = text.toLowerCase().replace(/[\s-]+/g, "_");
  const direct = STORYBOARD_LABEL_TRANSLATIONS[text.toLowerCase()] || STORYBOARD_LABEL_TRANSLATIONS[key];
  if (direct) return direct;
  const replaced = text
    .replace(/\bsetup\b/gi, "开场建立")
    .replace(/\btiny reversal\b/gi, "轻微反转")
    .replace(/\btiny recoil\b/gi, "轻微后缩")
    .replace(/\brecovery pose\b/gi, "收束姿态")
    .replace(/\bfront[_ -]three[_ -]quarter\b/gi, "正面三分之二")
    .replace(/\bthree[_ -]quarter[_ -]front\b/gi, "正面三分之二")
    .replace(/\bfront\b/gi, "正面")
    .replace(/\bleft\b/gi, "左侧")
    .replace(/\bright\b/gi, "右侧")
    .replace(/\bback\b/gi, "背面");
  const clean = removeRemainingEnglishTokens(replaced);
  return clean || "分镜阶段";
}

function localizeStoryboardAction(value: string, index = 0) {
  const text = sanitizeProductText(value);
  const fallback = STORYBOARD_ACTION_FALLBACKS[index] || STORYBOARD_ACTION_FALLBACKS[0];
  if (!text) return fallback;
  if (!/[\u4e00-\u9fff]/u.test(text)) return fallback;
  const replaced = text
    .replace(/\bsetup\b/gi, "开场建立")
    .replace(/\btiny reversal\b/gi, "轻微反转")
    .replace(/\btiny recoil\b/gi, "轻微后缩")
    .replace(/\brecovery pose\b/gi, "收束姿态")
    .replace(/\bfront[_ -]three[_ -]quarter\b/gi, "正面三分之二")
    .replace(/\bthree[_ -]quarter[_ -]front\b/gi, "正面三分之二")
    .replace(/\bfront\b/gi, "正面")
    .replace(/\bleft\b/gi, "左侧")
    .replace(/\bright\b/gi, "右侧")
    .replace(/\bback\b/gi, "背面");
  return removeRemainingEnglishTokens(replaced) || fallback;
}

function splitStoryIntentIntoBeats(text: string) {
  return sanitizeProductText(text)
    .split(/[\n。！？.!?；;]+/u)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 3);
}

function truncateTextByChars(text: string, maxChars: number) {
  const value = String(text || "").trim();
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - 16)).trim()}...`;
}

function compactManualTimelineText(value: string) {
  return sanitizeProductText(value)
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function extractTimelineField(block: string, labels: string[]) {
  const labelPattern = labels.join("|");
  const match = block.match(new RegExp(`(?:^|\\n)\\s*(?:${labelPattern})\\s*[：:]\\s*([\\s\\S]*?)(?=\\n\\s*(?:画面|镜头|场景|字幕|文案|旁白)\\s*[：:]|$)`, "i"));
  return match ? compactManualTimelineText(match[1]) : "";
}

function getTimelineCameraFallback(index: number) {
  if (index === 0) return "front";
  if (index === 1) return "front_three_quarter";
  if (index === 2) return "front";
  if (index === 3) return "slight_front_three_quarter";
  return "front";
}

function parseManualTimelineBeats(script: string): StoryBeat[] {
  const cleanScript = compactManualTimelineText(script);
  const beats: StoryBeat[] = [];
  const segmentPattern = /(?:^|\n)\s*(\d+(?:[.．]\d+)?)\s*(?:-|~|—|–|至|到)\s*(\d+(?:[.．]\d+)?)\s*秒\s*([\s\S]*?)(?=\n\s*\d+(?:[.．]\d+)?\s*(?:-|~|—|–|至|到)\s*\d+(?:[.．]\d+)?\s*秒|$)/g;
  let match: RegExpExecArray | null;
  while ((match = segmentPattern.exec(cleanScript)) && beats.length < 5) {
    const [, start, end, block] = match;
    const scene = extractTimelineField(block, ["画面", "镜头", "场景"]);
    const caption = extractTimelineField(block, ["字幕", "文案", "旁白"]);
    const action = [
      scene || compactManualTimelineText(block),
      caption ? `Caption/post overlay context: ${caption}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    beats.push({
      id: `beat_${beats.length + 1}`,
      beat: `${start}-${end}秒`,
      action: action || `${start}-${end}秒：按用户时间轴推进画面`,
      camera: getTimelineCameraFallback(beats.length),
      risk: caption ? "Caption is script context only; do not render readable text in generated frames." : "",
    });
  }
  if (!beats.length) return buildEditableStoryBeats(cleanScript);
  const fallbackBeats = buildEditableStoryBeats(cleanScript);
  while (beats.length < 3) {
    const fallback = fallbackBeats[beats.length] || fallbackBeats[0];
    beats.push({
      ...fallback,
      id: `beat_${beats.length + 1}`,
    });
  }
  return beats;
}

function buildEditableStoryBeats(text: string, fallbackBeats: StoryBeat[] = []): StoryBeat[] {
  const parts = splitStoryIntentIntoBeats(text);
  return STORY_BEAT_FALLBACKS.map((fallback, index) => {
    const previous = fallbackBeats[index];
    const action = parts[index] || previous?.action || previous?.beat || sanitizeProductText(text) || fallback.beat;
    return {
      id: previous?.id || `beat_${index + 1}`,
      beat: previous?.beat || fallback.beat,
      action,
      camera: previous?.camera || fallback.camera,
      risk: previous?.risk || "",
    };
  });
}

function buildManualTimelineStoryIntent(script: string, productType: string, motionMode: MotionMode): StoryIntent {
  const cleanScript = truncateTextByChars(compactManualTimelineText(script), MANUAL_TIMELINE_SCRIPT_MAX_CHARS);
  const beats = parseManualTimelineBeats(cleanScript);
  const firstScene = beats[0]?.action?.split("\n")[0] || "按用户手写时间轴推进画面";
  return {
    storyTitle: "手写时间轴脚本",
    storyIntent: [
      "USER-SUPPLIED TIMELINE SCRIPT. Preserve the user's exact sequence, timing, character entrance order, comic beats, and caption intent as the source of truth.",
      cleanScript,
      "Caption/subtitle lines are script and post-production overlay context only; image and video generation must not render readable text inside the scene.",
    ].join("\n\n"),
    sceneAnchor: firstScene,
    motionMode,
    productType,
    stableProductName: productType,
    beats,
    riskNotes: ["captions are overlay context only", "preserve product consistency from the four views", "do not render readable in-scene text"],
    model: "manual-timeline-script",
    upstreamUrl: "local://manual-timeline-script",
  };
}

const VIDEO_PROVIDER_DURATION_CAPS: Record<ApiSettings["videoProvider"], { min: number; max: number; note: string }> = {
  wisech: { min: 4, max: 15, note: "Wisech / 云书 Seedance 2.0 按官方区间可提交 4-15 秒；实际成片仍以上游返回为准。" },
};

const steps: Array<{ id: StepId; label: string; shortLabel: string; description: string; icon: LucideIcon }> = [
  { id: "upload", label: "上传产品四视图", shortLabel: "上传", description: "正面、左侧、右侧、背面四张核心图", icon: Upload },
  { id: "storyboard", label: "脚本分镜", shortLabel: "分镜", description: "粘贴脚本，确认首帧分镜", icon: ClipboardCheck },
  { id: "video", label: "生成视频", shortLabel: "视频", description: "选择模型后直接提交", icon: Film },
];
const visibleSteps = steps;

const initialSlots: UploadSlot[] = [
  { id: "front", label: "正面图", badge: "FRONT", hint: "正面轮廓、主要图案、核心组件、脚部比例", accept: "image/*", fileName: "", localUrl: "" },
  { id: "leftSide", label: "左侧图", badge: "LEFT", hint: "左侧厚度、侧面组件、阀门/缝线可见性", accept: "image/*", fileName: "", localUrl: "" },
  { id: "rightSide", label: "右侧图", badge: "RIGHT", hint: "右侧厚度、侧面图案、阀门方向和边缘结构", accept: "image/*", fileName: "", localUrl: "" },
  { id: "back", label: "背面图", badge: "BACK", hint: "背面轮廓、中轴结构、拉链/尾部/阀门归位", accept: "image/*", fileName: "", localUrl: "" },
];

const SHARK_INFLATABLE_TYPE = "鲨鱼充气服";
const BULL_INFLATABLE_TYPE = "奶牛充气服";
const GRAY_MOUSE_INFLATABLE_TYPE = "灰色老鼠充气服";
const FROG_INFLATABLE_TYPE = "青蛙充气服";
const SUMO_INFLATABLE_TYPE = "相扑充气服";
const SHARK_INFLATABLE_PRESET_VIEWS = [
  { slotId: "front", fileName: "shark-front.png", localUrl: "/product-presets/shark-inflatable/front.png" },
  { slotId: "leftSide", fileName: "shark-left.png", localUrl: "/product-presets/shark-inflatable/left.png" },
  { slotId: "rightSide", fileName: "shark-right.png", localUrl: "/product-presets/shark-inflatable/right.png" },
  { slotId: "back", fileName: "shark-back.jpg", localUrl: "/product-presets/shark-inflatable/back.jpg" },
] as const;

const BULL_INFLATABLE_PRESET_VIEWS = [
  { slotId: "front", fileName: "bull-front.jpg", localUrl: "/product-presets/bull-inflatable/front.jpg" },
  { slotId: "leftSide", fileName: "bull-left.jpg", localUrl: "/product-presets/bull-inflatable/left.jpg" },
  { slotId: "rightSide", fileName: "bull-right.jpg", localUrl: "/product-presets/bull-inflatable/right.jpg" },
  { slotId: "back", fileName: "bull-back.jpg", localUrl: "/product-presets/bull-inflatable/back.jpg" },
] as const;

const GRAY_MOUSE_INFLATABLE_PRESET_VIEWS = [
  { slotId: "front", fileName: "gray-mouse-front.jpg", localUrl: "/product-presets/gray-mouse-inflatable/front.jpg" },
  { slotId: "leftSide", fileName: "gray-mouse-left.jpg", localUrl: "/product-presets/gray-mouse-inflatable/left.jpg" },
  { slotId: "rightSide", fileName: "gray-mouse-right.jpg", localUrl: "/product-presets/gray-mouse-inflatable/right.jpg" },
  { slotId: "back", fileName: "gray-mouse-back.jpg", localUrl: "/product-presets/gray-mouse-inflatable/back.jpg" },
] as const;

const FROG_INFLATABLE_PRESET_VIEWS = [
  { slotId: "front", fileName: "frog-front.jpg", localUrl: "/product-presets/frog-inflatable/front.jpg" },
  { slotId: "leftSide", fileName: "frog-left.jpg", localUrl: "/product-presets/frog-inflatable/left.jpg" },
  { slotId: "rightSide", fileName: "frog-right.jpg", localUrl: "/product-presets/frog-inflatable/right.jpg" },
  { slotId: "back", fileName: "frog-back.jpg", localUrl: "/product-presets/frog-inflatable/back.jpg" },
] as const;

const FROG_INFLATABLE_SUPPORT_VIEWS = [
  { fileName: "frog-support-right-alt.jpg", localUrl: "/product-presets/frog-inflatable/support-right-alt.jpg" },
] as const;

const SUMO_INFLATABLE_PRESET_VIEWS = [
  { slotId: "front", fileName: "sumo-front.jpg", localUrl: "/product-presets/sumo-inflatable/front.jpg" },
  { slotId: "leftSide", fileName: "sumo-left.jpg", localUrl: "/product-presets/sumo-inflatable/left.jpg" },
  { slotId: "rightSide", fileName: "sumo-right.jpg", localUrl: "/product-presets/sumo-inflatable/right.jpg" },
  { slotId: "back", fileName: "sumo-back.jpg", localUrl: "/product-presets/sumo-inflatable/back.jpg" },
] as const;

const SUMO_INFLATABLE_SUPPORT_VIEWS = [
  { fileName: "sumo-support-rear-valve.jpg", localUrl: "/product-presets/sumo-inflatable/support-rear-valve.jpg" },
] as const;

const SHARK_INFLATABLE_LOCK_NODES: LockNode[] = [
  {
    id: "front-window-zipper",
    label: "正面透明脸窗 / 中线拉链",
    code: "Front_Window_Zipper",
    detail: "保留白色腹部上方的小号浅弧形横向梯形透明脸窗、透明反光材质、脸窗下方垂直拉链和中轴缝线；脸窗不能变成大矩形、宽面罩、嘴巴、牙齿或笑脸。",
    confidence: 0.98,
    critical: true,
    confirmed: true,
  },
  {
    id: "side-eye-gills",
    label: "侧面黑眼睛 / 黑色鳃线",
    code: "Side_Eye_Gill_Stripes",
    detail: "侧面必须保留 1 个黑色圆眼和 5 条黑色弧形鳃线，不能省略、变淡、变形或移动位置。",
    confidence: 0.85,
    critical: true,
    confirmed: true,
  },
  {
    id: "orange-valve-side",
    label: "侧边橙色鼓风阀",
    code: "Orange_Side_Blower_Valve",
    detail: "保留侧腰橙色圆形鼓风阀、橙色环、圆形网格和所在高度，不能被手臂或场景遮掉。",
    confidence: 0.92,
    critical: true,
    confirmed: true,
  },
  {
    id: "tail-fin-back-seam",
    label: "背部尾鳍 / 背部竖缝",
    code: "Back_Tail_Fin_Seam",
    detail: "尾鳍只能位于背部中轴线，不能移动到侧腰、正面白肚或画面可见侧面；保留背部竖向缝线、后背纯蓝色块和底部黑色鞋底露出。",
    confidence: 0.9,
    critical: true,
    confirmed: true,
  },
  {
    id: "view-topology",
    label: "视角拓扑 / 细节归位",
    code: "View_Topology_Detail_Placement",
    detail: "正面白肚、透明窗、拉链只属于正面；黑眼睛、5 条鳃线、橙色阀门只属于侧面；背部尾鳍只属于背面。看不见的细节应隐藏，不能挪到错误位置。",
    confidence: 0.97,
    critical: true,
    confirmed: true,
  },
  {
    id: "fabric-color-silhouette",
    label: "蓝白色块 / 人体体型包络",
    code: "Moderate_Inflation_Silhouette",
    detail: "锁定四视图共同的人穿服体型和偏青的柔和蓝色尼龙：充气外壳只比真人肩宽和躯干略宽，整体偏扁、偏软、略微蔫皱，不能变成高饱和亮蓝、巨大圆顶头、竖直胶囊身体、桶状身体、站立气球或吉祥物外壳；保留上宽下收、腰胯收窄、两条独立裤腿、脚套褶皱和黑鞋露出。两侧手鳍必须贴近身体自然下垂或小幅外展，不能横向拉平成飞机翅膀、滑翔翼或超宽大鳍。",
    confidence: 0.95,
    critical: true,
    confirmed: true,
  },
  {
    id: "body-volume-envelope",
    label: "体积包络 / 身宽比例",
    code: "Body_Volume_Envelope",
    detail: "正面白色腹部宽度约占身体总宽 45%-55%；头部宽高、躯干宽度、手鳍长度和侧面厚度不得超过四视图参考；身体要接近轻度欠充气的柔软尼龙套服，侧面躯干是可穿戴服厚度，不是竖直胶囊、圆柱气球或饱满鱼雷；背面不能膨胀成无结构圆柱。",
    confidence: 0.93,
    critical: true,
    confirmed: true,
  },
  {
    id: "shark-underinflated-fin-color-hard-lock",
    label: "Shark volume / color / fin hard lock",
    code: "Shark_Underinflated_Fin_Color_Hard_Lock",
    detail:
      "Hard fail if the shark becomes a huge vertical capsule, torpedo, cylinder balloon, giant mascot shell, glossy display prop, vivid/electric/cobalt blue body, or a fully taut overinflated tube. It must stay muted cyan-blue nylon, human-scale, lightly underinflated, softer, flatter, slightly sagging and wrinkled. For a front camera, preserve the uploaded front-view outline and imperfect nylon contour instead of making a cleaner symmetric studio silhouette; keep the blue side border modest, the long white belly panel dominant, and the waist-to-leg transition close to the reference. The side hand fins must stay short, fabric-soft, close to the body or only mildly angled outward; never stretch into horizontal airplane wings, glider wings, cape wings, huge paddles, manta-ray wings, or an extra-wide silhouette.",
    confidence: 0.99,
    critical: true,
    confirmed: true,
  },
];

const BULL_INFLATABLE_LOCK_NODES: LockNode[] = [
  {
    id: "cow-head-horns-ears",
    label: "奶牛头部 / 双角 / 双耳",
    code: "Cow_Head_Horns_Ears",
    detail: "保留白色大圆奶牛头、顶部小黑毛撮、两只奶白色向上弯角、两侧黑色外耳和粉色内耳；不能变成真实牛头、公牛头盔、毛绒玩偶或额外耳角结构。",
    confidence: 0.96,
    critical: true,
    confirmed: true,
  },
  {
    id: "cow-face-snout-eyes",
    label: "脸部蓝眼 / 粉鼻口 / 腮红",
    code: "Cow_Face_Snout_Eyes",
    detail: "锁定两只蓝色卡通眼睛、黑色眉毛、粉色圆鼻口、两个黑色鼻孔、黑色微笑线和两侧粉色圆腮红；嘴鼻不能缩小、错位、消失或换成真实动物表情。",
    confidence: 0.95,
    critical: true,
    confirmed: true,
  },
  {
    id: "cow-black-white-patches",
    label: "黑白奶牛斑 / 色块归位",
    code: "Cow_Black_White_Patches",
    detail: "白色充气身体上必须保留不规则黑色奶牛斑，头、躯干、手臂、腿部和背面的斑块密度接近四视图；不能变成纯白、斑马纹、豹纹、统一圆点或重新设计的图案。",
    confidence: 0.93,
    critical: true,
    confirmed: true,
  },
  {
    id: "cow-front-belly-pad",
    label: "正面粉色下腹组件 / 四个小圆点",
    code: "Cow_Front_Belly_Pad",
    detail: "正面下腹中央必须保留粉色圆形凸起下腹组件和四个粉色小圆点，位置在腹部偏下、两腿上方；不能移动到侧面、背面、上身正面，也不能省略或改成口袋装饰。",
    confidence: 0.97,
    critical: true,
    confirmed: true,
  },
  {
    id: "cow-hooves-limbs",
    label: "黑色蹄套 / 四肢比例",
    code: "Cow_Black_Hooves_Limbs",
    detail: "保留黑色蹄形手套和黑色脚蹄套，手臂为短充气袖、腿为分开的宽松裤腿；不能变成人手、人鞋、细腿、额外手臂或动物四足姿态。",
    confidence: 0.91,
    critical: true,
    confirmed: true,
  },
  {
    id: "cow-back-zipper-valve-tail",
    label: "背部拉链 / 橙色阀门 / 白尾黑尖",
    code: "Cow_Back_Zipper_Valve_Tail",
    detail: "背面必须保留头背到躯干的中轴竖向拉链/缝线、右后侧橙色圆形鼓风阀、臀部中轴向下的白色尾巴和黑色尾尖；这些结构只在背面或物理可见侧出现，不能挪到正面。",
    confidence: 0.96,
    critical: true,
    confirmed: true,
  },
  {
    id: "cow-human-scale-envelope",
    label: "155-190cm 人体穿戴体型 / 不过度鼓胀",
    code: "Cow_Human_Scale_Envelope",
    detail: "锁定四视图共同的 155-190cm 真人穿戴比例：圆润但仍是人体站姿，头和躯干只比真人略宽，腰胯和分腿清楚；不能膨胀成巨大吉祥物、展示气球、圆柱身体或真实动物身体。",
    confidence: 0.98,
    critical: true,
    confirmed: true,
  },
  {
    id: "cow-view-topology",
    label: "视角拓扑 / 奶牛组件归位",
    code: "Cow_View_Topology_Placement",
    detail: "正面拥有脸部、粉色下腹组件和前身斑块；侧面显示鼻口凸出、侧身厚度、手臂和侧身斑块；背面拥有拉链、橙色阀门和尾巴。看不见的结构自然隐藏，不能为了展示挪位。",
    confidence: 0.97,
    critical: true,
    confirmed: true,
  },
];

const GRAY_MOUSE_INFLATABLE_LOCK_NODES: LockNode[] = [
  {
    id: "mouse-head-face",
    label: "灰鼠头脸 / 透明脸窗 / 鼻口",
    code: "Mouse_Head_Face_Window_Snout",
    detail: "保留浅灰色老鼠头部、两只圆耳、米色耳内和米色鼻口区域、突出的灰色鼻嘴、黑色张口和棕色卡通眼睛；脸部窗口和鼻嘴形状不能改成兔子、熊、猫、真实老鼠或通用吉祥物表情。",
    confidence: 0.95,
    critical: true,
    confirmed: true,
  },
  {
    id: "mouse-belly-tail",
    label: "米色腹部 / 米黄尾巴",
    code: "Mouse_Cream_Belly_Tail",
    detail: "正面必须保留大块米色椭圆腹部；侧面和背面必须保留米黄尾巴，尾巴从后腰/臀部位置伸出，不能移动到正面腹部、手臂或头顶，也不能变成细真实鼠尾。",
    confidence: 0.96,
    critical: true,
    confirmed: true,
  },
  {
    id: "mouse-back-zipper-valve",
    label: "背部拉链 / 绿色鼓风阀",
    code: "Mouse_Back_Zipper_Green_Valve",
    detail: "背面中轴拉链、后背缝线和绿色圆形鼓风阀必须按背视图归位；正面镜头不可把绿色阀门或背部拉链挪到腹部或上身正面。",
    confidence: 0.94,
    critical: true,
    confirmed: true,
  },
  {
    id: "mouse-human-envelope",
    label: "灰鼠人体穿戴比例 / 柔软褶皱",
    code: "Mouse_Human_Scale_Soft_Envelope",
    detail: "保持真人穿戴的中低充气体型：浅灰外壳只比人体略宽，腰胯、分腿、脚套和布料褶皱清楚；不能变成巨大圆头老鼠、毛绒玩具、真实动物、圆柱气球或过度饱满吉祥物。",
    confidence: 0.97,
    critical: true,
    confirmed: true,
  },
  {
    id: "mouse-view-topology",
    label: "灰鼠视角拓扑 / 组件归位",
    code: "Mouse_View_Topology_Placement",
    detail: "正面拥有脸、米色腹部和正面轮廓；侧面显示厚度、尾巴边缘和侧身结构；背面拥有拉链、绿色阀门和尾巴根部。看不见的组件隐藏，不能为了展示而挪位。",
    confidence: 0.97,
    critical: true,
    confirmed: true,
  },
];

const FROG_INFLATABLE_LOCK_NODES: LockNode[] = [
  {
    id: "frog-face-window-eyes",
    label: "青蛙脸部 / 小脸窗 / 顶部凸眼",
    code: "Frog_Face_Window_Raised_Eyes",
    detail: "保留绿色青蛙头、顶部两只凸起蛙眼、米色脸部区域、小号人脸窗口和黑色嘴部横带；脸窗不能变成大透明罩，嘴不能变成牙齿、笑脸或真实青蛙嘴。",
    confidence: 0.96,
    critical: true,
    confirmed: true,
  },
  {
    id: "frog-scarf-belly-spots",
    label: "蓝色围巾 / 米色腹部 / 黑色斑点",
    code: "Frog_Blue_Scarf_Cream_Belly_Black_Spots",
    detail: "必须保留颈部蓝色围巾、正面米色腹部、绿色外壳上的黑色斑点和斑点密度；不能改成纯绿青蛙、其他围巾颜色、统一圆点或重新设计图案。",
    confidence: 0.95,
    critical: true,
    confirmed: true,
  },
  {
    id: "frog-webbed-limbs",
    label: "蛙手蛙脚 / 分腿比例",
    code: "Frog_Webbed_Hands_Feet",
    detail: "保留青蛙手部和脚部的蹼状造型、宽松裤腿和脚套落地关系；不能变成人手、人鞋、细腿、真实蛙四足姿态或额外肢体。",
    confidence: 0.92,
    critical: true,
    confirmed: true,
  },
  {
    id: "frog-back-zipper-valve",
    label: "背部黑色脊线 / 拉链 / 橙色阀门",
    code: "Frog_Back_Spine_Zipper_Orange_Valve",
    detail: "背面必须保留黑色脊柱式图案、背部拉链/竖缝、围巾后摆和橙色鼓风阀；这些后背结构只在背面或物理可见侧出现，不能挪到正面腹部。",
    confidence: 0.95,
    critical: true,
    confirmed: true,
  },
  {
    id: "frog-human-envelope",
    label: "青蛙人体穿戴体型 / 不过度鼓胀",
    code: "Frog_Human_Scale_Envelope",
    detail: "保持真人穿戴的中低充气比例：身体圆润但仍有人体站姿、腰胯和分腿，不得膨胀成巨大圆形青蛙头、展示气模、毛绒玩偶或真实动物。",
    confidence: 0.97,
    critical: true,
    confirmed: true,
  },
  {
    id: "frog-view-topology",
    label: "青蛙视角拓扑 / 组件归位",
    code: "Frog_View_Topology_Placement",
    detail: "正面显示脸窗、米色腹部、蓝围巾和蛙脚；侧面显示斑点、侧厚度和手脚；背面显示黑色脊线、拉链、阀门和围巾后摆。不可混贴到同一个面。",
    confidence: 0.97,
    critical: true,
    confirmed: true,
  },
];

const SUMO_INFLATABLE_LOCK_NODES: LockNode[] = [
  {
    id: "sumo-front-body-belt",
    label: "相扑正面身体 / 黑色腰带兜裆",
    code: "Sumo_Front_Body_Mawashi",
    detail: "保留米肉色充气身体、黑色腰带/相扑兜裆、正面黑色垂片、简单上身线条和肚脐点；不能改成武士服、胖娃娃、普通肌肉人或重新设计的衣服。",
    confidence: 0.96,
    critical: true,
    confirmed: true,
  },
  {
    id: "sumo-head-cap",
    label: "头部 / 黑色发髻帽",
    code: "Sumo_Head_Black_Cap",
    detail: "保留圆润头部和顶部黑色发髻/帽状结构，头脸简化为产品图的卡通相扑样式；不能新增真实五官、头发、头盔、胡须或复杂表情。",
    confidence: 0.9,
    critical: true,
    confirmed: true,
  },
  {
    id: "sumo-side-t-silhouette",
    label: "侧面宽 T 形 / 腰带系结",
    code: "Sumo_Side_T_Silhouette_Belt_Ties",
    detail: "侧面必须保持宽 T 形充气轮廓、张开的短臂、侧向厚度和黑色腰带侧边系结；不能变瘦、变成长袍、变成球形胖人或丢失侧面腰带结构。",
    confidence: 0.94,
    critical: true,
    confirmed: true,
  },
  {
    id: "sumo-back-zipper-valve",
    label: "背部拉链 / 橙色阀门",
    code: "Sumo_Back_Zipper_Orange_Valve",
    detail: "背面必须保留中轴拉链/竖缝、黑色后腰带/后兜裆和橙色圆形鼓风阀；橙色阀门不能被移到正面肚子或上身正面，拉链不能出现在正面。",
    confidence: 0.96,
    critical: true,
    confirmed: true,
  },
  {
    id: "sumo-human-envelope",
    label: "相扑人体穿戴比例 / 低中充气",
    code: "Sumo_Human_Scale_Envelope",
    detail: "保持真人穿戴的中低充气外壳：身体比人体宽但仍可见站姿、分腿、脚部落地和软布褶皱；不能鼓成巨大展示气球、真实相扑选手、毛绒玩具或全圆桶体。",
    confidence: 0.97,
    critical: true,
    confirmed: true,
  },
  {
    id: "sumo-view-topology",
    label: "相扑视角拓扑 / 组件归位",
    code: "Sumo_View_Topology_Placement",
    detail: "正面拥有黑色腰带兜裆、上身简线和肚脐；侧面拥有厚度、T 形手臂和腰带系结；背面拥有拉链、橙色阀门和后腰带。看不见的结构隐藏，不挪位。",
    confidence: 0.97,
    critical: true,
    confirmed: true,
  },
];

const GENERIC_INFLATABLE_LOCK_NODES: LockNode[] = [
  {
    id: "generic-shape-envelope",
    label: "人体穿戴体型 / 充气体积",
    code: "Generic_Human_Scale_Envelope",
    detail: "锁定上传四视图共同的人体穿戴尺度、头身比例、肩宽、腰胯、分腿和脚部落地关系；不能变成巨大吉祥物、展示气球、真实动物或重新设计的角色。",
    confidence: 0.92,
    critical: true,
    confirmed: true,
  },
  {
    id: "generic-component-placement",
    label: "组件位置 / 视角归位",
    code: "Generic_Component_Placement",
    detail: "每个可见组件、图案、阀门、拉链、尾部、脸部或装饰只能留在四视图定义的位置；看不见的结构自然隐藏，不能为了展示挪到错误表面。",
    confidence: 0.92,
    critical: true,
    confirmed: true,
  },
  {
    id: "generic-material-fabric",
    label: "材质褶皱 / 色块边界",
    code: "Generic_Material_Color_Boundary",
    detail: "保留充气尼龙材质、褶皱、缝线、色块边界和局部细节密度；不能抹平成塑料、毛绒、真实皮毛或干净 CGI 角色。",
    confidence: 0.88,
    critical: true,
    confirmed: true,
  },
];

function getAirHardwareMaterialLockNodes(productType: string): LockNode[] {
  const productHardwareDetail =
    productType === SHARK_INFLATABLE_TYPE
      ? "鲨鱼橙色鼓风阀/进气口/出气口/泵口只能位于阀门侧腰侧面，保留橙色环、圆形网格/盖帽、参考高度和方向；正面看不见时自然隐藏，不能挪到白肚、透明脸窗、正面拉链、尾鳍或鳃线。"
      : productType === BULL_INFLATABLE_TYPE
        ? "奶牛橙色鼓风阀/进气口/出气口/泵口只能位于右后侧/背侧，和背部中轴拉链、白尾黑尖保持正确相对位置；不能挪到粉色下腹组件、白肚、鼻口或脸部。"
        : productType === GRAY_MOUSE_INFLATABLE_TYPE
          ? "灰鼠绿色鼓风阀/进气口/出气口/泵口只能位于后背/背侧，和背部中轴拉链、米黄尾巴根部保持正确相对位置；不能挪到米色腹部、鼻嘴、耳朵或手臂。"
          : productType === FROG_INFLATABLE_TYPE
            ? "青蛙橙色鼓风阀/进气口/出气口/泵口只能位于背部黑色脊线/拉链附近的后背面；不能挪到米色腹部、蓝围巾、脸窗、嘴带、手脚或斑点上。"
            : productType === SUMO_INFLATABLE_TYPE
              ? "相扑橙色鼓风阀/进气口/出气口/泵口只能位于背面/后侧，并按后阀辅助图保留与后腰带、拉链、米肉色背面褶皱的间距；不能挪到正面肚子、上身简线、肚脐或兜裆布。"
              : "阀门、鼓风阀、进气口、出气口、泵口、充放气口、风扇网格、盖帽和拉链只能按四视图定义的表面、数量、颜色、尺寸和高度归位。";

  return [
    {
      id: "air-hardware-placement",
      label: "进出气口 / 泵口 / 鼓风阀归位",
      code: "Air_Hardware_Pump_Port_Placement",
      detail: `${productHardwareDetail} 阀门/泵口是实体硬件，不是装饰；不能新增、复制、换色、缩放、简化、遮挡或为了让它可见而挪位。`,
      confidence: 0.99,
      critical: true,
      confirmed: true,
    },
    {
      id: "inflatable-material-details",
      label: "薄尼龙材质 / 褶皱 / 拉链齿",
      code: "Inflatable_Material_Wrinkle_Zipper_Detail",
      detail: "保留薄尼龙/PVC 充气布料质感、局部松弛、压力褶皱、缝线、色块边缘针脚、拉链齿、阀门环和网格/盖帽细节；不能抹平成光滑塑料、橡胶玩具、毛绒、真实皮毛、真人皮肤或干净 CGI 吉祥物外壳。",
      confidence: 0.98,
      critical: true,
      confirmed: true,
    },
  ];
}

const initialNodes = SHARK_INFLATABLE_LOCK_NODES;

const productPresets: readonly ProductPreset[] = [
  {
    productType: SHARK_INFLATABLE_TYPE,
    views: SHARK_INFLATABLE_PRESET_VIEWS,
    supportViews: [],
    lockNodes: SHARK_INFLATABLE_LOCK_NODES,
  },
  {
    productType: BULL_INFLATABLE_TYPE,
    views: BULL_INFLATABLE_PRESET_VIEWS,
    supportViews: [],
    lockNodes: BULL_INFLATABLE_LOCK_NODES,
  },
  {
    productType: GRAY_MOUSE_INFLATABLE_TYPE,
    views: GRAY_MOUSE_INFLATABLE_PRESET_VIEWS,
    supportViews: [],
    lockNodes: GRAY_MOUSE_INFLATABLE_LOCK_NODES,
  },
  {
    productType: FROG_INFLATABLE_TYPE,
    views: FROG_INFLATABLE_PRESET_VIEWS,
    supportViews: FROG_INFLATABLE_SUPPORT_VIEWS,
    lockNodes: FROG_INFLATABLE_LOCK_NODES,
  },
  {
    productType: SUMO_INFLATABLE_TYPE,
    views: SUMO_INFLATABLE_PRESET_VIEWS,
    supportViews: SUMO_INFLATABLE_SUPPORT_VIEWS,
    lockNodes: SUMO_INFLATABLE_LOCK_NODES,
  },
] as const;

function getProductPreset(productType: string) {
  return productPresets.find((preset) => preset.productType === productType);
}

function cloneLockNodes(nodes: readonly LockNode[]) {
  return nodes.map((node) => ({ ...node }));
}

function getProductLockNodes(productType: string) {
  const preset = getProductPreset(productType);
  return cloneLockNodes([...(preset?.lockNodes || GENERIC_INFLATABLE_LOCK_NODES), ...getAirHardwareMaterialLockNodes(productType)]).map(sanitizeLockNode);
}

function createPresetSlots(productType: string): UploadSlot[] {
  const preset = getProductPreset(productType);
  if (!preset) return initialSlots;
  return initialSlots.map((slot) => {
    const view = preset.views.find((item) => item.slotId === slot.id);
    return view
      ? { ...slot, fileName: view.fileName, localUrl: view.localUrl, dataUrl: "", source: "preset" }
      : slot;
  });
}

const defaultApiSettings: ApiSettings = {
  imagePath: "",
  imageModel: DEFAULT_IMAGE_MODEL,
  videoProvider: "wisech",
  videoBaseUrl: DEFAULT_VIDEO_BASE_URL,
  videoPath: "",
  videoApiKey: "",
  videoModel: DEFAULT_VIDEO_MODEL,
  promptModel: DEFAULT_PROMPT_MODEL,
};

const VIDEO_MODEL_OPTIONS: Record<ApiSettings["videoProvider"], readonly { value: string; label: string }[]> = {
  wisech: [
    { value: "yunshu-2-0-260128-1080p", label: "\u4e91\u4e66 Seedance 2.0 - 1080p - \u00a52.48/\u79d2 - yunshu-2-0-260128-1080p" },
    { value: "yunshu-2-0-260128-720p", label: "\u4e91\u4e66 Seedance 2.0 - 720p - \u00a50.99/\u79d2 - yunshu-2-0-260128-720p" },
  ],
} as const;

const VIDEO_PROVIDER_OPTIONS = [
  { value: "wisech", label: "Wisech / 云书 Seedance", baseUrl: "https://ai.wisech.com/v1", model: DEFAULT_VIDEO_MODEL },
] as const;

function getVideoProviderOption(value: ApiSettings["videoProvider"]) {
  return VIDEO_PROVIDER_OPTIONS.find((provider) => provider.value === value) || VIDEO_PROVIDER_OPTIONS[0];
}

function getVideoDurationCap(provider: ApiSettings["videoProvider"]) {
  return VIDEO_PROVIDER_DURATION_CAPS[provider] || VIDEO_PROVIDER_DURATION_CAPS.wisech;
}

function getVideoModelDurationCap(provider: ApiSettings["videoProvider"], model: string) {
  if (provider === "wisech" && /1-5|1\.5/i.test(model)) {
    return { min: 4, max: 12, note: "Seedance 1.5 Pro 官方 duration 区间为 4-12 秒，或设置为 -1 由模型自选。" };
  }
  if (provider === "wisech") {
    return { min: 4, max: 15, note: "Seedance 2.0 系列官方 duration 区间为 4-15 秒，或设置为 -1 由模型自选。" };
  }
  return getVideoDurationCap(provider);
}

function getVideoModelOptions(provider: ApiSettings["videoProvider"]) {
  return VIDEO_MODEL_OPTIONS[provider] || VIDEO_MODEL_OPTIONS.wisech;
}

function getDefaultVideoModel(provider: ApiSettings["videoProvider"]) {
  return getVideoProviderOption(provider).model || getVideoModelOptions(provider)[0]?.value || "";
}

function getVideoModelResolution(provider: ApiSettings["videoProvider"], model: string) {
  if (provider === "wisech" && /720p/i.test(model)) return "720p";
  return "1080p";
}

function isVideoModelAllowed(provider: ApiSettings["videoProvider"], model: string) {
  return getVideoModelOptions(provider).some((option) => option.value === model);
}

function clampVideoDuration(provider: ApiSettings["videoProvider"], value: number) {
  const cap = getVideoDurationCap(provider);
  const numeric = Number.isFinite(value) ? value : cap.min;
  return Math.min(cap.max, Math.max(cap.min, Math.round(numeric)));
}

function clampVideoDurationForModel(provider: ApiSettings["videoProvider"], model: string, value: number) {
  const cap = getVideoModelDurationCap(provider, model);
  const numeric = Number.isFinite(value) ? value : cap.min;
  return Math.min(cap.max, Math.max(cap.min, Math.round(numeric)));
}

const productAssetPlan: ProductAsset[] = [
  {
    id: "PRODUCT_SHARK_001",
    name: "鲨鱼充气服",
    type: "充气服",
    viewMode: "四视图",
    viewUrls: SHARK_INFLATABLE_PRESET_VIEWS.map((view) => view.localUrl),
    supportViewUrls: [],
    lockedNodeCodes: getProductLockNodes(SHARK_INFLATABLE_TYPE).map((node) => node.code),
    updatedAt: "本地预设",
  },
  {
    id: "PRODUCT_BULL_001",
    name: "奶牛充气服",
    type: "充气服",
    viewMode: "四视图",
    viewUrls: BULL_INFLATABLE_PRESET_VIEWS.map((view) => view.localUrl),
    supportViewUrls: [],
    lockedNodeCodes: getProductLockNodes(BULL_INFLATABLE_TYPE).map((node) => node.code),
    updatedAt: "本地预设",
  },
  {
    id: "PRODUCT_GRAY_MOUSE_001",
    name: "灰色老鼠充气服",
    type: "充气服",
    viewMode: "四视图",
    viewUrls: GRAY_MOUSE_INFLATABLE_PRESET_VIEWS.map((view) => view.localUrl),
    supportViewUrls: [],
    lockedNodeCodes: getProductLockNodes(GRAY_MOUSE_INFLATABLE_TYPE).map((node) => node.code),
    updatedAt: "本地预设",
  },
  {
    id: "PRODUCT_FROG_001",
    name: "青蛙充气服",
    type: "充气服",
    viewMode: "四视图",
    viewUrls: FROG_INFLATABLE_PRESET_VIEWS.map((view) => view.localUrl),
    supportViewUrls: FROG_INFLATABLE_SUPPORT_VIEWS.map((view) => view.localUrl),
    lockedNodeCodes: getProductLockNodes(FROG_INFLATABLE_TYPE).map((node) => node.code),
    updatedAt: "本地预设",
  },
  {
    id: "PRODUCT_SUMO_001",
    name: "相扑充气服",
    type: "充气服",
    viewMode: "四视图",
    viewUrls: SUMO_INFLATABLE_PRESET_VIEWS.map((view) => view.localUrl),
    supportViewUrls: SUMO_INFLATABLE_SUPPORT_VIEWS.map((view) => view.localUrl),
    lockedNodeCodes: getProductLockNodes(SUMO_INFLATABLE_TYPE).map((node) => node.code),
    updatedAt: "本地预设",
  },
];

function cn(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(" ");
}

function getStatusMessageTone(message: string): "success" | "info" | "" {
  const text = message.trim();
  if (!text) return "";
  const errorWords = ["没有成功", "没有生成", "失败", "未通过", "不可用", "请先", "暂时", "错误", "异常", "超时", "连不上", "不能"];
  if (errorWords.some((word) => text.includes(word))) return "";
  const successWords = ["成功", "已生成", "生成好了", "已一起更新", "已通过", "已从历史记录载入", "连接正常"];
  if (successWords.some((word) => text.includes(word))) return "success";
  const progressWords = ["已经开始生成", "生成中", "已检查", "任务号"];
  if (progressWords.some((word) => text.includes(word))) return "info";
  return "";
}

function loadApiSettings(): ApiSettings {
  if (typeof window === "undefined") return defaultApiSettings;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return defaultApiSettings;
    const parsed = JSON.parse(saved) as Partial<ApiSettings> & { imageBaseUrl?: unknown; imageApiKey?: unknown };
    delete parsed.imageBaseUrl;
    delete parsed.imageApiKey;
    const merged = { ...defaultApiSettings, ...parsed };
    if (merged.imagePath === "/images/generations") merged.imagePath = "";
    if (merged.videoPath === "/videos/generations") merged.videoPath = "";
    merged.videoProvider = "wisech";
    const provider = getVideoProviderOption("wisech");
    merged.videoBaseUrl = provider.baseUrl;
    const videoModelText = typeof merged.videoModel === "string" ? merged.videoModel.trim() : "";
    if (
      !videoModelText ||
      videoModelText.startsWith("happyhorse-1.0") ||
      videoModelText === "fofo" ||
      videoModelText === "doubao-seedance-2-0-260128" ||
      videoModelText === "doubao-seedance-2-0-fast-260128" ||
      !isVideoModelAllowed(merged.videoProvider, videoModelText)
    ) {
      merged.videoModel = getDefaultVideoModel(merged.videoProvider);
    } else {
      merged.videoModel = videoModelText;
    }
    merged.videoApiKey = "";
    if (
      !merged.promptModel ||
      merged.promptModel === "gpt-4.1-mini" ||
      merged.promptModel === "gpt-5.5" ||
      merged.promptModel === "local-safety-draft"
    ) {
      merged.promptModel = defaultApiSettings.promptModel;
    }
    if (!merged.imageModel || merged.imageModel === "gpt-4.1-mini" || merged.imageModel === "image-2") {
      merged.imageModel = defaultApiSettings.imageModel;
    }
    return merged;
  } catch {
    return defaultApiSettings;
  }
}

function saveApiSettings(settings: ApiSettings) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Local storage can be full when users generate many large assets; the app should keep running.
  }
}

function isHistoryItem(value: unknown): value is HistoryItem {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    (record.type === "分镜" || record.type === "首帧" || record.type === "视频") &&
    typeof record.title === "string" &&
    typeof record.time === "string" &&
    (record.status === "成功" || record.status === "失败" || record.status === "处理中")
  );
}

function formatHistoryTime(date: Date) {
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function loadHistoryItems(): HistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const saved = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];
    const items = parsed
      .filter(isHistoryItem)
      .map((item) => ({ ...item, createdAt: item.createdAt || item.time }))
      .slice(0, MAX_HISTORY_ITEMS);
    const sanitized = items.map(sanitizeHistoryItemForStorage);
    if (JSON.stringify(items) !== JSON.stringify(sanitized)) {
      void Promise.all(items.map(writeHistoryItemAssets)).finally(() => saveHistoryItems(sanitized));
    }
    return sanitized;
  } catch {
    try {
      window.localStorage.removeItem(HISTORY_STORAGE_KEY);
    } catch {
      // Ignore storage cleanup failures.
    }
    return [];
  }
}

function createHistoryItem(
  id: string,
  kind: "firstFrame" | "video",
  status: HistoryItem["status"],
  detail: Partial<HistoryItem> = {},
): HistoryItem {
  const now = new Date();
  return {
    id,
    type: kind === "firstFrame" ? "分镜" : "视频",
    title: kind === "firstFrame" ? "分镜生成" : "视频生成",
    time: formatHistoryTime(now),
    createdAt: now.toISOString(),
    status,
    ...detail,
  };
}

function upsertHistoryItem(items: HistoryItem[], item: HistoryItem): HistoryItem[] {
  return [item, ...items.filter((current) => current.id !== item.id)].slice(0, MAX_HISTORY_ITEMS);
}

function createHistoryAssetRef(id: string, field: (typeof HISTORY_ASSET_FIELDS)[number]) {
  return `${HISTORY_ASSET_REF_PREFIX}${id}:${field}`;
}

function isHistoryAssetRef(value?: string) {
  return typeof value === "string" && value.startsWith(HISTORY_ASSET_REF_PREFIX);
}

function isLargeInlineAsset(value?: string) {
  return typeof value === "string" && value.startsWith("data:");
}

function openHistoryAssetDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(HISTORY_ASSET_DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(HISTORY_ASSET_STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Open history asset storage failed"));
  });
}

async function writeHistoryAsset(ref: string, value: string) {
  if (typeof window === "undefined" || !window.indexedDB) return;
  const db = await openHistoryAssetDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(HISTORY_ASSET_STORE_NAME, "readwrite");
      transaction.objectStore(HISTORY_ASSET_STORE_NAME).put(value, ref);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("Save history asset failed"));
    });
  } finally {
    db.close();
  }
}

async function readHistoryAsset(ref: string) {
  if (typeof window === "undefined" || !window.indexedDB || !isHistoryAssetRef(ref)) return "";
  const db = await openHistoryAssetDb();
  try {
    return await new Promise<string>((resolve) => {
      const transaction = db.transaction(HISTORY_ASSET_STORE_NAME, "readonly");
      const request = transaction.objectStore(HISTORY_ASSET_STORE_NAME).get(ref);
      request.onsuccess = () => resolve(typeof request.result === "string" ? request.result : "");
      request.onerror = () => resolve("");
    });
  } finally {
    db.close();
  }
}

async function writeHistoryItemAssets(item: HistoryItem) {
  await Promise.all(
    HISTORY_ASSET_FIELDS.map(async (field) => {
      const value = item[field];
      if (!isLargeInlineAsset(value)) return;
      await writeHistoryAsset(createHistoryAssetRef(item.id, field), value || "");
    }),
  );
}

async function resolveHistoryItemAssets(item: HistoryItem): Promise<HistoryItem> {
  const next = { ...item };
  await Promise.all(
    HISTORY_ASSET_FIELDS.map(async (field) => {
      const value = next[field];
      if (!isHistoryAssetRef(value)) return;
      const resolved = await readHistoryAsset(value || "");
      if (resolved) next[field] = resolved;
    }),
  );
  return next;
}

function sanitizeHistoryItemForStorage(item: HistoryItem): HistoryItem {
  const next = { ...item };
  for (const field of HISTORY_ASSET_FIELDS) {
    if (isLargeInlineAsset(next[field])) next[field] = createHistoryAssetRef(next.id, field);
  }
  next.productViewUrls = next.productViewUrls?.filter((url) => !isLargeInlineAsset(url));
  next.supportImageUrls = next.supportImageUrls?.filter((url) => !isLargeInlineAsset(url));
  return next;
}

function saveHistoryItems(items: HistoryItem[]) {
  const storedItems = items.slice(0, MAX_HISTORY_ITEMS).map(sanitizeHistoryItemForStorage);
  void Promise.all(items.slice(0, MAX_HISTORY_ITEMS).map(writeHistoryItemAssets)).catch(() => undefined);
  try {
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(storedItems));
  } catch (error) {
    try {
      window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(storedItems.slice(0, 5)));
    } catch {
      try {
        window.localStorage.removeItem(HISTORY_STORAGE_KEY);
      } catch {
        // Ignore storage cleanup failures.
      }
    }
  }
}

function extractTaskId(data: unknown) {
  if (!data || typeof data !== "object") return "";
  const record = data as Record<string, unknown>;
  const nested = record.data && typeof record.data === "object" ? (record.data as Record<string, unknown>) : {};
  const output = record.output && typeof record.output === "object" ? (record.output as Record<string, unknown>) : {};
  const result = record.result && typeof record.result === "object" ? (record.result as Record<string, unknown>) : {};
  const value =
    record.task_id ||
    record.taskId ||
    record.id ||
    record.id_str ||
    nested.task_id ||
    nested.id ||
    nested.id_str ||
    output.task_id ||
    output.taskId ||
    output.id ||
    output.id_str ||
    result.task_id ||
    result.id ||
    result.id_str;
  return typeof value === "string" ? value : "";
}

function extractTaskStatus(data: unknown) {
  if (!data || typeof data !== "object") return "";
  const record = data as Record<string, unknown>;
  const output = record.output && typeof record.output === "object" ? (record.output as Record<string, unknown>) : {};
  const dataRecord = record.data && typeof record.data === "object" ? (record.data as Record<string, unknown>) : {};
  const result = record.result && typeof record.result === "object" ? (record.result as Record<string, unknown>) : {};
  const value =
    record.task_status ||
    record.status ||
    record.taskStatus ||
    output.task_status ||
    output.status ||
    dataRecord.task_status ||
    dataRecord.status ||
    result.task_status ||
    result.status ||
    result.taskStatus;
  return typeof value === "string" ? value.toUpperCase() : "";
}

function findUrlByKey(value: unknown, keyPattern: RegExp): string {
  if (!value || typeof value !== "object") return "";
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findUrlByKey(item, keyPattern);
      if (found) return found;
    }
    return "";
  }
  const record = value as Record<string, unknown>;
  for (const [key, child] of Object.entries(record)) {
    if (/^(upstreamUrl|requestUrl|taskUrl|statusUrl)$/i.test(key)) continue;
    if (typeof child === "string" && keyPattern.test(key) && /^https?:\/\//i.test(child)) {
      return child;
    }
    const found = findUrlByKey(child, keyPattern);
    if (found) return found;
  }
  return "";
}

function extractVideoUrl(data: unknown) {
  if (!data || typeof data !== "object") return "";
  const direct = findUrlByKey(data, /^(video_url|videoUrl|official_video_url|stable_video_url|output_video|file_url|result_url|content_url)$/i);
  if (direct) return direct;
  const fallback = findUrlByKey(data, /^url$/i);
  if (/\.(mp4|mov|webm|m3u8)(\?|$)/i.test(fallback)) return fallback;
  return "";
}

function extractImageUrl(data: unknown) {
  if (!data || typeof data !== "object") return "";
  const record = data as Record<string, unknown>;
  const dataValue = record.data;
  if (Array.isArray(dataValue)) {
    const first = dataValue[0] as Record<string, unknown> | undefined;
    if (typeof first?.url === "string") return first.url;
    if (typeof first?.b64_json === "string") {
      const mimeType = getBase64ImageMime(first.b64_json);
      if (!mimeType) throw new Error("上游这次没有返回真正的图片，而是返回了网页验证内容。请稍后再试；如果连续出现，请让管理员更换图片上游。");
      return `data:${mimeType};base64,${first.b64_json}`;
    }
  }
  const dashScopeUrl = findUrlByKey(record.output, /^(image|url|image_url|imageUrl|result_url)$/i);
  if (dashScopeUrl) return dashScopeUrl;
  const imageUrl = findUrlByKey(record, /^(image|image_url|imageUrl|result_url)$/i);
  if (imageUrl) return imageUrl;
  if (typeof record.url === "string") return record.url;
  if (typeof record.image_url === "string") return record.image_url;
  return "";
}

function getBase64ImageMime(base64: string) {
  try {
    const binary = atob(base64.slice(0, 64));
    const bytes = Array.from(binary, (char) => char.charCodeAt(0));
    if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
    if (bytes.length >= 12 && binary.slice(0, 4) === "RIFF" && binary.slice(8, 12) === "WEBP") return "image/webp";
    if (/^GIF8[79]a/.test(binary.slice(0, 6))) return "image/gif";
  } catch {
    return "";
  }
  return "";
}

function formatDiagnosticMessage(record: Record<string, unknown>) {
  const diagnostic = record.diagnostic;
  if (!diagnostic || typeof diagnostic !== "object") return "";
  const item = diagnostic as Record<string, unknown>;
  const parts = [
    typeof item.traceId === "string" ? `trace=${item.traceId}` : "",
    typeof item.stage === "string" ? `stage=${item.stage}` : "",
    Number.isFinite(Number(item.upstreamStatus)) ? `status=${Number(item.upstreamStatus)}` : "",
    typeof item.upstreamErrorCode === "string" && item.upstreamErrorCode ? `code=${item.upstreamErrorCode}` : "",
    typeof item.upstreamRequestId === "string" && item.upstreamRequestId ? `request=${item.upstreamRequestId}` : "",
    typeof item.upstreamMessage === "string" && item.upstreamMessage ? `msg=${item.upstreamMessage.slice(0, 240)}` : "",
    typeof item.upstreamUrl === "string" && item.upstreamUrl ? `url=${item.upstreamUrl}` : "",
  ].filter(Boolean);
  return parts.length ? `\n诊断：${parts.join("；")}` : "";
}

function extractErrorMessage(data: unknown, status = 0) {
  const fallback =
    status === 404
      ? "页面没有接到后端接口。请确认本项目的 API 服务正在运行，并且前端代理或线上路由已经把 /api 指到后端。"
      : "这次请求没有成功，请稍后再试。";
  if (!data || typeof data !== "object") return fallback;
  const record = data as Record<string, unknown>;
  const diagnosticMessage = formatDiagnosticMessage(record);
  const error = record.error;
  if (typeof error === "string") return `${toUserMessage(error)}${diagnosticMessage}`;
  if (error && typeof error === "object") {
    const errorRecord = error as Record<string, unknown>;
    if (typeof errorRecord.message === "string") return `${toUserMessage(errorRecord.message)}${diagnosticMessage}`;
    if (typeof errorRecord.code === "string") return `${toUserMessage(errorRecord.code)}${diagnosticMessage}`;
  }
  if (typeof record.message === "string") return `${toUserMessage(record.message)}${diagnosticMessage}`;
  if (typeof record.code === "string") return `${toUserMessage(record.code)}${diagnosticMessage}`;
  if (typeof record.raw === "string" && record.raw.includes("Error code 524")) {
    return "这次处理时间太久了，请稍后再试。";
  }
  return status === 404 ? fallback : "这次请求没有成功，请稍后再试；如果一直失败，请让管理员检查服务配置。";
}

async function readApiResponseBody(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: text.slice(0, 1200), raw: text.slice(0, 1200) };
  }
}

function formatOperationError(error: unknown, action: string, endpoint: string) {
  const raw = error instanceof Error ? error.message : String(error || "");
  if (/Failed to fetch|NetworkError|fetch failed|ECONNREFUSED/i.test(raw)) {
    return `${action}失败：浏览器没有连到本地 API（${endpoint}）。这一步还没到图片/视频上游，所以不会有上游 trace。请确认前端 http://127.0.0.1:5173 和 API http://127.0.0.1:8787 都在运行。原始错误：${raw}`;
  }
  return `${action}失败：${toUserMessage(raw)}`;
}

function extractSafePrompt(data: unknown) {
  if (!data || typeof data !== "object") return "";
  const record = data as Record<string, unknown>;
  const value = record.safePrompt || record.rewrittenPrompt || record.prompt;
  return typeof value === "string" ? value.trim() : "";
}

function extractPromptSummary(data: unknown) {
  if (!data || typeof data !== "object") return "";
  const record = data as Record<string, unknown>;
  const summary = record.promptSummary;
  if (!summary || typeof summary !== "object") return "";
  const summaryRecord = summary as Record<string, unknown>;
  const chars = Number(summaryRecord.promptChars);
  const limit = Number(summaryRecord.promptLimit);
  const compacted = summaryRecord.promptCompacted === true;
  if (!Number.isFinite(chars)) return "";
  const limitText = Number.isFinite(limit) ? ` / 上限 ${limit}` : "";
  return `完整视频提示词：${chars} 字符${limitText}${compacted ? "，已使用石狮压缩产品锁。" : "。"}`;
}

function extractVisualHarnessSummary(data: unknown) {
  if (!data || typeof data !== "object") return "";
  const record = data as Record<string, unknown>;
  const summary = record.visualSummary;
  if (!summary || typeof summary !== "object") return "";
  const summaryRecord = summary as Record<string, unknown>;
  const provider = typeof summaryRecord.provider === "string" ? summaryRecord.provider : "";
  const model = typeof summaryRecord.model === "string" ? summaryRecord.model : "";
  const submittedMode = typeof summaryRecord.submittedVisualMode === "string" ? summaryRecord.submittedVisualMode : "";
  const stageFrames = Number(summaryRecord.stageFramesSubmittedVisually);
  const promptFrames = Number(summaryRecord.stageFramesUsedInPrompt);
  const references = Number(summaryRecord.referenceImagesSubmitted);
  const fieldParts = [
    typeof summaryRecord.firstFrameField === "string" && summaryRecord.firstFrameField ? `first=${summaryRecord.firstFrameField}` : "",
    typeof summaryRecord.lastFrameField === "string" && summaryRecord.lastFrameField ? `last=${summaryRecord.lastFrameField}` : "",
    typeof summaryRecord.referenceImageField === "string" && summaryRecord.referenceImageField ? `refs=${summaryRecord.referenceImageField}` : "",
  ].filter(Boolean);
  if (!submittedMode && !Number.isFinite(stageFrames)) return "";
  return [
    `Visual harness: ${provider}${model ? `/${model}` : ""}`,
    submittedMode ? `mode=${submittedMode}` : "",
    Number.isFinite(stageFrames) ? `visual stage frames=${stageFrames}` : "",
    Number.isFinite(promptFrames) ? `prompt stage frames=${promptFrames}` : "",
    Number.isFinite(references) ? `reference images=${references}` : "",
    fieldParts.length ? `fields: ${fieldParts.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("; ");
}

function toUserMessage(message: string) {
  const text = message.trim();
  if (!text) return "这次请求没有成功，请稍后再试。";
  if (/server_error|retry your request|An error occurred while processing your request|do[_\s-]?request[_\s-]?failed/i.test(text)) {
    const requestId =
      text.match(/request ID\s+([0-9a-f-]{12,})/i)?.[1] ||
      text.match(/request[_\s-]?id["']?\s*[:=]\s*["']?([0-9a-f-]{12,})/i)?.[1] ||
      "";
    return `上游服务这次内部处理失败，系统已经停止本次任务。可以直接重试一次${requestId ? `；请求编号：${requestId}` : ""}。`;
  }
  if (/InputTextSensitiveContentDetected|sensitive information|sensitive content|敏感/i.test(text)) {
    return "视频通道拦截了本次完整请求。这不一定是你输入的单句提示词有问题，也可能来自系统拼接后的产品锁、起始分镜图、素材组合或上游通道策略。";
  }
  if (/api key|unauthorized|forbidden|not configured|missing key|请先填写 API Key/i.test(text)) {
    return "服务密钥还没有配置好，请先让管理员确认后台配置。";
  }
  if (/insufficient_user_quota|余额|额度|预扣费|quota|credit/i.test(text)) {
    return "当前视频服务余额不够了，请充值或换一个费用更低的模型后再试。";
  }
  if (/model_not_found|No available channel|没有找到模型|模型不存在|模型不可用|model .*not/i.test(text)) {
    return "当前模型暂时不可用，请换一个模型，或让管理员确认模型名称。";
  }
  if (/上游图片服务连接失败|上游视频服务连接失败|分镜生成服务暂时连不上|视频生成服务暂时连不上|分镜生成服务这次连接中断|视频生成服务这次连接中断|上游服务这次连接中断|没有拿到上游返回/i.test(text)) {
    return text;
  }
  if (/timeout|timed out|Error code 524|超时/i.test(text)) {
    return "这次处理时间太久了，请稍后再试。";
  }
  if (/Failed to fetch|NetworkError|fetch failed|ECONNREFUSED/i.test(text)) {
    return "服务暂时连不上，请确认本地服务还在运行后再试。";
  }
  if (/非 JSON|non.?json|Not found|404|接口路径|路径/i.test(text)) {
    return "服务地址可能配置不对，请让管理员检查接口地址。";
  }
  if (/Preset image unavailable|preset images failed/i.test(text)) {
    return "本地预设图片没有加载成功，请刷新页面或重新选择产品。";
  }
  if (/image\/url|图片地址|image_url|b64_json/i.test(text)) {
    return "这次没有拿到分镜图片结果，请稍后再试，或换一个分镜模型。";
  }
  if (/视频地址|任务号|video url|task id/i.test(text)) {
    return "这次没有拿到视频结果，也没有拿到可查询的任务号，请重新生成一次。";
  }
  if (/Pair prompt model did not return parseable JSON|提示词模型没有返回|prompt model/i.test(text)) {
    return "这次没有拿到完整提示词，请再点一次骰子。";
  }
  return text;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error || new Error("Read file failed"));
    reader.readAsDataURL(file);
  });
}

function readBlobAsDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error || new Error("Read preset image failed"));
    reader.readAsDataURL(blob);
  });
}

function estimateDataUrlBytes(dataUrl: string) {
  const match = dataUrl.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/);
  if (!match) return 0;
  const base64 = match[1];
  return Math.floor((base64.length * 3) / 4) - (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0);
}

function loadImageFromDataUrl(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Reference image could not be prepared."));
    image.src = dataUrl;
  });
}

async function prepareFirstFrameReferenceDataUrl(dataUrl: string) {
  if (!dataUrl.startsWith("data:image/")) return dataUrl;
  const image = await loadImageFromDataUrl(dataUrl);
  const rawBytes = estimateDataUrlBytes(dataUrl);
  const maxEdge = Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height);
  if (maxEdge <= FIRST_FRAME_REFERENCE_MAX_EDGE && rawBytes <= FIRST_FRAME_REFERENCE_MAX_BYTES) return dataUrl;

  const scale = Math.min(1, FIRST_FRAME_REFERENCE_MAX_EDGE / Math.max(1, maxEdge));
  const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
  const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return dataUrl;
  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", FIRST_FRAME_REFERENCE_JPEG_QUALITY);
}

async function prepareFirstFrameImageList(items: unknown) {
  if (!Array.isArray(items)) return items;
  return Promise.all(
    items.map((item) =>
      typeof item === "string" ? prepareFirstFrameReferenceDataUrl(item) : item,
    ),
  );
}

async function prepareFirstFramePayloadForSubmit(payload: Record<string, unknown>) {
  return {
    ...payload,
    image_urls: await prepareFirstFrameImageList(payload.image_urls),
    support_image_urls: await prepareFirstFrameImageList(payload.support_image_urls),
    previous_first_frame_url:
      typeof payload.previous_first_frame_url === "string"
        ? await prepareFirstFrameReferenceDataUrl(payload.previous_first_frame_url)
        : payload.previous_first_frame_url,
  };
}

async function loadPresetSlotDataUrls(preset: NonNullable<ReturnType<typeof getProductPreset>>) {
  return Promise.all(
    preset.views.map(async (view) => {
      const response = await fetch(view.localUrl);
      if (!response.ok) throw new Error(`Preset image unavailable: ${view.localUrl}`);
      const dataUrl = await prepareFirstFrameReferenceDataUrl(await readBlobAsDataUrl(await response.blob()));
      return { slotId: view.slotId, dataUrl };
    }),
  );
}

async function loadPresetSupportDataUrls(preset: NonNullable<ReturnType<typeof getProductPreset>>) {
  const loaded = await Promise.all(
    (preset.supportViews || []).map(async (view) => {
      try {
        const response = await fetch(view.localUrl);
        if (!response.ok) return "";
        return prepareFirstFrameReferenceDataUrl(await readBlobAsDataUrl(await response.blob()));
      } catch {
        return "";
      }
    }),
  );
  return loaded.filter(Boolean);
}

function getSlotImageUrl(slot?: UploadSlot) {
  if (!slot) return "";
  return slot.dataUrl || "";
}

export function App() {
  const [activeStep, setActiveStep] = useState<StepId>("upload");
  const [slots, setSlots] = useState(() => createPresetSlots(SHARK_INFLATABLE_TYPE));
  const [supportImageUrls, setSupportImageUrls] = useState<string[]>([]);
  const [lockNodes, setLockNodes] = useState(() => getProductLockNodes(SHARK_INFLATABLE_TYPE));
  const [costumeType, setCostumeType] = useState(SHARK_INFLATABLE_TYPE);
  const [apiSettings, setApiSettings] = useState<ApiSettings>(() => loadApiSettings());
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>(() => loadHistoryItems());
  const [pendingHistoryItem, setPendingHistoryItem] = useState<HistoryItem | null>(null);
  const [historyError, setHistoryError] = useState("");
  const [productAssets] = useState<ProductAsset[]>(productAssetPlan);
  const [duration, setDuration] = useState(8);
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [motionMode, setMotionMode] = useState<MotionMode>("strict");
  const [storyDirection, setStoryDirection] = useState("");
  const [isEditingStoryIntent, setIsEditingStoryIntent] = useState(false);
  const [storyIntent, setStoryIntent] = useState<StoryIntent | null>(null);
  const [storyboards, setStoryboards] = useState<StoryboardFrame[]>([]);
  const [selectedStoryboardIds, setSelectedStoryboardIds] = useState<string[]>([]);
  const [storyboardPreflight, setStoryboardPreflight] = useState<StoryboardPreflight | null>(null);
  const [videoExecutionPackage, setVideoExecutionPackage] = useState<VideoExecutionPackage | null>(null);
  const [storyboardError, setStoryboardError] = useState("");
  const [storyboardPreview, setStoryboardPreview] = useState<StoryboardFrame | null>(null);
  const [videoError, setVideoError] = useState("");
  const [videoTaskId, setVideoTaskId] = useState("");
  const [videoStatus, setVideoStatus] = useState<VideoStatus>("idle");
  const [videoUrl, setVideoUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeJob, setActiveJob] = useState<WorkflowJobKind | "">("");
  const [progressEvents, setProgressEvents] = useState<ProgressEvent[]>([]);
  const currentJobIdRef = useRef("");

  useEffect(() => {
    saveApiSettings(apiSettings);
  }, [apiSettings]);

  useEffect(() => {
    saveHistoryItems(historyItems);
  }, [historyItems]);

  useEffect(() => {
    const preset = getProductPreset(costumeType);
    if (!preset) {
      invalidateGeneratedOutputs();
      setSlots(initialSlots);
      setSupportImageUrls([]);
      setLockNodes(getProductLockNodes(costumeType));
      setActiveStep("upload");
      return;
    }
    let cancelled = false;
    invalidateGeneratedOutputs();
    setSlots(createPresetSlots(costumeType));
    setSupportImageUrls([]);
    setLockNodes(getProductLockNodes(costumeType));
    setActiveStep("upload");
    Promise.all([loadPresetSlotDataUrls(preset), loadPresetSupportDataUrls(preset)])
      .then(([loadedSlots, loadedSupportImages]) => {
        if (cancelled) return;
        setSlots((current) =>
          current.map((slot) => {
            if (slot.source !== "preset") return slot;
            const loaded = loadedSlots.find((item) => item.slotId === slot.id);
            return loaded ? { ...slot, dataUrl: loaded.dataUrl } : slot;
          }),
        );
        setSupportImageUrls(loadedSupportImages);
      })
      .catch((error) => {
        if (!cancelled) setStoryboardError(error instanceof Error ? error.message : "Preset images failed to load.");
      });
    return () => {
      cancelled = true;
    };
  }, [costumeType]);

  useEffect(() => {
    if (!pendingHistoryItem) return;
    if (pendingHistoryItem.productType && pendingHistoryItem.productType !== costumeType) return;
    applyHistoryItemToCurrentFlow(pendingHistoryItem);
    setPendingHistoryItem(null);
  }, [costumeType, pendingHistoryItem]);

  const allLocksConfirmed = lockNodes.every((node) => node.confirmed);
  const autoLockedNodes = useMemo(() => lockNodes.map((node) => ({ ...node, confirmed: true })), [lockNodes]);
  const requiredUrls = slots.map(getSlotImageUrl).filter(Boolean);
  const currentProductPreset = getProductPreset(costumeType);
  const currentSupportViewCount = currentProductPreset?.supportViews?.length || 0;
  const uploadReady = requiredUrls.length === slots.length;
  const selectedStoryboards = storyboards.filter((storyboard) => selectedStoryboardIds.includes(storyboard.id));
  const storyIntentReady = Boolean(storyIntent?.storyIntent?.trim());
  const storyIntentCanGenerate = uploadReady && allLocksConfirmed;
  const storyboardReady = storyIntentCanGenerate && storyIntentReady;
  const selectedStoryboardImageUrls = selectedStoryboards.map((storyboard) => storyboard.imageUrl).filter(Boolean);
  const storyboardImagesAreUnique = selectedStoryboardImageUrls.length >= 3 && new Set(selectedStoryboardImageUrls).size === selectedStoryboardImageUrls.length;
  const videoFirstFrameAnchor = storyboardImagesAreUnique ? selectedStoryboardImageUrls[0] || "" : "";
  const videoReady = uploadReady && Boolean(videoExecutionPackage?.ok) && Boolean(videoFirstFrameAnchor);
  const videoDurationCap = getVideoModelDurationCap(apiSettings.videoProvider, apiSettings.videoModel);
  const requestedVideoDuration = Number.isFinite(duration) ? duration : videoDurationCap.min;
  const actualVideoDuration = clampVideoDurationForModel(apiSettings.videoProvider, apiSettings.videoModel, requestedVideoDuration);

  function createHistoryDetail(
    kind: "firstFrame" | "video",
    status: HistoryItem["status"],
    detail: Partial<HistoryItem> = {},
  ) {
    return {
      productType: costumeType,
      sceneTitle: storyIntent?.storyTitle || "",
      scenePrompt: storyIntent?.storyIntent || storyDirection,
      videoPrompt: videoExecutionPackage?.finalVideoPrompt || storyIntent?.storyIntent || "",
      model: kind === "firstFrame" ? apiSettings.imageModel : apiSettings.videoModel,
      aspectRatio,
      duration: kind === "video" ? actualVideoDuration : undefined,
      requestedDuration: kind === "video" ? requestedVideoDuration : undefined,
      motionMode: kind === "video" ? motionMode : undefined,
      firstFrameUrl: videoFirstFrameAnchor || undefined,
      videoUrl: kind === "video" ? videoUrl || undefined : undefined,
      productViewUrls: slots.map((slot) => slot.localUrl).filter(Boolean),
      supportImageUrls,
      ...detail,
      status,
    };
  }

  const completedSteps: Record<StepId, boolean> = {
    upload: uploadReady,
    storyboard: Boolean(videoExecutionPackage?.ok),
    video: videoStatus === "succeeded" || Boolean(videoUrl),
  };

  const motionText =
    motionMode === "strict"
      ? "Controlled visible comedy beats: one clear arm gesture, a small prop interaction, a small recoil or elastic wobble, and a freeze-pause twist; start from the approved first-frame view and allow a slight three-quarter shift if needed; no product redesign."
      : motionMode === "balanced"
        ? "Readable ecommerce comedy motion: one small half-step or body pivot, prop reaction, elastic wobble, and a clear pause; product surfaces must follow the four-view topology."
        : "More playful comedy timing with a visible prop gag, controlled angle change, or reversal, while preserving every locked product node and view-correct component placement.";

  const lockedNodePayload = lockNodes.map(({ code, label, detail, confidence, confirmed, critical }) => ({
    code,
    label,
    detail,
    confidence,
    confirmed,
    critical,
  }));

  const storyboardPayload = {
    model: apiSettings.imageModel,
    product_type: costumeType,
    image_urls: requiredUrls,
    support_image_urls: supportImageUrls,
    locked_nodes: lockedNodePayload,
    story_intent: storyIntent,
    motion_mode: motionMode,
    aspect_ratio: aspectRatio,
  };

  const videoBaseUrlForRequest = "";
  const videoApiKeyForRequest = "";
  const videoResolution = getVideoModelResolution(apiSettings.videoProvider, apiSettings.videoModel);
  const slimVideoExecutionPackage = createSlimVideoExecutionPackage(videoExecutionPackage);

  const videoPayload = {
    video_provider: apiSettings.videoProvider,
    base_url: videoBaseUrlForRequest,
    api_key: videoApiKeyForRequest,
    model: apiSettings.videoModel,
    action_prompt: videoExecutionPackage?.finalVideoPrompt || storyIntent?.storyIntent || "",
    scene_prompt: storyIntent?.sceneAnchor || "",
    product_type: costumeType,
    image_urls: requiredUrls,
    support_image_urls: supportImageUrls,
    locked_nodes: lockedNodePayload,
    story_intent: storyIntent,
    storyboards: selectedStoryboards,
    storyboard_frame_urls: selectedStoryboardImageUrls,
    video_execution_package: videoExecutionPackage,
    motion_rule: videoExecutionPackage?.cameraPath ? `Use verified storyboard camera path: ${videoExecutionPackage.cameraPath}` : motionText,
    image_url: videoFirstFrameAnchor || "PASTE_APPROVED_FIRST_FRAME_URL",
    duration: actualVideoDuration,
    requested_duration: requestedVideoDuration,
    aspect_ratio: aspectRatio,
    resolution: videoResolution,
    audio: true,
    prompt_extend: false,
    metadata: {
      requested_duration: requestedVideoDuration,
      submitted_duration: actualVideoDuration,
      video_provider: apiSettings.videoProvider,
    },
  };
  const videoSubmitPayload = {
    ...videoPayload,
    storyboards: selectedStoryboards.map(redactStoryboardImageForSubmit),
    video_execution_package: slimVideoExecutionPackage,
  };
  const emptyImageList: string[] = [];
  const videoSafetyPayload = {
    ...videoSubmitPayload,
    image_urls: emptyImageList,
    support_image_urls: emptyImageList,
    detail_image_urls: emptyImageList,
    storyboards: [],
    video_execution_package: slimVideoExecutionPackage
      ? {
          ...slimVideoExecutionPackage,
          selectedStoryboards: [],
        }
      : null,
  };

  const videoStatusText =
    videoStatus === "submitted"
      ? "任务已提交"
      : videoStatus === "polling"
        ? "视频生成中"
        : videoStatus === "succeeded"
          ? "视频已生成"
          : videoStatus === "failed"
            ? "生成失败"
            : "";

  function createJobId(kind: WorkflowJobKind) {
    return `${kind}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function resetProgress(kind: WorkflowJobKind, title: string) {
    const jobId = createJobId(kind);
    currentJobIdRef.current = jobId;
    const event: ProgressEvent = {
      id: `${jobId}-start`,
      jobId,
      type: "job.started",
      title,
      detail: "任务已创建，等待执行真实步骤。",
      status: "running",
      at: new Date().toISOString(),
    };
    setProgressEvents([event]);
    return jobId;
  }

  function addProgressEvent(type: JobEventType, title: string, detail: string, status: ProgressEvent["status"] = "running") {
    const jobId = currentJobIdRef.current || createJobId("video");
    const event: ProgressEvent = {
      id: `${jobId}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      jobId,
      type,
      title,
      detail,
      status,
      at: new Date().toISOString(),
    };
    currentJobIdRef.current = jobId;
    setProgressEvents((current) => [...current.slice(-11), event]);
  }

  function invalidateGeneratedOutputs() {
    setStoryIntent(null);
    setIsEditingStoryIntent(false);
    setStoryboards([]);
    setSelectedStoryboardIds([]);
    setStoryboardPreflight(null);
    setVideoExecutionPackage(null);
    setStoryboardError("");
    invalidateVideoOutputs();
  }

  function invalidateStoryboardOutputs(keepIntent = true) {
    if (!keepIntent) {
      setStoryIntent(null);
      setIsEditingStoryIntent(false);
    }
    setStoryboards([]);
    setSelectedStoryboardIds([]);
    setStoryboardPreflight(null);
    setVideoExecutionPackage(null);
    setStoryboardError("");
    invalidateVideoOutputs();
  }

  function invalidateVideoOutputs() {
    setVideoError("");
    setVideoTaskId("");
    setVideoStatus("idle");
    setVideoUrl("");
  }

  async function updateSlotFile(id: string, file?: File) {
    if (!file) return;
    const localUrl = URL.createObjectURL(file);
    invalidateGeneratedOutputs();
    setActiveStep("upload");
    const updateSlot = (slot: UploadSlot): UploadSlot =>
      slot.id === id ? { ...slot, file, fileName: file.name, localUrl, dataUrl: "", source: "manual" } : slot;
    setSlots((current) => current.map(updateSlot));
    const dataUrl = await prepareFirstFrameReferenceDataUrl(await readFileAsDataUrl(file));
    const updateDataUrl = (slot: UploadSlot) => (slot.id === id ? { ...slot, dataUrl } : slot);
    setSlots((current) => current.map(updateDataUrl));
  }

  function updateApiSettings(patch: Partial<ApiSettings>) {
    setApiSettings((current) => {
      const next = { ...current, ...patch, imagePath: "", videoPath: "", videoProvider: "wisech" as const, videoBaseUrl: DEFAULT_VIDEO_BASE_URL, videoApiKey: "" };
      if (patch.videoProvider) {
        const provider = getVideoProviderOption("wisech");
        next.videoBaseUrl = provider.baseUrl;
        next.videoApiKey = "";
        next.videoModel = provider.model;
      } else if (patch.videoModel && !isVideoModelAllowed(next.videoProvider, patch.videoModel)) {
        next.videoModel = getDefaultVideoModel(next.videoProvider);
      }
      return next;
    });
  }

  function updateProductType(value: string) {
    invalidateGeneratedOutputs();
    setCostumeType(value);
    setLockNodes(getProductLockNodes(value));
    setStoryDirection("");
    setActiveStep("upload");
  }

  function updateStoryDirection(value: string) {
    setStoryDirection(value);
    invalidateStoryboardOutputs(false);
  }

  function updateVideoDuration(value: number) {
    invalidateVideoOutputs();
    setDuration(clampVideoDurationForModel(apiSettings.videoProvider, apiSettings.videoModel, value));
  }

  function updateAspectRatio(value: string) {
    if (value === aspectRatio) return;
    invalidateGeneratedOutputs();
    setAspectRatio(value);
    if (activeStep !== "upload") setActiveStep("storyboard");
  }

  function confirmManualStoryScript() {
    const manualScript = storyDirection.trim();
    if (!manualScript) {
      setStoryboardError("请先粘贴时间轴脚本。");
      return;
    }
    const nextIntent = buildManualTimelineStoryIntent(manualScript, costumeType, motionMode);
    invalidateStoryboardOutputs(true);
    setStoryboardError("");
    setVideoError("");
    setStoryIntent(nextIntent);
    setIsEditingStoryIntent(false);
    resetProgress("storyIntent", "手写时间轴确认");
    addProgressEvent("artifact.created", "手写时间轴已确认", "分镜和视频执行包会优先沿用这份真实脚本。", "done");
    addProgressEvent("job.completed", "剧情意图完成", "可以继续生成一版三镜头分镜。", "done");
  }

  function updateStoryIntentText(value: string) {
    setStoryIntent((current) => {
      if (!current) return current;
      const nextText = sanitizeProductText(value);
      return {
        ...current,
        storyIntent: nextText,
        beats: buildEditableStoryBeats(nextText, current.beats),
      };
    });
    setStoryboards([]);
    setSelectedStoryboardIds([]);
    setStoryboardPreflight(null);
    setVideoExecutionPackage(null);
    invalidateVideoOutputs();
  }

  async function requestStoryboards() {
    if (!storyIntent) {
      setStoryboardError("请先生成或确认剧情意图，再生成分镜。");
      return;
    }
    setActiveJob("storyboard");
    resetProgress("storyboard", "分镜生成");
    setStoryboardError("");
    setVideoError("");
    try {
      addProgressEvent("step.started", "整理四视图和剧情", "把四张核心视图、辅助角度、结构化锁点和剧情意图打包给图片模型。");
      const requestPayload = {
        ...(await prepareFirstFramePayloadForSubmit(storyboardPayload)),
        story_intent: storyIntent,
      };
      addProgressEvent("tool.started", "提交分镜模型", "分镜可以多次生成，用来在低成本阶段收敛动作路径。");
      const response = await fetch("/api/storyboards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload),
      });
      const data: unknown = await readApiResponseBody(response);
      if (!response.ok) throw new Error(extractErrorMessage(data, response.status));
      const record = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
      const nextStoryboards = Array.isArray(record.storyboards) ? (record.storyboards as StoryboardFrame[]) : [];
      if (nextStoryboards.length < 3) throw new Error("分镜模型没有返回足够的候选分镜。");
      setIsEditingStoryIntent(false);
      setStoryboards(nextStoryboards);
      setSelectedStoryboardIds(nextStoryboards.slice(0, 3).map((storyboard) => storyboard.id));
      setStoryboardPreflight(null);
      setVideoExecutionPackage(null);
      invalidateVideoOutputs();
      addProgressEvent("artifact.created", "候选分镜已返回", `${nextStoryboards.length} 张分镜候选已生成。`, "done");
      addProgressEvent("job.completed", "分镜生成完成", "下一步会在提交视频前做执行包预检。", "done");
    } catch (error) {
      const message = formatOperationError(error, "生成首帧分镜", "POST /api/storyboards");
      addProgressEvent("step.failed", "分镜生成失败", message, "failed");
      setStoryboardError(message);
    } finally {
      setActiveJob("");
    }
  }

  async function compileVideoPackage() {
    if (!storyIntent || selectedStoryboards.length < 3) {
      setStoryboardError("请先生成并选择至少 3 张分镜，再编译视频执行包。");
      return;
    }
    if (!storyboardImagesAreUnique) {
      setStoryboardError("当前分镜图重复，或疑似把三张分镜拼在同一张图里。请重新生成三张独立分镜后再进入视频生成。");
      return;
    }
    setActiveJob("storyboard");
    resetProgress("storyboard", "执行包预检");
    setStoryboardError("");
    setVideoError("");
    try {
      const payload = {
        product_type: costumeType,
        story_intent: storyIntent,
        storyboards: selectedStoryboards,
        locked_nodes: lockedNodePayload,
        motion_mode: motionMode,
        video_provider: apiSettings.videoProvider,
        model: apiSettings.videoModel,
      };
      addProgressEvent("tool.started", "提交前预检", "检查分镜数量、文字禁用项、动作路径和失败分镜。");
      const response = await fetch("/api/video-package", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(extractErrorMessage(data, response.status));
      const pkg = data as VideoExecutionPackage;
      setStoryboardPreflight(pkg.preflight);
      setVideoExecutionPackage(pkg.ok ? pkg : null);
      if (!pkg.ok) {
        throw new Error(pkg.preflight?.issues?.[0]?.message || "执行包预检没有通过。");
      }
      addProgressEvent("tool.completed", "预检通过", `镜头路径：${pkg.cameraPath}`, "done");
      addProgressEvent("artifact.created", "视频执行包已编译", "视频页将使用这份执行包一次性提交给视频模型。", "done");
      addProgressEvent("job.completed", "执行包完成", "可以进入视频生成。", "done");
      setActiveStep("video");
    } catch (error) {
      const message = error instanceof Error ? toUserMessage(error.message) : "执行包预检没有通过。";
      addProgressEvent("step.failed", "执行包预检失败", message, "failed");
      setStoryboardError(message);
    } finally {
      setActiveJob("");
    }
  }

  function toggleStoryboardSelection(id: string) {
    setSelectedStoryboardIds((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      return next.slice(0, 5);
    });
    setStoryboardPreflight(null);
    setVideoExecutionPackage(null);
    invalidateVideoOutputs();
  }

  function completeUploadStep() {
    if (!uploadReady) {
      setStoryboardError("请先上传正面、左侧、右侧、背面四张核心产品图。");
      return;
    }
    setLockNodes(autoLockedNodes);
    setActiveStep("storyboard");
  }

  function selectStep(step: StepId) {
    if (step === "upload") {
      setActiveStep("upload");
      return;
    }
    if (step === "storyboard" && uploadReady) {
      setActiveStep("storyboard");
      return;
    }
    if (step === "video" && videoReady) {
      setActiveStep("video");
      return;
    }
    if (!uploadReady) {
      setActiveStep("upload");
      setStoryboardError("请先上传正面、左侧、右侧、背面四张核心产品图。");
    }
  }

  function applyHistoryItemToCurrentFlow(item: HistoryItem) {
    if (item.scenePrompt) setStoryDirection(item.scenePrompt);
    if (item.aspectRatio) setAspectRatio(item.aspectRatio);
    if (item.duration) setDuration(item.requestedDuration || item.duration);
    if (item.motionMode) setMotionMode(item.motionMode);
    if (item.taskId) setVideoTaskId(item.taskId);
    if (item.firstFrameUrl) {
      const restoredStoryboard: StoryboardFrame = {
        id: `history-storyboard-${item.id}`,
        imageUrl: item.firstFrameUrl,
        beat: item.scenePrompt || "历史分镜起始图",
        action: item.videoPrompt || "历史执行包动作",
        viewAngle: "front",
        checks: [],
      };
      setStoryboards([restoredStoryboard]);
      setSelectedStoryboardIds([restoredStoryboard.id]);
    }
    if (item.videoUrl) setVideoUrl(item.videoUrl);
    setVideoStatus(item.videoUrl ? "succeeded" : item.type === "视频" && item.status === "处理中" ? "polling" : "idle");
    setStoryboardError(item.firstFrameUrl ? "已从历史记录载入起始分镜资产。" : "");
    setVideoError(item.videoUrl ? "已从历史记录载入视频资产。" : item.error || "");
    setActiveStep(item.videoUrl ? "video" : "storyboard");
  }

  async function openHistoryItem(item: HistoryItem) {
    let resolvedItem = await resolveHistoryItemAssets(item);
    if (!resolvedItem.videoUrl && resolvedItem.taskId) {
      try {
        const response = await fetch("/api/video-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            task_id: resolvedItem.taskId,
            video_provider: "wisech",
          }),
        });
        const data: unknown = await response.json().catch(() => ({}));
        const recoveredVideoUrl = response.ok ? extractVideoUrl(data) : "";
        if (recoveredVideoUrl) {
          resolvedItem = { ...resolvedItem, status: "成功", detailUrl: recoveredVideoUrl, videoUrl: recoveredVideoUrl };
          setHistoryItems((current) => current.map((historyItem) => (historyItem.id === resolvedItem.id ? resolvedItem : historyItem)));
        }
      } catch {
        // Keep the original history item if the recovery check cannot complete.
      }
    }
    if (isHistoryAssetRef(resolvedItem.firstFrameUrl) || isHistoryAssetRef(resolvedItem.videoUrl) || isHistoryAssetRef(resolvedItem.detailUrl)) {
      setHistoryError("这条历史记录的图片或视频还在本机资产库里恢复中，请稍后再试一次。");
      return;
    }
    setHistoryError("");
    setHistoryOpen(false);
    if (resolvedItem.productType && resolvedItem.productType !== costumeType) {
      setPendingHistoryItem(resolvedItem);
      setCostumeType(resolvedItem.productType);
      return;
    }
    applyHistoryItemToCurrentFlow(resolvedItem);
  }

  async function callBackend(kind: "video") {
    if (kind !== "video") return;
    if (!videoExecutionPackage?.ok || !videoFirstFrameAnchor) {
      setVideoError("请先在分镜页通过预检并生成视频执行包。");
      return;
    }
    resetProgress("video", "视频生成");
    setIsSubmitting(true);
    setVideoError("");
    setVideoTaskId("");
    setVideoUrl("");
    setVideoStatus("submitted");
    try {
      addProgressEvent("step.started", "输入检查", "检查执行包、起始分镜、视频模型和时长。");
      const requestPayload = videoSubmitPayload;
      addProgressEvent("tool.completed", "视频请求整理完成", "已把入选分镜、产品锁点、动作路径和执行包组合成完整请求。", "done");
      addProgressEvent("tool.started", "安全预检", "先检测完整视频请求；这一步发生在正式提交视频前。");
      const safetyResponse = await fetch("/api/video-safety", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(videoSafetyPayload),
      });
      const safetyData: unknown = await safetyResponse.json().catch(() => ({}));
      if (!safetyResponse.ok) throw new Error(extractErrorMessage(safetyData, safetyResponse.status));
      const safetyRecord = safetyData && typeof safetyData === "object" ? (safetyData as Record<string, unknown>) : {};
      if (safetyRecord.verdict === "blocked" || safetyRecord.ok === false) {
        throw new Error(typeof safetyRecord.reason === "string" ? safetyRecord.reason : "完整视频请求没有通过安全预检。");
      }
      const promptSummary = extractPromptSummary(safetyData);
      if (promptSummary) addProgressEvent("tool.completed", "提示词长度", promptSummary, "done");
      const visualHarnessSummary = extractVisualHarnessSummary(safetyData);
      if (visualHarnessSummary) addProgressEvent("tool.completed", "Visual harness", visualHarnessSummary, "done");
      addProgressEvent("tool.started", "提交上游", "正在一次性提交视频生成服务。");
      const response = await fetch("/api/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload),
      });
      const data: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(extractErrorMessage(data, response.status));
      const newTaskId = extractTaskId(data);
      const immediateVideoUrl = extractVideoUrl(data);
      if (immediateVideoUrl) {
        setVideoUrl(immediateVideoUrl);
        setVideoStatus("succeeded");
        addProgressEvent("artifact.created", "视频已返回", "上游直接返回了视频地址。", "done");
      } else if (newTaskId) {
        setVideoTaskId(newTaskId);
        setVideoStatus("polling");
        setVideoError(`视频已经开始生成，任务号是 ${newTaskId}。`);
        addProgressEvent("tool.completed", "任务号已返回", `视频任务号：${newTaskId}`, "done");
      } else {
        setVideoStatus("failed");
        throw new Error("这次没有拿到视频结果，也没有拿到可查询的任务号，请稍后再试。");
      }
      const nextHistoryStatus: HistoryItem["status"] = immediateVideoUrl ? "成功" : "处理中";
      const historyDetail = createHistoryDetail("video", nextHistoryStatus, {
        taskId: newTaskId || undefined,
        detailUrl: immediateVideoUrl,
        firstFrameUrl: videoFirstFrameAnchor || undefined,
        videoUrl: immediateVideoUrl || undefined,
      });
      setHistoryItems((current) => upsertHistoryItem(current, createHistoryItem(newTaskId || `LOCAL-${Date.now()}`, "video", nextHistoryStatus, historyDetail)));
      if (immediateVideoUrl) addProgressEvent("job.completed", "视频任务完成", "本次任务已经拿到可用产物。", "done");
    } catch (error) {
      const message = error instanceof Error ? toUserMessage(error.message) : "这次请求没有成功，请稍后再试。";
      addProgressEvent("step.failed", "视频任务失败", message, "failed");
      setVideoStatus("failed");
      setVideoError(message);
      const failedId = videoTaskId || `LOCAL-${Date.now()}`;
      setHistoryItems((current) => upsertHistoryItem(current, createHistoryItem(failedId, "video", "失败", createHistoryDetail("video", "失败", { taskId: videoTaskId || undefined, error: message }))));
    } finally {
      setIsSubmitting(false);
    }
  }
  useEffect(() => {
    if (!videoTaskId || videoStatus !== "polling") return;
    let stopped = false;
    let timer: number | undefined;
    let attempts = 0;

    async function pollVideoStatus() {
      attempts += 1;
      try {
        addProgressEvent("tool.started", "查询视频进度", `第 ${attempts} 次查询上游任务状态。`);
        const response = await fetch("/api/video-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            task_id: videoTaskId,
            video_provider: apiSettings.videoProvider,
            base_url: videoBaseUrlForRequest,
            api_key: videoApiKeyForRequest,
          }),
        });
        const data: unknown = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(extractErrorMessage(data, response.status));
        }

        const status = extractTaskStatus(data);
        const nextVideoUrl = extractVideoUrl(data);
        if (nextVideoUrl || status === "SUCCEEDED" || status === "SUCCESS") {
          if (!nextVideoUrl) {
            throw new Error("视频已完成，但暂时没有拿到播放地址，请稍后再查一次。");
          }
          setVideoUrl(nextVideoUrl);
          setVideoStatus("succeeded");
          setVideoError("视频生成好了。");
          addProgressEvent("artifact.created", "视频地址已返回", "上游任务完成，已拿到视频播放地址。", "done");
          addProgressEvent("job.completed", "视频任务完成", "视频生成流程已完成。", "done");
          setHistoryItems((current) =>
            current.map((item) => (item.id === videoTaskId ? { ...item, status: "成功", detailUrl: nextVideoUrl, videoUrl: nextVideoUrl } : item)),
          );
          setActiveStep("video");
          return;
        }

        if (status === "FAILED" || status === "ERROR" || status === "CANCELED" || status === "UNKNOWN") {
          throw new Error(extractErrorMessage(data, response.status));
        }

        setVideoError(`视频还在生成中，已检查 ${attempts} 次。`);
        addProgressEvent("tool.completed", "进度查询完成", `上游仍在处理，已检查 ${attempts} 次。`, "done");
        if (!stopped) timer = window.setTimeout(pollVideoStatus, 3500);
      } catch (error) {
        const message = error instanceof Error ? toUserMessage(error.message) : "暂时查不到视频进度，请稍后再试。";
        setVideoStatus("failed");
        setVideoError(message);
        addProgressEvent("step.failed", "视频进度查询失败", message, "failed");
        setHistoryItems((current) =>
          current.map((item) => (item.id === videoTaskId ? { ...item, status: "失败", error: message } : item)),
        );
      }
    }

    pollVideoStatus();
    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [apiSettings.videoProvider, videoApiKeyForRequest, videoBaseUrlForRequest, videoStatus, videoTaskId]);

  return (
    <div className="min-h-[100dvh] overflow-hidden bg-[#eef4f4] text-[#0d1d20]">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_8%_10%,rgba(0,126,145,0.18),transparent_32%),radial-gradient(circle_at_92%_6%,rgba(15,109,243,0.12),transparent_34%),linear-gradient(120deg,#f7fbfb_0%,#edf4f4_48%,#f4f1f3_100%)]" />
      <header className="sticky top-0 z-50 border-b border-white/65 bg-white/76 px-8 py-4 shadow-[0_12px_44px_rgba(12,57,65,0.07)] backdrop-blur-2xl">
        <div className="mx-auto flex max-w-[1880px] items-center justify-between gap-6">
          <div className="flex min-w-0 items-center gap-4">
            <div className="grid h-[52px] w-[52px] place-items-center rounded-lg bg-[#007e91] text-white shadow-[0_18px_36px_rgba(0,126,145,0.22)]">
              <Film size={24} />
            </div>
            <div className="min-w-0">
              <strong className="block truncate text-[26px] font-black tracking-[0] text-[#07363d]">Product Lock Video Studio</strong>
              <span className="block truncate text-[14px] font-bold text-[#607276]">四视图锁定  -  脚本分镜  -  视频生成</span>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1880px] grid-cols-1 gap-8 px-8 py-7 pb-32 lg:grid-cols-[380px_minmax(0,1fr)]">
        <motion.aside
          className="flex min-h-0 flex-col rounded-lg border border-white/70 bg-white/62 p-5 shadow-[0_24px_70px_rgba(12,57,65,0.08)] backdrop-blur-2xl lg:sticky lg:top-28 lg:h-[calc(100dvh-150px)]"
          initial={{ opacity: 0, x: -18 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="rounded-lg bg-[#07363d] p-5 text-white">
            <div className="mb-8 flex items-center justify-between">
              <span className="text-[13px] font-black uppercase tracking-[0.14em] text-white/58">Current Run</span>
              <FileImage size={20} />
            </div>
            <strong className="block text-[28px] font-black leading-tight">{costumeType}</strong>
            <span className="mt-3 block text-[15px] font-semibold text-white/70">{requiredUrls.length}/4 核心视图  -  {currentSupportViewCount} 辅助角度</span>
          </div>
          <div className="mt-5 grid gap-3">
            {visibleSteps.map((step, index) => {
              const isActive = activeStep === step.id;
              const isDone = completedSteps[step.id];
              const Icon = step.icon;
              return (
                <button
                  className={cn(
                    "group grid min-h-[74px] grid-cols-[48px_1fr_auto] items-center gap-4 rounded-lg border border-transparent px-4 py-4 text-left transition active:scale-[0.99]",
                    isActive && "border-[#b8dce1] bg-white shadow-[0_12px_28px_rgba(12,57,65,0.08)]",
                    !isActive && "hover:bg-white/55",
                  )}
                  type="button"
                  key={step.id}
                  onClick={() => selectStep(step.id)}
                >
                  <span className={cn("grid h-12 w-12 place-items-center rounded-lg bg-[#e9f4f5] text-[#007e91]", isActive && "bg-[#007e91] text-white")}>
                    <Icon size={22} />
                  </span>
                  <span className="min-w-0">
                    <strong className="block text-[17px] font-black text-[#18363a]">{step.shortLabel}</strong>
                    <small className="block truncate text-[14px] font-semibold text-[#607276]">{step.description}</small>
                  </span>
                  <span className={cn("text-[13px] font-black", isDone ? "text-[#167a3a]" : "text-[#9caeb2]")}>{isDone ? "OK" : String(index + 1).padStart(2, "0")}</span>
                </button>
              );
            })}
          </div>
          <button className="mt-5 w-full rounded-lg border border-[#d7e5e6] bg-white/70 px-4 py-4 text-[16px] font-black text-[#456064] transition active:scale-[0.98]">
            新建流程
          </button>
          <HistoryInlinePanel
            items={historyItems}
            error={historyError}
            onClear={() => {
              setHistoryError("");
              setHistoryItems([]);
            }}
            onRemove={(id) => setHistoryItems((current) => current.filter((item) => item.id !== id))}
            onOpenItem={openHistoryItem}
          />
        </motion.aside>

        <main className="min-w-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeStep}
              initial={{ opacity: 0, y: 18, filter: "blur(8px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -12, filter: "blur(8px)" }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              {activeStep === "upload" && (
                <UploadStep
                  slots={slots}
                  costumeType={costumeType}
                  supportViewCount={currentSupportViewCount}
                  setCostumeType={updateProductType}
                  onFile={updateSlotFile}
                  canComplete={uploadReady}
                  onComplete={() => completeUploadStep()}
                />
              )}
              {activeStep === "storyboard" && (
                <StoryboardStep
                  storyDirection={storyDirection}
                  setStoryDirection={updateStoryDirection}
                  isEditingStoryIntent={isEditingStoryIntent}
                  setIsEditingStoryIntent={setIsEditingStoryIntent}
                  storyIntent={storyIntent}
                  updateStoryIntentText={updateStoryIntentText}
                  storyboards={storyboards}
                  selectedStoryboardIds={selectedStoryboardIds}
                  preflight={storyboardPreflight}
                  videoPackage={videoExecutionPackage}
                  aspectRatio={aspectRatio}
                  setAspectRatio={updateAspectRatio}
                  error={storyboardError}
                  canGenerate={storyIntentCanGenerate}
                  activeJob={activeJob}
                  onConfirmManualScript={confirmManualStoryScript}
                  onGenerateStoryboards={requestStoryboards}
                  onCompilePackage={compileVideoPackage}
                  onOpenStoryboard={setStoryboardPreview}
                />
              )}
              {activeStep === "video" && (
                <VideoStep
                  apiSettings={apiSettings}
                  updateApiSettings={updateApiSettings}
                  duration={actualVideoDuration}
                  requestedDuration={requestedVideoDuration}
                  setDuration={updateVideoDuration}
                  canGenerate={videoReady}
                  isSubmitting={isSubmitting}
                  error={videoError}
                  aspectRatio={aspectRatio}
                  firstFrameUrl={videoFirstFrameAnchor}
                  status={videoStatus}
                  statusText={videoStatusText}
                  taskId={videoTaskId}
                  videoUrl={videoUrl}
                  videoPrompt={videoExecutionPackage?.finalVideoPrompt || ""}
                  onGenerate={() => callBackend("video")}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      {storyboardPreview && <StoryboardPreviewModal storyboard={storyboardPreview} onClose={() => setStoryboardPreview(null)} />}
    </div>
  );
}

function StoryboardPreviewModal(props: { storyboard: StoryboardFrame; onClose: () => void }) {
  const viewLabel = localizeStoryboardLabel(props.storyboard.viewAngle);
  const beatLabel = localizeStoryboardLabel(props.storyboard.beat);
  const actionLabel = localizeStoryboardAction(props.storyboard.action);
  return (
    <div className="storyboard-preview-modal" role="dialog" aria-modal="true" aria-label="分镜大图预览">
      <button className="storyboard-preview-scrim" type="button" aria-label="关闭分镜大图预览" onClick={props.onClose} />
      <figure className="storyboard-preview-panel">
        <div className="storyboard-preview-head">
          <div>
            <span>{viewLabel}</span>
            <strong>{beatLabel}</strong>
          </div>
          <button className="icon-action" type="button" aria-label="关闭" onClick={props.onClose}>
            <X size={18} />
          </button>
        </div>
        <img src={props.storyboard.imageUrl} alt={beatLabel} />
        <figcaption>{actionLabel}</figcaption>
      </figure>
    </div>
  );
}

function HistoryInlinePanel(props: {
  items: HistoryItem[];
  error: string;
  onClear: () => void;
  onRemove: (id: string) => void;
  onOpenItem: (item: HistoryItem) => Promise<void>;
}) {
  const [expandedId, setExpandedId] = useState("");

  useEffect(() => {
    if (expandedId && !props.items.some((item) => item.id === expandedId)) {
      setExpandedId("");
    }
  }, [expandedId, props.items]);

  return (
    <section className="history-inline-panel" aria-label="历史记录">
      <div className="history-inline-head">
        <div>
          <span>历史记录</span>
          <strong>{props.items.length} 条</strong>
        </div>
        <button className="icon-action subtle" type="button" onClick={props.onClear} disabled={props.items.length === 0} aria-label="清空历史记录">
          <Trash2 size={17} />
        </button>
      </div>
      {props.error && <div className="history-error">{props.error}</div>}
      <div className="history-list inline-history-list">
        {props.items.length === 0 ? (
          <div className="history-empty">暂无记录</div>
        ) : (
          props.items.map((item) => (
            <article className={cn("history-item", expandedId === item.id && "expanded")} key={item.id}>
              <button
                className="history-item-main"
                type="button"
                onClick={() => setExpandedId((current) => (current === item.id ? "" : item.id))}
                aria-expanded={expandedId === item.id}
              >
                <div>
                  <span className="history-type">{item.type}</span>
                  <strong>{item.title}</strong>
                  <small>{item.time}</small>
                </div>
                <div className="history-side">
                  <span className={cn("history-status", item.status === "成功" && "ok", item.status === "失败" && "fail")}>{item.status}</span>
                  <ChevronDown size={17} />
                </div>
              </button>
              {expandedId === item.id && <HistoryDetail item={item} onOpenItem={() => props.onOpenItem(item)} />}
              <button className="icon-action subtle history-remove" aria-label="删除记录" onClick={() => props.onRemove(item.id)}>
                <Trash2 size={16} />
              </button>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function UploadStep(props: {
  slots: UploadSlot[];
  costumeType: string;
  supportViewCount: number;
  setCostumeType: (value: string) => void;
  onFile: (id: string, file?: File) => void;
  canComplete: boolean;
  onComplete: () => void;
}) {
  function handleDrop(id: string, event: DragEvent<HTMLElement>) {
    event.preventDefault();
    props.onFile(id, event.dataTransfer.files?.[0]);
  }

  return (
    <section className="stage-panel">
      <StageHeader eyebrow="第 1 步" title="上传产品四视图" />
      <div className="lock-note">核心四视图上传后才进入脚本和分镜。正面、左侧、右侧、背面用于锁定尺寸、比例、外形和拓扑；选择本地预设产品时，已保存的辅助角度会在后台自动作为一致性证据进入模型。</div>
      <div className="field-grid">
        <label>
          产品类型
          <select value={props.costumeType} onChange={(event) => props.setCostumeType(event.target.value)}>
            <option>鲨鱼充气服</option>
            <option>奶牛充气服</option>
            <option>灰色老鼠充气服</option>
            <option>青蛙充气服</option>
            <option>相扑充气服</option>
          </select>
        </label>
      </div>
      <div className="upload-section-title">
        <strong>核心四视图</strong>
        <span>必填，用于后台提取产品结构</span>
      </div>
      <div className="asset-grid">
        {props.slots.map((slot) => (
          <article className="asset-card" key={slot.id}>
            <label className="asset-preview">
              <input type="file" accept={slot.accept} onChange={(event) => props.onFile(slot.id, event.target.files?.[0])} />
              <div
                className="drop-zone"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => handleDrop(slot.id, event)}
              >
                {slot.localUrl ? (
                  <img src={slot.localUrl} alt={slot.label} />
                ) : (
                  <div className="missing-asset">
                    <CloudUpload size={30} />
                    <span>{slot.label}</span>
                    <small>上传图片</small>
                  </div>
                )}
                <em>{slot.badge}</em>
              </div>
            </label>
            <strong>{slot.label}</strong>
            <small>{slot.fileName || slot.hint}</small>
            {slot.source && <span className="asset-source">{slot.source === "preset" ? "本地预设" : "手动上传"}</span>}
          </article>
        ))}
      </div>
      {props.supportViewCount > 0 && (
        <div className="preset-reference-note">
          <strong>已绑定辅助角度</strong>
          <span>{props.supportViewCount} 张本地辅助视角会随四视图一起进入模型，用来加固侧面和背面组件归位。</span>
        </div>
      )}
      <div className="upload-actions">
        <button className="primary-action" type="button" disabled={!props.canComplete} onClick={props.onComplete}>
          <Check size={16} />
          素材上传完成
        </button>
      </div>
    </section>
  );
}

function StoryboardStep(props: {
  storyDirection: string;
  setStoryDirection: (value: string) => void;
  isEditingStoryIntent: boolean;
  setIsEditingStoryIntent: (value: boolean) => void;
  storyIntent: StoryIntent | null;
  updateStoryIntentText: (value: string) => void;
  storyboards: StoryboardFrame[];
  selectedStoryboardIds: string[];
  preflight: StoryboardPreflight | null;
  videoPackage: VideoExecutionPackage | null;
  aspectRatio: string;
  setAspectRatio: (value: string) => void;
  error: string;
  canGenerate: boolean;
  activeJob: WorkflowJobKind | "";
  onConfirmManualScript: () => void;
  onGenerateStoryboards: () => void;
  onCompilePackage: () => void;
  onOpenStoryboard: (storyboard: StoryboardFrame) => void;
}) {
  const storyCanConfirm = Boolean(props.storyIntent?.storyIntent?.trim()) && props.activeJob !== "storyboard";
  const selectedStoryboardFrameUrls = props.storyboards.filter((storyboard) => props.selectedStoryboardIds.includes(storyboard.id)).map((storyboard) => storyboard.imageUrl).filter(Boolean);
  const selectedFramesAreUnique = selectedStoryboardFrameUrls.length >= 3 && new Set(selectedStoryboardFrameUrls).size === selectedStoryboardFrameUrls.length;
  const canCompileStoryboards = selectedFramesAreUnique && props.activeJob !== "storyboard";
  return (
    <section className="stage-panel">
      <StageHeader eyebrow="第 2 步" title="脚本与首帧分镜" />
      <div className="lock-note">粘贴时间轴脚本；字幕只进入后期 overlay，视频模型只接收画面、动作和产品锁点。</div>
      <div className="two-col">
        <div className="stack">
          <div className="scenario-card prompt-card prompt-pair-card">
            <div className="prompt-label-row">
              <span>时间轴脚本</span>
            </div>
            {!props.storyIntent && (
              <label className="story-direction-field">
                <span>画面 / 字幕</span>
                <textarea
                  value={props.storyDirection}
                  onChange={(event) => props.setStoryDirection(event.target.value)}
                  placeholder={"0-3秒\n画面：朋友们在派对上聊天。\n字幕：Everyone's costume this Halloween...\n\n3-6秒\n画面：门缓缓打开，产品主角出现在门口。\n字幕：Then THIS guy showed up..."}
                />
                <div className="manual-story-actions">
                  <button className="secondary-action compact-action manual-story-action" type="button" disabled={!props.storyDirection.trim() || props.activeJob === "storyIntent"} onClick={props.onConfirmManualScript}>
                    <Check size={15} />
                    确认脚本
                  </button>
                </div>
              </label>
            )}
            {props.storyIntent && (
              <div className="story-intent-card">
                <strong>{props.storyIntent.storyTitle}</strong>
                {props.isEditingStoryIntent ? (
                  <textarea className="story-intent-editor" value={props.storyIntent.storyIntent} onChange={(event) => props.updateStoryIntentText(event.target.value)} aria-label="编辑剧情意图原文" />
                ) : (
                  <p>{props.storyIntent.storyIntent}</p>
                )}
                <small>{props.storyIntent.sceneAnchor}</small>
                <div className="story-beat-list">
                  {props.storyIntent.beats.map((beat) => (
                    <span key={beat.id}>{localizeStoryboardLabel(beat.beat)}</span>
                  ))}
                </div>
                <div className="review-flow-actions">
                  <button className="secondary-action compact-action" type="button" onClick={() => props.setIsEditingStoryIntent(!props.isEditingStoryIntent)}>
                    {props.isEditingStoryIntent ? <Check size={15} /> : <Pencil size={15} />}
                    {props.isEditingStoryIntent ? "完成编辑" : "修改"}
                  </button>
                  <button className="primary-action compact-action" type="button" disabled={!storyCanConfirm} onClick={props.onGenerateStoryboards}>
                    {props.activeJob === "storyboard" ? <LoaderCircle className="spin" size={15} /> : <Send size={15} />}
                    生成首帧分镜
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="storyboard-grid">
            {props.storyboards.length === 0 ? (
              <div className={cn("frame-placeholder storyboard-empty", props.activeJob === "storyboard" && "working")}>
                {props.activeJob === "storyboard" ? <LoaderCircle className="spin" size={38} /> : <Wand2 size={38} />}
                <strong>{props.activeJob === "storyboard" ? "正在生成首帧分镜" : "等待一版首帧分镜"}</strong>
              </div>
            ) : (
              <article className="storyboard-set-card">
                <div className="storyboard-shot-list">
                  {props.storyboards.slice(0, 3).map((storyboard, index) => {
                    const selected = props.selectedStoryboardIds.includes(storyboard.id);
                    const viewLabel = localizeStoryboardLabel(storyboard.viewAngle);
                    const beatLabel = localizeStoryboardLabel(storyboard.beat);
                    const actionLabel = localizeStoryboardAction(storyboard.action, index);
                    return (
                      <article className={cn("storyboard-frame-card", selected && "selected")} key={storyboard.id}>
                        <button className="storyboard-frame-image-button" type="button" onClick={() => props.onOpenStoryboard(storyboard)} aria-label={`\u67e5\u770b\u7b2c ${index + 1} \u5f20\u5206\u955c\u5927\u56fe`}>
                          <img src={storyboard.imageUrl} alt={`\u7b2c ${index + 1} \u5f20\u5206\u955c\uff1a${beatLabel}`} />
                          <span>
                            <Maximize2 size={14} />
                            {"\u67e5\u770b\u5927\u56fe"}
                          </span>
                        </button>
                        <div className="storyboard-shot">
                          <span>{String(index + 1).padStart(2, "0")}</span>
                          <div>
                            <small>{viewLabel}</small>
                            <strong>{beatLabel}</strong>
                            <p>{actionLabel}</p>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
                <div className="storyboard-next-actions">
                  <button className="primary-action full-width" type="button" disabled={!canCompileStoryboards} onClick={props.onCompilePackage}>
                    {props.activeJob === "storyboard" ? <LoaderCircle className="spin" size={16} /> : <ShieldCheck size={16} />}
                    确认这版首帧分镜，进入视频生成
                  </button>
                  {props.selectedStoryboardIds.length >= 3 && !selectedFramesAreUnique && <small className="field-hint">这版分镜图重复或像拼接图，请重新生成三张独立分镜。</small>}
                </div>
              </article>
            )}
          </div>
          {(props.preflight || props.videoPackage) && (
            <div className={cn("preflight-card", props.preflight?.status || "pass")}>
              <strong>执行包预检：{props.preflight?.status || "pass"}</strong>
              <span>{props.preflight?.cameraPath || props.videoPackage?.cameraPath}</span>
              {props.preflight?.issues.map((issue) => (
                <small key={issue.code}>{issue.message}</small>
              ))}
            </div>
          )}
          {props.error && <div className={cn("field-error", getStatusMessageTone(props.error))}>{props.error}</div>}
        </div>
        <div className="parameter-panel">
          <h3>成片画面</h3>
          <label>
            清晰度
            <div className="resolution-value">1080p</div>
          </label>
          <label>
            画面比例
            <div className="ratio-grid">
              {["16:9", "1:1", "9:16"].map((ratio) => (
                <button type="button" className={props.aspectRatio === ratio ? "active" : ""} onClick={() => props.setAspectRatio(ratio)} key={ratio}>
                  <i data-ratio={ratio} />
                  {ratio}
                </button>
              ))}
            </div>
          </label>
          {!props.canGenerate && <div className="field-hint">请先确认四张核心视图已加载。</div>}
          {props.canGenerate && !props.storyIntent && <div className="field-hint">粘贴时间轴脚本后确认，系统会把字幕留给后期叠加。</div>}
        </div>
      </div>
    </section>
  );
}

function VideoStep(props: {
  apiSettings: ApiSettings;
  updateApiSettings: (patch: Partial<ApiSettings>) => void;
  duration: number;
  requestedDuration: number;
  setDuration: (value: number) => void;
  canGenerate: boolean;
  isSubmitting: boolean;
  error: string;
  aspectRatio: string;
  firstFrameUrl: string;
  status: VideoStatus;
  statusText: string;
  taskId: string;
  videoUrl: string;
  videoPrompt: string;
  onGenerate: () => void;
}) {
  const isWorking = props.isSubmitting || props.status === "submitted" || props.status === "polling";
  const durationCap = getVideoModelDurationCap(props.apiSettings.videoProvider, props.apiSettings.videoModel);
  const modelOptions = getVideoModelOptions(props.apiSettings.videoProvider);
  return (
    <section className="stage-panel">
      <StageHeader eyebrow="第 3 步" title="生成视频" />
      <div className="two-col">
        <div className="stack">
          <div className={cn("video-preview", `media-ratio-${props.aspectRatio.replace(":", "-")}`)}>
            {props.videoUrl ? (
              <video controls playsInline src={props.videoUrl} />
            ) : isWorking ? (
              <div className="video-status-card video-generating-card">
                <div className="video-generating-frame" aria-hidden="true">
                  {props.firstFrameUrl ? (
                    <img src={props.firstFrameUrl} alt="" />
                  ) : (
                    <Film size={42} />
                  )}
                </div>
                <div className="video-generating-hud">
                  <LoaderCircle className="spin" size={28} />
                  <strong>{props.statusText || "视频生成中"}</strong>
                  {props.taskId && <span>任务号：{props.taskId}</span>}
                </div>
              </div>
            ) : (
              <div className="video-status-card">
                <Play size={42} />
                <strong>{props.statusText || "视频预览"}</strong>
              </div>
            )}
          </div>
          <div className="video-main-actions">
            <button className="primary-action" disabled={!props.canGenerate || isWorking} onClick={props.onGenerate}>
              {isWorking ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}
              {isWorking ? "生成中" : "生成视频"}
            </button>
            {props.error && <div className={cn("field-error", getStatusMessageTone(props.error))}>{props.error}</div>}
          </div>
        </div>
        <div className="parameter-panel">
          <h3>视频参数</h3>
          <label>
            站点
            <div className="resolution-value">Wisech / 云书 Seedance</div>
          </label>
          <label>
            模型
            <select value={props.apiSettings.videoModel} onChange={(event) => props.updateApiSettings({ videoModel: event.target.value })}>
              {modelOptions.map((model) => (
                <option key={model.value} value={model.value}>
                  {model.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            时长
            <input
              type="number"
              min={durationCap.min}
              max={durationCap.max}
              value={props.duration}
              onChange={(event) => props.setDuration(Number(event.target.value))}
            />
            <small className="field-hint">
              {durationCap.note}
              {props.requestedDuration !== props.duration ? ` 原来选择的 ${props.requestedDuration} 秒已按当前站点改为 ${props.duration} 秒。` : ""}
            </small>
          </label>
          {props.videoPrompt && (
            <div className="video-package-summary">
              <strong>视频执行包已准备</strong>
              <small>按已确认的首帧分镜、四视图产品锁点和当前模型能力提交。</small>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function StageHeader(props: { eyebrow: string; title: string }) {
  return (
    <div className="stage-header">
      <span>{props.eyebrow}</span>
      <h1>{props.title}</h1>
    </div>
  );
}

function HistoryDrawer(props: {
  items: HistoryItem[];
  products: ProductAsset[];
  error: string;
  onClose: () => void;
  onClear: () => void;
  onRemove: (id: string) => void;
  onOpenItem: (item: HistoryItem) => Promise<void>;
}) {
  const [expandedId, setExpandedId] = useState("");
  return (
    <div className="history-backdrop" role="dialog" aria-modal="true" aria-label="历史记录">
      <button className="history-scrim" aria-label="关闭历史记录" onClick={props.onClose} />
      <aside className="history-drawer">
        <div className="history-head">
          <div>
            <span>生成记录</span>
            <h2>历史记录</h2>
          </div>
          <button className="icon-action" aria-label="关闭" onClick={props.onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="history-actions">
          <button className="secondary-action" onClick={props.onClear} disabled={props.items.length === 0}>
            <Trash2 size={16} />
            清空记录
          </button>
        </div>
        {props.error && <div className="history-error">{props.error}</div>}

        <div className="product-library-plan">
          <strong>产品库</strong>
          {props.products.map((product) => (
            <article key={product.id}>
              <span>{product.viewMode}</span>
              <div>
                <b>{product.name}</b>
                <small>
                  {product.type}  -  {product.viewUrls.length} 张视图  -  {product.supportViewUrls.length} 张辅助角度  -  已锁 {product.lockedNodeCodes.length} 项细节
                </small>
              </div>
            </article>
          ))}
        </div>

        <div className="history-list">
          {props.items.length === 0 ? (
            <div className="history-empty">暂无记录</div>
          ) : (
            props.items.map((item) => (
              <article className={cn("history-item", expandedId === item.id && "expanded")} key={item.id}>
                <button
                  className="history-item-main"
                  type="button"
                  onClick={() => setExpandedId((current) => (current === item.id ? "" : item.id))}
                  aria-expanded={expandedId === item.id}
                >
                  <div>
                    <span className="history-type">{item.type}</span>
                    <strong>{item.title}</strong>
                    <small>{item.time}</small>
                  </div>
                  <div className="history-side">
                    <span
                      className={cn(
                        "history-status",
                        item.status === "成功" && "ok",
                        item.status === "失败" && "fail",
                      )}
                    >
                      {item.status}
                    </span>
                    <ChevronDown size={16} />
                  </div>
                </button>
                {expandedId === item.id && <HistoryDetail item={item} onOpenItem={() => props.onOpenItem(item)} />}
                <button className="icon-action subtle history-remove" aria-label="删除记录" onClick={() => props.onRemove(item.id)}>
                  <Trash2 size={15} />
                </button>
              </article>
            ))
          )}
        </div>
      </aside>
    </div>
  );
}

function HistoryDetail(props: { item: HistoryItem; onOpenItem: () => void }) {
  const storedAssetUrl = props.item.videoUrl || props.item.firstFrameUrl || props.item.detailUrl || "";
  const [resolvedAssetUrl, setResolvedAssetUrl] = useState(isHistoryAssetRef(storedAssetUrl) ? "" : storedAssetUrl);
  const [assetLoading, setAssetLoading] = useState(isHistoryAssetRef(storedAssetUrl));
  const assetUrl = isHistoryAssetRef(storedAssetUrl) ? resolvedAssetUrl : storedAssetUrl;
  const isVideoAsset = Boolean(props.item.videoUrl);

  useEffect(() => {
    let cancelled = false;
    setResolvedAssetUrl(isHistoryAssetRef(storedAssetUrl) ? "" : storedAssetUrl);
    setAssetLoading(isHistoryAssetRef(storedAssetUrl));
    if (!isHistoryAssetRef(storedAssetUrl)) return;
    readHistoryAsset(storedAssetUrl).then((url) => {
      if (cancelled) return;
      setResolvedAssetUrl(url);
      setAssetLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [storedAssetUrl]);

  const rows = [
    ["产品", props.item.productType],
    ["场景", props.item.sceneTitle],
    ["模型", props.item.model],
    ["画面比例", props.item.aspectRatio],
    ["视频时长", props.item.duration ? `${props.item.duration} 秒` : ""],
    ["动作模式", props.item.motionMode],
    ["任务号", props.item.taskId || props.item.id],
  ].filter(([, value]) => Boolean(value));

  return (
    <div className="history-detail">
      {assetLoading && <div className="history-asset-loading">正在恢复这条历史记录里的资产...</div>}
      {assetUrl && (
        <div className="history-asset-preview">
          {isVideoAsset ? (
            <video controls playsInline src={assetUrl} />
          ) : (
            <img src={assetUrl} alt={`${props.item.title}资产预览`} />
          )}
        </div>
      )}
      <div className="history-detail-actions">
        <button className="primary-action compact-action" type="button" onClick={props.onOpenItem}>
          载入到当前流程
        </button>
        {assetUrl && (
          <a className="secondary-action compact-action" href={assetUrl} target="_blank" rel="noreferrer">
            单独打开资产
          </a>
        )}
      </div>
      <div className="history-detail-grid">
        {rows.map(([label, value]) => (
          <span key={label}>
            <b>{label}</b>
            <em>{value}</em>
          </span>
        ))}
      </div>
      {props.item.scenePrompt && (
        <div className="history-detail-text">
          <b>剧情意图</b>
          <p>{props.item.scenePrompt}</p>
        </div>
      )}
      {props.item.videoPrompt && (
        <div className="history-detail-text">
          <b>视频提示词</b>
          <p>{props.item.videoPrompt}</p>
        </div>
      )}
      {props.item.error && (
        <div className="history-detail-text error">
          <b>失败原因</b>
          <p>{props.item.error}</p>
        </div>
      )}
      {props.item.productViewUrls && props.item.productViewUrls.length > 0 && (
        <div className="history-asset-strip">
          <b>产品四视图</b>
          <div>
            {props.item.productViewUrls.map((url, index) => (
              <img src={url} alt={`产品视图 ${index + 1}`} key={`${url}-${index}`} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
