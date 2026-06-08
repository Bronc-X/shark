# 视频产品一致性问题交接文档

## 1. 找到的具体问题

这次问题不是单纯“Prompt 约束不够强”，而是视频生成链路里首帧没有被上游视频接口可靠识别为图生视频的首帧输入。

前端已经把用户确认后的首帧 URL 放进视频请求里：

```ts
image_url: approvedFirstFrameUrl
```

但后端转发给当前 New API / Seedance 风格的视频接口时，原本基本只保留了 `image_url` 这个字段。根据当前视频接口形态，图生视频更可能识别的字段是：

- `image`
- `metadata.image_urls`
- `image_with_roles`，其中 `role` 为 `first_frame`

因此上游视频模型很可能没有真正吃到“已确认首帧”，而是退化成纯文生视频或弱参考视频。结果就是：即使首帧本身看起来没问题，视频一开始就重新生成了一个产品，导致外形、角度、体积、面部比例、手部和道具关系全部漂移。

另外还发现了一个 Prompt 层面的次要问题：

- 之前为了避免模型乱加道具，曾写过“禁止新增手持物”的强约束。
- 用户明确指出手持物可以有，真正要限制的是手持物不能导致产品本体重绘。
- 所以这部分已改成：允许杯子、袋子、工具、标牌等外部剧情道具，但它们不能遮挡、替代或改写产品组件。

## 2. 复现出来的问题情况

用户提供的异常视频：

```text
C:/Users/Administrator/Desktop/02178066283589900000000000000000000ffffac149177324ab7.mp4
```

对应首帧是灰色老鼠充气服在便利店薯片货架前：

- 角度是偏侧前方的便利店货架场景。
- 产品是灰色老鼠充气服。
- 左手拿价签，右手拿薯片袋。
- 可见白鞋、真人手、灰色圆形鼠头、米色腹部、突出鼻嘴、侧后方尾巴。

但生成出来的视频表现为：

- 视频没有稳定从首帧角度出发，产品角度和镜头构图发生大变化。
- 鼠头、鼻嘴、脸部比例被重新设计。
- 身体体积、腹部形状、手臂和道具关系发生明显变化。
- 画面像是重新生成了一个“老鼠卡通服”，而不是让已确认首帧动起来。

这说明视频模型没有把首帧当成不可变的像素级身份锚点。单靠文字里写“保持产品一致性”无法阻止这种漂移，因为视频模型实际输入层面没有被强制绑定首帧。

在本地验证中，还复现了一个危险路径：

- 如果视频请求没有可读首帧，后端原先仍可能继续把请求转发给上游。
- 这样会静默退化成纯文生视频。
- 修复后，本地调用 `/api/video` 且传入占位值 `PASTE_APPROVED_FIRST_FRAME_URL` 时，后端会返回 400：

```json
{
  "error": "视频生成必须提交已确认首帧 image_url，且必须是 http(s) 或 data:image 地址；不能退化成纯文生视频。"
}
```

## 3. 具体的修复方法

### 3.1 后端把首帧映射成上游可识别字段

修改文件：

```text
server/index.js
```

新增了首帧读取和校验：

- `getVideoFirstFrameUrl(payload)`
- `isReadableVideoFirstFrameUrl(value)`

新增了 OpenAI-compatible / New API 视频 payload 构造：

- `buildOpenAICompatibleVideoPayload(payload, upstreamUrl)`

现在后端会把同一个已确认首帧同时传成多种上游常见字段：

```js
{
  image: firstFrameUrl,
  metadata: {
    image_urls: [firstFrameUrl],
    image_with_roles: [
      {
        url: firstFrameUrl,
        role: "first_frame",
      },
    ],
  },
}
```

如果用户配置的是 `/videos/generations` 这种复数路径，也会用：

```js
{
  image_with_roles: [
    {
      url: firstFrameUrl,
      role: "first_frame",
    },
  ],
}
```

这样做的目的：

- 避免只传 `image_url` 导致上游不识别。
- 最大化兼容 New API / Seedance / Jimeng 风格通道。
- 确保视频模型至少有机会真正以“已确认首帧”为图生视频输入。

