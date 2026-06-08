import {
  Check,
  ChevronDown,
  ClipboardCheck,
  CloudUpload,
  Database,
  Dices,
  FileImage,
  Film,
  Image,
  KeyRound,
  LoaderCircle,
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
import { useEffect, useMemo, useState } from "react";

type StepId = "upload" | "firstFrame" | "video" | "qa";
type MotionMode = "strict" | "balanced" | "creative";
type VideoStatus = "idle" | "submitted" | "polling" | "succeeded" | "failed";
type PromptPairMeta = {
  sceneTitle: string;
  sceneAnchor: string;
  continuityLocks: string;
  model: string;
  upstreamUrl: string;
};

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
  videoBaseUrl: string;
  videoPath: string;
  videoApiKey: string;
  videoModel: string;
  promptModel: string;
};

type HistoryItem = {
  id: string;
  type: "首帧" | "视频";
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
  motionMode?: MotionMode;
  taskId?: string;
  detailUrl?: string;
  firstFrameUrl?: string;
  videoUrl?: string;
  productViewUrls?: string[];
  supportImageUrls?: string[];
  referenceVideoUrls?: string[];
  error?: string;
};

type ProductAsset = {
  id: string;
  name: string;
  type: string;
  viewMode: "四视图";
  viewUrls: string[];
  supportViewUrls: string[];
  referenceVideoUrls: string[];
  lockedNodeCodes: string[];
  updatedAt: string;
};

type ProductPresetView = {
  slotId: string;
  fileName: string;
  localUrl: string;
};

