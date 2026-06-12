import http from "node:http";
import { createHmac } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";

function loadEnvFile(fileRef) {
  if (!existsSync(fileRef)) return;
  const lines = readFileSync(fileRef, "utf8").split(/\r?\n/);
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

function loadLocalEnv() {
  const sharedEnvFile = process.env.VIDEO_PLATFORM_SHARED_ENV || new URL("../../图生视频平台.shared.env.local", import.meta.url);
  loadEnvFile(sharedEnvFile);
  for (const fileName of [".env.local", ".env"]) {
    const fileUrl = new URL(`../${fileName}`, import.meta.url);
    loadEnvFile(fileUrl);
  }
}

loadLocalEnv();

function resolveWorkingBinary(candidates) {
  for (const candidate of candidates) {
    if (!candidate || !existsSync(candidate)) continue;
    const result = spawnSync(candidate, ["-version"], { encoding: "utf8", windowsHide: true, timeout: 5000 });
    if (!result.error && result.status === 0) return candidate;
  }
  return "";
}

const PORT = Number(process.env.PORT || 6000);
const TOAPIS_BASE_URL = (process.env.TOAPIS_BASE_URL || "https://toapis.com/v1").replace(/\/+$/, "");
const TOAPIS_API_KEY = process.env.TOAPIS_API_KEY || "";
const IMAGE_TEXT_BASE_URL = (process.env.IMAGE_TEXT_BASE_URL || "https://aicanapi.com/v1").replace(/\/+$/, "");
const IMAGE_TEXT_API_KEY = process.env.IMAGE_TEXT_API_KEY || TOAPIS_API_KEY;
const TTS_PROVIDER = process.env.TTS_PROVIDER || "aican";
const TTS_BASE_URL = (process.env.TTS_BASE_URL || IMAGE_TEXT_BASE_URL).replace(/\/+$/, "");
const TTS_API_KEY = process.env.TTS_API_KEY || IMAGE_TEXT_API_KEY;
const TTS_MODEL = process.env.TTS_MODEL || "gpt-4o-audio-preview";
const TTS_VOICE = process.env.TTS_VOICE || "alloy";
const TTS_VOICE_OPTIONS = {
  female: process.env.TTS_FEMALE_VOICE || "alloy",
  male: process.env.TTS_MALE_VOICE || "verse",
};
const VIDEO_BASE_URL = (process.env.VIDEO_BASE_URL || TOAPIS_BASE_URL).replace(/\/+$/, "");
const VIDEO_API_KEY = process.env.VIDEO_API_KEY || TOAPIS_API_KEY;
const VIDEO_MODEL = process.env.VIDEO_MODEL || "";
const TOAPIS_VIDEO_MODEL = process.env.TOAPIS_VIDEO_MODEL || VIDEO_MODEL || "kling-v3";
const WISECH_VIDEO_BASE_URL = (process.env.WISECH_VIDEO_BASE_URL || "https://ai.wisech.com/v1").replace(/\/+$/, "");
const WISECH_VIDEO_API_KEY = process.env.WISECH_VIDEO_API_KEY || "";
const WISECH_VIDEO_MODEL = process.env.WISECH_VIDEO_MODEL || "yunshu-2-0-260128-1080p";
const KLING_VIDEO_BASE_URL = (process.env.KLING_VIDEO_BASE_URL || "https://api-singapore.klingai.com").replace(/\/+$/, "");
const KLING_VIDEO_API_KEY = process.env.KLING_VIDEO_API_KEY || "";
const KLING_ACCESS_KEY = process.env.KLING_ACCESS_KEY || process.env.KLINGAI_ACCESS_KEY || "";
const KLING_SECRET_KEY = process.env.KLING_SECRET_KEY || process.env.KLINGAI_SECRET_KEY || "";
const KLING_VIDEO_MODEL = process.env.KLING_VIDEO_MODEL || "kling-v3-omni";
const SHISHI_VIDEO_BASE_URL = (process.env.SHISHI_VIDEO_BASE_URL || "https://api.shishikeji.com").replace(/\/+$/, "");
const SHISHI_VIDEO_API_KEY = process.env.SHISHI_VIDEO_API_KEY || "";
const SHISHI_VIDEO_MODEL = process.env.SHISHI_VIDEO_MODEL || "2.0";
const WISECH_DEFAULT_VIDEO_DURATION_SECONDS = 5;
const SHISHI_MIN_VIDEO_DURATION_SECONDS = 5;
const SHISHI_MAX_VIDEO_DURATION_SECONDS = 15;
const SHISHI_MAX_PROMPT_CHARS = 6000;
const SHISHI_PROMPT_SOFT_LIMIT = 5600;
const LOCAL_PROMPT_MODEL = "local-safety-draft";
const DEFAULT_PROMPT_MODEL = "gpt-5.4-mini";
const DEFAULT_IMAGE_MODEL = "gpt-image-2";
const STALE_PROMPT_MODELS = new Set(["gpt-4.1-mini", "gpt-5.5", LOCAL_PROMPT_MODEL]);
const STALE_IMAGE_MODELS = new Set(["gpt-4.1-mini", "image-2"]);
const RECENT_PROMPT_SCENE_LIMIT = 8;
const UPSTREAM_TIMEOUT_MS = 360000;
const VIDEO_UPSTREAM_TIMEOUT_MS = 90000;
const MAX_JSON_BODY_BYTES = 50 * 1024 * 1024;
const LOCAL_HISTORY_FILE = process.env.VIDEO_PLATFORM_HISTORY_FILE || `${process.cwd()}\\.codex-run\\history-items.json`;
const LOCAL_HISTORY_LIMIT = 30;
const LOCAL_POST_RENDER_DIR = process.env.VIDEO_PLATFORM_RENDER_DIR || `${process.cwd()}\\.codex-run\\post-render`;
const LOCAL_HISTORY_ASSET_DIR = process.env.VIDEO_PLATFORM_HISTORY_ASSET_DIR || `${process.cwd()}\\.codex-run\\history-assets`;
const FFMPEG_BINARY = resolveWorkingBinary([
  process.env.FFMPEG_PATH,
  ffmpegPath,
  `${process.env.APPDATA || ""}\\Python\\Python310\\site-packages\\imageio_ffmpeg\\binaries\\ffmpeg-win-x86_64-v7.1.exe`,
  `${process.env.USERPROFILE || ""}\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\Lib\\site-packages\\imageio_ffmpeg\\binaries\\ffmpeg-win-x86_64-v7.1.exe`,
  `${process.env.LOCALAPPDATA || ""}\\ms-playwright\\ffmpeg-1011\\ffmpeg-win64.exe`,
]);
const FFPROBE_BINARY = resolveWorkingBinary([process.env.FFPROBE_PATH, ffprobeStatic?.path]);
const OPENAI_VIDEO_GENERATIONS_PATH = "/video/generations";
const TOAPIS_VIDEO_GENERATIONS_PATH = "/videos/generations";
const TOAPIS_IMAGE_UPLOAD_PATH = "/uploads/images";
const DASHSCOPE_IMAGE_GENERATION_PATH = "/services/aigc/multimodal-generation/generation";
const DASHSCOPE_VIDEO_SYNTHESIS_PATH = "/services/aigc/video-generation/video-synthesis";
const VOLCENGINE_VIDEO_TASKS_PATH = "/contents/generations/tasks";
const SHISHI_VIDEO_GENERATION_PATH = "/api/generate-video";
const KLING_OMNI_VIDEO_PATH = "/v1/videos/omni-video";
const TOAPIS_MAX_UPLOAD_IMAGE_BYTES = 10 * 1024 * 1024;
const PROMPT_MODEL_NOT_CONFIGURED_MESSAGE = "Prompt model is not configured.";
const PROMPT_MODEL_UNAVAILABLE_MESSAGE = "Prompt model is temporarily unavailable.";
const DEFAULT_PROMPT_MODEL_LIMIT = { maxInputChars: 24000, maxOutputTokens: 1200 };
const PROMPT_MODEL_LIMITS = {
  [DEFAULT_PROMPT_MODEL]: DEFAULT_PROMPT_MODEL_LIMIT,
};
const DEFAULT_IMAGE_MODEL_LIMIT = { maxPromptChars: 8000, maxReferenceImages: 8, maxReferenceImageBytes: 900_000 };
const IMAGE_MODEL_LIMITS = {
  [DEFAULT_IMAGE_MODEL]: DEFAULT_IMAGE_MODEL_LIMIT,
};
const VIDEO_MODEL_LIMITS = {
  shishi: {
    default: { minDuration: 5, maxDuration: 15, promptSoftLimit: 5600, promptHardLimit: 6000, resolution: "720p" },
    "2.0": { minDuration: 5, maxDuration: 15, promptSoftLimit: 5600, promptHardLimit: 6000, resolution: "720p" },
    "transit9-fast": { minDuration: 5, maxDuration: 15, promptSoftLimit: 5200, promptHardLimit: 6000, resolution: "720p" },
    "transit9-2.0": { minDuration: 5, maxDuration: 15, promptSoftLimit: 5200, promptHardLimit: 6000, resolution: "720p" },
  },
  wisech: {
    default: { minDuration: 4, maxDuration: 15, promptSoftLimit: 5200, promptHardLimit: 6000, resolution: "1080p" },
    "yunshu-2-0-260128-1080p": { minDuration: 4, maxDuration: 15, promptSoftLimit: 5200, promptHardLimit: 6000, resolution: "1080p" },
    "yunshu-2-0-260128-720p": { minDuration: 4, maxDuration: 15, promptSoftLimit: 5200, promptHardLimit: 6000, resolution: "720p" },
  },
  kling: {
    default: { minDuration: 3, maxDuration: 15, promptSoftLimit: 2400, promptHardLimit: 2500, resolution: "1080p" },
    "kling-v3-omni": { minDuration: 3, maxDuration: 15, promptSoftLimit: 2400, promptHardLimit: 2500, resolution: "1080p" },
    "kling-video-o1": { minDuration: 3, maxDuration: 10, promptSoftLimit: 2400, promptHardLimit: 2500, resolution: "1080p" },
  },
  toapis: {
    default: { minDuration: 4, maxDuration: 15, promptSoftLimit: 4600, promptHardLimit: 5200, resolution: "1080p" },
    "kling-v3": { minDuration: 4, maxDuration: 15, promptSoftLimit: 4600, promptHardLimit: 5200, resolution: "1080p" },
    "seedance-2-fast": { minDuration: 4, maxDuration: 15, promptSoftLimit: 4600, promptHardLimit: 5200, resolution: "1080p" },
    "doubao-seedance-1-5-pro": { minDuration: 4, maxDuration: 12, promptSoftLimit: 4200, promptHardLimit: 4800, resolution: "1080p" },
    "grok-video-3": { minDuration: 6, maxDuration: 6, promptSoftLimit: 1800, promptHardLimit: 2200, resolution: "1080p" },
  },
};
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

function base64UrlEncode(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return Buffer.from(text).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function hasJwtShape(value) {
  if (typeof value !== "string") return false;
  const parts = value.trim().split(".");
  return parts.length === 3 && parts.every(Boolean);
}

function createKlingJwtToken(accessKey, secretKey) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    iss: accessKey,
    exp: now + 1800,
    nbf: now - 5,
  };
  const unsignedToken = `${base64UrlEncode(header)}.${base64UrlEncode(payload)}`;
  const signature = createHmac("sha256", secretKey).update(unsignedToken).digest("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${unsignedToken}.${signature}`;
}

function getKlingAuthState(apiKey = KLING_VIDEO_API_KEY) {
  const tokenOrAccessKey = typeof apiKey === "string" ? apiKey.trim() : "";
  const tokenPartCount = tokenOrAccessKey ? tokenOrAccessKey.split(".").length : 0;
  const explicitAccessKey = KLING_ACCESS_KEY.trim();
  const secretKey = KLING_SECRET_KEY.trim();

  if (hasJwtShape(tokenOrAccessKey)) {
    return {
      ok: true,
      token: tokenOrAccessKey,
      source: "jwt",
      tokenPartCount,
      hasAccessKey: Boolean(explicitAccessKey),
      hasSecretKey: Boolean(secretKey),
    };
  }

  const accessKey = explicitAccessKey || tokenOrAccessKey;
  if (!accessKey) {
    return {
      ok: false,
      code: "KLING_ACCESS_KEY_MISSING",
      error: "Kling AccessKey/JWT is not configured. Add KLING_ACCESS_KEY + KLING_SECRET_KEY, or set KLING_VIDEO_API_KEY to a 3-part JWT.",
      tokenPartCount,
      hasAccessKey: false,
      hasSecretKey: Boolean(secretKey),
    };
  }

  if (!secretKey) {
    return {
      ok: false,
      code: "KLING_SECRET_KEY_MISSING",
      error: "Kling SecretKey is missing. KLING_VIDEO_API_KEY currently looks like an AccessKey, not a 3-part JWT; add KLING_SECRET_KEY or replace KLING_VIDEO_API_KEY with a generated JWT.",
      tokenPartCount,
      hasAccessKey: true,
      hasSecretKey: false,
    };
  }

  return {
    ok: true,
    token: createKlingJwtToken(accessKey, secretKey),
    source: explicitAccessKey ? "access-secret" : "api-key-secret",
    tokenPartCount: 3,
    hasAccessKey: true,
    hasSecretKey: true,
  };
}

function getKlingAuthPublicState(apiKey = KLING_VIDEO_API_KEY) {
  const { token, ...state } = getKlingAuthState(apiKey);
  return state;
}

function createBearerAuthHeaders(upstreamUrl, apiKey, kind = "generic") {
  if (kind === "video" && isKlingVideoUrl(upstreamUrl)) {
    const authState = getKlingAuthState(apiKey);
    if (!authState.ok) {
      const error = new Error(authState.error);
      error.code = authState.code;
      throw error;
    }
    return { Authorization: `Bearer ${authState.token}` };
  }
  return { Authorization: `Bearer ${apiKey}` };
}
const PROMPT_SCENE_BANK = [
  { title: "夜市摊位", anchor: "夜市小吃摊旁，暖色灯串、折叠桌、手写价签和塑料周转筐都在画面边缘，地面有轻微反光。" },
  { title: "物流分拣区", anchor: "电商仓库分拣台前，纸箱、扫码枪、传送带和贴着面单的包裹形成真实工作场景。" },
  { title: "洗衣房", anchor: "自助洗衣房里，滚筒洗衣机、蓝色洗衣篮、找零机和墙上的注意事项贴纸构成干净生活场景。" },
  { title: "展会通道", anchor: "小型展会通道，折叠展架、样品台、挂绳证牌和未收起的电源线让画面像临时布展现场。" },
  { title: "便利店门口", anchor: "便利店门口的自动门旁，冰柜灯箱、雨伞架、促销立牌和扫码付款贴纸清楚可见。" },
  { title: "地铁站外广场", anchor: "地铁站出口旁，导向牌、共享雨伞机、路面反光和排队护栏组成城市通勤背景。" },
  { title: "直播间后台", anchor: "直播间后台角落，补光灯、折叠椅、样品货架、透明胶带和手写流程板围绕产品摆放。" },
  { title: "酒店走廊", anchor: "酒店走廊尽头，行李车、房号牌、清洁车和柔和地毯纹理构成安静但有反差的场景。" },
  { title: "宠物用品店", anchor: "宠物用品店货架前，牵引绳、玩具球、猫砂袋和小号购物篮作为环境道具。" },
  { title: "摄影棚侧场", anchor: "小型摄影棚侧场，白色无缝纸、沙袋、反光板、线缆和场记板都在产品周围但不遮挡主体。" },
  { title: "社区活动室", anchor: "社区活动室里，折叠桌、公告栏、保温杯和签到表形成朴素真实的生活化背景。" },
  { title: "商场维修通道", anchor: "商场维修通道门口，黄色警示牌、工具箱、推车和灰色防滑地面带出轻微反差感。" },
];

const recentPromptSceneTitles = [];

function pickPromptSceneExamples(count = 6) {
  return PROMPT_SCENE_BANK
    .map((scene) => ({ scene, rank: Math.random() }))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, count)
    .map(({ scene }) => scene);
}

function pickPromptSceneSet(count = 6) {
  const shuffledScenes = pickPromptSceneExamples(PROMPT_SCENE_BANK.length);
  const requiredScene =
    shuffledScenes.find((scene) => !recentPromptSceneTitles.includes(scene.title)) ||
    shuffledScenes[0] ||
    PROMPT_SCENE_BANK[0];
  if (requiredScene) {
    recentPromptSceneTitles.unshift(requiredScene.title);
    recentPromptSceneTitles.splice(RECENT_PROMPT_SCENE_LIMIT);
  }
  const scenes = [requiredScene, ...shuffledScenes.filter((scene) => scene.title !== requiredScene.title)].slice(0, Math.max(2, count));
  return {
    requiredScene: scenes[0],
    referenceScenes: scenes.slice(1),
  };
}

function createSensitiveChineseRegex(hexParts) {
  return new RegExp(hexParts.map((part) => `\\u${part}`).join(""), "g");
}

const SENSITIVE_PRODUCT_WORD_REPLACEMENTS = [
  [createSensitiveChineseRegex(["5976", "5934"]), "粉色小圆点"],
  [createSensitiveChineseRegex(["4e73", "623f"]), "粉色下腹组件"],
  [createSensitiveChineseRegex(["80f8", "8179"]), "侧面躯干"],
  [createSensitiveChineseRegex(["80f8", "53e3"]), "上身正面"],
  [createSensitiveChineseRegex(["80f8", "7ebf"]), "上身简线"],
  [createSensitiveChineseRegex(["80f8", "90e8"]), "上身"],
  [createSensitiveChineseRegex(["80f8"]), "上身"],
  [new RegExp("\\bu" + "dders?\\b", "gi"), "front belly pad"],
  [new RegExp("\\bn" + "ipples?\\b", "gi"), "small pink dots"],
  [new RegExp("\\bb" + "reasts?\\b", "gi"), "front belly pad"],
  [new RegExp("\\bc" + "hest\\b", "gi"), "upper torso"],
  [new RegExp("\\bb" + "ust\\b", "gi"), "upper torso"],
];

function sanitizeProductText(text) {
  let value = String(text || "");
  for (const [pattern, replacement] of SENSITIVE_PRODUCT_WORD_REPLACEMENTS) {
    value = value.replace(pattern, replacement);
  }
  return value.replace(/\s{2,}/g, " ").trim();
}

function sanitizeApiPayload(value) {
  if (typeof value === "string") {
    if (/^(data:|https?:\/\/)/i.test(value)) return value;
    return sanitizeProductText(value);
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeApiPayload(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeApiPayload(item)]));
  }
  return value;
}

function getPromptModelLimit(model) {
  const key = typeof model === "string" ? model.trim() : "";
  return PROMPT_MODEL_LIMITS[key] || DEFAULT_PROMPT_MODEL_LIMIT;
}

function getImageModelLimit(model) {
  const key = typeof model === "string" ? model.trim() : "";
  return IMAGE_MODEL_LIMITS[key] || DEFAULT_IMAGE_MODEL_LIMIT;
}

function getVideoModelLimit(provider, model) {
  const providerKey = typeof provider === "string" && provider.trim() ? provider.trim().toLowerCase() : "shishi";
  const modelKey = typeof model === "string" ? model.trim() : "";
  const providerLimits = VIDEO_MODEL_LIMITS[providerKey] || VIDEO_MODEL_LIMITS.shishi;
  if (providerLimits[modelKey]) return providerLimits[modelKey];
  if (providerKey === "wisech" && /1-5|1\.5/i.test(modelKey)) {
    return { minDuration: 4, maxDuration: 12, promptSoftLimit: 4800, promptHardLimit: 5200, resolution: "1080p" };
  }
  return providerLimits.default;
}

function resolveVideoProviderFromUrl(upstreamUrl, fallbackProvider = "") {
  const fallback = typeof fallbackProvider === "string" && fallbackProvider.trim() ? fallbackProvider.trim().toLowerCase() : "";
  if (fallback) return fallback;
  if (isShishiKejiUrl(upstreamUrl)) return "shishi";
  if (isWisechVideoUrl(upstreamUrl)) return "wisech";
  if (isKlingVideoUrl(upstreamUrl)) return "kling";
  if (isToapisUrl(upstreamUrl)) return "toapis";
  return "toapis";
}

function formatLockedNodeLines(lockedNodes, maxLines = 10, maxChars = 1800, labelSeparator = " / ") {
  if (!Array.isArray(lockedNodes)) return "";
  return truncateTextByChars(
    lockedNodes
      .filter((node) => node && typeof node === "object")
      .slice(0, maxLines)
      .map((node) => {
        const code = typeof node.code === "string" ? sanitizeProductText(node.code) : "Locked_Detail";
        const label = typeof node.label === "string" ? sanitizeProductText(node.label) : "";
        const detail = typeof node.detail === "string" ? sanitizeProductText(node.detail) : "";
        return `- ${code}${label ? `${labelSeparator}${label}` : ""}: ${detail}`;
      })
      .filter(Boolean)
      .join("\n"),
    maxChars,
  );
}

function sanitizePromptRequest(payload) {
  return sanitizeApiPayload(payload);
}

function isTimedScriptLine(line) {
  return /^\s*(?:第\s*)?\d+(?:\.\d+)?\s*(?:-|~|–|—|到|至)\s*\d+(?:\.\d+)?\s*秒?/i.test(String(line || ""));
}

function getScriptLineLabel(line) {
  const match = String(line || "").match(/^\s*([A-Za-z\u4e00-\u9fa5]+)\s*[:：]/);
  return match ? match[1].trim().toLowerCase() : "";
}

