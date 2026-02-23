#!/usr/bin/env python3
"""Grain normalization: match grain/texture of target frame to source.

Usage:
    python temporal_grain_normalize.py <source_frame> <target_frame> <output_path>

Output (JSON to stdout):
    {
        "original_variance": float,
        "normalized_variance": float,
        "improvement": float,         # ratio 0-1, higher = more improvement
        "output_path": str
    }
"""

import json
import sys


def normalize_grain(source_path: str, target_path: str, output_path: str) -> dict:
    """Normalize the grain of the target frame to match the source."""
    try:
        import cv2
        import numpy as np
    except ImportError:
        return {"error": "OpenCV/NumPy not installed"}

    source = cv2.imread(source_path)
    target = cv2.imread(target_path)

    if source is None:
        return {"error": f"Cannot read source: {source_path}"}
    if target is None:
        return {"error": f"Cannot read target: {target_path}"}

    # Extract grain from both
    source_blur = cv2.GaussianBlur(source, (21, 21), 0).astype(np.float64)
    target_blur = cv2.GaussianBlur(target, (21, 21), 0).astype(np.float64)

    source_grain = source.astype(np.float64) - source_blur
    target_grain = target.astype(np.float64) - target_blur

    original_variance = float(np.var(target_grain))
    source_variance = float(np.var(source_grain))

    # Scale target grain to match source grain variance
    target_std = np.std(target_grain) + 1e-8
    source_std = np.std(source_grain) + 1e-8
    scale_factor = source_std / target_std

    normalized_grain = target_grain * scale_factor
    result = target_blur + normalized_grain

    # Clip and convert back to uint8
    result = np.clip(result, 0, 255).astype(np.uint8)
    cv2.imwrite(output_path, result)

    normalized_variance = float(np.var(result.astype(np.float64) - target_blur))

    # Improvement: how much closer are we to the source variance
    original_diff = abs(original_variance - source_variance)
    new_diff = abs(normalized_variance - source_variance)
    improvement = 0.0
    if original_diff > 1e-8:
        improvement = max(0.0, min(1.0, 1.0 - new_diff / original_diff))

    return {
        "original_variance": round(original_variance, 6),
        "normalized_variance": round(normalized_variance, 6),
        "improvement": round(improvement, 6),
        "output_path": output_path,
    }


def main():
    if len(sys.argv) < 4:
        print(json.dumps({"error": "Usage: temporal_grain_normalize.py <source> <target> <output>"}))
        sys.exit(1)

    result = normalize_grain(sys.argv[1], sys.argv[2], sys.argv[3])
    print(json.dumps(result))


if __name__ == "__main__":
    main()
