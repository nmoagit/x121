"""Shared QA script runner and utilities.

All QA scripts expose a `check(image_path: str, config: dict) -> dict` function.
This module provides:
- `run_check_cli(check_fn)`: Standard CLI entry point that handles argument parsing,
  JSON output, and error handling.
- `classify_score(score, pass_threshold, warn_threshold)`: Shared tri-state classification.
"""

import sys
import json


# Well-known QA status values. Must match core/src/qa_status.rs constants.
QA_PASS = "pass"
QA_WARN = "warn"
QA_FAIL = "fail"


def run_check_cli(check_fn, script_name="qa_script"):
    """Standard CLI entry point for QA check scripts.

    Handles:
    - argv parsing (image_path, optional config JSON)
    - Calling the check function
    - JSON output to stdout
    - Error handling with JSON error output

    Usage in a QA script's __main__ block::

        from . import run_check_cli
        # or: from qa import run_check_cli  (when run as subprocess)

        if __name__ == "__main__":
            run_check_cli(check, script_name="qa_resolution_format.py")
    """
    if len(sys.argv) < 2:
        print(json.dumps({"error": f"Usage: {script_name} <image_path> [config_json]"}))
        sys.exit(1)

    image_path = sys.argv[1]
    config = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}

    try:
        result = check_fn(image_path, config)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"error": str(e), "results": []}))
        sys.exit(1)


def classify_score(score, pass_threshold, warn_threshold=None):
    """Classify a normalized score into pass/warn/fail.

    Args:
        score: A value (typically 0.0-1.0) to classify.
        pass_threshold: Score at or above this value is "pass".
        warn_threshold: Score at or above this (but below pass_threshold) is "warn".
            If None, anything below pass_threshold is "fail" (no warn zone).

    Returns:
        One of QA_PASS, QA_WARN, or QA_FAIL.
    """
    if score >= pass_threshold:
        return QA_PASS
    if warn_threshold is not None and score >= warn_threshold:
        return QA_WARN
    return QA_FAIL
