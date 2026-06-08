from __future__ import annotations

import math
import subprocess
import wave
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont


WORK = Path(r"C:\Users\Administrator\Videos\interaction_roughcut")
INPUT = WORK / "aircraft_model_interaction_90s_v3.mp4"
TAIL_PNG = WORK / "toni_sia_tail_frame.png"
TAIL_MP4 = WORK / "toni_sia_tail_3s.mp4"
CONCAT_LIST = WORK / "v4_concat_list.txt"
CONCAT_MP4 = WORK / "aircraft_model_interaction_90s_v4_tail_video.mp4"
BGM_WAV = WORK / "toni_sia_lively_bgm.wav"
OUTPUT = WORK / "aircraft_model_interaction_90s_v5_toni_asia_tail_bgm.mp4"

FFMPEG = Path(
    r"C:\Users\Administrator\AppData\Roaming\Python\Python310\site-packages"
    r"\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v7.1.exe"
)

W = 1750
H = 1244
FPS = 30
TAIL_SECONDS = 3.0
TOTAL_SECONDS = 93.0
GREEN = (43, 255, 126)
DARK_GREEN = (4, 32, 18)


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = [
        Path(r"C:\Windows\Fonts\bahnschrift.ttf"),
        Path(r"C:\Windows\Fonts\consolab.ttf" if bold else r"C:\Windows\Fonts\consola.ttf"),
        Path(r"C:\Windows\Fonts\arialbd.ttf" if bold else r"C:\Windows\Fonts\arial.ttf"),
    ]
    for font in candidates:
        if font.exists():
            return ImageFont.truetype(str(font), size)
    return ImageFont.load_default()


def centered(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont, y: int, fill: tuple[int, int, int]) -> None:
    box = draw.textbbox((0, 0), text, font=font)
    x = (W - (box[2] - box[0])) // 2
    draw.text((x, y), text, font=font, fill=fill)