function stripPostProductionTextFromScript(script) {
  const lines = String(script || "").split(/\r?\n/);
  const output = [];
  let skippingPostProductionBlock = false;
  const postLabels = new Set(["字幕", "subtitle", "subtitles", "caption", "captions", "旁白", "配音", "voiceover", "vo"]);
  const visualOrSoundLabels = new Set(["画面", "镜头", "场景", "动作", "音效", "音乐", "bgm", "sound", "sfx"]);

  for (const line of lines) {
    const label = getScriptLineLabel(line);
    const isTiming = isTimedScriptLine(line);
    if (isTiming) {
      skippingPostProductionBlock = false;
      output.push(line);
      continue;
    }
    if (postLabels.has(label)) {
      skippingPostProductionBlock = true;
      continue;
    }
    if (visualOrSoundLabels.has(label)) {
      skippingPostProductionBlock = false;
      output.push(line);
      continue;
    }
    if (skippingPostProductionBlock) continue;
    output.push(line);
  }

  return output
    .join("\n")
    .replace(/^\s*(字幕|subtitle|captions?|旁白|配音|voiceover|vo)\s*[:：].*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getVisualScriptText(text) {
  const stripped = stripPostProductionTextFromScript(text);
  return stripped || String(text || "").trim();
}

function ensureVideoPromptFinalLock(productType, prompt) {
  const text = sanitizeProductText(prompt);
  if (!text) return "";
  if (/stable|locked|consistent|no drift|same product/i.test(text.slice(-180))) return text;
  const stableProductName = getProductStableName(productType);
  return sanitizeProductText(`${text.replace(/[.;,\s]+$/u, "")}. Keep ${stableProductName} identity, component placement, colors, material wrinkles, wearer proportions, and grounded feet stable with no drift.`);
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

function sendBinary(res, status, body, headers = {}) {
  res.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    ...headers,
  });
  res.end(body);
}

function createApiResponse(status, payload) {
  return { status, payload };
}

const HISTORY_ASSET_REF_PREFIX = "videoai-history-asset:";
const HISTORY_ASSET_FIELDS = ["detailUrl", "firstFrameUrl", "videoUrl"];

function isHistoryAssetRef(value) {
  return typeof value === "string" && value.startsWith(HISTORY_ASSET_REF_PREFIX);
}

function getHistoryImageExtension(mimeType) {
  const normalized = typeof mimeType === "string" ? mimeType.toLowerCase() : "";
  if (normalized.includes("jpeg") || normalized.includes("jpg")) return "jpg";
  if (normalized.includes("webp")) return "webp";
  if (normalized.includes("gif")) return "gif";
  return "png";
}

function persistHistoryDataImage(itemId, field, value) {
  if (typeof value !== "string" || !value.startsWith("data:image/")) return value;
  const match = value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return "";
  const [, mimeType, base64] = match;
  const bytes = Buffer.from(base64, "base64");
  if (!bytes.length) return "";
  const extension = getHistoryImageExtension(mimeType);
  const cleanId = String(itemId || `asset-${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, "_");
  const cleanField = String(field || "asset").replace(/[^a-zA-Z0-9_-]/g, "_");
  const fileName = `videoai-history-asset_${cleanId}_${cleanField}.${extension}`;
  mkdirSync(LOCAL_HISTORY_ASSET_DIR, { recursive: true });
  writeFileSync(resolve(LOCAL_HISTORY_ASSET_DIR, fileName), bytes);
  return `/api/history-asset/${fileName}`;
}

function sanitizeLocalHistoryItem(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return item;
  if (String(item.id || "").startsWith("CODEx-HISTORY")) return null;
  const next = { ...item };
  for (const field of HISTORY_ASSET_FIELDS) {
    if (isHistoryAssetRef(next[field])) {
      next[field] = undefined;
    } else if (typeof next[field] === "string" && next[field].startsWith("data:image/")) {
      next[field] = persistHistoryDataImage(next.id, field, next[field]);
    }
  }
  if (Array.isArray(next.productViewUrls)) {
    next.productViewUrls = next.productViewUrls.filter((url) => typeof url === "string" && !url.startsWith("data:") && !isHistoryAssetRef(url));
  }
  if (Array.isArray(next.supportImageUrls)) {
    next.supportImageUrls = next.supportImageUrls.filter((url) => typeof url === "string" && !url.startsWith("data:") && !isHistoryAssetRef(url));
  }
  return next;
}

function readLocalHistoryItems() {
  try {
    if (!existsSync(LOCAL_HISTORY_FILE)) return [];
    const parsed = JSON.parse(readFileSync(LOCAL_HISTORY_FILE, "utf8"));
    return Array.isArray(parsed) ? parsed.slice(0, LOCAL_HISTORY_LIMIT) : [];
  } catch {
    return [];
  }
}

function writeLocalHistoryItems(items) {
  const safeItems = Array.isArray(items) ? items.slice(0, LOCAL_HISTORY_LIMIT).map(sanitizeLocalHistoryItem).filter(Boolean) : [];
  const directory = LOCAL_HISTORY_FILE.replace(/[\\/][^\\/]+$/, "");
  if (directory) mkdirSync(directory, { recursive: true });
  writeFileSync(LOCAL_HISTORY_FILE, JSON.stringify(safeItems, null, 2), "utf8");
  return safeItems;
}

async function readRequestBody(req) {
  return req.method === "POST" ? readJson(req) : {};
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    let tooLarge = false;
    req.on("data", (chunk) => {
      if (tooLarge) return;
      raw += chunk;
      if (raw.length > MAX_JSON_BODY_BYTES) {
        tooLarge = true;
        const error = new Error(`Request body too large. Limit is ${MAX_JSON_BODY_BYTES} bytes.`);
        error.statusCode = 413;
        reject(error);
      }
    });
    req.on("end", () => {
      if (tooLarge) return;
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
  const { base_url, api_key, path, video_provider, ...upstreamPayload } = body;
  const videoProvider = typeof video_provider === "string" ? video_provider.trim().toLowerCase() : "";
  const providerConfig =
    kind === "video" && videoProvider === "wisech"
      ? { baseUrl: WISECH_VIDEO_BASE_URL, apiKey: WISECH_VIDEO_API_KEY, model: WISECH_VIDEO_MODEL }
      : kind === "video" && videoProvider === "shishi"
        ? { baseUrl: SHISHI_VIDEO_BASE_URL, apiKey: SHISHI_VIDEO_API_KEY, model: SHISHI_VIDEO_MODEL }
        : kind === "video" && videoProvider === "kling"
          ? { baseUrl: KLING_VIDEO_BASE_URL, apiKey: KLING_VIDEO_API_KEY || KLING_ACCESS_KEY, model: KLING_VIDEO_MODEL, path: KLING_OMNI_VIDEO_PATH }
          : kind === "video" && videoProvider === "toapis"
            ? { baseUrl: VIDEO_BASE_URL || TOAPIS_BASE_URL, apiKey: VIDEO_API_KEY || TOAPIS_API_KEY, model: TOAPIS_VIDEO_MODEL, path: TOAPIS_VIDEO_GENERATIONS_PATH }
        : null;
  if (providerConfig && providerConfig.model && !upstreamPayload.model) upstreamPayload.model = providerConfig.model;
  const normalizedModel = normalizeUpstreamModel(upstreamPayload.model, kind);
  if (normalizedModel) upstreamPayload.model = normalizedModel;
  const useFixedImageTextApi = kind === "image" || kind === "prompt";
  const useVideoApi = kind === "video";
  const baseUrlInput = useFixedImageTextApi || providerConfig ? "" : cleanEndpointText(base_url);
  const rawBaseUrl = useFixedImageTextApi
    ? IMAGE_TEXT_BASE_URL
    : baseUrlInput
      ? baseUrlInput.replace(/\/+$/, "")
      : providerConfig
        ? providerConfig.baseUrl
        : useVideoApi
        ? VIDEO_BASE_URL
        : TOAPIS_BASE_URL;
  const apiKey = useFixedImageTextApi
    ? IMAGE_TEXT_API_KEY
    : providerConfig
      ? providerConfig.apiKey
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
  const isShishiKejiBase = (() => {
    try {
      return new URL(rawBaseUrl).hostname === "api.shishikeji.com";
    } catch {
      return false;
    }
  })();
  const isHappyHorseModel =
    typeof upstreamPayload.model === "string" &&
    upstreamPayload.model.toLowerCase().includes("happyhorse");
  const dashScopeFallbackPath =
    isShishiKejiBase && kind === "video"
      ? SHISHI_VIDEO_GENERATION_PATH
      : isDashScopeBase && kind === "video" && isHappyHorseModel
      ? DASHSCOPE_VIDEO_SYNTHESIS_PATH
      : isDashScopeBase && kind === "image"
        ? DASHSCOPE_IMAGE_GENERATION_PATH
        : isVolcengineBase && kind === "video"
          ? VOLCENGINE_VIDEO_TASKS_PATH
        : providerConfig?.path || fallbackPath;
  const upstreamUrl = /^https?:\/\//i.test(pathText)
    ? pathText
    : pathText
      ? `${rawBaseUrl}${normalizePath(pathText, "")}`
      : isCompleteEndpoint(rawBaseUrl)
        ? rawBaseUrl
        : `${rawBaseUrl}${normalizePath("", dashScopeFallbackPath)}`;
  const sanitizedUpstreamPayload = sanitizeApiPayload(upstreamPayload);
  return { baseUrl: rawBaseUrl, apiKey, upstreamUrl, upstreamPayload: sanitizedUpstreamPayload };
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

function findUrlByKey(value, keyPattern) {
  if (!value || typeof value !== "object") return "";
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findUrlByKey(item, keyPattern);
      if (found) return found;
    }
    return "";
  }
  for (const [key, child] of Object.entries(value)) {
    if (/^(upstreamUrl|requestUrl|taskUrl|statusUrl)$/i.test(key)) continue;
    if (typeof child === "string" && keyPattern.test(key) && /^https?:\/\//i.test(child)) {
      return child;
    }
    const found = findUrlByKey(child, keyPattern);
    if (found) return found;
  }
  return "";
}

function extractImageUrls(data) {
  if (!data || typeof data !== "object") return [];
  const urls = [];
  const records = Array.isArray(data.data) ? data.data : [];
  for (const record of records) {
    if (!record || typeof record !== "object") continue;
    if (typeof record.url === "string" && /^https?:\/\//i.test(record.url)) {
      urls.push(record.url);
    } else if (typeof record.b64_json === "string") {
      const mimeType = getBase64ImageMime(record.b64_json);
      if (mimeType) urls.push(`data:${mimeType};base64,${record.b64_json}`);
    }
  }
  const dashScopeUrl = findUrlByKey(data.output, /^(image|url|image_url|imageUrl|result_url)$/i);
  if (dashScopeUrl) urls.push(dashScopeUrl);
  const imageUrl = findUrlByKey(data, /^(image|image_url|imageUrl|result_url)$/i);
  if (imageUrl) urls.push(imageUrl);
  return [...new Set(urls)];
}

function withUpstreamError(data, status, upstreamUrl) {
  if (status >= 200 && status < 300) return { ...data, upstreamUrl };
  const hasMessage = data && typeof data === "object" && ("error" in data || "message" in data);
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
  return { ...data, error: `Service request failed (${status}). Please check the service configuration.`, upstreamUrl };
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
  if (/upstream service could not be reached|fetch failed|ECONNRESET|ECONNREFUSED|ENOTFOUND|ETIMEDOUT/i.test(text)) {
    return "上游服务这次连接中断，没有拿到返回结果。请直接再试一次；如果连续出现，请让管理员检查后台服务地址和密钥配置。";
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

function getUpstreamConnectionFailureMessage(kind, isAbortError) {
  if (isAbortError) {
    return kind === "image"
      ? "首帧生成服务这次处理超时，没有拿到返回结果。请稍后再试；如果连续出现，请换一个首帧模型或让管理员检查图片通道。"
      : "上游服务这次处理超时，没有拿到返回结果。请稍后再试。";
  }
  if (kind === "image") {
    return "首帧生成服务这次连接中断，没有拿到上游返回。请直接再生成一次；如果连续出现，请让管理员检查 IMAGE_TEXT_BASE_URL / IMAGE_TEXT_API_KEY 或切换图片通道。";
  }
  if (kind === "video") {
    return "视频生成服务这次连接中断，没有拿到上游返回。请稍后重试；如果连续出现，请让管理员检查当前视频通道配置。";
  }
  return "上游服务这次连接中断，没有拿到返回结果。请稍后重试；如果连续出现，请让管理员检查后台服务配置。";
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

const PRODUCT_LOCK_SPECS = {
  shark: [
    ["shark_white_belly", "White belly/front panel", ["front"], ["front", "front_three_quarter"], ["side_valve_area", "rear_tail"], ["white belly disappears", "white belly becomes blue", "front panel is covered by props"]],
    ["shark_face_window", "Small shallow transparent face window", ["front"], ["front", "front_three_quarter"], ["side", "rear", "belly_bottom"], ["window becomes a big visor", "window moves upward", "window becomes mouth or teeth"]],
    ["shark_front_zipper", "Vertical zipper below face window", ["front"], ["front", "front_three_quarter"], ["side", "rear", "valve_area"], ["zipper tilts heavily", "zipper breaks", "zipper moves to side"]],
    ["shark_orange_side_valve", "Orange circular blower valve on valve-side waist", ["right", "rear_edge"], ["right", "right_three_quarter", "rear_edge"], ["front", "left", "white_belly", "face_window"], ["valve moves to left side", "valve moves to white belly", "valve becomes decoration"]],
    ["shark_side_gill_lines", "Side gill stripes", ["left", "right"], ["side", "three_quarter"], ["front_center", "rear_center"], ["gills become mouth", "wrong count", "gills drift to front belly"]],
    ["shark_rear_tail_fin", "Centered rear tail fin", ["back"], ["rear", "rear_edge"], ["front", "side_waist", "white_belly"], ["tail moves to side waist", "tail becomes wing", "tail duplicates"]],
    ["shark_arm_fins", "Short arm fins with white inner panels", ["left", "right"], ["front", "side", "three_quarter"], ["far_wide_wing"], ["fins stretch into airplane wings", "fin color changes", "extra fins appear"]],
    ["shark_black_shoes", "Black shoe/sole evidence at bottom", ["front", "side", "back"], ["full_body"], ["floating_crop"], ["shoes disappear", "feet become blue blobs", "floor contact breaks"]],
  ],
  cow: [
    ["cow_front_face", "Cow face, horns, ears, snout, eyes", ["front"], ["front", "front_three_quarter"], ["rear"], ["face becomes generic mascot", "horns missing", "snout changes shape"]],
    ["cow_front_belly_pad", "Pink lower-front belly pad with four dots", ["front"], ["front", "front_three_quarter"], ["back", "side_valve_area"], ["belly pad moves to rear", "dots disappear", "pad becomes large decoration"]],
    ["cow_black_patches", "Irregular black cow patches", ["front", "left", "right", "back"], ["visible_surface"], ["wrong_surface_merge"], ["patch count changes wildly", "patches become stripes", "patches smooth into logo"]],
    ["cow_back_zipper", "Back center zipper and seam", ["back"], ["rear", "rear_edge"], ["front_belly"], ["zipper moves to front", "zipper vanishes", "zipper becomes seam decoration"]],
    ["cow_orange_rear_valve", "Orange rear/right blower valve", ["back", "right_rear"], ["rear", "right_rear_edge"], ["front", "pink_belly_pad", "snout"], ["valve moves to front", "valve becomes black patch", "valve is hidden by arm"]],
    ["cow_rear_tail", "Centered rear tail with black tip", ["back"], ["rear", "rear_edge"], ["front", "side_middle"], ["tail disappears", "tail moves to side", "tail duplicates"]],
    ["cow_hoof_gloves_feet", "Black hoof gloves and foot covers", ["front", "side"], ["full_body"], ["floating_crop"], ["hoof covers disappear", "hands become skin", "feet become generic shoes"]],
  ],
  mouse: [
    ["mouse_ears", "Round gray ears with cream interiors", ["front", "side"], ["front", "three_quarter", "side"], ["rear_only"], ["ears become huge", "cream interior missing", "extra ears appear"]],
    ["mouse_snout_mouth", "Cream face area, protruding snout, black open mouth", ["front", "side"], ["front", "front_three_quarter"], ["back"], ["snout becomes dark nose redesign", "mouth gains teeth", "face turns plush"]],
    ["mouse_cream_belly", "Cream oval belly", ["front"], ["front", "front_three_quarter"], ["back", "tail_root"], ["belly disappears", "belly moves to rear", "belly becomes apron"]],
    ["mouse_green_rear_valve", "Green circular rear blower valve", ["back"], ["rear", "rear_edge"], ["front_belly", "face", "ear", "arm"], ["valve moves to belly", "valve changes color", "valve is hidden"]],
    ["mouse_back_zipper", "Back center zipper", ["back"], ["rear", "rear_edge"], ["front"], ["zipper moves to front", "zipper disappears", "zipper breaks"]],
    ["mouse_tail", "Cream/yellow rear tail", ["back", "side_edge"], ["rear", "side_edge"], ["front_belly"], ["tail disappears", "tail becomes prop", "tail duplicates"]],
    ["mouse_hands_shoes", "Visible human hands/shoes remain separate from suit", ["front", "side"], ["full_body"], ["replaced_by_inflated_mitts"], ["hands become gray mitts", "shoes disappear", "extra hands appear"]],
  ],
  frog: [
    ["frog_top_eyes", "Raised top eyes", ["front", "side"], ["front", "three_quarter"], ["rear"], ["eyes become huge cartoon eyes", "extra eyes appear", "eyes move to belly"]],
    ["frog_face_window", "Small face window", ["front"], ["front", "front_three_quarter"], ["side", "rear"], ["window disappears", "window becomes mouth", "window becomes huge visor"]],
    ["frog_black_mouth_band", "Large black mouth band", ["front"], ["front", "front_three_quarter"], ["back"], ["band becomes thin smile", "band disappears", "band changes to teeth"]],
    ["frog_blue_scarf", "Blue scarf and knot", ["front", "side", "back_edge"], ["front", "three_quarter", "side_edge"], ["new_accessory"], ["scarf changes color", "scarf hides face window", "scarf becomes text banner"]],
    ["frog_orange_rear_valve", "Orange rear blower valve near spine/zipper", ["back"], ["rear", "rear_edge"], ["front_belly", "scarf", "mouth_band", "spots"], ["valve moves to belly", "valve is pasted on scarf", "valve becomes spot"]],
    ["frog_rear_spine_zipper", "Rear black spine pattern and zipper", ["back"], ["rear", "rear_edge"], ["front"], ["rear spine moves to front", "zipper disappears", "spine becomes decoration"]],
    ["frog_webbed_hands_feet", "Webbed hands and feet with floor contact", ["front", "side"], ["full_body"], ["floating_crop"], ["feet become shoes only", "hands become props", "extra toes appear"]],
  ],
  sumo: [
    ["sumo_black_mawashi", "Black mawashi belt and front panel", ["front", "side"], ["front", "front_three_quarter", "side"], ["back_valve"], ["mawashi changes to clothes", "belt disappears", "front panel moves to back"]],
    ["sumo_upper_torso_lines", "Simple upper-torso graphics and belly dot", ["front"], ["front", "front_three_quarter"], ["back"], ["graphics become real muscles", "belly dot becomes valve", "new face graphics appear"]],
    ["sumo_topknot_cap", "Black topknot/cap", ["front", "side", "back"], ["visible_head"], ["new_hair"], ["cap disappears", "hair becomes realistic", "extra topknot appears"]],
    ["sumo_t_side_silhouette", "Wide T-shaped side silhouette", ["left", "right"], ["side", "three_quarter"], ["front_only"], ["arms become long human arms", "body becomes skinny", "side thickness collapses"]],
    ["sumo_back_zipper", "Back center zipper/seam", ["back"], ["rear", "rear_edge"], ["front_stomach"], ["zipper moves to front", "zipper hidden", "zipper becomes decoration"]],
    ["sumo_orange_rear_valve", "Orange circular rear blower valve", ["back", "rear_side"], ["rear", "rear_edge"], ["front_stomach", "mawashi_front", "face"], ["valve moves to stomach", "valve becomes belly button", "valve is covered"]],
    ["sumo_rear_belt", "Rear black belt/loincloth structure", ["back"], ["rear", "rear_edge"], ["front"], ["rear belt disappears", "rear belt becomes clothes", "front/back belt swapped"]],
  ],
  generic: [
    ["generic_front_identity", "Front-owned identity details", ["front"], ["front", "front_three_quarter"], ["rear"], ["front details move to rear", "face/window details disappear"]],
    ["generic_rear_hardware", "Rear/side hardware, zipper, tail or appendage ownership", ["back", "side"], ["rear", "side", "rear_edge"], ["front"], ["hardware moves to front", "tail duplicates", "zipper disappears"]],
    ["generic_material", "Inflatable nylon/PVC material, seams, wrinkles, ports", ["front", "left", "right", "back"], ["visible_surface"], ["smooth_plastic", "plush_fur"], ["material changes", "ports are simplified", "seams disappear"]],
  ],
};

function createStructuredLock([id, label, ownedByViews, allowedAngles, forbiddenPlacements, failureExamples], critical = true) {
  return { id, label, ownedByViews, allowedAngles, forbiddenPlacements, failureExamples, critical };
}

function buildProductLockContract(productType, frontendLockedNodes = []) {
  const family = getProductFamily(productType);
  const stableProductName = getProductStableName(productType);
  const productLocks = (PRODUCT_LOCK_SPECS[family] || PRODUCT_LOCK_SPECS.generic).map((item) => createStructuredLock(item));
  const materialLocks = [
    createStructuredLock([
      `${family}_inflatable_material`,
      "Thin crinkled inflatable nylon/PVC material, seams, wrinkles, zipper teeth, valve rings",
      ["front", "left", "right", "back"],
      ["visible_surface"],
      ["smooth_plastic", "plush_fur", "real_skin", "clean_cgi_shell"],
      ["material becomes smooth plastic", "wrinkles disappear", "seams and valve texture are erased"],
    ]),
    createStructuredLock([
      `${family}_human_scale_envelope`,
      "Human-scale wearable inflatable volume with grounded feet",
      ["front", "left", "right", "back"],
      ["full_body", "front_three_quarter", "side", "rear"],
      ["giant_mascot_shell", "standing_balloon", "skinny_person", "floating_crop"],
      ["body becomes oversized mascot", "feet leave the floor", "human-scale proportions drift"],
    ]),
  ];
  const supplementalLocks = Array.isArray(frontendLockedNodes)
    ? frontendLockedNodes
        .filter((node) => node && typeof node === "object")
        .slice(0, 16)
        .map((node, index) => ({
          id: typeof node.code === "string" && node.code.trim() ? node.code.trim() : `frontend_lock_${index + 1}`,
          label: typeof node.label === "string" ? sanitizeProductText(node.label) : "Frontend confirmed lock",
          detail: typeof node.detail === "string" ? sanitizeProductText(node.detail) : "",
          confidence: Number.isFinite(Number(node.confidence)) ? Number(node.confidence) : undefined,
          critical: node.critical !== false,
        }))
    : [];
  return {
    productType: sanitizeProductText(productType || stableProductName),
    stableProductName,
    family,
    coreViewOrder: CORE_VIEW_LABELS.map(({ code, label }) => ({ code, label })),
    locks: [...productLocks, ...materialLocks],
    supplementalLocks,
    forbiddenContent: ["subtitles", "sign text", "price tags", "CTA text", "logos", "new stickers attached to product"],
    generatedAt: new Date().toISOString(),
  };
}

function formatProductLockContract(contract, maxLocks = 12) {
  const locks = Array.isArray(contract?.locks) ? contract.locks : [];
  const lockLines = locks
    .slice(0, maxLocks)
    .map((lock) => {
      const owned = Array.isArray(lock.ownedByViews) ? lock.ownedByViews.join("/") : "";
      const allowed = Array.isArray(lock.allowedAngles) ? lock.allowedAngles.join("/") : "";
      const forbidden = Array.isArray(lock.forbiddenPlacements) ? lock.forbiddenPlacements.join("/") : "";
      return `- ${lock.id}: ${lock.label}; owned=${owned}; allowed=${allowed}; forbidden=${forbidden}`;
    })
    .join("\n");
  const supplementalLines = Array.isArray(contract?.supplementalLocks)
    ? contract.supplementalLocks
        .slice(0, 8)
        .map((lock) => `- ${lock.id}: ${lock.label}${lock.detail ? `; ${lock.detail}` : ""}`)
        .join("\n")
    : "";
  return [
    `Structured product lock contract for ${contract?.stableProductName || "wearable inflatable product"} (${contract?.family || "generic"}).`,
    lockLines,
    supplementalLines ? `Frontend confirmed lock nodes:\n${supplementalLines}` : "",
    "Forbidden: no subtitles, no signboards, no price tags, no CTA text, no logos, no new stickers, no product redesign.",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildInflatableHardwareMaterialLocks(productType) {
  const family = getProductFamily(productType);
  const backViewAuthority = [
    "BACK_VIEW AUTHORITY HARD LOCK: image_urls[3] is the sole authority for every rear-facing surface. Any frame that reveals the back must copy BACK_VIEW topology, not side-view or front-view details.",
    "When the subject turns, rear-owned components must keep the exact BACK_VIEW position, size, direction, scale, color, spacing, and seam relationship. Never move side/front details onto the back, and never move rear details onto the front or side just to keep them visible.",
  ];
  const hardwareMaps = {
    cow: [
      "COW AIR-HARDWARE MAP: the orange circular blower valve / air inlet / air outlet / pump port belongs on the rear-right/back-side surface at the reference height, with orange ring, circular grille or cap, and local seam relationship preserved. It may appear only from rear or physically valid side-edge angles; never place it on the front lower-belly pad, white belly, snout, face, or black patch as decoration.",
      "COW REAR DETAIL MAP: rear centerline zipper teeth, vertical seam, centered white tail with black tip, and rear-right orange valve must stay separated and correctly ordered on the back surface.",
    ],
    shark: [
      "SHARK BACK_VIEW AUTHORITY: on rear-facing frames, the back must stay a plain muted cyan-blue rear surface with the central vertical back seam, top seam/stripe, centered rear tail fin, both side arm fins at the edges, black shoe soles at the bottom, and only the side-edge orange valve if physically visible. The rear tail fin position, root, size, direction, and outline must match BACK_VIEW exactly.",
      "SHARK BACK_VIEW NEGATIVE: never place the side black eye, the five black gill stripes, the front white belly panel, the transparent face window, or the front zipper on the back. Do not relocate the orange side valve onto the rear tail fin or center back.",
      "SHARK AIR-HARDWARE MAP: the orange circular blower valve / air inlet / air outlet / pump port belongs on the valve-side waist side panel at the same height and direction as the side view, with orange ring and circular mesh/grille or cap preserved. In a front camera it may show only as a thin side-edge detail if physically visible; never move it onto the white belly panel, transparent face window, front zipper, rear tail fin, or gill stripes.",
      "SHARK MATERIAL MAP: preserve muted cyan-blue crinkled nylon/PVC fabric, visible seam tension, white belly stitching edge, zipper teeth, soft slack around fin roots and foot covers, and the slightly underinflated flatter body. Do not smooth the body into glossy plastic, bright blue toy rubber, or a clean CGI shell.",
    ],
    mouse: [
      "MOUSE BACK_VIEW AUTHORITY: on rear-facing frames, the green circular blower valve, center back zipper/seam, cream/yellow tail root, plain gray rear field, separated legs, and foot covers must match BACK_VIEW exactly. The valve position, size, direction, green color, ring, grille/cap detail, and distance from the tail root must not change.",
      "MOUSE BACK_VIEW NEGATIVE: never move the green valve above the tail, onto the tail root, onto the cream belly, onto the face/snout/ears/arms, or onto a side decoration. The tail and valve are separate physical parts and must remain separated and correctly ordered.",
      "MOUSE AIR-HARDWARE MAP: the green circular blower valve / air inlet / air outlet / pump port belongs on the rear/back-side surface from the back view, with green ring and circular grille or cap preserved. It must not be moved to the cream front belly, face, snout, ears, arms, or tail.",
      "MOUSE REAR DETAIL MAP: back centerline zipper teeth, vertical rear seam, green valve, and cream/yellow tail root must remain rear-owned details and should only appear from rear or physically valid side-edge angles.",
    ],
    frog: [
      "FROG AIR-HARDWARE MAP: the orange blower valve / air inlet / air outlet / pump port belongs on the rear/back surface near the black spine/zipper structure, with orange ring and circular grille or cap preserved. It must not be pasted onto the cream belly, blue scarf, face window, mouth band, front upper torso, hands, or spots.",
      "FROG REAR DETAIL MAP: black spine-like rear pattern, zipper teeth, scarf back flap, orange valve, green rear field, and rear fabric wrinkles must stay attached to the back surface only.",
    ],
    sumo: [
      "SUMO AIR-HARDWARE MAP: the orange circular blower valve / air inlet / air outlet / pump port belongs on the rear/back-side surface shown by the back view and support valve image, with orange ring, circular mesh/grille or cap, reference height, and nearby belt/zipper spacing preserved. Never move it to the front stomach, upper-torso lines, belly button, mawashi front panel, face, or arms.",
      "SUMO REAR DETAIL MAP: back centerline zipper teeth, rear black belt/loincloth structure, orange valve, beige rear field, and soft rear nylon folds must remain rear-owned and correctly layered.",
    ],
    generic: [
      "PRODUCT AIR-HARDWARE MAP: every valve, blower valve, air inlet, air outlet, pump port, inflation port, deflation port, fan grille, ring, cap, tube, or zipper belongs exactly to the surface, height, scale, color, and seam relationship shown in the four views.",
    ],
  };

  return [
    "MATERIAL AND AIR-HARDWARE HARD LOCK:",
    ...backViewAuthority,
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
      "Front reference lock: preserve the white cow body, irregular black cow patches, large rounded white cow head, two cream upward curved horns, black outer ears with pink inner ears, small black hair tuft, blue cartoon eyes, black eyebrows, pink snout, two black nostrils, black smile line, pink cheek circles, black hoof gloves, black foot hoof covers, and the pink lower-belly pad centered on the lower front belly with four small pink dots.",
      "Left-side reference lock: preserve the side-view thickness, protruding pink snout, side eye and cheek, horn/ear overlap, side body patches, short padded arm, black hoof glove, black foot cover, visible 155-190cm height-marker proportion, and moderate wearable side volume.",
      "Right-side reference lock: preserve the opposite three-quarter/side silhouette, front lower-belly pad visibility only when physically visible, arm/hoof shape, leg width, black patch placement density, and rounded but human-wearable torso volume.",
      "Back reference lock: preserve the back zipper and central vertical seam from the head down the torso, black patches on the rear head/back/legs, two horns seen from behind, black ears, orange circular blower valve on the rear-right side, centered white rear tail with black tip, separated legs, and black hoof foot covers.",
      "Preset auxiliary support lock: if same-product auxiliary support views are supplied, use them only to refine local nylon wrinkles, seams, zipper teeth, valve ring, patch edges, lower-belly pad protrusions, snout shape, eye graphics, horn fabric, ear fabric, and hoof folds exactly where the core four views say they belong.",
      "VIEW TOPOLOGY LOCK:",
      "FOUR-VIEW REFERENCES ARE TOPOLOGY MAPS, NOT COLLAGE REQUIREMENTS.",
      "PRIMARY CAMERA IS FRONT-FACING BY DEFAULT: use the front reference as the dominant product view for first-frame generation; do not switch to side or rear unless the user explicitly asks for a side or rear view.",
      "Choose one primary camera family before rendering: front, left side, right side, or rear. The generated frame must obey that camera family instead of mixing all reference views into one surface.",
      "Visibility matrix: front camera may show the cow face, horns, ears, black-white front patches, black hoof gloves, black foot covers, and front pink lower-belly pad; side camera may show only the physically visible side thickness, protruding snout, side patches, arm/hoof and partial lower-belly pad if naturally visible; rear camera may show the back zipper, orange rear-side valve, rear tail, rear patches, horns/ears from behind, and no front snout or front lower-belly pad unless the pose is a true turn.",
      "Do not satisfy product consistency by showing all reference details in one generated frame. Product consistency means correct physical placement and preserved shape, not maximum visible details.",
      "Do not merge details from different views into one impossible surface. The front cow face and pink lower-belly pad belong to the front surface. The orange blower valve and rear tail belong to the back/rear-side surface. Back zipper/seam belongs on the rear centerline only, never on the front belly.",
      "For a front three-quarter view, show front cow face and front lower-belly pad plus only a narrow side edge; do not attach the back tail, back zipper, or rear orange valve to the front belly. For a rear view, show the centered rear tail and back zipper; do not show the pink snout, smile, front eyes, or front lower-belly pad on the back.",
      "If the chosen camera angle cannot physically show a locked detail, hide it naturally instead of moving it to a wrong location.",
      "SHAPE AND VOLUME ENVELOPE LOCK:",
      "Preserve the shared four-view HUMAN-BODY ENVELOPE: this is a real person wearing a rounded but compact 155-190cm cow inflatable costume. The inflatable shell is only moderately larger than the wearer; shoulders, torso, waist/hip transition, separated legs, black hoof feet, and soft nylon wrinkles must stay close to the references.",
      "HUMAN-SCALE SIZE LOCK: the cow costume must stay close to the wearer's body scale, not a giant mascot shell. The head height, head width, body width, belly volume, leg width, side thickness, horn size, ear size, lower-belly pad size, and tail length must not grow beyond the references.",
      "Do not enlarge the product into a giant rounded cow head, barrel-shaped torso, oversized standing balloon, theme-park mascot, plush cow, realistic animal, or inflated display prop. If the result looks like a full taut mascot shell instead of a person-sized wearable suit, it is wrong.",
      "Wrinkle density and slight looseness are fidelity markers: keep visible white nylon wrinkles, seam tension, black patch edge texture, and soft fabric slack. Do not smooth the fabric into plastic, rubber, plush, realistic fur, or a clean CGI cow character.",
      "Preserve all product details even when the requested scene changes. The scene may change, but these product marks must remain visible when their side is visible.",
      "Do not remove, move, shrink, recolor, simplify, or invent any product structure. Do not add extra horns, extra ears, real fur, extra legs, extra hands, a different mouth, new logos, accessories, or new decorative graphics.",
      "Do not convert the costume into a generic black-white cow mascot. The blue eyes, pink snout, black smile line, pink cheek circles, front lower-belly pad with four small dots, black hoof gloves, back zipper, orange rear-side blower valve, and centered rear tail are identity-critical.",
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
      "Back reference lock: BACK_VIEW is the only rear topology source. Preserve the plain muted cyan-blue back, central vertical back seam, top seam/stripe, centered blue rear tail fin, both side arm fins, orange valve visible only on the correct side edge, black shoe soles, and wrinkled nylon inflatable fabric. The rear tail fin root, position, size, direction, and outline must match BACK_VIEW exactly.",
      "Preset auxiliary support lock: if same-product auxiliary support views are supplied, use them only to refine local material, zipper, seam, wrinkle, valve, face-window, color-edge, and stitching evidence exactly where the core four views say they belong; never use support views as new decorative graphics or new product surfaces.",
      "VIEW TOPOLOGY LOCK:",
      "FOUR-VIEW REFERENCES ARE TOPOLOGY MAPS, NOT COLLAGE REQUIREMENTS.",
      "PRIMARY CAMERA IS FRONT-FACING BY DEFAULT: use the front reference as the dominant product view for first-frame generation; do not switch to side or rear unless the user explicitly asks for a side or rear view.",
      "Choose one primary camera family before rendering: front, left side, right side, or rear. The generated frame must obey that camera family instead of mixing all reference views into one surface.",
      "Visibility matrix: front camera may show the front belly/window/zipper plus a thin side edge only; left-side camera may show only the structures visible on the left-side reference; right-side camera may show only the structures visible on the right-side reference, including the valve if that is the valve side; rear camera may show only the BACK_VIEW rear tail fin, back seam, plain blue back, side-edge arm fins, black shoe soles, and correct side-edge orange valve if physically visible.",
      "Do not satisfy product consistency by showing all reference details in one generated frame. Product consistency means correct physical placement and preserved shape, not maximum visible details.",
      "Do not merge details from different views into one impossible surface. The front belly/window/zipper belong only to the front-facing surface. Left-side details stay on the left side. Right-side details stay on the right side. The rear tail fin belongs on the back centerline only, never on the front belly or side waist.",
      "For a front three-quarter view, show the front belly/window/zipper and only a narrow side edge; do not attach the back tail fin to the visible side. For a left-side or right-side view, obey that side's reference exactly; the front transparent window may only appear as a thin edge, not as a large side panel. For a rear view, show the centered back tail fin and back seam exactly as BACK_VIEW; do not show the front window, white belly, front zipper, black side eye, or gill stripes on the back.",
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
      "Back reference lock: BACK_VIEW is the only rear topology source. Preserve the center back zipper/seam, green circular blower valve on the back side, cream/yellow tail root, plain gray rear field, separated legs, and foot-cover shape. The green valve position, size, direction, color, ring/grille detail, and spacing from the tail root must match BACK_VIEW exactly.",
      "VIEW TOPOLOGY LOCK:",
      "FOUR-VIEW REFERENCES ARE TOPOLOGY MAPS, NOT COLLAGE REQUIREMENTS.",
      "PRIMARY CAMERA IS FRONT-FACING BY DEFAULT: use the front reference as the dominant product view for first-frame generation unless the user explicitly asks for another angle.",
      "Visibility matrix: front camera may show the mouse face, cream belly, ears, snout, arms, legs, and a thin side edge; side camera may show side thickness and the tail if naturally visible; rear camera may show only BACK_VIEW back zipper, green valve, and tail root. Do not move the green valve above the tail, onto the tail root, onto the side surface, or to the front belly.",
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
      "Front reference lock: preserve the beige/flesh inflatable body, black mawashi belt, black front loincloth panel, simple upper-torso graphics, belly-button dot, rounded head, black topknot/cap, short padded arms, separated legs, and fabric folds.",
      "Side reference lock: preserve the wide T-shaped side silhouette, side thickness, short arm extension, side belt ties, black waist band wrapping around the body, and compact human-scale wearable volume.",
      "Back reference lock: preserve the center back zipper/seam, orange circular blower valve, rear black belt/loincloth structure, beige rear field, separated legs, and rear soft nylon folds.",
      "PRESET AUXILIARY SUPPORT LOCK: if auxiliary sumo valve evidence is supplied, use it only to refine rear/side valve position, belt ties, zipper, and material wrinkles; it is not a new topology surface.",
      "VIEW TOPOLOGY LOCK:",
      "FOUR-VIEW REFERENCES ARE TOPOLOGY MAPS, NOT COLLAGE REQUIREMENTS.",
      "PRIMARY CAMERA IS FRONT-FACING BY DEFAULT: use the front reference as the dominant view unless the user explicitly asks for another angle.",
      "Visibility matrix: front camera may show the black front mawashi, upper-torso lines, belly dot, head cap, arms, and legs; side camera may show the wide T shape and belt ties; rear camera may show the back zipper, orange valve, and rear belt only. Do not move the orange valve or rear zipper onto the front stomach.",
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
    "Do not remove, move, shrink, recolor, simplify, or invent any product structure. If the scene request conflicts with product fidelity, adapt the scene/action to the nearest safe visible version while keeping the product shell and view-correct component placement.",
  ];
}

function buildVideoProductVisualLocks(productType) {
  const family = getProductFamily(productType);
  if (family === "cow") {
    return [
      "MANDATORY COW INFLATABLE COSTUME VISUAL LOCKS:",
      "Keep the white cow body, irregular black patches, large rounded cow head, cream horns, black ears with pink interiors, small black hair tuft, blue cartoon eyes, black eyebrows, pink snout, black nostrils, black smile line, pink cheek circles, black hoof gloves, black foot hoof covers, front pink lower-belly pad with four small pink dots, back zipper, orange rear-side blower valve, centered rear tail with black tip, and nylon wrinkles stable from frame 1 to the final frame.",
      "VIEW TOPOLOGY LOCK:",
      "FOUR-VIEW REFERENCES ARE TOPOLOGY MAPS, NOT COLLAGE REQUIREMENTS.",
      "CONTROLLED VIEW PATH: start from the approved first-frame camera, then allow a small physically valid front-to-three-quarter or brief side/rear glimpse when it helps the user action. Any revealed surface must match the four-view references exactly; do not invent unseen structures.",
      "Maintain view-correct placement through the whole motion. The front cow face and pink lower-belly pad stay on the front surface, the orange blower valve stays on the rear/right-side surface, the back zipper stays on the rear centerline, and the rear tail stays centered on the back only.",
      "REAR TURN HARD LOCK: a controlled body turn is allowed and may reveal the back, but every rear-facing frame must match BACK_VIEW exactly. The rear tail must keep the same centered root, height, length, size, direction, white shape, and black tip from BACK_VIEW; never move it to the side waist, resize it, duplicate it, hide it, or convert it into a different tail. Rear black patches must keep their BACK_VIEW placement and density; do not reshuffle, redraw, simplify, or invent new rear spots during the turn.",
      "When the camera rotates, reveal and hide details according to physical visibility. A detail that is not visible from the current angle must remain hidden, not relocated.",
      "SHAPE AND VOLUME ENVELOPE LOCK:",
      "Maintain the same 155-190cm human-body envelope and low-to-medium inflated cow-costume silhouette through every frame. The costume must not become skinny, deflated, overly tall, overly round, balloon-spherical, muscular, creature-like, mascot-like, plush-like, or realistic-animal-like.",
      "HUMAN-SCALE SIZE LOCK: the cow costume must stay close to the wearer's body scale. Head height, head width, body width, belly volume, horn size, ear size, lower-belly pad size, leg thickness, side thickness, and tail length must not grow beyond the references across any frame.",
      "During motion, volume may wobble slightly like nylon inflatable fabric, but head size, body width, patch placement, snout size, lower-belly pad size, horn size, hoof size, valve position, zipper position, and tail position must remain stable. No swelling, shrinking, melting, stretching, smoothing, or mascot-shell enlargement across frames.",
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
      "CONTROLLED VIEW PATH: start from the approved first-frame camera, then allow a small physically valid front-to-three-quarter or brief side/rear glimpse when it helps the user action. Any revealed surface must match the four-view references exactly; do not invent unseen structures.",
      "Choose one primary camera family before rendering and maintain a physically valid camera path through the motion. The video may reveal or hide product surfaces as the camera/subject moves, but it must never paste details from unrelated views onto the wrong surface.",
      "Visibility matrix: front-facing frames may show the front belly/window/zipper plus a thin side edge only; left-side frames may show only structures visible on the left-side reference; right-side frames may show only structures visible on the right-side reference, including the valve if that is the valve side; rear-facing frames may show only the BACK_VIEW rear tail fin, back seam, plain blue back, side-edge arm fins, black shoe soles, and correct side-edge orange valve if physically visible.",
      "Do not satisfy product consistency by showing all reference details in one generated frame. Product consistency means correct physical placement and preserved shape, not maximum visible details.",
      "Maintain view-correct placement through the whole motion. The front belly/window/zipper stay on the front surface, left-side details stay on the left side, right-side details stay on the right side, and rear tail fin stays on the BACK_VIEW back centerline only; never move a rear tail fin to the side waist, never move the front window onto the side panel, never place side black eye/gill stripes on the back, and never combine front, side, and back details on one flat surface.",
      "REAR TURN HARD LOCK: a controlled body turn is allowed and may reveal the back, but every rear-facing shark frame must match BACK_VIEW exactly. The back must remain a plain muted cyan-blue rear surface with central vertical seam and centered blue rear tail fin. The tail fin position, root, size, direction, and outline must not change. Do not add side gill stripes, side black eye, white belly, transparent window, or front zipper to the back.",
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
      "CONTROLLED VIEW PATH: start from the approved first-frame camera, then allow a small physically valid front-to-three-quarter or brief side/rear glimpse when it helps the user action. Front-visible mouse face and belly stay on the front surface; tail stays rear/side; green valve and back zipper stay on the back only.",
      "REAR TURN HARD LOCK: a controlled body turn is allowed and may reveal the back, but every rear-facing mouse frame must match BACK_VIEW exactly. The green circular valve must keep its BACK_VIEW position, size, direction, color, ring/grille detail, and distance from the tail root. Never move the green valve above the tail, onto the tail root, onto the side surface, onto the cream belly, or into the tail as a decoration.",
      "SHAPE AND VOLUME ENVELOPE LOCK:",
      "Maintain the same human-scale low-to-medium inflated mouse costume through every frame. No swelling into a round mascot, no shrinking, no plush/fur conversion, no realistic animal transformation, no new whiskers, teeth, logos, or accessories.",
    ];
  }
  if (family === "frog") {
    return [
      "MANDATORY FROG INFLATABLE COSTUME VIDEO LOCKS:",
      "Keep the green frog body, raised top eyes, small face window, black mouth band, cream belly/face region, blue scarf, black spots, webbed hands, webbed feet, rear black spine pattern, center back zipper, orange blower valve, and nylon wrinkles stable from frame 1 to the final frame.",
      "VIEW TOPOLOGY LOCK:",
      "CONTROLLED VIEW PATH: start from the approved first-frame camera, then allow a small physically valid front-to-three-quarter or brief side/rear glimpse when it helps the user action. Front face/scarf/belly details stay on the front, side spots stay on the side, rear spine/zipper/orange valve stay on the back.",
      "SHAPE AND VOLUME ENVELOPE LOCK:",
      "Maintain the same human-scale low-to-medium inflated frog suit with separated legs and floor contact. No giant mascot head, no realistic frog, no plush texture, no extra eyes, no new scarf, no new spot pattern, no product swelling or melting across frames.",
    ];
  }
  if (family === "sumo") {
    return [
      "MANDATORY SUMO INFLATABLE COSTUME VIDEO LOCKS:",
      "Keep the beige inflatable body, black mawashi belt, black front loincloth panel, simple upper-torso lines, belly-button dot, rounded head, black topknot/cap, wide T-shaped side silhouette, back zipper, orange circular blower valve, rear belt structure, separated legs, and nylon wrinkles stable from frame 1 to the final frame.",
      "VIEW TOPOLOGY LOCK:",
      "CONTROLLED VIEW PATH: start from the approved first-frame camera, then allow a small physically valid front-to-three-quarter or brief side/rear glimpse when it helps the user action. Front mawashi/upper-torso/belly details stay on the front; side belt ties stay on the side; back zipper and orange valve stay on the rear. Do not move rear hardware onto the front stomach.",
      "SHAPE AND VOLUME ENVELOPE LOCK:",
      "Maintain the same human-scale low-to-medium inflated sumo costume. No real wrestler conversion, no kimono, no baby doll, no giant display balloon, no body swelling, no shrinking, no melting, no new face/hair/clothing/accessories across frames.",
    ];
  }
  return [
    "MANDATORY WEARABLE INFLATABLE PRODUCT VISUAL LOCKS:",
    "Keep the approved first-frame product silhouette, human-scale wearable volume, colors, pattern density, component positions, seams, valves, zipper, face/ornament features, appendages, feet, and material wrinkles stable from frame 1 to the final frame.",
    "VIEW TOPOLOGY LOCK:",
    "FOUR-VIEW REFERENCES ARE TOPOLOGY MAPS, NOT COLLAGE REQUIREMENTS.",
    "CONTROLLED VIEW PATH: start from the approved first-frame camera, then allow a small physically valid front-to-three-quarter or brief side/rear glimpse when it helps the user action. Any revealed surface must match the four-view references exactly.",
    "When motion reveals or hides surfaces, maintain view-correct placement. Hidden details remain hidden until the camera path physically reveals their surface, and then they must appear in their four-view-proven location.",
    "SHAPE AND VOLUME ENVELOPE LOCK:",
    "Maintain the same human-body envelope and low-to-medium inflated four-view silhouette through every frame. No swelling, shrinking, melting, stretching, smoothing, or mascot-shell enlargement across frames.",
  ];
}

function buildFourViewFirstFramePrompt(payload) {
  const scenePrompt = typeof payload.scene_prompt === "string" ? sanitizeProductText(getVisualScriptText(payload.scene_prompt)) : "";
  const productType = typeof payload.product_type === "string" ? sanitizeProductText(payload.product_type) : "wearable inflatable product";
  const firstFrameBrief = extractFirstFrameBriefFromScript(scenePrompt);
  const productAppearsInFirstFrame = firstFrameBrief ? firstFrameBriefMentionsProduct(firstFrameBrief, productType) : true;
  const lockedNodes = Array.isArray(payload.locked_nodes) ? payload.locked_nodes : [];
  const supportImageCount = Number.isFinite(Number(payload.support_image_count)) ? Number(payload.support_image_count) : 0;
  const previousFirstFrameCount = Number.isFinite(Number(payload.previous_first_frame_count)) ? Number(payload.previous_first_frame_count) : 0;
  const reviewFeedback = payload.review_feedback && typeof payload.review_feedback === "object" && !Array.isArray(payload.review_feedback)
    ? payload.review_feedback
    : null;
  const failedChecks = Array.isArray(reviewFeedback?.failed_checks) ? reviewFeedback.failed_checks : [];
  const passedChecks = Array.isArray(reviewFeedback?.passed_checks) ? reviewFeedback.passed_checks : [];
  const nodeLines = formatLockedNodeLines(lockedNodes, 14, 2600, " / ");
  const failedFeedbackLines = failedChecks
    .filter((check) => check && typeof check === "object")
    .map((check) => {
      const id = typeof check.id === "string" ? check.id : "failed-check";
      const label = typeof check.label === "string" ? sanitizeProductText(check.label) : "";
      const detail = typeof check.detail === "string" ? sanitizeProductText(check.detail) : "";
      return `- ${id}${label ? ` (${label})` : ""}: ${detail}`;
    })
    .join("\n");
  const passedFeedbackLines = passedChecks
    .filter((check) => check && typeof check === "object")
    .map((check) => {
      const id = typeof check.id === "string" ? check.id : "passed-check";
      const label = typeof check.label === "string" ? sanitizeProductText(check.label) : "";
      const detail = typeof check.detail === "string" ? sanitizeProductText(check.detail) : "";
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
    "ABSOLUTE NO-READABLE-TEXT RULE: do not render subtitles, captions, title cards, English words, Chinese words, decorative letters, fake glyphs, signs, labels, logos, UI text, stickers, or readable writing anywhere in the image, on the costume, on the background, or floating in the frame. User subtitle and voiceover lines are post-production assets only and must not appear visually.",
    "Generate a single coherent first frame from the earliest scene beat in the user's script, not from the whole script and not from the product reference photos.",
    firstFrameBrief
      ? `FIRST FRAME BRIEF TO RENDER NOW:\n${firstFrameBrief}`
      : "FIRST FRAME BRIEF TO RENDER NOW: use the opening visual situation from the user's script.",
    productAppearsInFirstFrame
      ? "The product appears in this first-frame brief, so include the product in the scripted setting and preserve its identity from the four-view references."
      : "The product does NOT appear in this opening beat. Do not force the product into frame 1. Render the opening party/setup scene exactly as written; use the uploaded product views only as later-video subject references.",
    "Hard fail if the output is a plain white-background catalog shot, transparent cutout, isolated product render, or copied reference pose unless the user explicitly requested that exact catalog look.",
    "The scene, background, lighting, floor contact, and shadows are part of the first-frame task. Preserve product fidelity, but adapt the pose and environment enough that the pasted script is clearly visible in the image.",
    `Product type: ${productType}. It must remain a wearable inflatable costume/product, not a real animal, cartoon mascot, plush toy, redesigned character, or generic prop.`,
    ...buildFirstFrameProductVisualLocks(productType),
    ...buildInflatableHardwareMaterialLocks(productType),
    productAppearsInFirstFrame
      ? "If the scene request conflicts with product fidelity, simplify only the conflicting detail; do not erase the scene. Keep a readable environment and at least one visible action/setup from the user's script."
      : "Because frame 1 is a setup shot without the product, prioritize the opening environment, ordinary-costume people, door/party context, and mood over product-body visibility.",
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
    `VISUAL SCRIPT FOR CONTEXT ONLY, WITH SUBTITLES AND VOICEOVER REMOVED:\n${scenePrompt || "Create a realistic ecommerce short-video setup with a visible story situation, not a studio reference photo."}`,
    productAppearsInFirstFrame
      ? "Composition rule: full product body visible for the chosen camera, no crop of physically visible feet, face/head details, zipper, valve, appendages, front lower-belly pad, fins, tail, horns, ears, or other identity-critical components. Make it a usable first frame for a short video: the product is in the scripted scene and ready to continue into motion."
      : "Composition rule: render the first beat as a party/setup establishing shot. Show ordinary Halloween costumes, people chatting, and the relevant doorway/room context if present. Do not show later-beat product entrance, slow walk, dancing, close-up, or finale pose in frame 1.",
  ].join("\n\n");
}

function extractFirstFrameBriefFromScript(script) {
  const text = typeof script === "string" ? script.trim() : "";
  if (!text) return "";
  const normalized = text.replace(/\r\n/g, "\n");
  const timedBlockMatch = normalized.match(/(?:^|\n)\s*(?:\d+\s*[-~到至]\s*\d+\s*秒|第\s*\d+\s*[-~到至]\s*\d+\s*秒)[\s\S]*?(?=(?:\n\s*(?:\d+\s*[-~到至]\s*\d+\s*秒|第\s*\d+\s*[-~到至]\s*\d+\s*秒))|$)/);
  const candidate = (timedBlockMatch?.[0] || normalized).trim();
  return truncateTextByChars(candidate, 700);
}

function firstFrameBriefMentionsProduct(brief, productType) {
  const text = `${brief || ""} ${productType || ""}`.toLowerCase();
  const briefOnly = String(brief || "").toLowerCase();
  const productWords = String(productType || "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 2);
  const explicitProductTerms = [
    "充气服",
    "inflatable",
    "shark",
    "鲨鱼",
    "cow",
    "奶牛",
    "mouse",
    "老鼠",
    "frog",
    "青蛙",
    "sumo",
    "相扑",
  ];
  return explicitProductTerms.some((term) => briefOnly.includes(term)) || productWords.some((word) => briefOnly.includes(word)) || /this guy showed up|主角登场|mvp/i.test(text);
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
  const modelLimits = getImageModelLimit(upstreamPayload.model);
  const promptText = fitPromptToLimit(
    [
      buildFourViewFirstFramePrompt({
        scene_prompt,
        product_type,
        locked_nodes,
        support_image_count: readableSupportImages.length,
        previous_first_frame_count: previousFirstFrameUrl ? 1 : 0,
        review_feedback,
      }),
    ],
    modelLimits.maxPromptChars,
  );
  return {
    ...upstreamPayload,
    image_urls: [...readableImages, ...readableSupportImages, ...(previousFirstFrameUrl ? [previousFirstFrameUrl] : [])],
    previous_first_frame_count: previousFirstFrameUrl ? 1 : 0,
    prompt: sanitizeProductText(promptText),
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
        "COW VIDEO ANCHOR: do not use video quality enhancement to enlarge the cow head, smooth patch edges, redesign the snout/lower-belly pad/hoof covers, hide real shoes or hands, or convert the approved first frame into a cleaner mascot suit.",
        "COW HARD FAIL DETAILS: preserve horns, ears, black patch layout, pink snout, pink lower-belly pad, hoof gloves/feet, rear zipper, orange rear-side blower valve, centered tail, visible human-scale stance, and nylon wrinkles. No new cartoon face, no patch repaint, no lower-belly pad relocation, no hoof enlargement, no tail/valve on the front, and no giant round cow mascot shell.",
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
        "SUMO HARD FAIL DETAILS: preserve the black mawashi belt, front loincloth panel, belly-button dot, simple upper-torso lines, black topknot/cap, wide side T silhouette, rear zipper, rear orange blower valve, rear belt structure, separated legs, and nylon wrinkles. No real wrestler body, no kimono, no baby-doll redesign, no new face/hair/accessories, no rear hardware on the front belly, and no giant round display balloon.",
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
    "POSE AND CONTACT CONTINUITY: frame 1 starts from the approved first frame, but arms, head direction, shoulders, nearby props, and a small body pivot may change enough to complete the user action. Preserve product identity, surface ownership, scale, and floor contact while allowing the pose to evolve visibly.",
    "Quality rule: higher resolution, sharper lighting, denoising, cinematic polish, or video enhancement may improve only compression/background clarity. It must not improve the product by changing shape, proportions, texture, facial graphics, hands, feet, bag/object labels, material wrinkles, seams, zipper teeth, valve rings, or pose.",
    "Comedy story is required, not optional: the clip must show a visible three-beat gag, a misunderstanding or prop reaction, a pause, and a small twist. Product fidelity and comedy must coexist; do not remove the gag just to make the product stand still.",
    "Motion must be visible but controlled: allow a clear arm gesture, elastic side-to-side wobble, small recoil, half-step slide, prop interaction, and a freeze-frame style pause. Keep any existing hand-to-object contact, reaching hand, held bag, visible shoes, tail, valve, and body outline physically plausible while still performing the gag.",
    "MOTION COMPLETION RANGE: keep the face window and zipper readable and mostly upright, but allow a controlled front-to-three-quarter or brief side/back glimpse when the four-view references prove that surface and the action needs it. Feet may stay planted or slide a short half-step; no jump, run, fall, full spin, or product-obscuring dance routine.",
    "Strict preservation rule: if frame 1 or any later frame looks like a newly generated cleaner product rather than the approved product performing the requested scene, the video is wrong. Also wrong: a nearly static first-frame micro-animation that drops the user's action beats.",
    ...familyLocks,
  ];
}

function sanitizeVideoPromptText(text) {
  return sanitizeProductText(text)
    .replace(/steal|stolen|attack|violence|danger|injury|fight|chase|escape|explode/gi, "safe playful beat")
    .trim();
}

function sanitizeUpstreamVideoPromptText(text) {
  return sanitizeProductText(text)
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
  return status === 400 && /InputTextSensitiveContentDetected|sensitive information|sensitive content|鏁忔劅/i.test(text);
}

function buildSensitiveSafeVideoActionPrompt(payload) {
  const productType = typeof payload.product_type === "string" && payload.product_type.trim() ? sanitizeProductText(payload.product_type) : "current inflatable product";
  const source = sanitizeVideoPromptText(typeof payload.action_prompt === "string" ? getVisualScriptText(payload.action_prompt) : "");
  const scene = sanitizeVideoPromptText(typeof payload.scene_prompt === "string" ? getVisualScriptText(payload.scene_prompt) : "");
  return [
    `Generate a safe ecommerce short video for ${productType}.`,
    source ? `Keep the intended gentle action direction: ${source}` : "Use only small safe movements: slight wobble, slow hand gesture, pause, and soft recoil.",
    scene ? `Keep the original scene context: ${scene}` : "Keep the original scene and visible props from the first frame.",
    "Do not add violence, danger, chase, fall, explosion, or aggressive motion. Product identity and first-frame consistency are highest priority.",
  ].join("\n");
}

function createSensitiveSafeVideoPayload(payload) {
  return {
    ...payload,
    sensitive_safe_retry: true,
    action_prompt: buildSensitiveSafeVideoActionPrompt(payload),
    scene_prompt: sanitizeVideoPromptText(getVisualScriptText(payload.scene_prompt)),
  };
}

function neutralizeVideoSafetyFalsePositiveTerms(text) {
  return String(text || "")
    .replace(/steal|stolen|attack|violence|danger|injury|fight|chase|escape|explode/gi, "safe playful beat")
    .trim();
}

function buildSensitiveSafeProductVideoPrompt(payload) {
  const productType = typeof payload.product_type === "string" && payload.product_type.trim() ? sanitizeProductText(payload.product_type) : "current inflatable product";
  const actionPrompt = neutralizeVideoSafetyFalsePositiveTerms(sanitizeVideoPromptText(typeof payload.action_prompt === "string" ? getVisualScriptText(payload.action_prompt).trim() : ""));
  const scenePrompt = neutralizeVideoSafetyFalsePositiveTerms(sanitizeVideoPromptText(typeof payload.scene_prompt === "string" ? getVisualScriptText(payload.scene_prompt).trim() : ""));
  const stableProductName = getProductStableName(productType);
  return [
    `Generate a light daily ecommerce short video from the uploaded first frame. The subject is always ${stableProductName}.`,
    scenePrompt ? `Keep the first-frame scene and visible props: ${scenePrompt}` : "Keep the first-frame scene and visible props.",
    actionPrompt ? `Action direction: ${actionPrompt}` : "Action direction: gentle wobble, small hand gesture, pause, and soft playful reaction.",
    "Do not render any subtitle, caption, title, sign, logo, label, decorative word, random glyph, or readable text. Subtitles and voiceover are added later in post-production only.",
    "Use only controlled small motion. Keep the face window and zipper mostly vertical and feet grounded; allow a slight three-quarter, side, or brief rear glimpse only when the four-view topology proves that surface and the action needs it. No jump, no cut, no full spin.",
    "Preserve product identity, silhouette, colors, material wrinkles, wearer proportions, hands, shoes, zipper, valves, tail/ears/fins/scarf/belt, and all visible first-frame contacts.",
  ].join("\n\n");
}

function summarizeVideoLockedNodes(lockedNodes, maxLines = 8) {
  if (!Array.isArray(lockedNodes)) return "";
  return lockedNodes
    .filter((node) => node && typeof node === "object")
    .slice(0, maxLines)
    .map((node) => {
      const label = typeof node.label === "string" ? sanitizeProductText(node.label) : "";
      const detail = typeof node.detail === "string" ? sanitizeProductText(node.detail) : "";
      return [label, detail].filter(Boolean).join(": ");
    })
    .filter(Boolean)
    .join("; ");
}

function compactProductFeatureLock(productType) {
  return `Product feature lock for ${getProductStableName(productType)}: preserve the approved first-frame silhouette, colors, facial/window details, zipper, valve, tail/ears/fins/scarf/belt, hands, shoes, wearer proportions, and fabric wrinkles. Do not beautify into a new mascot or add new components.`;
}

function truncateTextByChars(text, maxChars) {
  const value = String(text || "").trim();
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - 16)).trim()}...`;
}

function fitPromptToLimit(parts, maxChars) {
  const cleanParts = parts.map((part) => String(part || "").trim()).filter(Boolean);
  let result = cleanParts.join("\n\n").trim();
  if (result.length <= maxChars) return result;
  const fitted = [];
  for (const part of cleanParts) {
    const next = [...fitted, part].join("\n\n").trim();
    if (next.length <= maxChars) {
      fitted.push(part);
      continue;
    }
    const remaining = maxChars - fitted.join("\n\n").length - (fitted.length ? 2 : 0);
    if (remaining > 60) fitted.push(truncateTextByChars(part, remaining));
    break;
  }
  return fitted.join("\n\n").trim().slice(0, maxChars);
}

function buildCompactShishiProductVideoPrompt(payload) {
  const actionPrompt = truncateTextByChars(sanitizeVideoPromptText(typeof payload.action_prompt === "string" ? getVisualScriptText(payload.action_prompt).trim() : ""), 1200);
  const scenePrompt = truncateTextByChars(sanitizeVideoPromptText(typeof payload.scene_prompt === "string" ? getVisualScriptText(payload.scene_prompt).trim() : ""), 650);
  const productType = typeof payload.product_type === "string" && payload.product_type.trim() ? sanitizeProductText(payload.product_type) : "current inflatable product";
  const stableProductName = getProductStableName(productType);
  const motionRule = typeof payload.motion_rule === "string" ? payload.motion_rule.trim() : "";
  const lockedSummary = truncateTextByChars(summarizeVideoLockedNodes(payload.locked_nodes), 900);
  const hasFourViews = Array.isArray(payload.image_urls) && payload.image_urls.filter((item) => typeof item === "string" && item.trim()).length === 4;
  const supportSource = Array.isArray(payload.support_image_urls) ? payload.support_image_urls : payload.detail_image_urls;
  const supportCount = Array.isArray(supportSource) ? supportSource.filter((item) => typeof item === "string" && item.trim()).length : 0;
  const parts = [
    `Generate a same-scene ecommerce short video from the uploaded first frame. The subject is always ${stableProductName}; frame 1 must preserve product shape, pose, color, face/window/zipper, hands, feet contact, props, and background placement.`,
    actionPrompt ? `User action and small gag to prioritize: ${actionPrompt}` : "Action requirement: show 2-3 clear but small daily comedy beats with a pause and a tiny twist, not only standing or breathing.",
    scenePrompt ? `Scene continuity: ${scenePrompt}` : "Scene continuity: keep the original location, camera, and visible props from the first frame.",
    "No readable text rule: subtitles, captions, title cards, signs, logos, labels, decorative letters, and random glyphs must not appear in the frame or on the product. Voiceover and subtitles are post-production assets only.",
    compactProductFeatureLock(productType),
    hasFourViews ? `Four-view topology is only a product placement contract. Support views: ${supportCount}. The approved first frame is the direct video visual input.` : "If four-view metadata is incomplete, treat the approved first frame as the only direct visual anchor.",
    lockedSummary ? `Confirmed lock nodes: ${lockedSummary}` : "",
    "Camera rule: stable ecommerce shot, full body visible, no cuts, no fast zoom. Start from the approved first-frame view, then allow a controlled three-quarter, side, or brief rear glimpse when the user action needs it and the four-view topology proves that surface.",
    "Motion rule: face window and zipper stay readable and mostly upright; feet remain grounded or make a short slide. Arm/hand, head direction, prop interaction, and a controlled body turn or pivot may be visible enough to complete the gag. No jump, run, fall, uncontrolled full spin, or product-obscuring prop.",
    motionRule ? `Extra motion boundary: ${motionRule}` : "",
    "Balance rule: product identity and user action both must survive. Preserve silhouette, proportions, colors, wrinkles, hands, shoes, zipper, valves, tail/ears/fins/scarf/belt, and view-correct component placement, but do not drop the requested action into a nearly static first-frame micro-animation.",
  ];
  return fitPromptToLimit(parts, SHISHI_PROMPT_SOFT_LIMIT);
}

function buildProductVideoPrompt(payload) {
  const actionPrompt = sanitizeVideoPromptText(typeof payload.action_prompt === "string" ? getVisualScriptText(payload.action_prompt).trim() : "");
  const scenePrompt = typeof payload.scene_prompt === "string" ? sanitizeProductText(getVisualScriptText(payload.scene_prompt)) : "";
  const productType = typeof payload.product_type === "string" ? sanitizeProductText(payload.product_type) : "wearable inflatable product";
  const motionRule = typeof payload.motion_rule === "string" ? sanitizeProductText(payload.motion_rule) : "Keep motion small and product-safe.";
  const lockedNodes = Array.isArray(payload.locked_nodes) ? payload.locked_nodes : [];
  const readableImages = Array.isArray(payload.image_urls)
    ? payload.image_urls.filter((item) => typeof item === "string" && item.trim())
    : [];
  const supportSource = Array.isArray(payload.support_image_urls) ? payload.support_image_urls : payload.detail_image_urls;
  const readableSupportImages = Array.isArray(supportSource)
    ? supportSource.filter((item) => typeof item === "string" && item.trim())
    : [];
  const nodeLines = formatLockedNodeLines(lockedNodes, 10, 2000, " / ");
  const actionFallback =
    "Use a clear three-beat ecommerce comedy motion: notice a small prop, react half a beat too seriously, freeze for a tiny twist, then recover with a soft inflatable wobble.";
  const requiredMotionBeats = actionPrompt || actionFallback;

  return [
    `REQUIRED USER MOTION BEATS. These beats must be visible before any generic idle display:\n${requiredMotionBeats}`,
    "Do not replace the user-named subject, scene, or props from the motion beats. Preserve named scene items as visible context when they are safe: laundry room, drum washer, blue basket, coin machine, waiting gesture, foot taps, tiny arm sway, glance, restrained pointing, or the user's equivalent props.",
    "The final video cannot be only standing, breathing, or barely swaying. It must show 2-3 small readable action beats while preserving product fidelity.",
    "ABSOLUTE NO-READABLE-TEXT RULE: do not render subtitles, captions, title cards, English words, Chinese words, fake letters, random glyphs, signs, logos, labels, UI text, stickers, or readable writing anywhere in the scene, on the costume, on walls, on props, or floating in frame. The pasted subtitle and voiceover copy is for post-production only and must not be visualized by the video model.",
    "HIGHEST PRIORITY PRODUCT CONSISTENCY VIDEO CONTRACT.",
    "FOUR-VIEW PRODUCT TOPOLOGY CONTRACT. Approved first frame is the direct video starting frame. The uploaded core views are allowed topology evidence for controlled camera/pose changes: front, left side, right side, and back may be revealed only when the motion path physically reaches that surface and only with view-correct placement.",
    readableImages.length === 4
      ? `Four-view metadata supplied:\n${CORE_VIEW_INPUT_ORDER}\nPreset auxiliary support views supplied: ${readableSupportImages.length}.`
      : "Four-view metadata is incomplete in the video request, so preserve the approved first frame and do not introduce any new product angle.",
    "Animate the exact same product only. The video may change pose, arm/head direction, prop contact, and a controlled camera/subject angle; the product identity must stay consistent: no silhouette drift, no proportion drift, no missing detail, no invented detail, no material change, and no style reinterpretation.",
    `Product type: ${productType}. It must remain the same wearable inflatable product throughout the video.`,
    "Preserve all identity-critical product details from frame 1 to the final frame. Do not redesign, simplify, restyle, recolor, or reinterpret the product.",
    ...buildVideoFirstFramePixelAnchorLocks(productType),
    ...buildVideoProductVisualLocks(productType),
    ...buildInflatableHardwareMaterialLocks(productType),
    nodeLines ? `Confirmed locked details:\n${nodeLines}` : "Confirmed locked details: preserve every visible product structure from the references.",
    "ACTION OBJECT GUARDRAIL: the action prompt may introduce or animate handheld props and scene props. Props must stay visually separate from the costume shell and must not obscure or rewrite hands, shoes, face/window/mouth details, valves, zipper, tail/fins/ears/scarf/belt, seams, wrinkles, colors, or body silhouette.",
    "VIDEO QUALITY GUARDRAIL: model, resolution, HD, high quality, cinematic, clearer, sharper, pro, or quality settings must never change product identity. Quality is allowed only after the exact first-frame product geometry, colors, components, material wrinkles, ports, zipper, hands, shoes, and pose remain unchanged.",
    `COMEDY ACTION BRIEF, SAME PRIORITY AS SCENE CONTINUITY:\n${requiredMotionBeats}`,
    "COMEDY PACING REQUIREMENT: show the gag visually in 2-3 readable beats. At least one beat must be a visible reaction or prop interaction, not just breathing, idle swaying, or a static product display.",
    `Scene continuity:\n${scenePrompt || "Keep the approved first-frame scene."}`,
    `Motion rule:\n${motionRule}`,
    "Camera rule: stable ecommerce shot, full body visible, no cuts, no fast zoom. Start from the approved first frame, then allow a controlled front-to-three-quarter, side, or brief rear glimpse when it helps complete the requested action. Do not reveal any surface that is not proven by the four-view references.",
    "Four-view use in video: the four product views are topology evidence for physically valid camera paths, not collage ingredients. They permit showing side/back surfaces only with correct placement: valves, tails, zippers, fins, patches, belts, scarves, shoes, and hardware must stay on their proven surface.",
    "TURN / BACK_VIEW CONTRACT: if the requested video includes a turn, the turn is allowed, but every rear-facing moment must obey BACK_VIEW as the absolute source of truth. Rear tail position, size, length, direction, root location, and black tip must not change. Rear patch placement must not be reshuffled. Back zipper/seam and rear hardware must stay in their BACK_VIEW locations.",
    "Negative: no quality-upscale redraw, no beautified mascot replacement, no cleaner cartoon head, no pose reblocking that changes the costume, no handheld prop motion that rewrites product hands or body geometry, no moved fan valve, no missing face/head detail, no broken tail, no duplicated appendages, no body deformation, no skinny body, no overinflated balloon body, no smooth plastic surface, no realistic animal skin, no plush toy, no new logo attached to the product, no new accessory attached to the product shell.",
    "If a requested action would damage product fidelity, adapt the action to the nearest safe visible version while preserving the action beat; do not ignore it or collapse the clip into idle swaying.",
  ].join("\n\n");
}

function buildVideoPayload(payload, options = {}) {
  const {
    action_prompt,
    scene_prompt,
    product_type,
    locked_nodes,
    motion_rule,
    image_urls,
    support_image_urls,
    detail_image_urls,
    story_intent,
    storyIntent,
    storyboards,
    video_execution_package,
    videoExecutionPackage,
    selectedStoryboards,
    productLockContract,
    preflight,
    prompt,
    ...upstreamPayload
  } = payload;
  const model = typeof upstreamPayload.model === "string" && upstreamPayload.model.trim() ? upstreamPayload.model.trim() : VIDEO_MODEL;
  const provider = typeof payload.video_provider === "string" ? payload.video_provider.trim().toLowerCase() : "";
  const modelLimit = getVideoModelLimit(provider, model);
  const useSensitiveSafePrompt = Boolean(upstreamPayload.sensitive_safe_retry);
  const useCompactShishiPrompt = Boolean(options.compactShishiPrompt);
  const rawPrompt = sanitizeUpstreamVideoPromptText(
    useSensitiveSafePrompt
      ? buildSensitiveSafeProductVideoPrompt({ action_prompt, scene_prompt, product_type })
      : useCompactShishiPrompt
        ? buildCompactShishiProductVideoPrompt({ action_prompt, scene_prompt, product_type, locked_nodes, motion_rule, image_urls, support_image_urls, detail_image_urls })
      : buildProductVideoPrompt({ action_prompt, scene_prompt, product_type, locked_nodes, motion_rule, image_urls, support_image_urls, detail_image_urls }),
  );
  const promptLimit = useCompactShishiPrompt ? Math.min(modelLimit.promptSoftLimit, SHISHI_PROMPT_SOFT_LIMIT) : modelLimit.promptSoftLimit;
  const fittedPrompt = fitPromptToLimit([rawPrompt], promptLimit);
  return {
    ...upstreamPayload,
    ...(model ? { model } : {}),
    duration: clampNumber(upstreamPayload.duration, modelLimit.minDuration, modelLimit.maxDuration, modelLimit.minDuration),
    resolution: modelLimit.resolution || upstreamPayload.resolution,
    prompt: fittedPrompt,
    model_limits: modelLimit,
    prompt_summary: {
      promptChars: fittedPrompt.length,
      promptLimit: modelLimit.promptHardLimit,
      promptSoftLimit: promptLimit,
      promptCompacted: fittedPrompt.length < rawPrompt.length || useCompactShishiPrompt,
    },
  };
}

function createVideoPayloadSummary(payload, upstreamUrl, provider = "") {
  const model = typeof payload?.model === "string" ? payload.model : "";
  const providerKey = resolveVideoProviderFromUrl(upstreamUrl, provider);
  const modelLimit = getVideoModelLimit(providerKey, model);
  const prompt = typeof payload?.prompt === "string" ? payload.prompt.trim() : "";
  const submittedDuration = resolveSubmittedVideoDuration(payload, upstreamUrl);
  const requestedDuration = Number.isFinite(Number(payload?.requested_duration)) ? Number(payload.requested_duration) : Number(payload?.duration);
  return {
    durationSummary: {
      requestedDuration,
      submittedDuration,
      providerDurationFixed: isWisechVideoUrl(upstreamUrl),
      minDuration: modelLimit.minDuration,
      maxDuration: modelLimit.maxDuration,
    },
    promptSummary: {
      promptChars: prompt.length,
      promptLimit: modelLimit.promptHardLimit,
      promptSoftLimit: modelLimit.promptSoftLimit,
      promptCompacted: Boolean(payload?.prompt_summary?.promptCompacted),
    },
    modelLimits: {
      provider: providerKey,
      model,
      ...modelLimit,
    },
  };
}

async function proxyVideoSafety(payload) {
  const baseConfig = pickProxyConfig(payload, OPENAI_VIDEO_GENERATIONS_PATH, "video");
  const isShishiVideoRequest = isShishiKejiUrl(baseConfig.upstreamUrl);
  const videoPayload = buildVideoPayload(payload, { compactShishiPrompt: isShishiVideoRequest });
  const { apiKey, upstreamUrl, upstreamPayload } = pickProxyConfig(videoPayload, OPENAI_VIDEO_GENERATIONS_PATH, "video");
  const prompt = typeof upstreamPayload.prompt === "string" ? upstreamPayload.prompt.trim() : "";
  const { durationSummary, promptSummary, modelLimits } = createVideoPayloadSummary(upstreamPayload, upstreamUrl, payload?.video_provider);
  if (!apiKey) {
    return { status: 400, payload: { ok: false, verdict: "blocked", reason: "Video service API key is not configured.", safePrompt: buildSensitiveSafeVideoActionPrompt(payload), durationSummary, promptSummary, modelLimits } };
  }
  if (prompt.length > modelLimits.promptHardLimit) {
    return { status: 400, payload: { ok: false, verdict: "blocked", reason: `Full video prompt is still too long: ${prompt.length} chars; limit is ${modelLimits.promptHardLimit}.`, safePrompt: buildSensitiveSafeVideoActionPrompt(payload), promptPreview: prompt.slice(0, 500), durationSummary, promptSummary, modelLimits } };
  }
  const moderationUrl = (() => {
    try {
      const parsed = new URL(upstreamUrl);
      parsed.pathname = parsed.pathname.replace(/\/video\/generations\/?$/i, "/moderations").replace(/\/videos\/generations\/?$/i, "/moderations");
      if (!/\/moderations\/?$/i.test(parsed.pathname)) parsed.pathname = `${parsed.pathname.replace(/\/+$/, "")}/moderations`;
      parsed.search = "";
      return parsed.toString();
    } catch {
      return "";
    }
  })();
  if (!moderationUrl || isShishiKejiUrl(upstreamUrl) || isToapisUrl(upstreamUrl) || isKlingVideoUrl(upstreamUrl)) {
    return { status: 200, payload: { ok: true, verdict: "skipped", reason: "No moderation endpoint is available for this provider.", upstreamUrl, promptPreview: prompt.slice(0, 500), durationSummary, promptSummary, modelLimits } };
  }
  const response = await fetch(moderationUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "omni-moderation-latest", input: prompt }),
  });
  const text = await response.text();
  const data = parseUpstreamBody(text, response.status);
  if (!response.ok) {
    return { status: 200, payload: { ok: true, verdict: "skipped", reason: `Moderation endpoint returned ${response.status}; continuing with provider request.`, upstreamUrl: moderationUrl, upstreamStatus: response.status, promptPreview: prompt.slice(0, 500), durationSummary, promptSummary, modelLimits } };
  }
  const results = Array.isArray(data?.results) ? data.results : [];
  const flagged = results.some((item) => item && typeof item === "object" && item.flagged === true);
  if (flagged) {
    return { status: 200, payload: { ok: false, verdict: "blocked", reason: "Moderation flagged the video prompt.", categories: results[0]?.categories || {}, categoryScores: results[0]?.category_scores || {}, safePrompt: buildSensitiveSafeVideoActionPrompt(payload), promptPreview: prompt.slice(0, 500), durationSummary, promptSummary, modelLimits } };
  }
  return { status: 200, payload: { ok: true, verdict: "passed", reason: "Video prompt passed moderation.", upstreamUrl: moderationUrl, promptPreview: prompt.slice(0, 500), durationSummary, promptSummary, modelLimits } };
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

