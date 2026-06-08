from __future__ import annotations

import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent
MANIFEST = ROOT / "baseline_manifest.json"
FFMPEG = Path(
    r"C:\Users\Administrator\AppData\Roaming\Python\Python310\site-packages"
    r"\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v7.1.exe"
)


def fail(message: str) -> None:
    print(f"BASELINE FAIL: {message}", file=sys.stderr)
    raise SystemExit(1)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def ffmpeg_info(path: Path) -> str:
    if not FFMPEG.exists():
        fail(f"ffmpeg executable not found: {FFMPEG}")
    result = subprocess.run(
        [str(FFMPEG), "-hide_banner", "-i", str(path)],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    return result.stdout


def parse_duration_seconds(info: str) -> float:
    match = re.search(r"Duration:\s*(\d+):(\d+):(\d+\.\d+)", info)
    if not match:
        fail("duration metadata missing")
    hours, minutes, seconds = match.groups()
    return int(hours) * 3600 + int(minutes) * 60 + float(seconds)


def require(condition: bool, message: str) -> None:
    if not condition:
        fail(message)


def main() -> None:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    artifact = Path(manifest["artifact"])
    require(artifact.exists(), f"baseline artifact missing: {artifact}")

    actual_hash = sha256(artifact)
    require(
        actual_hash == manifest["sha256"],
        f"SHA256 changed: expected {manifest['sha256']}, got {actual_hash}",
    )

    info = ffmpeg_info(artifact)
    duration = parse_duration_seconds(info)
    require(abs(duration - float(manifest["duration_seconds"])) <= 0.05, f"duration changed: {duration}")

    expected_video = f"{manifest['width']}x{manifest['height']}"
    require(expected_video in info, f"video size missing or changed: {expected_video}")
    require(re.search(r"\b30 fps\b", info) is not None, "30 fps video stream missing")
    if manifest.get("requires_audio"):
        require("Audio: aac" in info, "AAC audio stream missing")
        require("stereo" in info, "stereo audio layout missing")

    tail_preview = Path(manifest["tail_preview"])
    require(tail_preview.exists(), f"tail preview missing: {tail_preview}")

    print("BASELINE PASS")
    print(f"artifact: {artifact}")
    print(f"duration: {duration:.2f}s")
    print(f"sha256: {actual_hash}")


if __name__ == "__main__":
    main()
