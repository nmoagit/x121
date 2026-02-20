#!/usr/bin/env python3
"""Image quality checks: sharpness, lighting, artifact detection."""

import sys
import json


def check(image_path: str, config: dict) -> dict:
    """Run quality checks on an image."""
    try:
        import cv2
        import numpy as np
    except ImportError:
        return {"results": [], "error": "OpenCV not installed"}

    img = cv2.imread(image_path)
    if img is None:
        return {"results": [], "error": f"Cannot read image: {image_path}"}

    results = []
    results.append(check_sharpness(img, config))
    results.append(check_lighting(img, config))
    results.append(check_artifacts(img, config))

    return {"results": results}


def check_sharpness(img, config: dict) -> dict:
    """Score sharpness via Laplacian variance (blur detection)."""
    import cv2
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()

    # Configurable normalization threshold
    sharp_threshold = config.get("sharpness_threshold", 500.0)
    score = min(1.0, laplacian_var / sharp_threshold)

    status = "pass" if score >= 0.6 else ("warn" if score >= 0.3 else "fail")

    return {
        "check": "sharpness",
        "score": round(score, 4),
        "status": status,
        "details": {
            "laplacian_variance": round(laplacian_var, 2),
            "threshold": sharp_threshold
        }
    }


def check_lighting(img, config: dict) -> dict:
    """Assess lighting via HSV brightness distribution."""
    import cv2
    import numpy as np

    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    brightness = hsv[:, :, 2]

    mean_brightness = float(brightness.mean()) / 255.0
    std_brightness = float(brightness.std()) / 255.0

    # Score penalizes too dark or too bright
    # Optimal range: 0.3-0.7 mean brightness
    if mean_brightness < 0.15 or mean_brightness > 0.85:
        score = 0.2
    elif mean_brightness < 0.3 or mean_brightness > 0.7:
        score = 0.6
    else:
        score = 1.0

    # Penalize low contrast (flat lighting)
    if std_brightness < 0.1:
        score *= 0.7

    status = "pass" if score >= 0.6 else ("warn" if score >= 0.3 else "fail")

    return {
        "check": "lighting",
        "score": round(score, 4),
        "status": status,
        "details": {
            "mean_brightness": round(mean_brightness, 4),
            "std_brightness": round(std_brightness, 4),
            "assessment": "too_dark" if mean_brightness < 0.3 else ("too_bright" if mean_brightness > 0.7 else "good")
        }
    }


def check_artifacts(img, config: dict) -> dict:
    """Detect compression and AI artifacts."""
    import cv2
    import numpy as np

    # Check for JPEG compression artifacts (blocking)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Compute 8x8 block boundary differences (JPEG blocking artifact indicator)
    h, w = gray.shape
    block_diffs = []
    for y in range(8, h - 8, 8):
        row_diff = float(np.abs(gray[y, :].astype(float) - gray[y-1, :].astype(float)).mean())
        block_diffs.append(row_diff)
    for x in range(8, w - 8, 8):
        col_diff = float(np.abs(gray[:, x].astype(float) - gray[:, x-1].astype(float)).mean())
        block_diffs.append(col_diff)

    avg_block_diff = float(np.mean(block_diffs)) if block_diffs else 0

    # Higher block differences relative to overall mean = more artifacts
    overall_diff = float(np.abs(np.diff(gray.astype(float), axis=0)).mean() +
                         np.abs(np.diff(gray.astype(float), axis=1)).mean()) / 2

    artifact_ratio = avg_block_diff / overall_diff if overall_diff > 0 else 0

    # Score: lower artifact ratio = better
    score = max(0.0, min(1.0, 1.0 - (artifact_ratio - 0.8) * 5))
    status = "pass" if score >= 0.6 else ("warn" if score >= 0.3 else "fail")

    return {
        "check": "artifacts",
        "score": round(score, 4),
        "status": status,
        "details": {
            "block_boundary_diff": round(avg_block_diff, 2),
            "overall_diff": round(overall_diff, 2),
            "artifact_ratio": round(artifact_ratio, 4),
            "assessment": "clean" if score >= 0.6 else ("minor_artifacts" if score >= 0.3 else "significant_artifacts")
        }
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: qa_image_quality.py <image_path> [config_json]"}))
        sys.exit(1)

    image_path = sys.argv[1]
    config = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}

    try:
        result = check(image_path, config)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"error": str(e), "results": []}))
        sys.exit(1)