function isShishiKejiUrl(url) {
  try {
    return new URL(url).hostname === "api.shishikeji.com";
  } catch {
    return false;
  }
}

function isWisechVideoUrl(url) {
  try {
    return new URL(url).hostname === "ai.wisech.com";
  } catch {
    return false;
  }
}

function isKlingVideoUrl(url) {
  try {
    const hostname = new URL(url).hostname;
    return hostname === "api-singapore.klingai.com" || hostname === "api.klingai.com" || hostname.endsWith(".klingai.com");
  } catch {
    return false;
  }
}

function isToapisUrl(url) {
  try {
    return new URL(url).hostname === "toapis.com";
  } catch {
    return false;
  }
}

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

function getSeedanceDurationCap(model) {
  const text = typeof model === "string" ? model.toLowerCase() : "";
  if (text.includes("1-5") || text.includes("1.5")) return { min: 4, max: 12 };
  if (text.includes("2-0") || text.includes("2.0") || text.includes("yunshu")) return { min: 4, max: 15 };
  return { min: 4, max: 15 };
}

function resolveSubmittedVideoDuration(payload, upstreamUrl) {
  const provider = resolveVideoProviderFromUrl(upstreamUrl, payload?.video_provider);
  const limit = getVideoModelLimit(provider, payload?.model);
  if (limit) return clampNumber(payload?.duration, limit.minDuration, limit.maxDuration, limit.minDuration);
  return Number.isFinite(Number(payload?.duration)) ? Number(payload.duration) : WISECH_DEFAULT_VIDEO_DURATION_SECONDS;
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

function extractUploadedImageUrl(value) {
  if (!value || typeof value !== "object") return "";
  const record = value;
  for (const key of ["url", "image_url", "download_url", "public_url"]) {
    if (typeof record[key] === "string" && /^https?:\/\//i.test(record[key])) return record[key];
  }
  if (record.data && typeof record.data === "object" && !Array.isArray(record.data)) {
    const nested = extractUploadedImageUrl(record.data);
    if (nested) return nested;
  }
  if (Array.isArray(record.data)) {
    for (const item of record.data) {
      const nested = extractUploadedImageUrl(item);
      if (nested) return nested;
    }
  }
  return "";
}

async function uploadToapisDataImage(dataImageUrl, apiKey) {
  const { blob, fileName } = await imageUrlToBlob(dataImageUrl, 0);
  if (blob.size > TOAPIS_MAX_UPLOAD_IMAGE_BYTES) {
    throw new Error("The approved first frame is larger than 10 MB after conversion. Please regenerate or compress it before creating video.");
  }
  const form = new FormData();
  form.append("file", blob, fileName);
  form.append("purpose", "vision");
  const upstreamUrl = `${TOAPIS_BASE_URL}${TOAPIS_IMAGE_UPLOAD_PATH}`;
  const response = await fetch(upstreamUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });
  const text = await response.text();
  const data = parseUpstreamBody(text, response.status);
  if (!response.ok) {
    throw new Error(toPublicErrorMessage(text || getUpstreamErrorText(data)));
  }
  const uploadedUrl = extractUploadedImageUrl(data);
  if (!uploadedUrl) {
    throw new Error("Image upload succeeded but no public image URL was returned.");
  }
  return uploadedUrl;
}

async function normalizeOpenAICompatibleVideoPayload(payload, upstreamUrl, apiKey) {
  const firstFrameUrl = getVideoFirstFrameUrl(payload);
  if (!firstFrameUrl.startsWith("data:image/")) return payload;
  const uploadApiKey = isToapisUrl(upstreamUrl) ? apiKey : TOAPIS_API_KEY;
  if (!uploadApiKey) {
    throw new Error("This video provider does not accept base64 first-frame images, and ToAPI image upload is not configured. Please use a public http(s) image URL for the approved first frame.");
  }
  return {
    ...payload,
    image_url: await uploadToapisDataImage(firstFrameUrl, uploadApiKey),
  };
}

function normalizeVideoResolution(value) {
  return typeof value === "string" ? value.toLowerCase().replace("1080p", "1080p").replace("720p", "720p") : "1080p";
}

function stripInternalPayloadFields(payload) {
  if (!payload || typeof payload !== "object") return {};
  const {
    model_limits,
    prompt_summary,
    story_intent,
    storyIntent,
    storyboards,
    video_execution_package,
    videoExecutionPackage,
    selectedStoryboards,
    productLockContract,
    preflight,
    ...rest
  } = payload;
  return rest;
}

function buildVolcengineVideoPayload(payload) {
  payload = stripInternalPayloadFields(payload);
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
  payload = stripInternalPayloadFields(payload);
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

function pickReadableVideoImages(value, limit = 8) {
  return Array.isArray(value)
    ? value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item) => /^https?:\/\//i.test(item) || item.startsWith("data:image/"))
        .slice(0, limit)
    : [];
}

function buildKlingShotPrompts(payload, prompt, duration) {
  const rawStoryboards = Array.isArray(payload.storyboards) ? payload.storyboards : [];
  const storyboards = rawStoryboards
    .filter((item) => item && typeof item === "object")
    .filter((item) => item.kind === "shot" || item.useAsShot === true)
    .slice(0, 6);
  if (!storyboards.length) return [];
  const totalDuration = clampNumber(duration, 3, 15, 5);
  const baseDuration = Math.max(1, Math.floor(totalDuration / storyboards.length));
  let remaining = totalDuration;
  return storyboards.map((storyboard, index) => {
    const slotsLeft = storyboards.length - index;
    const shotDuration = index === storyboards.length - 1 ? remaining : Math.max(1, Math.min(baseDuration, remaining - (slotsLeft - 1)));
    remaining -= shotDuration;
    const beat = typeof storyboard.beat === "string" ? storyboard.beat.trim() : "";
    const action = typeof storyboard.action === "string" ? storyboard.action.trim() : "";
    const viewAngle = typeof storyboard.viewAngle === "string" ? storyboard.viewAngle.trim() : "";
    const shotPrompt = truncateTextByChars(
      [
        beat ? `Beat: ${beat}.` : "",
        action ? `Action: ${action}.` : "",
        viewAngle ? `Camera/view: ${viewAngle}.` : "",
        "No readable text in the image: no subtitles, captions, title cards, signs, logos, labels, letters, fake glyphs, or writing on the product/background. Subtitles and voiceover are added later in post-production.",
        "Keep the inflatable product identical to <<<image_1>>> and use <<<image_2>>> <<<image_3>>> <<<image_4>>> <<<image_5>>> only as product topology references.",
      ]
        .filter(Boolean)
        .join(" "),
      512,
    );
    return {
      index: index + 1,
      prompt: shotPrompt || truncateTextByChars(prompt, 512),
      duration: String(shotDuration),
    };
  });
}

function buildKlingOmniVideoPayload(payload) {
  const storyboardSource = Array.isArray(payload?.storyboards) ? payload.storyboards : [];
  payload = stripInternalPayloadFields(payload);
  payload.storyboards = storyboardSource;
  const prompt = typeof payload.prompt === "string" ? getVisualScriptText(payload.prompt) : "";
  const firstFrameUrl = getVideoFirstFrameUrl(payload);
  const coreImages = pickReadableVideoImages(payload.image_urls, 4);
  const supportImages = pickReadableVideoImages(payload.support_image_urls || payload.detail_image_urls, 2);
  const duration = resolveSubmittedVideoDuration(payload, KLING_VIDEO_BASE_URL);
  const imageList = [
    ...(firstFrameUrl ? [{ image_url: firstFrameUrl, type: "first_frame" }] : []),
    ...coreImages.map((image_url) => ({ image_url })),
    ...supportImages.map((image_url) => ({ image_url })),
  ].slice(0, 7);
  const multiPrompt = buildKlingShotPrompts(payload, prompt, duration);
  const useMultiShot = multiPrompt.length > 1;
  const ratio = typeof payload.aspect_ratio === "string" && payload.aspect_ratio.trim() ? payload.aspect_ratio.trim() : "9:16";
  return {
    model_name: payload.model || KLING_VIDEO_MODEL,
    ...(useMultiShot
      ? {
          multi_shot: true,
          shot_type: "customize",
          multi_prompt: multiPrompt,
        }
      : {
          prompt: truncateTextByChars(prompt, 2500),
        }),
    image_list: imageList,
    mode: payload.resolution === "4k" ? "4k" : "pro",
    sound: payload.audio ? "on" : "off",
    aspect_ratio: ratio,
    duration: String(duration),
    callback_url: "",
    external_task_id: typeof payload.external_task_id === "string" ? payload.external_task_id : "",
    watermark_info: { enabled: false },
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
  payload = stripInternalPayloadFields(payload);
  const {
    image_url,
    aspect_ratio,
    resolution,
    audio,
    prompt_extend,
    metadata,
    requested_duration,
    ...rest
  } = payload;
  const prompt = typeof payload.prompt === "string" ? payload.prompt : "";
  const firstFrameUrl = getVideoFirstFrameUrl(payload);
  const duration = resolveSubmittedVideoDuration(payload, upstreamUrl);
  const requestedDuration = Number.isFinite(Number(payload.requested_duration)) ? Number(payload.requested_duration) : Number(payload.duration);
  const ratio = typeof aspect_ratio === "string" && aspect_ratio.trim() ? aspect_ratio.trim() : "9:16";
  const dimensions = buildVideoDimensions(ratio);
  const baseMetadata = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
  const durationMetadata = {
    requested_duration: requestedDuration,
    submitted_duration: duration,
    provider_duration_note: isWisechVideoUrl(upstreamUrl) ? "Wisech / Yunshu Seedance duration is clamped by model: Seedance 2.0 up to 15s, Seedance 1.5 Pro up to 12s." : undefined,
  };
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
      metadata: {
        ...baseMetadata,
        ...durationMetadata,
      },
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
      ...durationMetadata,
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
  if (isKlingVideoUrl(upstreamUrl) && kind === "video") return buildKlingOmniVideoPayload(upstreamPayload);
  if (isShishiKejiUrl(upstreamUrl) && kind === "video") return stripInternalPayloadFields(upstreamPayload);
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
  const sendShishiKejiVideo = kind === "video" && isShishiKejiUrl(resolvedUpstreamUrl);
  const retryDelay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function sendProxyRequest(nextUpstreamPayload, retryReason = "") {
    let normalizedUpstreamPayload = nextUpstreamPayload;
    let body;
    let authHeaders;
    try {
      normalizedUpstreamPayload =
        kind === "video" && !sendShishiKejiVideo && !isDashScopeUrl(resolvedUpstreamUrl) && !isVolcengineUrl(resolvedUpstreamUrl)
          ? await normalizeOpenAICompatibleVideoPayload(nextUpstreamPayload, resolvedUpstreamUrl, apiKey)
          : nextUpstreamPayload;
      const proxyPayload = buildProxyPayload(kind, resolvedUpstreamUrl, normalizedUpstreamPayload);
      body = sendShishiKejiVideo
        ? await buildShishiKejiVideoFormData(proxyPayload)
        : sendMultipartImageEdit
          ? await buildOpenAIImageEditFormData(proxyPayload)
          : JSON.stringify(proxyPayload);
      authHeaders = sendShishiKejiVideo ? { "X-License-Key": apiKey } : createBearerAuthHeaders(resolvedUpstreamUrl, apiKey, kind);
    } catch (error) {
      return {
        status: 400,
        payload: {
          error: error instanceof Error ? error.message : String(error),
          upstreamUrl: resolvedUpstreamUrl,
        },
      };
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), kind === "video" ? VIDEO_UPSTREAM_TIMEOUT_MS : UPSTREAM_TIMEOUT_MS);
    let response;
    try {
      response = await fetch(resolvedUpstreamUrl, {
        method: "POST",
        signal: controller.signal,
        headers: {
          ...authHeaders,
          ...(sendMultipartImageEdit || sendShishiKejiVideo ? {} : { "Content-Type": "application/json" }),
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
          error: getUpstreamConnectionFailureMessage(kind, isAbortError),
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
            error: "视频通道拦截了本次完整请求。系统已经做过一次低风险改写，但上游仍未放行；这不一定是你写的那句提示词有问题，也可能来自系统拼接的产品锁、首帧图、素材组合或上游通道策略。",
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

async function proxyVoiceover(payload) {
  const text = typeof payload?.text === "string" ? payload.text.trim() : "";
  const voiceGender = typeof payload?.voiceGender === "string" ? payload.voiceGender.trim().toLowerCase() : "";
  const requestedVoice = typeof payload?.voice === "string" ? payload.voice.trim() : "";
  const voice =
    voiceGender === "male"
      ? TTS_VOICE_OPTIONS.male
      : voiceGender === "female"
        ? TTS_VOICE_OPTIONS.female
        : requestedVoice || TTS_VOICE;
  const model = typeof payload?.model === "string" && payload.model.trim() ? payload.model.trim() : TTS_MODEL;
  const upstreamUrl = `${TTS_BASE_URL}/chat/completions`;

  if (!text) {
    return { status: 400, payload: { error: "Voiceover text is empty." } };
  }
  if (!TTS_API_KEY) {
    return { status: 400, payload: { error: "TTS API key is not configured.", upstreamUrl } };
  }

  const response = await fetch(upstreamUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TTS_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      modalities: ["text", "audio"],
      audio: { voice, format: "mp3" },
      messages: [
        {
          role: "system",
          content:
            "Read the user's narration text exactly as written. Do not add greetings, commentary, explanations, sound effects, stage directions, translations, or extra words. Keep the delivery natural for a short social video voiceover.",
        },
        {
          role: "user",
          content: text,
        },
      ],
      max_tokens: Math.max(128, Math.min(4096, Math.ceil(text.length * 1.6))),
    }),
  });

  const rawText = await response.text();
  const data = parseUpstreamBody(rawText, response.status);
  if (!response.ok) {
    return { status: response.status, payload: withUpstreamError(data, response.status, upstreamUrl) };
  }

  const message = Array.isArray(data?.choices) ? data.choices[0]?.message : null;
  const audioBase64 = typeof message?.audio?.data === "string" ? message.audio.data : "";
  if (!audioBase64) {
    return {
      status: 502,
      payload: {
        error: "TTS provider returned no audio data.",
        upstreamUrl,
        model,
      },
    };
  }

  return {
    status: 200,
    payload: {
      ok: true,
      audioBase64,
      audioContentType: "audio/mpeg",
      fileName: "aican-voiceover.mp3",
      model,
      voice,
      transcript: typeof message?.audio?.transcript === "string" ? message.audio.transcript : "",
      upstreamUrl,
    },
  };
}

async function proxyVideoDownload(url) {
  const targetUrl = url.searchParams.get("url") || "";
  let parsedUrl;
  try {
    parsedUrl = new URL(targetUrl);
  } catch {
    return { status: 400, payload: { error: "Video download URL is invalid." } };
  }
  if (!/^https?:$/i.test(parsedUrl.protocol)) {
    return { status: 400, payload: { error: "Only HTTP video URLs can be downloaded." } };
  }

  const response = await fetch(parsedUrl.toString(), {
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0 VideoAssetDownloader/1.0",
    },
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!response.ok) {
    return {
      status: response.status,
      payload: {
        error: `Video download failed (${response.status}).`,
        upstreamUrl: parsedUrl.toString(),
      },
    };
  }
  if (!bytes.length) {
    return { status: 502, payload: { error: "Video download returned an empty file.", upstreamUrl: parsedUrl.toString() } };
  }

  const contentType = response.headers.get("content-type") || "";
  return {
    status: 200,
    binary: true,
    body: bytes,
    headers: {
      "Content-Type": /^video\//i.test(contentType) ? contentType : "video/mp4",
      "Content-Length": String(bytes.length),
      "Content-Disposition": 'attachment; filename="video-asset.mp4"',
      "Cache-Control": "no-store",
    },
  };
}

function getLocalDownloadsDir() {
  const homeDir = process.env.USERPROFILE || process.env.HOME || "";
  return homeDir ? `${homeDir}\\Downloads` : "";
}

function createLocalVideoFileName() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `subtitle-voiceover-preview-${stamp}.mp4`;
}

function createRenderedVideoFileName() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `subtitle-voiceover-rendered-${stamp}.mp4`;
}

function isAllowedLocalVideoPath(filePath) {
  const normalized = resolve(filePath).toLowerCase();
  const cwd = resolve(process.cwd()).toLowerCase();
  const downloadsDir = getLocalDownloadsDir();
  const downloads = downloadsDir ? resolve(downloadsDir).toLowerCase() : "";
  if (!normalized.endsWith(".mp4")) return false;
  return normalized.startsWith(`${cwd}\\`) || (downloads && normalized.startsWith(`${downloads}\\`));
}

function serveLocalVideo(url, req) {
  const filePath = typeof url?.searchParams?.get("path") === "string" ? url.searchParams.get("path").trim() : "";
  const resolvedPath = resolve(filePath);
  if (!filePath || !isAllowedLocalVideoPath(resolvedPath) || !existsSync(resolvedPath)) {
    return createApiResponse(404, { error: "Local video asset was not found." });
  }
  const stat = statSync(resolvedPath);
  if (!stat.isFile() || stat.size <= 0) return createApiResponse(404, { error: "Local video asset is empty." });

  const range = typeof req?.headers?.range === "string" ? req.headers.range : "";
  const headers = {
    "Content-Type": "video/mp4",
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
  };
  if (range) {
    const match = range.match(/^bytes=(\d*)-(\d*)$/);
    const start = match?.[1] ? Number(match[1]) : 0;
    const end = match?.[2] ? Number(match[2]) : stat.size - 1;
    if (Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end >= start && start < stat.size) {
      const safeEnd = Math.min(end, stat.size - 1);
      const bytes = readFileSync(resolvedPath).subarray(start, safeEnd + 1);
      return {
        binary: true,
        status: 206,
        body: bytes,
        headers: {
          ...headers,
          "Content-Length": String(bytes.length),
          "Content-Range": `bytes ${start}-${safeEnd}/${stat.size}`,
        },
      };
    }
  }

  const bytes = readFileSync(resolvedPath);
  return {
    binary: true,
    status: 200,
    body: bytes,
    headers: {
      ...headers,
      "Content-Length": String(bytes.length),
    },
  };
}

function revealLocalVideo(payload) {
  const filePath = typeof payload?.path === "string" ? payload.path.trim() : "";
  const resolvedPath = resolve(filePath);
  if (!filePath || !isAllowedLocalVideoPath(resolvedPath) || !existsSync(resolvedPath)) {
    return { status: 400, payload: { error: "Local video path is invalid or no longer exists." } };
  }
  const stat = statSync(resolvedPath);
  if (!stat.isFile() || stat.size <= 0) {
    return { status: 400, payload: { error: "Local video asset is empty." } };
  }
  try {
    const child = spawn("explorer.exe", [`/select,${resolvedPath}`], {
      detached: true,
      stdio: "ignore",
      windowsHide: false,
    });
    child.unref();
    return { status: 200, payload: { ok: true, filePath: resolvedPath } };
  } catch (error) {
    return { status: 500, payload: { error: error instanceof Error ? error.message : "Failed to open local video location." } };
  }
}

function serveHistoryAsset(fileName) {
  const cleanFileName = String(fileName || "").replace(/[\\/]/g, "");
  const filePath = resolve(LOCAL_HISTORY_ASSET_DIR, cleanFileName);
  const assetRoot = resolve(LOCAL_HISTORY_ASSET_DIR).toLowerCase();
  const normalized = filePath.toLowerCase();
  if (!cleanFileName || !normalized.startsWith(`${assetRoot}\\`) || !existsSync(filePath)) {
    return createApiResponse(404, { error: "History asset was not found." });
  }
  const bytes = readFileSync(filePath);
  if (!bytes.length) return createApiResponse(404, { error: "History asset is empty." });
  const extension = cleanFileName.toLowerCase().split(".").pop();
  const contentType =
    extension === "png"
      ? "image/png"
      : extension === "webp"
        ? "image/webp"
        : extension === "gif"
          ? "image/gif"
          : "image/jpeg";
  return {
    binary: true,
    status: 200,
    body: bytes,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(bytes.length),
      "Cache-Control": "no-store",
    },
  };
}

function decodeBase64Payload(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  const base64 = raw.includes(",") ? raw.split(",").pop() || "" : raw;
  return Buffer.from(base64, "base64");
}

function getAudioFileExtension(contentType) {
  const normalized = typeof contentType === "string" ? contentType.toLowerCase() : "";
  if (normalized.includes("wav")) return "wav";
  if (normalized.includes("aac") || normalized.includes("mp4")) return "m4a";
  return "mp3";
}

function formatSrtTimestamp(seconds) {
  const totalMs = Math.max(0, Math.round(Number(seconds || 0) * 1000));
  const ms = totalMs % 1000;
  const totalSeconds = Math.floor(totalMs / 1000);
  const second = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minute = totalMinutes % 60;
  const hour = Math.floor(totalMinutes / 60);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

function buildSrtContent(segments) {
  const lines = [];
  const usableSegments = Array.isArray(segments) ? segments : [];
  for (const segment of usableSegments) {
    const start = Number(segment?.start);
    const end = Number(segment?.end);
    const subtitle = typeof segment?.subtitle === "string" ? segment.subtitle.trim() : "";
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !subtitle) continue;
    lines.push(
      String(lines.length / 4 + 1),
      `${formatSrtTimestamp(start)} --> ${formatSrtTimestamp(end)}`,
      subtitle.replace(/\r/g, "").split("\n").map((line) => line.trim()).filter(Boolean).join("\n"),
      "",
    );
  }
  return lines.join("\n");
}

function escapeFfmpegFilterPath(filePath) {
  return resolve(filePath).replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

function runProcess(command, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", rejectRun);
    child.on("close", (code) => {
      if (code === 0) {
        resolveRun({ stdout, stderr });
        return;
      }
      rejectRun(new Error(stderr || stdout || `${command} exited with code ${code}`));
    });
  });
}

