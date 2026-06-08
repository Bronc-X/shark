# Shark Costume Four-View Test Run

## Test Goal

Validate the four-view workflow defined in `docs/product-video-workflow.md`: product consistency comes before motion, scene richness, and duration.

Priority:

1. Product accuracy
2. Interesting motion
3. Scene richness
4. Longer duration

If the scene is good but the shark costume drifts, the test fails.

## 1. Four-View Upload

Upload four core parallel product images:

- Front view: white belly, horizontal transparent face window, vertical zipper, blue border, feet proportions.
- Left-side view: left silhouette, side thickness, and visible left eye/gill/fin/seam information.
- Right-side view: right silhouette, orange blower valve direction and height, right fin, side seam, shoes.
- Back view: plain blue back, centered tail fin, back seam, black shoes.

Optional detail images may supplement valve mesh, face-window reflections, zipper, stitching, wrinkles, or material. The workflow must not enter first-frame generation until the front, left-side, right-side, and back images exist; detail images do not block the workflow.

## 2. Internal Locks

The system locks these shark costume constraints internally. The user does not confirm them as a separate step.

- The product must remain a wearable inflatable costume, not a real shark, cartoon shark, plush toy, CGI creature, or mascot.
- Front belly, transparent window, and zipper belong only to the front surface.
- Left and right side views define their own eye, gill, valve, fin, seam, thickness, and asymmetry placement.
- Center rear tail fin and back seam belong only to the back surface.
- Optional detail images confirm local material, stitching, valve, and face-window details; they must not become new decoration or a fifth topology surface.
- Product size, proportion, volume envelope, and medium-inflated silhouette must stay stable.

## 3. First Frame

Example scene:

```text
A bright supermarket seafood section. A person wearing the shark inflatable costume stands in front of an iced fish counter, looking down as if seriously choosing dinner. Slight comedy, realistic ecommerce short-video feel.
```

Rules:

- Generate from all four core images, with optional detail images as local supplements.
- Do not average the four images into a new product.
- Do not collage the four views into an impossible surface.
- Prefer front or slight front three-quarter by default.
- Hide side/back details that are not visible instead of relocating them.
- Keep the full product visible and avoid cropping feet, valve, face window, and tail fin.

## 4. First-Frame Review

Approve the first frame before video.

Checklist:

- [ ] The shark costume is the same wearable inflatable product.
- [ ] Size, proportions, shape, and medium-inflated silhouette are correct.
- [ ] Front white belly, transparent face window, and vertical zipper are correct.
- [ ] Left/right side thickness, asymmetry, eye, and gill placement are correct.
- [ ] Orange blower valve direction and location are correct and do not jump to the wrong side.
- [ ] Rear tail fin is not moved to the front or side waist.
- [ ] No extra hands, fins, tails, invented mouth, teeth, or accessories.
- [ ] Full product is visible and critical details are not hidden.

If any critical item fails, regenerate the first frame.

## 5. Video

Suggested action:

```text
Start from the approved first-frame pose. The person gently sways left and right, raises one arm-fin as if greeting the fish, then returns to the front. Small motion, stable camera.
```

The video inherits:

- Approved first frame
- Four-core-view hard product lock
- Wearable inflatable category lock
- View topology lock
- Volume envelope lock

Default high-consistency motion budget:

- 0-8 degrees rotation
- Tiny bounce
- Small arm-fin movement
- Tiny one-step shuffle
- No turn-around, jump, fast dance, scene cut, or unapproved new angle

## 6. QA

Review 0%, 25%, 50%, 75%, and 100%.

Checklist:

- [ ] Product accuracy score is at least 90.
- [ ] Transparent face window stays correct.
- [ ] Orange blower valve stays correct.
- [ ] Gill stripe count and placement stay correct.
- [ ] Tail fin and rear structure stay correct.
- [ ] No invented mouth, teeth, extra arms, or extra fins.
- [ ] Motion is small but funny.
- [ ] Scene exists and does not hide the product.

If product accuracy fails, retry by reducing motion and scene complexity instead of chasing a flashier result.
