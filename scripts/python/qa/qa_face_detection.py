#!/usr/bin/env python3
"""Face detection, centering, and size quality checks."""

import sys
import json


def check(image_path: str, config: dict) -> dict:
    """Run face detection checks on an image."""
    try:
        import cv2
        import numpy as np
    except ImportError:
        return {"results": [], "error": "OpenCV not installed"}

    img = cv2.imread(image_path)
    if img is None:
        return {"results": [], "error": f"Cannot read image: {image_path}"}

    height, width = img.shape[:2]
    image_area = width * height

    # Face center zone (configurable, default: 60% center area)
    center_zone_pct = config.get("center_zone_percent", 60)
    min_face_pct = config.get("min_face_percent", 5)  # min face area as % of image

    # Try InsightFace first, fall back to Haar cascade
    faces = _detect_faces_opencv(img)

    results = []

    # --- Face detection check ---
    has_face = len(faces) > 0
    detection_score = 1.0 if has_face else 0.0
    results.append({
        "check": "face_detection",
        "score": detection_score,
        "status": "pass" if has_face else "fail",
        "details": {
            "faces_found": len(faces),
            "method": "haar_cascade",
            "bounding_boxes": [{"x": int(x), "y": int(y), "w": int(w), "h": int(h)} for (x, y, w, h) in faces]
        }
    })

    if not has_face:
        # Return early with fail for centering and size too
        results.append({"check": "face_centering", "score": 0.0, "status": "fail", "details": {"reason": "no face detected"}})
        results.append({"check": "face_size", "score": 0.0, "status": "fail", "details": {"reason": "no face detected"}})
        return {"results": results}

    # Use the largest face for centering/size checks
    largest = max(faces, key=lambda f: f[2] * f[3])
    fx, fy, fw, fh = largest
    face_cx = fx + fw / 2
    face_cy = fy + fh / 2
    face_area = fw * fh

    # --- Face centering check ---
    # Center zone boundaries
    margin = (100 - center_zone_pct) / 200
    x_min = width * margin
    x_max = width * (1 - margin)
    y_min = height * margin
    y_max = height * (1 - margin)

    in_center = x_min <= face_cx <= x_max and y_min <= face_cy <= y_max
    # Score based on distance from center
    dx = abs(face_cx - width / 2) / (width / 2)
    dy = abs(face_cy - height / 2) / (height / 2)
    centering_score = max(0.0, 1.0 - (dx + dy) / 2)

    centering_status = "pass" if in_center else ("warn" if centering_score > 0.5 else "fail")

    # Suggest crop if off-center
    crop_suggestion = None
    if not in_center:
        crop_size = max(fw, fh) * 2.5
        crop_x = max(0, int(face_cx - crop_size / 2))
        crop_y = max(0, int(face_cy - crop_size / 2))
        crop_suggestion = {"x": crop_x, "y": crop_y, "size": int(min(crop_size, width, height))}

    results.append({
        "check": "face_centering",
        "score": round(centering_score, 4),
        "status": centering_status,
        "details": {
            "face_center": {"x": round(face_cx, 1), "y": round(face_cy, 1)},
            "image_center": {"x": width / 2, "y": height / 2},
            "in_center_zone": in_center,
            "center_zone_percent": center_zone_pct,
            "auto_crop_suggestion": crop_suggestion
        }
    })

    # --- Face size check ---
    face_pct = (face_area / image_area) * 100
    size_score = min(1.0, face_pct / min_face_pct) if min_face_pct > 0 else 1.0
    size_status = "pass" if face_pct >= min_face_pct else ("warn" if face_pct >= min_face_pct * 0.5 else "fail")

    results.append({
        "check": "face_size",
        "score": round(size_score, 4),
        "status": size_status,
        "details": {
            "face_area_percent": round(face_pct, 2),
            "min_required_percent": min_face_pct,
            "face_width": int(fw),
            "face_height": int(fh)
        }
    })

    return {"results": results}


def _detect_faces_opencv(img):
    """Detect faces using OpenCV Haar cascade."""
    import cv2
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    faces = cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30))
    return faces if len(faces) > 0 else []


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: qa_face_detection.py <image_path> [config_json]"}))
        sys.exit(1)

    image_path = sys.argv[1]
    config = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}

    try:
        result = check(image_path, config)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"error": str(e), "results": []}))
        sys.exit(1)
