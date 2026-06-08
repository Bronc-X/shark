
from __future__ import annotations

import csv
import json
import math
from pathlib import Path

import imageio.v2 as imageio
import imageio.v3 as iio
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
VIDEO = ROOT / 'source.mp4'
OUT_FRAMES_1FPS = ROOT / 'frames_1fps'
OUT_KEY = ROOT / 'keyframes'
OUT_FULL = ROOT / 'full_frames_sample'
for d in (OUT_FRAMES_1FPS, OUT_KEY, OUT_FULL):
    d.mkdir(parents=True, exist_ok=True)

meta = iio.immeta(VIDEO)
fps = float(meta.get('fps') or 30.0)
duration = float(meta.get('duration') or 0.0)
width, height = meta.get('size') or meta.get('source_size') or (0, 0)

# Downscale for analysis to keep frame-by-frame work cheap.
analysis_w = 320
analysis_h = max(1, round(height * analysis_w / width)) if width else 228

rows = []
sec_scores: dict[int, list[float]] = {}
sec_motion: dict[int, list[float]] = {}
sec_dark: dict[int, list[float]] = {}
sec_bright: dict[int, list[float]] = {}
prev_small = None
prev_hist = None
saved_seconds = set()
key_candidates = []
frame_count = 0

try:
    font = ImageFont.truetype('arial.ttf', 26)
except Exception:
    font = ImageFont.load_default()

def stamp(img: Image.Image, text: str) -> Image.Image:
    im = img.copy()
    draw = ImageDraw.Draw(im)
    pad = 10
    bbox = draw.textbbox((0, 0), text, font=font)
    box = (pad, pad, pad + bbox[2] - bbox[0] + 14, pad + bbox[3] - bbox[1] + 12)
    draw.rectangle(box, fill=(0, 0, 0))
    draw.text((pad + 7, pad + 6), text, fill=(255, 255, 255), font=font)
    return im

def iter_video_frames():
    reader = imageio.get_reader(str(VIDEO), format='ffmpeg')
    try:
        for frame in reader:
            yield frame
    finally:
        reader.close()

for frame in iter_video_frames():
    idx = frame_count
    t = idx / fps
    sec = int(t)
    frame_count += 1

    im = Image.fromarray(frame)
    small_img = im.resize((analysis_w, analysis_h), Image.Resampling.BILINEAR)
    small = np.asarray(small_img).astype(np.float32)
    gray = (0.299 * small[..., 0] + 0.587 * small[..., 1] + 0.114 * small[..., 2]).astype(np.float32)

    if prev_small is None:
        diff = 0.0
        motion = 0.0
        hist_delta = 0.0
    else:
        absdiff = np.abs(small - prev_small)
        diff = float(absdiff.mean())
        motion = float((absdiff.mean(axis=2) > 10).mean())
        hist = np.histogram(gray, bins=32, range=(0, 255), density=True)[0]
        hist_delta = float(np.abs(hist - prev_hist).sum()) if prev_hist is not None else 0.0
        prev_hist = hist
    if prev_small is None:
        prev_hist = np.histogram(gray, bins=32, range=(0, 255), density=True)[0]
    prev_small = small

    dark = float((gray < 40).mean())
    bright = float((gray > 220).mean())
    edge_proxy = float(np.abs(np.diff(gray, axis=0)).mean() + np.abs(np.diff(gray, axis=1)).mean())

    rows.append({
        'frame': idx,
        'time': round(t, 3),
        'sec': sec,
        'diff': round(diff, 6),
        'motion_ratio': round(motion, 6),
        'hist_delta': round(hist_delta, 6),
        'dark_ratio': round(dark, 6),
        'bright_ratio': round(bright, 6),
        'edge_proxy': round(edge_proxy, 6),
    })
    sec_scores.setdefault(sec, []).append(diff)
    sec_motion.setdefault(sec, []).append(motion)
    sec_dark.setdefault(sec, []).append(dark)
    sec_bright.setdefault(sec, []).append(bright)

    # 1fps contact sheet source; save first frame in each whole second.
    if sec not in saved_seconds and abs(t - sec) < (1.0 / fps + 1e-3):
        saved_seconds.add(sec)
        preview = im.copy()
        preview.thumbnail((640, 456), Image.Resampling.LANCZOS)
        preview = stamp(preview, f'{sec:03d}s')
        preview.save(OUT_FRAMES_1FPS / f't_{sec:03d}.jpg', quality=82)

    # Higher-res sample every 10s for possible manual inspection.
    if idx % int(max(1, round(fps * 10))) == 0:
        preview = im.copy()
        preview.thumbnail((1100, 782), Image.Resampling.LANCZOS)
        preview = stamp(preview, f'{t:06.2f}s')
        preview.save(OUT_FULL / f't_{sec:03d}.jpg', quality=88)

    if diff > 12 or motion > 0.18 or hist_delta > 0.035:
        key_candidates.append((diff + motion * 80 + hist_delta * 240, idx, t, diff, motion, hist_delta))

