import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

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
const audioBase64 = "SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjYwLjE2LjEwMAAAAAAAAAAAAAAA//uQZAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAADQgD///////////////////////////////////////////8AAAA8TEFNRTMuMTAwAc0AAAAAAAAAABSAJAJAQgAAgAAAA0KJmK4EAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//sQZAAP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEAAAGkAAAAIAAA";

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

async function waitForHttp(url, timeoutMs = 30_000) {
  const start = Date.now();
  let lastError = "";
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = `${response.status} ${response.statusText}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(300);
  }
  throw new Error(`Timed out waiting for ${url}. Last error: ${lastError}`);
}

async function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function expectVisible(page, testId, message) {
  await page.getByTestId(testId).waitFor({ state: "visible", timeout: 20_000 });
  await expect(await page.getByTestId(testId).isVisible(), message);
}

async function expectEnabled(page, testId, message) {
  const locator = page.getByTestId(testId);
  await locator.waitFor({ state: "visible", timeout: 20_000 });
  await expect(await locator.isEnabled(), message);
  return locator;
}

function parseRequest(route) {
  return JSON.parse(route.request().postData() || "{}");
}

async function fulfillJson(route, body) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function main() {
  const port = Number(process.env.BASELINE_UI_PORT || 5189);
  const baseUrl = `http://127.0.0.1:${port}`;
  const firstFrameUrl = `${baseUrl}/baseline-first-frame.png`;
  const baselineVideoBytes = readFileSync(new URL("../public/product-presets/bull-inflatable/reference-01.mp4", import.meta.url));
  const { chromium } = await loadPlaywright();
  const executablePath = resolveChromiumExecutable();
  const vite = startViteServer(port);
  let browser;

  try {
    await waitForHttp(baseUrl);
    browser = await chromium.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    const consoleErrors = [];
    const apiCalls = [];

    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => {
      consoleErrors.push(error.message);
    });

    await page.route("**/api/history", async (route) => {
      apiCalls.push({ route: "history", method: route.request().method() });
      await fulfillJson(route, { ok: true, items: [] });
    });

    await page.route("**/api/first-frame", async (route) => {
      const body = parseRequest(route);
      apiCalls.push({ route: "first-frame", body });
      await expect(body.product_type, "first-frame request must carry product type");
      await expect(Array.isArray(body.image_urls) && body.image_urls.length === 4, "first-frame request must carry four product views");
      await expect(String(body.scene_prompt || "").includes("Halloween"), "first-frame request must consume pasted user script");
      await expect(!String(body.scene_prompt || "").includes("Would You Wear This?"), "post-production copy should be removed from visual prompt");
      await fulfillJson(route, { data: [{ url: firstFrameUrl }] });
    });

    await page.route("**/api/video-package", async (route) => {
      const body = parseRequest(route);
      apiCalls.push({ route: "video-package", body });
      await expect(body.product_type, "video package must carry product type");
      await expect(Array.isArray(body.storyboards) && body.storyboards.length >= 1, "video package must receive approved first frame");
      await expect(body.story_intent?.storyIntent, "video package must keep the source story intent");
      await fulfillJson(route, {
        ok: true,
        preflight: { ok: true, status: "pass", issues: [], cameraPath: "front -> front_three_quarter", selectedStoryboardCount: 1 },
        productType: body.product_type,
        stableProductName: "baseline product",
        storyIntent: body.story_intent,
        motionMode: body.motion_mode,
        selectedStoryboards: body.storyboards,
        productLockContract: { productType: body.product_type, stableProductName: "baseline product", family: "inflatable", locks: [], supplementalLocks: [], forbiddenContent: [] },
        cameraPath: "front -> front_three_quarter",
        finalVideoPrompt: "FINAL VIDEO EXECUTION PACKAGE PROMPT. Use the approved first frame plus four product views. No readable text.",
        createdAt: new Date().toISOString(),
      });
    });

    await page.route("**/api/video-safety", async (route) => {
      const body = parseRequest(route);
      apiCalls.push({ route: "video-safety", body });
      await expect(body.video_execution_package?.ok === true, "video safety must receive a passing execution package");
      await expect(!body.image_url, "video safety payload should omit heavy image payload");
      await fulfillJson(route, { ok: true, verdict: "allowed", promptSummary: { promptChars: 168, promptLimit: 2500 } });
    });

    await page.route("**/api/video", async (route) => {
      const body = parseRequest(route);
      apiCalls.push({ route: "video", body });
      await expect(body.video_execution_package?.ok === true, "video submit must carry the compact passing execution package");
      await expect(body.image_url === firstFrameUrl, "video submit must use the approved first frame as image_url");
      await expect(Array.isArray(body.image_urls) && body.image_urls.length === 4, "Kling direct submit must include the four product views");
      await expect(body.audio === true, "Kling video submit should preserve native sound/effects");
      await expect(body.video_provider === "kling", "video submit must stay on the Kling channel");
      await expect(body.duration >= 0 && body.duration <= 15, "video duration must accept the 0-15 frontend range");
      await delay(400);
      await fulfillJson(route, { video_url: `${baseUrl}/baseline-output.mp4` });
    });

    await page.route("**/api/voiceover", async (route) => {
      const body = parseRequest(route);
      apiCalls.push({ route: "voiceover", body });
      await expect(body.text && body.voiceGender === "male", "voiceover request must carry edited text and selected gender");
      await expect(Number.isFinite(body.start) && Number.isFinite(body.end), "voiceover request must carry the segment timeline");
      await fulfillJson(route, { audioBase64, audioContentType: "audio/mpeg", fileName: `baseline-voiceover-${body.segmentIndex}.mp3` });
    });

    let renderPostCallCount = 0;
    await page.route("**/api/render-post-video", async (route) => {
      const body = parseRequest(route);
      renderPostCallCount += 1;
      apiCalls.push({ route: "render-post-video", body });
      await expect(Array.isArray(body.segments) && body.segments.length > 0, "render request must include subtitle segments");
      if (renderPostCallCount === 1) {
        await expect(body.segments[0]?.start === 0 && body.segments[0]?.end === 4, "render request must keep the edited whole-second first segment");
        await expect(body.segments[0]?.subtitle === "Edited subtitle from user", "one-click render must read the latest edited subtitle");
        await expect(body.segments[0]?.voiceover === "Edited voiceover from user", "one-click render must read the latest edited voiceover");
        await expect(body.segments[1]?.start === 4 && body.segments[1]?.end === 7, "render request must cascade the next segment after edited time");
        await expect(body.includeSubtitles === true, "render request must preserve subtitle toggle");
        await expect(body.includeVoiceover === true, "render request must preserve voiceover toggle");
        await expect(Array.isArray(body.voiceoverClips) && body.voiceoverClips.length > 0, "render request must include per-segment voiceover clips");
        await expect(body.voiceoverClips[0]?.start === body.segments[0]?.start, "first voiceover clip must align to the first segment start");
        await fulfillJson(route, { ok: true, filePath: "C:\\Users\\Administrator\\Downloads\\baseline-output.mp4", fileName: "baseline-output.mp4" });
        return;
      }
      await expect(body.segments[0]?.subtitle === "Edited subtitle from user", "repeat render keeps the saved subtitle text but disables overlay when subtitles are off");
      await expect(body.segments[0]?.voiceover === "Second pass voiceover", "repeat render must read the newest edited voiceover");
      await expect(body.includeSubtitles === false, "turning subtitles off must send includeSubtitles false");
      await expect(body.includeVoiceover === true, "voiceover-only render must keep voiceover on");
      await expect(String(body.sourceVideoUrl || "").includes("baseline-output.mp4"), "repeat render must use the original raw video URL, not the previously rendered local MP4");
      await fulfillJson(route, { ok: true, filePath: "C:\\Users\\Administrator\\Downloads\\baseline-output-voiceonly.mp4", fileName: "baseline-output-voiceonly.mp4" });
    });

    await page.route("**/api/reveal-local-video", async (route) => {
      const body = parseRequest(route);
      apiCalls.push({ route: "reveal-local-video", body });
      await expect(String(body.path || "").endsWith(".mp4"), "reveal request must carry the saved local MP4 path");
      await fulfillJson(route, { ok: true, filePath: body.path });
    });

    await page.route("**/api/local-video?**", async (route) => {
      apiCalls.push({ route: "local-video", method: route.request().method(), url: route.request().url() });
      await route.fulfill({
        status: 200,
        contentType: "video/mp4",
        body: baselineVideoBytes,
        headers: {
          "Content-Type": "video/mp4",
          "Content-Length": String(baselineVideoBytes.length),
          "Accept-Ranges": "bytes",
        },
      });
    });
    await page.route("**/baseline-output.mp4", async (route) => {
      await route.fulfill({ status: 200, contentType: "video/mp4", body: baselineVideoBytes });
    });
    await page.route("**/baseline-first-frame.png", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "image/png",
        body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lL1mAAAAAElFTkSuQmCC", "base64"),
      });
    });

    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await expectVisible(page, "app-shell", "app shell must load");
    await expectVisible(page, "history-panel", "local history panel must be present on the main surface");
    await expectVisible(page, "setup-screen", "combined setup screen must be the first visible screen");
    await expectVisible(page, "upload-screen", "four-view upload controls must be embedded in the setup screen");

    const invalidPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await invalidPage.route("**/api/history", async (route) => {
      await fulfillJson(route, { ok: true, items: [] });
    });
    await invalidPage.route("**/api/first-frame", async (route) => {
      await fulfillJson(route, { data: [{ url: `${baseUrl}/broken-first-frame.png` }] });
    });
    await invalidPage.route("**/broken-first-frame.png", async (route) => {
      await route.fulfill({ status: 404, contentType: "text/plain", body: "missing" });
    });
    await invalidPage.goto(baseUrl, { waitUntil: "networkidle" });
    await invalidPage.getByTestId("script-input").fill("0-3秒\n画面：测试坏首帧链接。\n字幕：\ntest");
    const invalidGenerateButton = invalidPage.getByTestId("generate-first-frame");
    await invalidGenerateButton.waitFor({ state: "visible", timeout: 20_000 });
    await invalidPage.waitForFunction(() => {
      const button = document.querySelector('[data-testid="generate-first-frame"]');
      return button && !button.disabled;
    }, undefined, { timeout: 20_000 });
    await invalidGenerateButton.click();
    await invalidPage.waitForFunction(() => document.body.textContent?.includes("首帧图片地址无法加载"), undefined, { timeout: 10_000 });
    await expect(await invalidPage.getByTestId("confirm-first-frame").isDisabled(), "broken first-frame images must keep confirmation disabled");
    await invalidPage.close();

    const script = `0-3秒
画面：Friends chat at a Halloween party.
字幕：
Everyone's costume this Halloween...

3-6秒
画面：The door opens and the inflatable cow appears.
字幕：
Then THIS guy showed up...

13-15秒
画面：The cow freezes near camera.
字幕：
Halloween MVP
Would You Wear This?`;
    await page.getByTestId("script-input").fill(script);
    await (await expectEnabled(page, "generate-first-frame", "first-frame generation must be enabled after upload")).click();
    await expectVisible(page, "first-frame-card", "first-frame result must render as a selectable card");

    await (await expectEnabled(page, "confirm-first-frame", "approved first frame must enable video package compilation")).click();
    await expectVisible(page, "video-screen", "package compilation should move into the video screen");
    await expectVisible(page, "video-parameter-panel", "video parameters must live in the right inspector");
    await expect((await page.getByTestId("video-provider-select").count()) === 0, "provider selector should be removed from the Kling-only UI");
    await expect((await page.getByTestId("video-model-select").inputValue()) === "kling-v3-omni", "Kling provider should select the official Omni model");
    const modelOptions = await page.getByTestId("video-model-select").locator("option").evaluateAll((options) => options.map((option) => option.textContent || ""));
    await expect(modelOptions.some((label) => label.includes("主力图生视频")), "Kling model options should explain the default model in Chinese");
    await expect(modelOptions.some((label) => label.includes("首尾帧")), "Kling model options should explain the O1 model in Chinese");
    await page.getByTestId("video-duration-input").fill("0");
    await expect((await page.getByTestId("video-duration-input").inputValue()) === "0", "duration input must allow 0");
    await page.getByTestId("video-duration-input").fill("15");
    await expect((await page.getByTestId("video-duration-input").inputValue()) === "15", "duration input must allow 15");
    await expect((await page.getByTestId("video-duration-input").getAttribute("step")) === "1", "video duration input should use whole-second steps");
    await page.getByTestId("aspect-ratio-control").getByText("16:9").click();
    await (await expectEnabled(page, "generate-video", "video generation must be enabled only after package compilation")).click();
    await page.locator(".video-generating-card").waitFor({ state: "visible", timeout: 5_000 });
    const generatingFit = await page.locator(".video-generating-frame img").evaluate((element) => {
      const image = element.getBoundingClientRect();
      const frame = element.parentElement?.getBoundingClientRect();
      const styles = getComputedStyle(element);
      return {
        objectFit: styles.objectFit,
        widthDiff: frame ? Math.abs(image.width - frame.width) : 999,
        heightDiff: frame ? Math.abs(image.height - frame.height) : 999,
      };
    });
    await expect(generatingFit.objectFit === "cover", "approved first frame must fill the generating video container");
    await expect(generatingFit.widthDiff <= 1 && generatingFit.heightDiff <= 1, "approved first frame image element should match the generating container size");
    await page.waitForFunction(() => document.querySelector("video")?.getAttribute("src")?.includes("baseline-output.mp4"), undefined, { timeout: 20_000 });
    const rawVideoSrcBeforeRatioClick = await page.locator("video").first().getAttribute("src");
    await expect(await page.getByTestId("aspect-ratio-control").getByText("1:1").isDisabled(), "aspect ratio buttons should lock after a video asset exists");
    await page.getByTestId("aspect-ratio-control").getByText("1:1").click({ force: true });
    await expect((await page.locator("video").first().getAttribute("src")) === rawVideoSrcBeforeRatioClick, "clicking a locked aspect ratio after video generation must not clear the video preview");
    const rawVideoProgress = await page.evaluate(() => {
      const current = Array.from(document.querySelectorAll(".project-progress-item")).find((item) => item.classList.contains("current"));
      return current?.textContent?.trim() || "";
    });
    await expect(rawVideoProgress === "生成视频", "returned raw video should move progress to generated video");

    await expectVisible(page, "post-production-panel", "subtitle and voiceover editor must appear on the video screen");
    await expect(await page.getByTestId("subtitle-toggle").isChecked(), "subtitle toggle should default on");
    await expect(await page.getByTestId("voiceover-toggle").isChecked(), "voiceover toggle should default on");
    const importedSubtitle = await page.locator(".caption-voice-row textarea").first().inputValue();
    await expect(importedSubtitle.includes("Everyone's costume"), "subtitle labels in the source script should import into the editor");
    await expect((await page.getByTestId("caption-start-0").getAttribute("step")) === "1", "subtitle start time should use whole-second steps");
    await expect((await page.getByTestId("caption-end-0").getAttribute("step")) === "1", "subtitle end time should use whole-second steps");
    await page.getByTestId("caption-end-0").fill("4");
    await expect((await page.getByTestId("caption-start-1").inputValue()) === "4", "editing the first end time should move the next segment start to 4");
    await expect((await page.getByTestId("caption-end-1").inputValue()) === "7", "editing the first end time should keep the next 3-second segment");
    await expect((await page.getByTestId("auto-layout-segments").count()) === 0, "subtitle editor should not expose the removed automatic layout button");
    const segmentCountBeforeAdd = await page.locator(".caption-voice-row").count();
    await page.getByTestId("add-caption-segment").click();
    await expect((await page.locator(".caption-voice-row").count()) === segmentCountBeforeAdd + 1, "subtitle editor should allow adding a 3-second segment");
    await page.locator(".caption-voice-row").last().getByLabel("删除这一条字幕").click();
    await expect((await page.locator(".caption-voice-row").count()) === segmentCountBeforeAdd, "subtitle editor should allow removing a segment");
    await page.locator(".caption-voice-row").first().locator("textarea").nth(0).fill("Edited subtitle from user");
    await page.locator(".caption-voice-row").first().locator("textarea").nth(1).fill("Edited voiceover from user");
    await page.getByTestId("voice-male").click();
    await (await expectEnabled(page, "generate-post-assets", "post-production assets button must be enabled for timed script and returned video")).click();
    await expectVisible(page, "download-location", "one-click post-production should render and save the final MP4");
    await expect((await page.getByTestId("reopen-post-editor").count()) === 0, "completed post-production should not expose a redundant re-edit control");
    await expect((await page.getByTestId("download-location").textContent())?.includes("C:\\Users\\Administrator\\Downloads\\baseline-output.mp4"), "download location must include the exact local saved path");
    await expect((await page.locator("video").first().getAttribute("src"))?.includes("/api/local-video"), "completed post-production should keep the final local MP4 in the preview");
    await page.getByTestId("subtitle-toggle").click();
    await page.locator(".caption-voice-row").first().locator("textarea").nth(1).fill("Second pass voiceover");
    await (await expectEnabled(page, "generate-post-assets", "post-production repeat button must stay enabled after final render")).click();
    await expect((await page.getByTestId("download-location").textContent())?.includes("baseline-output-voiceonly.mp4"), "repeat one-click render should save the latest voiceover-only MP4");
    await page.getByTestId("reveal-final-mp4").click();
    await page.waitForFunction(() => document.body.textContent?.includes("已打开本机文件所在位置"), undefined, { timeout: 10_000 });
    await page.reload({ waitUntil: "networkidle" });
    await expectVisible(page, "video-screen", "refresh should keep the user on the video/post-production screen");
    await expectVisible(page, "project-progress-rail", "left rail should show the project progress timeline");
    const progressState = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".project-progress-item")).map((item) => ({
        label: item.textContent?.trim(),
        current: item.classList.contains("current"),
        color: getComputedStyle(item).color,
      })),
    );
    await expect(progressState.map((item) => item.label).join("|") === "开始任务|生成首帧|生成视频|完成", "project progress should use the four product states");
    await expect(progressState.filter((item) => item.current).length === 1, "project progress should highlight exactly one current state");
    await expect(progressState.find((item) => item.current)?.label === "完成", "saved subtitle/voiceover MP4 should move progress to done");
    await expect(progressState.find((item) => item.current)?.color === "rgb(4, 120, 87)", "current progress state should be green");
    await expectVisible(page, "post-production-panel", "post-production editor should remain visible after refresh");
    await expect((await page.locator("video").first().getAttribute("src"))?.includes("/api/local-video"), "refreshed video screen should keep the final local rendered MP4");

    const orderedRoutes = apiCalls.map((call) => call.route);
    const firstFrameIndex = orderedRoutes.indexOf("first-frame");
    const packageIndex = orderedRoutes.indexOf("video-package");
    const safetyIndex = orderedRoutes.indexOf("video-safety");
    const videoIndex = orderedRoutes.indexOf("video");
    await expect(firstFrameIndex >= 0, "first-frame API must be called");
    await expect(packageIndex > firstFrameIndex, "video package must happen after first-frame approval");
    await expect(safetyIndex > packageIndex, "video safety must happen after package compilation");
    await expect(videoIndex > safetyIndex, "video submit must happen after safety preflight");
    await expect(orderedRoutes.includes("voiceover"), "voiceover API must be reachable from the editor");
    await expect(orderedRoutes.filter((route) => route === "voiceover").length >= 2, "voiceover API should generate audio per timed segment");
    await expect(orderedRoutes.includes("render-post-video"), "download control should render the full subtitle/voiceover MP4");
    await expect(orderedRoutes.includes("reveal-local-video"), "download card should reveal the saved local MP4 in Explorer");

    const meaningfulConsoleErrors = consoleErrors.filter((message) => !/media resource|failed to load because no supported source/i.test(message));
    await expect(meaningfulConsoleErrors.length === 0, `browser console should not contain current errors: ${meaningfulConsoleErrors.join(" | ")}`);

    console.log("PASS UI flow: upload -> first frame -> package -> safety -> video -> subtitle/voiceover editor");
  } finally {
    if (browser) await browser.close();
    vite.child.kill();
  }
}

main().catch((error) => {
  console.error(`FAIL UI flow: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