async function hasAudioStream(videoPath) {
  if (!FFPROBE_BINARY || !existsSync(FFPROBE_BINARY)) return false;
  try {
    const result = await runProcess(FFPROBE_BINARY, [
      "-v",
      "error",
      "-select_streams",
      "a:0",
      "-show_entries",
      "stream=index",
      "-of",
      "json",
      videoPath,
    ]);
    const parsed = JSON.parse(result.stdout || "{}");
    return Array.isArray(parsed.streams) && parsed.streams.length > 0;
  } catch {
    return false;
  }
}

async function writeRenderSourceVideo(payload, outputPath) {
  const sourceVideoBase64 = typeof payload?.sourceVideoBase64 === "string" ? payload.sourceVideoBase64.trim() : "";
  if (sourceVideoBase64) {
    const bytes = decodeBase64Payload(sourceVideoBase64);
    if (!bytes.length) throw new Error("Source video data is empty.");
    writeFileSync(outputPath, bytes);
    return;
  }

  const sourceVideoUrl = typeof payload?.sourceVideoUrl === "string" ? payload.sourceVideoUrl.trim() : "";
  if (!/^https?:\/\//i.test(sourceVideoUrl)) {
    throw new Error("Source video must be an HTTP URL or uploaded as local video data.");
  }
  const response = await fetch(sourceVideoUrl, {
    method: "GET",
    headers: { "User-Agent": "Mozilla/5.0 VideoPostRenderer/1.0" },
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!response.ok) throw new Error(`Source video download failed (${response.status}).`);
  if (!bytes.length) throw new Error("Source video download returned an empty file.");
  writeFileSync(outputPath, bytes);
}

async function renderPostVideo(payload) {
  if (!FFMPEG_BINARY) {
    return { status: 500, payload: { error: "Local ffmpeg renderer is not available. Please install or configure a working FFmpeg binary." } };
  }
  const includeSubtitles = payload?.includeSubtitles !== false;
  const includeVoiceover = payload?.includeVoiceover !== false;
  const voiceoverAudioBase64 = typeof payload?.voiceoverAudioBase64 === "string" ? payload.voiceoverAudioBase64.trim() : "";
  if (includeVoiceover && !voiceoverAudioBase64) return { status: 400, payload: { error: "Voiceover audio is missing. Generate subtitle and voiceover first." } };
  const srtContent = buildSrtContent(payload?.segments);
  if (includeSubtitles && !srtContent.trim()) return { status: 400, payload: { error: "Subtitle timeline is empty." } };

  const workId = new Date().toISOString().replace(/[:.]/g, "-");
  const workDir = `${LOCAL_POST_RENDER_DIR}\\${workId}`;
  mkdirSync(workDir, { recursive: true });
  const inputVideoPath = `${workDir}\\source.mp4`;
  const subtitlePath = `${workDir}\\subtitles.srt`;
  const audioPath = `${workDir}\\voiceover.${getAudioFileExtension(payload?.voiceoverAudioContentType)}`;
  const downloadsDir = getLocalDownloadsDir();
  if (!downloadsDir) return { status: 500, payload: { error: "Downloads folder could not be resolved." } };
  mkdirSync(downloadsDir, { recursive: true });
  const fileName = createRenderedVideoFileName();
  const outputPath = `${downloadsDir}\\${fileName}`;

  try {
    await writeRenderSourceVideo(payload, inputVideoPath);
    if (includeSubtitles) writeFileSync(subtitlePath, srtContent, "utf8");
    if (includeVoiceover) {
      const audioBytes = decodeBase64Payload(voiceoverAudioBase64);
      if (!audioBytes.length) throw new Error("Voiceover audio data is empty.");
      writeFileSync(audioPath, audioBytes);
    }

    const subtitleFilter = includeSubtitles ? `subtitles='${escapeFfmpegFilterPath(subtitlePath)}'` : "";
    const sourceHasAudio = await hasAudioStream(inputVideoPath);
    const baseVideoArgs = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p"];
    let args;
    if (includeVoiceover && sourceHasAudio) {
      args = [
        "-y",
        "-i",
        inputVideoPath,
        "-i",
        audioPath,
        "-filter_complex",
        includeSubtitles
          ? `[0:v]${subtitleFilter}[v];[0:a][1:a]amix=inputs=2:duration=first:dropout_transition=2[a]`
          : `[0:a][1:a]amix=inputs=2:duration=first:dropout_transition=2[a]`,
        "-map",
        includeSubtitles ? "[v]" : "0:v",
        "-map",
        "[a]",
        ...baseVideoArgs,
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-shortest",
        "-movflags",
        "+faststart",
        outputPath,
      ];
    } else if (includeVoiceover) {
      args = [
        "-y",
        "-i",
        inputVideoPath,
        "-i",
        audioPath,
        ...(includeSubtitles ? ["-vf", subtitleFilter] : []),
        "-map",
        "0:v",
        "-map",
        "1:a",
        ...baseVideoArgs,
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-shortest",
        "-movflags",
        "+faststart",
        outputPath,
      ];
    } else {
      args = [
        "-y",
        "-i",
        inputVideoPath,
        ...(includeSubtitles ? ["-vf", subtitleFilter] : []),
        ...baseVideoArgs,
        ...(sourceHasAudio ? ["-c:a", "aac", "-b:a", "192k"] : ["-an"]),
        "-movflags",
        "+faststart",
        outputPath,
      ];
    }
    await runProcess(FFMPEG_BINARY, args);
    return { status: 200, payload: { ok: true, fileName, filePath: outputPath, sourceHasAudio } };
  } catch (error) {
    return { status: 500, payload: { error: error instanceof Error ? error.message : "Post-production render failed." } };
  }
}

async function saveVideoDownload(payload) {
  const dataBase64 = typeof payload?.dataBase64 === "string" ? payload.dataBase64.trim() : "";
  const sourcePath = typeof payload?.sourcePath === "string" ? payload.sourcePath.trim() : "";
  const downloadsDir = getLocalDownloadsDir();
  if (!downloadsDir) return { status: 500, payload: { error: "Downloads folder could not be resolved." } };
  mkdirSync(downloadsDir, { recursive: true });

  if (sourcePath) {
    const resolvedSourcePath = resolve(sourcePath);
    if (!isAllowedLocalVideoPath(resolvedSourcePath) || !existsSync(resolvedSourcePath)) {
      return { status: 400, payload: { error: "Saved video path is invalid or no longer exists." } };
    }
    const bytes = readFileSync(resolvedSourcePath);
    if (!bytes.length) return { status: 400, payload: { error: "Saved video file is empty." } };
    const fileName = createLocalVideoFileName();
    const filePath = `${downloadsDir}\\${fileName}`;
    writeFileSync(filePath, bytes);
    return {
      status: 200,
      payload: {
        ok: true,
        fileName,
        filePath,
        bytes: bytes.length,
        contentType: "video/mp4",
      },
    };
  }

  if (dataBase64) {
    let bytes;
    try {
      bytes = Buffer.from(dataBase64, "base64");
    } catch {
      return { status: 400, payload: { error: "Video file data is invalid." } };
    }
    if (!bytes.length) return { status: 400, payload: { error: "Video file data is empty." } };
    const fileName = createLocalVideoFileName();
    const filePath = `${downloadsDir}\\${fileName}`;
    writeFileSync(filePath, bytes);
    return {
      status: 200,
      payload: {
        ok: true,
        fileName,
        filePath,
        bytes: bytes.length,
        contentType: typeof payload?.contentType === "string" ? payload.contentType : "video/mp4",
      },
    };
  }

  const targetUrl = typeof payload?.url === "string" ? payload.url.trim() : "";
  let parsedUrl;
  try {
    parsedUrl = new URL(targetUrl);
  } catch {
    return { status: 400, payload: { error: "Video download URL is invalid." } };
  }
  if (!/^https?:$/i.test(parsedUrl.protocol)) {
    return { status: 400, payload: { error: "Only HTTP video URLs can be saved by the local downloader." } };
  }

  const response = await fetch(parsedUrl.toString(), {
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0 VideoAssetDownloader/1.0",
    },
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!response.ok) {
    return { status: response.status, payload: { error: `Video download failed (${response.status}).`, upstreamUrl: parsedUrl.toString() } };
  }
  if (!bytes.length) {
    return { status: 502, payload: { error: "Video download returned an empty file.", upstreamUrl: parsedUrl.toString() } };
  }

  const fileName = createLocalVideoFileName();
  const filePath = `${downloadsDir}\\${fileName}`;
  writeFileSync(filePath, bytes);
  return {
    status: 200,
    payload: {
      ok: true,
      fileName,
      filePath,
      bytes: bytes.length,
      contentType: response.headers.get("content-type") || "video/mp4",
    },
  };
}

async function testProxy(fallbackPath, payload, kind = "generic") {
  const { baseUrl, apiKey, upstreamUrl: configuredUrl, upstreamPayload } = pickProxyConfig(payload, fallbackPath, kind);
  const model = typeof upstreamPayload.model === "string" ? upstreamPayload.model.trim() : "";
  const videoProvider = typeof payload?.video_provider === "string" ? payload.video_provider.trim().toLowerCase() : "";
  const modelLimits = kind === "video" ? { provider: resolveVideoProviderFromUrl(configuredUrl, videoProvider), model, ...getVideoModelLimit(resolveVideoProviderFromUrl(configuredUrl, videoProvider), model) } : undefined;
  if (kind === "video" && isShishiKejiUrl(configuredUrl)) {
    const upstreamUrl = `${baseUrl}/api/agent-app/me`;
    if (!apiKey) return { status: 400, payload: { error: "Video service API key is not configured.", upstreamUrl } };
    const response = await fetch(upstreamUrl, { method: "GET", headers: { "X-License-Key": apiKey } });
    const text = await response.text();
    const data = parseUpstreamBody(text, response.status);
    return {
      status: response.status,
      payload: response.ok
        ? { ok: true, model, modelFound: Boolean(model), upstreamStatus: response.status, upstreamUrl, wallet: data.wallet, agent: data.agent, modelLimits }
        : withUpstreamError(data, response.status, upstreamUrl),
    };
  }
  if (kind === "video" && isToapisUrl(configuredUrl)) {
    return {
      status: apiKey ? 200 : 400,
      payload: apiKey
        ? { ok: true, model, modelFound: Boolean(model), upstreamUrl: configuredUrl, note: "ToAPI video models use /videos/generations and are not listed by /models.", modelLimits }
        : { error: "Video service API key is not configured.", upstreamUrl: configuredUrl },
    };
  }
  if (kind === "video" && isKlingVideoUrl(configuredUrl)) {
    const authState = getKlingAuthPublicState(apiKey);
    return {
      status: authState.ok ? 200 : 400,
      payload: authState.ok
        ? { ok: true, model, modelFound: Boolean(model), upstreamUrl: configuredUrl, note: "Kling Direct uses /v1/videos/omni-video with one full prompt, the approved first frame, and reference images. Multi-shot is only used for explicitly timed shot prompts.", modelLimits, auth: authState }
        : { error: authState.error, code: authState.code, upstreamUrl: configuredUrl, auth: authState },
    };
  }
  if (isDashScopeUrl(configuredUrl) || (kind === "video" && isVolcengineUrl(configuredUrl))) {
    return {
      status: apiKey ? 200 : 400,
      payload: apiKey ? { ok: true, model, modelFound: Boolean(model), upstreamUrl: configuredUrl, modelLimits } : { error: "Video service API key is not configured.", upstreamUrl: configuredUrl },
    };
  }
  const upstreamUrl = `${baseUrl}/models`;
  if (!apiKey) return { status: 400, payload: { error: "Service API key is not configured.", upstreamUrl } };
  const response = await fetch(upstreamUrl, { method: "GET", headers: { Authorization: `Bearer ${apiKey}` } });
  const text = await response.text();
  const data = parseUpstreamBody(text, response.status);
  if (!response.ok) {
    return { status: response.status, payload: withUpstreamError({ ...data, upstreamUrl, upstreamStatus: response.status }, response.status, upstreamUrl) };
  }
  const models = Array.isArray(data.data) ? data.data : [];
  const found = !model || models.some((item) => item && typeof item === "object" && item.id === model);
  if (found) {
    return { status: 200, payload: { ok: true, model, modelFound: Boolean(model), upstreamStatus: response.status, upstreamUrl, ...(modelLimits ? { modelLimits } : {}) } };
  }
  return { status: 400, payload: { error: `Service is reachable, but model ${model} is not available.`, model, modelFound: false, upstreamUrl, upstreamStatus: response.status } };
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
  return sanitizeProductText(text)
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
          sceneTitle: typeof parsed.sceneTitle === "string" ? sanitizeProductText(parsed.sceneTitle) : "",
          sceneAnchor: typeof parsed.sceneAnchor === "string" ? sanitizeProductText(parsed.sceneAnchor) : "",
          firstFramePrompt: sanitizeProductText(firstFramePrompt),
          videoPrompt: sanitizeVideoPromptText(videoPrompt),
          continuityLocks: typeof parsed.continuityLocks === "string" ? sanitizeProductText(parsed.continuityLocks) : "",
        };
      }
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

