# Provider-specific video harness

## Goal

The video request must be shaped by provider/model capability, not by a single generic payload.
Three storyboard frames are always used in the prompt package, but only models that explicitly support frame or reference image inputs receive them visually.

## Capability table

| Provider/model | Visual mode used by product | Visual fields sent | What happens to 3 storyboard frames |
|---|---|---|---|
| ToAPI `kling-v3` | first + last frame, plus normal references when public URLs exist | `image_with_roles`, `reference_images` | frame 1 = `first_frame`; frame 3 = `last_frame`; frame 2 can only be a normal reference, not a timed keyframe |
| ToAPI `seedance-2-fast` | first + last frame | `image_with_roles` | frame 1 = `first_frame`; frame 3 = `last_frame`; frame 2 remains prompt-only because Seedance 2 frame mode and reference mode are mutually exclusive |
| ToAPI `doubao-seedance-1-5-pro` | first + last frame | `image_with_roles` | frame 1 = `first_frame`; frame 3 = `last_frame`; frame 2 remains prompt-only because 1.5 Pro does not support reference images |
| ToAPI `grok-video-3` | single image-to-video anchor | `images` | frame 1 is sent as the only image; frames 2-3 remain prompt-only until this channel documents multi-reference support |
| Wisech / Yunshu Seedance | first + last frame | `image_with_roles` | treated as Seedance-style first/last-frame control; references stay disabled until channel docs confirm support |
| DashScope Wan | first + last frame | `input.media[]` with `first_frame` / `last_frame` | frame 1 = `first_frame`; frame 3 = `last_frame`; frame 2 remains prompt-only |
| Volcengine Seedance-compatible native endpoint | first + last frame | `content[]` image items with `role` | frame 1 = `first_frame`; frame 3 = `last_frame`; frame 2 remains prompt-only |

## Runtime behavior

- `/api/video-safety` now returns `visualSummary` before the expensive video submit.
- The frontend progress panel displays that summary before calling `/api/video`.
- Unsupported fields are downgraded explicitly. For example, Seedance 2 does not receive `reference_images` when using `first_frame` / `last_frame`.
- The harness distinguishes these counts:
  - `stageFramesSubmittedVisually`: storyboard frames actually sent as frame/reference image inputs.
  - `stageFramesUsedInPrompt`: storyboard frames described in the video prompt package.
  - `unsupportedVisualInputs`: which visual inputs were dropped or downgraded.

## Research sources

- ToAPI Kling v3 docs: `image_with_roles` supports `first_frame`, `last_frame`, `reference`, and `reference_image`; `reference_images` are normal references and are not inferred as frame controls.
- ToAPI Seedance 2 docs: `first_frame` / `last_frame` and `reference_image` modes are mutually exclusive; `reference_image` supports up to 9 images only in reference mode.
- ToAPI Doubao Seedance 1.5 Pro docs: supports first/last frame, does not support `reference_image`.
- ToAPI Grok docs/model guide: use one image for image-to-video until channel-specific multi-reference fields are documented.
- xAI official docs: direct xAI reference-to-video supports up to 7 references, but that is not automatically equivalent to the ToAPI Grok channel.
