# Product-Consistency-First Storyboard Video Workflow

## Goal

This project has one fixed product goal: generate short ecommerce-style product videos for the five preset wearable inflatable costumes while preserving product identity and still delivering a readable action beat.

Priority order:

1. Product consistency
2. Video completion: readable motion, prop interaction, and gag payoff
3. Scene clarity
4. Duration

If motion would damage product fidelity, adapt the motion to the closest safe visible version. Do not drop the action entirely, and do not collapse the clip into a barely moving pose.

## Current Scope

The long-lived product set is fixed:

- Shark inflatable costume
- Cow inflatable costume
- Gray mouse inflatable costume
- Frog inflatable costume
- Sumo inflatable costume

Because the product set is fixed, the current workflow does not collect product selling points, price, SKU, discount, channel targeting, CTA, subtitles, signs, captions, overlays, or prompt cards. Reference-video recreation is also out of scope until the five products have strong internal sample videos.

## Visible Workflow

Only three user-facing steps are exposed:

```text
Upload four views -> Story intent and storyboards -> Generate video
```

Product locking is internal. The user does not approve a hidden lock table. The expensive video model is gated by a preflighted video execution package built from confirmed story intent, selected storyboards, product locks, and motion mode.

## 1. Four-View Upload

The upload stage requires four equal core product images:

- Front view
- Left-side view
- Right-side view
- Back view

There is no primary image plus optional reference among the core views. All four core images are product-identity inputs. Users no longer upload detail images. Long-term product presets may include backend-only auxiliary support views for fragile same-product evidence, but those are not a user-facing upload step.

Rules:

- Front, left-side, right-side, and back images are required before story intent and storyboard generation.
- Uploading only the front image must not advance the workflow.
- The frontend sends `image_urls` with exactly four readable images.
- `image_urls` has a fixed semantic order: `image_urls[0]` is front, `image_urls[1]` is left side, `image_urls[2]` is right side, and `image_urls[3]` is back.
- Preset auxiliary support views are sent as `support_image_urls`; they may refine valve position, tail/scarf/belt placement, zipper teeth, stitching, wrinkles, or material, and they are attached automatically by the system.
- The backend rejects `blob:` preview URLs and accepts only `data:image/` or `http(s)` image URLs.
- `foreground_source_url` is not part of this workflow.

## 2. Internal Product Lock

After four-view upload, the system automatically derives a product consistency contract.

The contract includes:

- Category lock: the product remains a wearable inflatable costume.
- Four-view topology: front, left side, right side, and back views define physical placement.
- Fragile details: valve, face window, zipper, tail fin, gill stripes, shoes, wrinkles, seams. Preset auxiliary support views strengthen these local locks only.
- Forbidden changes: no redraw, averaging, collage, relocation, duplication, removal, resizing, restyling, readable text, logos, or new accessories.
- Volume envelope: preserve size, proportion, thickness, and medium-inflated silhouette.

The four views are topology maps for the same physical product, not collage material.

## 3. Story Intent

Before generating storyboards, the system calls the prompt model to create or revise one story/action intent. The user may leave the direction empty, write a rough direction, or ask the model to modify the generated intent.

Story intent output must include:

- A compact story title.
- One coherent action premise.
- A scene anchor.
- Three to five visible beats.
- Product risk notes.

Story intent must not include product sales copy, price, SKU, discount, channel CTA, subtitles, signs, captions, prompt overlays, or post-production text.

## 4. Storyboard Generation

Storyboards are generated from the confirmed story intent plus four-view product locks. They are cheap enough to regenerate multiple times and should absorb the uncertainty that previously reached the video model too late.

Storyboard rules:

- Generate multiple candidates from the same story intent.
- Select at least three and no more than five storyboards for the execution package.
- Each selected storyboard must belong to the same product, scene, and story.
- Each storyboard must carry an action beat, view angle, and check result.
- Hidden side or rear details must stay hidden unless the chosen camera physically reveals them.
- Do not add subtitles, signs, labels, price tags, CTA text, logos, stickers, or readable text anywhere in the scene or on the product.