async function videoUrlToBlob(videoUrl, fileName = "first-frame.png") {
  if (typeof videoUrl !== "string" || !videoUrl.trim()) {
    throw new Error("Invalid video media input.");
  }
  if (videoUrl.startsWith("data:image/")) {
    const match = videoUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) throw new Error("Invalid data:image input.");
    const [, mimeType, base64] = match;
    const extension = mimeType.includes("jpeg") ? "jpg" : mimeType.split("/")[1] || "png";
    return {
      blob: new Blob([Buffer.from(base64, "base64")], { type: mimeType }),
      fileName: fileName.replace(/\.[^.]+$/, `.${extension}`),
    };
  }
  if (/^https?:\/\//i.test(videoUrl)) {
    const response = await fetch(videoUrl);
    if (!response.ok) throw new Error("Failed to download first-frame media.");
    const contentType = response.headers.get("content-type") || "image/png";
    const extension = contentType.includes("jpeg") ? "jpg" : contentType.split("/")[1]?.split(";")[0] || "png";
    return {
      blob: new Blob([Buffer.from(await response.arrayBuffer())], { type: contentType }),
      fileName: fileName.replace(/\.[^.]+$/, `.${extension}`),
    };
  }
  throw new Error("Only data:image/ or http(s) first-frame inputs are supported.");
}

