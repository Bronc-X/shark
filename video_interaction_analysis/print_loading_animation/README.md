# 3D Print Loading Animation

This folder is the product wait-state animation package for the long image-to-3D-model generation step.

## Files

- `style_frame.png`: high-quality visual target generated for art direction.
- `make_blender_scene.py`: Blender scene generator for the real 3D animation.
- `make_preview.py`: lightweight OpenCV preview generator. This is for timing and layout only, not final visual quality.
- `renders/print_loading_preview.mp4`: generated preview loop.
- `renders/print_loading_preview_poster.jpg`: poster frame for quick review.
- `preview.html`: plain video preview.
- `integration_example.html`: example wait-state overlay using a progress HUD.

## Visual Direction

The final animation should follow `style_frame.png`: premium stylized 3D, graphite studio background, translucent amber resin/PLA layers, cyan scan light, and a sleek aircraft-model silhouette. Avoid toy-like printers, blob shapes, workshop realism, and overdone neon.

## Generate Preview

```powershell
python video_interaction_analysis/print_loading_animation/make_preview.py
```

## Generate Blender Scene

Install Blender, then run:

```powershell
blender --background --python video_interaction_analysis/print_loading_animation/make_blender_scene.py
```

The script writes:

- `video_interaction_analysis/print_loading_animation/print_loading_animation.blend`
- `video_interaction_analysis/print_loading_animation/renders/print_loading_loop.mp4`

If Blender is installed but not on `PATH`, replace `blender` with the full path to `blender.exe`.

## Product Integration

Use the animation as a short loop, then map real backend progress to UI states:

- `0-20%`: analyzing source image
- `20-45%`: building base geometry
- `45-85%`: printing model layers
- `85-100%`: refining mesh and preparing preview

Do not render a real 2-3 minute video. The better product behavior is a high-quality loop plus real progress-driven copy and HUD state.

