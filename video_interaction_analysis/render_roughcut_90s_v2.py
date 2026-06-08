from __future__ import annotations

import bisect
import math
import subprocess
from pathlib import Path

import imageio.v2 as imageio
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "source.mp4"
WORK = Path(r"C:\Users\Administrator\Videos\interaction_roughcut")
WORK.mkdir(parents=True, exist_ok=True)
FFMPEG = Path(
    r"C:\Users\Administrator\AppData\Roaming\Python\Python310\site-packages"
    r"\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v7.1.exe"
)
OUTPUT = WORK / "aircraft_model_interaction_90s_v3.mp4"

FPS = 30
W = 1750
H = 1244
LAST_SOURCE_FRAME = 9230


SEGMENTS = [
    (0.0, 9.0, 6.0, "选择舰船参数"),
    (9.0, 29.0, 6.0, "生成概念图"),
    (29.0, 92.0, 6.0, "后台生成中"),
    (92.0, 100.0, 8.0, "确认建模参考图"),
    (100.0, 118.0, 10.0, "用文字微调局部"),
    (118.0, 198.0, 8.0, "保留主体，重生成细节"),
    (198.0, 202.0, 6.0, "提交生成 STL"),
    (202.0, 283.0, 12.0, "建模、校验、保存同步进行"),
    (283.0, 289.0, 8.0, "进入模型检查台"),
    (289.0, 305.0, 14.0, "旋转检查几何细节"),
    (305.0, 307.75, 6.0, "下载 STL 文件"),
]


# final-time events. Rects are source-frame coordinates at 1750x1244.
EVENTS = [
    {
        "t0": 6.15,
        "t1": 8.90,
        "rect": (230, 966, 340, 118),
        "scale": 1.62,
        "label": "造型要求",
    },
    {
        "t0": 9.35,
        "t1": 11.60,
        "rect": (230, 1190, 340, 52),
        "scale": 1.70,
        "label": "正在生成概念图",
    },
    {
        "t0": 13.00,
        "t1": 17.60,
        "rect": (228, 1206, 350, 30),
        "scale": 2.10,
        "label": "22% 进度",
    },
    {
        "t0": 18.20,
        "t1": 21.60,
        "rect": (228, 1206, 350, 30),
        "scale": 2.10,
        "label": "正在生成 22%",
    },
    {
        "t0": 22.35,
        "t1": 24.40,
        "rect": (460, 160, 1060, 18),
        "scale": 1.24,
        "label": "100% 完成",
    },
    {
        "t0": 27.20,
        "t1": 30.20,
        "rect": (470, 772, 865, 72),
        "scale": 1.42,
        "label": "局部修改",
    },
    {
        "t0": 32.20,
        "t1": 34.40,
        "rect": (1340, 807, 172, 40),
        "scale": 1.85,
        "label": "重新生成",
    },
    {
        "t0": 37.00,
        "t1": 39.25,
        "rect": (470, 880, 1025, 28),
        "scale": 1.32,
        "label": "再确认进度",
    },
    {
        "t0": 40.20,
        "t1": 42.45,
        "rect": (470, 918, 1050, 64),
        "scale": 1.30,
        "label": "四步流程",
    },
    {
        "t0": 44.80,
        "t1": 49.20,
        "rect": (994, 1060, 528, 44),
        "scale": 1.65,
        "label": "使用这张图生成 STL",
    },
    {
        "t0": 51.00,
        "t1": 54.20,
        "rect": (600, 744, 786, 122),
        "scale": 1.20,
        "label": "四个任务进度",
    },
    {
        "t0": 56.10,
        "t1": 60.80,
        "rect": (682, 876, 610, 210),
        "scale": 1.24,
        "label": "生成日志",
    },
    {
        "t0": 63.00,
        "t1": 66.20,
        "rect": (1075, 448, 462, 144),
        "scale": 1.36,
        "label": "尺寸与格式",
    },
    {
        "t0": 70.40,
        "t1": 73.60,
        "rect": (430, 540, 610, 390),
        "scale": 1.28,
        "label": "模型细节",
    },
    {
        "t0": 76.20,
        "t1": 79.50,
        "rect": (1090, 652, 430, 210),
        "scale": 1.30,
        "label": "渲染样张",
    },
    {
        "t0": 84.60,
        "t1": 88.60,
        "rect": (1076, 1100, 226, 50),
        "scale": 1.90,
        "label": "下载 STL",
    },
]


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        r"C:\Windows\Fonts\NotoSansSC-VF.ttf",
        r"C:\Windows\Fonts\msyhbd.ttc" if bold else r"C:\Windows\Fonts\msyh.ttc",
        r"C:\Windows\Fonts\simhei.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            pass
    return ImageFont.load_default()


CAPTION_FONT = load_font(38)
LABEL_FONT = load_font(26, bold=True)


def ease_pop(local: float, duration: float) -> float:
    if duration <= 0:
        return 1.0
    p = max(0.0, min(1.0, local / duration))
    ramp = min(0.18, duration * 0.25)
    if local < ramp:
        x = local / ramp
        return 0.15 + 0.85 * (1 - math.cos(math.pi * x)) / 2
    if local > duration - ramp:
        x = (duration - local) / ramp
        return 0.15 + 0.85 * (1 - math.cos(math.pi * x)) / 2
    return 1.0


def segment_boundaries() -> list[float]:
    boundaries = [0.0]
    acc = 0.0
    for _, _, target, _ in SEGMENTS:
        acc += target
        boundaries.append(acc)
    return boundaries


BOUNDS = segment_boundaries()


