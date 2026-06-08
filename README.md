# Video AI Baselines

This repository contains two protected baselines.

## 电商产品视频 AI 专家工具

当前 baseline 保护的是产品一致性优先的四视图工作流。项目真源文档是：

- `docs/product-video-workflow.zh-CN.md`
- `docs/product-video-workflow.md`

核心逻辑：

- 只露出 4 个步骤：上传四视图、生成首帧、生成视频、视频质检。
- 上传必须是正面、左侧、右侧、背面四张平行核心产品图。
- 细节图是可选补充，只用于强化阀门、脸窗、拉链、缝线、褶皱、材质等易漂移信息。
- “定款/产品锁定”是后台自动约束，不作为用户步骤露出。
- 首帧必须基于 4 张核心 `image_urls`，可附加可选 `detail_image_urls`，不再接受 `foreground_source_url`。
- 首帧审核通过后才能进入视频。
- 换任意产品图、产品类型、场景或画面比例后，旧首帧和旧视频必须作废。
- 产品一致性永远高于动作、场景和时长。
- 构建必须通过。

未来修改首帧、视频、接口代理或错误展示前后，都必须运行：

```bash
npm run test:baseline
```

该命令失败时不要继续发布或推送。

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
