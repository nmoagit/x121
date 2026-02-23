#!/usr/bin/env python3
"""Subject centering analysis across multiple frames.

Usage:
    python temporal_centering.py <frame_path_1> [frame_path_2 ...]

Output (JSON to stdout):
    {
        "positions": [{"frame": str, "center_x": float, "center_y": float, "bbox": {...}}],
        "drift_from_center": float,   # average drift from frame center
        "max_offset": float            # maximum offset in pixels
    }
"""

import json
import sys


def track_subject_position(frame_paths: list) -> dict:
    """Track subject (face) position across multiple frames."""
    try:
        import cv2
        import numpy as np
    except ImportError:
        return {"error": "OpenCV/NumPy not installed"}

    face_cascade = cv2.CascadeClassifier(
        cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    )

    positions = []
    offsets = []

    for path in frame_paths:
        img = cv2.imread(path)
        if img is None:
            positions.append({"frame": path, "error": "Cannot read image"})
            continue

        height, width = img.shape[:2]
        frame_center_x = width / 2.0
        frame_center_y = height / 2.0

        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        faces = face_cascade.detectMultiScale(
            gray, scaleFactor=1.1, minNeighbors=5, minSize=(60, 60)
        )

        if len(faces) == 0:
            positions.append({
                "frame": path,
                "center_x": None,
                "center_y": None,
                "bbox": None,
                "offset_from_center": None,
            })
            continue

        # Use largest face
        x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
        face_center_x = x + w / 2.0
        face_center_y = y + h / 2.0

        offset = float(np.sqrt(
            (face_center_x - frame_center_x) ** 2 +
            (face_center_y - frame_center_y) ** 2
        ))
        offsets.append(offset)

        positions.append({
            "frame": path,
            "center_x": round(face_center_x, 2),
            "center_y": round(face_center_y, 2),
            "bbox": {"x": int(x), "y": int(y), "w": int(w), "h": int(h)},
            "offset_from_center": round(offset, 2),
        })

    avg_drift = round(float(np.mean(offsets)), 2) if offsets else 0.0
    max_offset = round(float(np.max(offsets)), 2) if offsets else 0.0

    return {
        "positions": positions,
        "drift_from_center": avg_drift,
        "max_offset": max_offset,
    }


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: temporal_centering.py <frame_path_1> [frame_path_2 ...]"}))
        sys.exit(1)

    result = track_subject_position(sys.argv[1:])
    print(json.dumps(result))


if __name__ == "__main__":
    main()