async function buildShishiKejiVideoFormData(payload) {
  const form = new FormData();
  const prompt = typeof payload.prompt === "string" ? payload.prompt : "";
  if (prompt.length > SHISHI_MAX_PROMPT_CHARS) {
    throw new Error(`Full video prompt is too long: ${prompt.length} chars; limit is ${SHISHI_MAX_PROMPT_CHARS}. Please shorten the action or scene description.`);
  }
  const model = typeof payload.model === "string" && payload.model.trim() ? payload.model.trim() : "2.0";
  const duration = resolveSubmittedVideoDuration(payload, SHISHI_VIDEO_BASE_URL);
  const ratio = typeof payload.aspect_ratio === "string" && payload.aspect_ratio.trim() ? payload.aspect_ratio.trim() : "9:16";
  const resolution = typeof payload.resolution === "string" && payload.resolution.trim() ? payload.resolution.trim().toLowerCase() : "720p";
  const firstFrameUrl = getVideoFirstFrameUrl(payload);

  form.append("prompt", prompt);
  form.append("model", model);
  form.append("duration", String(duration));
  form.append("ratio", ratio);
  form.append("resolution", resolution);
  form.append("client_task_id", `product-video-${Date.now()}-${Math.random().toString(16).slice(2)}`);

  if (firstFrameUrl) {
    const { blob, fileName } = await videoUrlToBlob(firstFrameUrl, "approved-first-frame.png");
    form.append("files", blob, fileName);
  }

  return form;
}