type ProductReferenceVideo = {
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
  referenceVideos: readonly ProductReferenceVideo[];
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
const DEFAULT_VIDEO_MODEL = "doubao-seedance-2-0-260128";

const steps: Array<{ id: StepId; label: string; shortLabel: string; description: string; icon: LucideIcon }> = [
  { id: "upload", label: "上传产品四视图", shortLabel: "上传", description: "正面、左侧、右侧、背面四张核心图", icon: Upload },
  { id: "firstFrame", label: "合成首帧", shortLabel: "首帧", description: "根据核心四视图生成一致首帧", icon: Image },
  { id: "video", label: "生成视频", shortLabel: "视频", description: "基于人工确认首帧提交视频任务", icon: Film },
  { id: "qa", label: "视频质检", shortLabel: "质检", description: "播放成片并检查产品一致性", icon: ClipboardCheck },
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

const SHARK_INFLATABLE_REFERENCE_VIDEOS = [
  { fileName: "shark-reference-01.mp4", localUrl: "/product-presets/shark-inflatable/reference-01.mp4" },
  { fileName: "shark-reference-02.mp4", localUrl: "/product-presets/shark-inflatable/reference-02.mp4" },
] as const;

const BULL_INFLATABLE_PRESET_VIEWS = [
  { slotId: "front", fileName: "bull-front.jpg", localUrl: "/product-presets/bull-inflatable/front.jpg" },
  { slotId: "leftSide", fileName: "bull-left.jpg", localUrl: "/product-presets/bull-inflatable/left.jpg" },
  { slotId: "rightSide", fileName: "bull-right.jpg", localUrl: "/product-presets/bull-inflatable/right.jpg" },
  { slotId: "back", fileName: "bull-back.jpg", localUrl: "/product-presets/bull-inflatable/back.jpg" },
] as const;

const BULL_INFLATABLE_REFERENCE_VIDEOS = [
  { fileName: "bull-reference-01.mp4", localUrl: "/product-presets/bull-inflatable/reference-01.mp4" },
] as const;

const GRAY_MOUSE_INFLATABLE_PRESET_VIEWS = [
  { slotId: "front", fileName: "gray-mouse-front.jpg", localUrl: "/product-presets/gray-mouse-inflatable/front.jpg" },
  { slotId: "leftSide", fileName: "gray-mouse-left.jpg", localUrl: "/product-presets/gray-mouse-inflatable/left.jpg" },
  { slotId: "rightSide", fileName: "gray-mouse-right.jpg", localUrl: "/product-presets/gray-mouse-inflatable/right.jpg" },
  { slotId: "back", fileName: "gray-mouse-back.jpg", localUrl: "/product-presets/gray-mouse-inflatable/back.jpg" },
] as const;

const GRAY_MOUSE_INFLATABLE_REFERENCE_VIDEOS = [] as readonly ProductReferenceVideo[];

const FROG_INFLATABLE_PRESET_VIEWS = [
  { slotId: "front", fileName: "frog-front.jpg", localUrl: "/product-presets/frog-inflatable/front.jpg" },
  { slotId: "leftSide", fileName: "frog-left.jpg", localUrl: "/product-presets/frog-inflatable/left.jpg" },
  { slotId: "rightSide", fileName: "frog-right.jpg", localUrl: "/product-presets/frog-inflatable/right.jpg" },
  { slotId: "back", fileName: "frog-back.jpg", localUrl: "/product-presets/frog-inflatable/back.jpg" },
] as const;

const FROG_INFLATABLE_SUPPORT_VIEWS = [
  { fileName: "frog-support-right-alt.jpg", localUrl: "/product-presets/frog-inflatable/support-right-alt.jpg" },
] as const;

const FROG_INFLATABLE_REFERENCE_VIDEOS = [] as readonly ProductReferenceVideo[];

const SUMO_INFLATABLE_PRESET_VIEWS = [
  { slotId: "front", fileName: "sumo-front.jpg", localUrl: "/product-presets/sumo-inflatable/front.jpg" },
  { slotId: "leftSide", fileName: "sumo-left.jpg", localUrl: "/product-presets/sumo-inflatable/left.jpg" },
  { slotId: "rightSide", fileName: "sumo-right.jpg", localUrl: "/product-presets/sumo-inflatable/right.jpg" },
  { slotId: "back", fileName: "sumo-back.jpg", localUrl: "/product-presets/sumo-inflatable/back.jpg" },
] as const;

const SUMO_INFLATABLE_SUPPORT_VIEWS = [
  { fileName: "sumo-support-rear-valve.jpg", localUrl: "/product-presets/sumo-inflatable/support-rear-valve.jpg" },
] as const;

const SUMO_INFLATABLE_REFERENCE_VIDEOS = [] as readonly ProductReferenceVideo[];

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
    detail: "正面白色腹部宽度约占身体总宽 45%-55%；头部宽高、躯干宽度、手鳍长度和侧面厚度不得超过四视图参考；身体要接近轻度欠充气的柔软尼龙套服，侧面胸腹是可穿戴服厚度，不是竖直胶囊、圆柱气球或饱满鱼雷；背面不能膨胀成无结构圆柱。",
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
    id: "cow-front-udder",
    label: "正面粉色乳房 / 四个奶头",
    code: "Cow_Front_Udder",
    detail: "正面下腹中央必须保留粉色圆形凸起乳房和四个粉色奶头，位置在腹部偏下、两腿上方；不能移动到侧面、背面、胸口，也不能省略或改成口袋装饰。",
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
    detail: "正面拥有脸部、粉色乳房和前身斑块；侧面显示鼻口凸出、侧身厚度、手臂和侧身斑块；背面拥有拉链、橙色阀门和尾巴。看不见的结构自然隐藏，不能为了展示挪位。",
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
    detail: "背面中轴拉链、后背缝线和绿色圆形鼓风阀必须按背视图归位；正面镜头不可把绿色阀门或背部拉链挪到腹部或胸口。",
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
    detail: "保留米肉色充气身体、黑色腰带/相扑兜裆、正面黑色垂片、简单胸部线条和肚脐点；不能改成武士服、胖娃娃、普通肌肉人或重新设计的衣服。",
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
    detail: "背面必须保留中轴拉链/竖缝、黑色后腰带/后兜裆和橙色圆形鼓风阀；橙色阀门不能被移到正面肚子或胸口，拉链不能出现在正面。",
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
    detail: "正面拥有黑色腰带兜裆、胸线和肚脐；侧面拥有厚度、T 形手臂和腰带系结；背面拥有拉链、橙色阀门和后腰带。看不见的结构隐藏，不挪位。",
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
        ? "奶牛橙色鼓风阀/进气口/出气口/泵口只能位于右后侧/背侧，和背部中轴拉链、白尾黑尖保持正确相对位置；不能挪到粉色乳房、白肚、鼻口或脸部。"
        : productType === GRAY_MOUSE_INFLATABLE_TYPE
          ? "灰鼠绿色鼓风阀/进气口/出气口/泵口只能位于后背/背侧，和背部中轴拉链、米黄尾巴根部保持正确相对位置；不能挪到米色腹部、鼻嘴、耳朵或手臂。"
          : productType === FROG_INFLATABLE_TYPE
            ? "青蛙橙色鼓风阀/进气口/出气口/泵口只能位于背部黑色脊线/拉链附近的后背面；不能挪到米色腹部、蓝围巾、脸窗、嘴带、手脚或斑点上。"
            : productType === SUMO_INFLATABLE_TYPE
              ? "相扑橙色鼓风阀/进气口/出气口/泵口只能位于背面/后侧，并按后阀辅助图保留与后腰带、拉链、米肉色背面褶皱的间距；不能挪到正面肚子、胸线、肚脐或兜裆布。"
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
    referenceVideos: SHARK_INFLATABLE_REFERENCE_VIDEOS,
    lockNodes: SHARK_INFLATABLE_LOCK_NODES,
  },
  {
    productType: BULL_INFLATABLE_TYPE,
    views: BULL_INFLATABLE_PRESET_VIEWS,
    supportViews: [],
    referenceVideos: BULL_INFLATABLE_REFERENCE_VIDEOS,
    lockNodes: BULL_INFLATABLE_LOCK_NODES,
  },
  {
    productType: GRAY_MOUSE_INFLATABLE_TYPE,
    views: GRAY_MOUSE_INFLATABLE_PRESET_VIEWS,
    supportViews: [],
    referenceVideos: GRAY_MOUSE_INFLATABLE_REFERENCE_VIDEOS,
    lockNodes: GRAY_MOUSE_INFLATABLE_LOCK_NODES,
  },
  {
    productType: FROG_INFLATABLE_TYPE,
    views: FROG_INFLATABLE_PRESET_VIEWS,
    supportViews: FROG_INFLATABLE_SUPPORT_VIEWS,
    referenceVideos: FROG_INFLATABLE_REFERENCE_VIDEOS,
    lockNodes: FROG_INFLATABLE_LOCK_NODES,
  },
  {
    productType: SUMO_INFLATABLE_TYPE,
    views: SUMO_INFLATABLE_PRESET_VIEWS,
    supportViews: SUMO_INFLATABLE_SUPPORT_VIEWS,
    referenceVideos: SUMO_INFLATABLE_REFERENCE_VIDEOS,
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
  return cloneLockNodes([...(preset?.lockNodes || GENERIC_INFLATABLE_LOCK_NODES), ...getAirHardwareMaterialLockNodes(productType)]);
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

const firstFrameReviewChecks = [
  {
    id: "human-body-envelope",
    label: "人体体型包络 / 不过度鼓胀",
    detail: "必须像真人穿着充气服：肩宽、腰胯、分腿和黑鞋接近四视图；一旦变成巨大圆顶、桶状身体、站立气球或吉祥物外壳就判错误。",
    critical: true,
  },
  {
    id: "shape-volume",
    label: "尺寸 / 比例 / 充气体积正确",
    detail: "保持四视图里的轻到中度充气体量，不变瘦、不鼓成球、不变成展示道具，不能把产品放大到超过真人穿戴尺度。",
    critical: true,
  },
  {
    id: "front-window-zipper",
    label: "正面核心组件归位",
    detail: "正面图定义的脸部、窗口、图案、拉链、乳房或其他核心组件只属于正面，不挪到侧面或背面。",
    critical: true,
  },
  {
    id: "valve-tail-visibility",
    label: "侧面 / 背面组件按视角可见",
    detail: "阀门、尾部、背部拉链、侧面图案和侧边结构只在物理可见时出现；不可为了展示而挪位。",
    critical: true,
  },
  {
    id: "air-hardware-material",
    label: "进出气口泵口 / 材质细节正确",
    detail: "阀门、鼓风阀、进气口、出气口、泵口、充放气口、风扇网格、盖帽必须按四视图的颜色、数量、尺寸、高度和侧/背归属出现；薄尼龙/PVC 褶皱、缝线、拉链齿、色块针脚和阀门环必须清楚，不能变成光滑塑料、毛绒或 CGI 外壳。",
    critical: true,
  },
  {
    id: "no-invented-parts",
    label: "没有新增或丢失结构",
    detail: "无新增表情、额外肢体、额外装饰、错位阀门、错位尾部、缺失脸部、缺失斑块或缺失关键组件。",
    critical: true,
  },
] as const;

type ReviewCheckId = (typeof firstFrameReviewChecks)[number]["id"];
type ReviewDecision = "pending" | "pass" | "fail";
type FirstFrameReviewState = Record<ReviewCheckId, ReviewDecision>;

function createFirstFrameReviewState(): FirstFrameReviewState {
  return Object.fromEntries(firstFrameReviewChecks.map((check) => [check.id, "pending"])) as FirstFrameReviewState;
}

function createPassedFirstFrameReviewState(): FirstFrameReviewState {
  return Object.fromEntries(firstFrameReviewChecks.map((check) => [check.id, "pass"])) as FirstFrameReviewState;
}

function createFirstFrameReviewFeedback(reviewState: FirstFrameReviewState) {
  const failedChecks = firstFrameReviewChecks.filter((check) => reviewState[check.id] === "fail");
  const passedChecks = firstFrameReviewChecks.filter((check) => reviewState[check.id] === "pass");
  return {
    mode: "targeted-first-frame-regeneration",
    instruction:
      "The first-frame prompt and scene are unchanged. Only correct the failed checklist items. Keep passed checklist items and all unmentioned areas as close as possible to the previous first frame.",
    failed_checks: failedChecks.map((check) => ({
      id: check.id,
      label: check.label,
      detail: check.detail,
      critical: check.critical,
    })),
    passed_checks: passedChecks.map((check) => ({
      id: check.id,
      label: check.label,
      detail: check.detail,
      critical: check.critical,
    })),
  };
}

const defaultApiSettings: ApiSettings = {
  imagePath: "",
  imageModel: DEFAULT_IMAGE_MODEL,
  videoBaseUrl: "https://ai.wisech.com/v1",
  videoPath: "",
  videoApiKey: "",
  videoModel: DEFAULT_VIDEO_MODEL,
  promptModel: DEFAULT_PROMPT_MODEL,
};

const VIDEO_MODEL_OPTIONS = [
  "doubao-seedance-1-5-pro-251215",
  "doubao-seedance-2-0-260128",
] as const;

const productAssetPlan: ProductAsset[] = [
  {
    id: "PRODUCT_SHARK_001",
    name: "鲨鱼充气服",
    type: "充气服",
    viewMode: "四视图",
    viewUrls: SHARK_INFLATABLE_PRESET_VIEWS.map((view) => view.localUrl),
    supportViewUrls: [],
    referenceVideoUrls: SHARK_INFLATABLE_REFERENCE_VIDEOS.map((video) => video.localUrl),
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
    referenceVideoUrls: BULL_INFLATABLE_REFERENCE_VIDEOS.map((video) => video.localUrl),
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
    referenceVideoUrls: GRAY_MOUSE_INFLATABLE_REFERENCE_VIDEOS.map((video) => video.localUrl),
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
    referenceVideoUrls: FROG_INFLATABLE_REFERENCE_VIDEOS.map((video) => video.localUrl),
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
    referenceVideoUrls: SUMO_INFLATABLE_REFERENCE_VIDEOS.map((video) => video.localUrl),
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
    const normalizedVideoBaseUrl = typeof merged.videoBaseUrl === "string" ? merged.videoBaseUrl.replace(/\/+$/, "") : "";
    if (
      !normalizedVideoBaseUrl ||
      normalizedVideoBaseUrl === "https://dashscope.aliyuncs.com/api/v1" ||
      normalizedVideoBaseUrl === "https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis"
    ) {
      merged.videoBaseUrl = defaultApiSettings.videoBaseUrl;
    }
    const videoModelText = typeof merged.videoModel === "string" ? merged.videoModel : "";
    if (!videoModelText || videoModelText.startsWith("happyhorse-1.0") || videoModelText === "doubao-seedance-2-0-fast-260128") {
      merged.videoModel = defaultApiSettings.videoModel;
    }
    if (merged.videoBaseUrl === defaultApiSettings.videoBaseUrl && merged.videoModel === defaultApiSettings.videoModel) {
      merged.videoApiKey = "";
    }
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
    (record.type === "首帧" || record.type === "视频") &&
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
  const direct = findUrlByKey(data, /^(video_url|videoUrl|output_video|file_url|result_url|content_url)$/i);
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

function extractErrorMessage(data: unknown) {
  if (!data || typeof data !== "object") return "这次请求没有成功，请稍后再试。";
  const record = data as Record<string, unknown>;
  const error = record.error;
  if (typeof error === "string") return toUserMessage(error);
  if (error && typeof error === "object") {
    const errorRecord = error as Record<string, unknown>;
    if (typeof errorRecord.message === "string") return toUserMessage(errorRecord.message);
    if (typeof errorRecord.code === "string") return toUserMessage(errorRecord.code);
  }
  if (typeof record.message === "string") return toUserMessage(record.message);
  if (typeof record.code === "string") return toUserMessage(record.code);
  if (typeof record.raw === "string" && record.raw.includes("Error code 524")) {
    return "这次处理时间太久了，请稍后再试。";
  }
  return "这次请求没有成功，请稍后再试；如果一直失败，请让管理员检查服务配置。";
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
    return "这次视频描述被平台安全规则拦下了。可以把动作改得更日常一点，比如挥手、转身、停顿或轻轻晃动，再试一次。";
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
  if (/上游图片服务连接失败|上游视频服务连接失败|首帧生成服务暂时连不上|视频生成服务暂时连不上/i.test(text)) {
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
  const [scenePrompt, setScenePrompt] = useState("");
  const [videoActionPrompt, setVideoActionPrompt] = useState("");
  const [approvedFirstFrameUrl, setApprovedFirstFrameUrl] = useState("");
  const [firstFrameApproved, setFirstFrameApproved] = useState(false);
  const [firstFrameReviewState, setFirstFrameReviewState] = useState<FirstFrameReviewState>(() => createFirstFrameReviewState());
  const [firstFrameError, setFirstFrameError] = useState("");
  const [videoError, setVideoError] = useState("");
  const [videoTaskId, setVideoTaskId] = useState("");
  const [videoStatus, setVideoStatus] = useState<VideoStatus>("idle");
  const [videoUrl, setVideoUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [testing, setTesting] = useState<"image" | "video" | "">("");
  const [suggestingPrompt, setSuggestingPrompt] = useState<"pair" | "">("");
  const [promptPairMeta, setPromptPairMeta] = useState<PromptPairMeta>({
    sceneTitle: "",
    sceneAnchor: "",
    continuityLocks: "",
    model: DEFAULT_PROMPT_MODEL,
    upstreamUrl: "",
  });

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
        if (!cancelled) setFirstFrameError(error instanceof Error ? error.message : "Preset images failed to load.");
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
  const failedFirstFrameReviewChecks = firstFrameReviewChecks.filter((check) => firstFrameReviewState[check.id] === "fail");
  const hasFailedFirstFrameReviewChecks = failedFirstFrameReviewChecks.length > 0;
  const allFirstFrameReviewChecksResolved = firstFrameReviewChecks.every((check) => firstFrameReviewState[check.id] !== "pending");
  const requiredUrls = slots.map(getSlotImageUrl).filter(Boolean);
  const currentProductPreset = getProductPreset(costumeType);
  const currentReferenceVideos = currentProductPreset?.referenceVideos || [];
  const currentSupportViewCount = currentProductPreset?.supportViews?.length || 0;
  const uploadReady = requiredUrls.length === slots.length;
  const promptsReady = Boolean(scenePrompt.trim()) && Boolean(videoActionPrompt.trim());
  const firstFrameReady = uploadReady && allLocksConfirmed && promptsReady;
  const videoReady = firstFrameReady && Boolean(approvedFirstFrameUrl.trim()) && firstFrameApproved;

  function createHistoryDetail(
    kind: "firstFrame" | "video",
    status: HistoryItem["status"],
    detail: Partial<HistoryItem> = {},
  ) {
    return {
      productType: costumeType,
      sceneTitle: promptPairMeta.sceneTitle || "",
      scenePrompt,
      videoPrompt: videoActionPrompt,
      model: kind === "firstFrame" ? apiSettings.imageModel : apiSettings.videoModel,
      aspectRatio,
      duration: kind === "video" ? duration : undefined,
      motionMode: kind === "video" ? motionMode : undefined,
      firstFrameUrl: approvedFirstFrameUrl || undefined,
      videoUrl: kind === "video" ? videoUrl || undefined : undefined,
      productViewUrls: slots.map((slot) => slot.localUrl).filter(Boolean),
      supportImageUrls,
      referenceVideoUrls: currentReferenceVideos.map((video) => video.localUrl),
      ...detail,
      status,
    };
  }

  const completedSteps: Record<StepId, boolean> = {
    upload: uploadReady,
    firstFrame: Boolean(approvedFirstFrameUrl.trim()) && firstFrameApproved,
    video: videoStatus === "succeeded" || Boolean(videoUrl),
    qa: activeStep === "qa" && Boolean(videoUrl),
  };

  const motionText =
    motionMode === "strict"
      ? "Controlled visible comedy beats: one clear arm gesture, a small recoil or elastic wobble, and a freeze-pause twist; keep camera fixed, no scene cut, no product redesign."
      : motionMode === "balanced"
        ? "Readable ecommerce comedy motion: one small half-step, prop reaction, elastic wobble, and a clear pause; preserve the approved first-frame product."
        : "More playful comedy timing with a visible prop gag or reversal, while still preserving every locked product node.";

  const firstFramePayload = {
    model: apiSettings.imageModel,
    scene_prompt: scenePrompt,
    product_type: costumeType,
    image_urls: requiredUrls,
    support_image_urls: supportImageUrls,
    locked_nodes: lockNodes.map(({ code, label, detail, confidence, confirmed }) => ({
      code,
      label,
      detail,
      confidence,
      confirmed,
    })),
    aspect_ratio: aspectRatio,
  };

  const normalizedVideoBaseUrlForRequest = typeof apiSettings.videoBaseUrl === "string" ? apiSettings.videoBaseUrl.trim().replace(/\/+$/, "") : "";
  const usesFixedVideoBackend =
    !normalizedVideoBaseUrlForRequest ||
    normalizedVideoBaseUrlForRequest === defaultApiSettings.videoBaseUrl;
  const videoBaseUrlForRequest = usesFixedVideoBackend ? "" : apiSettings.videoBaseUrl;
  const videoApiKeyForRequest = usesFixedVideoBackend ? "" : apiSettings.videoApiKey;

  const videoPayload = {
    base_url: videoBaseUrlForRequest,
    api_key: videoApiKeyForRequest,
    model: apiSettings.videoModel,
    action_prompt: videoActionPrompt,
    scene_prompt: scenePrompt,
    product_type: costumeType,
    image_urls: requiredUrls,
    support_image_urls: supportImageUrls,
    locked_nodes: lockNodes.map(({ code, label, detail, confidence, confirmed }) => ({
      code,
      label,
      detail,
      confidence,
      confirmed,
    })),
    motion_rule: motionText,
    image_url: approvedFirstFrameUrl || "PASTE_APPROVED_FIRST_FRAME_URL",
    duration,
    aspect_ratio: aspectRatio,
    resolution: "1080p",
    audio: true,
    prompt_extend: false,
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

  function invalidateGeneratedOutputs() {
    setApprovedFirstFrameUrl("");
    setFirstFrameApproved(false);
    setFirstFrameReviewState(createFirstFrameReviewState());
    setFirstFrameError("");
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
    setApiSettings((current) => ({ ...current, ...patch, imagePath: "", videoPath: "" }));
  }

  function updateProductType(value: string) {
    invalidateGeneratedOutputs();
    setCostumeType(value);
    setLockNodes(getProductLockNodes(value));
    setScenePrompt("");
    setVideoActionPrompt("");
    setPromptPairMeta({
      sceneTitle: "",
      sceneAnchor: "",
      continuityLocks: "",
      model: apiSettings.promptModel || DEFAULT_PROMPT_MODEL,
      upstreamUrl: "",
    });
    setActiveStep("upload");
  }

  function updateScenePrompt(value: string) {
    invalidateGeneratedOutputs();
    setScenePrompt(value);
  }

  function updateVideoActionPrompt(value: string) {
    invalidateVideoOutputs();
    setVideoActionPrompt(value);
  }

  function updateAspectRatio(value: string) {
    if (value === aspectRatio) return;
    invalidateGeneratedOutputs();
    setAspectRatio(value);
    if (activeStep !== "upload") setActiveStep("firstFrame");
  }

  async function requestPromptPairSuggestion() {
    setSuggestingPrompt("pair");
    setFirstFrameError("");
    setVideoError("");
    try {
      const response = await fetch("/api/prompt-suggestion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: apiSettings.promptModel,
          kind: "pair",
          product_type: costumeType,
          current_first_frame_prompt: scenePrompt,
          current_video_prompt: videoActionPrompt,
          reference_video_count: currentReferenceVideos.length,
          support_image_count: currentSupportViewCount,
          locked_nodes: lockNodes.map(({ code, label, detail, confidence, critical }) => ({
            code,
            label,
            detail,
            confidence,
            critical,
          })),
        }),
      });
      const data: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(extractErrorMessage(data));
      const record = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
      if (record.localFallback) throw new Error("提示词没有由模型生成成功，请稍后再点一次骰子。");
      const firstFramePrompt = typeof record.firstFramePrompt === "string" ? record.firstFramePrompt.trim() : "";
      const nextVideoPrompt = typeof record.videoPrompt === "string" ? record.videoPrompt.trim() : "";
      if (!firstFramePrompt || !nextVideoPrompt) throw new Error("这次没有拿到完整提示词，请再点一次骰子。");
      invalidateGeneratedOutputs();
      setScenePrompt(firstFramePrompt);
      setVideoActionPrompt(nextVideoPrompt);
      setPromptPairMeta({
        sceneTitle: typeof record.sceneTitle === "string" ? record.sceneTitle.trim() : "",
        sceneAnchor: typeof record.sceneAnchor === "string" ? record.sceneAnchor.trim() : "",
        continuityLocks: typeof record.continuityLocks === "string" ? record.continuityLocks.trim() : "",
        model: typeof record.model === "string" && record.model.trim() ? record.model.trim() : apiSettings.promptModel || DEFAULT_PROMPT_MODEL,
        upstreamUrl: typeof record.upstreamUrl === "string" ? record.upstreamUrl.trim() : "",
      });
      setFirstFrameError("首帧和视频提示词已一起更新。");
    } catch (error) {
      const message = error instanceof Error ? toUserMessage(error.message) : "这次没有拿到提示词，请再试一次。";
      setFirstFrameError(message);
    } finally {
      setSuggestingPrompt("");
    }
  }

  function completeUploadStep() {
    if (!uploadReady) {
      setFirstFrameError("请先上传正面、左侧、右侧、背面四张核心产品图。");
      return;
    }
    setLockNodes(autoLockedNodes);
    setActiveStep("firstFrame");
  }

  function selectStep(step: StepId) {
    if (step === "upload") {
      setActiveStep("upload");
      return;
    }
    if (step === "firstFrame" && uploadReady) {
      setActiveStep("firstFrame");
      return;
    }
    if (step === "video" && videoReady) {
      setActiveStep("video");
      return;
    }
    if (step === "qa" && Boolean(videoUrl)) {
      setActiveStep("qa");
      return;
    }
    if (!uploadReady) {
      setActiveStep("upload");
      setFirstFrameError("请先上传正面、左侧、右侧、背面四张核心产品图。");
    }
  }

  function updateFirstFrameReviewCheck(id: ReviewCheckId, decision: ReviewDecision) {
    setFirstFrameApproved(false);
    if (decision === "fail") {
      setFirstFrameError("首帧审核未通过。请重新生成首帧。");
    }
    setFirstFrameReviewState((current) => {
      const next = { ...current, [id]: decision };
      const failed = firstFrameReviewChecks.filter((check) => next[check.id] === "fail");
      if (failed.length > 0) {
        setFirstFrameError(`首帧审核未通过：${failed.map((check) => check.label).join("、")}。请重新生成首帧。`);
      } else {
        setFirstFrameError("");
      }
      return next;
    });
  }

  function approveFirstFrameAndOpenVideoStep() {
    if (!approvedFirstFrameUrl.trim()) {
      setFirstFrameError("请先生成首帧，再通过首帧进入视频设置。");
      return;
    }
    setFirstFrameReviewState(createPassedFirstFrameReviewState());
    setFirstFrameApproved(true);
    setActiveStep("video");
    setFirstFrameError("首帧已通过，请在视频页确认模型、参数和动作强度后手动生成。");
  }

  function applyHistoryItemToCurrentFlow(item: HistoryItem) {
    if (item.scenePrompt) setScenePrompt(item.scenePrompt);
    if (item.videoPrompt) setVideoActionPrompt(item.videoPrompt);
    if (item.aspectRatio) setAspectRatio(item.aspectRatio);
    if (item.duration) setDuration(item.duration);
    if (item.motionMode) setMotionMode(item.motionMode);
    if (item.taskId) setVideoTaskId(item.taskId);
    if (item.firstFrameUrl) setApprovedFirstFrameUrl(item.firstFrameUrl);
    if (item.videoUrl) setVideoUrl(item.videoUrl);
    setFirstFrameApproved(Boolean(item.videoUrl));
    setVideoStatus(item.videoUrl ? "succeeded" : item.type === "视频" && item.status === "处理中" ? "polling" : "idle");
    setFirstFrameReviewState(item.firstFrameUrl ? createPassedFirstFrameReviewState() : createFirstFrameReviewState());
    setFirstFrameError(item.firstFrameUrl ? "已从历史记录载入首帧资产。" : "");
    setVideoError(item.videoUrl ? "已从历史记录载入视频资产。" : item.error || "");
    setActiveStep(item.videoUrl ? "qa" : "firstFrame");
  }

  async function openHistoryItem(item: HistoryItem) {
    const resolvedItem = await resolveHistoryItemAssets(item);
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

  async function regenerateFirstFrameFromReview() {
    if (!approvedFirstFrameUrl.trim()) {
      setFirstFrameError("请先生成首帧，再进入重新生成。");
      return;
    }
    if (!hasFailedFirstFrameReviewChecks) {
      setFirstFrameError("当前没有错误项；如果首帧没问题，请点击通过首帧进入视频设置。");
      return;
    }
    setFirstFrameApproved(false);
    setActiveStep("firstFrame");
    const previousFirstFrameUrl = approvedFirstFrameUrl;
    await callBackend("firstFrame", {
      ...firstFramePayload,
      previous_first_frame_url: previousFirstFrameUrl,
      prompt_unchanged: true,
      review_feedback: createFirstFrameReviewFeedback(firstFrameReviewState),
    });
  }

  async function callBackend(kind: "firstFrame" | "video", firstFramePayloadOverride?: Record<string, unknown>) {
    if (kind === "firstFrame" && !scenePrompt.trim()) {
      setFirstFrameError("请先点击骰子生成首帧和视频提示词，再生成首帧。");
      return;
    }
    if (kind === "video" && !videoActionPrompt.trim()) {
      setVideoError("请先在首帧页用骰子生成视频提示词，再生成视频。");
      return;
    }
    setIsSubmitting(true);
    setFirstFrameError("");
    setVideoError("");
    if (kind === "firstFrame") {
      setApprovedFirstFrameUrl("");
      setFirstFrameApproved(false);
      setFirstFrameReviewState(createFirstFrameReviewState());
    }
    if (kind === "video") {
      setVideoTaskId("");
      setVideoUrl("");
      setVideoStatus("submitted");
    }
    try {
      const requestPayload =
        kind === "firstFrame"
          ? await prepareFirstFramePayloadForSubmit(firstFramePayloadOverride || firstFramePayload)
          : videoPayload;
      const response = await fetch(kind === "firstFrame" ? "/api/first-frame" : "/api/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload),
      });
      const data: unknown = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(extractErrorMessage(data));
      }

      const imageUrl = kind === "firstFrame" ? extractImageUrl(data) : "";
      if (kind === "firstFrame") {
        if (!imageUrl) {
          throw new Error("这次没有拿到首帧图片，请稍后再试，或换一个首帧模型。");
        }
        setApprovedFirstFrameUrl(imageUrl);
        setFirstFrameApproved(false);
        setFirstFrameReviewState(createFirstFrameReviewState());
        setFirstFrameError("首帧已生成，请人工核对产品尺寸、比例和外形；首帧不过审，不进入视频。");
      }
      const newTaskId = extractTaskId(data);
      if (kind === "video") {
        const immediateVideoUrl = extractVideoUrl(data);
        if (immediateVideoUrl) {
          setVideoUrl(immediateVideoUrl);
          setVideoStatus("succeeded");
          setActiveStep("qa");
        } else if (newTaskId) {
          setVideoTaskId(newTaskId);
          setVideoStatus("polling");
          setVideoError(`视频已经开始生成，任务号是 ${newTaskId}。`);
        } else {
          setVideoStatus("failed");
          throw new Error("这次没有拿到视频结果，也没有拿到可查询的任务号，请重新生成一次。");
        }
      }
      const nextHistoryStatus: HistoryItem["status"] =
        kind === "firstFrame" || videoStatus === "succeeded" || Boolean(extractVideoUrl(data)) ? "成功" : "处理中";
      const historyDetail = createHistoryDetail(kind, nextHistoryStatus, {
        taskId: newTaskId || undefined,
        detailUrl: kind === "firstFrame" ? imageUrl : extractVideoUrl(data),
        firstFrameUrl: kind === "firstFrame" ? imageUrl : approvedFirstFrameUrl || undefined,
        videoUrl: kind === "video" ? extractVideoUrl(data) || undefined : undefined,
      });
      setHistoryItems((current) =>
        upsertHistoryItem(current, createHistoryItem(newTaskId || `LOCAL-${Date.now()}`, kind, nextHistoryStatus, historyDetail)),
      );
    } catch (error) {
      const message = error instanceof Error ? toUserMessage(error.message) : "这次请求没有成功，请稍后再试。";
      if (kind === "firstFrame") {
        setFirstFrameError(message);
        setHistoryItems((current) =>
          upsertHistoryItem(current, createHistoryItem(`LOCAL-${Date.now()}`, kind, "失败", createHistoryDetail(kind, "失败", { error: message }))),
        );
      }
      if (kind === "video") {
        setVideoStatus("failed");
        setVideoError(message);
        const failedId = videoTaskId || `LOCAL-${Date.now()}`;
        setHistoryItems((current) =>
          upsertHistoryItem(current, createHistoryItem(failedId, kind, "失败", createHistoryDetail(kind, "失败", { taskId: videoTaskId || undefined, error: message }))),
        );
      }
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
        const response = await fetch("/api/video-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            task_id: videoTaskId,
            base_url: videoBaseUrlForRequest,
            api_key: videoApiKeyForRequest,
          }),
        });
        const data: unknown = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(extractErrorMessage(data));
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
          setHistoryItems((current) =>
            current.map((item) => (item.id === videoTaskId ? { ...item, status: "成功", detailUrl: nextVideoUrl } : item)),
          );
          setActiveStep("qa");
          return;
        }

        if (status === "FAILED" || status === "ERROR" || status === "CANCELED" || status === "UNKNOWN") {
          throw new Error(extractErrorMessage(data));
        }

        setVideoError(`视频还在生成中，已检查 ${attempts} 次。`);
        if (!stopped) timer = window.setTimeout(pollVideoStatus, 3500);
      } catch (error) {
        const message = error instanceof Error ? toUserMessage(error.message) : "暂时查不到视频进度，请稍后再试。";
        setVideoStatus("failed");
        setVideoError(message);
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
  }, [videoApiKeyForRequest, videoBaseUrlForRequest, videoStatus, videoTaskId]);

  async function testApi(kind: "image" | "video") {
    setTesting(kind);
    setFirstFrameError("");
    setVideoError("");
    try {
      const response = await fetch(kind === "image" ? "/api/test-image" : "/api/test-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(kind === "image" ? firstFramePayload : videoPayload),
      });
      const data: unknown = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(extractErrorMessage(data));
      }
      const message = kind === "image" ? "首帧服务连接正常。" : "视频服务连接正常。";
      if (kind === "image") setFirstFrameError(message);
      if (kind === "video") setVideoError(message);
    } catch (error) {
      const message = error instanceof Error ? toUserMessage(error.message) : "服务测试没有通过，请稍后再试。";
      if (kind === "image") setFirstFrameError(message);
      if (kind === "video") setVideoError(message);
    } finally {
      setTesting("");
    }
  }

  return (
    <div className="min-h-[100dvh] overflow-hidden bg-[#eef4f4] text-[#0d1d20]">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_8%_10%,rgba(0,126,145,0.18),transparent_32%),radial-gradient(circle_at_92%_6%,rgba(15,109,243,0.12),transparent_34%),linear-gradient(120deg,#f7fbfb_0%,#edf4f4_48%,#f4f1f3_100%)]" />
      <header className="sticky top-0 z-50 border-b border-white/65 bg-white/70 px-5 py-3 shadow-[0_12px_44px_rgba(12,57,65,0.07)] backdrop-blur-2xl">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <div className="grid h-11 w-11 place-items-center rounded-lg bg-[#007e91] text-white shadow-[0_18px_36px_rgba(0,126,145,0.22)]">
              <Film size={21} />
            </div>
            <div className="min-w-0">
              <strong className="block truncate text-[20px] font-black tracking-[0] text-[#07363d]">Product Lock Video Studio</strong>
              <span className="block truncate text-[12px] font-bold text-[#607276]">四视图锁定 · 首帧审核 · 视频生成</span>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] grid-cols-1 gap-5 px-4 py-5 pb-32 lg:grid-cols-[280px_minmax(0,1fr)] lg:px-6">
        <motion.aside
          className="rounded-lg border border-white/70 bg-white/58 p-4 shadow-[0_24px_70px_rgba(12,57,65,0.08)] backdrop-blur-2xl lg:sticky lg:top-24 lg:h-[calc(100dvh-132px)]"
          initial={{ opacity: 0, x: -18 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="rounded-lg bg-[#07363d] p-4 text-white">
            <div className="mb-8 flex items-center justify-between">
              <span className="text-[12px] font-black uppercase tracking-[0.14em] text-white/58">Current Run</span>
              <FileImage size={18} />
            </div>
            <strong className="block text-[22px] font-black leading-tight">{costumeType}</strong>
            <span className="mt-2 block text-[13px] font-semibold text-white/68">{requiredUrls.length}/4 核心视图 · {currentSupportViewCount} 辅助角度</span>
          </div>
          <div className="mt-4 grid gap-3">
            {visibleSteps.map((step, index) => {
              const isActive = activeStep === step.id;
              const isDone = completedSteps[step.id];
              const Icon = step.icon;
              return (
                <button
                  className={cn(
                    "group grid grid-cols-[38px_1fr_auto] items-center gap-3 rounded-lg border border-transparent px-3 py-3 text-left transition active:scale-[0.99]",
                    isActive && "border-[#b8dce1] bg-white shadow-[0_12px_28px_rgba(12,57,65,0.08)]",
                    !isActive && "hover:bg-white/55",
                  )}
                  type="button"
                  key={step.id}
                  onClick={() => selectStep(step.id)}
                >
                  <span className={cn("grid h-9 w-9 place-items-center rounded-lg bg-[#e9f4f5] text-[#007e91]", isActive && "bg-[#007e91] text-white")}>
                    <Icon size={18} />
                  </span>
                  <span className="min-w-0">
                    <strong className="block text-[14px] font-black text-[#18363a]">{step.shortLabel}</strong>
                    <small className="block truncate text-[12px] font-semibold text-[#607276]">{step.description}</small>
                  </span>
                  <span className={cn("text-[12px] font-black", isDone ? "text-[#167a3a]" : "text-[#9caeb2]")}>{isDone ? "OK" : String(index + 1).padStart(2, "0")}</span>
                </button>
              );
            })}
          </div>
          <button className="mt-4 w-full rounded-lg border border-[#d7e5e6] bg-white/70 px-4 py-3 text-[14px] font-black text-[#456064] transition active:scale-[0.98]">
            新建流程
          </button>
          <button
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[#b8dce1] bg-white px-4 py-3 text-[14px] font-black text-[#007e91] shadow-[0_12px_24px_rgba(0,126,145,0.08)] transition active:scale-[0.98]"
            type="button"
            onClick={() => setHistoryOpen(true)}
          >
            <Database size={16} />
            历史记录
            {historyItems.length > 0 && <span className="rounded-md bg-[#e6f5f6] px-2 py-0.5 text-[11px]">{historyItems.length}</span>}
          </button>
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
                  referenceVideos={currentReferenceVideos}
                  supportViewCount={currentSupportViewCount}
                  setCostumeType={updateProductType}
                  onFile={updateSlotFile}
                  canComplete={uploadReady}
                  onComplete={() => completeUploadStep()}
                />
              )}
              {activeStep === "firstFrame" && (
                <FirstFrameStep
                  prompt={scenePrompt}
                  setPrompt={updateScenePrompt}
                  videoPrompt={videoActionPrompt}
                  setVideoPrompt={updateVideoActionPrompt}
                  promptMeta={promptPairMeta}
                  apiSettings={apiSettings}
                  updateApiSettings={updateApiSettings}
                  aspectRatio={aspectRatio}
                  setAspectRatio={updateAspectRatio}
                  productViews={slots}
                  approvedUrl={approvedFirstFrameUrl}
                  isApproved={firstFrameApproved}
                  reviewChecks={firstFrameReviewChecks}
                  reviewState={firstFrameReviewState}
                  allReviewChecksResolved={allFirstFrameReviewChecksResolved}
                  failedReviewChecks={failedFirstFrameReviewChecks}
                  hasFailedReviewChecks={hasFailedFirstFrameReviewChecks}
                  onReviewCheck={updateFirstFrameReviewCheck}
                  onApproveAllAndGenerate={approveFirstFrameAndOpenVideoStep}
                  onRegenerate={regenerateFirstFrameFromReview}
                  error={firstFrameError}
                  canGenerate={firstFrameReady}
                  isSubmitting={isSubmitting}
                  isSuggesting={suggestingPrompt === "pair"}
                  onSuggestPrompt={requestPromptPairSuggestion}
                  onGenerate={() => callBackend("firstFrame")}
                />
              )}
              {activeStep === "video" && (
                <VideoStep
                  apiSettings={apiSettings}
                  updateApiSettings={updateApiSettings}
                  duration={duration}
                  setDuration={setDuration}
                  motionMode={motionMode}
                  setMotionMode={setMotionMode}
                  canGenerate={videoReady}
                  isSubmitting={isSubmitting}
                  isTesting={testing === "video"}
                  error={videoError}
                  aspectRatio={aspectRatio}
                  firstFrameUrl={approvedFirstFrameUrl}
                  status={videoStatus}
                  statusText={videoStatusText}
                  taskId={videoTaskId}
                  videoUrl={videoUrl}
                  onGenerate={() => callBackend("video")}
                  onTest={() => testApi("video")}
                />
              )}
              {activeStep === "qa" && <QaStep videoUrl={videoUrl} aspectRatio={aspectRatio} />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      {historyOpen && (
        <HistoryDrawer
          items={historyItems}
          products={productAssets}
          error={historyError}
          onClose={() => setHistoryOpen(false)}
          onClear={() => {
            setHistoryError("");
            setHistoryItems([]);
          }}
          onRemove={(id) => setHistoryItems((current) => current.filter((item) => item.id !== id))}
          onOpenItem={openHistoryItem}
        />
      )}
    </div>
  );
}

