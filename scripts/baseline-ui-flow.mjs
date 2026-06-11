import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";

const root = new URL("..", import.meta.url);
const rootPath = fileURLToPath(root);
const runtimeNodeModules = [
  "C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/.pnpm/node_modules",
  "C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules",
];
const chromiumCandidates = [
  "C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1217/chrome-win64/chrome.exe",
  "C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1208/chrome-win64/chrome.exe",
];
const storyboardDataUrls = [
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAGCAIAAAC6PfxkAAAAG0lEQVR4nGP8z4AATAxEwQAwEglGQWQDAH4WAwb4xaz6AAAAAElFTkSuQmCC",
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAHCAIAAACk8H2ZAAAAHklEQVR4nGP8z8AARLJgwiAGJBCkGgYGBoYqAABdWwYcUio+UwAAAABJRU5ErkJggg==",
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAYAAAAECAIAAAAldW7EAAAAGklEQVR4nGP8z8DAwMDAxEAEYBxVSFUBAF9kAwV5S8tDAAAAAElFTkSuQmCC",
];
const manualTimelineScript = `0-3秒

画面：朋友们穿着普通万圣节服装在派对上聊天。

字幕：

Everyone's costume this Halloween...

3-6秒

画面：音乐卡点，门缓缓打开。奶牛充气服出现在门口。

字幕：

Then THIS guy showed up...

6-10秒

画面：奶牛慢动作走进派对，全场目光看过来。

字幕：

Main Character Energy`;
const manualTimelineMarker = "Then THIS guy showed up";

function createRuntimeRequires() {
  const requires = [createRequire(import.meta.url)];
  for (const nodeModulesPath of runtimeNodeModules) {
    try {
      requires.push(createRequire(`${nodeModulesPath}/`));
    } catch {
      // Try the next runtime path.
    }
  }
  return requires;
}

async function loadPlaywright() {
  for (const runtimeRequire of createRuntimeRequires()) {
    for (const moduleName of ["playwright", "playwright-core"]) {
      try {
        return runtimeRequire(moduleName);
      } catch {
        // Try the next package name or runtime path.
      }
    }
  }
  throw new Error("Playwright is unavailable. Install playwright or keep the Codex bundled runtime available.");
}

function resolveChromiumExecutable() {
  return chromiumCandidates.find((candidate) => existsSync(candidate)) || "";
}

function startViteServer(port) {
  const viteBin = fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url));
  const child = spawn(process.execPath, [viteBin, "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: rootPath,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, BROWSER: "none" },
  });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });
  return { child, getOutput: () => output };
}

async function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