function normalizePromptPairForProduct(promptPair, productType) {
  if (!promptPair) return null;
  return {
    ...promptPair,
    firstFramePrompt: sanitizeProductText(promptPair.firstFramePrompt),
    sceneAnchor: sanitizeProductText(promptPair.sceneAnchor),
    continuityLocks: sanitizeProductText(promptPair.continuityLocks),
    videoPrompt: ensureVideoPromptFinalLock(productType, promptPair.videoPrompt),
  };
}

function buildPromptSuggestionMustMention(productType) {
  const family = getProductFamily(productType);
  if (family === "shark") {
    return "Must naturally include these shark locks: small shallow curved horizontal trapezoid transparent face window, muted cyan-blue nylon, white belly panel, vertical zipper, side eye and exactly five gill stripes, orange side valve, rear tail fin, human-scale wearable volume, slightly underinflated flatter soft body, no huge vertical capsule body, no torpedo/cylinder balloon body, and no oversized horizontal wing-like arm fins.";
  }
  if (family === "cow") {
    return "必须自然写入这些奶牛锁：白色牛身、黑色不规则斑、双角、黑外粉内耳、蓝眼粉鼻粉腮、黑色蹄套、正面粉色下腹组件和四个粉色小圆点、背部拉链、橙色后侧阀门、白尾黑尖。";
  }
  if (family === "mouse") {
    return "必须自然写入这些灰鼠锁：浅灰鼠身、圆耳和米色耳内、米色脸鼻区、突出灰色鼻嘴、黑色张口、棕色卡通眼、米色椭圆腹部、米黄后尾、背部绿色阀门和拉链。";
  }
  if (family === "frog") {
    return "必须自然写入这些青蛙锁：绿色蛙身、顶部凸眼、小号脸窗、黑色横向嘴带、蓝色围巾、米色脸腹、黑色斑点、蹼手蹼脚、背部黑色脊线、橙色后阀。";
  }
  if (family === "sumo") {
    return "必须自然写入这些相扑锁：米肤色充气身体、黑色腰带、正面兜裆布、上身简线、肚脐点、圆头黑色发髻帽、宽 T 形短臂、背部拉链、橙色后阀。";
  }
  return "必须自然写入当前四视图中的颜色、体积、脸部/装饰、阀门、拉链、尾部/附加结构、脚套和布料褶皱等产品锁。";
}

function buildPromptSuggestionHardwareMustMention(productType) {
  const family = getProductFamily(productType);
  if (family === "shark") {
    return "还必须自然写入鲨鱼硬件和材质锁：橙色鼓风阀/进气口/出气口/泵口只能位于阀门侧腰侧面，保留橙色环、圆形网格/盖帽、参考高度和方向；正面看不到时自然隐藏，不能挪到白肚、透明脸窗、正面拉链或尾鳍；保留薄尼龙/PVC 褶皱、缝线、拉链齿和偏软欠充气质感。";
  }
  if (family === "cow") {
    return "还必须自然写入奶牛硬件和材质锁：橙色鼓风阀/进出气口/泵口只能位于右后侧/背侧，背部中轴拉链和白尾黑尖按背视图归位；正面看不到时不强行展示，不能挪到粉色下腹组件、白肚或脸部；保留薄尼龙/PVC 褶皱、缝线、拉链齿和斑块边缘织物感。";
  }
  if (family === "mouse") {
    return "还必须自然写入灰鼠硬件和材质锁：绿色鼓风阀/进出气口/泵口只能位于后背/背侧，和背部中轴拉链、尾巴根部保持正确相对位置；不能挪到米色腹部、鼻嘴、耳朵或手臂；保留浅灰薄尼龙/PVC 褶皱、缝线、拉链齿和柔软充气布料感。";
  }
  if (family === "frog") {
    return "还必须自然写入青蛙硬件和材质锁：橙色鼓风阀/进出气口/泵口只能位于背部黑色脊线/拉链附近的后背面，不能挪到米色腹部、蓝围巾、脸窗、嘴带或斑点上；保留绿色薄尼龙/PVC 褶皱、缝线、拉链齿、围巾边缘和布料松弛。";
  }
  if (family === "sumo") {
    return "还必须自然写入相扑硬件和材质锁：橙色鼓风阀/进出气口/泵口只能位于背面/后侧，参考辅助阀门图保留橙色环、圆形网格/盖帽、参考高度和与后腰带/拉链的间距；不能挪到正面肚子、上身简线、肚脐或兜裆布；保留米肉色薄尼龙/PVC 褶皱和软布折痕。";
  }
  return "还必须自然写入硬件和材质锁：阀门、鼓风阀、进气口、出气口、泵口、拉链、缝线和布料褶皱都只能按四视图位置归位；看不见时隐藏，不允许挪位、复制、换色、简化或改成装饰。";
}

function buildPromptPairSuggestionPayload(payload) {
  const productType = typeof payload.product_type === "string" && payload.product_type.trim() ? sanitizeProductText(payload.product_type) : "当前充气产品";
  const stableProductName = getProductStableName(productType);
  const currentFirstFramePrompt = typeof payload.current_first_frame_prompt === "string" ? truncateTextByChars(sanitizeProductText(payload.current_first_frame_prompt), 1000) : "";
  const currentVideoPrompt = typeof payload.current_video_prompt === "string" ? truncateTextByChars(sanitizeVideoPromptText(payload.current_video_prompt), 800) : "";
  const referenceVideoCount = Number.isFinite(Number(payload.reference_video_count)) ? Number(payload.reference_video_count) : 0;
  const supportImageCount = Number.isFinite(Number(payload.support_image_count)) ? Number(payload.support_image_count) : 0;
  const lockedNodes = Array.isArray(payload.locked_nodes) ? payload.locked_nodes : [];
  const lockLines = formatLockedNodeLines(lockedNodes, 10, 1800, " / ");
  const productLocks = buildInflatableHardwareMaterialLocks(productType)
    .concat(buildFirstFrameProductVisualLocks(productType))
    .concat(buildVideoProductVisualLocks(productType))
    .slice(0, 26)
    .join("\n");
  const { requiredScene, referenceScenes } = pickPromptSceneSet();
  const requiredSceneLine = requiredScene
    ? `${requiredScene.title}: ${requiredScene.anchor}`
    : "从日常电商短视频场景里选一个具体、可拍、有道具的地点。";
  const referenceSceneLines = referenceScenes.length
    ? referenceScenes.map((scene) => `${scene.title}: ${scene.anchor}`).join("\n")
    : "";

  const promptModelLimit = getPromptModelLimit(payload.model);
  const requestPayload = {
    model: payload.model,
    input: [
      {
        role: "system",
        content: [
          "你是电商产品图生视频的提示词导演。",
          "Return parseable JSON only.",
          "只输出一个合法 JSON 对象，不要 Markdown，不要解释。",
          "必须一次生成同一场景下的 firstFramePrompt 和 videoPrompt。两个提示词必须共享同一地点、同一道具关系、同一镜头、同一产品身份。",
          "必须调用真实模型创作，不要套用固定模板。场景要高度多样，避免反复使用明亮超市、明亮商场、办公室、电梯、纯棚拍或白底影棚。",
          "视频提示词必须更幽默诙谐，并且有一个明确的小反转或包袱；仍然只用正向、生活化、轻松幽默、无冲突、低风险的动作表达，不要列出禁词清单。",
          "BGM 和背景对话不是强制项；如果场景适合，可以自然写一句轻快 BGM、背景广播声、路人小声吐槽或旁白反应，但不能喧宾夺主，不能遮挡产品一致性。",
          "MOTION COMPLETION RANGE: videoPrompt should describe 2-3 small readable same-scene action beats while preserving product identity.",
          "COMEDY PACING REQUIREMENT: include a clear tiny reversal or punchline without turning the product into a new character.",
          "视频动作必须是微动：脸窗和拉链基本保持竖直，双脚贴地，禁止大幅前倾、弯腰、转体、抬高脚、跳跃或把小动作放大成夸张表演。",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          `产品：${productType}`,
          `Stable product name: ${stableProductName}`,
          `Reference videos: ${referenceVideoCount}`,
          `Support images: ${supportImageCount}`,
          "Required scene seed:",
          "本次必须使用的场景种子，请扩展成具体可拍场景，不要退回棚拍：",
          requiredSceneLine,
          referenceSceneLines ? `Reference scene examples for variety only:\n${referenceSceneLines}` : "Reference scene examples for variety only: none.",
          "Product locks:",
          productLocks,
          lockLines ? `前端锁定节点：\n${lockLines}` : "前端锁定节点：使用产品四视图中的所有可见组件。",
          currentFirstFramePrompt ? `当前首帧提示词，仅用于避免重复：\n${currentFirstFramePrompt}` : "当前首帧提示词为空。",
          currentVideoPrompt ? `当前视频提示词，仅用于避免重复：\n${currentVideoPrompt}` : "当前视频提示词为空。",
          "Scene anchor must be shared by both prompts.",
          "Return JSON with: sceneTitle, sceneAnchor, firstFramePrompt, videoPrompt, continuityLocks.",
          "输出 JSON schema：",
          JSON.stringify({
            sceneTitle: "短场景名",
            sceneAnchor: "同一场景的地点、道具、镜头和气氛，60-120字",
            firstFramePrompt: "220-420字中文，描述首帧静态画面和产品一致性，不要只写棚拍或白底",
            videoPrompt: "160-260字中文，描述同一场景下2-3个安全、轻松、幽默的微动作，并有一个小反转或包袱；可以自然带一句轻快BGM、背景广播声或路人小声吐槽，但不是强制；必须写明脸窗和拉链基本竖直、双脚贴地、不大幅前倾、不转体",
            continuityLocks: "一句话说明两个提示词共享哪些场景和产品身份约束",
          }),
        ].join("\n\n"),
      },
    ],
    temperature: 1,
    max_output_tokens: Math.min(promptModelLimit.maxOutputTokens, 1200),
  };
  requestPayload.input[1].content = fitPromptToLimit([requestPayload.input[1].content], promptModelLimit.maxInputChars);
  return requestPayload;
}

function parseJsonObjectText(text) {
  const cleaned = cleanGeneratedPrompt(text);
  const candidates = [cleaned];
  const objectMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objectMatch) candidates.push(objectMatch[0]);
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

function normalizeStoryBeat(value, index) {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const beat = typeof record.beat === "string" && record.beat.trim() ? record.beat.trim() : typeof value === "string" ? value.trim() : "";
  return {
    id: typeof record.id === "string" && record.id.trim() ? record.id.trim() : `beat_${index + 1}`,
    beat: sanitizeProductText(beat || `Readable action beat ${index + 1}`),
    action: sanitizeProductText(typeof record.action === "string" ? record.action : beat || ""),
    camera: sanitizeProductText(typeof record.camera === "string" ? record.camera : "front to slight three-quarter"),
    risk: sanitizeProductText(typeof record.risk === "string" ? record.risk : ""),
  };
}

function normalizeStoryIntentPayload(parsed, payload = {}, upstreamUrl = "") {
  const productType = typeof payload.product_type === "string" && payload.product_type.trim() ? sanitizeProductText(payload.product_type) : getProductStableName("");
  const record = parsed && typeof parsed === "object" ? parsed : {};
  const beatsSource = Array.isArray(record.beats) ? record.beats : [];
  const beats = beatsSource.slice(0, 5).map((beat, index) => normalizeStoryBeat(beat, index)).filter((beat) => beat.beat);
  while (beats.length < 3) {
    beats.push(normalizeStoryBeat({ beat: `Small readable product-safe action beat ${beats.length + 1}`, action: "small grounded gesture", camera: "front" }, beats.length));
  }
  return {
    storyTitle: sanitizeProductText(typeof record.storyTitle === "string" ? record.storyTitle : typeof record.title === "string" ? record.title : "Product-safe short action"),
    storyIntent: sanitizeProductText(typeof record.storyIntent === "string" ? record.storyIntent : typeof record.intent === "string" ? record.intent : beats.map((beat) => beat.beat).join(" -> ")),
    sceneAnchor: sanitizeProductText(typeof record.sceneAnchor === "string" ? record.sceneAnchor : typeof payload.user_direction === "string" ? payload.user_direction : ""),
    motionMode: payload.motion_mode === "creative" || payload.motion_mode === "balanced" || payload.motion_mode === "strict" ? payload.motion_mode : "balanced",
    productType,
    stableProductName: getProductStableName(productType),
    beats,
    riskNotes: Array.isArray(record.riskNotes)
      ? record.riskNotes.map((item) => sanitizeProductText(String(item))).filter(Boolean).slice(0, 6)
      : Array.isArray(record.risks)
        ? record.risks.map((item) => sanitizeProductText(String(item))).filter(Boolean).slice(0, 6)
        : [],
    model: typeof payload.model === "string" ? payload.model : "",
    upstreamUrl,
  };
}

function buildStoryIntentPayload(payload) {
  const productType = typeof payload.product_type === "string" && payload.product_type.trim() ? sanitizeProductText(payload.product_type) : "wearable inflatable product";
  const userDirection = typeof payload.user_direction === "string" ? truncateTextByChars(sanitizeProductText(getVisualScriptText(payload.user_direction)), 900) : "";
  const revisionInstruction = typeof payload.revision_instruction === "string" ? truncateTextByChars(sanitizeProductText(payload.revision_instruction), 900) : "";
  const currentIntent = payload.current_intent && typeof payload.current_intent === "object" ? JSON.stringify(payload.current_intent).slice(0, 3000) : "";
  const contract = buildProductLockContract(productType, payload.locked_nodes);
  const promptModelLimit = getPromptModelLimit(payload.model);
  const { requiredScene, referenceScenes } = pickPromptSceneSet(5);
  const requestPayload = {
    model: payload.model,
    input: [
      {
        role: "system",
        content: [
          "You are a product-safe short-video story director for image-to-video generation.",
          "Return parseable JSON only. Do not include Markdown.",
          "Generate or revise only the story/action intent. Do not write subtitles, sign text, price, SKU, discount, CTA, channel targeting, product selling points, or post-production copy.",
          "The user's subtitle and voiceover lines are post-production assets. Use only visual action, scene, sound-effect, and background-audio intent for the video generation plan.",
          "The video must be interesting enough for a short product clip, but all action must stay grounded, low-risk, and compatible with four-view product consistency.",
          "The story intent must come before storyboard generation. Do not describe final video provider settings.",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          `Product type: ${productType}`,
          `Stable product name: ${getProductStableName(productType)}`,
          `Motion mode: ${payload.motion_mode || "balanced"}`,
          userDirection ? `User direction:\n${userDirection}` : "User direction: none. Create a concrete, filmable everyday micro-story.",
          revisionInstruction ? `Revision instruction:\n${revisionInstruction}` : "",
          currentIntent ? `Current story intent to revise:\n${currentIntent}` : "",
          `Required scene seed: ${requiredScene ? `${requiredScene.title}: ${requiredScene.anchor}` : "everyday product-video scene"}`,
          referenceScenes.length ? `Reference scene variety only:\n${referenceScenes.map((scene) => `${scene.title}: ${scene.anchor}`).join("\n")}` : "",
          "Product lock contract:",
          formatProductLockContract(contract),
          "Return JSON schema:",
          JSON.stringify({
            storyTitle: "short title",
            storyIntent: "one compact paragraph, no text overlays, no CTA",
            sceneAnchor: "specific filmable location and props, no readable signs",
            beats: [
              { id: "beat_1", beat: "setup", action: "small visible action", camera: "front", risk: "risk note" },
              { id: "beat_2", beat: "tiny reversal", action: "small visible action", camera: "front_three_quarter", risk: "risk note" },
              { id: "beat_3", beat: "recovery pose", action: "small visible action", camera: "front", risk: "risk note" },
            ],
            riskNotes: ["no large turn", "no text/sign/subtitle", "no product-obscuring prop"],
          }),
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
    temperature: revisionInstruction ? 0.6 : 0.9,
    max_output_tokens: Math.min(promptModelLimit.maxOutputTokens, 1100),
  };
  requestPayload.input[1].content = fitPromptToLimit([requestPayload.input[1].content], promptModelLimit.maxInputChars);
  return requestPayload;
}

function buildStoryboardGenerationPrompt(payload, contract) {
  const storyIntent = normalizeStoryIntentPayload(payload.story_intent || payload.storyIntent || {}, payload);
  const selectedBeats = storyIntent.beats.slice(0, payload.motion_mode === "strict" ? 3 : 5);
  return [
    "STORYBOARD HARNESS IMAGE GENERATION.",
    "Create one storyboard contact sheet or a single keyframe candidate for the confirmed story/action intent. The image is a cheap pre-video planning artifact used before the expensive video call.",
    "Do not add subtitles, signs, labels, price tags, CTA text, logos, or readable text anywhere in the scene or on the product.",
    "Preserve the same product from the four core views. Use the references as topology maps; do not collage all views into one surface.",
    `Product: ${storyIntent.stableProductName}`,
    `Story intent: ${storyIntent.storyIntent}`,
    `Scene anchor: ${storyIntent.sceneAnchor}`,
    `Beats:\n${selectedBeats.map((beat, index) => `${index + 1}. ${beat.beat}; action=${beat.action}; camera=${beat.camera}`).join("\n")}`,
    `Motion mode: ${storyIntent.motionMode}`,
    formatProductLockContract(contract),
    "Composition: full body visible, feet grounded, product scale human-wearable, camera changes small and physically valid. If making a contact sheet, show 3-5 clean panels of the same product in the same scene.",
  ].join("\n\n");
}

function buildStoryboardImagePayload(payload) {
  const productType = typeof payload.product_type === "string" && payload.product_type.trim() ? sanitizeProductText(payload.product_type) : "wearable inflatable product";
  const contract = buildProductLockContract(productType, payload.locked_nodes);
  const { image_urls, support_image_urls, detail_image_urls, story_intent, storyIntent, ...upstreamPayload } = payload;
  const readableImages = Array.isArray(image_urls) ? image_urls.filter((item) => typeof item === "string" && item.trim()) : [];
  const supportSource = Array.isArray(support_image_urls) ? support_image_urls : detail_image_urls;
  const readableSupportImages = Array.isArray(supportSource) ? supportSource.filter((item) => typeof item === "string" && item.trim()) : [];
  const modelLimits = getImageModelLimit(upstreamPayload.model);
  const prompt = fitPromptToLimit([buildStoryboardGenerationPrompt({ ...payload, story_intent: story_intent || storyIntent }, contract)], modelLimits.maxPromptChars);
  return {
    ...upstreamPayload,
    image_urls: [...readableImages, ...readableSupportImages],
    prompt: sanitizeProductText(prompt),
  };
}

function buildPromptSuggestionPayload(payload) {
  const kind = payload.kind === "video" ? "video" : "firstFrame";
  const productType = typeof payload.product_type === "string" && payload.product_type.trim() ? sanitizeProductText(payload.product_type) : "通用充气服";
  const stableProductName = getProductStableName(productType);
  const currentPrompt = typeof payload.current_prompt === "string" ? truncateTextByChars(sanitizeProductText(payload.current_prompt), 1000) : "";
  const scenePrompt = typeof payload.scene_prompt === "string" ? truncateTextByChars(sanitizeProductText(payload.scene_prompt), 900) : "";
  const referenceVideoCount = Number.isFinite(Number(payload.reference_video_count)) ? Number(payload.reference_video_count) : 0;
  const supportImageCount = Number.isFinite(Number(payload.support_image_count)) ? Number(payload.support_image_count) : 0;
  const lockedNodes = Array.isArray(payload.locked_nodes) ? payload.locked_nodes : [];
  const lockLines = formatLockedNodeLines(lockedNodes, 10, 1800, " / ");
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

  const promptModelLimit = getPromptModelLimit(payload.model);
  const requestPayload = {
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
    max_output_tokens: Math.min(promptModelLimit.maxOutputTokens, 700),
  };
  requestPayload.input[1].content = fitPromptToLimit([requestPayload.input[1].content], promptModelLimit.maxInputChars);
  return requestPayload;
}

function shouldUseLocalPromptSuggestion(payload) {
  const model = typeof payload.model === "string" ? payload.model.trim() : "";
  return model === LOCAL_PROMPT_MODEL;
}

function isPromptModelUnavailable(data, status) {
  const text = JSON.stringify(data || {});
  return status === 404 || status === 503 || /model_not_found|No available channel|model unavailable|model not found/i.test(text);
}

async function proxyPromptSuggestion(payload) {
  const isPair = payload && typeof payload === "object" && payload.kind === "pair";
  if (shouldUseLocalPromptSuggestion(payload)) {
    return {
      status: 400,
      payload: {
        error: `${PROMPT_MODEL_NOT_CONFIGURED_MESSAGE} 提示词模型还没有配置好，请先确认模型名称，然后点击骰子重新生成。`,
        model: typeof payload.model === "string" ? payload.model : "",
      },
    };
  }
  const { apiKey, upstreamUrl, upstreamPayload } = pickProxyConfig({ ...payload, path: payload.path || "/responses" }, "/responses", "prompt");
  if (!apiKey) {
    return { status: 400, payload: { error: "服务密钥还没有配置好，请先让管理员确认后台配置。", upstreamUrl } };
  }
  const requestBody = JSON.stringify(isPair ? buildPromptPairSuggestionPayload(upstreamPayload) : buildPromptSuggestionPayload(upstreamPayload));
  let lastPayload = {};
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const response = await fetch(upstreamUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
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
            error: `${PROMPT_MODEL_UNAVAILABLE_MESSAGE} 提示词模型暂时不可用，请确认模型名称或稍后再点一次骰子。`,
            upstreamUrl,
            model: upstreamPayload.model,
          },
        };
      }
      return { status: response.status, payload: withUpstreamError(data, response.status, upstreamUrl) };
    }
    const rawPrompt = cleanGeneratedPrompt(extractGeneratedText(data));
    if (isPair) {
      const promptPair = normalizePromptPairForProduct(parsePromptPairText(rawPrompt), upstreamPayload.product_type);
      if (promptPair) return { status: 200, payload: { ...promptPair, upstreamUrl, model: upstreamPayload.model, localFallback: false, retryCount: attempt - 1 } };
      lastPayload = { error: "这次没有拿到完整提示词，请再点一次骰子。", rawPrompt };
      continue;
    }
    const prompt = upstreamPayload.kind === "video" ? ensureVideoPromptFinalLock(upstreamPayload.product_type, sanitizeVideoPromptText(rawPrompt)) : rawPrompt;
    if (prompt) return { status: 200, payload: { prompt, upstreamUrl, model: upstreamPayload.model, localFallback: false, retryCount: attempt - 1 } };
  }
  return { status: 502, payload: { ...lastPayload, error: "这次没有拿到完整提示词，请再点一次骰子。", upstreamUrl } };
}

