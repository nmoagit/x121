#!/usr/bin/env python3
"""ComfyUI serverless batch script for RunPod Serverless with network volume.

Workers spin up on demand — no pod management needed. Models and custom nodes
live on the network volume. You provide a local workflow JSON + seed images,
the script encodes images as base64, submits to the serverless endpoint,
polls for completion, and downloads outputs.

Usage:
    # Process a single image
    python scripts/python/comfyui_serverless.py \
        -w ./workflows/bottom_api.json \
        -i ./seeds/sabien_demonia_clothed.png \
        -o ./output

    # Process all images in a directory
    python scripts/python/comfyui_serverless.py \
        -w ./workflows/bottom_api.json \
        -i ./seeds/ \
        -o ./output

    # Use synchronous mode (blocks until done, 30s timeout on RunPod)
    python scripts/python/comfyui_serverless.py \
        -w ./workflows/bottom_api.json \
        -i ./seeds/image.png \
        --sync

Environment variables (or .env file):
    RUNPOD_API_KEY       - RunPod API key (required)
    RUNPOD_ENDPOINT_ID   - Serverless endpoint ID (default: yx592wf3n8pep4)

Notes:
    - Workflow must be API format (ComfyUI > Workflow > Export API)
    - RunPod request size limits: 10MB for /run, 20MB for /runsync
    - Models are loaded from the network volume automatically
    - Outputs returned as base64 (default) or S3 URLs if configured on endpoint
"""

import argparse
import base64
import json
import os
import sys
import time
from pathlib import Path
from typing import Optional

try:
    import requests
except ImportError:
    print("Error: 'requests' package required. Install with: pip install requests")
    sys.exit(1)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

def load_env():
    """Load .env file if present."""
    env_path = Path(__file__).resolve().parent.parent.parent / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                os.environ.setdefault(key.strip(), value.strip().strip("'\""))

load_env()

RUNPOD_API_KEY = os.environ.get("RUNPOD_API_KEY", "")
RUNPOD_ENDPOINT_ID = os.environ.get("RUNPOD_ENDPOINT_ID", "yx592wf3n8pep4")

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}
POLL_INTERVAL = 5        # seconds between status polls
JOB_TIMEOUT = 600        # 10 min per job

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

def log(msg: str):
    print(f"[serverless] {msg}", flush=True)

def log_step(step: int, total: int, msg: str):
    print(f"[serverless] [{step}/{total}] {msg}", flush=True)

# ---------------------------------------------------------------------------
# RunPod Serverless API
# ---------------------------------------------------------------------------

def runpod_headers() -> dict:
    return {
        "Authorization": f"Bearer {RUNPOD_API_KEY}",
        "Content-Type": "application/json",
    }

def endpoint_url(path: str) -> str:
    return f"https://api.runpod.ai/v2/{RUNPOD_ENDPOINT_ID}/{path}"

def check_endpoint_health() -> dict:
    """Check if the serverless endpoint is healthy."""
    resp = requests.get(endpoint_url("health"), headers=runpod_headers(), timeout=15)
    resp.raise_for_status()
    return resp.json()

def submit_job(payload: dict) -> dict:
    """Submit an async job via /run. Returns job ID immediately."""
    resp = requests.post(
        endpoint_url("run"),
        headers=runpod_headers(),
        json=payload,
        timeout=30,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"RunPod /run error ({resp.status_code}): {resp.text}")
    return resp.json()

def submit_job_sync(payload: dict) -> dict:
    """Submit a sync job via /runsync. Blocks until done (RunPod 30s limit)."""
    resp = requests.post(
        endpoint_url("runsync"),
        headers=runpod_headers(),
        json=payload,
        timeout=300,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"RunPod /runsync error ({resp.status_code}): {resp.text}")
    return resp.json()

