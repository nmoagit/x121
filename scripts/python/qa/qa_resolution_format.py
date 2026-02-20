#!/usr/bin/env python3
"""Resolution and format quality checks for source/variant images."""

import sys
import json
from pathlib import Path


def check(image_path: str, config: dict) -> dict:
    """Run resolution and format checks on an image."""
    try:
        from PIL import Image
    except ImportError:
        return {"results": [], "error": "Pillow not installed"}

    img = Image.open(image_path)
    width, height = img.size
    fmt = img.format  # 'PNG', 'JPEG', 'WEBP', etc.

    min_res = config.get("min_resolution", 1024)
    accepted_formats = config.get("formats", ["PNG", "JPEG", "WEBP"])
    expected_ratio = config.get("aspect_ratio", None)  # e.g., [1, 1] for square

    results = []

    # --- Resolution check ---
    min_dim = min(width, height)
    res_score = min(1.0, min_dim / min_res) if min_res > 0 else 1.0
    res_status = "pass" if min_dim >= min_res else ("warn" if min_dim >= min_res * 0.75 else "fail")
    results.append({
        "check": "resolution",
        "score": round(res_score, 4),
        "status": res_status,
        "details": {
            "width": width,
            "height": height,
            "min_dimension": min_dim,
            "min_required": min_res,
            "aspect_ratio": round(width / height, 4) if height > 0 else 0
        }
    })

    # --- Format check ---
    fmt_upper = (fmt or "UNKNOWN").upper()
    fmt_ok = fmt_upper in [f.upper() for f in accepted_formats]
    results.append({
        "check": "format",
        "score": 1.0 if fmt_ok else 0.0,
        "status": "pass" if fmt_ok else "fail",
        "details": {
            "format": fmt_upper,
            "accepted_formats": accepted_formats
        }
    })

    # --- Aspect ratio check (optional) ---
    if expected_ratio and len(expected_ratio) == 2:
        expected = expected_ratio[0] / expected_ratio[1]
        actual = width / height if height > 0 else 0
        ratio_diff = abs(actual - expected) / expected if expected > 0 else 0
        ratio_score = max(0.0, 1.0 - ratio_diff * 5)  # 20% deviation = 0 score
        ratio_status = "pass" if ratio_diff < 0.05 else ("warn" if ratio_diff < 0.15 else "fail")
        results.append({
            "check": "aspect_ratio",
            "score": round(ratio_score, 4),
            "status": ratio_status,
            "details": {
                "actual_ratio": round(actual, 4),
                "expected_ratio": round(expected, 4),
                "deviation_percent": round(ratio_diff * 100, 2)
            }
        })

    return {"results": results}


if __name__ == "__main__":
    # Use shared CLI runner to avoid boilerplate duplication across QA scripts.
    # Handles argv parsing, JSON output, and error handling.
    import importlib
    _qa = importlib.import_module("qa")
    _qa.run_check_cli(check, script_name="qa_resolution_format.py")