### 3.2 后端禁止缺首帧时继续生成视频

修改位置：

```text
server/index.js
```

`POST /api/video` 里增加硬校验：

```js
const firstFrameUrl = getVideoFirstFrameUrl(body);
if (!firstFrameUrl || !isReadableVideoFirstFrameUrl(firstFrameUrl)) {
  sendJson(res, 400, {
    error: "视频生成必须提交已确认首帧 image_url，且必须是 http(s) 或 data:image 地址；不能退化成纯文生视频。",
  });
  return;
}
```

这保证：

- 视频生成必须有已确认首帧。
- 首帧必须是 `http(s)` 或 `data:image`。
- 不能再静默退化成纯文生视频。

### 3.3 五个产品的视频一致性锁已统一加固

修改位置：

```text
server/index.js
src/App.tsx
```

五个产品都已经有视频阶段硬锁：

- 鲨鱼：小号浅弧横向梯形脸窗、柔和偏青蓝色、偏扁轻度欠充气身体、短手鳍、尾鳍、侧腰阀门。
- 奶牛：双角、耳朵、黑白斑、粉色鼻口、粉色乳房、蹄套、尾巴、后侧阀门。
- 灰色老鼠：圆耳、突出鼻嘴、米色腹部、尾巴、真人手/鞋、背部绿色阀门和拉链。
- 青蛙：顶部凸眼、小号脸窗、大黑色弧形嘴带、蓝围巾、黑斑、蹼手蹼脚、可见鞋子、后背橙色阀门。
- 相扑：黑色腰带兜裆、肚脐点、发髻帽、T 形侧面轮廓、后阀、背部拉链。

同时已把手持道具规则改成：

- 允许手持杯子、袋子、工具、标牌等外部剧情道具。
- 道具不能变成产品新增组件。
- 道具不能遮挡、替代或改写脸窗、嘴带、手脚、鞋子、阀门、拉链、尾部、色块、缝线和身体轮廓。

### 3.4 增加 baseline 回归检查

修改文件：

```text
scripts/baseline-check.mjs
```

新增检查点：

- 后端必须存在 `buildOpenAICompatibleVideoPayload`。
- 后端必须存在 `getVideoFirstFrameUrl`。
- 视频 payload 必须包含：
  - `image_with_roles`
  - `role: "first_frame"`
  - `metadata`
  - `image_urls: [firstFrameUrl]`
- 后端必须包含“视频生成必须提交已确认首帧 image_url”的 400 校验。
- 保留五个产品的视频一致性锁和手持道具安全规则。

验证命令：

```powershell
npm run test:baseline
```

当前结果：已通过。

## 4. 当前服务状态

项目路径：

```text
C:/Users/Administrator/.codex/worktrees/5f5e/图生视频平台
```

前端：

```text
http://localhost:5173/
```

后端：

```text
http://127.0.0.1:8787
```

后端健康检查：

```text
http://127.0.0.1:8787/api/health
```

健康检查已确认：

- `imageTextBaseUrl`: `https://aicanapi.com/v1`
- `videoBaseUrl`: `https://ai.wisech.com/v1`
- `videoModel`: `doubao-seedance-2-0-fast-260128`
- `hasVideoApiKey`: `true`

## 5. 新对话继续排查时的重点

如果新对话继续处理这个问题，请优先检查：

1. 新生成视频的上游请求是否真的包含 `image` / `metadata.image_urls` / `image_with_roles`。
2. 上游实际返回的视频第一帧是否和已确认首帧角度、外形、产品比例一致。
3. 如果仍然大幅漂移，说明该视频通道对首帧约束弱，需要继续调整字段组合或更换图生视频模型。
4. 不要再只靠加 Prompt 解决，因为这次根因是首帧图片字段没有被视频接口可靠识别。

一句话总结：

```text
这次产品一致性崩掉的根因，很可能是视频 API 没真正吃到已确认首帧；修复方向是把首帧作为图生视频强输入传给上游，并禁止缺首帧时退化成纯文生视频。
```
