#!/usr/bin/env python3
"""Grain/texture analysis between adjacent segment frames.

Usage:
    python temporal_grain_analysis.py <frame_a_path> <frame_b_path>

Output (JSON to stdout):
    {
        "grain_variance_a": float,
        "grain_variance_b": float,
        "match_score": float   # 0 = very different, 1 = identical grain
    }
"""

import json
import sys


def analyze_grain(frame_a_path: str, frame_b_path: str) -> dict:
    """Compare grain/texture patterns between two frames."""
    try:
        import cv2
        import numpy as np
    except ImportError:
        return {"error": "OpenCV/NumPy not installed"}

    a = cv2.imread(frame_a_path)
    b = cv2.imread(frame_b_path)

    if a is None:
        return {"error": f"Cannot read image: {frame_a_path}"}
    if b is None:
        return {"error": f"Cannot read image: {frame_b_path}"}

    # High-pass filter to isolate grain/texture
    grain_a = a.astype(np.float64) - cv2.GaussianBlur(a, (21, 21), 0).astype(np.float64)
    grain_b = b.astype(np.float64) - cv2.GaussianBlur(b, (21, 21), 0).astype(np.float64)

    var_a = float(np.var(grain_a))
    var_b = float(np.var(grain_b))

    # Normalized match score
    max_var = max(var_a, var_b, 1e-6)
    match_score = 1.0 - abs(var_a - var_b) / max_var

    return {
        "grain_variance_a": round(var_a, 6),
        "grain_variance_b": round(var_b, 6),
        "match_score": round(max(0.0, min(1.0, match_score)), 6),
    }


def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: temporal_grain_analysis.py <frame_a_path> <frame_b_path>"}))
        sys.exit(1)

    result = analyze_grain(sys.argv[1], sys.argv[2])
    print(json.dumps(result))


if __name__ == "__main__":
    main()
