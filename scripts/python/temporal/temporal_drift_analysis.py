#!/usr/bin/env python3
"""Drift analysis: compare a segment frame against source identity embedding.

Usage:
    python temporal_drift_analysis.py <frame_path> <source_embedding_json>

Output (JSON to stdout):
    {
        "drift_score": float,       # 0 = no drift, 1 = max drift
        "face_bbox": {...} | null,  # {x, y, w, h}
        "confidence": float
    }
"""

import json
import sys


def analyze_drift(frame_path: str, source_embedding: list) -> dict:
    """Extract face from frame, compute embedding, compare with source."""
    try:
        import cv2
        import numpy as np
    except ImportError:
        return {"error": "OpenCV/NumPy not installed", "drift_score": None}

    img = cv2.imread(frame_path)
    if img is None:
        return {"error": f"Cannot read image: {frame_path}", "drift_score": None}

    # Detect face using Haar cascade (fallback approach)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    face_cascade = cv2.CascadeClassifier(
        cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    )
    faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(60, 60))

    if len(faces) == 0:
        return {
            "drift_score": 1.0,
            "face_bbox": None,
            "confidence": 0.0,
            "error": "No face detected",
        }

    # Use largest face
    x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
    face_roi = gray[y : y + h, x : x + w]

    # Compute a simple feature vector from the face ROI for comparison.
    # In production this would use a neural embedding model (e.g. InsightFace).
    face_resized = cv2.resize(face_roi, (128, 128))
    frame_features = face_resized.flatten().astype(np.float64)
    frame_features = frame_features / (np.linalg.norm(frame_features) + 1e-8)

    source = np.array(source_embedding, dtype=np.float64)
    source = source / (np.linalg.norm(source) + 1e-8)

    # Truncate or pad to match dimensions
    min_dim = min(len(frame_features), len(source))
    similarity = float(np.dot(frame_features[:min_dim], source[:min_dim]))
    drift_score = max(0.0, min(1.0, 1.0 - similarity))

    return {
        "drift_score": round(drift_score, 6),
        "face_bbox": {"x": int(x), "y": int(y), "w": int(w), "h": int(h)},
        "confidence": round(max(0.0, similarity), 6),
    }


def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: temporal_drift_analysis.py <frame_path> <source_embedding_json>"}))
        sys.exit(1)

    frame_path = sys.argv[1]
    try:
        source_embedding = json.loads(sys.argv[2])
    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"Invalid source embedding JSON: {e}"}))
        sys.exit(1)

    result = analyze_drift(frame_path, source_embedding)
    print(json.dumps(result))


if __name__ == "__main__":
    main()
