import http from "node:http";
import { existsSync, readFileSync } from "node:fs";

function loadLocalEnv() {
  for (const fileName of [".env.local", ".env"]) {
    const fileUrl = new URL(`../${fileName}`, import.meta.url);
    if (!existsSync(fileUrl)) continue;
    const lines = readFileSync(fileUrl, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (process.env[key]) continue;
      process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
    }
  }
}

loadLocalEnv();

const PORT = Number(process.env.PORT || 8787);
const TOAPIS_BASE_URL = (process.env.TOAPIS_BASE_URL || "https://toapis.com/v1").replace(/\/+$/, "");
const TOAPIS_API_KEY = process.env.TOAPIS_API_KEY || "";
const IMAGE_TEXT_BASE_URL = (process.env.IMAGE_TEXT_BASE_URL || "https://aicanapi.com/v1").replace(/\/+$/, "");
const IMAGE_TEXT_API_KEY = process.env.IMAGE_TEXT_API_KEY || TOAPIS_API_KEY;
const VIDEO_BASE_URL = (process.env.VIDEO_BASE_URL || TOAPIS_BASE_URL).replace(/\/+$/, "");
const VIDEO_API_KEY = process.env.VIDEO_API_KEY || TOAPIS_API_KEY;
const VIDEO_MODEL = process.env.VIDEO_MODEL || "";
const LOCAL_PROMPT_MODEL = "local-safety-draft";
const DEFAULT_PROMPT_MODEL = "gpt-5.4-mini";
const DEFAULT_IMAGE_MODEL = "gpt-image-2";
const STALE_PROMPT_MODELS = new Set(["gpt-4.1-mini", "gpt-5.5", LOCAL_PROMPT_MODEL]);
const STALE_IMAGE_MODELS = new Set(["gpt-4.1-mini", "image-2"]);
const UPSTREAM_TIMEOUT_MS = 360000;
const VIDEO_UPSTREAM_TIMEOUT_MS = 90000;
const OPENAI_VIDEO_GENERATIONS_PATH = "/video/generations";
const DASHSCOPE_IMAGE_GENERATION_PATH = "/services/aigc/multimodal-generation/generation";
const DASHSCOPE_VIDEO_SYNTHESIS_PATH = "/services/aigc/video-generation/video-synthesis";
const VOLCENGINE_VIDEO_TASKS_PATH = "/contents/generations/tasks";
const CORE_VIEW_LABELS = [
  { code: "FRONT_VIEW", contentLabel: "Core reference 1 FRONT_VIEW", label: "front reference; owns the belly, face window, zipper, front proportions, and feet" },
  { code: "LEFT_SIDE_VIEW", contentLabel: "Core reference 2 LEFT_SIDE_VIEW", label: "left-side reference; owns left thickness, side seam, and left-visible side details" },
  { code: "RIGHT_SIDE_VIEW", contentLabel: "Core reference 3 RIGHT_SIDE_VIEW", label: "right-side reference; owns right thickness, valve side, side seam, and right-visible side details" },
  { code: "BACK_VIEW", contentLabel: "Core reference 4 BACK_VIEW", label: "back reference; owns plain back, center back seam, rear tail fin, and rear silhouette" },
];
const CORE_VIEW_INPUT_ORDER = [
  "image_urls[0] = FRONT_VIEW",
  "image_urls[1] = LEFT_SIDE_VIEW",
  "image_urls[2] = RIGHT_SIDE_VIEW",
  "image_urls[3] = BACK_VIEW",
].join("\n");
const PROMPT_SCENE_BANK = [
  { title: "夜市摊位", anchor: "夜市小吃摊旁，暖色灯串、折叠桌、手写价签和塑料周转筐都在画面边缘，地面有轻微反光。" },
  { title: "物流分拣区", anchor: "电商仓库分拣台前，纸箱、扫码枪、传送带和贴着面单的包裹形成真实工作场景。" },
  { title: "洗衣房", anchor: "自助洗衣房里，滚筒洗衣机、蓝色洗衣篮、找零机和墙上的注意事项贴纸构成干净生活场景。" },
  { title: "展会通道", anchor: "小型展会通道，折叠展架、样品台、挂绳胸牌和未收起的电源线让画面像临时布展现场。" },
  { title: "便利店门口", anchor: "便利店门口的自动门旁，冰柜灯箱、雨伞架、促销立牌和扫码付款贴纸清楚可见。" },
  { title: "地铁站外广场", anchor: "地铁站出口旁，导向牌、共享雨伞机、路面反光和排队护栏组成城市通勤背景。" },
  { title: "直播间后台", anchor: "直播间后台角落，补光灯、折叠椅、样品货架、透明胶带和手写流程板围绕产品摆放。" },
  { title: "酒店走廊", anchor: "酒店走廊尽头，行李车、房号牌、清洁车和柔和地毯纹理构成安静但有反差的场景。" },
  { title: "宠物用品店", anchor: "宠物用品店货架前，牵引绳、玩具球、猫砂袋和小号购物篮作为环境道具。" },
  { title: "摄影棚侧场", anchor: "小型摄影棚侧场，白色无缝纸、沙袋、反光板、线缆和场记板都在产品周围但不遮挡主体。" },
  { title: "社区活动室", anchor: "社区活动室里，折叠桌、公告栏、保温杯和签到表形成朴素真实的生活化背景。" },
  { title: "商场维修通道", anchor: "商场维修通道门口，黄色警示牌、工具箱、推车和灰色防滑地面带出轻微反差感。" },
];

function pickPromptSceneExamples(count = 6) {
  return PROMPT_SCENE_BANK
    .map((scene) => ({ scene, rank: Math.random() }))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, count)
    .map(({ scene }) => scene);
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  });
  res.end(JSON.stringify(payload));
}

function createApiResponse(status, payload) {
  return { status, payload };
}