def poll_job_status(job_id: str) -> dict:
    """Poll /status/{job_id} for current state."""
    resp = requests.get(
        endpoint_url(f"status/{job_id}"),
        headers=runpod_headers(),
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()

def cancel_job(job_id: str):
    """Cancel a running job."""
    try:
        requests.post(
            endpoint_url(f"cancel/{job_id}"),
            headers=runpod_headers(),
            timeout=10,
        )
    except Exception:
        pass

def wait_for_job(job_id: str, timeout: int = JOB_TIMEOUT) -> dict:
    """Poll until job completes, fails, or times out."""
    start = time.time()
    while time.time() - start < timeout:
        result = poll_job_status(job_id)
        status = result.get("status", "")

        if status == "COMPLETED":
            return result
        elif status in ("FAILED", "CANCELLED", "TIMED_OUT"):
            raise RuntimeError(f"Job {job_id} {status}: {json.dumps(result, indent=2)}")
        elif status == "IN_QUEUE":
            elapsed = int(time.time() - start)
            log(f"  In queue... ({elapsed}s)")
        elif status == "IN_PROGRESS":
            elapsed = int(time.time() - start)
            log(f"  In progress... ({elapsed}s)")

        time.sleep(POLL_INTERVAL)

    raise TimeoutError(f"Job {job_id} did not complete within {timeout}s")

# ---------------------------------------------------------------------------
# Workflow + Image helpers
# ---------------------------------------------------------------------------

def load_workflow(workflow_path: Path) -> dict:
    """Load a ComfyUI API-format workflow JSON."""
    with open(workflow_path) as f:
        data = json.load(f)

    # Sanity check: UI format has "nodes" + "links", API format has numeric keys
    if isinstance(data, dict) and "nodes" in data and "links" in data:
        raise ValueError(
            f"Workflow appears to be UI format (has 'nodes' and 'links').\n"
            "Export as API format: ComfyUI > Workflow > Export (API)\n"
            "Or use scripts/python/convert_workflow.py to convert."
        )
    return data

def image_to_base64(image_path: Path) -> str:
    """Read an image file and return base64-encoded string."""
    data = image_path.read_bytes()
    return base64.b64encode(data).decode("utf-8")

def find_load_image_node(workflow: dict) -> Optional[str]:
    """Find LoadImage node ID in the workflow."""
    candidates = ["LoadImage", "LoadImageFromPath"]
    for node_id, node in workflow.items():
        if isinstance(node, dict) and node.get("class_type") in candidates:
            return node_id
    return None

def set_input_image_name(workflow: dict, image_name: str):
    """Set the image filename on the LoadImage node."""
    node_id = find_load_image_node(workflow)
    if node_id is None:
        available = sorted(set(
            n.get("class_type") for n in workflow.values()
            if isinstance(n, dict) and n.get("class_type")
        ))
        raise ValueError(
            f"No LoadImage node found in workflow.\n"
            f"Available types: {', '.join(available)}"
        )
    workflow[node_id]["inputs"]["image"] = image_name

def save_base64_output(b64_data: str, dest: Path):
    """Save base64-encoded data to a file."""
    # Strip data URI prefix if present
    if "," in b64_data[:100]:
        b64_data = b64_data.split(",", 1)[1]
    dest.write_bytes(base64.b64decode(b64_data))

def collect_input_files(input_path: Path) -> list[Path]:
    """Collect image files from a path (file or directory)."""
    if input_path.is_file():
        return [input_path] if input_path.suffix.lower() in IMAGE_EXTENSIONS else []
    if input_path.is_dir():
        return sorted([
            p for p in input_path.iterdir()
            if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS
        ])
    return []

# ---------------------------------------------------------------------------
# Build request payload
# ---------------------------------------------------------------------------

def build_payload(workflow: dict, input_file: Path) -> dict:
    """Build the RunPod serverless request payload."""
    # Encode the seed image
    image_name = input_file.name
    image_b64 = image_to_base64(input_file)

    # Point the workflow's LoadImage node at our uploaded image name
    set_input_image_name(workflow, image_name)

    return {
        "input": {
            "workflow": workflow,
            "images": [
                {
                    "name": image_name,
                    "image": image_b64,
                }
            ],
        }
    }

# ---------------------------------------------------------------------------
# Process outputs from response
# ---------------------------------------------------------------------------

def save_outputs(result: dict, input_file: Path, output_dir: Path) -> list[dict]:
    """Extract and save output files from a completed job result."""
    output_data = result.get("output", {})
    saved = []

    # The worker returns images/videos under output.images
    items = []
    if isinstance(output_data, dict):
        for key in ["images", "videos", "gifs"]:
            items.extend(output_data.get(key, []))
    elif isinstance(output_data, list):
        items = output_data

    if not items:
        log("  Warning: No output items in response.")
        return saved

    output_dir.mkdir(parents=True, exist_ok=True)

    for i, item in enumerate(items):
        if isinstance(item, dict):
            filename = item.get("filename", f"output_{i}.png")
            data_type = item.get("type", "base64")
            data = item.get("data", "")

            ext = Path(filename).suffix or ".png"
            out_name = f"{input_file.stem}{ext}" if len(items) == 1 else f"{input_file.stem}_{i}{ext}"
            dest = output_dir / out_name

            if data_type == "base64" and data:
                log(f"  Saving: {out_name} (base64, {len(data) // 1024}KB encoded)")
                save_base64_output(data, dest)
                saved.append({"input": input_file.name, "output": out_name})
            elif data_type == "s3_url" and data:
                log(f"  Downloading: {out_name} from S3")
                resp = requests.get(data, stream=True, timeout=120)
                resp.raise_for_status()
                with open(dest, "wb") as f:
                    for chunk in resp.iter_content(chunk_size=8192):
                        f.write(chunk)
                saved.append({"input": input_file.name, "output": out_name})
            else:
                log(f"  Skipping unknown output type: {data_type}")
        elif isinstance(item, str):
            # Plain base64 string or URL
            ext = ".png"
            out_name = f"{input_file.stem}_{i}{ext}"
            dest = output_dir / out_name
            if item.startswith("http"):
                log(f"  Downloading: {out_name}")
                resp = requests.get(item, stream=True, timeout=120)
                with open(dest, "wb") as f:
                    for chunk in resp.iter_content(chunk_size=8192):
                        f.write(chunk)
            else:
                log(f"  Saving: {out_name} (base64)")
                save_base64_output(item, dest)
            saved.append({"input": input_file.name, "output": out_name})

    return saved

# ---------------------------------------------------------------------------
# Batch processing
# ---------------------------------------------------------------------------

def process_batch(
    workflow_path: Path,
    input_files: list[Path],
    output_dir: Path,
    use_sync: bool = False,
    timeout: int = JOB_TIMEOUT,
) -> list[dict]:
    """Process all input files through the serverless endpoint."""
    workflow_template = load_workflow(workflow_path)
    total = len(input_files)
    all_results = []

    for i, input_file in enumerate(input_files, 1):
        log(f"\n{'='*60}")
        log_step(i, total, f"Processing: {input_file.name}")
        log(f"{'='*60}")

        # Build payload (deep copy workflow so we don't mutate template)
        workflow = json.loads(json.dumps(workflow_template))
        try:
            payload = build_payload(workflow, input_file)
        except ValueError as e:
            log(f"  ERROR: {e}")
            continue

        payload_size = len(json.dumps(payload).encode())
        log(f"  Payload size: {payload_size // 1024}KB")
        if payload_size > 20 * 1024 * 1024:
            log("  WARNING: Payload exceeds 20MB RunPod limit. Job may fail.")
        elif payload_size > 10 * 1024 * 1024 and not use_sync:
            log("  WARNING: Payload exceeds 10MB /run limit. Switching to /runsync.")
            use_sync = True

        # Submit
        try:
            if use_sync:
                log("  Submitting (sync)...")
                result = submit_job_sync(payload)
            else:
                log("  Submitting (async)...")
                result = submit_job(payload)
        except RuntimeError as e:
            log(f"  ERROR submitting job: {e}")
            continue

        job_id = result.get("id", "unknown")
        status = result.get("status", "")
        log(f"  Job ID: {job_id}")

        # Wait for completion (sync may already be done)
        if status != "COMPLETED":
            log(f"  Status: {status}. Polling...")
            try:
                result = wait_for_job(job_id, timeout=timeout)
            except (TimeoutError, RuntimeError) as e:
                log(f"  ERROR: {e}")
                continue

        # Save outputs
        log(f"  Job completed (exec: {result.get('executionTime', '?')}ms)")
        saved = save_outputs(result, input_file, output_dir)
        all_results.extend(saved)

        if saved:
            for s in saved:
                log(f"  Saved: {s['output']}")
        else:
            log("  No outputs saved.")

        log_step(i, total, f"Done: {input_file.name}")

    return all_results

# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="ComfyUI Serverless Batch Processor (RunPod)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--workflow", "-w", required=True,
        help="Local path to workflow JSON (API format)",
    )
    parser.add_argument(
        "--input", "-i", required=True,
        help="Local input image or directory of images",
    )
    parser.add_argument(
        "--output", "-o", default="./output",
        help="Local directory to save outputs (default: ./output)",
    )
    parser.add_argument(
        "--sync", action="store_true",
        help="Use /runsync (blocks until done, higher size limit)",
    )
    parser.add_argument(
        "--timeout", type=int, default=JOB_TIMEOUT,
        help=f"Timeout per job in seconds (default: {JOB_TIMEOUT})",
    )
    parser.add_argument(
        "--endpoint", default=None,
        help="Override RUNPOD_ENDPOINT_ID",
    )

    args = parser.parse_args()

    # Override endpoint if provided
    global RUNPOD_ENDPOINT_ID
    if args.endpoint:
        RUNPOD_ENDPOINT_ID = args.endpoint

    if not RUNPOD_API_KEY:
        print("Error: RUNPOD_API_KEY not set.")
        sys.exit(1)
    if not RUNPOD_ENDPOINT_ID:
        print("Error: RUNPOD_ENDPOINT_ID not set.")
        sys.exit(1)

    # Validate workflow
    workflow_path = Path(args.workflow).resolve()
    if not workflow_path.exists():
        print(f"Error: Workflow not found: {workflow_path}")
        sys.exit(1)

    # Collect inputs
    input_path = Path(args.input).resolve()
    input_files = collect_input_files(input_path)
    if not input_files:
        print(f"Error: No valid images found at {input_path}")
        sys.exit(1)

    output_dir = Path(args.output).resolve()

    # Health check
    log(f"Endpoint: {RUNPOD_ENDPOINT_ID}")
    try:
        health = check_endpoint_health()
        workers = health.get("workers", {})
        log(f"Health: ready={workers.get('ready', 0)}, "
            f"running={workers.get('running', 0)}, "
            f"idle={workers.get('idle', 0)}, "
            f"throttled={workers.get('throttled', 0)}")
    except Exception as e:
        log(f"Warning: Health check failed ({e}). Proceeding anyway...")

    log(f"Workflow: {workflow_path.name}")
    log(f"Images: {len(input_files)}")
    for f in input_files:
        log(f"  - {f.name} ({f.stat().st_size // 1024}KB)")

    # Process
    results = process_batch(
        workflow_path,
        input_files,
        output_dir,
        use_sync=args.sync,
        timeout=args.timeout,
    )

    # Summary
    log(f"\n{'='*60}")
    log("BATCH COMPLETE")
    log(f"{'='*60}")
    log(f"Processed: {len(results)}/{len(input_files)}")
    if results:
        log(f"Outputs: {output_dir}")
        for r in results:
            log(f"  {r['input']} → {r['output']}")

        manifest = output_dir / "batch_manifest.json"
        with open(manifest, "w") as f:
            json.dump(results, f, indent=2)
        log(f"Manifest: {manifest}")

    log("\nDone!")

if __name__ == "__main__":
    main()