## 5. Preflight And Execution Package

Checks happen before video generation. They are not a final fake QA score.

Preflight verifies:

- The selected storyboard count is valid.
- No selected storyboard is marked `fail`.
- The storyboards share one product identity, one scene, and one action path.
- The camera path is physically compatible with the four-view topology.
- The prompt and storyboards contain no text-overlay, sales-copy, CTA, price, logo, or sign requirement.
- A start storyboard and an end storyboard are clear.

Only a passing preflight can compile a `video_execution_package`. The package includes the selected storyboard images, story intent, product locks, motion mode, camera path, final video prompt, and risk notes.

## 6. Video Generation

The video model receives the execution package in one request. Video generation should be treated as expensive and should not be triggered by storyboard generation alone.

The video request must inherit:

- Selected storyboard anchor image.
- Four-core-view hard product lock.
- Wearable inflatable category lock.
- View topology lock.
- Volume envelope lock.
- Story intent and selected beat order.
- Camera path and motion mode from the preflighted package.

If the action conflicts with fidelity, preserve the product shell, proportions, and component ownership while adapting the action to the nearest safe visible version. Do not ignore the action, and do not generate a nearly static clip.

## Shark Costume Default Locks

Front:

- White belly panel.
- Horizontal transparent face window.
- Vertical zipper below the window.
- Bright blue border.
- White inner arm-fin panels.
- Blue foot covers and black shoes.

Left / Right Sides:

- Exactly one black circular eye.
- Exactly five black curved gill stripes.
- Orange circular blower valve on the correct side waist, with correct direction and height.
- Stable side fins, side seams, side thickness, and left/right asymmetry.

Back:

- Plain blue back.
- Center back seam.
- Center rear tail fin.
- Back volume must not become an unstructured cylinder.

Preset Auxiliary / Local Evidence:

- Fabric wrinkles.
- Seam tension.
- Valve mesh.
- Transparent face-window reflections.
- Zipper and stitched edges.

## Engineering Contract

Frontend:

- Three steps: upload, storyboard, video.
- Four parallel upload cards.
- Completion disabled until front, left-side, right-side, and back images exist.
- No user-facing detail-image upload is exposed. Long-term product auxiliary views are attached automatically from the local preset.
- Image generation and text prompt generation APIs are fixed backend configuration. The UI must not ask users to enter the image/text API key or base URL.
- The story intent UI calls the prompt model and supports model-driven revision.
- The storyboard UI can regenerate candidates before any video submission.
- The video page uses a read-only final prompt from the execution package.
- Changing product images, product type, story intent, selected storyboards, scene, motion mode, or aspect ratio invalidates old storyboards, execution package, video, and status.
- Product-lock step is hidden.
- Technical URL fields are hidden from users.
- Image previews use `object-fit: contain`.

Backend:

- Image generation and prompt generation use backend `IMAGE_TEXT_BASE_URL` / `IMAGE_TEXT_API_KEY`; this credential must not be passed through browser forms.
- `/api/product-locks` validates exactly four core `image_urls` and returns structured product locks.
- `/api/story-intent` generates or revises story/action intent without sales copy or text overlays.
- `/api/storyboards` requires four core images, a story intent, and product locks before generating storyboard candidates.
- `/api/video-package` runs storyboard preflight and returns the video execution package.
- `/api/video` rejects requests that do not include a passing `video_execution_package`.
- `foreground_source_url` is not accepted.
- Prompts state that four views are topology maps, not collage requirements.
- Prompts state not to average four views into a new product.
- Prompts state not to force physically hidden side or rear details into the chosen camera angle.
- Video prompt inherits the selected storyboard path and four-view product lock.

Validation:

- Run `npm run test:baseline`.
- Browser-check the upload -> story intent -> storyboard -> execution-package -> explicit video submission path.
- Verify `/api/video` is not submitted before `/api/video-package` and `/api/video-safety` pass.
- Browser-check five local product presets, four core parallel upload cards, no detail-image upload area, disabled completion, hidden product-lock step, hidden URL fields, and no horizontal overflow.