metrics_csv = ROOT / 'frame_metrics.csv'
with metrics_csv.open('w', newline='', encoding='utf-8') as f:
    writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
    writer.writeheader()
    writer.writerows(rows)

sec_rows = []
for sec in sorted(sec_scores):
    diffs = np.array(sec_scores[sec], dtype=float)
    motions = np.array(sec_motion.get(sec, []), dtype=float)
    darks = np.array(sec_dark.get(sec, []), dtype=float)
    brights = np.array(sec_bright.get(sec, []), dtype=float)
    sec_rows.append({
        'sec': sec,
        'start': sec,
        'end': sec + 1,
        'mean_diff': round(float(diffs.mean()), 6),
        'p95_diff': round(float(np.percentile(diffs, 95)), 6),
        'max_diff': round(float(diffs.max()), 6),
        'mean_motion': round(float(motions.mean()) if len(motions) else 0.0, 6),
        'p95_motion': round(float(np.percentile(motions, 95)) if len(motions) else 0.0, 6),
        'mean_dark': round(float(darks.mean()) if len(darks) else 0.0, 6),
        'mean_bright': round(float(brights.mean()) if len(brights) else 0.0, 6),
    })

with (ROOT / 'per_second_metrics.csv').open('w', newline='', encoding='utf-8') as f:
    writer = csv.DictWriter(f, fieldnames=list(sec_rows[0].keys()))
    writer.writeheader()
    writer.writerows(sec_rows)

# Pick keyframes with temporal separation.
key_candidates.sort(reverse=True)
selected = []
for score, idx, t, diff, motion, hist_delta in key_candidates:
    if all(abs(t - old[2]) >= 1.5 for old in selected):
        selected.append((score, idx, t, diff, motion, hist_delta))
    if len(selected) >= 80:
        break
selected.sort(key=lambda x: x[2])

# Save selected keyframes by seeking approximately through already saved 1fps if possible; otherwise second pass.
selected_by_idx = {idx: (score, t, diff, motion, hist_delta) for score, idx, t, diff, motion, hist_delta in selected}
for idx, frame in enumerate(iter_video_frames()):
    if idx in selected_by_idx:
        score, t, diff, motion, hist_delta = selected_by_idx[idx]
        im = Image.fromarray(frame)
        im.thumbnail((960, 683), Image.Resampling.LANCZOS)
        im = stamp(im, f'{t:06.2f}s  diff={diff:.1f} motion={motion:.2f}')
        im.save(OUT_KEY / f't_{t:06.2f}_f_{idx:05d}.jpg', quality=88)
    if idx > max(selected_by_idx, default=0) + 5:
        break

# Detect stable/wait-like intervals: low p95 visual change for >= 3 sec.
vals = [r['p95_diff'] for r in sec_rows]
if vals:
    median = float(np.median(vals))
    low_thresh = max(0.35, median * 0.55)
else:
    median = low_thresh = 0.0
stable = []
start = None
for r in sec_rows:
    is_low = r['p95_diff'] <= low_thresh and r['mean_motion'] <= 0.015
    if is_low and start is None:
        start = r['sec']
    if (not is_low) and start is not None:
        if r['sec'] - start >= 3:
            stable.append((start, r['sec']))
        start = None
if start is not None and sec_rows[-1]['sec'] + 1 - start >= 3:
    stable.append((start, sec_rows[-1]['sec'] + 1))

# Detect active bursts and scene transitions.
p95_vals = np.array(vals, dtype=float) if vals else np.array([])
high_thresh = float(np.percentile(p95_vals, 85)) if len(p95_vals) else 0.0
bursts = []
start = None
for r in sec_rows:
    is_high = r['p95_diff'] >= high_thresh or r['mean_motion'] >= 0.06
    if is_high and start is None:
        start = r['sec']
    if (not is_high) and start is not None:
        if r['sec'] - start >= 1:
            bursts.append((start, r['sec']))
        start = None
if start is not None:
    bursts.append((start, sec_rows[-1]['sec'] + 1))

summary = {
    'video': str(VIDEO),
    'fps': fps,
    'duration': duration,
    'size': [width, height],
    'estimated_frames': int(round(duration * fps)) if duration else frame_count,
    'decoded_frames': frame_count,
    'analysis_size': [analysis_w, analysis_h],
    'median_p95_diff_per_sec': median,
    'stable_threshold': low_thresh,
    'high_activity_threshold': high_thresh,
    'stable_intervals': [{'start': s, 'end': e, 'duration': e-s} for s, e in stable],
    'activity_bursts': [{'start': s, 'end': e, 'duration': e-s} for s, e in bursts],
    'keyframe_count': len(selected),
}
(ROOT / 'analysis_summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(summary, ensure_ascii=False, indent=2))