async function proxyStoryIntent(payload) {
  if (shouldUseLocalPromptSuggestion(payload)) {
    return {
      status: 400,
      payload: {
        error: `${PROMPT_MODEL_NOT_CONFIGURED_MESSAGE} Please configure a real prompt model before creating story intent.`,
        model: typeof payload.model === "string" ? payload.model : "",
      },
    };
  }
  const { apiKey, upstreamUrl, upstreamPayload } = pickProxyConfig({ ...payload, path: payload.path || "/responses" }, "/responses", "prompt");
  if (!apiKey) {
    return { status: 400, payload: { error: "Prompt model is not configured.", upstreamUrl } };
  }
  const response = await fetch(upstreamUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(buildStoryIntentPayload(upstreamPayload)),
  });
  const text = await response.text();
  const data = parseUpstreamBody(text, response.status);
  if (!response.ok) return { status: response.status, payload: withUpstreamError(data, response.status, upstreamUrl) };
  const rawText = extractGeneratedText(data);
  const parsed = parseJsonObjectText(rawText);
  if (!parsed) {
    return { status: 502, payload: { error: "Story model did not return parseable JSON.", rawText, upstreamUrl } };
  }
  return { status: 200, payload: normalizeStoryIntentPayload(parsed, upstreamPayload, upstreamUrl) };
}

async function proxyStoryboards(payload) {
  const referenceCheck = validateFourViewImages(payload);
  if (!referenceCheck.ok) return createApiResponse(400, { error: referenceCheck.error });
  const storyIntent = payload.story_intent || payload.storyIntent;
  if (!storyIntent || typeof storyIntent !== "object") {
    return createApiResponse(400, { error: "Please generate or confirm story intent before creating storyboards." });
  }
  const result = await proxyJson("/images/edits", buildStoryboardImagePayload(payload), "image");
  if (result.status < 200 || result.status >= 300) return result;
  const imageUrls = extractImageUrls(result.payload);
  if (!imageUrls.length) {
    return createApiResponse(502, { error: "Storyboard image generation returned no usable image.", upstreamUrl: result.payload?.upstreamUrl });
  }
  const normalizedIntent = normalizeStoryIntentPayload(storyIntent, payload);
  const selectedBeats = normalizedIntent.beats.slice(0, payload.motion_mode === "strict" ? 3 : 5);
  const storyboards = selectedBeats.map((beat, index) => ({
    id: `storyboard_${index + 1}`,
    imageUrl: imageUrls[index] || imageUrls[0],
    beat: beat.beat,
    action: beat.action,
    viewAngle: beat.camera || (index === 0 ? "front" : "front_three_quarter"),
    checks: [
      { id: "product_contract", status: "pending", detail: "Awaiting preflight check against structured locks." },
      { id: "action_path", status: "pending", detail: "Awaiting action/camera continuity check." },
    ],
  }));
  return createApiResponse(200, {
    storyboards,
    imageUrls,
    storyIntent: normalizedIntent,
    productLockContract: buildProductLockContract(payload.product_type, payload.locked_nodes),
    upstreamUrl: result.payload?.upstreamUrl || "",
    model: payload.model || DEFAULT_IMAGE_MODEL,
  });
}

function collectPreflightRequestText(payload) {
  const storyIntent = payload?.story_intent || payload?.storyIntent || {};
  const storyboards = Array.isArray(payload?.storyboards) ? payload.storyboards : [];
  const beats = Array.isArray(storyIntent.beats) ? storyIntent.beats : [];
  return getVisualScriptText([
    storyIntent.storyIntent,
    storyIntent.sceneAnchor,
    ...beats.flatMap((beat) => [beat?.beat, beat?.action]),
    ...storyboards.flatMap((storyboard) => [storyboard?.beat, storyboard?.action]),
  ]
    .filter((item) => typeof item === "string" && item.trim())
    .join("\n"))
    .toLowerCase();
}

function stripNegativeGuardrailPhrases(text) {
  return String(text || "")
    .replace(/\b(no|without|avoid|do not|don't|never|not)\b[^.;,，。；\n]*(subtitle|caption|price|discount|cta|call to action|logo|large turn|full spin|jump|run|fall|fast zoom|cut to)/gi, " ")
    .replace(/(不出现|不要|禁止|避免|不能|无)[^.;,，。；\n]*(\u5b57\u5e55|\u6587\u5b57|\u4ef7\u683c|\u6298\u6263|cta|logo|\u5927\u5e45\u8f6c\u8eab|\u5954\u8dd1|\u6454\u5012|\u5feb\u901f|\u5207\u955c)/g, " ");
}

function collectStoryboardPreflightIssues(payload) {
  const issues = [];
  const productType = typeof payload.product_type === "string" && payload.product_type.trim() ? payload.product_type : "";
  const storyIntent = payload.story_intent || payload.storyIntent;
  const storyboards = Array.isArray(payload.storyboards) ? payload.storyboards : [];
  const motionMode = payload.motion_mode === "strict" || payload.motion_mode === "balanced" || payload.motion_mode === "creative" ? payload.motion_mode : "balanced";
  const minimumFrames = 1;
  const maximumFrames = 5;
  const requestText = stripNegativeGuardrailPhrases(collectPreflightRequestText(payload));
  if (!productType) issues.push({ severity: "fail", code: "missing_product_type", message: "Missing product type." });
  if (!storyIntent || typeof storyIntent !== "object") issues.push({ severity: "fail", code: "missing_story_intent", message: "Story intent is required before video submission." });
  if (storyboards.length < minimumFrames) issues.push({ severity: "fail", code: "missing_first_frame", message: "Approve one generated first frame before video submission." });
  if (storyboards.length > maximumFrames) issues.push({ severity: "risky", code: "too_many_storyboards", message: "Use one approved first frame, or up to 5 timed shots only when the script is explicitly split by seconds." });
  if (storyboards.some((storyboard) => !storyboard || typeof storyboard !== "object" || typeof storyboard.imageUrl !== "string" || !storyboard.imageUrl.trim())) {
    issues.push({ severity: "fail", code: "missing_storyboard_image", message: "The approved first frame needs an image URL." });
  }
  if (storyboards.some((storyboard) => Array.isArray(storyboard.checks) && storyboard.checks.some((check) => check?.status === "fail"))) {
    issues.push({ severity: "fail", code: "failed_storyboard_check", message: "The approved first frame has a failed check." });
  }
  if (/\b(add|show|include|display|overlay|readable)\b[^.;,，。；\n]*(subtitle|caption|price|discount|cta|call to action|logo)/i.test(requestText)) {
    issues.push({ severity: "fail", code: "requested_text_or_sales_copy", message: "Remove requested subtitles, readable sales copy, price, CTA, or logo before video submission." });
  }
  if (/\b(large turn|full spin|jump|run|fall|fast zoom|cut to)\b/i.test(requestText) || /(\u5927\u5e45\u8f6c\u8eab|\u5954\u8dd1|\u6454\u5012|\u5feb\u901f\u53d8\u7126|\u5207\u955c)/.test(requestText)) {
    issues.push({ severity: "risky", code: "risky_motion_path", message: "Motion path may be too large for product consistency." });
  }
  return issues;
}

function buildCameraPath(storyboards) {
  const angles = Array.isArray(storyboards)
    ? storyboards.map((item) => (typeof item.viewAngle === "string" && item.viewAngle.trim() ? item.viewAngle.trim() : "")).filter(Boolean)
    : [];
  return angles.length ? angles.join(" -> ") : "front -> slight front three-quarter -> front";
}

function buildFinalVideoPromptFromPackage(payload, preflight) {
  const storyIntent = normalizeStoryIntentPayload(payload.story_intent || payload.storyIntent || {}, payload);
  const storyboards = Array.isArray(payload.storyboards) ? payload.storyboards : [];
  const storyboardLines = storyboards
    .slice(0, 5)
    .map((storyboard, index) => {
      const visualBeat = getVisualScriptText([storyboard.beat, storyboard.action].filter(Boolean).join("\n"));
      return `${index + 1}. ${sanitizeProductText(visualBeat)}; camera=${sanitizeProductText(storyboard.viewAngle || "front")}`;
    })
    .join("\n");
  const contract = buildProductLockContract(payload.product_type, payload.locked_nodes);
  const visualStoryIntent = getVisualScriptText(storyIntent.storyIntent);
  const visualSceneAnchor = getVisualScriptText(storyIntent.sceneAnchor);
  return fitPromptToLimit(
    [
      "FINAL VIDEO EXECUTION PACKAGE PROMPT.",
      "Use the approved first frame plus the user's single script as the action path for one expensive video generation. Do not invent a different story.",
      "ABSOLUTE NO-READABLE-TEXT RULE: do not render subtitles, captions, title cards, English words, Chinese words, fake letters, random glyphs, signs, logos, labels, UI text, stickers, or readable writing anywhere in the scene, on the costume, on walls, on props, or floating in frame. Subtitle and voiceover text are post-production assets only.",
      `Product: ${storyIntent.stableProductName}`,
      `Visual story intent: ${visualStoryIntent}`,
      `Scene anchor: ${visualSceneAnchor}`,
      storyboardLines ? `Approved first frame / optional timed shot path:\n${storyboardLines}` : "",
      `Camera path: ${preflight.cameraPath}`,
      `Motion mode: ${storyIntent.motionMode}`,
      formatProductLockContract(contract, 14),
      "The first frame and later frames must preserve the same wearable inflatable product identity, human-scale volume, material wrinkles, seams, zipper, valves, appendages, shoes, and view-correct component placement.",
      "Controlled body turns are allowed when requested. If the product turns enough to show the back, BACK_VIEW is the absolute reference: rear tail location, size, length, direction, black tip, rear patch layout, back zipper/seam, valve/hardware, and rear silhouette must stay unchanged and must not be invented or rearranged.",
      "No uncontrolled full spin, no jump, no run, no fall, no fast zoom, no product-obscuring props.",
      "Show the user's requested action beats from the single script. The result must not collapse into a static micro-animation.",
    ],
    getVideoModelLimit(payload.video_provider, payload.model).promptSoftLimit || SHISHI_PROMPT_SOFT_LIMIT,
  );
}

function buildStoryboardPreflight(payload) {
  const issues = collectStoryboardPreflightIssues(payload);
  const hasFail = issues.some((issue) => issue.severity === "fail");
  const hasRisk = issues.some((issue) => issue.severity === "risky");
  const storyboards = Array.isArray(payload.storyboards) ? payload.storyboards : [];
  const cameraPath = buildCameraPath(storyboards);
  return {
    ok: !hasFail,
    status: hasFail ? "fail" : hasRisk ? "risky" : "pass",
    issues,
    cameraPath,
    selectedStoryboardCount: storyboards.length,
  };
}

function buildVideoExecutionPackage(payload) {
  const preflight = buildStoryboardPreflight(payload);
  const storyIntent = normalizeStoryIntentPayload(payload.story_intent || payload.storyIntent || {}, payload);
  const productLockContract = buildProductLockContract(payload.product_type, payload.locked_nodes);
  const finalVideoPrompt = preflight.ok ? buildFinalVideoPromptFromPackage(payload, preflight) : "";
  return {
    ok: preflight.ok,
    preflight,
    productType: storyIntent.productType,
    stableProductName: storyIntent.stableProductName,
    storyIntent,
    motionMode: storyIntent.motionMode,
    selectedStoryboards: Array.isArray(payload.storyboards) ? payload.storyboards.slice(0, 5) : [],
    productLockContract,
    cameraPath: preflight.cameraPath,
    finalVideoPrompt,
    createdAt: new Date().toISOString(),
  };
}

function hasPassingVideoExecutionPackage(payload) {
  const pkg = payload?.video_execution_package || payload?.videoExecutionPackage;
  return Boolean(pkg && typeof pkg === "object" && pkg.ok === true && pkg.preflight && pkg.preflight.status !== "fail" && typeof pkg.finalVideoPrompt === "string" && pkg.finalVideoPrompt.trim());
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
    return { status: 400, payload: { error: "Missing video task id. Please generate again." } };
  }

  const videoProvider = typeof body.video_provider === "string" ? body.video_provider.trim().toLowerCase() : "";
  const providerConfig =
    videoProvider === "wisech"
      ? { baseUrl: WISECH_VIDEO_BASE_URL, apiKey: WISECH_VIDEO_API_KEY }
      : videoProvider === "shishi"
        ? { baseUrl: SHISHI_VIDEO_BASE_URL, apiKey: SHISHI_VIDEO_API_KEY }
        : videoProvider === "kling"
          ? { baseUrl: KLING_VIDEO_BASE_URL, apiKey: KLING_VIDEO_API_KEY || KLING_ACCESS_KEY }
          : videoProvider === "toapis"
            ? { baseUrl: VIDEO_BASE_URL || TOAPIS_BASE_URL, apiKey: VIDEO_API_KEY || TOAPIS_API_KEY }
        : null;
  const baseUrl = (providerConfig?.baseUrl || cleanEndpointText(body.base_url) || VIDEO_BASE_URL).replace(/\/+$/, "");
  const apiKey = providerConfig?.apiKey || (typeof body.api_key === "string" && body.api_key.trim() ? body.api_key.trim() : VIDEO_API_KEY);
  if (!apiKey) {
    return { status: 400, payload: { error: "Video service API key is not configured." } };
  }

  const statusPath = cleanEndpointText(body.status_path);
  const upstreamUrl = isDashScopeUrl(baseUrl)
    ? buildDashScopeTaskUrl(baseUrl, taskId)
    : isVolcengineUrl(baseUrl)
      ? buildVolcengineTaskUrl(baseUrl, taskId)
      : isShishiKejiUrl(baseUrl)
        ? `${baseUrl}/api/task/${encodeURIComponent(taskId)}?refresh_video_url=1`
      : isKlingVideoUrl(baseUrl)
        ? `${baseUrl}${KLING_OMNI_VIDEO_PATH}/${encodeURIComponent(taskId)}`
      : /^https?:\/\//i.test(statusPath)
        ? statusPath.replace("{task_id}", encodeURIComponent(taskId))
        : `${baseUrl}${normalizePath(statusPath || `${OPENAI_VIDEO_GENERATIONS_PATH}/${taskId}`, "")}`;

  let authHeaders;
  try {
    authHeaders = isShishiKejiUrl(upstreamUrl) ? { "X-License-Key": apiKey } : createBearerAuthHeaders(upstreamUrl, apiKey, "video");
  } catch (error) {
    return {
      status: 400,
      payload: {
        error: error instanceof Error ? error.message : String(error),
        code: error?.code || "VIDEO_AUTH_CONFIG_INVALID",
        upstreamUrl,
      },
    };
  }

  const response = await fetch(upstreamUrl, {
    method: "GET",
    headers: authHeaders,
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
        ttsProvider: TTS_PROVIDER,
        ttsBaseUrl: TTS_BASE_URL,
        ttsModel: TTS_MODEL,
        ttsVoice: TTS_VOICE,
        hasTtsApiKey: Boolean(TTS_API_KEY),
        videoBaseUrl: VIDEO_BASE_URL,
        videoModel: VIDEO_MODEL,
        hasVideoApiKey: Boolean(VIDEO_API_KEY),
        videoProviders: {
          shishi: {
            baseUrl: SHISHI_VIDEO_BASE_URL,
            model: SHISHI_VIDEO_MODEL,
            hasApiKey: Boolean(SHISHI_VIDEO_API_KEY),
          },
          wisech: {
            baseUrl: WISECH_VIDEO_BASE_URL,
            model: WISECH_VIDEO_MODEL,
            hasApiKey: Boolean(WISECH_VIDEO_API_KEY),
          },
          kling: {
            baseUrl: KLING_VIDEO_BASE_URL,
            model: KLING_VIDEO_MODEL,
            hasApiKey: Boolean(KLING_VIDEO_API_KEY || KLING_ACCESS_KEY),
            authConfigured: getKlingAuthPublicState(KLING_VIDEO_API_KEY).ok,
            auth: getKlingAuthPublicState(KLING_VIDEO_API_KEY),
            endpoint: KLING_OMNI_VIDEO_PATH,
          },
          toapis: {
            baseUrl: VIDEO_BASE_URL || TOAPIS_BASE_URL,
            model: TOAPIS_VIDEO_MODEL,
            hasApiKey: Boolean(VIDEO_API_KEY || TOAPIS_API_KEY),
          },
        },
      }),
  },
  {
    method: "POST",
    path: "/api/first-frame",
    handler: async ({ body }) => {
      const referenceCheck = validateFourViewImages(body);
      if (!referenceCheck.ok) {
        return createApiResponse(400, { error: referenceCheck.error });
      }
      return proxyJson("/images/edits", buildFirstFramePayload(body), "image");
    },
  },
  {
    method: "POST",
    path: "/api/video",
    handler: async ({ body }) => {
      if (!hasPassingVideoExecutionPackage(body)) {
        return createApiResponse(400, { error: "Please pass first-frame preflight and compile a video execution package before generating video." });
      }
      const firstFrameUrl = getVideoFirstFrameUrl(body);
      if (!firstFrameUrl || !isReadableVideoFirstFrameUrl(firstFrameUrl)) {
        return createApiResponse(400, { error: "Please approve the first frame before generating video." });
      }
      const executionPackage = body.video_execution_package || body.videoExecutionPackage;
      const executionPayload = {
        ...body,
        action_prompt: executionPackage.finalVideoPrompt,
        scene_prompt: executionPackage.storyIntent?.sceneAnchor || body.scene_prompt,
        motion_rule: `Use verified first-frame camera path: ${executionPackage.cameraPath || "front -> front_three_quarter -> front"}`,
      };
      const baseConfig = pickProxyConfig(executionPayload, OPENAI_VIDEO_GENERATIONS_PATH, "video");
      return proxyJson(OPENAI_VIDEO_GENERATIONS_PATH, buildVideoPayload(executionPayload, { compactShishiPrompt: isShishiKejiUrl(baseConfig.upstreamUrl) }), "video");
    },
  },
  {
    method: "POST",
    path: "/api/product-locks",
    handler: async ({ body }) =>
      createApiResponse(200, buildProductLockContract(body.product_type, body.locked_nodes)),
  },
  {
    method: "POST",
    path: "/api/story-intent",
    handler: async ({ body }) => proxyStoryIntent(body),
  },
  {
    method: "POST",
    path: "/api/storyboards",
    handler: async ({ body }) => proxyStoryboards(body),
  },
  {
    method: "POST",
    path: "/api/storyboard-preflight",
    handler: async ({ body }) => createApiResponse(200, buildStoryboardPreflight(body)),
  },
  {
    method: "POST",
    path: "/api/video-package",
    handler: async ({ body }) => createApiResponse(200, buildVideoExecutionPackage(body)),
  },
  {
    method: "POST",
    path: "/api/voiceover",
    handler: async ({ body }) => proxyVoiceover(body),
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
    path: "/api/video-safety",
    handler: async ({ body }) => proxyVideoSafety(body),
  },
  {
    method: "POST",
    path: "/api/video-status",
    handler: async ({ body }) => proxyVideoStatus(body),
  },
  {
    method: "GET",
    path: "/api/video-download",
    handler: async ({ url }) => proxyVideoDownload(url),
  },
  {
    method: "POST",
    path: "/api/save-video-download",
    handler: async ({ body }) => saveVideoDownload(body),
  },
  {
    method: "POST",
    path: "/api/render-post-video",
    handler: async ({ body }) => renderPostVideo(body),
  },
  {
    method: "GET",
    path: "/api/local-video",
    handler: async ({ url, req }) => serveLocalVideo(url, req),
  },
  {
    method: "POST",
    path: "/api/reveal-local-video",
    handler: async ({ body }) => revealLocalVideo(body),
  },
  {
    method: "GET",
    path: "/api/history",
    handler: async () => createApiResponse(200, { ok: true, items: readLocalHistoryItems() }),
  },
  {
    method: "POST",
    path: "/api/history",
    handler: async ({ body }) => createApiResponse(200, { ok: true, items: writeLocalHistoryItems(body?.items) }),
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
        if (!taskId) return createApiResponse(400, { error: "Missing video task id. Please generate again." });
        return proxyVideoStatus({ task_id: taskId });
      },
    };
  }
  if (method === "GET" && pathname.startsWith("/api/history-asset/")) {
    return {
      method,
      path: "/api/history-asset/:file",
      handler: async () => serveHistoryAsset(decodeURIComponent(pathname.replace("/api/history-asset/", ""))),
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
    sendJson(res, 404, { error: "API route not found. Please refresh and try again." });
    return;
  }

  const body = await readRequestBody(req);
  const result = await route.handler({ req, url, body });
  if (result.binary) {
    sendBinary(res, result.status, result.body, result.headers);
    return;
  }
  sendJson(res, result.status, result.payload);
}

const server = http.createServer(async (req, res) => {
  try {
    await handleApiRequest(req, res);
  } catch (error) {
    const statusCode = Number.isFinite(Number(error?.statusCode)) ? Number(error.statusCode) : 500;
    sendJson(res, statusCode, {
      error: toPublicErrorMessage(error instanceof Error ? error.message : ""),
    });
  }
});

server.listen(PORT, () => {
  console.info(`API proxy listening on http://127.0.0.1:${PORT}`);
});
