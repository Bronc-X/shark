from __future__ import annotations

import shutil
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "source.mp4"
WORK = Path(r"C:\Users\Administrator\Videos\interaction_roughcut")
WORK.mkdir(parents=True, exist_ok=True)
(WORK / "captions").mkdir(parents=True, exist_ok=True)

ASCII_SOURCE = WORK / "source.mp4"
FFMPEG = Path(
    r"C:\Users\Administrator\AppData\Roaming\Python\Python310\site-packages"
    r"\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v7.1.exe"
)
FONT = Path(r"C:\Windows\Fonts\NotoSansSC-VF.ttf")
OUTPUT = WORK / "aircraft_model_interaction_90s_v1.mp4"
FILTER_SCRIPT = WORK / "roughcut_90s_filter.txt"


W = 1750
H = 1244


SEGMENTS = [
    {
        "start": 0.0,
        "end": 9.0,
        "target": 6.0,
        "caption": "选择模型方向、尺寸和风格，右侧实时预览目标",
        "z0": 1.00,
        "z1": 1.08,
        "px": 0.72,
        "py": 0.48,
        "pos": "br",
    },
    {
        "start": 9.0,
        "end": 29.0,
        "target": 6.0,
        "caption": "点击生成概念图，先锁定结构比例",
        "z0": 1.10,
        "z1": 1.22,
        "px": 0.00,
        "py": 0.95,
        "pos": "br",
    },
    {
        "start": 29.0,
        "end": 92.0,
        "target": 6.0,
        "caption": "生成等待快进：保留进度条变化",
        "z0": 1.04,
        "z1": 1.10,
        "px": 0.00,
        "py": 0.88,
        "pos": "tr",
    },
    {
        "start": 92.0,
        "end": 100.0,
        "target": 8.0,
        "caption": "概念图完成，确认后进入 STL 生成",
        "z0": 1.00,
        "z1": 1.08,
        "px": 0.42,
        "py": 0.34,
        "pos": "br",
    },
    {
        "start": 100.0,
        "end": 118.0,
        "target": 10.0,
        "caption": "用自然语言微调局部细节",
        "z0": 1.05,
        "z1": 1.14,
        "px": 0.48,
        "py": 0.72,
        "pos": "tr",
    },
    {
        "start": 118.0,
        "end": 198.0,
        "target": 8.0,
        "caption": "系统合并描述，重新生成确认图",
        "z0": 1.04,
        "z1": 1.10,
        "px": 0.48,
        "py": 0.72,
        "pos": "tr",
    },
    {
        "start": 198.0,
        "end": 202.0,
        "target": 6.0,
        "caption": "确认图片，一键生成 STL",
        "z0": 1.10,
        "z1": 1.22,
        "px": 0.45,
        "py": 0.95,
        "pos": "tr",
    },
    {
        "start": 202.0,
        "end": 283.0,
        "target": 12.0,
        "caption": "STL 生成中：建模、校验、保存、细节取样",
        "z0": 1.00,
        "z1": 1.10,
        "px": 0.48,
        "py": 0.62,
        "pos": "br",
    },
    {
        "start": 283.0,
        "end": 289.0,
        "target": 8.0,
        "caption": "进入模型检查台，核对尺寸和输出格式",
        "z0": 1.00,
        "z1": 1.08,
        "px": 0.70,
        "py": 0.45,
        "pos": "bl",
    },
    {
        "start": 289.0,
        "end": 305.0,
        "target": 14.0,
        "caption": "旋转检查 3D 细节与打印建议",
        "z0": 1.02,
        "z1": 1.10,
        "px": 0.28,
        "py": 0.50,
        "pos": "tr",
    },
    {
        "start": 305.0,
        "end": 307.75,
        "target": 6.0,
        "caption": "检查完成，下载 STL 文件",
        "z0": 1.12,
        "z1": 1.24,
        "px": 0.62,
        "py": 0.92,
        "pos": "tl",
    },
]


def ff_path(path: Path) -> str:
    return str(path).replace("\\", "/").replace(":", r"\:")


def drawtext(seg_index: int, seg: dict) -> str:
    caption_file = WORK / "captions" / f"caption_{seg_index:02d}.txt"
    caption_file.write_text(seg["caption"], encoding="utf-8")

    if seg["pos"] == "tr":
        x = "w-text_w-70"
        y = "70"
    elif seg["pos"] == "tl":
        x = "70"
        y = "70"
    elif seg["pos"] == "bl":
        x = "70"
        y = "h-text_h-90"
    else:
        x = "w-text_w-70"
        y = "h-text_h-90"

    return (
        "drawtext="
        f"fontfile='{ff_path(FONT)}':"
        f"textfile='{ff_path(caption_file)}':"
        "fontsize=42:"
        "fontcolor=white:"
        "box=1:"
        "boxcolor=black@0.58:"
        "boxborderw=22:"
        f"x={x}:"
        f"y={y}"
    )


def segment_filter(seg_index: int, seg: dict) -> str:
    source_duration = seg["end"] - seg["start"]
    pts_factor = seg["target"] / source_duration
    z = f"({seg['z0']:.5f}+({seg['z1'] - seg['z0']:.5f})*t/{seg['target']:.5f})"

    scale_crop = (
        f"scale=w='trunc({W}*{z}/2)*2':"
        f"h='trunc({H}*{z}/2)*2':eval=frame,"
        f"crop={W}:{H}:"
        f"x='(iw-{W})*{seg['px']:.5f}':"
        f"y='(ih-{H})*{seg['py']:.5f}',"
        f"{drawtext(seg_index, seg)},"
        "setsar=1"
    )

    return (
        f"[0:v]trim=start={seg['start']:.3f}:end={seg['end']:.3f},"
        "setpts=PTS-STARTPTS,"
        f"setpts={pts_factor:.8f}*PTS,"
        f"{scale_crop}[v{seg_index}]"
    )


def build_filter_script() -> None:
    parts = [segment_filter(i, seg) for i, seg in enumerate(SEGMENTS)]
    concat_inputs = "".join(f"[v{i}]" for i in range(len(SEGMENTS)))
    parts.append(
        f"{concat_inputs}concat=n={len(SEGMENTS)}:v=1:a=0,"
        "fps=30,format=yuv420p[vout]"
    )
    FILTER_SCRIPT.write_text(";\n".join(parts), encoding="utf-8")


def main() -> None:
    if not FFMPEG.exists():
        raise FileNotFoundError(FFMPEG)
    if not SOURCE.exists():
        raise FileNotFoundError(SOURCE)
    if not FONT.exists():
        raise FileNotFoundError(FONT)

    shutil.copy2(SOURCE, ASCII_SOURCE)
    build_filter_script()

    cmd = [
        str(FFMPEG),
        "-hide_banner",
        "-y",
        "-i",
        str(ASCII_SOURCE),
        "-filter_complex_script",
        str(FILTER_SCRIPT),
        "-map",
        "[vout]",
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "20",
        "-movflags",
        "+faststart",
        str(OUTPUT),
    ]
    print("Running:")
    print(" ".join(cmd))
    subprocess.run(cmd, check=True)
    print(f"Wrote {OUTPUT}")


if __name__ == "__main__":
    main()
