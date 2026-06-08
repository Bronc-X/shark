from __future__ import annotations

from pathlib import Path

import cv2


ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "pexels_30318835_vibrant_3d_printer_neon_1080p.mp4"
OUTPUT = ROOT / "pexels_30318835_loopable_pingpong_1080p.mp4"
POSTER = ROOT / "pexels_30318835_loopable_poster.jpg"


def read_frame(cap: cv2.VideoCapture, index: int):
    cap.set(cv2.CAP_PROP_POS_FRAMES, index)
    ok, frame = cap.read()
    if not ok:
        raise RuntimeError(f"Could not read frame {index}")
    return frame


def main() -> None:
    cap = cv2.VideoCapture(str(SOURCE))
    if not cap.isOpened():
        raise RuntimeError(f"Could not open {SOURCE}")

    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 25
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    writer = cv2.VideoWriter(
        str(OUTPUT),
        cv2.VideoWriter_fourcc(*"mp4v"),
        fps,
        (width, height),
    )
    if not writer.isOpened():
        raise RuntimeError(f"Could not create {OUTPUT}")

    for index in range(frame_count):
        ok, frame = cap.read()
        if not ok:
            raise RuntimeError(f"Could not stream frame {index}")
        writer.write(frame)

    for index in range(frame_count - 2, -1, -1):
        writer.write(read_frame(cap, index))

    poster_frame = read_frame(cap, frame_count // 2)
    ok, encoded = cv2.imencode(".jpg", poster_frame, [int(cv2.IMWRITE_JPEG_QUALITY), 94])
    if not ok:
        raise RuntimeError("Could not encode poster")
    encoded.tofile(str(POSTER))

    cap.release()
    writer.release()

    seconds = (frame_count + frame_count - 1) / fps
    print(f"Wrote {OUTPUT}")
    print(f"Wrote {POSTER}")
    print(f"{width}x{height} {fps:.2f}fps {seconds:.2f}s")


if __name__ == "__main__":
    main()