def make_tail_frame() -> None:
    img = Image.new("RGB", (W, H), (0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Match the user's reference: dark green HUD background plus one large glowing wordmark.
    for y in range(0, H, 22):
        alpha = int(15 + 8 * math.sin(y * 0.03))
        draw.line((0, y, W, y), fill=(0, alpha, 10), width=1)
    for x in range(0, W, 120):
        draw.line((x, 0, x + 450, H), fill=(0, 18, 12), width=1)
    for x in range(0, W, 105):
        draw.line((x, 0, x, H), fill=(0, 15, 8), width=1)
    for y in range(0, H, 95):
        draw.line((0, y, W, y), fill=(0, 15, 8), width=1)

    rng = np.random.default_rng(7)
    for _ in range(80):
        x = int(rng.integers(0, W))
        y = int(rng.integers(0, H))
        r = int(rng.integers(1, 3))
        draw.ellipse((x - r, y - r, x + r, y + r), fill=(24, 106, 64))

    font_main = ImageFont.truetype(r"C:\Windows\Fonts\ariblk.ttf", 258)
    text = "Toni.asia"
    box = draw.textbbox((0, 0), text, font=font_main)
    tx = (W - (box[2] - box[0])) // 2
    ty = (H - (box[3] - box[1])) // 2 - 40

    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.text((tx + 24, ty + 30), text, font=font_main, fill=(0, 0, 0, 210))
    shadow = shadow.filter(ImageFilter.GaussianBlur(3))
    img.paste(shadow, (0, 0), shadow)

    for blur, fill, alpha in [
        (36, (22, 255, 111), 210),
        (16, (47, 255, 125), 230),
        (5, (176, 255, 197), 255),
    ]:
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ld = ImageDraw.Draw(layer)
        ld.text((tx, ty), text, font=font_main, fill=fill + (alpha,))
        layer = layer.filter(ImageFilter.GaussianBlur(blur))
        img.paste(layer, (0, 0), layer)
    draw.text((tx + 5, ty + 5), text, font=font_main, fill=(15, 126, 54))
    draw.text((tx, ty), text, font=font_main, fill=(45, 224, 92))
    draw.text((tx + 4, ty + 4), text, font=font_main, fill=(37, 176, 69))

    vignette = Image.new("L", (W, H), 0)
    vd = ImageDraw.Draw(vignette)
    vd.ellipse((-330, -250, W + 330, H + 260), fill=255)
    vignette = vignette.filter(ImageFilter.GaussianBlur(120))
    dark = Image.new("RGB", (W, H), (0, 0, 0))
    img = Image.composite(img, dark, vignette)

    TAIL_PNG.parent.mkdir(parents=True, exist_ok=True)
    img.save(TAIL_PNG, quality=95)


def envelope(t: np.ndarray, attack: float = 0.01, release: float = 0.05) -> np.ndarray:
    env = np.ones_like(t)
    env *= np.minimum(1.0, t / attack)
    env *= np.minimum(1.0, (t[-1] - t) / release)
    return np.clip(env, 0.0, 1.0)


def synth_bgm() -> None:
    sr = 48_000
    duration = TOTAL_SECONDS
    n = int(sr * duration)
    audio = np.zeros(n, dtype=np.float32)
    bpm = 126
    beat = 60.0 / bpm
    step = beat / 2.0

    def add(start: float, sound: np.ndarray, gain: float = 1.0) -> None:
        i = int(start * sr)
        if i >= n:
            return
        j = min(n, i + len(sound))
        audio[i:j] += sound[: j - i] * gain

    def sine(freq: float, sec: float, gain: float = 1.0) -> np.ndarray:
        t = np.arange(int(sr * sec), dtype=np.float32) / sr
        return np.sin(2 * np.pi * freq * t) * envelope(t, 0.008, 0.05) * gain

    def kick() -> np.ndarray:
        sec = 0.34
        t = np.arange(int(sr * sec), dtype=np.float32) / sr
        f = 46 + 86 * np.exp(-t * 24)
        phase = 2 * np.pi * np.cumsum(f) / sr
        return np.sin(phase) * np.exp(-t * 9) * 0.9

    def hat() -> np.ndarray:
        sec = 0.075
        t = np.arange(int(sr * sec), dtype=np.float32) / sr
        rng = np.random.default_rng(int(t.size))
        return rng.normal(0, 1, t.size).astype(np.float32) * np.exp(-t * 55) * 0.16

    def snare() -> np.ndarray:
        sec = 0.16
        t = np.arange(int(sr * sec), dtype=np.float32) / sr
        rng = np.random.default_rng(42)
        noise = rng.normal(0, 1, t.size).astype(np.float32) * np.exp(-t * 18)
        tone = np.sin(2 * np.pi * 185 * t) * np.exp(-t * 20)
        return (noise * 0.18 + tone * 0.12).astype(np.float32)

    notes = [196.0, 246.94, 293.66, 369.99, 329.63, 293.66, 246.94, 220.0]
    bass = [98.0, 98.0, 123.47, 146.83, 82.41, 82.41, 110.0, 123.47]
    total_beats = int(duration / step) + 1
    for i in range(total_beats):
        t = i * step
        if i % 2 == 0:
            add(t, kick(), 0.72)
        if i % 4 == 2:
            add(t, snare(), 0.65)
        add(t, hat(), 0.52 if i % 2 else 0.32)

        note = notes[i % len(notes)]
        add(t, sine(note, 0.18, 0.13), 1.0)
        add(t + step * 0.48, sine(note * 1.5, 0.10, 0.055), 1.0)
        if i % 2 == 0:
            add(t, sine(bass[(i // 2) % len(bass)], step * 0.95, 0.12), 1.0)

    # Low pad underneath, side-channel widened manually.
    t = np.arange(n, dtype=np.float32) / sr
    pad = (
        np.sin(2 * np.pi * 49.0 * t)
        + 0.45 * np.sin(2 * np.pi * 73.42 * t + 0.7)
        + 0.28 * np.sin(2 * np.pi * 98.0 * t + 1.4)
    )
    audio += (pad * 0.018).astype(np.float32)

    fade = np.ones(n, dtype=np.float32)
    fade[: int(sr * 1.5)] = np.linspace(0, 1, int(sr * 1.5), dtype=np.float32)
    fade[-int(sr * 3.0) :] = np.linspace(1, 0, int(sr * 3.0), dtype=np.float32)
    audio *= fade

    peak = max(0.001, float(np.max(np.abs(audio))))
    audio = audio / peak * 0.42
    left = audio
    right = np.roll(audio, int(sr * 0.009)) * 0.92
    stereo = np.stack([left, right], axis=1)
    pcm = np.clip(stereo * 32767, -32768, 32767).astype(np.int16)

    with wave.open(str(BGM_WAV), "wb") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(pcm.tobytes())


def run_ffmpeg(args: list[str]) -> None:
    subprocess.run([str(FFMPEG), "-y", *args], check=True)


def render() -> None:
    make_tail_frame()
    synth_bgm()

    run_ffmpeg(
        [
            "-loop",
            "1",
            "-framerate",
            str(FPS),
            "-t",
            str(TAIL_SECONDS),
            "-i",
            str(TAIL_PNG),
            "-vf",
            "format=yuv420p",
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            "18",
            "-r",
            str(FPS),
            str(TAIL_MP4),
        ]
    )

    CONCAT_LIST.write_text(
        f"file '{INPUT.as_posix()}'\nfile '{TAIL_MP4.as_posix()}'\n",
        encoding="utf-8",
    )
    run_ffmpeg(["-f", "concat", "-safe", "0", "-i", str(CONCAT_LIST), "-c", "copy", str(CONCAT_MP4)])
    run_ffmpeg(
        [
            "-i",
            str(CONCAT_MP4),
            "-i",
            str(BGM_WAV),
            "-map",
            "0:v:0",
            "-map",
            "1:a:0",
            "-c:v",
            "copy",
            "-c:a",
            "aac",
            "-b:a",
            "160k",
            "-shortest",
            str(OUTPUT),
        ]
    )


if __name__ == "__main__":
    render()