async function findAvailablePort(startPort) {
  for (let port = startPort; port < startPort + 50; port += 1) {
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(`No available baseline UI port found from ${startPort} to ${startPort + 49}.`);
}

async function waitForViteHttp(vite, url, timeoutMs = 30_000) {
  const start = Date.now();
  let lastError = "";
  while (Date.now() - start < timeoutMs) {
    if (vite.child.exitCode !== null) {
      throw new Error(`Vite exited before serving ${url}. Output=${vite.getOutput()}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = `${response.status} ${response.statusText}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(300);
  }
  throw new Error(`Timed out waiting for ${url}. Last error: ${lastError}. Vite output=${vite.getOutput()}`);
}

async function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForEnabledButtonMatching(page, predicateSource, message) {
  try {
    await page.waitForFunction(
      (source) => {
        const predicate = new Function("text", `return (${source})(text);`);
        return [...document.querySelectorAll("button")].some((button) => predicate(button.textContent || "") && !button.disabled);
      },
      predicateSource,
      { timeout: 15_000 },
    );
  } catch (error) {
    const buttons = await page.$$eval("button", (items) =>
      items.map((button) => ({
        text: (button.textContent || "").replace(/\s+/g, " ").trim(),
        disabled: button.disabled,
      })),
    );
    throw new Error(`${message}. Buttons=${JSON.stringify(buttons)}. Cause=${error instanceof Error ? error.message : String(error)}`);
  }
  const handles = await page.locator("button").elementHandles();
  for (const handle of handles) {
    const text = (await handle.textContent()) || "";
    const ok = await page.evaluate(
      ([source, value]) => {
        const predicate = new Function("text", `return (${source})(text);`);
        return predicate(value);
      },
      [predicateSource, text],
    );
    if (ok) {
      const button = page.locator("button", { hasText: text.trim() }).first();
      await expect(await button.isEnabled(), message);
      return button;
    }
  }
  throw new Error(message);
}

async function waitForPagePredicate(page, label, predicate, timeout = 15_000) {
  try {
    await page.waitForFunction(predicate, undefined, { timeout });
  } catch (error) {
    const snapshot = await page.evaluate(() => ({
      text: (document.body.textContent || "").replace(/\s+/g, " ").slice(0, 1200),
      buttons: [...document.querySelectorAll("button")].map((button) => ({
        text: (button.textContent || "").replace(/\s+/g, " ").trim(),
        disabled: button.disabled,
      })),
    }));
    throw new Error(`${label} timed out. Buttons=${JSON.stringify(snapshot.buttons)} Text=${snapshot.text}. Cause=${error instanceof Error ? error.message : String(error)}`);
  }
}

async function main() {
  const requestedPort = Number(process.env.BASELINE_UI_PORT || 5179);
  const port = await findAvailablePort(requestedPort);
  const baseUrl = `http://127.0.0.1:${port}`;
  const { chromium } = await loadPlaywright();
  const executablePath = resolveChromiumExecutable();
  const vite = startViteServer(port);
  let browser;

  try {
    await waitForViteHttp(vite, baseUrl);
    browser = await chromium.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    const apiCalls = [];

    await page.route("**/api/story-intent", async (route) => {
      const body = JSON.parse(route.request().postData() || "{}");
      apiCalls.push({ route: "story-intent", body });
      await expect(body.product_type && Array.isArray(body.locked_nodes), "story intent request must carry product and locks");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          storyTitle: "baseline micro gag",
          storyIntent: "A wearable inflatable product notices a tiny misplaced prop, performs a clear small gesture, then freezes in a funny recovery pose.",
          sceneAnchor: "A clean everyday store aisle with a small prop on a low shelf and no readable text.",
          motionMode: body.motion_mode || "strict",
          productType: body.product_type,
          stableProductName: "baseline product",
          beats: [
            { id: "beat_1", beat: "notice prop", action: "one arm points toward a tiny prop", camera: "front", risk: "keep feet grounded" },
            { id: "beat_2", beat: "tiny recoil", action: "body wobbles back half a step", camera: "front_three_quarter", risk: "no large turn" },
            { id: "beat_3", beat: "recovery pose", action: "returns to front and freezes", camera: "front", risk: "no text" },
          ],
          riskNotes: ["no text", "no CTA", "no reference video"],
          model: "baseline-prompt-model",
          upstreamUrl: "mock://story-intent",
        }),
      });
    });

    await page.route("**/api/storyboards", async (route) => {
      const body = JSON.parse(route.request().postData() || "{}");
      apiCalls.push({ route: "storyboards", body });
      await expect(Array.isArray(body.image_urls) && body.image_urls.length === 4, "storyboard request must include four product views");
      await expect(body.story_intent && body.story_intent.storyIntent, "storyboard request must inherit story intent");
      await expect(body.story_intent.storyIntent.includes(manualTimelineMarker), "storyboard request must inherit manual timeline script");
      await expect(body.story_intent.beats?.[0]?.beat === "0-3秒", "manual timeline must parse timed beats");
      await expect(!("reference_video_count" in body), "storyboard request must not depend on reference videos");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          storyboards: storyboardDataUrls.map((imageUrl, index) => ({
            id: `storyboard_${index + 1}`,
            imageUrl,
            beat: body.story_intent.beats[index].beat,
            action: body.story_intent.beats[index].action,
            viewAngle: body.story_intent.beats[index].camera,
            checks: [{ id: "product_contract", status: "pending", detail: "ready" }],
          })),
        }),
      });
    });

    await page.route("**/api/video-package", async (route) => {
      const body = JSON.parse(route.request().postData() || "{}");
      apiCalls.push({ route: "video-package", body });
      await expect(Array.isArray(body.storyboards) && body.storyboards.length >= 3, "video package must receive selected storyboards");
      await expect(body.story_intent?.storyIntent?.includes(manualTimelineMarker), "video package must receive manual timeline script");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          preflight: { ok: true, status: "pass", issues: [], cameraPath: "front -> front_three_quarter -> front", selectedStoryboardCount: 3 },
          productType: body.product_type,
          stableProductName: "baseline product",
          storyIntent: body.story_intent,
          motionMode: body.motion_mode,
          selectedStoryboards: body.storyboards,
          productLockContract: { productType: body.product_type, stableProductName: "baseline product", family: "inflatable", locks: [], supplementalLocks: [], forbiddenContent: [] },
          cameraPath: "front -> front_three_quarter -> front",
          finalVideoPrompt: "FINAL VIDEO EXECUTION PACKAGE PROMPT. Follow selected storyboard path and preserve product identity. No CTA or readable text.",
          createdAt: new Date().toISOString(),
        }),
      });
    });

    await page.route("**/api/video-safety", async (route) => {
      const body = JSON.parse(route.request().postData() || "{}");
      apiCalls.push({ route: "video-safety", body });
      await expect(body.video_provider === "wisech", "video safety must use Wisech as the only provider");
      await expect(body.video_execution_package?.ok === true, "video safety must receive a passing execution package");
      await expect(body.story_intent?.storyIntent?.includes(manualTimelineMarker), "video safety must carry manual timeline script context");
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, verdict: "allowed", promptSummary: { promptChars: 120, promptLimit: 2000 } }) });
    });

    await page.route("**/api/video", async (route) => {
      const body = JSON.parse(route.request().postData() || "{}");
      apiCalls.push({ route: "video", body });
      await expect(body.video_provider === "wisech", "video submit must use Wisech as the only provider");
      await expect(body.video_execution_package?.ok === true, "video submit must carry passing execution package");
      await expect(body.story_intent?.storyIntent?.includes(manualTimelineMarker), "video submit must carry manual timeline script context");
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ task_id: "baseline-video-task" }) });
    });

    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.waitForSelector(".stage-panel", { timeout: 20_000 });

    await expect(await page.locator("button.dice-action").count() === 0, "story dice must not be visible before upload is completed");
    await expect(apiCalls.filter((call) => call.route === "video").length === 0, "video must not submit on initial load");

    const productSelect = page.locator("select").first();
    await productSelect.selectOption({ index: 2 });
    const completeUpload = await waitForEnabledButtonMatching(page, "text => text.includes('上传完成') || text.includes('涓婁紶瀹屾垚')", "upload completion must be enabled for preset product views");
    await completeUpload.click();

    await waitForPagePredicate(page, "manual timeline storyboard step", () => document.body.textContent?.includes("脚本与首帧分镜") && document.querySelector(".story-direction-field textarea") !== null);
    await expect(await page.locator("button.dice-action").count() === 0, "story dice must stay hidden after upload");
    await expect(!(await page.locator("body").textContent())?.includes("测试分镜接口"), "storyboard API test button must stay hidden");
    await expect(await page.locator(".storyboard-set-card").count() === 0, "storyboards should not exist before story intent and storyboard generation");
    await expect(apiCalls.filter((call) => call.route === "video").length === 0, "video must not submit before package compile");

    await page.locator(".story-direction-field textarea").fill(manualTimelineScript);
    await page.locator("button.manual-story-action").click();
    await waitForPagePredicate(page, "manual story intent render", () => document.body.textContent?.includes("Then THIS guy showed up"));

    const storyboardButton = await waitForEnabledButtonMatching(page, "text => text.includes('生成首帧分镜') || text.includes('生成分镜') || text.includes('鐢熸垚鍒嗛暅')", "storyboard generation must be enabled after story intent confirmation");
    await storyboardButton.click();
    await waitForPagePredicate(page, "storyboards render", () => document.querySelectorAll(".storyboard-set-card").length === 1 && document.querySelectorAll(".storyboard-shot").length >= 3, 20_000);
    await expect(await page.locator(".storyboard-frame-image-button").count() === 3, "storyboard must render exactly three clickable image frames");
    const renderedStoryboardImages = await page.$$eval(".storyboard-frame-image-button img", (images) => images.map((image) => image.getAttribute("src") || ""));
    await expect(new Set(renderedStoryboardImages).size === 3, "storyboard frame images must stay separate instead of reusing one collage/image");
    const storyboardText = (await page.locator(".storyboard-set-card").textContent()) || "";
    for (const forbiddenAnnotation of ["front_three_quarter", "tiny recoil", "recovery pose", "body wobbles", "returns to front", "notice prop"]) {
      await expect(!storyboardText.includes(forbiddenAnnotation), `storyboard annotation must not expose English text: ${forbiddenAnnotation}`);
    }
    await expect(await page.locator(".storyboard-regenerate-toggle").count() === 0, "selective storyboard regeneration must not be visible in the lean flow");
    await expect(await page.locator(".storyboard-frame-card.needs-regenerate").count() === 0, "storyboard cards must not expose regeneration state");
    await expect(apiCalls.filter((call) => call.route === "video").length === 0, "video must not submit after storyboard generation alone");

    const packageButton = await waitForEnabledButtonMatching(page, "text => text.includes('进入视频生成') || text.includes('进入生成视频') || text.includes('鐢熸垚瑙嗛')", "package compile must be enabled after storyboards");
    const [packageResponse] = await Promise.all([
      page.waitForResponse((response) => response.url().includes("/api/video-package"), { timeout: 15_000 }),
      packageButton.click(),
    ]);
    await expect(packageResponse.ok(), "video package request must succeed");
    await waitForPagePredicate(page, "execution package render", () => document.querySelector(".video-package-summary") !== null && [...document.querySelectorAll("button")].some((button) => (button.textContent || "").includes("生成视频") || (button.textContent || "").includes("鐢熸垚瑙嗘")), 20_000);
    await expect((await page.locator("body").textContent())?.includes("Wisech / 云书 Seedance"), "video step must show fixed Wisech provider");
    await expect(!(await page.locator("body").textContent())?.includes("FINAL VIDEO EXECUTION PACKAGE PROMPT"), "raw final video prompt must not be visible in the frontend");
    await expect(!(await page.locator("body").textContent())?.includes("视频接口"), "video API URL field must stay hidden");
    await expect(!(await page.locator("body").textContent())?.includes("视频 API Key"), "video API key field must stay hidden");
    await expect(!(await page.locator("body").textContent())?.includes("测试接口"), "video API test button must stay hidden");
    await expect(apiCalls.filter((call) => call.route === "video").length === 0, "compiling package must not auto-submit video");

    const videoButton = await waitForEnabledButtonMatching(page, "text => text.includes('生成视频') || text.includes('鐢熸垚瑙嗘')", "video generation must be enabled only after package compile");
    await videoButton.click();
    await waitForPagePredicate(page, "video task id render", () => document.body.textContent?.includes("baseline-video-task"));

    await expect(apiCalls.filter((call) => call.route === "story-intent").length === 0, "manual timeline confirmation must not call story intent model");
    await expect(apiCalls.filter((call) => call.route === "storyboards").length === 1, "storyboards must be called once");
    await expect(apiCalls.filter((call) => call.route === "video-package").length === 1, "video package must be called once");
    await expect(apiCalls.filter((call) => call.route === "video-safety").length === 1, "video safety must run before video submit");
    await expect(apiCalls.filter((call) => call.route === "video").length === 1, "video submit must happen only after explicit click");
    console.log("PASS UI flow: upload -> manual timeline script -> storyboards -> execution package -> explicit video submit");
  } finally {
    if (browser) await browser.close();
    vite.child.kill();
  }
}

main().catch((error) => {
  console.error(`FAIL UI flow: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
