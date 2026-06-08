# Product-Consistency-First Four-View Image-to-Video Workflow

## Goal

This project has one fixed product goal: generate ecommerce product videos while preserving product identity before motion, scene richness, or duration.

Priority order:

1. Product consistency
2. Interesting motion
3. Rich scene
4. Longer duration

If motion or scene richness conflicts with product fidelity, product fidelity wins.

## Visible Workflow

Only four user-facing steps are exposed:

```text
Upload four views -> Generate first frame -> Generate video -> QA video
```

The product-lock step is internal and automatic. It must not appear as a separate user step, and users should not click through a redundant product-lock confirmation. Users approve the generated first frame instead.

## 1. Four-View Upload

The upload stage requires four equal core product images:

- Front view
- Left-side view
- Right-side view
- Back view

There is no primary image plus optional reference among the core views. All four core images are product-identity inputs. Users no longer upload detail images. Long-term product presets may include backend-only auxiliary support views for fragile same-product evidence, but those are not a user-facing upload step.

Rules:

- Front, left-side, right-side, and back images are required before first-frame generation.
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
- Forbidden changes: no redraw, averaging, collage, relocation, duplication, removal, resizing, or restyling.
- Volume envelope: preserve size, proportion, thickness, and medium-inflated silhouette.

The four views are topology maps for the same physical product, not collage material.

## 3. First Frame

The first-frame model solves only this task:

```text
Create one product-in-scene image while preserving the product structure defined by all four views.
```

Rules:

- Use the four uploaded core images as equal topology constraints.
- Use preset `support_image_urls` only as auxiliary same-product evidence.
- Product consistency outranks the user scene prompt.
- Do not average four images into a new product.
- Do not combine all visible details into an impossible surface.
- Choose one physically valid camera family: front, left side, right side, or rear.
- Hide details that are not visible from the chosen angle instead of moving them.
- Keep the full product visible from the chosen camera and avoid cropping physically visible critical details.
- Do not force hidden side or rear details into a front-facing frame. For example, the side valve may be hidden or only barely visible in a front camera, and the rear tail fin should stay hidden unless the camera is rear-facing.

## 4. First-Frame Review

The generated first frame must be approved before video generation.

Review checklist:

- Same wearable inflatable product.
- Same size, proportion, silhouette, thickness, and inflation level.
- Critical details are present and in the correct physical locations, including left/right side asymmetry and valve direction.
- No invented limbs, fins, tails, valves, windows, mouths, teeth, logos, or accessories.
- No key product detail is cropped or hidden by the scene.

All critical checklist items must be explicitly judged as pass or fail before the first frame can be approved. Any failed critical item means the first frame fails and must be regenerated; do not approve by leaving failed details unchecked.

If the first frame fails, do not proceed to video.

## 5. Video

The video model animates the approved first frame only. It does not reinterpret the product.

The approved first frame is the direct video media input. The four views remain a text contract and metadata lock unless the selected video API explicitly supports extra visual references. To avoid exposing unverified sides, keep the camera inside the approved first-frame view family by default.

Default high-consistency motion budget:

- 0-8 degrees rotation
- Tiny bounce
- Small fin/arm movement
- Tiny one-step shuffle
- No turn-around, long walk, jump, fast dance, scene cut, or unapproved new angle

The video prompt must inherit:

- Approved first frame
- Four-core-view hard product lock
- Wearable inflatable category lock
- View topology lock
- Volume envelope lock
- User action prompt at lower priority than product fidelity

If the action conflicts with fidelity, ignore the action.

## 6. QA And Retry

Review at least five points:

- 0%
- 25%
- 50%
- 75%
- 100%

Pass criteria:

- Product accuracy at least 90.
- Motion interest target at least 70.
- Scene richness target at least 60.
- Duration is informational only.

If product accuracy fails, retry by reducing motion, simplifying scene, using a more static camera, strengthening fragile-detail locks, and shortening duration if needed.

If the scene is good but the product drifts, the generation fails.

## Shark Costume Default Locks

Front:

- White belly panel
- Horizontal transparent face window
- Vertical zipper below the window
- Bright blue border
- White inner arm-fin panels
- Blue foot covers and black shoes

Left / Right Sides:

- Exactly one black circular eye
- Exactly five black curved gill stripes
- Orange circular blower valve on the correct side waist, with correct direction and height
- Stable side fins, side seams, side thickness, and left/right asymmetry

Back:

- Plain blue back
- Center back seam
- Center rear tail fin
- Back volume must not become an unstructured cylinder

Preset Auxiliary / Local Evidence:

- Fabric wrinkles
- Seam tension
- Valve mesh
- Transparent face-window reflections
- Zipper and stitched edges

## Engineering Contract

Frontend:

- Four parallel upload cards.
- Completion disabled until front, left-side, right-side, and back images exist.
- No user-facing detail-image upload is exposed. Long-term product auxiliary views are attached automatically from the local preset.
- Image generation and text prompt generation APIs are fixed backend configuration. The UI must not ask users to enter the image/text API key or base URL.
- Video generation API controls may remain in the UI because the video service can be switched independently.
- Changing product images, product type, scene, or aspect ratio invalidates old first frame, video, and QA state.
- Product-lock step is hidden.
- Technical URL fields are hidden from users.
- Image previews use `object-fit: contain`.

Backend:

- Image generation and prompt generation use backend `IMAGE_TEXT_BASE_URL` / `IMAGE_TEXT_API_KEY`; this credential must not be passed through browser forms.
- `/api/first-frame` validates exactly four core `image_urls`.
- `/api/first-frame` labels the four core images with their fixed view roles before sending them to multimodal image generation.
- `/api/first-frame` may accept preset `support_image_urls` as same-product local-evidence supplements.
- `foreground_source_url` is not accepted.
- Prompt states that four views are topology maps, not collage requirements.
- Prompt states not to average four views into a new product.
- Prompt states not to force physically hidden side or rear details into the chosen camera angle.
- Video prompt inherits approved first frame and four-view product lock.

Validation:

- Run `npm run test:baseline`.
- Browser-check four visible steps, five local product presets, four core parallel upload cards, no detail-image upload area, disabled completion, hidden product-lock step, hidden URL fields, and no horizontal overflow.
- API-check fewer than four images are rejected, and four readable images pass four-view validation before API-key validation.
