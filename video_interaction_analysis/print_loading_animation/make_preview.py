from __future__ import annotations

import math
from pathlib import Path

import cv2
import numpy as np


ROOT = Path(__file__).resolve().parent
OUT = ROOT / "renders"
OUT.mkdir(parents=True, exist_ok=True)

W, H = 960, 540
FPS = 30
DURATION_SECONDS = 10
FRAMES = FPS * DURATION_SECONDS
OUTPUT = OUT / "print_loading_preview.mp4"
POSTER = OUT / "print_loading_preview_poster.jpg"

AMBER = (38, 178, 255)
AMBER_SOFT = (18, 118, 210)
CYAN = (210, 190, 80)
INK = (10, 13, 16)


def ease(t: float) -> float:
    t = max(0.0, min(1.0, t))
    return t * t * (3.0 - 2.0 * t)


def mix(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def project(x: float, y: float, z: float) -> tuple[int, int]:
    scale = W / 1280
    px = 650 * scale + x * 0.95 * scale + y * 0.36 * scale
    py = 500 * scale - z * 1.02 * scale + y * 0.18 * scale
    return round(px), round(py)


def glow_polyline(frame: np.ndarray, pts: np.ndarray, color: tuple[int, int, int], width: int = 1, closed: bool = False) -> None:
    for scale, alpha in ((4, 0.10), (1, 0.86)):
        overlay = frame.copy()
        cv2.polylines(overlay, [pts], closed, color, max(1, width * scale), cv2.LINE_AA)
        cv2.addWeighted(overlay, alpha, frame, 1 - alpha, 0, frame)


def glow_line(frame: np.ndarray, p1: tuple[int, int], p2: tuple[int, int], color: tuple[int, int, int], width: int = 1) -> None:
    glow_polyline(frame, np.array([p1, p2], dtype=np.int32), color, width, False)


def glow_circle(frame: np.ndarray, center: tuple[int, int], radius: int, color: tuple[int, int, int]) -> None:
    for scale, alpha in ((3, 0.12), (1, 0.88)):
        overlay = frame.copy()
        cv2.circle(overlay, center, radius * scale, color, max(1, radius // 5), cv2.LINE_AA)
        cv2.addWeighted(overlay, alpha, frame, 1 - alpha, 0, frame)


def background(idx: int) -> np.ndarray:
    yy = np.linspace(0, 1, H, dtype=np.float32)[:, None]
    xx = np.linspace(0, 1, W, dtype=np.float32)[None, :]
    frame = np.zeros((H, W, 3), dtype=np.float32)
    frame[..., 0] = 13 + 8 * (1 - yy)
    frame[..., 1] = 16 + 10 * (1 - yy)
    frame[..., 2] = 20 + 12 * (1 - yy)

    center = ((xx - 0.55) ** 2 + (yy - 0.52) ** 2)
    frame -= np.clip(center * 92, 0, 44)[..., None]

    cyan_pool = np.exp(-(((xx - 0.55) / 0.36) ** 2 + ((yy - 0.60) / 0.22) ** 2)) * 20
    amber_pool = np.exp(-(((xx - 0.61) / 0.28) ** 2 + ((yy - 0.48) / 0.20) ** 2)) * 18
    frame[..., 0] += amber_pool * 0.22 + cyan_pool * 0.22
    frame[..., 1] += amber_pool * 0.58 + cyan_pool * 0.45
    frame[..., 2] += amber_pool + cyan_pool * 0.18

    return np.clip(frame, 0, 255).astype(np.uint8)


def aircraft_width(x: float) -> float:
    nose = 1 / (1 + math.exp(-(x + 235) / 28))
    tail = 1 / (1 + math.exp((x - 210) / 42))
    body = 54 * nose * tail
    cockpit = 20 * math.exp(-((x + 110) / 52) ** 2)
    return body + cockpit


def aircraft_height(x: float) -> float:
    return 42 * (1 / (1 + math.exp(-(x + 230) / 24))) * (1 / (1 + math.exp((x - 210) / 38))) + 22 * math.exp(-((x + 80) / 46) ** 2)


def layer_curve(layer: int, layer_count: int) -> np.ndarray:
    z = 14 + layer * 2.9
    x_samples = np.linspace(-280, 260, 86)
    top: list[tuple[int, int]] = []
    bottom: list[tuple[int, int]] = []
    layer_phase = layer * 0.12
    for x in x_samples:
        width = aircraft_width(float(x)) * (0.70 + 0.30 * math.sin((layer / layer_count) * math.pi))
        width += 2.0 * math.sin(x * 0.025 + layer_phase)
        top.append(project(float(x), -width, z))
    for x in reversed(x_samples):
        width = aircraft_width(float(x)) * (0.70 + 0.30 * math.sin((layer / layer_count) * math.pi))
        width += 2.0 * math.sin(x * 0.025 + layer_phase)
        bottom.append(project(float(x), width, z))
    return np.array(top + bottom, dtype=np.int32)


def draw_bed(frame: np.ndarray) -> None:
    bed = np.array([project(-390, -180, -12), project(360, -180, -12), project(450, 210, -12), project(-330, 230, -12)], dtype=np.int32)
    overlay = frame.copy()
    cv2.fillConvexPoly(overlay, bed, (22, 25, 28))
    cv2.addWeighted(overlay, 0.78, frame, 0.22, 0, frame)
    cv2.polylines(frame, [bed], True, (72, 82, 86), 2, cv2.LINE_AA)

    for x in np.linspace(-340, 340, 10):
        glow_line(frame, project(x, -160, -10), project(x + 75, 190, -10), (95, 88, 54), 1)
    for y in np.linspace(-150, 180, 7):
        glow_line(frame, project(-360, y, -10), project(390, y, -10), (90, 88, 56), 1)


def draw_wings(frame: np.ndarray, progress: float) -> None:
    wing_alpha = min(1.0, max(0.0, (progress - 0.30) / 0.28))
    if wing_alpha <= 0:
        return

    color = tuple(round(c * wing_alpha + 28 * (1 - wing_alpha)) for c in AMBER)
    left = np.array([project(-30, -48, 70), project(125, -285, 58), project(190, -270, 48), project(70, -48, 62)], dtype=np.int32)
    right = np.array([project(-30, 48, 70), project(125, 285, 58), project(190, 270, 48), project(70, 48, 62)], dtype=np.int32)
    tail_l = np.array([project(185, -36, 94), project(278, -155, 96), project(252, -38, 68)], dtype=np.int32)
    tail_r = np.array([project(185, 36, 94), project(278, 155, 96), project(252, 38, 68)], dtype=np.int32)
    fin = np.array([project(170, 0, 92), project(218, 0, 192), project(250, 0, 90)], dtype=np.int32)
    for pts in (left, right, tail_l, tail_r, fin):
        glow_polyline(frame, pts, color, 2, True)

    for x in (-5, 40, 88, 136):
        glow_line(frame, project(x, -55, 64), project(x + 65, -220, 56), color, 1)
        glow_line(frame, project(x, 55, 64), project(x + 65, 220, 56), color, 1)


def draw_aircraft(frame: np.ndarray, progress: float) -> None:
    layer_count = 38
    visible = max(2, round(layer_count * progress))
    for layer in range(visible):
        p = layer / (layer_count - 1)
        pts = layer_curve(layer, layer_count)
        color = tuple(round(mix(AMBER_SOFT[i], AMBER[i], 0.40 + p * 0.60)) for i in range(3))
        glow_polyline(frame, pts, color, 1, True)

    draw_wings(frame, progress)

    if progress > 0.56:
        alpha = min(0.20, (progress - 0.56) * 0.45)
        overlay = frame.copy()
        shell = np.array(
            [
                project(-280, 0, 38),
                project(-210, -34, 100),
                project(80, -58, 112),
                project(245, -22, 82),
                project(260, 22, 76),
                project(70, 58, 104),
                project(-215, 34, 96),
            ],
            dtype=np.int32,
        )
        cv2.fillConvexPoly(overlay, shell, AMBER)
        cv2.addWeighted(overlay, alpha, frame, 1 - alpha, 0, frame)

    cockpit = np.array([project(-145, -20, 112), project(-70, -26, 148), project(-15, -10, 126), project(-75, 18, 108)], dtype=np.int32)
    if progress > 0.22:
        glow_polyline(frame, cockpit, (78, 205, 255), 1, True)


def draw_nozzle(frame: np.ndarray, progress: float, idx: int) -> None:
    angle = progress * math.tau * 1.8
    nx = mix(-150, 125, progress) + math.sin(angle) * 64
    ny = math.cos(angle) * 62
    nz = 230 - progress * 112
    tip = project(nx, ny, nz - 70)
    head_center = project(nx, ny, nz)
    body = np.array(
        [
            (head_center[0] - 72, head_center[1] - 42),
            (head_center[0] + 82, head_center[1] - 42),
            (head_center[0] + 68, head_center[1] + 24),
            (head_center[0] - 62, head_center[1] + 30),
        ],
        dtype=np.int32,
    )
    overlay = frame.copy()
    cv2.fillConvexPoly(overlay, body, (25, 30, 35))
    cv2.addWeighted(overlay, 0.94, frame, 0.06, 0, frame)
    cv2.polylines(frame, [body], True, (95, 105, 112), 2, cv2.LINE_AA)
    cv2.line(frame, (head_center[0] - 54, head_center[1] + 23), (head_center[0] + 58, head_center[1] + 23), AMBER, 2, cv2.LINE_AA)

    nozzle = np.array(
        [
            (head_center[0] - 18, head_center[1] + 24),
            (head_center[0] + 18, head_center[1] + 24),
            tip,
        ],
        dtype=np.int32,
    )
    cv2.fillConvexPoly(frame, nozzle, (42, 52, 60))
    glow_line(frame, tip, project(nx + 6 * math.sin(idx * 0.1), ny, max(14, nz - 170)), (210, 215, 180), 1)
    glow_circle(frame, tip, 5, (180, 230, 255))


def draw_ui(frame: np.ndarray, progress: float) -> None:
    scale = W / 1280
    x0, y0 = round(72 * scale), round(116 * scale)
    cv2.rectangle(frame, (x0 - round(24 * scale), y0 - round(42 * scale)), (x0 + round(420 * scale), y0 + round(188 * scale)), (0, 0, 0), 1, cv2.LINE_AA)
    for i, value in enumerate((progress, min(1, progress * 1.28), max(0, progress - 0.22))):
        y = y0 + round(i * 56 * scale)
        bar_w = round(300 * scale)
        bar_h = max(4, round(8 * scale))
        cv2.rectangle(frame, (x0, y), (x0 + bar_w, y + bar_h), (32, 36, 38), -1)
        cv2.rectangle(frame, (x0, y), (x0 + round(bar_w * value), y + bar_h), AMBER, -1)
        cv2.line(frame, (x0, y + round(16 * scale)), (x0 + bar_w, y + round(16 * scale)), (24, 30, 32), 1, cv2.LINE_AA)

    stage = "ANALYZE" if progress < 0.22 else "BUILD" if progress < 0.82 else "REFINE"
    cv2.putText(frame, f"{round(progress * 99):02d}%", (x0, round(72 * scale)), cv2.FONT_HERSHEY_SIMPLEX, 0.82, AMBER, 1, cv2.LINE_AA)
    cv2.putText(frame, stage, (x0 + round(118 * scale), round(71 * scale)), cv2.FONT_HERSHEY_SIMPLEX, 0.34, (128, 146, 148), 1, cv2.LINE_AA)


def draw_scan_volume(frame: np.ndarray, progress: float) -> None:
    box = [
        project(-300, -170, 0),
        project(300, -170, 0),
        project(330, 170, 0),
        project(-270, 170, 0),
        project(-300, -170, 180),
        project(300, -170, 180),
        project(330, 170, 180),
        project(-270, 170, 180),
    ]
    edges = ((0, 1), (1, 2), (2, 3), (3, 0), (4, 5), (5, 6), (6, 7), (7, 4), (0, 4), (1, 5), (2, 6), (3, 7))
    for a, b in edges:
        glow_line(frame, box[a], box[b], (80, 95, 78), 1)

    sweep = -260 + 560 * ((math.sin(progress * math.tau * 2.0) + 1) / 2)
    glow_line(frame, project(sweep, -170, 4), project(sweep + 35, 170, 174), CYAN, 1)


def render_frame(idx: int) -> np.ndarray:
    progress = ease(idx / max(1, FRAMES - 1))
    frame = background(idx)
    draw_ui(frame, progress)
    draw_bed(frame)
    draw_scan_volume(frame, progress)
    draw_aircraft(frame, progress)
    draw_nozzle(frame, progress, idx)
    cv2.putText(frame, "TONI.ASIA / PRINT PROCESS STYLE DIRECTION", (round(680 * W / 1280), round(660 * W / 1280)), cv2.FONT_HERSHEY_SIMPLEX, 0.32, (85, 96, 98), 1, cv2.LINE_AA)
    return frame


def main() -> None:
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(str(OUTPUT), fourcc, FPS, (W, H))
    if not writer.isOpened():
        raise RuntimeError(f"Cannot open video writer: {OUTPUT}")

    poster = None
    for idx in range(FRAMES):
        frame = render_frame(idx)
        if idx == round(FRAMES * 0.68):
            poster = frame.copy()
        writer.write(frame)
    writer.release()

    if poster is None:
        poster = render_frame(FRAMES // 2)
    ok, encoded = cv2.imencode(".jpg", poster, [int(cv2.IMWRITE_JPEG_QUALITY), 94])
    if not ok:
        raise RuntimeError("Could not encode poster JPG")
    encoded.tofile(str(POSTER))
    print(f"Wrote {OUTPUT}")
    print(f"Wrote {POSTER}")


if __name__ == "__main__":
    main()
