import {
  Check,
  ChevronDown,
  ClipboardCheck,
  CloudUpload,
  Database,
  Download,
  FileImage,
  Film,
  KeyRound,
  LoaderCircle,
  Pause,
  Play,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  Volume2,
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
  kind?: "firstFrame" | "shot";
  useAsShot?: boolean;
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
  videoProvider: "shishi" | "wisech" | "kling" | "toapis";
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
  sourceScript?: string;
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
  renderedVideoPath?: string;
  renderedVideoFileName?: string;
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

type TimedScriptSegment = {
  start: number;
  end: number;
  body: string;
  subtitle: string;
  voiceover: string;
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
const DEFAULT_VIDEO_BASE_URL = "https://api.shishikeji.com";
const DEFAULT_VIDEO_MODEL = "2.0";
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

const VIDEO_PROVIDER_DURATION_CAPS: Record<ApiSettings["videoProvider"], { min: number; max: number; note: string }> = {
  shishi: { min: 5, max: 15, note: "石狮通道会按所选秒数提交，实际成片仍以上游返回为准。" },
  wisech: { min: 4, max: 15, note: "Wisech / 云书 Seedance 2.0 按官方区间可提交 4-15 秒；实际成片仍以上游返回为准。" },
  kling: { min: 3, max: 15, note: "Kling Direct 走官方 Omni-Video：默认一次提交完整脚本、已确认首帧和四视图参考；只有脚本明确按秒拆段时才启用 multi-shot。" },
  toapis: { min: 4, max: 15, note: "ToAPI video models use the backend key; the final clip length follows the upstream model response." },
};

const steps: Array<{ id: StepId; label: string; shortLabel: string; description: string; icon: LucideIcon }> = [
  { id: "upload", label: "上传产品四视图", shortLabel: "上传", description: "正面、左侧、右侧、背面四张核心图", icon: Upload },
  { id: "storyboard", label: "生成并确认首帧", shortLabel: "首帧", description: "贴脚本，先生首帧，确认后进视频", icon: ClipboardCheck },
  { id: "video", label: "生成视频", shortLabel: "视频", description: "通过执行包预检后一次提交", icon: Film },
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
  videoProvider: "shishi",
  videoBaseUrl: DEFAULT_VIDEO_BASE_URL,
  videoPath: "",
  videoApiKey: "",
  videoModel: DEFAULT_VIDEO_MODEL,
  promptModel: DEFAULT_PROMPT_MODEL,
};

const VIDEO_MODEL_OPTIONS: Record<ApiSettings["videoProvider"], readonly { value: string; label: string }[]> = {
  shishi: [
    { value: "fast", label: "fast - \u00a50.29/\u79d2 (3.5 \u79ef\u5206/\u79d2)" },
    { value: "2.0", label: "2.0 - \u00a50.50/\u79d2 (6 \u79ef\u5206/\u79d2)" },
    { value: "transit9-fast", label: "\u7279\u4ef7 fast - \u00a50.22/\u79d2 (40 \u79ef\u5206/\u6761\u6309 15s \u6298)" },
    { value: "transit9-2.0", label: "\u7279\u4ef7 2.0 - \u00a50.33/\u79d2 (60 \u79ef\u5206/\u6761\u6309 15s \u6298)" },
  ],
  wisech: [
    { value: "yunshu-2-0-260128-1080p", label: "\u4e91\u4e66 Seedance 2.0 - 1080p - \u00a52.48/\u79d2 - yunshu-2-0-260128-1080p" },
    { value: "yunshu-2-0-260128-720p", label: "\u4e91\u4e66 Seedance 2.0 - 720p - \u00a50.99/\u79d2 - yunshu-2-0-260128-720p" },
  ],
  kling: [
    { value: "kling-v3-omni", label: "Kling VIDEO 3.0 Omni - prompt + first frame + references - official pricing" },
    { value: "kling-video-o1", label: "Kling O1 Omni - references + first/end frame - official pricing" },
  ],
  toapis: [
    { value: "kling-v3", label: "kling-v3 - \u00a50.84/\u79d2 (12 credits/\u79d2)" },
    { value: "seedance-2-fast", label: "seedance-2-fast - \u00a51.44/\u79d2 (20.5714 credits/\u79d2)" },
    { value: "doubao-seedance-1-5-pro", label: "doubao-seedance-1-5-pro - \u00a50.62/\u79d2 (8.8 credits/\u79d2)" },
    { value: "grok-video-3", label: "grok-video-3 - \u00a50.14/\u79d2 (12 credits/\u6b21\u6309 6s \u6298)" },
  ],
} as const;

const VIDEO_PROVIDER_OPTIONS = [
  { value: "shishi", label: "石狮接口", baseUrl: "https://api.shishikeji.com", model: "2.0" },
  { value: "wisech", label: "Wisech / 云书 Seedance", baseUrl: "https://ai.wisech.com/v1", model: "yunshu-2-0-260128-1080p" },
  { value: "kling", label: "Kling Direct / 官方 Omni", baseUrl: "https://api-singapore.klingai.com", model: "kling-v3-omni" },
  { value: "toapis", label: "ToAPI", baseUrl: "https://toapis.com/v1", model: "kling-v3" },
] as const;

function getVideoProviderOption(value: ApiSettings["videoProvider"]) {
  return VIDEO_PROVIDER_OPTIONS.find((provider) => provider.value === value) || VIDEO_PROVIDER_OPTIONS[0];
}

function getVideoDurationCap(provider: ApiSettings["videoProvider"]) {
  return VIDEO_PROVIDER_DURATION_CAPS[provider] || VIDEO_PROVIDER_DURATION_CAPS.shishi;
}

function getVideoModelDurationCap(provider: ApiSettings["videoProvider"], model: string) {
  if (provider === "toapis" && /grok-video-3/i.test(model)) {
    return { min: 6, max: 6, note: "ToAPI grok-video-3 is treated as a fixed 6-second model; the backend clamps requests before submission." };
  }
  if (provider === "toapis" && /1-5|1\.5/i.test(model)) {
    return { min: 4, max: 12, note: "ToAPI Seedance 1.5 Pro requests are clamped to 4-12 seconds before submission." };
  }
  if (provider === "wisech" && /1-5|1\.5/i.test(model)) {
    return { min: 4, max: 12, note: "Seedance 1.5 Pro 官方 duration 区间为 4-12 秒，或设置为 -1 由模型自选。" };
  }
  if (provider === "wisech") {
    return { min: 4, max: 15, note: "Seedance 2.0 系列官方 duration 区间为 4-15 秒，或设置为 -1 由模型自选。" };
  }
  if (provider === "kling" && /o1/i.test(model)) {
    return { min: 3, max: 10, note: "Kling O1 Omni 常规图生视频时长按官方文档限制在 3-10 秒。" };
  }
  if (provider === "kling") {
    return { min: 3, max: 15, note: "Kling VIDEO 3.0 Omni 默认使用单条完整 prompt；multi-shot 只用于用户脚本已经明确按秒拆段的场景。" };
  }
  return getVideoDurationCap(provider);
}

function getVideoModelOptions(provider: ApiSettings["videoProvider"]) {
  return VIDEO_MODEL_OPTIONS[provider] || VIDEO_MODEL_OPTIONS.shishi;
}

function getDefaultVideoModel(provider: ApiSettings["videoProvider"]) {
  return getVideoProviderOption(provider).model || getVideoModelOptions(provider)[0]?.value || "";
}

function getVideoModelResolution(provider: ApiSettings["videoProvider"], model: string) {
  if (provider === "shishi") return "720p";
  if (provider === "wisech" && /720p/i.test(model)) return "720p";
  if (provider === "kling") return /4k/i.test(model) ? "4k" : "1080p";
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

function normalizeTimingLine(line: string) {
  const match = line.match(/^\s*(\d+(?:\.\d+)?)\s*(?:-|–|—|到|至)\s*(\d+(?:\.\d+)?)\s*秒?/);
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return { start, end };
}

function stripScriptLabel(line: string) {
  return line.replace(/^\s*(画面|字幕|旁白|配音|音效|音乐|镜头|场景|动作)\s*[:：]\s*/i, "").trim();
}

function getScriptLineLabel(line: string) {
  const match = line.match(/^\s*([A-Za-z\u4e00-\u9fa5]+)\s*[:：]/);
  return match ? match[1].trim().toLowerCase() : "";
}

function isTimedScriptLine(line: string) {
  return /^\s*(?:第\s*)?\d+(?:\.\d+)?\s*(?:-|~|–|—|到|至)\s*\d+(?:\.\d+)?\s*秒?/i.test(line);
}

function stripPostProductionTextFromScript(script: string) {
  const postLabels = new Set(["字幕", "subtitle", "subtitles", "caption", "captions", "旁白", "配音", "voiceover", "vo"]);
  const visualOrSoundLabels = new Set(["画面", "镜头", "场景", "动作", "音效", "音乐", "bgm", "sound", "sfx"]);
  const output: string[] = [];
  let skipping = false;
  for (const rawLine of script.split(/\r?\n/)) {
    const label = getScriptLineLabel(rawLine);
    if (isTimedScriptLine(rawLine)) {
      skipping = false;
      output.push(rawLine);
      continue;
    }
    if (postLabels.has(label)) {
      skipping = true;
      continue;
    }
    if (visualOrSoundLabels.has(label)) {
      skipping = false;
      output.push(rawLine);
      continue;
    }
    if (skipping) continue;
    output.push(rawLine);
  }
  return output.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function collectLabeledBlock(lines: string[], labels: string[]) {
  const labelPattern = new RegExp(`^\\s*(${labels.join("|")})\\s*[:：]\\s*(.*)$`, "i");
  const stopPattern = /^\s*(画面|字幕|旁白|配音|音效|音乐|镜头|场景|动作)\s*[:：]/i;
  const output: string[] = [];
  let collecting = false;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    const match = line.match(labelPattern);
    if (match) {
      collecting = true;
      if (match[2]?.trim()) output.push(match[2].trim());
      continue;
    }
    if (collecting && stopPattern.test(line)) break;
    if (collecting && line) output.push(line);
  }
  return output.join("\n").trim();
}

function parseTimedScriptSegments(script: string): TimedScriptSegment[] {
  const lines = script.split(/\r?\n/);
  const segments: Array<{ start: number; end: number; lines: string[] }> = [];
  let current: { start: number; end: number; lines: string[] } | null = null;
  for (const line of lines) {
    const timing = normalizeTimingLine(line);
    if (timing) {
      if (current) segments.push(current);
      current = { ...timing, lines: [] };
      continue;
    }
    if (current) current.lines.push(line);
  }
  if (current) segments.push(current);

  return segments.map((segment) => {
    const cleanLines = segment.lines.map((line) => line.trim()).filter(Boolean);
    const subtitle = collectLabeledBlock(cleanLines, ["字幕", "subtitle", "caption"]) || cleanLines.map(stripScriptLabel).filter(Boolean).join("\n");
    const voiceover = collectLabeledBlock(cleanLines, ["旁白", "配音", "voiceover", "vo"]) || subtitle;
    return {
      start: segment.start,
      end: segment.end,
      body: cleanLines.join("\n"),
      subtitle,
      voiceover,
    };
  });
}

function formatSrtTime(seconds: number) {
  const safe = Math.max(0, seconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = Math.floor(safe % 60);
  const millis = Math.round((safe - Math.floor(safe)) * 1000);
  return [hours, minutes, secs].map((item) => String(item).padStart(2, "0")).join(":") + `,${String(millis).padStart(3, "0")}`;
}

function formatTimelineTime(seconds: number) {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

function buildPostSubtitleDraft(script: string) {
  const segments = parseTimedScriptSegments(script);
  if (!segments.length) return script.trim();
  return segments.map((segment) => segment.subtitle).filter(Boolean).join("\n\n");
}

function buildPostVoiceoverDraft(script: string) {
  const segments = parseTimedScriptSegments(script);
  if (!segments.length) return script.trim();
  return segments.map((segment) => segment.voiceover).filter(Boolean).join("\n");
}

function buildSrtFromScript(script: string) {
  const segments = parseTimedScriptSegments(script).filter((segment) => segment.subtitle);
  return segments
    .map((segment, index) => [
      String(index + 1),
      `${formatSrtTime(segment.start)} --> ${formatSrtTime(segment.end)}`,
      segment.subtitle,
    ].join("\n"))
    .join("\n\n");
}

function downloadTextFile(fileName: string, text: string) {
  if (typeof window === "undefined") return;
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.URL.revokeObjectURL(url);
}

function createAudioObjectUrlFromBase64(base64: string, contentType = "audio/mpeg") {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return window.URL.createObjectURL(new Blob([bytes], { type: contentType }));
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return window.btoa(binary);
}

async function saveVideoAssetToDownloads(videoUrl: string) {
  let body: Record<string, string>;
  if (/^[A-Za-z]:[\\/]/.test(videoUrl)) {
    body = { sourcePath: videoUrl };
  } else if (/^https?:\/\//i.test(videoUrl)) {
    body = { url: videoUrl };
  } else {
    const sourceResponse = await fetch(videoUrl);
    if (!sourceResponse.ok) throw new Error("无法读取当前预览视频，请重新载入历史记录后再保存。");
    const sourceBlob = await sourceResponse.blob();
    if (!sourceBlob.size) throw new Error("当前预览视频为空，不能保存。");
    body = {
      dataBase64: arrayBufferToBase64(await sourceBlob.arrayBuffer()),
      contentType: sourceBlob.type || "video/mp4",
    };
  }
  const response = await fetch("/api/save-video-download", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(extractErrorMessage(data, response.status));
  }
  const record = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const filePath = typeof record.filePath === "string" ? record.filePath : "";
  if (!filePath) throw new Error("视频已保存，但没有拿到本地文件路径。");
  return filePath;
}

async function renderPostVideoToDownloads(
  videoUrl: string,
  segments: TimedScriptSegment[],
  voiceoverAudioBase64: string,
  voiceoverAudioContentType: string,
  includeSubtitles: boolean,
  includeVoiceover: boolean,
) {
  const body: Record<string, unknown> = {
    segments,
    voiceoverAudioBase64,
    voiceoverAudioContentType,
    includeSubtitles,
    includeVoiceover,
  };
  if (/^https?:\/\//i.test(videoUrl)) {
    body.sourceVideoUrl = videoUrl;
  } else {
    const sourceResponse = await fetch(videoUrl);
    if (!sourceResponse.ok) throw new Error("无法读取当前预览视频，请重新载入历史记录后再保存。");
    const sourceBlob = await sourceResponse.blob();
    if (!sourceBlob.size) throw new Error("当前预览视频为空，不能保存。");
    body.sourceVideoBase64 = arrayBufferToBase64(await sourceBlob.arrayBuffer());
    body.sourceVideoContentType = sourceBlob.type || "video/mp4";
  }
  const response = await fetch("/api/render-post-video", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(extractErrorMessage(data, response.status));
  }
  const record = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const filePath = typeof record.filePath === "string" ? record.filePath : "";
  const fileName = typeof record.fileName === "string" ? record.fileName : "";
  if (!filePath) throw new Error("完整 MP4 已生成，但没有拿到本地文件路径。");
  return { filePath, fileName };
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
    const normalizedVideoBaseUrl = typeof merged.videoBaseUrl === "string" ? merged.videoBaseUrl.replace(/\/+$/, "") : "";
    if (parsed.videoProvider !== "wisech" && parsed.videoProvider !== "shishi" && parsed.videoProvider !== "kling" && parsed.videoProvider !== "toapis") {
      merged.videoProvider =
        normalizedVideoBaseUrl === "https://ai.wisech.com/v1"
          ? "wisech"
          : normalizedVideoBaseUrl === "https://api-singapore.klingai.com" || normalizedVideoBaseUrl === "https://api-beijing.klingai.com"
            ? "kling"
          : normalizedVideoBaseUrl === "https://toapis.com/v1"
            ? "toapis"
            : "shishi";
    }
    if (
      !normalizedVideoBaseUrl ||
      normalizedVideoBaseUrl === "https://ai.wisech.com/v1" ||
      normalizedVideoBaseUrl === "https://dashscope.aliyuncs.com/api/v1" ||
      normalizedVideoBaseUrl === "https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis" ||
      normalizedVideoBaseUrl === "https://api.shishikeji.com" ||
      normalizedVideoBaseUrl === "https://api-singapore.klingai.com" ||
      normalizedVideoBaseUrl === "https://api-beijing.klingai.com" ||
      normalizedVideoBaseUrl === "https://toapis.com/v1"
    ) {
      merged.videoBaseUrl = defaultApiSettings.videoBaseUrl;
    }
    const provider = getVideoProviderOption(merged.videoProvider);
    merged.videoBaseUrl = provider.baseUrl;
    const videoModelText = typeof merged.videoModel === "string" ? merged.videoModel.trim() : "";
    if (
      !videoModelText ||
      videoModelText.startsWith("happyhorse-1.0") ||
      videoModelText === "fofo" ||
      videoModelText === "doubao-seedance-1-5-pro-251215" ||
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

function getHistorySortValue(item: HistoryItem) {
  const value = Date.parse(item.createdAt || item.time || "");
  return Number.isFinite(value) ? value : 0;
}

function getHistoryItemsStorageSignature(items: HistoryItem[]) {
  return JSON.stringify(items.slice(0, MAX_HISTORY_ITEMS).map(sanitizeHistoryItemForStorage));
}

function mergeHistoryItems(currentItems: HistoryItem[], incomingItems: HistoryItem[]) {
  const byId = new Map<string, HistoryItem>();
  for (const item of currentItems) byId.set(item.id, item);
  for (const item of incomingItems) {
    const existing = byId.get(item.id);
    byId.set(item.id, existing ? { ...existing, ...item } : item);
  }
  const mergedItems = Array.from(byId.values())
    .sort((first, second) => getHistorySortValue(second) - getHistorySortValue(first))
    .slice(0, MAX_HISTORY_ITEMS);
  return getHistoryItemsStorageSignature(mergedItems) === getHistoryItemsStorageSignature(currentItems)
    ? currentItems
    : mergedItems;
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
    type: kind === "firstFrame" ? "首帧" : "视频",
    title: kind === "firstFrame" ? "首帧生成" : "视频生成",
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

function isLocalVideoPath(value?: string) {
  return typeof value === "string" && /^[A-Za-z]:[\\/].+\.mp4$/i.test(value);
}

function getLocalVideoAssetUrl(value?: string) {
  return isLocalVideoPath(value) ? `/api/local-video?path=${encodeURIComponent(value || "")}` : "";
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
  if (storedItems.length > 0) {
    void fetch("/api/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: storedItems }),
    }).catch(() => undefined);
  }
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

function clearSavedHistoryItems() {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(HISTORY_STORAGE_KEY);
    } catch {
      // Ignore storage cleanup failures.
    }
  }
  void fetch("/api/history", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: [] }),
  }).catch(() => undefined);
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

function extractErrorMessage(data: unknown, status = 0) {
  const fallback =
    status === 404
      ? "页面没有接到后端接口。请确认本项目的 API 服务正在运行，并且前端代理或线上路由已经把 /api 指到后端。"
      : "这次请求没有成功，请稍后再试。";
  if (!data || typeof data !== "object") return fallback;
  const record = data as Record<string, unknown>;
  const nestedData = record.data && typeof record.data === "object" ? (record.data as Record<string, unknown>) : {};
  for (const value of [record.task_status_msg, record.fail_reason, nestedData.task_status_msg, nestedData.fail_reason]) {
    if (typeof value === "string" && value.trim()) return toUserMessage(value);
  }
  const error = record.error;
  if (typeof error === "string") return toUserMessage(error);
  if (error && typeof error === "object") {
    const errorRecord = error as Record<string, unknown>;
    if (typeof errorRecord.message === "string") return toUserMessage(errorRecord.message);
    if (typeof errorRecord.code === "string") return toUserMessage(errorRecord.code);
  }
  if (typeof record.message === "string") return toUserMessage(record.message);
  if (typeof record.code === "string") return toUserMessage(record.code);
  const nestedError = nestedData.error && typeof nestedData.error === "object" ? (nestedData.error as Record<string, unknown>) : {};
  if (typeof nestedError.message === "string") return toUserMessage(nestedError.message);
  if (typeof nestedError.code === "string") return toUserMessage(nestedError.code);
  if (typeof record.raw === "string" && record.raw.includes("Error code 524")) {
    return "这次处理时间太久了，请稍后再试。";
  }
  return status === 404 ? fallback : "这次请求没有成功，请稍后再试；如果一直失败，请让管理员检查服务配置。";
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

function toUserMessage(message: string) {
  const text = message.trim();
  if (!text) return "这次请求没有成功，请稍后再试。";
  if (/server_error|retry your request|An error occurred while processing your request/i.test(text)) {
    const requestId =
      text.match(/request ID\s+([0-9a-f-]{12,})/i)?.[1] ||
      text.match(/request[_\s-]?id["']?\s*[:=]\s*["']?([0-9a-f-]{12,})/i)?.[1] ||
      "";
    return `上游服务这次内部处理失败，系统已经停止本次任务。可以直接重试一次${requestId ? `；请求编号：${requestId}` : ""}。`;
  }
  if (/InputTextSensitiveContentDetected|sensitive information|sensitive content|敏感/i.test(text)) {
    return "视频通道拦截了本次完整请求。这不一定是你输入的单句提示词有问题，也可能来自系统拼接后的产品锁、首帧图、素材组合或上游通道策略。";
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
  if (/上游图片服务连接失败|上游视频服务连接失败|首帧生成服务暂时连不上|分镜生成服务暂时连不上|视频生成服务暂时连不上/i.test(text)) {
    return text;
  }
  if (/timeout|timed out|Error code 524|超时/i.test(text)) {
    return "这次处理时间太久了，请稍后再试。";
  }
  if (/Failed to fetch|NetworkError|fetch failed|ECONNREFUSED|服务暂时连不上/i.test(text)) {
    return "服务暂时连不上，请确认本地服务还在运行后再试。";
  }
  if (/非 JSON|non.?json|Not found|404|接口路径|路径/i.test(text)) {
    return "服务地址可能配置不对，请让管理员检查接口地址。";
  }
  if (/Preset image unavailable|preset images failed/i.test(text)) {
    return "本地预设图片没有加载成功，请刷新页面或重新选择产品。";
  }
  if (/image\/url|图片地址|image_url|b64_json/i.test(text)) {
    return "这次没有拿到首帧图片结果，请稍后再试，或换一个首帧模型。";
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

function createManualStoryIntent(script: string, productType: string, motionMode: MotionMode): StoryIntent {
  const text = stripPostProductionTextFromScript(script).trim() || "产品在生活化场景里完成一个轻松、可见、低风险的小动作。";
  return {
    storyTitle: "用户视频脚本",
    storyIntent: text,
    sceneAnchor: text,
    motionMode,
    productType,
    stableProductName: productType,
    beats: [
      {
        id: "manual_script",
        beat: "首帧确认后的完整动作脚本",
        action: text,
        camera: "front",
      },
    ],
    riskNotes: [],
  };
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
  const [storyIntent, setStoryIntent] = useState<StoryIntent | null>(null);
  const [storyboards, setStoryboards] = useState<StoryboardFrame[]>([]);
  const [selectedStoryboardIds, setSelectedStoryboardIds] = useState<string[]>([]);
  const [storyboardPreflight, setStoryboardPreflight] = useState<StoryboardPreflight | null>(null);
  const [videoExecutionPackage, setVideoExecutionPackage] = useState<VideoExecutionPackage | null>(null);
  const [storyboardError, setStoryboardError] = useState("");
  const [videoError, setVideoError] = useState("");
  const [videoTaskId, setVideoTaskId] = useState("");
  const [videoStatus, setVideoStatus] = useState<VideoStatus>("idle");
  const [videoUrl, setVideoUrl] = useState("");
  const [currentVideoHistoryItemId, setCurrentVideoHistoryItemId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [testing, setTesting] = useState<"image" | "video" | "">("");
  const [activeJob, setActiveJob] = useState<WorkflowJobKind | "">("");
  const [progressEvents, setProgressEvents] = useState<ProgressEvent[]>([]);
  const currentJobIdRef = useRef("");
  const backendHistorySyncedRef = useRef(false);

  useEffect(() => {
    saveApiSettings(apiSettings);
  }, [apiSettings]);

  function patchHistoryItem(id: string, patch: Partial<HistoryItem>) {
    if (!id) return;
    setHistoryItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function saveRenderedVideoHistory(filePath: string, fileName: string) {
    if (!filePath) return;
    const title = fileName ? `字幕旁白完整视频：${fileName}` : "字幕旁白完整视频";
    const historyItem = createHistoryItem(
      `POST-${Date.now()}`,
      "video",
      "成功",
      createHistoryDetail("video", "成功", {
        title,
        taskId: videoTaskId || currentVideoHistoryItemId || undefined,
        videoUrl: videoUrl || undefined,
        detailUrl: videoUrl || undefined,
        renderedVideoPath: filePath,
        renderedVideoFileName: fileName,
      }),
    );
    setHistoryItems((current) => upsertHistoryItem(current, historyItem));
  }

  useEffect(() => {
    if (!backendHistorySyncedRef.current) return;
    saveHistoryItems(historyItems);
  }, [historyItems]);

  function syncHistoryFromBackend() {
    return fetch("/api/history")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: unknown) => {
        if (!data || typeof data !== "object") return;
        const items = (data as { items?: unknown }).items;
        if (!Array.isArray(items)) {
          backendHistorySyncedRef.current = true;
          return;
        }
        const restoredItems = items.filter(isHistoryItem).map((item) => ({ ...item, createdAt: item.createdAt || item.time })).slice(0, MAX_HISTORY_ITEMS);
        if (restoredItems.length) setHistoryItems((current) => mergeHistoryItems(current, restoredItems));
        backendHistorySyncedRef.current = true;
      })
      .catch(() => {
        backendHistorySyncedRef.current = true;
      });
  }

  useEffect(() => {
    let cancelled = false;
    const syncIfActive = () => {
      if (!cancelled) void syncHistoryFromBackend();
    };
    syncIfActive();
    window.addEventListener("focus", syncIfActive);
    const intervalId = window.setInterval(syncIfActive, 5000);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", syncIfActive);
      window.clearInterval(intervalId);
    };
  }, []);

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
  const selectedStoryboardAnchor = selectedStoryboards[0]?.imageUrl || "";
  const videoReady = uploadReady && Boolean(videoExecutionPackage?.ok) && Boolean(selectedStoryboardAnchor);
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
      sourceScript: storyDirection,
      scenePrompt: storyIntent?.storyIntent || storyDirection,
      videoPrompt: videoExecutionPackage?.finalVideoPrompt || storyIntent?.storyIntent || "",
      model: kind === "firstFrame" ? apiSettings.imageModel : apiSettings.videoModel,
      aspectRatio,
      duration: kind === "video" ? actualVideoDuration : undefined,
      requestedDuration: kind === "video" ? requestedVideoDuration : undefined,
      motionMode: kind === "video" ? motionMode : undefined,
      firstFrameUrl: selectedStoryboardAnchor || undefined,
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

  const normalizedVideoBaseUrlForRequest = typeof apiSettings.videoBaseUrl === "string" ? apiSettings.videoBaseUrl.trim().replace(/\/+$/, "") : "";
  const usesFixedVideoBackend =
    apiSettings.videoProvider === "shishi" ||
    apiSettings.videoProvider === "wisech" ||
    apiSettings.videoProvider === "kling" ||
    apiSettings.videoProvider === "toapis" ||
    !normalizedVideoBaseUrlForRequest ||
    normalizedVideoBaseUrlForRequest === defaultApiSettings.videoBaseUrl;
  const videoBaseUrlForRequest = usesFixedVideoBackend ? "" : apiSettings.videoBaseUrl;
  const videoApiKeyForRequest = usesFixedVideoBackend ? "" : apiSettings.videoApiKey;
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
    video_execution_package: videoExecutionPackage,
    motion_rule: videoExecutionPackage?.cameraPath ? `Use verified storyboard camera path: ${videoExecutionPackage.cameraPath}` : motionText,
    image_url: selectedStoryboardAnchor || "PASTE_APPROVED_FIRST_FRAME_URL",
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
  const usesKlingDirect = apiSettings.videoProvider === "kling";
  const videoSubmitPayload = {
    ...videoPayload,
    image_urls: usesKlingDirect ? requiredUrls : [],
    support_image_urls: usesKlingDirect ? supportImageUrls : [],
    detail_image_urls: [],
    storyboards: usesKlingDirect ? selectedStoryboards : selectedStoryboards.map(redactStoryboardImageForSubmit),
    video_execution_package: slimVideoExecutionPackage,
  };
  const videoSafetyPayload = {
    ...videoSubmitPayload,
    image_url: "",
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
      const next = { ...current, ...patch, imagePath: "", videoPath: "" };
      if (patch.videoProvider) {
        const provider = getVideoProviderOption(patch.videoProvider);
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

  async function requestStoryboards() {
    const intent = storyIntent || createManualStoryIntent(storyDirection, costumeType, motionMode);
    if (!intent.storyIntent.trim()) {
      setStoryboardError("请先贴上视频脚本或动作文字，再生成首帧。");
      return;
    }
    setActiveJob("storyboard");
    resetProgress("storyboard", "首帧生成");
    setStoryboardError("");
    setVideoError("");
    try {
      addProgressEvent("step.started", "整理四视图和脚本", "把四张核心视图、辅助角度、结构化锁点和用户脚本打包给首帧模型。");
      const requestPayload = {
        ...(await prepareFirstFramePayloadForSubmit({
          ...storyboardPayload,
          scene_prompt: stripPostProductionTextFromScript(intent.storyIntent),
          story_intent: intent,
        })),
      };
      addProgressEvent("tool.started", "提交首帧模型", "先生成一张首帧，用户确认后再进入 Kling 视频生成。");
      const response = await fetch("/api/first-frame", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload),
      });
      const data: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(extractErrorMessage(data, response.status));
      const firstFrameUrl = extractImageUrl(data);
      if (!firstFrameUrl) throw new Error("首帧模型没有返回可用图片。");
      const firstFrame: StoryboardFrame = {
        id: `first-frame-${Date.now()}`,
        imageUrl: firstFrameUrl,
        beat: "已确认首帧",
        action: intent.storyIntent,
        viewAngle: "front",
        kind: "firstFrame",
        useAsShot: false,
        checks: [{ id: "first_frame_anchor", status: "pending", detail: "Waiting for user approval before video generation." }],
      };
      setStoryIntent(intent);
      setStoryboards([firstFrame]);
      setSelectedStoryboardIds([firstFrame.id]);
      setStoryboardPreflight(null);
      setVideoExecutionPackage(null);
      invalidateVideoOutputs();
      setHistoryItems((current) =>
        upsertHistoryItem(current, createHistoryItem(firstFrame.id, "firstFrame", "成功", createHistoryDetail("firstFrame", "成功", { firstFrameUrl }))),
      );
      addProgressEvent("artifact.created", "首帧已返回", "请确认首帧是否可用；确认后会把首帧和四视图一起提交给 Kling。", "done");
      addProgressEvent("job.completed", "首帧生成完成", "下一步确认首帧并进入视频生成。", "done");
    } catch (error) {
      const message = error instanceof Error ? toUserMessage(error.message) : "首帧没有生成成功，请稍后再试。";
      addProgressEvent("step.failed", "首帧生成失败", message, "failed");
      setStoryboardError(message);
    } finally {
      setActiveJob("");
    }
  }

  async function compileVideoPackage() {
    const intent = storyIntent || createManualStoryIntent(storyDirection, costumeType, motionMode);
    if (!intent || selectedStoryboards.length < 1) {
      setStoryboardError("请先生成并确认一张首帧，再进入视频生成。");
      return;
    }
    setActiveJob("storyboard");
    resetProgress("storyboard", "执行包预检");
    setStoryboardError("");
    setVideoError("");
    try {
      const payload = {
        product_type: costumeType,
        story_intent: intent,
        storyboards: selectedStoryboards,
        locked_nodes: lockedNodePayload,
        motion_mode: motionMode,
        video_provider: apiSettings.videoProvider,
        model: apiSettings.videoModel,
      };
      addProgressEvent("tool.started", "提交前预检", "检查首帧、脚本、文字禁用项和产品锁点。");
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
      setStoryIntent(intent);
      addProgressEvent("artifact.created", "视频执行包已编译", "视频页将使用首帧、四视图和一次性脚本提交给视频模型。", "done");
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
    const restoredScript = item.sourceScript || item.scenePrompt || item.videoPrompt || "";
    const restoredVideoUrl =
      item.videoUrl || getLocalVideoAssetUrl(item.renderedVideoPath) || (item.type === "视频" ? item.detailUrl : "") || "";
    if (restoredScript) setStoryDirection(restoredScript);
    if (item.aspectRatio) setAspectRatio(item.aspectRatio);
    if (item.duration) setDuration(item.requestedDuration || item.duration);
    if (item.motionMode) setMotionMode(item.motionMode);
    if (item.taskId) setVideoTaskId(item.taskId);
    if (item.firstFrameUrl) {
      const restoredStoryboard: StoryboardFrame = {
        id: `history-storyboard-${item.id}`,
        imageUrl: item.firstFrameUrl,
        beat: restoredScript || "历史首帧图",
        action: item.videoPrompt || "历史执行包动作",
        viewAngle: "front",
        checks: [],
      };
      setStoryboards([restoredStoryboard]);
      setSelectedStoryboardIds([restoredStoryboard.id]);
    }
    if (restoredVideoUrl) setVideoUrl(restoredVideoUrl);
    setVideoStatus(restoredVideoUrl ? "succeeded" : item.type === "视频" && item.status === "处理中" ? "polling" : "idle");
    setStoryboardError(item.firstFrameUrl ? "已从历史记录载入首帧资产。" : "");
    setVideoError(restoredVideoUrl ? "已从历史记录载入视频资产，可继续处理字幕和旁白。" : item.error || "");
    setActiveStep(restoredVideoUrl || item.type === "视频" ? "video" : "storyboard");
  }

  function inferHistoryVideoProvider(item: HistoryItem): ApiSettings["videoProvider"] {
    const model = (item.model || "").toLowerCase();
    if (model.includes("kling")) return "kling";
    if (model.includes("yunshu") || model.includes("wisech")) return "wisech";
    if (model.includes("toapis")) return "toapis";
    return "shishi";
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
            video_provider: inferHistoryVideoProvider(resolvedItem),
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
    if (!videoExecutionPackage?.ok || !selectedStoryboardAnchor) {
      setVideoError("请先在首帧确认页通过预检并生成视频执行包。");
      return;
    }
    resetProgress("video", "视频生成");
    setIsSubmitting(true);
    setVideoError("");
    setVideoTaskId("");
    setVideoUrl("");
    setVideoStatus("submitted");
    try {
      addProgressEvent("step.started", "输入检查", "检查执行包、首帧、视频模型和时长。");
      const requestPayload = videoSubmitPayload;
      addProgressEvent("tool.completed", "视频请求整理完成", "已把首帧、四视图、产品锁点、动作路径和执行包组合成完整请求。", "done");
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
      const historyItemId = newTaskId || `LOCAL-${Date.now()}`;
      const historyDetail = createHistoryDetail("video", nextHistoryStatus, {
        taskId: newTaskId || undefined,
        detailUrl: immediateVideoUrl,
        firstFrameUrl: selectedStoryboardAnchor || undefined,
        videoUrl: immediateVideoUrl || undefined,
      });
      setCurrentVideoHistoryItemId(historyItemId);
      setHistoryItems((current) => upsertHistoryItem(current, createHistoryItem(historyItemId, "video", nextHistoryStatus, historyDetail)));
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
        if (nextVideoUrl || status === "SUCCEEDED" || status === "SUCCESS" || status === "SUCCEED") {
          if (!nextVideoUrl) {
            throw new Error("视频已完成，但暂时没有拿到播放地址，请稍后再查一次。");
          }
          setVideoUrl(nextVideoUrl);
          setVideoStatus("succeeded");
          setVideoError("视频生成好了。");
          addProgressEvent("artifact.created", "视频地址已返回", "上游任务完成，已拿到视频播放地址。", "done");
          addProgressEvent("job.completed", "视频任务完成", "视频生成流程已完成。", "done");
          setCurrentVideoHistoryItemId(videoTaskId);
          setHistoryItems((current) =>
            current.map((item) => (item.id === videoTaskId ? { ...item, status: "成功", detailUrl: nextVideoUrl, videoUrl: nextVideoUrl } : item)),
          );
          setActiveStep("video");
          return;
        }

        if (status === "FAILED" || status === "FAILURE" || status === "ERROR" || status === "CANCELED" || status === "UNKNOWN") {
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

  async function testApi(kind: "image" | "video") {
    setTesting(kind);
    setStoryboardError("");
    setVideoError("");
    try {
      const response = await fetch(kind === "image" ? "/api/test-image" : "/api/test-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(kind === "image" ? storyboardPayload : videoPayload),
      });
      const data: unknown = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(extractErrorMessage(data, response.status));
      }
      const message = kind === "image" ? "首帧服务连接正常。" : "视频服务连接正常。";
      if (kind === "image") setStoryboardError(message);
      if (kind === "video") setVideoError(message);
    } catch (error) {
      const message = error instanceof Error ? toUserMessage(error.message) : "服务测试没有通过，请稍后再试。";
      if (kind === "image") setStoryboardError(message);
      if (kind === "video") setVideoError(message);
    } finally {
      setTesting("");
    }
  }

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
              <span className="block truncate text-[14px] font-bold text-[#607276]">四视图锁定  -  首帧确认  -  Kling 视频生成</span>
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
              clearSavedHistoryItems();
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
                  storyIntent={storyIntent}
                  storyboards={storyboards}
                  selectedStoryboardIds={selectedStoryboardIds}
                  preflight={storyboardPreflight}
                  videoPackage={videoExecutionPackage}
                  apiSettings={apiSettings}
                  aspectRatio={aspectRatio}
                  motionMode={motionMode}
                  productViews={slots}
                  error={storyboardError}
                  canGenerate={storyIntentCanGenerate}
                  isSubmitting={isSubmitting}
                  progressEvents={progressEvents}
                  activeJob={activeJob}
                  onGenerateStoryboards={requestStoryboards}
                  onCompilePackage={compileVideoPackage}
                  onToggleStoryboard={toggleStoryboardSelection}
                />
              )}
              {activeStep === "video" && (
                <VideoStep
                  apiSettings={apiSettings}
                  updateApiSettings={updateApiSettings}
                  duration={actualVideoDuration}
                  requestedDuration={requestedVideoDuration}
                  setDuration={updateVideoDuration}
                  motionMode={motionMode}
                  setMotionMode={setMotionMode}
                  canGenerate={videoReady}
                  isSubmitting={isSubmitting}
                  isTesting={testing === "video"}
                  error={videoError}
                  aspectRatio={aspectRatio}
                  firstFrameUrl={selectedStoryboardAnchor}
                  status={videoStatus}
                  statusText={videoStatusText}
                  taskId={videoTaskId}
                  videoUrl={videoUrl}
                  videoPrompt={videoExecutionPackage?.finalVideoPrompt || ""}
                  sourceScript={storyDirection}
                  historyItemId={currentVideoHistoryItemId}
                  progressEvents={progressEvents}
                  onGenerate={() => callBackend("video")}
                  onTest={() => testApi("video")}
                  onPatchHistoryItem={patchHistoryItem}
                  onSaveRenderedVideoHistory={saveRenderedVideoHistory}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
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
              <button className="icon-action subtle history-remove" type="button" aria-label="删除记录" onClick={(event) => {
                event.stopPropagation();
                props.onRemove(item.id);
              }}>
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
      <div className="lock-note">核心四视图上传后进入脚本和首帧确认。正面、左侧、右侧、背面用于锁定尺寸、比例、外形和拓扑；选择本地预设产品时，已保存的辅助角度会在后台自动作为一致性证据进入模型。</div>
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
  storyIntent: StoryIntent | null;
  storyboards: StoryboardFrame[];
  selectedStoryboardIds: string[];
  preflight: StoryboardPreflight | null;
  videoPackage: VideoExecutionPackage | null;
  apiSettings: ApiSettings;
  aspectRatio: string;
  motionMode: MotionMode;
  productViews: UploadSlot[];
  error: string;
  canGenerate: boolean;
  isSubmitting: boolean;
  progressEvents: ProgressEvent[];
  activeJob: WorkflowJobKind | "";
  onGenerateStoryboards: () => void;
  onCompilePackage: () => void;
  onToggleStoryboard: (id: string) => void;
}) {
  const hasFirstFrame = props.selectedStoryboardIds.length > 0;
  const working = props.activeJob === "storyboard";
  return (
    <section className="stage-panel">
      <StageHeader eyebrow="第 2 步" title="脚本生成首帧" />
      <div className="lock-note">贴上一次性视频脚本或动作文字，先自动生成一张首帧；用户确认首帧后，下一步会像 Kling 一样把同一段脚本、首帧和四视图一起提交视频模型。</div>
      <div className="two-col">
        <div className="stack">
          <div className="scenario-card prompt-card first-frame-script-card">
            <div className="prompt-label-row">
              <span>视频脚本 / 动作文字</span>
            </div>
            <textarea value={props.storyDirection} onChange={(event) => props.setStoryDirection(event.target.value)} placeholder="把视频脚本直接贴在这里。默认按一整段 prompt 生成首帧；如果你自己写了 0-2 秒、2-5 秒这样的节奏，后面视频再按这个节奏处理。" />
            <div className="center-flow-actions">
              <button className="primary-action" type="button" disabled={!props.canGenerate || working} onClick={props.onGenerateStoryboards}>
                {working ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />}
                生成首帧
              </button>
            </div>
          </div>
          <div className="storyboard-reference-grid">
            {props.productViews.map((slot) => (
              <div className="review-pane" key={slot.id}>
                <div className="review-pane-head">
                  <strong>{slot.label}</strong>
                  <span>{slot.badge}</span>
                </div>
                {slot.localUrl ? (
                  <img className="review-image" src={slot.localUrl} alt={slot.label} />
                ) : (
                  <div className="frame-placeholder compact">
                    <FileImage size={34} />
                    <strong>等待{slot.label}</strong>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="storyboard-grid first-frame-review-grid">
            {props.storyboards.length === 0 ? (
              <div className="frame-placeholder storyboard-empty">
                <Wand2 size={38} />
                <strong>等待首帧</strong>
              </div>
            ) : (
              props.storyboards.map((storyboard) => {
                const selected = props.selectedStoryboardIds.includes(storyboard.id);
                return (
                  <button className={cn("storyboard-card", selected && "selected")} type="button" key={storyboard.id} onClick={() => props.onToggleStoryboard(storyboard.id)}>
                    <img src={storyboard.imageUrl} alt={storyboard.beat} />
                    <span>{storyboard.viewAngle}</span>
                    <strong>{storyboard.beat}</strong>
                    <small>{storyboard.action}</small>
                  </button>
                );
              })
            )}
          </div>
          <div className="center-flow-actions">
            <button className="secondary-action confirm-first-frame-action" disabled={!hasFirstFrame || working} onClick={props.onCompilePackage}>
              {working ? <LoaderCircle className="spin" size={16} /> : <ShieldCheck size={16} />}
              确认首帧并进入视频
            </button>
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
        </div>
        <div className="parameter-panel">
          <h3>首帧状态</h3>
          <div className="api-fixed-note">
            <strong>模型</strong>
            <span>{props.apiSettings.imageModel}</span>
          </div>
          <div className="api-fixed-note">
            <strong>比例</strong>
            <span>{props.aspectRatio}</span>
          </div>
          <div className="api-fixed-note">
            <strong>一致性</strong>
            <span>{props.motionMode === "strict" ? "高一致性" : props.motionMode === "creative" ? "创意" : "平衡"}</span>
          </div>
          {props.error && <div className={cn("field-error", getStatusMessageTone(props.error))}>{props.error}</div>}
          {!props.canGenerate && <div className="field-hint">请先确认四张核心视图已加载。</div>}
          {props.canGenerate && !hasFirstFrame && <div className="field-hint">中间粘贴脚本后生成首帧。</div>}
          <ProgressPanel events={props.progressEvents} emptyText="生成首帧或确认执行包时会显示真实步骤。" />
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
  motionMode: MotionMode;
  setMotionMode: (value: MotionMode) => void;
  canGenerate: boolean;
  isSubmitting: boolean;
  isTesting: boolean;
  error: string;
  aspectRatio: string;
  firstFrameUrl: string;
  status: VideoStatus;
  statusText: string;
  taskId: string;
  videoUrl: string;
  videoPrompt: string;
  sourceScript: string;
  historyItemId: string;
  progressEvents: ProgressEvent[];
  onGenerate: () => void;
  onTest: () => void;
  onPatchHistoryItem: (id: string, patch: Partial<HistoryItem>) => void;
  onSaveRenderedVideoHistory: (filePath: string, fileName: string) => void;
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
              <video controls controlsList="nodownload" playsInline src={props.videoUrl} />
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
          <PostProductionPanel
            sourceScript={props.sourceScript}
            videoUrl={props.videoUrl}
            historyItemId={props.historyItemId}
            onPatchHistoryItem={props.onPatchHistoryItem}
            onSaveRenderedVideoHistory={props.onSaveRenderedVideoHistory}
          />
        </div>
        <div className="parameter-panel">
          <h3>视频参数</h3>
          <label>
            视频站点
            <select value={props.apiSettings.videoProvider} onChange={(event) => props.updateApiSettings({ videoProvider: event.target.value as ApiSettings["videoProvider"] })}>
              {VIDEO_PROVIDER_OPTIONS.map((provider) => (
                <option key={provider.value} value={provider.value}>
                  {provider.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            视频模型
            <select value={props.apiSettings.videoModel} onChange={(event) => props.updateApiSettings({ videoModel: event.target.value })}>
              {modelOptions.map((model) => (
                <option key={model.value} value={model.value}>
                  {model.label}
                </option>
              ))}
            </select>
          </label>
          <button className="secondary-action full-width" type="button" onClick={props.onTest} disabled={props.isTesting}>
            {props.isTesting ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}
            测试接口
          </button>
          <label>
            视频接口
            <input
              value={props.apiSettings.videoBaseUrl}
              readOnly
              placeholder={DEFAULT_VIDEO_BASE_URL}
              autoComplete="off"
              name="video-api-url"
            />
          </label>
          <label>
            视频 API Key
            <div className="key-input">
              <KeyRound size={16} />
              <input
                value={props.apiSettings.videoApiKey}
                type="password"
                readOnly
                placeholder="后台按所选站点自动配置"
                autoComplete="new-password"
                name="video-api-token"
              />
            </div>
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
          <div className="segmented">
            {[
              ["strict", "高一致性"],
              ["balanced", "平衡"],
              ["creative", "创意"],
            ].map(([value, label]) => (
              <button
                key={value}
                className={props.motionMode === value ? "active" : ""}
                onClick={() => props.setMotionMode(value as MotionMode)}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="video-prompt-editor">
            视频提示词
            <textarea
              value={props.videoPrompt}
              readOnly
              placeholder="执行包通过预检后自动生成，不在视频提交前手工改写。"
            />
          </label>
          <button className="primary-action" disabled={!props.canGenerate || isWorking} onClick={props.onGenerate}>
            {isWorking ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}
            {isWorking ? "生成中" : "生成视频"}
          </button>
          {props.error && <div className={cn("field-error", getStatusMessageTone(props.error))}>{props.error}</div>}
          <ProgressPanel events={props.progressEvents} emptyText="视频生成开始后会显示安全预检、提交、轮询和产物返回。" />
        </div>
      </div>
    </section>
  );
}

function PostProductionPanel(props: {
  sourceScript: string;
  videoUrl: string;
  historyItemId: string;
  onPatchHistoryItem: (id: string, patch: Partial<HistoryItem>) => void;
  onSaveRenderedVideoHistory: (filePath: string, fileName: string) => void;
}) {
  const [generatedSegments, setGeneratedSegments] = useState<TimedScriptSegment[]>([]);
  const [editableSegments, setEditableSegments] = useState<TimedScriptSegment[]>([]);
  const [voiceoverAudioUrl, setVoiceoverAudioUrl] = useState("");
  const [voiceoverAudioBase64, setVoiceoverAudioBase64] = useState("");
  const [voiceoverAudioContentType, setVoiceoverAudioContentType] = useState("audio/mpeg");
  const [voiceGender, setVoiceGender] = useState<"female" | "male">("female");
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(true);
  const [voiceoverEnabled, setVoiceoverEnabled] = useState(true);
  const [assetStatus, setAssetStatus] = useState("");
  const [isGeneratingAssets, setIsGeneratingAssets] = useState(false);
  const [isDownloadingVideo, setIsDownloadingVideo] = useState(false);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [previewTime, setPreviewTime] = useState(0);
  const [previewDuration, setPreviewDuration] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const voiceoverAudioRef = useRef<HTMLAudioElement | null>(null);
  const sourceSegments = useMemo(() => parseTimedScriptSegments(props.sourceScript), [props.sourceScript]);
  const voiceoverText = useMemo(() => editableSegments.map((segment) => segment.voiceover.trim()).filter(Boolean).join("\n"), [editableSegments]);
  const activeSubtitle = useMemo(
    () => (subtitlesEnabled ? generatedSegments.find((segment) => previewTime >= segment.start && previewTime < segment.end)?.subtitle || "" : ""),
    [generatedSegments, previewTime, subtitlesEnabled],
  );
  const canGenerateAssets = Boolean(props.videoUrl && editableSegments.length && (subtitlesEnabled || (voiceoverEnabled && voiceoverText.trim())));

  useEffect(() => {
    setEditableSegments(sourceSegments);
    setGeneratedSegments([]);
    setPreviewTime(0);
    setPreviewDuration(0);
    setIsPreviewPlaying(false);
    setAssetStatus("");
    setVoiceoverAudioBase64("");
    setVoiceoverAudioContentType("audio/mpeg");
    setVoiceoverAudioUrl((current) => {
      if (current) window.URL.revokeObjectURL(current);
      return "";
    });
  }, [sourceSegments, props.videoUrl]);

  useEffect(() => () => {
    if (voiceoverAudioUrl) window.URL.revokeObjectURL(voiceoverAudioUrl);
  }, [voiceoverAudioUrl]);

  function updateEditableSegment(index: number, field: "subtitle" | "voiceover", value: string) {
    setEditableSegments((current) =>
      current.map((segment, segmentIndex) => (segmentIndex === index ? { ...segment, [field]: value } : segment)),
    );
  }

  async function syncVoiceoverWithVideo(video: HTMLVideoElement) {
    const audio = voiceoverAudioRef.current;
    if (!voiceoverEnabled || !audio || !voiceoverAudioUrl) return;
    if (Math.abs(audio.currentTime - video.currentTime) > 0.25) {
      audio.currentTime = Math.min(Math.max(video.currentTime, 0), Number.isFinite(audio.duration) ? audio.duration : video.currentTime);
    }
    if (video.paused || video.ended) {
      audio.pause();
      return;
    }
    await audio.play().catch(() => undefined);
  }

  async function togglePreviewPlayback() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused || video.ended) {
      await video.play().catch(() => undefined);
      await syncVoiceoverWithVideo(video);
    } else {
      video.pause();
      voiceoverAudioRef.current?.pause();
    }
  }

  function seekPreview(value: string) {
    const nextTime = Number(value);
    const video = videoRef.current;
    if (!Number.isFinite(nextTime) || !video) return;
    video.currentTime = nextTime;
    setPreviewTime(nextTime);
    void syncVoiceoverWithVideo(video);
  }

  async function generatePostAssets() {
    if (!props.videoUrl) {
      setAssetStatus("请先生成或从历史记录载入视频。");
      return;
    }
    if (!editableSegments.length) {
      setAssetStatus("脚本里没有识别到 0-3秒 这类时间段，暂时不能对齐字幕。");
      return;
    }
    if (!subtitlesEnabled && !voiceoverEnabled) {
      setAssetStatus("请至少打开字幕或旁白中的一个。");
      return;
    }
    const text = voiceoverText.trim();
    if (voiceoverEnabled && !text) {
      setAssetStatus("脚本里没有可生成旁白的文本。");
      return;
    }
    setIsGeneratingAssets(true);
    setAssetStatus(voiceoverEnabled ? "正在生成字幕和旁白..." : "正在生成字幕...");
    try {
      if (voiceoverEnabled) {
        const response = await fetch("/api/voiceover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, voiceGender }),
        });
        const data: unknown = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(extractErrorMessage(data, response.status));
        const record = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
        const audioBase64 = typeof record.audioBase64 === "string" ? record.audioBase64 : "";
        if (!audioBase64) throw new Error("旁白服务没有返回可播放的音频。");
        const contentType = typeof record.audioContentType === "string" ? record.audioContentType : "audio/mpeg";
        if (voiceoverAudioUrl) window.URL.revokeObjectURL(voiceoverAudioUrl);
        setVoiceoverAudioBase64(audioBase64);
        setVoiceoverAudioContentType(contentType);
        setVoiceoverAudioUrl(createAudioObjectUrlFromBase64(audioBase64, contentType));
      } else {
        if (voiceoverAudioUrl) window.URL.revokeObjectURL(voiceoverAudioUrl);
        setVoiceoverAudioUrl("");
        setVoiceoverAudioBase64("");
      }
      setGeneratedSegments(editableSegments);
      setPreviewTime(0);
      setAssetStatus(voiceoverEnabled ? "字幕和旁白已生成，播放视频可预览对齐效果。" : "字幕已生成，播放视频可预览对齐效果。");
    } catch (error) {
      setGeneratedSegments([]);
      setVoiceoverAudioUrl("");
      setVoiceoverAudioBase64("");
      setAssetStatus(error instanceof Error ? error.message : "字幕和旁白生成失败。");
    } finally {
      setIsGeneratingAssets(false);
    }
  }

  async function downloadPreviewVideo() {
    if (!props.videoUrl) {
      setAssetStatus("请先生成或从历史记录载入视频。");
      return;
    }
    if (!generatedSegments.length || (voiceoverEnabled && !voiceoverAudioBase64)) {
      setAssetStatus("请先点击一键生成字幕和旁白，再保存完整 MP4。");
      return;
    }
    setIsDownloadingVideo(true);
    setAssetStatus("正在保存 MP4 到本机下载文件夹...");
    try {
      const { filePath, fileName } = await renderPostVideoToDownloads(
        props.videoUrl,
        generatedSegments,
        voiceoverAudioBase64,
        voiceoverAudioContentType,
        subtitlesEnabled,
        voiceoverEnabled,
      );
      props.onPatchHistoryItem(props.historyItemId, { renderedVideoPath: filePath, renderedVideoFileName: fileName });
      props.onSaveRenderedVideoHistory(filePath, fileName);
      setAssetStatus(`已保存为可打开的 MP4：${filePath}`);
    } catch (error) {
      setAssetStatus(error instanceof Error ? error.message : "视频下载失败。");
    } finally {
      setIsDownloadingVideo(false);
    }
  }

  return (
    <div className="post-production-panel">
      <div className="post-production-head">
        <div>
          <span>后期资产</span>
          <strong>字幕 / 旁白编辑器</strong>
        </div>
        <em>{props.videoUrl ? "视频已就绪" : "等待视频"}</em>
      </div>
      <div className="post-production-controls">
        <label className="toggle-control">
          <input type="checkbox" checked={subtitlesEnabled} onChange={(event) => setSubtitlesEnabled(event.target.checked)} />
          字幕
        </label>
        <label className="toggle-control">
          <input type="checkbox" checked={voiceoverEnabled} onChange={(event) => setVoiceoverEnabled(event.target.checked)} />
          旁白
        </label>
        <div className="segmented voice-choice" aria-label="旁白声音">
          {[
            ["female", "女声"],
            ["male", "男声"],
          ].map(([value, label]) => (
            <button key={value} type="button" className={voiceGender === value ? "active" : ""} onClick={() => setVoiceGender(value as "female" | "male")}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {editableSegments.length ? (
        <div className="caption-voice-editor">
          {editableSegments.map((segment, index) => (
            <article className="caption-voice-row" key={`${segment.start}-${segment.end}-${index}`}>
              <div className="caption-voice-time">
                {formatTimelineTime(segment.start)} - {formatTimelineTime(segment.end)}
              </div>
              <label className={!subtitlesEnabled ? "disabled-field" : ""}>
                字幕
                <textarea disabled={!subtitlesEnabled} value={segment.subtitle} onChange={(event) => updateEditableSegment(index, "subtitle", event.target.value)} />
              </label>
              <label className={!voiceoverEnabled ? "disabled-field" : ""}>
                旁白
                <textarea disabled={!voiceoverEnabled} value={segment.voiceover} onChange={(event) => updateEditableSegment(index, "voiceover", event.target.value)} />
              </label>
            </article>
          ))}
        </div>
      ) : null}
      <div className="post-production-actions single-action-row">
        <button className="primary-action compact-action" type="button" disabled={isGeneratingAssets || !canGenerateAssets} onClick={generatePostAssets}>
          {isGeneratingAssets ? <LoaderCircle className="spin" size={16} /> : <Volume2 size={16} />}
          {isGeneratingAssets ? "生成中" : "一键生成字幕和旁白"}
        </button>
      </div>
      {assetStatus && <small className="post-production-status">{assetStatus}</small>}
      {!sourceSegments.length && <small className="post-production-status">脚本需要包含 0-3秒、3-6秒 这样的时间段，系统会按这些时间点上字幕。</small>}
      <div className="post-asset-preview">
        {props.videoUrl ? (
          <div className="captioned-video-shell">
            <video
              ref={videoRef}
              playsInline
              src={props.videoUrl}
              onClick={() => void togglePreviewPlayback()}
              onLoadedMetadata={(event) => setPreviewDuration(event.currentTarget.duration || 0)}
              onPlay={(event) => {
                setIsPreviewPlaying(true);
                void syncVoiceoverWithVideo(event.currentTarget);
              }}
              onPause={() => {
                setIsPreviewPlaying(false);
                voiceoverAudioRef.current?.pause();
              }}
              onSeeked={(event) => void syncVoiceoverWithVideo(event.currentTarget)}
              onTimeUpdate={(event) => {
                setPreviewTime(event.currentTarget.currentTime);
                if (!event.currentTarget.paused) void syncVoiceoverWithVideo(event.currentTarget);
              }}
              onEnded={() => {
                setIsPreviewPlaying(false);
                voiceoverAudioRef.current?.pause();
              }}
            />
            {activeSubtitle && <div className="caption-overlay">{activeSubtitle}</div>}
            <div className="preview-video-controls">
              <button type="button" onClick={() => void togglePreviewPlayback()} aria-label={isPreviewPlaying ? "暂停预览" : "播放预览"}>
                {isPreviewPlaying ? <Pause size={15} /> : <Play size={15} />}
              </button>
              <span>{formatTimelineTime(previewTime)}</span>
              <input
                type="range"
                min="0"
                max={previewDuration || 0}
                step="0.1"
                value={Math.min(previewTime, previewDuration || previewTime)}
                onChange={(event) => seekPreview(event.target.value)}
              />
              <span>{formatTimelineTime(previewDuration || 0)}</span>
            </div>
          </div>
        ) : (
          <div className="post-asset-empty">生成视频后，这里会显示字幕和旁白预览。</div>
        )}
        {voiceoverEnabled && voiceoverAudioUrl && (
          <div className="voiceover-preview">
            <span>旁白音轨</span>
            <audio ref={voiceoverAudioRef} controls controlsList="nodownload" src={voiceoverAudioUrl} />
          </div>
        )}
        {props.videoUrl && (
          <button className="secondary-action compact-action download-video-action" type="button" disabled={isDownloadingVideo} onClick={downloadPreviewVideo}>
            {isDownloadingVideo ? <LoaderCircle className="spin" size={15} /> : <Download size={15} />}
            {isDownloadingVideo ? "保存中" : "保存到下载文件夹 MP4"}
          </button>
        )}
      </div>
    </div>
  );
}

function ProgressPanel(props: { events: ProgressEvent[]; emptyText: string }) {
  return (
    <div className="progress-panel">
      <div className="progress-panel-head">
        <strong>真实进度</strong>
        <span>{props.events.length ? `${props.events.length} 条事件` : "等待任务"}</span>
      </div>
      <div className="progress-event-list">
        {props.events.length === 0 ? (
          <p>{props.emptyText}</p>
        ) : (
          props.events.map((event) => (
            <article className={cn("progress-event", event.status)} key={event.id}>
              <i />
              <div>
                <span>{event.type}</span>
                <strong>{event.title}</strong>
                <small>{event.detail}</small>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
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
                <button className="icon-action subtle history-remove" type="button" aria-label="删除记录" onClick={(event) => {
                  event.stopPropagation();
                  props.onRemove(item.id);
                }}>
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
  const renderedAssetUrl = getLocalVideoAssetUrl(props.item.renderedVideoPath);
  const [resolvedAssetUrl, setResolvedAssetUrl] = useState(isHistoryAssetRef(storedAssetUrl) ? "" : storedAssetUrl);
  const [assetLoading, setAssetLoading] = useState(isHistoryAssetRef(storedAssetUrl));
  const [downloadStatus, setDownloadStatus] = useState("");
  const [isSavingVideo, setIsSavingVideo] = useState(false);
  const assetUrl = renderedAssetUrl || (isHistoryAssetRef(storedAssetUrl) ? resolvedAssetUrl : storedAssetUrl);
  const isVideoAsset = Boolean(props.item.videoUrl || props.item.renderedVideoPath);
  const assetMissing = !assetLoading && !assetUrl && isHistoryAssetRef(storedAssetUrl);

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

  async function saveHistoryVideo() {
    const saveTarget = props.item.renderedVideoPath || assetUrl;
    if (!saveTarget || !isVideoAsset) return;
    setIsSavingVideo(true);
    setDownloadStatus("正在保存 MP4 到下载文件夹...");
    try {
      const filePath = await saveVideoAssetToDownloads(saveTarget);
      setDownloadStatus(`已保存：${filePath}`);
    } catch (error) {
      setDownloadStatus(error instanceof Error ? error.message : "历史视频保存失败。");
    } finally {
      setIsSavingVideo(false);
    }
  }

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
      {assetMissing && <div className="history-asset-loading">这条历史的原始资产只存在于之前浏览器的本机资产库里，当前浏览器没有读到。请优先使用已保存的 MP4 历史。</div>}
      {assetUrl && (
        <div className="history-asset-preview">
          {isVideoAsset ? (
            <video controls controlsList="nodownload" playsInline src={assetUrl} />
          ) : (
            <img src={assetUrl} alt={`${props.item.title}资产预览`} />
          )}
        </div>
      )}
      <div className="history-detail-actions">
        <button className="primary-action compact-action" type="button" onClick={props.onOpenItem}>
          载入到字幕/旁白流程
        </button>
        {assetUrl && (
          <a className="secondary-action compact-action" href={assetUrl} target="_blank" rel="noreferrer">
            单独打开资产
          </a>
        )}
        {(assetUrl || props.item.renderedVideoPath) && isVideoAsset && (
          <button className="secondary-action compact-action" type="button" disabled={isSavingVideo} onClick={saveHistoryVideo}>
            {isSavingVideo ? "保存中" : "保存 MP4"}
          </button>
        )}
      </div>
      {downloadStatus && <div className="history-asset-loading">{downloadStatus}</div>}
      <div className="history-detail-grid">
        {rows.map(([label, value]) => (
          <span key={label}>
            <b>{label}</b>
            <em>{value}</em>
          </span>
        ))}
      </div>
      {(props.item.sourceScript || props.item.scenePrompt) && (
        <div className="history-detail-text">
          <b>原始脚本 / 后期字幕旁白来源</b>
          <p>{props.item.sourceScript || props.item.scenePrompt}</p>
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