def map_output_to_source(t: float) -> tuple[int, str]:
    idx = min(max(0, bisect.bisect_right(BOUNDS, t) - 1), len(SEGMENTS) - 1)
    src_start, src_end, target, caption = SEGMENTS[idx]
    local = t - BOUNDS[idx]
    source_t = src_start + local / target * (src_end - src_start)
    source_frame = min(LAST_SOURCE_FRAME, int(round(source_t * FPS)))
    return source_frame, caption


def draw_caption(img: Image.Image, text: str) -> None:
    draw = ImageDraw.Draw(img)
    bbox = draw.textbbox((0, 0), text, font=CAPTION_FONT)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    x = (W - tw) // 2
    y = H - th - 54
    pad_x = 24
    pad_y = 14
    draw.rounded_rectangle(
        (x - pad_x, y - pad_y, x + tw + pad_x, y + th + pad_y),
        radius=8,
        fill=(0, 0, 0, 150),
    )
    draw.text((x, y), text, fill=(255, 255, 255, 255), font=CAPTION_FONT)


def draw_magnifier(img: Image.Image, event: dict, t: float) -> None:
    local = t - event["t0"]
    duration = event["t1"] - event["t0"]
    pop = ease_pop(local, duration)
    if pop <= 0.16:
        return

    x, y, w, h = event["rect"]
    draw = ImageDraw.Draw(img, "RGBA")
    draw.rounded_rectangle(
        (x - 5, y - 5, x + w + 5, y + h + 5),
        radius=10,
        outline=(0, 132, 88, int(160 * pop)),
        width=4,
    )

    scale = 1.0 + (event["scale"] - 1.0) * pop
    crop = img.crop((x, y, x + w, y + h))
    ow = max(2, int(round(w * scale)))
    oh = max(2, int(round(h * scale)))
    crop = crop.resize((ow, oh), Image.Resampling.LANCZOS).convert("RGBA")

    cx = x + w / 2
    cy = y + h / 2
    ox = int(round(cx - ow / 2))
    oy = int(round(cy - oh / 2))
    ox = max(18, min(W - ow - 18, ox))
    oy = max(18, min(H - oh - 18, oy))

    shadow = Image.new("RGBA", (ow + 34, oh + 34), (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.rounded_rectangle(
        (15, 15, ow + 15, oh + 15),
        radius=14,
        fill=(0, 0, 0, int(70 * pop)),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(10))
    img.alpha_composite(shadow, (ox - 17, oy - 17))

    frame = Image.new("RGBA", (ow + 8, oh + 8), (0, 0, 0, 0))
    frame_draw = ImageDraw.Draw(frame)
    frame_draw.rounded_rectangle(
        (0, 0, ow + 7, oh + 7),
        radius=13,
        fill=(255, 255, 255, int(232 * pop)),
        outline=(0, 132, 88, int(255 * pop)),
        width=4,
    )
    frame.alpha_composite(crop, (4, 4))
    img.alpha_composite(frame, (ox - 4, oy - 4))

    label = event.get("label", "")
    if label:
        label_bbox = draw.textbbox((0, 0), label, font=LABEL_FONT)
        lw = label_bbox[2] - label_bbox[0]
        lh = label_bbox[3] - label_bbox[1]
        lx = ox
        ly = max(18, oy - lh - 22)
        draw.rounded_rectangle(
            (lx, ly, lx + lw + 22, ly + lh + 14),
            radius=8,
            fill=(0, 132, 88, int(230 * pop)),
        )
        draw.text((lx + 11, ly + 6), label, fill=(255, 255, 255, int(255 * pop)), font=LABEL_FONT)


def active_events(t: float) -> list[dict]:
    return [e for e in EVENTS if e["t0"] <= t <= e["t1"]]


def render() -> None:
    total_duration = BOUNDS[-1]
    total_frames = int(round(total_duration * FPS))
    needed = [map_output_to_source(i / FPS)[0] for i in range(total_frames)]
    captions = [map_output_to_source(i / FPS)[1] for i in range(total_frames)]
    max_needed = max(needed)

    cmd = [
        str(FFMPEG),
        "-hide_banner",
        "-y",
        "-f",
        "rawvideo",
        "-vcodec",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "-s",
        f"{W}x{H}",
        "-r",
        str(FPS),
        "-i",
        "-",
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        str(OUTPUT),
    ]

    print(f"Rendering {total_frames} frames to {OUTPUT}")
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    assert proc.stdin is not None

    reader = imageio.get_reader(str(SOURCE), format="ffmpeg")
    try:
        current_idx = -1
        current_frame = None
        source_iter = iter(reader)
        for out_idx, src_idx in enumerate(needed):
            while current_idx < src_idx:
                current_frame = next(source_iter)
                current_idx += 1
                if current_idx > max_needed:
                    break
            if current_frame is None:
                raise RuntimeError("No frame decoded")

            t = out_idx / FPS
            img = Image.fromarray(current_frame).convert("RGBA")
            draw_caption(img, captions[out_idx])
            for event in active_events(t):
                draw_magnifier(img, event, t)
            proc.stdin.write(np.asarray(img.convert("RGB"), dtype=np.uint8).tobytes())
            if out_idx and out_idx % 300 == 0:
                print(f"  {out_idx}/{total_frames} frames")
    finally:
        reader.close()
        proc.stdin.close()
        code = proc.wait()
        if code != 0:
            raise RuntimeError(f"ffmpeg exited with {code}")

    print(f"Wrote {OUTPUT}")


if __name__ == "__main__":
    render()
