# Video AI Baselines

This repository contains two protected baselines.

## 电商产品视频 AI 专家工具

当前 baseline 保护的是产品一致性优先、分镜驱动的视频生成工作流。项目真源文档是：

- `docs/product-video-workflow.zh-CN.md`
- `docs/product-video-workflow.md`

核心逻辑：

- 只露出 3 个步骤：上传四视图、剧情分镜、生成视频。
- 上传必须是正面、左侧、右侧、背面四张平行核心产品图。
- 本地预设辅助角度只在后台使用，用于强化阀门、脸窗、拉链、缝线、褶皱、材质等易漂移信息。
- “定款/产品锁定”是后台自动约束，不作为用户步骤露出。
- 剧情/动作意图先由大模型生成或改写，确认后再生成候选分镜。
- 分镜可以多次生成和筛选；昂贵的视频生成必须先通过分镜预检并编译执行包。
- 换任意产品图、产品类型、剧情、分镜、场景或画面比例后，旧分镜、旧执行包和旧视频必须作废。
- 产品一致性永远高于动作、场景和时长。
- 构建必须通过。

未来修改分镜、视频、接口代理或错误展示前后，都必须运行：

```bash
npm run test:baseline
```

该命令失败时不要继续发布或推送。

This command now protects three layers:

- Production build: TypeScript and Vite must still compile.
- Static workflow contract: `scripts/baseline-check.mjs` guards the product lock, BACK_VIEW rear-surface authority, story intent, first frame, execution package, Kling-only video, history migration, local video serving, subtitle/voiceover rendering, saved MP4 download, and local-file reveal invariants.
- Browser user path: `scripts/baseline-ui-flow.mjs` runs the real frontend with mocked upstream APIs and verifies preset upload -> first frame -> execution package -> safety preflight -> explicit video submission -> subtitle/voiceover editor -> browser MP4 download -> local Explorer reveal -> refresh persistence. It must not submit `/api/video` before `/api/video-package` and `/api/video-safety` pass. The download flow must show the saved local file path after the browser download is triggered, and "打开所在位置" must call `/api/reveal-local-video` with the saved `.mp4` path instead of opening the browser video URL.
- Workspace persistence: a refresh must keep the user on the current workflow screen, especially the video/post-production screen with the generated video still loaded. React StrictMode or preset-loading effects must not clear restored workspace state.

Future changes to product consistency prompts, four-view mapping, BACK_VIEW rear details, subtitle/voiceover rendering, history assets, download/open-location behavior, or workspace refresh/state persistence must run `npm run test:baseline` before and after the change.

## Aircraft Model Interaction Video

This baseline protects the verified interaction-edit workflow for the aircraft model generation platform video.

Protected behavior:

- The accepted v5 edit is `93s` long.
- The video is `1750x1244` at `30fps`.
- The final 3-second tail frame contains only the glowing `Toni.asia` wordmark.
- The exported file has an AAC stereo BGM track.
- The current golden export SHA256 is recorded in `video_interaction_analysis/baseline_manifest.json`.

Run the baseline before and after future video-edit changes:

```powershell
python video_interaction_analysis/check_video_baseline.py
```

The command exits non-zero if the golden export is missing or its media properties/hash no longer match the accepted baseline.