function UploadStep(props: {
  slots: UploadSlot[];
  costumeType: string;
  referenceVideos: readonly ProductReferenceVideo[];
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
      <div className="lock-note">核心四视图上传后才进入首帧。正面、左侧、右侧、背面用于锁定尺寸、比例、外形和拓扑；选择本地预设产品时，已保存的辅助角度会在后台自动作为一致性证据进入模型。</div>
      <div className="field-grid">
        <label>
          产品类型
          <select value={props.costumeType} onChange={(event) => props.setCostumeType(event.target.value)}>
            <option>鲨鱼充气服</option>
            <option>奶牛充气服</option>
            <option>灰色老鼠充气服</option>
            <option>青蛙充气服</option>
            <option>相扑充气服</option>
            <option>通用充气服</option>
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
      {props.referenceVideos.length > 0 && (
        <div className="preset-reference-note">
          <strong>已绑定参考视频</strong>
          <span>
            {props.referenceVideos.length} 个长期样片：{props.referenceVideos.map((video) => video.fileName).join("、")}
          </span>
        </div>
      )}
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

function FirstFrameStep(props: {
  prompt: string;
  setPrompt: (value: string) => void;
  videoPrompt: string;
  setVideoPrompt: (value: string) => void;
  promptMeta: PromptPairMeta;
  apiSettings: ApiSettings;
  updateApiSettings: (patch: Partial<ApiSettings>) => void;
  aspectRatio: string;
  setAspectRatio: (value: string) => void;
  productViews: UploadSlot[];
  approvedUrl: string;
  isApproved: boolean;
  reviewChecks: typeof firstFrameReviewChecks;
  reviewState: FirstFrameReviewState;
  allReviewChecksResolved: boolean;
  failedReviewChecks: typeof firstFrameReviewChecks[number][];
  hasFailedReviewChecks: boolean;
  onReviewCheck: (id: ReviewCheckId, decision: ReviewDecision) => void;
  onApproveAllAndGenerate: () => void;
  onRegenerate: () => void;
  error: string;
  canGenerate: boolean;
  isSubmitting: boolean;
  isSuggesting: boolean;
  onSuggestPrompt: () => void;
  onGenerate: () => void;
}) {
  const generatedFrame = (
    <div className={cn("generated-frame", `media-ratio-${props.aspectRatio.replace(":", "-")}`)}>
      <div className="render-badges">
        <span className={props.approvedUrl ? "render-ok" : ""}>{props.approvedUrl ? "已载入" : "待生成"}</span>
        <span>{props.isApproved ? "已过审" : "首帧不过审，不进入视频"}</span>
      </div>
      {props.approvedUrl ? (
        <img className="preview-image" src={props.approvedUrl} alt="首帧预览" />
      ) : (
        <div className="frame-placeholder">
          <Wand2 size={44} />
          <strong>首帧预览</strong>
        </div>
      )}
    </div>
  );

  return (
    <section className="stage-panel">
      <StageHeader eyebrow="第 2 步" title="四视图合成首帧" />
      <div className="lock-note">一致性规则：正面、左侧、右侧、背面四张核心视图优先于场景创意。人体体型包络、尺寸、比例、轮廓必须接近四视图，不能变成巨大圆顶、桶状身体、站立气球或吉祥物外壳；阀门方向、尾鳍、鳃线、脸窗必须归位，看不见的结构隐藏，不挪位。</div>
      <div className="two-col">
        <div className="stack">
          {props.approvedUrl && generatedFrame}
          <div className="scenario-card prompt-card prompt-pair-card">
            <div className="prompt-label-row">
              <span>同步提示词</span>
              <button
                className="dice-action"
                type="button"
                title="同步随机首帧和视频提示词"
                aria-label="同步随机首帧和视频提示词"
                disabled={props.isSuggesting}
                onClick={props.onSuggestPrompt}
              >
                {props.isSuggesting ? <LoaderCircle className="spin" size={16} /> : <Dices size={17} />}
              </button>
            </div>
            {props.promptMeta.sceneAnchor && <p className="prompt-scene-anchor">{props.promptMeta.sceneAnchor}</p>}
            <div className="prompt-pair-grid">
              <label>
                <span>首帧提示词</span>
                <textarea
                  value={props.prompt}
                  onChange={(event) => props.setPrompt(event.target.value)}
                  placeholder="点击骰子生成"
                />
              </label>
              <label>
                <span>视频提示词</span>
                <textarea
                  value={props.videoPrompt}
                  onChange={(event) => props.setVideoPrompt(event.target.value)}
                  placeholder="点击骰子生成"
                />
              </label>
            </div>
            {props.promptMeta.continuityLocks && <p className="prompt-continuity">{props.promptMeta.continuityLocks}</p>}
          </div>
          {!props.approvedUrl && generatedFrame}
          <div className="first-frame-review">
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
          {props.approvedUrl && (
            <div className="review-checklist">
              <div className="review-checklist-head">
                <strong>首帧关键审核</strong>
                <div className="review-flow-actions">
                  <button
                    className="primary-action compact-action"
                    type="button"
                    disabled={props.isSubmitting}
                    onClick={props.onApproveAllAndGenerate}
                  >
                    {props.isSubmitting ? <LoaderCircle className="spin" size={15} /> : <ShieldCheck size={15} />}
                    通过首帧，进入视频设置
                  </button>
                  {props.hasFailedReviewChecks && (
                    <button
                      className="secondary-action compact-action"
                      type="button"
                      disabled={props.isSubmitting}
                      onClick={props.onRegenerate}
                    >
                      {props.isSubmitting ? <LoaderCircle className="spin" size={15} /> : <Wand2 size={15} />}
                      按错误项重新生成首帧
                    </button>
                  )}
                </div>
              </div>
              {props.hasFailedReviewChecks && (
                <div className="review-fail-banner">
                  首帧审核未通过：{props.failedReviewChecks.map((check) => check.label).join("、")}。请重新生成首帧。
                </div>
              )}
              {props.reviewChecks.map((check) => (
                <div className={cn("review-check", props.reviewState[check.id] === "fail" && "failed")} key={check.id}>
                  <span>
                    <strong>{check.label}</strong>
                    <small>{check.detail}</small>
                  </span>
                  <div className="review-decision" aria-label={`${check.label}审核结果`}>
                    <button
                      type="button"
                      className={props.reviewState[check.id] === "pass" ? "active pass" : ""}
                      onClick={() => props.onReviewCheck(check.id, "pass")}
                    >
                      正确
                    </button>
                    <button
                      type="button"
                      className={props.reviewState[check.id] === "fail" ? "active fail" : ""}
                      onClick={() => props.onReviewCheck(check.id, "fail")}
                    >
                      错误
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="parameter-panel">
          <h3>生成参数</h3>
          <label>
            提示词模型
            <input
              value={props.apiSettings.promptModel}
              onChange={(event) => props.updateApiSettings({ promptModel: event.target.value })}
              placeholder={DEFAULT_PROMPT_MODEL}
            />
          </label>
          <label>
            首帧模型
            <input
              value={props.apiSettings.imageModel}
              onChange={(event) => props.updateApiSettings({ imageModel: event.target.value })}
              placeholder={DEFAULT_IMAGE_MODEL}
            />
          </label>
          <div className="api-fixed-note">
            <strong>图片 / 文字接口</strong>
            <span>后台固定配置</span>
          </div>
          <label>
            清晰度
            <div className="resolution-value">1080p</div>
          </label>
          <label>
            画面比例
            <div className="ratio-grid">
              {["16:9", "1:1", "9:16"].map((ratio) => (
                <button
                  type="button"
                  className={props.aspectRatio === ratio ? "active" : ""}
                  onClick={() => props.setAspectRatio(ratio)}
                  key={ratio}
                >
                  <i data-ratio={ratio} />
                  {ratio}
                </button>
              ))}
            </div>
          </label>
          {!props.approvedUrl && (
            <button className="primary-action" disabled={!props.canGenerate || props.isSubmitting} onClick={props.onGenerate}>
              {props.isSubmitting ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />}
              根据核心四视图生成首帧
            </button>
          )}
          {props.error && <div className={cn("field-error", getStatusMessageTone(props.error))}>{props.error}</div>}
          {!props.canGenerate && !props.approvedUrl && (
            <div className="field-hint">请先点击骰子生成首帧和视频提示词，再生成首帧。</div>
          )}
        </div>
      </div>
    </section>
  );
}

function VideoStep(props: {
  apiSettings: ApiSettings;
  updateApiSettings: (patch: Partial<ApiSettings>) => void;
  duration: number;
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
  onGenerate: () => void;
  onTest: () => void;
}) {
  const isWorking = props.isSubmitting || props.status === "submitted" || props.status === "polling";
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
        </div>
        <div className="parameter-panel">
          <h3>视频参数</h3>
          <label>
            视频模型
            <select value={props.apiSettings.videoModel} onChange={(event) => props.updateApiSettings({ videoModel: event.target.value })}>
              {VIDEO_MODEL_OPTIONS.map((model) => (
                <option key={model} value={model}>
                  {model}
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
              onChange={(event) => props.updateApiSettings({ videoBaseUrl: event.target.value })}
              placeholder="https://ai.wisech.com/v1"
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
                onChange={(event) => props.updateApiSettings({ videoApiKey: event.target.value })}
                placeholder="后台已配置，留空即可"
                autoComplete="new-password"
                name="video-api-token"
              />
            </div>
          </label>
          <label>
            时长
            <input type="number" min={5} max={15} value={props.duration} onChange={(event) => props.setDuration(Number(event.target.value))} />
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
          <button className="primary-action" disabled={!props.canGenerate || isWorking} onClick={props.onGenerate}>
            {isWorking ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}
            {isWorking ? "生成中" : "生成视频"}
          </button>
          {props.error && <div className={cn("field-error", getStatusMessageTone(props.error))}>{props.error}</div>}
        </div>
      </div>
    </section>
  );
}

function QaStep(props: { videoUrl?: string; aspectRatio: string }) {
  const frames = [
    ["0%", 99],
    ["25%", 95],
    ["50%", 92],
    ["75%", 82],
    ["100%", 90],
  ] as const;
  return (
    <section className="stage-panel">
      <StageHeader eyebrow="第 4 步" title="视频质检" />
      <div className={cn("qa-video", `media-ratio-${props.aspectRatio.replace(":", "-")}`)}>
        {props.videoUrl ? (
          <video controls playsInline src={props.videoUrl} />
        ) : (
          <>
            <button className="play-button">
              <Play size={38} />
            </button>
            <span>视频预览</span>
          </>
        )}
      </div>
      <div className="timeline">
        <div className="timeline-head">
          <span>关键帧</span>
          <strong>00:04 / 00:08</strong>
        </div>
        <div className="timeline-track">
          <i />
          {frames.map(([time, score]) => (
            <button className={cn(score >= 90 && "passed", score < 90 && "warning")} key={time}>
              <span />
              <em>{time}</em>
            </button>
          ))}
        </div>
      </div>
      <div className="frame-grid">
        {frames.map(([time, score]) => (
          <div className={cn("frame-card", score < 90 && "bad")} key={time}>
            <div>{time}</div>
            <span>{score}% 一致</span>
          </div>
        ))}
      </div>
      <div className="score-grid">
        <Score label="货对版" value={85} danger />
        <Score label="动作趣味" value={75} />
        <Score label="场景丰富" value={90} />
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
  const [expandedId, setExpandedId] = useState(props.items[0]?.id || "");
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
                  {product.type} · {product.viewUrls.length} 张视图 · {product.supportViewUrls.length} 张辅助角度 · {product.referenceVideoUrls.length} 个参考视频 · 已锁 {product.lockedNodeCodes.length} 项细节
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
  const [resolvedAssetUrl, setResolvedAssetUrl] = useState(storedAssetUrl);
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
          <b>首帧提示词</b>
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
      {props.item.referenceVideoUrls && props.item.referenceVideoUrls.length > 0 && (
        <div className="history-reference-list">
          <b>参考视频</b>
          {props.item.referenceVideoUrls.map((url, index) => (
            <a href={url} target="_blank" rel="noreferrer" key={`${url}-${index}`}>
              参考视频 {index + 1}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function Score(props: { label: string; value: number; danger?: boolean }) {
  return (
    <div className={cn("score-card", props.danger && "danger")}>
      <div>
        <span>{props.label}</span>
        <strong>{props.value}%</strong>
      </div>
      <div>
        <i style={{ width: `${props.value}%` }} />
      </div>
    </div>
  );
}