async function readRequestBody(req) {
  return req.method === "POST" ? readJson(req) : {};
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 20 * 1024 * 1024) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function normalizePath(value, fallback) {
  if (typeof value !== "string" || !value.trim()) return fallback;
  const trimmed = value.trim();
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function cleanEndpointText(value) {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .replace(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+/i, "")
    .replace(/^['"`]+|['"`]+$/g, "")
    .trim();
}

function isCompleteEndpoint(value) {
  try {
    const url = new URL(value);
    return Boolean(url.pathname && url.pathname !== "/" && !/\/v\d+\/?$/i.test(url.pathname));
  } catch {
    return false;
  }
}

function normalizeUpstreamModel(model, kind) {
  const text = typeof model === "string" ? model.trim() : "";
  if (kind === "prompt" && (!text || STALE_PROMPT_MODELS.has(text))) return DEFAULT_PROMPT_MODEL;
  if (kind === "image" && (!text || STALE_IMAGE_MODELS.has(text))) return DEFAULT_IMAGE_MODEL;
  return text;
}

function pickProxyConfig(payload, fallbackPath, kind = "generic") {
  const body = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  const { base_url, api_key, path, ...upstreamPayload } = body;
  const normalizedModel = normalizeUpstreamModel(upstreamPayload.model, kind);
  if (normalizedModel) upstreamPayload.model = normalizedModel;
  const useFixedImageTextApi = kind === "image" || kind === "prompt";
  const useVideoApi = kind === "video";
  const baseUrlInput = useFixedImageTextApi ? "" : cleanEndpointText(base_url);
  const rawBaseUrl = useFixedImageTextApi
    ? IMAGE_TEXT_BASE_URL
    : baseUrlInput
      ? baseUrlInput.replace(/\/+$/, "")
      : useVideoApi
        ? VIDEO_BASE_URL
        : TOAPIS_BASE_URL;
  const apiKey = useFixedImageTextApi
    ? IMAGE_TEXT_API_KEY
    : typeof api_key === "string" && api_key.trim()
      ? api_key.trim()
      : useVideoApi
        ? VIDEO_API_KEY
        : TOAPIS_API_KEY;
  const pathText = cleanEndpointText(path);
  const isDashScopeBase = (() => {
    try {
      return new URL(rawBaseUrl).hostname.includes("dashscope.aliyuncs.com");
    } catch {
      return false;
    }
  })();
  const isVolcengineBase = (() => {
    try {
      const hostname = new URL(rawBaseUrl).hostname;
      return hostname.includes("volces.com") || hostname.includes("bytepluses.com");
    } catch {
      return false;
    }
  })();
  const isHappyHorseModel =
    typeof upstreamPayload.model === "string" &&
    upstreamPayload.model.toLowerCase().includes("happyhorse");
  const dashScopeFallbackPath =
    isDashScopeBase && kind === "video" && isHappyHorseModel
      ? DASHSCOPE_VIDEO_SYNTHESIS_PATH
      : isDashScopeBase && kind === "image"
        ? DASHSCOPE_IMAGE_GENERATION_PATH
        : isVolcengineBase && kind === "video"
          ? VOLCENGINE_VIDEO_TASKS_PATH
        : fallbackPath;
  const upstreamUrl = /^https?:\/\//i.test(pathText)
    ? pathText
    : pathText
      ? `${rawBaseUrl}${normalizePath(pathText, "")}`
      : isCompleteEndpoint(rawBaseUrl)
        ? rawBaseUrl
        : `${rawBaseUrl}${normalizePath("", dashScopeFallbackPath)}`;
  return { baseUrl: rawBaseUrl, apiKey, upstreamUrl, upstreamPayload };
}

function parseUpstreamBody(text, status) {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    const lower = text.toLowerCase();
    const cloudflareTimeout = status === 524 || lower.includes("error code 524") || lower.includes("a timeout occurred");
    if (cloudflareTimeout) {
      return {
        error: "这次处理时间太久了，请稍后再试。",
        code: "UPSTREAM_TIMEOUT_524",
      };
    }
    const titleMatch = text.match(/<title>(.*?)<\/title>/i);
    return {
      error: titleMatch?.[1]?.trim() || "服务返回的内容暂时无法识别，请稍后再试。",
      code: "UPSTREAM_NON_JSON",
    };
  }
}

function getUpstreamErrorText(data) {
  if (!data) return "";
  if (typeof data === "string") return data;
  if (typeof data !== "object") return String(data);
  const record = data;
  const error = record.error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    if (typeof error.message === "string") return error.message;
    if (typeof error.code === "string") return error.code;
  }
  if (typeof record.message === "string") return record.message;
  if (typeof record.code === "string") return record.code;
  return JSON.stringify(data);
}

function extractUpstreamRequestId(text) {
  const value = String(text || "");
  return (
    value.match(/request ID\s+([0-9a-f-]{12,})/i)?.[1] ||
    value.match(/request[_\s-]?id["']?\s*[:=]\s*["']?([0-9a-f-]{12,})/i)?.[1] ||
    ""
  );
}

function isRetryableUpstreamServerError(data, status) {
  if (status < 500 || status >= 600) return false;
  const text = getUpstreamErrorText(data);
  return /server_error|retry your request|An error occurred while processing your request|do request failed/i.test(text);
}

function getBase64ImageMime(base64) {
  if (typeof base64 !== "string" || !base64.trim()) return "";
  let bytes;
  try {
    bytes = Buffer.from(base64.slice(0, 64), "base64");
  } catch {
    return "";
  }
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (bytes.length >= 6 && /^GIF8[79]a$/.test(bytes.toString("ascii", 0, 6))) return "image/gif";
  return "";
}

function validateGeneratedImagePayload(data) {
  const records = Array.isArray(data?.data) ? data.data : [];
  if (!records.length) return "";
  for (const record of records) {
    if (!record || typeof record !== "object") continue;
    if (typeof record.url === "string" && /^https?:\/\//i.test(record.url)) return "";
    if (typeof record.b64_json === "string") {
      if (getBase64ImageMime(record.b64_json)) return "";
      return "上游这次没有返回真正的图片，而是返回了网页验证内容。请稍后再试；如果连续出现，请让管理员更换图片上游。";
    }
  }
  return "";
}

function withUpstreamError(data, status, upstreamUrl) {
  if (status >= 200 && status < 300) return { ...data, upstreamUrl };
  const hasMessage =
    data &&
    typeof data === "object" &&
    ("error" in data || "message" in data);
  if (hasMessage) {
    const next = { ...data };
    if (typeof next.error === "string") {
      next.error = toPublicErrorMessage(next.error);
    } else if (next.error && typeof next.error === "object") {
      const errorRecord = next.error;
      next.error = toPublicErrorMessage(errorRecord.message || errorRecord.code || "");
    } else if (typeof next.message === "string") {
      next.error = toPublicErrorMessage(next.message);
    }
    return { ...next, upstreamUrl };
  }
  return {
    ...data,
    error: `服务请求没有成功（${status}），请让管理员检查服务配置。`,
    upstreamUrl,
  };
}

function toPublicErrorMessage(message) {
  const text = String(message || "").trim();
  if (!text) return "这次请求没有成功，请稍后再试。";
  if (/server_error|retry your request|An error occurred while processing your request/i.test(text)) {
    const requestId = extractUpstreamRequestId(text);
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
  if (/model_not_found|No available channel|没有找到模型|模型不存在|模型不可用/i.test(text)) {
    return "当前模型暂时不可用，请换一个模型，或让管理员确认模型名称。";
  }
  if (/timeout|timed out|Error code 524|超时/i.test(text)) {
    return "这次处理时间太久了，请稍后再试。";
  }
  if (/Invalid image input|Invalid data:image input|Only data:image|Failed to download reference image/i.test(text)) {
    return "有一张图片还没有准备好，请重新上传或刷新页面后再试。";
  }
  if (/Missing task id|task id|缺少视频任务号/i.test(text)) {
    return "还没有找到这条视频任务，请重新生成一次。";
  }
  if (/Not found|404/i.test(text)) {
    return "没有找到这个服务入口，请刷新页面后再试。";
  }
  if (/Unknown server error/i.test(text)) {
    return "服务刚刚开了个小差，请稍后再试。";
  }
  return text;
}

function getProductFamily(productType) {
  const text = typeof productType === "string" ? productType.toLowerCase() : "";
  if (text.includes("奶牛") || text.includes("cow") || text.includes("bull")) return "cow";
  if (text.includes("鲨鱼") || text.includes("shark")) return "shark";
  if (text.includes("灰色老鼠") || text.includes("老鼠") || text.includes("mouse") || text.includes("rat")) return "mouse";
  if (text.includes("青蛙") || text.includes("frog")) return "frog";
  if (text.includes("相扑") || text.includes("sumo")) return "sumo";
  return "generic";
}

function getProductStableName(productType) {
  const family = getProductFamily(productType);
  if (family === "shark") return "鲨鱼充气服";
  if (family === "cow") return "奶牛充气服";
  if (family === "mouse") return "灰色老鼠充气服";
  if (family === "frog") return "青蛙充气服";
  if (family === "sumo") return "相扑充气服";
  const text = typeof productType === "string" && productType.trim() ? productType.trim() : "可穿戴充气服";
  return text;
}

function buildInflatableHardwareMaterialLocks(productType) {
  const family = getProductFamily(productType);
  const hardwareMaps = {
    cow: [
      "COW AIR-HARDWARE MAP: the orange circular blower valve / air inlet / air outlet / pump port belongs on the rear-right/back-side surface at the reference height, with orange ring, circular grille or cap, and local seam relationship preserved. It may appear only from rear or physically valid side-edge angles; never place it on the front udder, white belly, snout, face, or black patch as decoration.",
      "COW REAR DETAIL MAP: rear centerline zipper teeth, vertical seam, centered white tail with black tip, and rear-right orange valve must stay separated and correctly ordered on the back surface.",
    ],
    shark: [
      "SHARK AIR-HARDWARE MAP: the orange circular blower valve / air inlet / air outlet / pump port belongs on the valve-side waist side panel at the same height and direction as the side view, with orange ring and circular mesh/grille or cap preserved. In a front camera it may show only as a thin side-edge detail if physically visible; never move it onto the white belly panel, transparent face window, front zipper, rear tail fin, or gill stripes.",
      "SHARK MATERIAL MAP: preserve muted cyan-blue crinkled nylon/PVC fabric, visible seam tension, white belly stitching edge, zipper teeth, soft slack around fin roots and foot covers, and the slightly underinflated flatter body. Do not smooth the body into glossy plastic, bright blue toy rubber, or a clean CGI shell.",
    ],
    mouse: [
      "MOUSE AIR-HARDWARE MAP: the green circular blower valve / air inlet / air outlet / pump port belongs on the rear/back-side surface from the back view, with green ring and circular grille or cap preserved. It must not be moved to the cream front belly, face, snout, ears, arms, or tail.",
      "MOUSE REAR DETAIL MAP: back centerline zipper teeth, vertical rear seam, green valve, and cream/yellow tail root must remain rear-owned details and should only appear from rear or physically valid side-edge angles.",
    ],
    frog: [
      "FROG AIR-HARDWARE MAP: the orange blower valve / air inlet / air outlet / pump port belongs on the rear/back surface near the black spine/zipper structure, with orange ring and circular grille or cap preserved. It must not be pasted onto the cream belly, blue scarf, face window, mouth band, front chest, hands, or spots.",
      "FROG REAR DETAIL MAP: black spine-like rear pattern, zipper teeth, scarf back flap, orange valve, green rear field, and rear fabric wrinkles must stay attached to the back surface only.",
    ],
    sumo: [
      "SUMO AIR-HARDWARE MAP: the orange circular blower valve / air inlet / air outlet / pump port belongs on the rear/back-side surface shown by the back view and support valve image, with orange ring, circular mesh/grille or cap, reference height, and nearby belt/zipper spacing preserved. Never move it to the front stomach, chest lines, belly button, mawashi front panel, face, or arms.",
      "SUMO REAR DETAIL MAP: back centerline zipper teeth, rear black belt/loincloth structure, orange valve, beige rear field, and soft rear nylon folds must remain rear-owned and correctly layered.",
    ],
    generic: [
      "PRODUCT AIR-HARDWARE MAP: every valve, blower valve, air inlet, air outlet, pump port, inflation port, deflation port, fan grille, ring, cap, tube, or zipper belongs exactly to the surface, height, scale, color, and seam relationship shown in the four views.",
    ],
  };

  return [
    "MATERIAL AND AIR-HARDWARE HARD LOCK:",
    "Treat valves, blower valves, fan ports, air inlets, air outlets, pump ports, inflation/deflation ports, rings, caps, and grilles as physical product hardware, not optional decoration. Preserve their exact count, color, circular shape, diameter, ring thickness, grille/mesh/cap detail, height, side/back ownership, and relationship to seams/zipper/tail/belt/patches from the four-view references and preset support evidence.",
    "Never invent extra valves, ports, pumps, tubes, buttons, caps, logos, handles, stickers, or hardware. Never duplicate, recolor, resize, simplify, hide, or relocate an existing valve/port to make it more visible.",
    "Visibility rule: hidden side/back hardware must stay hidden in a front camera. If the chosen side or rear angle should physically reveal the valve/port, it must remain visible, unobscured, and in the correct location; do not let arms, fins, tail, scarf, belt, props, text, lighting rigs, or scenery cover it.",
    "Material rule: preserve thin crinkled inflatable nylon/PVC fabric with soft local slack, folds, seams, stitching, zipper teeth, color-edge stitching, valve ring texture, grille/cap detail, fabric tension, and slight pressure wrinkles. Lighting and background may change, but these material details must not be erased.",
    "Negative material rule: no smooth plastic shell, rubber toy surface, plush/fur, realistic animal skin, human skin replacement, glossy CGI mascot body, airbrushed texture, or perfectly taut display-balloon finish.",
    ...(hardwareMaps[family] || hardwareMaps.generic),
  ];
}

function buildFirstFrameProductVisualLocks(productType) {
  const family = getProductFamily(productType);
  if (family === "cow") {
    return [
      "MANDATORY COW INFLATABLE COSTUME VISUAL LOCKS:",
      "Front reference lock: preserve the white cow body, irregular black cow patches, large rounded white cow head, two cream upward curved horns, black outer ears with pink inner ears, small black hair tuft, blue cartoon eyes, black eyebrows, pink snout, two black nostrils, black smile line, pink cheek circles, black hoof gloves, black foot hoof covers, and the pink udder centered on the lower front belly with four protruding teats.",
      "Left-side reference lock: preserve the side-view thickness, protruding pink snout, side eye and cheek, horn/ear overlap, side body patches, short padded arm, black hoof glove, black foot cover, visible 155-190cm height-marker proportion, and moderate wearable side volume.",
      "Right-side reference lock: preserve the opposite three-quarter/side silhouette, front udder visibility only when physically visible, arm/hoof shape, leg width, black patch placement density, and rounded but human-wearable torso volume.",
      "Back reference lock: preserve the back zipper and central vertical seam from the head down the torso, black patches on the rear head/back/legs, two horns seen from behind, black ears, orange circular blower valve on the rear-right side, centered white rear tail with black tip, separated legs, and black hoof foot covers.",
      "Preset auxiliary support lock: if same-product auxiliary support views are supplied, use them only to refine local nylon wrinkles, seams, zipper teeth, valve ring, patch edges, udder protrusions, snout shape, eye graphics, horn fabric, ear fabric, and hoof folds exactly where the core four views say they belong.",
      "VIEW TOPOLOGY LOCK:",
      "FOUR-VIEW REFERENCES ARE TOPOLOGY MAPS, NOT COLLAGE REQUIREMENTS.",
      "PRIMARY CAMERA IS FRONT-FACING BY DEFAULT: use the front reference as the dominant product view for first-frame generation; do not switch to side or rear unless the user explicitly asks for a side or rear view.",
      "Choose one primary camera family before rendering: front, left side, right side, or rear. The generated frame must obey that camera family instead of mixing all reference views into one surface.",
      "Visibility matrix: front camera may show the cow face, horns, ears, black-white front patches, black hoof gloves, black foot covers, and front pink udder; side camera may show only the physically visible side thickness, protruding snout, side patches, arm/hoof and partial udder if naturally visible; rear camera may show the back zipper, orange rear-side valve, rear tail, rear patches, horns/ears from behind, and no front snout or front udder unless the pose is a true turn.",
      "Do not satisfy product consistency by showing all reference details in one generated frame. Product consistency means correct physical placement and preserved shape, not maximum visible details.",
      "Do not merge details from different views into one impossible surface. The front cow face and pink udder belong to the front surface. The orange blower valve and rear tail belong to the back/rear-side surface. Back zipper/seam belongs on the rear centerline only, never on the front belly.",
      "For a front three-quarter view, show front cow face and front udder plus only a narrow side edge; do not attach the back tail, back zipper, or rear orange valve to the front belly. For a rear view, show the centered rear tail and back zipper; do not show the pink snout, smile, front eyes, or front udder on the back.",
      "If the chosen camera angle cannot physically show a locked detail, hide it naturally instead of moving it to a wrong location.",
      "SHAPE AND VOLUME ENVELOPE LOCK:",
      "Preserve the shared four-view HUMAN-BODY ENVELOPE: this is a real person wearing a rounded but compact 155-190cm cow inflatable costume. The inflatable shell is only moderately larger than the wearer; shoulders, torso, waist/hip transition, separated legs, black hoof feet, and soft nylon wrinkles must stay close to the references.",
      "HUMAN-SCALE SIZE LOCK: the cow costume must stay close to the wearer's body scale, not a giant mascot shell. The head height, head width, body width, belly volume, leg width, side thickness, horn size, ear size, udder size, and tail length must not grow beyond the references.",
      "Do not enlarge the product into a giant rounded cow head, barrel-shaped torso, oversized standing balloon, theme-park mascot, plush cow, realistic animal, or inflated display prop. If the result looks like a full taut mascot shell instead of a person-sized wearable suit, it is wrong.",
      "Wrinkle density and slight looseness are fidelity markers: keep visible white nylon wrinkles, seam tension, black patch edge texture, and soft fabric slack. Do not smooth the fabric into plastic, rubber, plush, realistic fur, or a clean CGI cow character.",
      "Preserve all product details even when the requested scene changes. The scene may change, but these product marks must remain visible when their side is visible.",
      "Do not remove, move, shrink, recolor, simplify, or invent any product structure. Do not add extra horns, extra ears, real fur, extra legs, extra hands, a different mouth, new logos, accessories, or new decorative graphics.",
      "Do not convert the costume into a generic black-white cow mascot. The blue eyes, pink snout, black smile line, pink cheek circles, front udder with four teats, black hoof gloves, back zipper, orange rear-side blower valve, and centered rear tail are identity-critical.",
    ];
  }
  if (family === "shark") {
    return [
      "MANDATORY SHARK COSTUME VISUAL LOCKS:",
      "Front reference lock: preserve the white belly/front panel, small shallow horizontally curved trapezoid transparent face window with glossy blue reflection, visible human face behind the window only inside that small window, vertical zipper below the window, central vertical seam, muted cyan-blue nylon outer border, white inner arm-fin panels, blue foot covers, and inflated fabric wrinkles.",
      "SHARK FACE-WINDOW GEOMETRY LOCK: the front transparent face window is a small shallow curved horizontal trapezoid/crescent opening high on the white front panel. It is not a large rectangle, not a straight visor, not a wide mask, not an open mouth, not teeth, and not a smile graphic. Do not enlarge it to show a full face; keep the original shallow arc and compact width from the front reference.",
      "SHARK COLOR LOCK: preserve the reference muted cyan-blue nylon color with slightly darker teal-blue side shadows. Do not use vivid bright blue, electric blue, saturated cobalt, toy-plastic blue, or glossy CGI blue. White panels stay slightly warm fabric white, not pure plastic white.",
      "SHARK HARD SCALE NEGATIVE LOCK: a huge vertical capsule body is a product failure. Do not render a tall upright capsule, torpedo, cylinder balloon, giant rounded mascot shell, glossy blue display prop, or fully pressurized shark tube. The body must read as a real person inside a soft wearable suit, only slightly larger than the person.",
      "SHARK FRONT-SILHOUETTE OVERRIDE: for the default front camera, preserve the front reference outline instead of inventing a cleaner studio silhouette. Keep the head/torso contour narrow and uneven like the real nylon suit, keep the blue side border modest, keep the long white belly panel dominant, and keep the waist-to-leg transition close to the uploaded front image. Do not idealize it into a symmetric upright capsule with smooth round sides.",
      "SHARK ARM-FIN HARD LOCK: side arm fins are short fabric hand fins attached to the arms, with white inner panels, naturally hanging close to the body or only mildly angled outward. Do not stretch either fin sideways into a horizontal airplane wing, glider wing, cape, huge paddle, manta ray wing, or wide blue-white triangle. Total product width including fins must stay close to the four-view references.",
      "Left-side reference lock: preserve the left-side silhouette and thickness, the side eye/gill/fin information visible on that side, fabric seam direction, bottom shoe/foot cover, and which structures are absent from that side.",
      "Right-side reference lock: preserve the right-side silhouette and thickness, the orange circular blower valve direction and height if visible, side fin, side vertical seam, tail-edge visibility, and black shoe sole at the bottom.",
      "Back reference lock: preserve the plain muted cyan-blue back, central vertical back seam, top seam/stripe, centered blue rear tail fin, both side arm fins, orange valve visible on one side, black shoe soles, and wrinkled nylon inflatable fabric.",
      "Preset auxiliary support lock: if same-product auxiliary support views are supplied, use them only to refine local material, zipper, seam, wrinkle, valve, face-window, color-edge, and stitching evidence exactly where the core four views say they belong; never use support views as new decorative graphics or new product surfaces.",
      "VIEW TOPOLOGY LOCK:",
      "FOUR-VIEW REFERENCES ARE TOPOLOGY MAPS, NOT COLLAGE REQUIREMENTS.",
      "PRIMARY CAMERA IS FRONT-FACING BY DEFAULT: use the front reference as the dominant product view for first-frame generation; do not switch to side or rear unless the user explicitly asks for a side or rear view.",
      "Choose one primary camera family before rendering: front, left side, right side, or rear. The generated frame must obey that camera family instead of mixing all reference views into one surface.",
      "Visibility matrix: front camera may show the front belly/window/zipper plus a thin side edge only; left-side camera may show only the structures visible on the left-side reference; right-side camera may show only the structures visible on the right-side reference, including the valve if that is the valve side; rear camera may show the rear tail fin, back seam, and plain blue back only.",
      "Do not satisfy product consistency by showing all reference details in one generated frame. Product consistency means correct physical placement and preserved shape, not maximum visible details.",
      "Do not merge details from different views into one impossible surface. The front belly/window/zipper belong only to the front-facing surface. Left-side details stay on the left side. Right-side details stay on the right side. The rear tail fin belongs on the back centerline only, never on the front belly or side waist.",
      "For a front three-quarter view, show the front belly/window/zipper and only a narrow side edge; do not attach the back tail fin to the visible side. For a left-side or right-side view, obey that side's reference exactly; the front transparent window may only appear as a thin edge, not as a large side panel. For a rear view, show the centered back tail fin and back seam; do not show the front window or gill stripes on the back.",
      "Visible-detail rule: in a front camera, the face window and zipper are mandatory, the side valve is optional in a front camera only if it is naturally visible on a thin side edge, and the rear tail fin is hidden in a front camera unless the product is explicitly rear-facing.",
      "Do not force hidden side or rear details into a front-facing frame. Never move the side valve, zipper, tail fin, gill stripes, or face window just to make them visible.",
      "If the chosen camera angle cannot physically show a locked detail, hide it naturally instead of moving it to a wrong location.",
      "SHAPE AND VOLUME ENVELOPE LOCK:",
      "Preserve the shared four-view HUMAN-BODY ENVELOPE: this is a real person wearing a compact low-to-medium inflated shark costume, closer to softly underinflated than fully pressurized. The inflatable shell is only modestly larger than the wearer; visible shoulders, narrowed waist/hip transition, separated legs, loose wrinkled foot covers, and small black shoes must stay close to the reference proportions.",
      "SHARK SOFTNESS / UNDERINFLATION LOCK: keep the body flatter, softer, slightly sagging and wrinkled like the front reference. The head and torso should look lightly filled and fabric-soft, not taut, not round, not rigid, and not freshly overinflated. Preserve a wearable human-body thickness instead of a balloon-cylinder volume. Required inflation impression: lightly underinflated, slightly flat, with gentle slack around the torso, legs, feet, and arm-fin roots.",
      "HUMAN-SCALE SIZE LOCK: the costume must stay close to the wearer's body scale, not a giant mascot shell. The head height, head width, body width, and side thickness must not grow beyond the references; keep the inflatable shell only slightly larger than the human body inside.",
      "Do not enlarge the product into a giant rounded head, barrel-shaped torso, tall bulky tube, oversized standing balloon, vertical capsule body, torpedo body, cylinder balloon, theme-park mascot, or inflated display prop. If the result looks like a full taut mascot shell instead of a person-sized wearable suit, it is wrong.",
      "The front white belly panel must stay broad and centered, roughly 45%-55% of total body width. The body sides must gently curve inward toward the legs; do not collapse into a narrow tube and do not expand into a balloon cylinder.",
      "Do not let ecommerce cleanup, relighting, or pose normalization change the product outline. A slightly awkward, wrinkled, imperfect reference-like silhouette is correct; a polished, symmetrical, tall capsule silhouette is wrong.",
      "The arm fins must not drive the silhouette width. Keep them shorter than the torso width, soft, wrinkled, close to the side body, and visibly connected to the wearer's arms. A wide horizontal wing silhouette is wrong even if the scene looks more dynamic.",
      "Wrinkle density and slight looseness are fidelity markers: keep visible nylon wrinkles, seam tension, and soft fabric slack. Do not smooth the fabric into plastic, rubber, plush, a clean CGI creature, or a fully taut inflated display suit.",
      "Preserve all product details even when the requested scene changes. The scene may change, but these product marks must remain visible when their side is visible.",
      "Do not remove, move, shrink, recolor, simplify, or invent any product structure. Do not make the product slimmer, taller, shorter, rounder, more muscular, more balloon-like, more brightly colored, or more animal-like than the references. Do not add a mouth, teeth, rectangular face window, oversized face visor, new eyes beyond the single side eye, logo, extra accessories, claws, fur, scales, realistic shark skin, or new decorative graphics.",
      "Do not convert the costume into a clean generic blue-white shark suit. The black side eye, five black gill stripes, orange side blower valve, front transparent face window, vertical zipper, and rear tail fin are identity-critical.",
    ];
  }
  if (family === "mouse") {
    return [
      "MANDATORY GRAY MOUSE INFLATABLE COSTUME VISUAL LOCKS:",
      "Front reference lock: preserve the light gray mouse body, rounded mouse head, two round ears with cream inner ear panels, cream face/nose area, protruding gray snout, black open mouth, brown cartoon eyes, large cream oval belly panel, padded arms, separated legs, foot covers, and nylon wrinkles.",
      "Side reference lock: preserve side thickness, the cream/yellow tail emerging from the rear waist/hip area, rounded but wearable body volume, side seam behavior, side face depth, and soft fabric folds.",
      "Back reference lock: preserve the center back zipper/seam, green circular blower valve on the back side, cream/yellow tail root, plain gray rear field, separated legs, and foot-cover shape.",
      "VIEW TOPOLOGY LOCK:",
      "FOUR-VIEW REFERENCES ARE TOPOLOGY MAPS, NOT COLLAGE REQUIREMENTS.",
      "PRIMARY CAMERA IS FRONT-FACING BY DEFAULT: use the front reference as the dominant product view for first-frame generation unless the user explicitly asks for another angle.",
      "Visibility matrix: front camera may show the mouse face, cream belly, ears, snout, arms, legs, and a thin side edge; side camera may show side thickness and the tail if naturally visible; rear camera may show back zipper, green valve, and tail root. Do not move the green valve or rear zipper to the front belly.",
      "SHAPE AND VOLUME ENVELOPE LOCK:",
      "Preserve the human-scale wearable envelope: a real person inside a low-to-medium inflated gray mouse suit. The shell is only moderately larger than the wearer; waist/hip transition, separated legs, foot contact, and fabric wrinkles must stay visible.",
      "Do not enlarge into a giant round mouse head, plush toy, realistic animal, theme-park mascot shell, standing balloon, or generic gray character. Do not add whiskers, new teeth, extra ears, fur, logos, accessories, or redesigned face graphics.",
    ];
  }
  if (family === "frog") {
    return [
      "MANDATORY FROG INFLATABLE COSTUME VISUAL LOCKS:",
      "Front reference lock: preserve the green frog body, cream face/belly region, small face window, black horizontal mouth band, raised frog eyes on top of the head, blue scarf around the neck, black spot pattern, webbed hands, webbed feet, and medium-soft nylon wrinkles.",
      "Side reference lock: preserve side thickness, black spots, scarf edge, cream belly side boundary, frog hand shape, webbed foot shape, and only the side-visible details from that side.",
      "Back reference lock: preserve the black spine-like rear pattern, center back zipper/seam, orange blower valve, scarf back flap, green rear field, separated legs, and rear foot-cover shape.",
      "PRESET AUXILIARY SUPPORT LOCK: if auxiliary frog side evidence is supplied, use it only to refine side asymmetry, scarf edge, spots, hand/foot shape, and local material; it is not a new decorative surface.",
      "VIEW TOPOLOGY LOCK:",
      "FOUR-VIEW REFERENCES ARE TOPOLOGY MAPS, NOT COLLAGE REQUIREMENTS.",
      "PRIMARY CAMERA IS FRONT-FACING BY DEFAULT: use the front reference as the dominant product view unless the user explicitly asks for another angle.",
      "Visibility matrix: front camera may show raised eyes, small face window, black mouth band, blue scarf, cream belly, frog hands and webbed feet; side camera may show side spots and thickness; rear camera may show black spine pattern, zipper, orange valve, and scarf flap. Do not paste rear zipper or orange valve onto the front belly.",
      "SHAPE AND VOLUME ENVELOPE LOCK:",
      "Preserve the real-person wearable envelope and low-to-medium inflated frog silhouette. The body may be rounded but must keep human stance, separated legs, floor contact, and fabric wrinkles.",
      "Do not turn it into a realistic frog, plush frog, giant round mascot head, fully taut display balloon, or generic green creature. Do not add teeth, extra eyes, new spot patterns, new accessories, or a different scarf.",
    ];
  }
  if (family === "sumo") {
    return [
      "MANDATORY SUMO INFLATABLE COSTUME VISUAL LOCKS:",
      "Front reference lock: preserve the beige/flesh inflatable body, black mawashi belt, black front loincloth panel, simple chest graphics, belly-button dot, rounded head, black topknot/cap, short padded arms, separated legs, and fabric folds.",
      "Side reference lock: preserve the wide T-shaped side silhouette, side thickness, short arm extension, side belt ties, black waist band wrapping around the body, and compact human-scale wearable volume.",
      "Back reference lock: preserve the center back zipper/seam, orange circular blower valve, rear black belt/loincloth structure, beige rear field, separated legs, and rear soft nylon folds.",
      "PRESET AUXILIARY SUPPORT LOCK: if auxiliary sumo valve evidence is supplied, use it only to refine rear/side valve position, belt ties, zipper, and material wrinkles; it is not a new topology surface.",
      "VIEW TOPOLOGY LOCK:",
      "FOUR-VIEW REFERENCES ARE TOPOLOGY MAPS, NOT COLLAGE REQUIREMENTS.",
      "PRIMARY CAMERA IS FRONT-FACING BY DEFAULT: use the front reference as the dominant view unless the user explicitly asks for another angle.",
      "Visibility matrix: front camera may show the black front mawashi, chest lines, belly dot, head cap, arms, and legs; side camera may show the wide T shape and belt ties; rear camera may show the back zipper, orange valve, and rear belt only. Do not move the orange valve or rear zipper onto the front stomach.",
      "SHAPE AND VOLUME ENVELOPE LOCK:",
      "Preserve a real-person low-to-medium inflated sumo costume. It is wider than the wearer but still a wearable suit with human stance, separated legs, floor contact, and soft fabric wrinkles.",
      "Do not convert it into a real sumo wrestler, muscular person, baby doll, kimono costume, plush toy, giant round display balloon, or generic beige mascot. Do not add complex face details, hair, clothes, logos, or accessories.",
    ];
  }
  return [
    "MANDATORY WEARABLE INFLATABLE PRODUCT VISUAL LOCKS:",
    "Use the four references to preserve the exact product silhouette, human-scale wearable volume, colors, pattern density, component positions, seams, valves, zipper, face/ornament features, appendages, feet, and material wrinkles.",
    "VIEW TOPOLOGY LOCK:",
    "FOUR-VIEW REFERENCES ARE TOPOLOGY MAPS, NOT COLLAGE REQUIREMENTS.",
    "PRIMARY CAMERA IS FRONT-FACING BY DEFAULT: use the front reference as the dominant product view for first-frame generation; do not switch to side or rear unless the user explicitly asks for a side or rear view.",
    "Choose one primary camera family before rendering: front, left side, right side, or rear. The generated frame must obey that camera family instead of mixing all reference views into one surface.",
    "Do not satisfy product consistency by showing all reference details in one generated frame. Product consistency means correct physical placement and preserved shape, not maximum visible details.",
    "If the chosen camera angle cannot physically show a locked detail, hide it naturally instead of moving it to a wrong location.",
    "SHAPE AND VOLUME ENVELOPE LOCK:",
    "Preserve the shared four-view HUMAN-BODY ENVELOPE: this is a real person wearing a low-to-medium inflated costume. The inflatable shell is only moderately larger than the wearer; shoulders, torso, waist/hip transition, separated legs, foot covers, and soft nylon wrinkles must stay close to the references.",
    "HUMAN-SCALE SIZE LOCK: the costume must stay close to the wearer's body scale, not a giant mascot shell, standing balloon, inflated display prop, plush toy, or real animal.",
    "Do not remove, move, shrink, recolor, simplify, or invent any product structure. If the scene request conflicts with product fidelity, ignore the conflicting scene detail and keep product fidelity.",
  ];
}

function buildVideoProductVisualLocks(productType) {
  const family = getProductFamily(productType);
  if (family === "cow") {
    return [
      "MANDATORY COW INFLATABLE COSTUME VISUAL LOCKS:",
      "Keep the white cow body, irregular black patches, large rounded cow head, cream horns, black ears with pink interiors, small black hair tuft, blue cartoon eyes, black eyebrows, pink snout, black nostrils, black smile line, pink cheek circles, black hoof gloves, black foot hoof covers, front pink udder with four teats, back zipper, orange rear-side blower valve, centered rear tail with black tip, and nylon wrinkles stable from frame 1 to the final frame.",
      "VIEW TOPOLOGY LOCK:",
      "FOUR-VIEW REFERENCES ARE TOPOLOGY MAPS, NOT COLLAGE REQUIREMENTS.",
      "PRIMARY CAMERA IS FRONT-FACING BY DEFAULT: preserve the approved first-frame camera unless the user explicitly asks for a side or rear turn; do not switch to side or rear unless the user explicitly asks.",
      "Keep the camera inside the approved first-frame view family. Do not rotate far enough to expose hidden side or rear surfaces unless those surfaces are already physically visible and correctly placed in the approved first frame.",
      "Maintain view-correct placement through the whole motion. The front cow face and pink udder stay on the front surface, the orange blower valve stays on the rear/right-side surface, the back zipper stays on the rear centerline, and the rear tail stays centered on the back only.",
      "When the camera rotates, reveal and hide details according to physical visibility. A detail that is not visible from the current angle must remain hidden, not relocated.",
      "SHAPE AND VOLUME ENVELOPE LOCK:",
      "Maintain the same 155-190cm human-body envelope and low-to-medium inflated cow-costume silhouette through every frame. The costume must not become skinny, deflated, overly tall, overly round, balloon-spherical, muscular, creature-like, mascot-like, plush-like, or realistic-animal-like.",
      "HUMAN-SCALE SIZE LOCK: the cow costume must stay close to the wearer's body scale. Head height, head width, body width, belly volume, horn size, ear size, udder size, leg thickness, side thickness, and tail length must not grow beyond the references across any frame.",
      "During motion, volume may wobble slightly like nylon inflatable fabric, but head size, body width, patch placement, snout size, udder size, horn size, hoof size, valve position, zipper position, and tail position must remain stable. No swelling, shrinking, melting, stretching, smoothing, or mascot-shell enlargement across frames.",
    ];
  }
  if (family === "shark") {
    return [
      "MANDATORY SHARK COSTUME VISUAL LOCKS:",
      "Keep the small shallow horizontally curved trapezoid transparent face window, visible face behind it only inside that compact window, vertical zipper, white belly panel, muted cyan-blue nylon outer border, white inner fins, blue foot covers, inflated fabric wrinkles, one black side eye, exactly five black curved gill stripes, orange circular side blower valve, side seam, centered rear tail fin, back seam, and black shoe soles.",
      "Maintain the exact shark face-window geometry through every frame: small shallow curved horizontal trapezoid/crescent, not a rectangle, not a large visor, not a mouth, not teeth, not a wide mask, and not a full-face display window.",
      "Maintain the muted cyan-blue nylon color through every frame. No vivid bright blue, electric blue, saturated cobalt, toy-plastic blue, or glossy CGI blue.",
      "Maintain the tightened shark scale lock through every frame: no huge vertical capsule body, no torpedo/cylinder balloon body, no giant mascot shell, no glossy display prop, and no fully taut overinflated blue tube.",
      "Maintain the tightened arm-fin lock through every frame: fins stay short, soft, close to the body, or only mildly angled outward. No horizontal airplane-wing, glider-wing, cape, manta-ray-wing, huge paddle, or extra-wide silhouette.",
      "VIEW TOPOLOGY LOCK:",
      "FOUR-VIEW REFERENCES ARE TOPOLOGY MAPS, NOT COLLAGE REQUIREMENTS.",
      "PRIMARY CAMERA IS FRONT-FACING BY DEFAULT: preserve the approved first-frame camera unless the user explicitly asks for a side or rear turn; do not switch to side or rear unless the user explicitly asks.",
      "Keep the camera inside the approved first-frame view family. Do not rotate far enough to expose hidden side or rear surfaces unless those surfaces are already physically visible and correctly placed in the approved first frame.",
      "Choose one primary camera family before rendering and maintain a physically valid camera path through the motion. The video may reveal or hide product surfaces as the camera/subject moves, but it must never paste details from unrelated views onto the wrong surface.",
      "Visibility matrix: front-facing frames may show the front belly/window/zipper plus a thin side edge only; left-side frames may show only structures visible on the left-side reference; right-side frames may show only structures visible on the right-side reference, including the valve if that is the valve side; rear-facing frames may show the rear tail fin, back seam, and plain blue back only.",
      "Do not satisfy product consistency by showing all reference details in one generated frame. Product consistency means correct physical placement and preserved shape, not maximum visible details.",
      "Maintain view-correct placement through the whole motion. The front belly/window/zipper stay on the front surface, left-side details stay on the left side, right-side details stay on the right side, and rear tail fin stays on the back centerline only; never move a rear tail fin to the side waist, never move the front window onto the side panel, and never combine front, side, and back details on one flat surface.",
      "When the camera rotates, reveal and hide details according to physical visibility. A detail that is not visible from the current angle must remain hidden, not relocated.",
      "SHAPE AND VOLUME ENVELOPE LOCK:",
      "Maintain the same human-body envelope and low-to-medium inflated four-view silhouette through every frame, closer to soft slightly underinflated fabric than full taut pressure. The costume must not become skinny, fully collapsed, overly tall, overly round, balloon-spherical, capsule-shaped, torpedo-shaped, muscular, creature-like, or mascot-like.",
      "HUMAN-SCALE SIZE LOCK: the costume must stay close to the wearer's body scale, not a giant mascot shell. The head height, head width, body width, and side thickness must not grow beyond the references across any frame; keep the inflatable shell only slightly larger than the human body inside.",
      "Do not let motion inflate or enlarge the product into a giant rounded head, barrel-shaped torso, tall bulky tube, oversized standing balloon, theme-park mascot, or inflated display prop. The original product is roughly body-sized, so preserve that compact wearable scale exactly.",
      "Keep the reference body proportions: rounded but compact shark head, compact soft torso, broad centered white belly panel at about 45%-55% of body width, slightly narrowing waist-to-leg transition, separated padded legs, loose wrinkled foot covers, small black shoes visible, side arm fins with white inner panels, and rear tail fin size fixed.",
      "During motion, volume may wobble slightly like nylon inflatable fabric, but head size, body width, belly panel width, tail size, fin size, and leg thickness must remain stable. Preserve the slightly soft, flatter, lightly underinflated, wrinkled body; no swelling, shrinking, melting, stretching, smoothing, overinflating, horizontal fin enlargement, or mascot-shell enlargement across frames.",
    ];
  }
  if (family === "mouse") {
    return [
      "MANDATORY GRAY MOUSE INFLATABLE COSTUME VIDEO LOCKS:",
      "Keep the light gray mouse body, rounded ears with cream interiors, cream face/nose area, protruding gray snout, black open mouth, brown cartoon eyes, cream oval belly, cream/yellow rear tail, back zipper, green circular blower valve, separated legs, foot covers, and nylon wrinkles stable from frame 1 to the final frame.",
      "VIEW TOPOLOGY LOCK:",
      "Preserve the approved first-frame camera family. Front-visible mouse face and belly stay on the front surface; tail stays rear/side; green valve and back zipper stay on the back only. Hidden components remain hidden instead of relocating.",
      "SHAPE AND VOLUME ENVELOPE LOCK:",
      "Maintain the same human-scale low-to-medium inflated mouse costume through every frame. No swelling into a round mascot, no shrinking, no plush/fur conversion, no realistic animal transformation, no new whiskers, teeth, logos, or accessories.",
    ];
  }
  if (family === "frog") {
    return [
      "MANDATORY FROG INFLATABLE COSTUME VIDEO LOCKS:",
      "Keep the green frog body, raised top eyes, small face window, black mouth band, cream belly/face region, blue scarf, black spots, webbed hands, webbed feet, rear black spine pattern, center back zipper, orange blower valve, and nylon wrinkles stable from frame 1 to the final frame.",
      "VIEW TOPOLOGY LOCK:",
      "Preserve the approved first-frame camera family. Front face/scarf/belly details stay on the front, side spots stay on the side, rear spine/zipper/orange valve stay on the back. Do not rotate into unapproved hidden surfaces unless requested and physically valid.",
      "SHAPE AND VOLUME ENVELOPE LOCK:",
      "Maintain the same human-scale low-to-medium inflated frog suit with separated legs and floor contact. No giant mascot head, no realistic frog, no plush texture, no extra eyes, no new scarf, no new spot pattern, no product swelling or melting across frames.",
    ];
  }
  if (family === "sumo") {
    return [
      "MANDATORY SUMO INFLATABLE COSTUME VIDEO LOCKS:",
      "Keep the beige inflatable body, black mawashi belt, black front loincloth panel, simple chest lines, belly-button dot, rounded head, black topknot/cap, wide T-shaped side silhouette, back zipper, orange circular blower valve, rear belt structure, separated legs, and nylon wrinkles stable from frame 1 to the final frame.",
      "VIEW TOPOLOGY LOCK:",
      "Preserve the approved first-frame camera family. Front mawashi/chest/belly details stay on the front; side belt ties stay on the side; back zipper and orange valve stay on the rear. Do not move rear hardware onto the front stomach.",
      "SHAPE AND VOLUME ENVELOPE LOCK:",
      "Maintain the same human-scale low-to-medium inflated sumo costume. No real wrestler conversion, no kimono, no baby doll, no giant display balloon, no body swelling, no shrinking, no melting, no new face/hair/clothing/accessories across frames.",
    ];
  }
  return [
    "MANDATORY WEARABLE INFLATABLE PRODUCT VISUAL LOCKS:",
    "Keep the approved first-frame product silhouette, human-scale wearable volume, colors, pattern density, component positions, seams, valves, zipper, face/ornament features, appendages, feet, and material wrinkles stable from frame 1 to the final frame.",
    "VIEW TOPOLOGY LOCK:",
    "FOUR-VIEW REFERENCES ARE TOPOLOGY MAPS, NOT COLLAGE REQUIREMENTS.",
    "PRIMARY CAMERA IS FRONT-FACING BY DEFAULT: preserve the approved first-frame camera unless the user explicitly asks for a side or rear turn.",
    "When motion reveals or hides surfaces, maintain view-correct placement. Hidden details remain hidden, not relocated.",
    "SHAPE AND VOLUME ENVELOPE LOCK:",
    "Maintain the same human-body envelope and low-to-medium inflated four-view silhouette through every frame. No swelling, shrinking, melting, stretching, smoothing, or mascot-shell enlargement across frames.",
  ];
}

function buildFourViewFirstFramePrompt(payload) {
  const scenePrompt = typeof payload.scene_prompt === "string" ? payload.scene_prompt.trim() : "";
  const productType = typeof payload.product_type === "string" ? payload.product_type.trim() : "wearable inflatable product";
  const lockedNodes = Array.isArray(payload.locked_nodes) ? payload.locked_nodes : [];
  const supportImageCount = Number.isFinite(Number(payload.support_image_count)) ? Number(payload.support_image_count) : 0;
  const previousFirstFrameCount = Number.isFinite(Number(payload.previous_first_frame_count)) ? Number(payload.previous_first_frame_count) : 0;
  const reviewFeedback = payload.review_feedback && typeof payload.review_feedback === "object" && !Array.isArray(payload.review_feedback)
    ? payload.review_feedback
    : null;
  const failedChecks = Array.isArray(reviewFeedback?.failed_checks) ? reviewFeedback.failed_checks : [];
  const passedChecks = Array.isArray(reviewFeedback?.passed_checks) ? reviewFeedback.passed_checks : [];
  const nodeLines = lockedNodes
    .filter((node) => node && typeof node === "object")
    .map((node) => {
      const code = typeof node.code === "string" ? node.code : "Locked_Detail";
      const label = typeof node.label === "string" ? node.label : "";
      const detail = typeof node.detail === "string" ? node.detail : "";
      return `- ${code}${label ? ` (${label})` : ""}: ${detail}`;
    })
    .join("\n");
  const failedFeedbackLines = failedChecks
    .filter((check) => check && typeof check === "object")
    .map((check) => {
      const id = typeof check.id === "string" ? check.id : "failed-check";
      const label = typeof check.label === "string" ? check.label : "";
      const detail = typeof check.detail === "string" ? check.detail : "";
      return `- ${id}${label ? ` (${label})` : ""}: ${detail}`;
    })
    .join("\n");
  const passedFeedbackLines = passedChecks
    .filter((check) => check && typeof check === "object")
    .map((check) => {
      const id = typeof check.id === "string" ? check.id : "passed-check";
      const label = typeof check.label === "string" ? check.label : "";
      const detail = typeof check.detail === "string" ? check.detail : "";
      return `- ${id}${label ? ` (${label})` : ""}: ${detail}`;
    })
    .join("\n");

  return [
    "HIGHEST PRIORITY FOUR-VIEW PRODUCT FIRST-FRAME CONTRACT.",
    "Use the four required core product views as topology maps for the same physical product: front view, left-side view, right-side view, and back view. These four core views define the product shape, proportions, surface ownership, and view-correct placement.",
    `CORE_VIEW_INPUT_ORDER:\n${CORE_VIEW_INPUT_ORDER}`,
    supportImageCount > 0
      ? `Preset auxiliary support views are also provided (${supportImageCount}). Use them only to refine same-product side/rear/local evidence such as valve position, zipper teeth, seams, wrinkles, stitching, material, and component placement. They are auxiliary evidence, not extra user-uploaded detail images and not a fifth topology surface.`
      : "No preset auxiliary support view is provided. Infer fragile local details only from the four required core views and locked-node contract.",
    "Do not average the core views into a new product, do not blend them into an impossible collage, and do not redesign the product to satisfy the scene.",
    "Generate a single coherent first frame with one physically valid camera angle. The chosen camera may be front, left side, right side, or rear, but it must obey the corresponding topology instead of mixing all visible details.",
    "The scene, background, lighting, floor contact, and shadows are lower priority than product identity. If the scene conflicts with product fidelity, simplify the scene and preserve the product.",
    `Product type: ${productType}. It must remain a wearable inflatable costume/product, not a real animal, cartoon mascot, plush toy, redesigned character, or generic prop.`,
    ...buildFirstFrameProductVisualLocks(productType),
    ...buildInflatableHardwareMaterialLocks(productType),
    "If the scene request conflicts with product fidelity, ignore the conflicting scene detail and keep product fidelity.",
    nodeLines ? `Confirmed locked details:\n${nodeLines}` : "Confirmed locked details: preserve every visible product structure from the uploaded references.",
    previousFirstFrameCount > 0
      ? "Previous first-frame reference is supplied as the final extra image after the four core views and any preset support views. It is only for preserving the old scene, camera, passed checklist items, and unmentioned areas during targeted regeneration; it is not a new product view or new topology source."
      : "",
    failedFeedbackLines
      ? [
          "TARGETED REGENERATION FEEDBACK FROM USER REVIEW.",
          "The original first-frame prompt and scene are unchanged. Correct only the failed checklist items below. Preserve the previous first frame, passed checklist items, scene composition, camera family, lighting, props, and all unmentioned product details as much as possible.",
          `Failed checklist items to fix:\n${failedFeedbackLines}`,
          passedFeedbackLines ? `Passed checklist items to keep stable:\n${passedFeedbackLines}` : "No passed checklist items were provided.",
        ].join("\n")
      : "",
    "Backend extraction priority: front view locks front proportions and front-owned components; left and right side views lock side thickness, asymmetry, side-visible components, seams and valve direction; back view locks rear silhouette, back seam/zipper, rear-owned tail/valve/components, and rear color/pattern field; preset auxiliary support views only strengthen same-product fragile local evidence.",
    `SCENE CONTINUITY CONTEXT:\n${scenePrompt || "Keep a realistic ecommerce product-video setting."}`,
    "Composition rule: full product body visible for the chosen camera, no crop of physically visible feet, face/head details, zipper, valve, appendages, udder, fins, tail, horns, ears, or other identity-critical components. Realistic ecommerce short-video still frame.",
  ].join("\n\n");
}

function buildFirstFramePayload(payload) {
  const {
    scene_prompt,
    product_type,
    locked_nodes,
    image_urls,
    support_image_urls,
    detail_image_urls,
    previous_first_frame_url,
    review_feedback,
    prompt,
    ...upstreamPayload
  } = payload;
  const readableImages = Array.isArray(image_urls)
    ? image_urls.filter((item) => typeof item === "string" && item.trim())
    : [];
  const supportSource = Array.isArray(support_image_urls) ? support_image_urls : detail_image_urls;
  const readableSupportImages = Array.isArray(supportSource)
    ? supportSource.filter((item) => typeof item === "string" && item.trim())
    : [];
  const previousFirstFrameUrl = typeof previous_first_frame_url === "string" && isReadableVideoFirstFrameUrl(previous_first_frame_url)
    ? previous_first_frame_url.trim()
    : "";
  return {
    ...upstreamPayload,
    image_urls: [...readableImages, ...readableSupportImages, ...(previousFirstFrameUrl ? [previousFirstFrameUrl] : [])],
    previous_first_frame_count: previousFirstFrameUrl ? 1 : 0,
    prompt: buildFourViewFirstFramePrompt({
      scene_prompt,
      product_type,
      locked_nodes,
      support_image_count: readableSupportImages.length,
      previous_first_frame_count: previousFirstFrameUrl ? 1 : 0,
      review_feedback,
    }),
  };
}

function buildVideoFirstFramePixelAnchorLocks(productType) {
  const family = getProductFamily(productType);
  const familyLocks = (() => {
    if (family === "mouse") {
      return [
        "GRAY MOUSE VIDEO ANCHOR: keep the exact approved first-frame mouse costume identity and pose family. Do not upgrade it into a cleaner cartoon mouse mascot: no darker round nose redesign, no new cheeks, no new tooth/mouth shape, no bigger ears, no smoother plush-like head, no replacing visible human hands/shoes with inflated mitts/feet, no changing one-hand-reaching/one-hand-holding evidence into both hands hugging the bag unless that exact pose is already in frame 1.",
        "GRAY MOUSE HARD FAIL DETAILS: preserve the protruding snout, cream face/belly fields, brown eye style, black open mouth shape, rounded ears, rear/side tail evidence, green rear blower valve ownership, visible real hands, visible real shoes, and any existing hand-to-bag or hand-to-shelf relationship. No new nose color, no added tooth, no new cheek circles, no plush fur, no hidden shoes, and no both-hands-hugging pose unless frame 1 already shows both hands hugging.",
      ];
    }
    if (family === "shark") {
      return [
        "SHARK VIDEO ANCHOR: do not use video quality enhancement to make the shark cleaner, rounder, brighter, more saturated, more symmetrical, more inflated, more capsule-like, or more mascot-like than the approved first frame.",
        "SHARK HARD FAIL DETAILS: preserve the small shallow horizontal trapezoid/crescent face window, muted cyan-blue nylon, white belly panel, front zipper, valve-side orange blower port, rear tail, compact side fins, visible black shoes, and lightly underinflated flatter body. No giant capsule body, no horizontal airplane-wing fins, no bright electric blue, no huge visor, no teeth mouth, no torpedo tube, and no taut display-balloon volume.",
      ];
    }
    if (family === "cow") {
      return [
        "COW VIDEO ANCHOR: do not use video quality enhancement to enlarge the cow head, smooth patch edges, redesign the snout/udder/hooves, hide real shoes or hands, or convert the approved first frame into a cleaner mascot suit.",
        "COW HARD FAIL DETAILS: preserve horns, ears, black patch layout, pink snout, pink udder, hoof gloves/feet, rear zipper, orange rear-side blower valve, centered tail, visible human-scale stance, and nylon wrinkles. No new cartoon face, no patch repaint, no udder relocation, no hoof enlargement, no tail/valve on the front, and no giant round cow mascot shell.",
      ];
    }
    if (family === "frog") {
      return [
        "FROG VIDEO ANCHOR: do not use video quality enhancement to enlarge the eyes, redesign the face window/mouth band/scarf/spots, smooth fabric, or convert the approved first frame into a cleaner frog mascot.",
        "FROG HARD FAIL DETAILS: preserve the large black curved mouth band, the small round/compact face window, the blue scarf and knot, the cream belly/face region, the black spot layout, webbed hands, webbed feet, visible real shoes, rear black spine pattern, rear zipper, orange rear blower valve, and wrinkled nylon surface. Handheld props are allowed as scene/action props, but they must not replace the face window, black mouth band, webbed hands, feet, shoes, scarf, valve, zipper, or body silhouette. No huge cartoon eyes, no missing face window, no thin smile replacing the black mouth band, no redesigned toes/nails, and no hiding the real shoes.",
      ];
    }
    if (family === "sumo") {
      return [
        "SUMO VIDEO ANCHOR: do not use video quality enhancement to redesign the mawashi, belly dot, head cap, arms, rear valve, body width, or convert the approved first frame into a cleaner character suit.",
        "SUMO HARD FAIL DETAILS: preserve the black mawashi belt, front loincloth panel, belly-button dot, simple chest lines, black topknot/cap, wide side T silhouette, rear zipper, rear orange blower valve, rear belt structure, separated legs, and nylon wrinkles. No real wrestler body, no kimono, no baby-doll redesign, no new face/hair/accessories, no rear hardware on the front belly, and no giant round display balloon.",
      ];
    }
    return [
      "PRODUCT VIDEO ANCHOR: do not use video quality enhancement to redesign, beautify, upscale, or normalize the approved first-frame product.",
    ];
  })();

  return [
    "APPROVED FIRST-FRAME PIXEL ANCHOR LOCK:",
    "The approved first frame is the immutable identity anchor, not a loose style reference. Frame 1 of the video must match the supplied first-frame image in product silhouette, head/face geometry, ears/horns/fins/arms/feet, visible human hands/shoes, object positions, pose, colors, seams, wrinkles, valve/port placement, and background-product contact. Do not redraw a cleaner or higher-quality replacement product before animating.",
    "FRAME 1 EXACT START RULE: the video must start from the supplied first-frame pixels without re-rendering the product, without changing the background contact points, without replacing the hands/shoes/props, and without product beautification before motion begins.",
    "HANDHELD PROP SAFETY RULE: handheld props are allowed when they support the action, humor, or ecommerce story. They must be treated as external scene/action props, not product components: props may not cover or replace identity-critical product parts, may not force a new costume design, may not hide visible hands/shoes, and may not become a new logo/accessory attached to the product shell.",
    "POSE AND CONTACT LOCK: keep the same arm layout, foot contact, body lean, tail/fin/ear/scarf/belt contact, and product-to-floor/product-to-shelf contact as frame 1 unless the action explicitly asks for a small physically plausible adjustment. If a prop is introduced or moved, only the prop and the nearest visible hand may change; the costume geometry, component positions, visible real hands/shoes, face/window/mouth details, valve/zipper, and body silhouette must remain locked.",
    "Quality rule: higher resolution, sharper lighting, denoising, cinematic polish, or video enhancement may improve only compression/background clarity. It must not improve the product by changing shape, proportions, texture, facial graphics, hands, feet, bag/object labels, material wrinkles, seams, zipper teeth, valve rings, or pose.",
    "Comedy story is required, not optional: the clip must show a visible three-beat gag, a misunderstanding or prop reaction, a pause, and a small twist. Product fidelity and comedy must coexist; do not remove the gag just to make the product stand still.",
    "Motion must be visible but controlled: allow a clear arm gesture, elastic side-to-side wobble, small recoil, half-step slide, prop interaction, and a freeze-frame style pause. Keep any existing hand-to-object contact, reaching hand, held bag, visible shoes, tail, valve, and body outline physically plausible while still performing the gag.",
    "MOTION AMPLITUDE CEILING: keep the face window and zipper mostly vertical throughout the clip. Feet may stay planted or slide a short half-step; do not jump, run, fall, fully bow, spin, reveal a new side, or turn the gag into a dance routine. The action should be easy to see at ecommerce-video scale.",
    "Hard fail: if frame 1 or any later frame looks like a newly generated cleaner product rather than the approved first frame gently moving, the video is wrong. Reject mascot beautification, pose reblocking, product redraw, product repaint, background resynthesis that changes shelf/object contact, and object replacement.",
    ...familyLocks,
  ];
}

function sanitizeVideoPromptText(text) {
  return String(text || "")
    .replace(/偷吃/g, "试吃")
    .replace(/偷拿/g, "拿起")
    .replace(/偷/g, "悄悄")
    .replace(/被发现/g, "被注意到")
    .replace(/吓一跳/g, "愣了一下")
    .replace(/吓/g, "愣")
    .replace(/推了一下/g, "轻轻碰到")
    .replace(/推/g, "轻移")
    .replace(/撞上/g, "差点贴到")
    .replace(/撞/g, "轻碰")
    .replace(/砰的一声/g, "突然轻响")
    .replace(/攻击|打斗|暴力|危险|受伤|摔倒|逃跑|追赶|抢夺|砸|爆炸/g, "安全的小插曲")
    .replace(/鬼脸/g, "无辜表情")
    .replace(/求助/g, "示意")
    .replace(/steal|stolen|attack|violence|danger|injury|fight|chase|escape|explode/gi, "safe playful beat")
    .replace(/慌/g, "忙")
    .trim();
}

function sanitizeUpstreamVideoPromptText(text) {
  return String(text || "")
    .replace(/locked dead across all frames/gi, "strictly consistent across all frames")
    .replace(/\bHARD FAIL DETAILS\b/g, "STRICT PRESERVATION DETAILS")
    .replace(/\bHard fail\b/g, "Strict preservation rule")
    .replace(/\bNegative material rule\b/g, "Material fidelity boundary")
    .replace(/\bNegative:\s*/g, "Boundary: ")
    .replace(/baby[- ]doll/gi, "toy-like")
    .replace(/baby doll/gi, "toy-like")
    .replace(/realistic animal skin/gi, "realistic animal-surface texture")
    .replace(/realistic shark skin/gi, "realistic shark-surface texture")
    .replace(/human skin replacement/gi, "human-surface texture replacement")
    .replace(/\bdead\b/gi, "strict")
    .replace(/\battack\b/gi, "action beat")
    .replace(/\bviolence\b/gi, "conflict")
    .replace(/\bdanger\b/gi, "risk")
    .replace(/\binjury\b/gi, "mismatch")
    .replace(/\bfight\b/gi, "busy movement")
    .replace(/\bchase\b/gi, "follow")
    .replace(/\bescape\b/gi, "leave")
    .replace(/\bexplode\b/gi, "pop")
    .trim();
}

function isSensitiveTextError(data, status) {
  const text = JSON.stringify(data || {});
  return status === 400 && /InputTextSensitiveContentDetected|sensitive information|sensitive content|敏感/i.test(text);
}

function buildSensitiveSafeVideoActionPrompt(payload) {
  const productType = typeof payload.product_type === "string" && payload.product_type.trim()
    ? payload.product_type.trim()
    : "当前充气产品";
  const source = sanitizeVideoPromptText(typeof payload.action_prompt === "string" ? payload.action_prompt : "");
  const scene = sanitizeVideoPromptText(typeof payload.scene_prompt === "string" ? payload.scene_prompt : "");
  return [
    `${productType}在已确认首帧的同一场景中做一个安全、轻松、无冲突的短视频动作。`,
    source ? `保留用户想要的轻微动作方向：${source}` : "动作只包含小幅摆动、慢半拍抬手、停顿、轻微回弹和一个无害反转。",
    scene ? `沿用场景元素：${scene}` : "沿用首帧原地点、原道具和原镜头。",
    "只写生活化、幽默、产品安全的小动作；需要有一个小包袱或反转。BGM 和背景对话可有可无，可以作为气氛提示，但不要强制。所有动作都保持轻松、无冲突、可拍摄、低风险。",
  ].join("");
}

function createSensitiveSafeVideoPayload(payload) {
  return {
    ...payload,
    action_prompt: buildSensitiveSafeVideoActionPrompt(payload),
    scene_prompt: sanitizeVideoPromptText(payload.scene_prompt),
  };
}

function buildProductVideoPrompt(payload) {
  const actionPrompt = sanitizeVideoPromptText(typeof payload.action_prompt === "string" ? payload.action_prompt.trim() : "");
  const scenePrompt = typeof payload.scene_prompt === "string" ? payload.scene_prompt.trim() : "";
  const productType = typeof payload.product_type === "string" ? payload.product_type.trim() : "wearable inflatable product";
  const motionRule = typeof payload.motion_rule === "string" ? payload.motion_rule.trim() : "Keep motion small and product-safe.";
  const lockedNodes = Array.isArray(payload.locked_nodes) ? payload.locked_nodes : [];
  const readableImages = Array.isArray(payload.image_urls)
    ? payload.image_urls.filter((item) => typeof item === "string" && item.trim())
    : [];
  const supportSource = Array.isArray(payload.support_image_urls) ? payload.support_image_urls : payload.detail_image_urls;
  const readableSupportImages = Array.isArray(supportSource)
    ? supportSource.filter((item) => typeof item === "string" && item.trim())
    : [];
  const nodeLines = lockedNodes
    .filter((node) => node && typeof node === "object")
    .map((node) => {
      const code = typeof node.code === "string" ? node.code : "Locked_Detail";
      const label = typeof node.label === "string" ? node.label : "";
      const detail = typeof node.detail === "string" ? node.detail : "";
      return `- ${code}${label ? ` (${label})` : ""}: ${detail}`;
    })
    .join("\n");

  return [
    "HIGHEST PRIORITY PRODUCT CONSISTENCY VIDEO CONTRACT.",
    "FOUR-VIEW PRODUCT HARD LOCK. Approved first frame is the direct video media input. FOUR-VIEW TEXT CONTRACT: use the uploaded core reference order as product metadata, not as extra visible surfaces. If the video API cannot accept extra visual references, keep motion inside the approved first-frame evidence instead of inventing or revealing unverified sides.",
    readableImages.length === 4
      ? `Four-view metadata supplied:\n${CORE_VIEW_INPUT_ORDER}\nPreset auxiliary support views supplied: ${readableSupportImages.length}.`
      : "Four-view metadata is incomplete in the video request, so preserve the approved first frame and do not introduce any new product angle.",
    "Animate the exact same product only. The video may change pose and scene motion, but the product itself must be locked dead across all frames: no silhouette drift, no proportion drift, no missing detail, no invented detail, no material change, and no style reinterpretation.",
    `Product type: ${productType}. It must remain the same wearable inflatable product throughout the video.`,
    "Preserve all identity-critical product details from frame 1 to the final frame. Do not redesign, simplify, restyle, recolor, or reinterpret the product.",
    ...buildVideoFirstFramePixelAnchorLocks(productType),
    ...buildVideoProductVisualLocks(productType),
    ...buildInflatableHardwareMaterialLocks(productType),
    nodeLines ? `Confirmed locked details:\n${nodeLines}` : "Confirmed locked details: preserve every visible product structure from the references.",
    "ACTION OBJECT GUARDRAIL: the lower-priority action prompt may introduce or animate handheld props, but the prop is always lower priority than product fidelity. If the action asks for holding, drinking, carrying, grabbing, showing, or hugging an object, allow the object only when it stays visually separate from the costume shell and does not obscure or rewrite hands, shoes, face/window/mouth details, valves, zipper, tail/fins/ears/scarf/belt, seams, wrinkles, colors, or body silhouette.",
    "VIDEO QUALITY GUARDRAIL: model, resolution, HD, high quality, cinematic, clearer, sharper, pro, or quality settings must never change product identity. Quality is allowed only after the exact first-frame product geometry, colors, components, material wrinkles, ports, zipper, hands, shoes, and pose remain unchanged.",
    `COMEDY ACTION BRIEF, SAME PRIORITY AS SCENE CONTINUITY:\n${actionPrompt || "Use a clear three-beat ecommerce comedy motion: notice a small prop, react half a beat too seriously, freeze for a tiny twist, then recover with a soft inflatable wobble."}`,
    "COMEDY PACING REQUIREMENT: show the gag visually in 2-3 readable beats. At least one beat must be a visible reaction or prop interaction, not just breathing, idle swaying, or a static product display.",
    `Scene continuity:\n${scenePrompt || "Keep the approved first-frame scene."}`,
    `Motion rule:\n${motionRule}`,
    "Camera rule: stable vertical ecommerce shot, full body visible, no cuts, no fast zoom, no crop of face/head details, zipper, side valve, feet, fins, horns, ears, udder, hooves, tail, or other identity-critical components.",
    "Negative: no quality-upscale redraw, no beautified mascot replacement, no cleaner cartoon head, no pose reblocking that changes the costume, no handheld prop motion that rewrites product hands or body geometry, no moved fan valve, no missing face/head detail, no broken tail, no duplicated appendages, no body deformation, no skinny body, no overinflated balloon body, no smooth plastic surface, no realistic animal skin, no plush toy, no new logo attached to the product, no new accessory attached to the product shell.",
    "If the user action conflicts with product fidelity, ignore the conflicting action and preserve product fidelity.",
  ].join("\n\n");
}

function buildVideoPayload(payload) {
  const {
    action_prompt,
    scene_prompt,
    product_type,
    locked_nodes,
    motion_rule,
    image_urls,
    support_image_urls,
    detail_image_urls,
    prompt,
    ...upstreamPayload
  } = payload;
  const model = typeof upstreamPayload.model === "string" && upstreamPayload.model.trim() ? upstreamPayload.model.trim() : VIDEO_MODEL;
  return {
    ...upstreamPayload,
    ...(model ? { model } : {}),
    prompt: sanitizeUpstreamVideoPromptText(
      buildProductVideoPrompt({ action_prompt, scene_prompt, product_type, locked_nodes, motion_rule, image_urls, support_image_urls, detail_image_urls }),
    ),
  };
}

function pickReadableImages(value) {
  const images = Array.isArray(value)
    ? value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean)
    : [];
  const hasBlob = images.some((image) => image.startsWith("blob:"));
  const hasUnreadable = images.some((image) => !(/^https?:\/\//i.test(image) || image.startsWith("data:image/")));
  const readableImages = images.filter((image) => /^https?:\/\//i.test(image) || image.startsWith("data:image/"));
  return { images, readableImages, hasBlob, hasUnreadable };
}

function validateFourViewImages(payload) {
  const body = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  if ("foreground_source_url" in body) {
    return {
      ok: false,
      error: "请上传正面、左侧、右侧、背面四张核心产品图，再生成首帧。",
    };
  }
  const core = pickReadableImages(body.image_urls);
  const support = pickReadableImages(Array.isArray(body.support_image_urls) ? body.support_image_urls : body.detail_image_urls);

  if (core.hasBlob || core.hasUnreadable || core.readableImages.length !== 4) {
    return {
      ok: false,
      error: "请上传正面、左侧、右侧、背面四张可用的核心产品图，再生成首帧。",
    };
  }

  if (support.hasBlob || support.hasUnreadable) {
    return {
      ok: false,
      error: "有一张辅助角度图片还没有准备好，请刷新页面或重新选择产品后再试。",
    };
  }

  return { ok: true };
}

function isDashScopeUrl(url) {
  try {
    return new URL(url).hostname.includes("dashscope.aliyuncs.com");
  } catch {
    return false;
  }
}

function isVolcengineUrl(url) {
  try {
    const hostname = new URL(url).hostname;
    return hostname.includes("volces.com") || hostname.includes("bytepluses.com");
  } catch {
    return false;
  }
}

function buildLabeledImageContent(imageUrls, previousFirstFrameCount = 0) {
  return imageUrls.flatMap((image, index) => {
    const coreView = CORE_VIEW_LABELS[index];
    if (coreView) {
      return [
        { text: `${coreView.contentLabel}: ${coreView.label}.` },
        { image },
      ];
    }
    const previousFirstFrameStart = imageUrls.length - previousFirstFrameCount;
    if (previousFirstFrameCount > 0 && index >= previousFirstFrameStart) {
      return [
        {
          text:
            "Previous generated first frame for targeted regeneration. Use it only to preserve the scene, camera, passed checklist items, and unmentioned details while correcting the user's failed checklist items. It is not a new topology view.",
        },
        { image },
      ];
    }
    return [
      { text: `Preset auxiliary support view ${index - CORE_VIEW_LABELS.length + 1}: same-product support evidence only; not a user detail upload, not a new topology view, and not a new product surface.` },
      { image },
    ];
  });
}

function buildDashScopeImagePayload(payload) {
  const prompt = typeof payload.prompt === "string" ? payload.prompt : "";
  const imageUrls = Array.isArray(payload.image_urls) ? payload.image_urls.filter((item) => typeof item === "string" && item.trim()) : [];
  const previousFirstFrameCount = Number.isFinite(Number(payload.previous_first_frame_count)) ? Number(payload.previous_first_frame_count) : 0;
  const content = [
    ...buildLabeledImageContent(imageUrls, previousFirstFrameCount),
    { text: prompt },
  ];

  return {
    model: payload.model,
    input: {
      messages: [
        {
          role: "user",
          content,
        },
      ],
    },
    parameters: {
      size: "2K",
      n: 1,
      watermark: false,
      thinking_mode: true,
    },
  };
}

function imageEditSizeFromAspectRatio(value) {
  if (value === "16:9") return "1536x1024";
  if (value === "1:1") return "1024x1024";
  return "1024x1536";
}

function buildOpenAIImageEditPayload(payload) {
  const prompt = typeof payload.prompt === "string" ? payload.prompt : "";
  const imageUrls = Array.isArray(payload.image_urls) ? payload.image_urls.filter((item) => typeof item === "string" && item.trim()) : [];
  return {
    model: payload.model,
    prompt,
    images: imageUrls.map((image_url) => ({ image_url })),
    n: 1,
    size: imageEditSizeFromAspectRatio(payload.aspect_ratio),
    input_fidelity: "high",
  };
}

async function imageUrlToBlob(imageUrl, index) {
  if (typeof imageUrl !== "string" || !imageUrl.trim()) {
    throw new Error("Invalid image input.");
  }
  if (imageUrl.startsWith("data:image/")) {
    const match = imageUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) throw new Error("Invalid data:image input.");
    const [, mimeType, base64] = match;
    const extension = mimeType.includes("jpeg") ? "jpg" : mimeType.split("/")[1] || "png";
    return {
      blob: new Blob([Buffer.from(base64, "base64")], { type: mimeType }),
      fileName: `reference-${index + 1}.${extension}`,
    };
  }
  if (/^https?:\/\//i.test(imageUrl)) {
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error(`Failed to download reference image ${index + 1}.`);
    const contentType = response.headers.get("content-type") || "image/png";
    const extension = contentType.includes("jpeg") ? "jpg" : contentType.split("/")[1]?.split(";")[0] || "png";
    return {
      blob: new Blob([Buffer.from(await response.arrayBuffer())], { type: contentType }),
      fileName: `reference-${index + 1}.${extension}`,
    };
  }
  throw new Error("Only data:image/ or http(s) image inputs are supported.");
}

async function buildOpenAIImageEditFormData(payload) {
  const form = new FormData();
  if (payload.model) form.append("model", payload.model);
  form.append("prompt", typeof payload.prompt === "string" ? payload.prompt : "");
  form.append("n", String(payload.n || 1));
  if (payload.size) form.append("size", payload.size);
  if (payload.input_fidelity) form.append("input_fidelity", payload.input_fidelity);
  const images = Array.isArray(payload.images) ? payload.images : [];
  for (let index = 0; index < images.length; index += 1) {
    const imageUrl = images[index]?.image_url;
    const { blob, fileName } = await imageUrlToBlob(imageUrl, index);
    form.append("image[]", blob, fileName);
  }
  return form;
}

function normalizeVideoResolution(value) {
  return typeof value === "string" ? value.toLowerCase().replace("1080p", "1080p").replace("720p", "720p") : "1080p";
}

function buildVolcengineVideoPayload(payload) {
  const prompt = typeof payload.prompt === "string" ? payload.prompt : "";
  const imageUrl = typeof payload.image_url === "string" ? payload.image_url : "";
  const duration = Number.isFinite(Number(payload.duration)) ? Number(payload.duration) : 8;
  const ratio = typeof payload.aspect_ratio === "string" ? payload.aspect_ratio : "9:16";
  const content = [
    {
      type: "text",
      text: prompt,
    },
  ];

  if (imageUrl && imageUrl !== "PASTE_APPROVED_FIRST_FRAME_URL") {
    content.push({
      type: "image_url",
      image_url: {
        url: imageUrl,
      },
    });
  }

  return {
    model: payload.model,
    content,
    generate_audio: Boolean(payload.audio),
    resolution: normalizeVideoResolution(payload.resolution),
    ratio,
    duration,
    seed: -1,
    watermark: false,
  };
}

function buildDashScopeVideoPayload(payload) {
  const prompt = typeof payload.prompt === "string" ? payload.prompt : "";
  const imageUrl = typeof payload.image_url === "string" ? payload.image_url : "";
  const duration = Number.isFinite(Number(payload.duration)) ? Number(payload.duration) : 8;
  const rawResolution = typeof payload.resolution === "string" ? payload.resolution : "1080P";
  const resolution = rawResolution.toUpperCase().replace("1080P", "1080P").replace("720P", "720P");
  const media =
    imageUrl && imageUrl !== "PASTE_APPROVED_FIRST_FRAME_URL"
      ? [
          {
            type: "first_frame",
            url: imageUrl,
          },
        ]
      : [];

  return {
    model: payload.model,
    input: {
      prompt,
      ...(media.length ? { media } : {}),
    },
    parameters: {
      duration,
      resolution,
      watermark: false,
    },
  };
}

function getVideoFirstFrameUrl(payload) {
  const imageUrl = typeof payload?.image_url === "string" ? payload.image_url.trim() : "";
  if (!imageUrl || imageUrl === "PASTE_APPROVED_FIRST_FRAME_URL") return "";
  return imageUrl;
}

function isReadableVideoFirstFrameUrl(value) {
  return /^https?:\/\//i.test(value) || value.startsWith("data:image/");
}

function buildVideoDimensions(aspectRatio) {
  if (aspectRatio === "16:9") return { width: 1920, height: 1080, size: "1920x1080" };
  if (aspectRatio === "1:1") return { width: 1080, height: 1080, size: "1080x1080" };
  return { width: 1080, height: 1920, size: "1080x1920" };
}

function buildOpenAICompatibleVideoPayload(payload, upstreamUrl) {
  const {
    image_url,
    aspect_ratio,
    resolution,
    audio,
    prompt_extend,
    metadata,
    ...rest
  } = payload;
  const prompt = typeof payload.prompt === "string" ? payload.prompt : "";
  const firstFrameUrl = getVideoFirstFrameUrl(payload);
  const duration = Number.isFinite(Number(payload.duration)) ? Number(payload.duration) : 5;
  const ratio = typeof aspect_ratio === "string" && aspect_ratio.trim() ? aspect_ratio.trim() : "9:16";
  const dimensions = buildVideoDimensions(ratio);
  const baseMetadata = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
  const isPluralVideosEndpoint = (() => {
    try {
      return /\/videos\/generations\/?$/i.test(new URL(upstreamUrl).pathname);
    } catch {
      return false;
    }
  })();

  if (isPluralVideosEndpoint) {
    return {
      ...rest,
      prompt,
      duration,
      resolution: typeof resolution === "string" && resolution.trim() ? resolution.toLowerCase() : "1080p",
      size: ratio,
      generate_audio: Boolean(audio),
      prompt_extend: Boolean(prompt_extend),
      ...(firstFrameUrl
        ? {
            image_with_roles: [
              {
                url: firstFrameUrl,
                role: "first_frame",
              },
            ],
          }
        : {}),
    };
  }

  return {
    ...rest,
    prompt,
    duration,
    ...dimensions,
    ...(firstFrameUrl ? { image: firstFrameUrl } : {}),
    metadata: {
      ...baseMetadata,
      aspect_ratio: ratio,
      resolution: typeof resolution === "string" && resolution.trim() ? resolution.toLowerCase() : "1080p",
      generate_audio: Boolean(audio),
      prompt_extend: Boolean(prompt_extend),
      ...(firstFrameUrl
        ? {
            image_urls: [firstFrameUrl],
            image_with_roles: [
              {
                url: firstFrameUrl,
                role: "first_frame",
              },
            ],
          }
        : {}),
    },
  };
}

function resolveImageEditUrl(upstreamUrl) {
  try {
    const parsed = new URL(upstreamUrl);
    parsed.pathname = parsed.pathname.replace(/\/images\/generations\/?$/i, "/images/edits");
    return parsed.toString();
  } catch {
    return upstreamUrl;
  }
}

function buildProxyPayload(kind, upstreamUrl, upstreamPayload) {
  if (isVolcengineUrl(upstreamUrl) && kind === "video") return buildVolcengineVideoPayload(upstreamPayload);
  if (isDashScopeUrl(upstreamUrl)) {
    return kind === "video" ? buildDashScopeVideoPayload(upstreamPayload) : buildDashScopeImagePayload(upstreamPayload);
  }
  if (kind === "video") return buildOpenAICompatibleVideoPayload(upstreamPayload, upstreamUrl);
  if (kind === "image") return buildOpenAIImageEditPayload(upstreamPayload);
  return upstreamPayload;
}

async function proxyJson(fallbackPath, payload, kind = "generic") {
  const { apiKey, upstreamUrl, upstreamPayload } = pickProxyConfig(payload, fallbackPath, kind);
  const resolvedUpstreamUrl = kind === "image" && !isDashScopeUrl(upstreamUrl) ? resolveImageEditUrl(upstreamUrl) : upstreamUrl;

  if (!apiKey) {
    return {
      status: 400,
      payload: {
        error: "服务密钥还没有配置好，请先让管理员确认后台配置。",
        upstreamUrl: resolvedUpstreamUrl,
      },
    };
  }

  const sendMultipartImageEdit = kind === "image" && !isDashScopeUrl(resolvedUpstreamUrl);
  const retryDelay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function sendProxyRequest(nextUpstreamPayload, retryReason = "") {
    const proxyPayload = buildProxyPayload(kind, resolvedUpstreamUrl, nextUpstreamPayload);
    const body = sendMultipartImageEdit
      ? await buildOpenAIImageEditFormData(proxyPayload)
      : JSON.stringify(proxyPayload);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), kind === "video" ? VIDEO_UPSTREAM_TIMEOUT_MS : UPSTREAM_TIMEOUT_MS);
    let response;
    try {
      response = await fetch(resolvedUpstreamUrl, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...(sendMultipartImageEdit ? {} : { "Content-Type": "application/json" }),
          ...(isDashScopeUrl(resolvedUpstreamUrl) && kind === "video" ? { "X-DashScope-Async": "enable" } : {}),
        },
        body,
      });
    } catch (error) {
      const isAbortError = error instanceof Error && error.name === "AbortError";
      console.error("[proxy] upstream connection failed", {
        kind,
        upstreamUrl: resolvedUpstreamUrl,
        message: error instanceof Error ? error.message : String(error),
      });
      return {
        status: 502,
        payload: {
          error:
            isAbortError && kind === "image"
              ? "首帧生成还在上游处理，但这次等待时间太久了，系统先停下来了。请再试一次，或稍后换个更短的提示词再生成。"
              : isAbortError && kind === "video"
                ? "视频生成服务这次等待时间太久了，系统先停下来了。请稍后再试，或把动作描述写得更短一点。"
            : kind === "image"
              ? "首帧生成服务暂时连不上。不是本地项目没启动，是上游图片服务连接失败，请稍后再试。"
              : "视频生成服务暂时连不上。不是本地项目没启动，是上游视频服务连接失败，请稍后再试。",
          code: isAbortError ? "UPSTREAM_REQUEST_TIMEOUT" : "UPSTREAM_CONNECTION_FAILED",
          upstreamUrl: resolvedUpstreamUrl,
          upstreamError: error instanceof Error ? error.message : String(error),
        },
      };
    } finally {
      clearTimeout(timeout);
    }
    const text = await response.text();
    const data = parseUpstreamBody(text, response.status);
    const requestId = extractUpstreamRequestId(text || getUpstreamErrorText(data));
    const imagePayloadError = kind === "image" && response.ok ? validateGeneratedImagePayload(data) : "";
    if (imagePayloadError) {
      return {
        status: 502,
        payload: {
          error: imagePayloadError,
          code: "UPSTREAM_NON_IMAGE_RESULT",
          upstreamUrl: resolvedUpstreamUrl,
        },
      };
    }
    if (isRetryableUpstreamServerError(data, response.status)) {
      return {
        status: response.status,
        retryableUpstreamServerError: true,
        payload: {
          error: toPublicErrorMessage(text || getUpstreamErrorText(data)),
          code: "UPSTREAM_SERVER_ERROR",
          upstreamUrl: resolvedUpstreamUrl,
          upstreamRequestId: requestId,
          retryReason,
        },
      };
    }
    return {
      status: response.status,
      payload: withUpstreamError(
        retryReason ? { ...data, retryReason, promptSanitizedRetry: true } : data,
        response.status,
        resolvedUpstreamUrl,
      ),
    };
  }

  const firstResult = await sendProxyRequest(upstreamPayload);
  if ((kind === "image" || kind === "video") && firstResult.retryableUpstreamServerError) {
    console.error("[proxy] retrying upstream server error", {
      kind,
      upstreamUrl: resolvedUpstreamUrl,
      upstreamRequestId: firstResult.payload?.upstreamRequestId || "",
    });
    await retryDelay(1000);
    const retryResult = await sendProxyRequest(upstreamPayload, "Upstream returned a retryable server error; request was retried once automatically.");
    if (retryResult.retryableUpstreamServerError) {
      return {
        status: 502,
        payload: {
          ...retryResult.payload,
          retryCount: 1,
          promptSanitizedRetry: false,
        },
      };
    }
    return retryResult;
  }
  if (kind === "video" && isSensitiveTextError(firstResult.payload, firstResult.status)) {
    const retryResult = await sendProxyRequest(
      createSensitiveSafeVideoPayload(upstreamPayload),
      "Video text was rewritten with positive, low-risk action wording after upstream text-safety rejection.",
    );
    if (isSensitiveTextError(retryResult.payload, retryResult.status)) {
      return {
        status: retryResult.status,
        payload: withUpstreamError(
          {
            error: "这次视频描述被平台安全规则拦下了。系统已经自动改写过一次，但平台仍然没有放行。可以把动作改得更日常一点，比如挥手、转身、停顿或轻轻晃动，再试一次。",
            promptSanitizedRetry: true,
          },
          retryResult.status,
          resolvedUpstreamUrl,
        ),
      };
    }
    return retryResult;
  }
  return firstResult;
}

async function testProxy(fallbackPath, payload, kind = "generic") {
  const { baseUrl, apiKey, upstreamUrl: configuredUrl, upstreamPayload } = pickProxyConfig(payload, fallbackPath, kind);
  const model = typeof upstreamPayload.model === "string" ? upstreamPayload.model.trim() : "";
  if (isDashScopeUrl(configuredUrl) || (kind === "video" && isVolcengineUrl(configuredUrl))) {
    return {
      status: apiKey ? 200 : 400,
      payload: apiKey
        ? { ok: true, model, modelFound: Boolean(model), upstreamUrl: configuredUrl }
        : { error: "服务密钥还没有配置好，请先让管理员确认后台配置。", upstreamUrl: configuredUrl },
    };
  }

  const upstreamUrl = `${baseUrl}/models`;

  if (!apiKey) {
    return {
      status: 400,
      payload: {
        error: "服务密钥还没有配置好，请先让管理员确认后台配置。",
        upstreamUrl,
      },
    };
  }

  const response = await fetch(upstreamUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
  const text = await response.text();
  const data = parseUpstreamBody(text, response.status);

  if (!response.ok) {
    return {
      status: response.status,
      payload: withUpstreamError({
        ...data,
        upstreamUrl,
        upstreamStatus: response.status,
      }, response.status, upstreamUrl),
    };
  }

  const models = Array.isArray(data.data) ? data.data : [];
  const found = !model || models.some((item) => item && typeof item === "object" && item.id === model);
  if (found) {
    return {
      status: 200,
      payload: {
        ok: true,
        model,
        modelFound: Boolean(model),
        upstreamStatus: response.status,
        upstreamUrl,
      },
    };
  }

  return {
    status: 400,
    payload: {
      error: `服务已连通，但当前模型 ${model} 暂时不可用。请换一个模型，或让管理员确认模型名称。`,
      model,
      modelFound: false,
      upstreamUrl,
      upstreamStatus: response.status,
    },
  };
}

function extractGeneratedText(value) {
  if (!value || typeof value !== "object") return "";
  const record = value;
  if (typeof record.output_text === "string") return record.output_text;
  if (Array.isArray(record.choices)) {
    for (const choice of record.choices) {
      const message = choice && typeof choice === "object" ? choice.message : null;
      if (message && typeof message === "object") {
        if (typeof message.content === "string") return message.content;
        if (Array.isArray(message.content)) {
          const text = message.content
            .map((item) => {
              if (!item || typeof item !== "object") return "";
              return typeof item.text === "string" ? item.text : "";
            })
            .filter(Boolean)
            .join("\n");
          if (text) return text;
        }
      }
    }
  }
  if (Array.isArray(record.output)) {
    const parts = [];
    for (const output of record.output) {
      if (!output || typeof output !== "object") continue;
      if (typeof output.text === "string") parts.push(output.text);
      if (Array.isArray(output.content)) {
        for (const content of output.content) {
          if (!content || typeof content !== "object") continue;
          if (typeof content.text === "string") parts.push(content.text);
          if (typeof content.output_text === "string") parts.push(content.output_text);
        }
      }
    }
    if (parts.length) return parts.join("\n");
  }
  return "";
}

function cleanGeneratedPrompt(text) {
  return String(text || "")
    .replace(/^```[a-z]*\s*/i, "")
    .replace(/```$/i, "")
    .replace(/^["“”']+|["“”']+$/g, "")
    .trim();
}

function parsePromptPairText(text) {
  const cleaned = cleanGeneratedPrompt(text);
  const candidates = [cleaned];
  const objectMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objectMatch) candidates.push(objectMatch[0]);
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const firstFramePrompt = typeof parsed.firstFramePrompt === "string"
        ? parsed.firstFramePrompt.trim()
        : typeof parsed.first_frame_prompt === "string"
          ? parsed.first_frame_prompt.trim()
          : "";
      const videoPrompt = typeof parsed.videoPrompt === "string"
        ? parsed.videoPrompt.trim()
        : typeof parsed.video_prompt === "string"
          ? parsed.video_prompt.trim()
          : "";
      if (firstFramePrompt && videoPrompt) {
        return {
          sceneTitle: typeof parsed.sceneTitle === "string" ? parsed.sceneTitle.trim() : "",
          sceneAnchor: typeof parsed.sceneAnchor === "string" ? parsed.sceneAnchor.trim() : "",
          firstFramePrompt,
          videoPrompt: sanitizeVideoPromptText(videoPrompt),
          continuityLocks: typeof parsed.continuityLocks === "string" ? parsed.continuityLocks.trim() : "",
        };
      }
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

function buildPromptSuggestionMustMention(productType) {
  const family = getProductFamily(productType);
  if (family === "shark") {
    return "Must naturally include these shark locks: small shallow curved horizontal trapezoid transparent face window, muted cyan-blue nylon, white belly panel, vertical zipper, side eye and exactly five gill stripes, orange side valve, rear tail fin, human-scale wearable volume, slightly underinflated flatter soft body, no huge vertical capsule body, no torpedo/cylinder balloon body, and no oversized horizontal wing-like arm fins.";
  }
  if (family === "cow") {
    return "必须自然写入这些奶牛锁：白色牛身、黑色不规则斑、双角、黑外粉内耳、蓝眼粉鼻粉腮、黑色蹄套、正面粉色乳房和四个奶头、背部拉链、橙色后侧阀门、白尾黑尖。";
  }
  if (family === "mouse") {
    return "必须自然写入这些灰鼠锁：浅灰鼠身、圆耳和米色耳内、米色脸鼻区、突出灰色鼻嘴、黑色张口、棕色卡通眼、米色椭圆腹部、米黄后尾、背部绿色阀门和拉链。";
  }
  if (family === "frog") {
    return "必须自然写入这些青蛙锁：绿色蛙身、顶部凸眼、小号脸窗、黑色横向嘴带、蓝色围巾、米色脸腹、黑色斑点、蹼手蹼脚、背部黑色脊线、橙色后阀。";
  }
  if (family === "sumo") {
    return "必须自然写入这些相扑锁：米肤色充气身体、黑色腰带、正面兜裆布、胸前简线、肚脐点、圆头黑色发髻帽、宽 T 形短臂、背部拉链、橙色后阀。";
  }
  return "必须自然写入当前四视图中的颜色、体积、脸部/装饰、阀门、拉链、尾部/附加结构、脚套和布料褶皱等产品锁。";
}

function buildPromptSuggestionHardwareMustMention(productType) {
  const family = getProductFamily(productType);
  if (family === "shark") {
    return "还必须自然写入鲨鱼硬件和材质锁：橙色鼓风阀/进气口/出气口/泵口只能位于阀门侧腰侧面，保留橙色环、圆形网格/盖帽、参考高度和方向；正面看不到时自然隐藏，不能挪到白肚、透明脸窗、正面拉链或尾鳍；保留薄尼龙/PVC 褶皱、缝线、拉链齿和偏软欠充气质感。";
  }
  if (family === "cow") {
    return "还必须自然写入奶牛硬件和材质锁：橙色鼓风阀/进出气口/泵口只能位于右后侧/背侧，背部中轴拉链和白尾黑尖按背视图归位；正面看不到时不强行展示，不能挪到粉色乳房、白肚或脸部；保留薄尼龙/PVC 褶皱、缝线、拉链齿和斑块边缘织物感。";
  }
  if (family === "mouse") {
    return "还必须自然写入灰鼠硬件和材质锁：绿色鼓风阀/进出气口/泵口只能位于后背/背侧，和背部中轴拉链、尾巴根部保持正确相对位置；不能挪到米色腹部、鼻嘴、耳朵或手臂；保留浅灰薄尼龙/PVC 褶皱、缝线、拉链齿和柔软充气布料感。";
  }
  if (family === "frog") {
    return "还必须自然写入青蛙硬件和材质锁：橙色鼓风阀/进出气口/泵口只能位于背部黑色脊线/拉链附近的后背面，不能挪到米色腹部、蓝围巾、脸窗、嘴带或斑点上；保留绿色薄尼龙/PVC 褶皱、缝线、拉链齿、围巾边缘和布料松弛。";
  }
  if (family === "sumo") {
    return "还必须自然写入相扑硬件和材质锁：橙色鼓风阀/进出气口/泵口只能位于背面/后侧，参考辅助阀门图保留橙色环、圆形网格/盖帽、参考高度和与后腰带/拉链的间距；不能挪到正面肚子、胸线、肚脐或兜裆布；保留米肉色薄尼龙/PVC 褶皱和软布折痕。";
  }
  return "还必须自然写入硬件和材质锁：阀门、鼓风阀、进气口、出气口、泵口、拉链、缝线和布料褶皱都只能按四视图位置归位；看不见时隐藏，不允许挪位、复制、换色、简化或改成装饰。";
}

function buildPromptPairSuggestionPayload(payload) {
  const productType = typeof payload.product_type === "string" && payload.product_type.trim() ? payload.product_type.trim() : "当前充气产品";
  const stableProductName = getProductStableName(productType);
  const currentFirstFramePrompt = typeof payload.current_first_frame_prompt === "string" ? payload.current_first_frame_prompt.trim() : "";
  const currentVideoPrompt = typeof payload.current_video_prompt === "string" ? payload.current_video_prompt.trim() : "";
  const referenceVideoCount = Number.isFinite(Number(payload.reference_video_count)) ? Number(payload.reference_video_count) : 0;
  const supportImageCount = Number.isFinite(Number(payload.support_image_count)) ? Number(payload.support_image_count) : 0;
  const lockedNodes = Array.isArray(payload.locked_nodes) ? payload.locked_nodes : [];
  const lockLines = lockedNodes
    .filter((node) => node && typeof node === "object")
    .slice(0, 10)
    .map((node) => {
      const code = typeof node.code === "string" ? node.code : "Locked_Detail";
      const label = typeof node.label === "string" ? node.label : "";
      const detail = typeof node.detail === "string" ? node.detail : "";
      return `- ${code}${label ? ` / ${label}` : ""}: ${detail}`;
    })
    .join("\n");
  const productLocks = buildInflatableHardwareMaterialLocks(productType)
    .concat(buildFirstFrameProductVisualLocks(productType))
    .concat(buildVideoProductVisualLocks(productType))
    .slice(0, 26)
    .join("\n");
  const sceneExamples = pickPromptSceneExamples()
    .map((scene) => `${scene.title}: ${scene.anchor}`)
    .join("\n");

  return {
    model: payload.model,
    input: [
      {
        role: "system",
        content: [
          "你是电商产品图生视频的提示词导演。",
          "只输出一个合法 JSON 对象，不要 Markdown，不要解释。",
          "必须一次生成同一场景下的 firstFramePrompt 和 videoPrompt。两个提示词必须共享同一地点、同一道具关系、同一镜头、同一产品身份。",
          "必须调用真实模型创作，不要套用固定模板。场景要高度多样，避免反复使用明亮超市、明亮商场、办公室、电梯。",
          "视频提示词必须更幽默诙谐，并且有一个明确的小反转或包袱；仍然只用正向、生活化、轻松幽默、无冲突、低风险的动作表达，不要列出禁词清单。",
          "BGM 和背景对话不是强制项；如果场景适合，可以自然写一句轻快 BGM、背景广播声、路人小声吐槽或旁白反应，但不能喧宾夺主，不能遮挡产品一致性。",
          "视频动作必须是微动：脸窗和拉链基本保持竖直，双脚贴地，禁止大幅前倾、弯腰、转体、抬高脚、跳跃或把小动作放大成夸张表演。",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          `产品：${productType}`,
          `稳定产品名：${stableProductName}`,
          `参考视频数量：${referenceVideoCount}`,
          `本地辅助角度数量：${supportImageCount}`,
          "候选场景池，必须从这些方向扩展出一个具体、可拍、有道具的场景；不要照抄旧提示词：",
          sceneExamples,
          "产品硬锁摘要：",
          productLocks,
          lockLines ? `前端锁定节点：\n${lockLines}` : "前端锁定节点：使用产品四视图中的所有可见组件。",
          currentFirstFramePrompt ? `当前首帧提示词，仅用于避免重复：\n${currentFirstFramePrompt}` : "当前首帧提示词为空。",
          currentVideoPrompt ? `当前视频提示词，仅用于避免重复：\n${currentVideoPrompt}` : "当前视频提示词为空。",
          "输出 JSON schema：",
          JSON.stringify({
            sceneTitle: "短场景名",
            sceneAnchor: "同一场景的地点、道具、镜头和气氛，60-120字",
            firstFramePrompt: "220-420字中文，描述首帧静态画面和产品一致性",
            videoPrompt: "160-260字中文，描述同一场景下2-3个安全、轻松、幽默的微动作，并有一个小反转或包袱；可以自然带一句轻快BGM、背景广播声或路人小声吐槽，但不是强制；必须写明脸窗和拉链基本竖直、双脚贴地、不大幅前倾、不转体",
            continuityLocks: "一句话说明两个提示词共享哪些场景和产品身份约束",
          }),
        ].join("\n\n"),
      },
    ],
    temperature: 1,
    max_output_tokens: 1200,
  };
}

function buildPromptSuggestionPayload(payload) {
  const kind = payload.kind === "video" ? "video" : "firstFrame";
  const productType = typeof payload.product_type === "string" && payload.product_type.trim() ? payload.product_type.trim() : "通用充气服";
  const stableProductName = getProductStableName(productType);
  const currentPrompt = typeof payload.current_prompt === "string" ? payload.current_prompt.trim() : "";
  const scenePrompt = typeof payload.scene_prompt === "string" ? payload.scene_prompt.trim() : "";
  const referenceVideoCount = Number.isFinite(Number(payload.reference_video_count)) ? Number(payload.reference_video_count) : 0;
  const supportImageCount = Number.isFinite(Number(payload.support_image_count)) ? Number(payload.support_image_count) : 0;
  const lockedNodes = Array.isArray(payload.locked_nodes) ? payload.locked_nodes : [];
  const lockLines = lockedNodes
    .filter((node) => node && typeof node === "object")
    .slice(0, 10)
    .map((node) => {
      const code = typeof node.code === "string" ? node.code : "Locked_Detail";
      const label = typeof node.label === "string" ? node.label : "";
      const detail = typeof node.detail === "string" ? node.detail : "";
      return `- ${code}${label ? ` / ${label}` : ""}: ${detail}`;
    })
    .join("\n");
  const videoAnchorLocks = kind === "video" ? buildVideoFirstFramePixelAnchorLocks(productType) : [];
  const productLocks = videoAnchorLocks
    .concat(buildInflatableHardwareMaterialLocks(productType))
    .concat(buildFirstFrameProductVisualLocks(productType))
    .concat(buildVideoProductVisualLocks(productType))
    .slice(0, kind === "video" ? 10 : 26)
    .join("\n");
  const task =
    kind === "firstFrame"
      ? "生成一段可直接填入“生成首帧提示词”的中文提示词。它要描述一个强故事性、短视频感、略带恶搞但不复杂的首帧场景，同时明确产品一致性优先。"
      : "生成一段可直接填入“生成视频提示词”的中文提示词。它必须像 TikTok 电商短视频导演写的喜剧动作脚本：严格沿用当前首帧场景和当前产品名，前三分之二只写清楚可见道具、误会点、停顿、反应、一个明确的小反转和 2-3 个搞怪动作节拍；BGM 或背景对话可以自然出现但不是强制；最后一句才用自然短句锁定产品一致性。不要输出产品说明书，不要输出阀门/拉链/材质清单。";
  const modeRules =
    kind === "firstFrame"
      ? [
          "首帧必须默认正面或轻微正面三分之二，全身入镜，双脚落地，背景低优先级。",
          "场景可以像参考短视频一样有反差、误会、办公室/超市/电梯/街边等生活化剧情，但不要让道具遮挡关键产品组件。",
          "必须写清楚产品不可改变：尺寸、颜色、体积、脸窗/阀门/拉链/尾巴/围巾/腰带等组件按四视图归位。",
        ].join("\n")
      : [
          `输出必须点名当前产品“${stableProductName}”，可以同时保留中文名“${productType}”；不能写成“卡通服/充气服/主角/人物”等泛称。`,
          "输出开头必须是当前首帧场景动作，不要以“视频从已确认首帧开始/发起/出发”这类技术句开头。必须自然写入当前首帧里的场景地点和可见道具，让画面有明确处境。",
          scenePrompt
            ? "严禁更换首帧场景类型和场景道具：必须沿用下面 SCENE ANCHOR 中的地点和至少两个原有道具词；如果 SCENE ANCHOR 写了海鲜区/冰鲜鱼柜/价签/购物车，就不能改成零食货架/办公室/电梯等别的地点。"
            : "如果当前首帧场景为空，才可以自行选择一个具体可拍的生活化场景。",
          "视频必须保持原镜头族，但动作要比静态展示更有戏：写成 2-3 个节拍的小短剧，例如先认真营业或装无辜、被场景里的某个无害细节打断、夸张僵住/缩手/轻微踉跄、最后做一个滑稽补救。",
          "必须有一个明确笑点和一个轻反转：误会、反差、过度认真、慢半拍反应、突然定住、假装没事、和小道具较真，至少选两种写进输出，并在结尾形成包袱。",
          "允许一个较明显但产品安全的大动作：夸张伸手/缩手、左右摇晃、轻微踉跄半步、身体弹性晃动、蹲一下又弹回、和首帧已有道具发生轻微互动；动作要看得见，不能只是站着不动或几乎看不见的呼吸抖动。",
          "风格要灵动、幽默、有一点搞笑甚至搞怪，像 TikTok 电商短视频里的荒诞小桥段；戏剧性来自场景反差、表演节奏、停顿和道具互动，不来自重绘产品。",
          "BGM 和背景对话不是硬要求；如果能增强包袱，可以写一句轻快BGM、背景广播声、路人小声吐槽或旁白反应，但不要让声音说明替代画面动作。",
          "输出必须先写喜剧情节，再写产品锁。前 2 句不得出现阀门、拉链、PVC、缝线、泵口、体积包络这类技术锁词；这些只能出现在最后一句。",
          "用安全、无冲突的喜剧表达：可以写误会、愣住、轻碰、差点贴到、夸张缩手、无辜表情、滑稽补救；只使用正向动作描述，不要列出禁词清单。",
          "必须把产品一致性约束压缩成最后一句自然说明；不要让整段变成阀门、拉链、材质的清单。",
          "已确认首帧是像素级身份锚点，不是风格参考；不要写高清重绘、质量提升、重新摆拍、双手重排、道具替换、产品美化或更干净的卡通化。",
          "可以写手持杯子、袋子、工具、标牌等剧情道具，但它们必须是外部道具，不能变成产品新增组件；道具不得遮挡或替代脸窗、嘴带、围巾、手脚、鞋子、阀门、拉链、尾部、色块、缝线和身体轮廓。",
          "动作必须从首帧里的手臂姿势、可见鞋子、尾巴、阀门、货架接触和身体轮廓自然延伸；可以让已有手臂/身体动得更明显，也可以让外部手持道具参与小动作，但不能把产品手脚、鞋子、尾巴、阀门、脸窗、嘴带或身体轮廓重排到新位置。",
          "不要写大转身、奔跑、跳舞、快速镜头、切镜头、长距离移动、遮挡产品、展示未经验证的新背面/侧面。",
          "必须写清楚从第一帧到最后一帧产品锁定：组件位置、体积包络、颜色、布料褶皱和人体穿戴比例不漂移。",
        ].join("\n");

  return {
    model: payload.model,
    input: [
      {
        role: "system",
        content:
          "你是电商产品图生视频的提示词导演。只输出一段中文提示词，不要标题、不要解释、不要列表、不要 Markdown、不要引号。产品一致性永远高于剧情创意。",
      },
      {
        role: "user",
        content: [
          task,
          `产品：${productType}`,
          `稳定产品名 / stable product name：${stableProductName}`,
          `参考视频数量：${referenceVideoCount}`,
          `本地辅助角度数量：${supportImageCount}`,
          scenePrompt
            ? `SCENE ANCHOR / 当前首帧场景上下文，视频提示词必须沿用这里的地点和至少两个具体场景元素，禁止换地点、禁止换成相似但不同的货架或房间：\n${scenePrompt}`
            : "当前首帧场景上下文为空，请自行选择一个具体可拍的生活化场景并写进视频提示词。",
          "产品硬锁摘要：",
          productLocks,
          lockLines ? `前端锁定节点：\n${lockLines}` : "前端锁定节点：使用产品四视图中的所有可见组件。",
          "写作规则：",
          modeRules,
          kind === "video"
            ? `最后一句自然带过这些产品锁即可，不要展开成清单：${buildPromptSuggestionMustMention(productType)} ${buildPromptSuggestionHardwareMustMention(productType)}`
            : buildPromptSuggestionMustMention(productType),
          kind === "video" ? "" : buildPromptSuggestionHardwareMustMention(productType),
          currentPrompt ? `当前提示词，可参考但不要照抄：\n${currentPrompt}` : "当前提示词为空，请直接生成。",
          kind === "video"
            ? `输出长度控制在 160-260 个中文字符。必须像一个有包袱的小视频动作脚本：第一句写“${stableProductName}”在 SCENE ANCHOR 原场景和原道具里的尴尬处境，第二句写 2-3 个搞怪动作节拍和一个反转停顿笑点；可以自然加一句轻快BGM、背景广播声或路人小声吐槽，但不是强制；最后一句只用简短自然的话锁定产品一致性。不要换场景，不要换产品名，不要把原场景替换成相似场景。`
            : "输出长度控制在 220-420 个中文字符，必须自然、可执行、故事性强，且明确货对版约束。",
        ].join("\n\n"),
      },
    ],
    temperature: 0.9,
    max_output_tokens: 700,
  };
}

function shouldUseLocalPromptSuggestion(payload) {
  const model = typeof payload.model === "string" ? payload.model.trim() : "";
  return !model || model === LOCAL_PROMPT_MODEL;
}

function isPromptModelUnavailable(data, status) {
  const text = JSON.stringify(data || {});
  return status === 404 || status === 503 || /model_not_found|No available channel|没有找到模型|模型不存在/i.test(text);
}

async function proxyPromptSuggestion(payload) {
  const isPair = payload && typeof payload === "object" && payload.kind === "pair";
  if (shouldUseLocalPromptSuggestion(payload)) {
    return {
      status: 400,
      payload: {
        error: "提示词模型还没有配置好，请先确认模型名称，然后点击骰子重新生成。",
        model: typeof payload.model === "string" ? payload.model : "",
      },
    };
  }

  const { apiKey, upstreamUrl, upstreamPayload } = pickProxyConfig(
    { ...payload, path: payload.path || "/responses" },
    "/responses",
    "prompt",
  );
  if (!apiKey) {
    return { status: 400, payload: { error: "服务密钥还没有配置好，请先让管理员确认后台配置。", upstreamUrl } };
  }
  const requestBody = JSON.stringify(isPair ? buildPromptPairSuggestionPayload(upstreamPayload) : buildPromptSuggestionPayload(upstreamPayload));
  let lastPayload = {};
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const response = await fetch(upstreamUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: requestBody,
    });
    const text = await response.text();
    const data = parseUpstreamBody(text, response.status);
    lastPayload = data;
    if (!response.ok) {
      if (isPromptModelUnavailable(data, response.status)) {
        return {
          status: response.status,
          payload: {
            error: "提示词模型暂时不可用，请确认模型名称或稍后再点一次骰子。",
            upstreamUrl,
            model: upstreamPayload.model,
          },
        };
      }
      return { status: response.status, payload: withUpstreamError(data, response.status, upstreamUrl) };
    }
    const rawPrompt = cleanGeneratedPrompt(extractGeneratedText(data));
    if (isPair) {
      const promptPair = parsePromptPairText(rawPrompt);
      if (promptPair) {
        return {
          status: 200,
          payload: {
            ...promptPair,
            upstreamUrl,
            model: upstreamPayload.model,
            localFallback: false,
            retryCount: attempt - 1,
          },
        };
      }
      lastPayload = { error: "这次没有拿到完整提示词，请再点一次骰子。", rawPrompt };
      continue;
    }
    const prompt = upstreamPayload.kind === "video" ? sanitizeVideoPromptText(rawPrompt) : rawPrompt;
    if (prompt) return { status: 200, payload: { prompt, upstreamUrl, model: upstreamPayload.model, localFallback: false, retryCount: attempt - 1 } };
  }
  return {
    status: 502,
    payload: {
      ...lastPayload,
      error: "这次没有拿到完整提示词，请再点一次骰子。",
      upstreamUrl,
    },
  };
}

async function proxyStatus(path) {
  if (!TOAPIS_API_KEY) {
    return {
      status: 400,
      payload: {
        error: "TOAPIS_API_KEY is not configured on the backend.",
      },
    };
  }

  const response = await fetch(`${TOAPIS_BASE_URL}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${TOAPIS_API_KEY}`,
    },
  });
  const text = await response.text();
  const data = parseUpstreamBody(text, response.status);
  return { status: response.status, payload: data };
}

function buildDashScopeTaskUrl(baseUrl, taskId) {
  const parsed = new URL(baseUrl);
  const apiIndex = parsed.pathname.indexOf("/api/v1");
  const apiBasePath = apiIndex >= 0 ? parsed.pathname.slice(0, apiIndex + "/api/v1".length) : "/api/v1";
  return `${parsed.origin}${apiBasePath}/tasks/${encodeURIComponent(taskId)}`;
}

function buildVolcengineTaskUrl(baseUrl, taskId) {
  const parsed = new URL(baseUrl);
  const apiIndex = parsed.pathname.indexOf("/api/v3");
  const apiBasePath = apiIndex >= 0 ? parsed.pathname.slice(0, apiIndex + "/api/v3".length) : "/api/v3";
  return `${parsed.origin}${apiBasePath}${VOLCENGINE_VIDEO_TASKS_PATH}/${encodeURIComponent(taskId)}`;
}

async function proxyVideoStatus(payload) {
  const body = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  const taskId = typeof body.task_id === "string" ? body.task_id.trim() : "";
  if (!taskId) {
    return { status: 400, payload: { error: "还没有找到这条视频任务，请重新生成一次。" } };
  }

  const baseUrl = (cleanEndpointText(body.base_url) || VIDEO_BASE_URL).replace(/\/+$/, "");
  const apiKey = typeof body.api_key === "string" && body.api_key.trim() ? body.api_key.trim() : VIDEO_API_KEY;
  if (!apiKey) {
    return { status: 400, payload: { error: "服务密钥还没有配置好，请先让管理员确认后台配置。" } };
  }

  const statusPath = cleanEndpointText(body.status_path);
  const upstreamUrl = isDashScopeUrl(baseUrl)
    ? buildDashScopeTaskUrl(baseUrl, taskId)
    : isVolcengineUrl(baseUrl)
      ? buildVolcengineTaskUrl(baseUrl, taskId)
      : /^https?:\/\//i.test(statusPath)
        ? statusPath.replace("{task_id}", encodeURIComponent(taskId))
        : `${baseUrl}${normalizePath(statusPath || `${OPENAI_VIDEO_GENERATIONS_PATH}/${taskId}`, "")}`;

  const response = await fetch(upstreamUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
  const text = await response.text();
  const data = parseUpstreamBody(text, response.status);
  return { status: response.status, payload: withUpstreamError(data, response.status, upstreamUrl) };
}

const apiRoutes = [
  {
    method: "GET",
    path: "/api/health",
    handler: async () =>
      createApiResponse(200, {
        ok: true,
        toapisBaseUrl: TOAPIS_BASE_URL,
        hasApiKey: Boolean(TOAPIS_API_KEY),
        imageTextBaseUrl: IMAGE_TEXT_BASE_URL,
        hasImageTextApiKey: Boolean(IMAGE_TEXT_API_KEY),
        videoBaseUrl: VIDEO_BASE_URL,
        videoModel: VIDEO_MODEL,
        hasVideoApiKey: Boolean(VIDEO_API_KEY),
      }),
  },
  {
    method: "POST",
    path: "/api/first-frame",
    handler: async ({ body }) => {
      const referenceCheck = validateFourViewImages(body);
      if (!referenceCheck.ok) return createApiResponse(400, { error: referenceCheck.error });
      return proxyJson("/images/edits", buildFirstFramePayload(body), "image");
    },
  },
  {
    method: "POST",
    path: "/api/video",
    handler: async ({ body }) => {
      const firstFrameUrl = getVideoFirstFrameUrl(body);
      if (!firstFrameUrl || !isReadableVideoFirstFrameUrl(firstFrameUrl)) {
        return createApiResponse(400, { error: "请先确认首帧，再生成视频。" });
      }
      return proxyJson(OPENAI_VIDEO_GENERATIONS_PATH, buildVideoPayload(body), "video");
    },
  },
  {
    method: "POST",
    path: "/api/prompt-suggestion",
    handler: async ({ body }) => proxyPromptSuggestion(body),
  },
  {
    method: "POST",
    path: "/api/test-image",
    handler: async ({ body }) => testProxy("", body, "image"),
  },
  {
    method: "POST",
    path: "/api/test-video",
    handler: async ({ body }) => testProxy("", body, "video"),
  },
  {
    method: "POST",
    path: "/api/video-status",
    handler: async ({ body }) => proxyVideoStatus(body),
  },
];

function findApiRoute(method, pathname) {
  const exactRoute = apiRoutes.find((route) => route.method === method && route.path === pathname);
  if (exactRoute) return exactRoute;
  if (method === "GET" && pathname.startsWith("/api/video/")) {
    return {
      method,
      path: "/api/video/:taskId",
      handler: async () => {
        const taskId = decodeURIComponent(pathname.replace("/api/video/", ""));
        if (!taskId) return createApiResponse(400, { error: "还没有找到这条视频任务，请重新生成一次。" });
        return proxyVideoStatus({ task_id: taskId });
      },
    };
  }
  return null;
}

async function handleApiRequest(req, res) {
  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const route = findApiRoute(req.method || "GET", url.pathname);
  if (!route) {
    sendJson(res, 404, { error: "没有找到这个服务入口，请刷新页面后再试。" });
    return;
  }

  const body = await readRequestBody(req);
  const result = await route.handler({ req, url, body });
  sendJson(res, result.status, result.payload);
}

const server = http.createServer(async (req, res) => {
  try {
    await handleApiRequest(req, res);
  } catch (error) {
    sendJson(res, 500, {
      error: toPublicErrorMessage(error instanceof Error ? error.message : ""),
    });
  }
});

server.listen(PORT, () => {
  console.info(`API proxy listening on http://127.0.0.1:${PORT}`);
});
