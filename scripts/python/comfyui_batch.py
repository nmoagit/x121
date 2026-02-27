#!/usr/bin/env python3
"""ComfyUI batch processing script for RunPod Pod with network volume.

Manages the full lifecycle: start pod → start ComfyUI → upload seeds →
select workflow → queue prompts → download outputs → stop pod.

Usage:
    # Process a single image with a workflow on the pod
    python scripts/python/comfyui_batch.py \
        --workflow /workspace/ComfyUI/user/default/workflows/bottom.json \
        --input /path/to/local/seed.png \
        --output ./output

    # Process all images in a directory
    python scripts/python/comfyui_batch.py \
        --workflow /workspace/ComfyUI/user/default/workflows/bottom.json \
        --input /path/to/seeds/ \
        --output ./output

    # List available workflows on the pod
    python scripts/python/comfyui_batch.py --list-workflows

    # Skip pod start/stop (already running)
    python scripts/python/comfyui_batch.py \
        --workflow bottom.json \
        --input ./seeds/ \
        --no-manage-pod

Environment variables (or .env file):
    RUNPOD_API_KEY     - RunPod API key (required)
    RUNPOD_POD_ID      - Pod ID (required)
    SSH_HOST           - SSH host for the pod
    SSH_PORT           - SSH port (default: 22)
    SSH_KEY_PATH       - Path to SSH private key
    COMFYUI_BASE_URL   - ComfyUI HTTP endpoint on the pod
"""

import argparse
import json
import os
import subprocess
import sys
import time
import uuid
from pathlib import Path

try:
    import websocket
    HAS_WEBSOCKET = True
except ImportError:
    HAS_WEBSOCKET = False
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
RUNPOD_POD_ID = os.environ.get("RUNPOD_POD_ID", "")
SSH_HOST = os.environ.get("SSH_HOST", "")
SSH_PORT = os.environ.get("SSH_PORT", "22")
SSH_KEY_PATH = os.environ.get("SSH_KEY_PATH", "~/.ssh/id_ed25519")
COMFYUI_BASE_URL = os.environ.get("COMFYUI_BASE_URL", "")

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}
COMFYUI_DIR = "/workspace/ComfyUI"
COMFYUI_INPUT_DIR = f"{COMFYUI_DIR}/input"
WORKFLOW_SEARCH_DIRS = [
    f"{COMFYUI_DIR}/workflows_api",
    f"{COMFYUI_DIR}/user/default/workflows",
    f"{COMFYUI_DIR}/custom_workflows",
    f"{COMFYUI_DIR}/workflows",
]
POLL_INTERVAL = 5       # seconds between status checks
GENERATION_TIMEOUT = 600  # 10 min per generation

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

def log(msg: str):
    print(f"[comfyui-batch] {msg}", flush=True)

def log_step(step: int, total: int, msg: str):
    print(f"[comfyui-batch] [{step}/{total}] {msg}", flush=True)

# ---------------------------------------------------------------------------
# SSH helpers
# ---------------------------------------------------------------------------

def ssh_cmd(command: str, capture: bool = True, timeout: int = 30) -> subprocess.CompletedProcess:
    """Run a command on the pod via SSH."""
    key_path = os.path.expanduser(SSH_KEY_PATH)
    ssh_args = [
        "ssh", "-i", key_path,
        "-o", "StrictHostKeyChecking=no",
        "-o", "UserKnownHostsFile=/dev/null",
        "-o", "LogLevel=ERROR",
        "-p", SSH_PORT,
        f"root@{SSH_HOST}",
        command,
    ]
    return subprocess.run(
        ssh_args,
        capture_output=capture,
        text=True,
        timeout=timeout,
    )

def scp_upload(local_path: str, remote_path: str):
    """Upload a file to the pod via SCP."""
    key_path = os.path.expanduser(SSH_KEY_PATH)
    scp_args = [
        "scp", "-i", key_path,
        "-o", "StrictHostKeyChecking=no",
        "-o", "UserKnownHostsFile=/dev/null",
        "-o", "LogLevel=ERROR",
        "-P", SSH_PORT,
        local_path,
        f"root@{SSH_HOST}:{remote_path}",
    ]
    result = subprocess.run(scp_args, capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        raise RuntimeError(f"SCP upload failed: {result.stderr}")

def scp_download(remote_path: str, local_path: str):
    """Download a file from the pod via SCP."""
    key_path = os.path.expanduser(SSH_KEY_PATH)
    scp_args = [
        "scp", "-i", key_path,
        "-o", "StrictHostKeyChecking=no",
        "-o", "UserKnownHostsFile=/dev/null",
        "-o", "LogLevel=ERROR",
        "-P", SSH_PORT,
        f"root@{SSH_HOST}:{remote_path}",
        local_path,
    ]
    result = subprocess.run(scp_args, capture_output=True, text=True, timeout=300)
    if result.returncode != 0:
        raise RuntimeError(f"SCP download failed: {result.stderr}")

# ---------------------------------------------------------------------------
# RunPod Pod management (GraphQL API)
# ---------------------------------------------------------------------------

def runpod_graphql(query: str) -> dict:
    """Execute a RunPod GraphQL query/mutation."""
    resp = requests.post(
        "https://api.runpod.io/graphql",
        headers={
            "Content-Type": "application/json",
            "api-key": RUNPOD_API_KEY,
        },
        json={"query": query},
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    if "errors" in data:
        raise RuntimeError(f"RunPod API errors: {data['errors']}")
    return data

def get_pod_status() -> dict:
    """Get current pod status and runtime info."""
    query = f"""
    query {{
      pod(input: {{podId: "{RUNPOD_POD_ID}"}}) {{
        id
        name
        desiredStatus
        runtime {{
          uptimeInSeconds
          ports {{
            ip
            isIpPublic
            privatePort
            publicPort
            type
          }}
        }}
      }}
    }}
    """
    data = runpod_graphql(query)
    pod = data.get("data", {}).get("pod")
    if pod is None:
        raise RuntimeError(f"Pod {RUNPOD_POD_ID} not found. Check your RUNPOD_POD_ID.")
    return pod

def start_pod() -> dict:
    """Resume/start the pod."""
    mutation = f"""
    mutation {{
      podResume(input: {{podId: "{RUNPOD_POD_ID}", gpuCount: 1}}) {{
        id
        desiredStatus
      }}
    }}
    """
    data = runpod_graphql(mutation)
    return data.get("data", {}).get("podResume", {})

def stop_pod() -> dict:
    """Stop the pod."""
    mutation = f"""
    mutation {{
      podStop(input: {{podId: "{RUNPOD_POD_ID}"}}) {{
        id
        desiredStatus
      }}
    }}
    """
    data = runpod_graphql(mutation)
    return data.get("data", {}).get("podStop", {})

def wait_for_pod_ready(timeout: int = 300):
    """Wait until the pod is running and SSH is accessible."""
    log("Waiting for pod to be ready...")
    start = time.time()
    while time.time() - start < timeout:
        try:
            pod = get_pod_status()
            status = pod.get("desiredStatus", "")
            runtime = pod.get("runtime")
            if status == "RUNNING" and runtime is not None:
                # Try SSH connectivity
                try:
                    result = ssh_cmd("echo ok", timeout=10)
                    if result.returncode == 0 and "ok" in result.stdout:
                        log("Pod is ready and SSH accessible.")
                        return
                except (subprocess.TimeoutExpired, Exception):
                    pass
            log(f"  Pod status: {status}, runtime: {'yes' if runtime else 'no'}...")
        except Exception as e:
            log(f"  Waiting... ({e})")
        time.sleep(10)
    raise TimeoutError(f"Pod not ready after {timeout}s")

# ---------------------------------------------------------------------------
# ComfyUI process management (via SSH)
# ---------------------------------------------------------------------------

STARTUP_SCRIPT = "/workspace/start_comfyui.sh"

def is_our_comfyui_running() -> bool:
    """Check if OUR ComfyUI (from /workspace/ComfyUI) is running."""
    result = ssh_cmd(
        f"ps aux | grep 'python.*main.py' | grep '{COMFYUI_DIR}' | grep -v grep || true"
    )
    return bool(result.stdout.strip())

def start_comfyui():
    """Start our ComfyUI on the pod, replacing the template's instance if needed.

    Uses /workspace/start_comfyui.sh which:
      1. Kills the template's ComfyUI (runpod-slim) on port 8188
      2. Installs custom node Python dependencies
      3. Starts our ComfyUI from /workspace/ComfyUI on port 8188
    """
    if is_our_comfyui_running():
        log("Our ComfyUI is already running.")
        return

    # Check if the startup script exists on the pod
    check = ssh_cmd(f"test -x {STARTUP_SCRIPT} && echo yes || echo no")
    if "yes" in check.stdout:
        log(f"Running startup script: {STARTUP_SCRIPT}")
        ssh_cmd(f"nohup bash {STARTUP_SCRIPT} > /workspace/startup.log 2>&1 &", timeout=10)
    else:
        log("Startup script not found. Starting ComfyUI directly...")
        # Kill anything on port 8188 first
        ssh_cmd(
            "for p in $(ps aux | grep 'python.*main.py' | grep -v grep | awk '{print $2}'); "
            "do kill -9 $p 2>/dev/null; done",
            timeout=10,
        )
        time.sleep(2)
        # Install deps
        ssh_cmd(
            f"cd {COMFYUI_DIR} && "
            "for d in custom_nodes/*/; do "
            '  [ -f "${d}requirements.txt" ] && pip3 install -q -r "${d}requirements.txt" 2>/dev/null; '
            "done && pip3 install -q sageattention 2>/dev/null",
            timeout=120,
        )
        # Start ComfyUI
        ssh_cmd(
            f"cd {COMFYUI_DIR} && "
            "nohup python3 main.py --listen 0.0.0.0 --port 8188 "
            "--disable-auto-launch > /workspace/comfyui_x121.log 2>&1 &",
            timeout=10,
        )

    # Wait for HTTP endpoint to become available
    log("Waiting for ComfyUI HTTP API to respond...")
    for _ in range(60):
        time.sleep(5)
        try:
            resp = requests.get(f"{COMFYUI_BASE_URL}/system_stats", timeout=5)
            if resp.status_code == 200:
                log("ComfyUI is ready.")
                return
        except requests.exceptions.RequestException:
            pass
    raise TimeoutError("ComfyUI did not start within 5 minutes")

def wait_for_comfyui_api(timeout: int = 120):
    """Wait until the ComfyUI HTTP API is responsive."""
    start = time.time()
    while time.time() - start < timeout:
        try:
            resp = requests.get(f"{COMFYUI_BASE_URL}/system_stats", timeout=5)
            if resp.status_code == 200:
                return
        except requests.exceptions.RequestException:
            pass
        time.sleep(3)
    raise TimeoutError(f"ComfyUI API not responsive after {timeout}s")

# ---------------------------------------------------------------------------
# ComfyUI API interaction
# ---------------------------------------------------------------------------

def comfyui_upload_image(local_path: Path, filename: str) -> dict:
    """Upload an image to ComfyUI via its /upload/image endpoint."""
    url = f"{COMFYUI_BASE_URL}/upload/image"
    with open(local_path, "rb") as f:
        resp = requests.post(
            url,
            files={"image": (filename, f, "image/png")},
            data={"overwrite": "true"},
            timeout=60,
        )
    resp.raise_for_status()
    return resp.json()

def comfyui_queue_prompt(workflow: dict, client_id: str) -> str:
    """Queue a prompt (workflow) and return the prompt_id."""
    url = f"{COMFYUI_BASE_URL}/prompt"
    payload = {
        "prompt": workflow,
        "client_id": client_id,
    }
    resp = requests.post(url, json=payload, timeout=30)
    if resp.status_code != 200:
        error_text = resp.text
        try:
            error_json = resp.json()
            if "node_errors" in error_json:
                for node_id, err in error_json["node_errors"].items():
                    log(f"  Node {node_id} error: {err}")
            error_text = json.dumps(error_json, indent=2)
        except Exception:
            pass
        raise RuntimeError(f"Failed to queue prompt ({resp.status_code}):\n{error_text}")
    return resp.json()["prompt_id"]

def comfyui_get_history(prompt_id: str) -> Optional[dict]:
    """Get the history/result for a prompt_id."""
    url = f"{COMFYUI_BASE_URL}/history/{prompt_id}"
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    return data.get(prompt_id)

def comfyui_download_output(filename: str, subfolder: str, file_type: str, dest: Path):
    """Download an output file from ComfyUI /view endpoint."""
    url = f"{COMFYUI_BASE_URL}/view"
    params = {"filename": filename, "subfolder": subfolder, "type": file_type}
    resp = requests.get(url, params=params, stream=True, timeout=120)
    resp.raise_for_status()
    with open(dest, "wb") as f:
        for chunk in resp.iter_content(chunk_size=8192):
            f.write(chunk)

def comfyui_clear_queue():
    """Clear the ComfyUI queue."""
    url = f"{COMFYUI_BASE_URL}/queue"
    requests.post(url, json={"clear": True}, timeout=10)

def wait_for_prompt(prompt_id: str, client_id: str, timeout: int = GENERATION_TIMEOUT) -> dict:
    """Wait for a prompt to complete using WebSocket for real-time updates."""
    # Derive WS URL from HTTP URL
    ws_url = COMFYUI_BASE_URL.replace("https://", "wss://").replace("http://", "ws://")
    ws_url = f"{ws_url}/ws?clientId={client_id}"

    start = time.time()
    if not HAS_WEBSOCKET:
        log("websocket-client not installed, using HTTP polling only.")
        # Jump straight to HTTP polling below
        raise ConnectionError("no websocket")

    try:
        ws = websocket.create_connection(ws_url, timeout=10)
        ws.settimeout(POLL_INTERVAL + 2)
        while time.time() - start < timeout:
            try:
                msg = ws.recv()
                if isinstance(msg, str):
                    data = json.loads(msg)
                    msg_type = data.get("type", "")
                    msg_data = data.get("data", {})

                    if msg_type == "status":
                        queue_remaining = msg_data.get("status", {}).get("exec_info", {}).get("queue_remaining", "?")
                        log(f"  Queue remaining: {queue_remaining}")
                    elif msg_type == "progress":
                        value = msg_data.get("value", 0)
                        maximum = msg_data.get("max", 0)
                        if maximum > 0:
                            pct = int(value / maximum * 100)
                            log(f"  Progress: {value}/{maximum} ({pct}%)")
                    elif msg_type == "executing":
                        node = msg_data.get("node")
                        if node is None and msg_data.get("prompt_id") == prompt_id:
                            # Execution finished
                            ws.close()
                            history = comfyui_get_history(prompt_id)
                            if history:
                                return history
                    elif msg_type == "execution_error":
                        ws.close()
                        raise RuntimeError(f"Execution error: {json.dumps(msg_data, indent=2)}")
            except websocket.WebSocketTimeoutException:
                # Check via HTTP fallback
                history = comfyui_get_history(prompt_id)
                if history and history.get("status", {}).get("completed", False):
                    ws.close()
                    return history
        ws.close()
    except (websocket.WebSocketException, ConnectionError, OSError) as e:
        log(f"WebSocket unavailable ({e}), falling back to HTTP polling...")

    # HTTP polling fallback
    while time.time() - start < timeout:
        history = comfyui_get_history(prompt_id)
        if history:
            status = history.get("status", {})
            if status.get("completed", False) or "outputs" in history:
                return history
            if status.get("status_str") == "error":
                raise RuntimeError(f"Generation failed: {json.dumps(status, indent=2)}")
        elapsed = int(time.time() - start)
        log(f"  Waiting for completion... ({elapsed}s)")
        time.sleep(POLL_INTERVAL)

    raise TimeoutError(f"Generation did not complete within {timeout}s")

# ---------------------------------------------------------------------------
# Workflow helpers
# ---------------------------------------------------------------------------

def list_remote_workflows() -> list[str]:
    """List workflow JSON files on the pod."""
    search_cmd = " && ".join(
        f"find {d} -name '*.json' -type f 2>/dev/null || true"
        for d in WORKFLOW_SEARCH_DIRS
    )
    result = ssh_cmd(search_cmd, timeout=15)
    workflows = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    return sorted(set(workflows))

def load_remote_workflow(remote_path: str) -> dict:
    """Load a workflow JSON from the pod via SSH cat."""
    result = ssh_cmd(f"cat '{remote_path}'", timeout=15)
    if result.returncode != 0:
        raise RuntimeError(f"Failed to read workflow: {result.stderr}")
    return json.loads(result.stdout)

def resolve_workflow_path(workflow_arg: str) -> str:
    """Resolve a workflow argument to a full remote path.

    Accepts:
      - Full remote path: /workspace/ComfyUI/user/default/workflows/bottom.json
      - Just a filename: bottom.json (will search known dirs)
    """
    # Already a full path
    if workflow_arg.startswith("/"):
        return workflow_arg

    # Search for it
    for search_dir in WORKFLOW_SEARCH_DIRS:
        check = ssh_cmd(f"test -f '{search_dir}/{workflow_arg}' && echo found", timeout=10)
        if "found" in check.stdout:
            return f"{search_dir}/{workflow_arg}"

    # Try a find
    result = ssh_cmd(
        f"find {COMFYUI_DIR} -name '{workflow_arg}' -type f 2>/dev/null | head -1",
        timeout=15,
    )
    found = result.stdout.strip()
    if found:
        return found

    raise FileNotFoundError(
        f"Workflow '{workflow_arg}' not found on pod. "
        f"Use --list-workflows to see available workflows."
    )

def find_node_by_class(workflow: dict, class_types: list[str]) -> Optional[str]:
    """Find the first node matching any of the given class_types."""
    for node_id, node in workflow.items():
        if isinstance(node, dict) and node.get("class_type") in class_types:
            return node_id
    return None

def set_input_image_name(workflow: dict, image_name: str):
    """Set the input image filename on LoadImage nodes in the workflow."""
    load_classes = ["LoadImage", "LoadImageFromPath"]
    node_id = find_node_by_class(workflow, load_classes)
    if node_id is None:
        available = sorted(set(
            n.get("class_type") for n in workflow.values()
            if isinstance(n, dict) and n.get("class_type")
        ))
        raise ValueError(
            f"No LoadImage node found in workflow.\n"
            f"Available node types: {', '.join(available)}"
        )
    workflow[node_id]["inputs"]["image"] = image_name

def get_output_files(history: dict) -> list[dict]:
    """Extract output file info from a ComfyUI history entry."""
    outputs = history.get("outputs", {})
    files = []
    for node_id, node_output in outputs.items():
        for key in ["gifs", "images", "videos"]:
            for item in node_output.get(key, []):
                if isinstance(item, dict) and "filename" in item:
                    files.append({
                        "filename": item["filename"],
                        "subfolder": item.get("subfolder", ""),
                        "type": item.get("type", "output"),
                    })
    return files

# ---------------------------------------------------------------------------
# Input collection
# ---------------------------------------------------------------------------

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
# Main batch processing
# ---------------------------------------------------------------------------

def process_batch(
    workflow_path: str,
    input_files: list[Path],
    output_dir: Path,
    timeout: int = GENERATION_TIMEOUT,
) -> list[dict]:
    """Process a batch of images through a ComfyUI workflow."""
    total_steps = len(input_files)
    client_id = str(uuid.uuid4())

    # Load workflow from pod
    log(f"Loading workflow: {workflow_path}")
    workflow_template = load_remote_workflow(workflow_path)
    log(f"Workflow loaded ({len(workflow_template)} nodes)")

    results = []

    for i, input_file in enumerate(input_files, 1):
        log(f"\n{'='*60}")
        log_step(i, total_steps, f"Processing: {input_file.name}")
        log(f"{'='*60}")

        # Upload the seed image to ComfyUI
        upload_name = input_file.name
        log(f"  Uploading seed image: {upload_name}")
        try:
            upload_result = comfyui_upload_image(input_file, upload_name)
            actual_name = upload_result.get("name", upload_name)
            log(f"  Uploaded as: {actual_name}")
        except Exception as e:
            log(f"  HTTP upload failed ({e}), trying SCP fallback...")
            scp_upload(str(input_file), f"{COMFYUI_INPUT_DIR}/{upload_name}")
            actual_name = upload_name

        # Prepare workflow with this image
        workflow = json.loads(json.dumps(workflow_template))
        try:
            set_input_image_name(workflow, actual_name)
        except ValueError as e:
            log(f"  Warning: {e}")
            log("  Submitting workflow without modifying input image.")

        # Queue the prompt
        log("  Queueing prompt...")
        try:
            prompt_id = comfyui_queue_prompt(workflow, client_id)
        except RuntimeError as e:
            log(f"  ERROR queueing prompt: {e}")
            continue
        log(f"  Prompt ID: {prompt_id}")

        # Wait for completion
        log("  Waiting for generation...")
        try:
            history = wait_for_prompt(prompt_id, client_id, timeout=timeout)
        except (TimeoutError, RuntimeError) as e:
            log(f"  ERROR: {e}")
            continue

        # Download outputs
        output_files = get_output_files(history)
        if not output_files:
            log("  Warning: No output files found in history.")
            continue

        output_dir.mkdir(parents=True, exist_ok=True)
        for out_file in output_files:
            fname = out_file["filename"]
            ext = Path(fname).suffix or ".mp4"
            # Name output after the input seed
            out_name = f"{input_file.stem}{ext}"
            # Avoid collisions when multiple outputs per input
            if len(output_files) > 1:
                idx = output_files.index(out_file)
                out_name = f"{input_file.stem}_{idx}{ext}"
            dest = output_dir / out_name

            log(f"  Downloading: {fname} → {dest.name}")
            try:
                comfyui_download_output(
                    out_file["filename"],
                    out_file["subfolder"],
                    out_file["type"],
                    dest,
                )
                results.append({
                    "input": input_file.name,
                    "output": out_name,
                    "prompt_id": prompt_id,
                })
            except Exception as e:
                log(f"  HTTP download failed ({e}), trying SCP...")
                # Fallback: download from output dir via SCP
                remote_output = f"{COMFYUI_DIR}/output/{out_file['subfolder']}/{fname}" if out_file["subfolder"] else f"{COMFYUI_DIR}/output/{fname}"
                try:
                    scp_download(remote_output, str(dest))
                    results.append({
                        "input": input_file.name,
                        "output": out_name,
                        "prompt_id": prompt_id,
                    })
                except Exception as e2:
                    log(f"  SCP download also failed: {e2}")

        log_step(i, total_steps, f"Done: {input_file.name}")

    return results

# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="ComfyUI Batch Processor for RunPod Pod",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--workflow", "-w",
        help="Workflow JSON name or full remote path (e.g., bottom.json or /workspace/ComfyUI/...)",
    )
    parser.add_argument(
        "--input", "-i",
        help="Local input image or directory of images",
    )
    parser.add_argument(
        "--output", "-o",
        default="./output",
        help="Local directory to save outputs (default: ./output)",
    )
    parser.add_argument(
        "--list-workflows",
        action="store_true",
        help="List available workflows on the pod and exit",
    )
    parser.add_argument(
        "--no-manage-pod",
        action="store_true",
        help="Skip pod start/stop (assume pod is already running)",
    )
    parser.add_argument(
        "--no-stop",
        action="store_true",
        help="Don't stop the pod when done (keep it running)",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=GENERATION_TIMEOUT,
        help=f"Timeout per generation in seconds (default: {GENERATION_TIMEOUT})",
    )

    args = parser.parse_args()

    # Validate env
    if not RUNPOD_API_KEY:
        print("Error: RUNPOD_API_KEY not set.")
        sys.exit(1)
    if not RUNPOD_POD_ID:
        print("Error: RUNPOD_POD_ID not set.")
        sys.exit(1)

    manage_pod = not args.no_manage_pod

    # -----------------------------------------------------------------------
    # Step 1: Start the pod
    # -----------------------------------------------------------------------
    if manage_pod:
        log("Step 1: Starting pod...")
        try:
            pod = get_pod_status()
            status = pod.get("desiredStatus", "")
            if status == "RUNNING" and pod.get("runtime"):
                log(f"Pod already running (uptime: {pod['runtime'].get('uptimeInSeconds', '?')}s)")
            else:
                log(f"Pod status: {status}. Resuming...")
                start_pod()
                wait_for_pod_ready()
        except Exception as e:
            log(f"Error starting pod: {e}")
            sys.exit(1)
    else:
        log("Skipping pod management (--no-manage-pod)")

    # -----------------------------------------------------------------------
    # Step 2: Start ComfyUI (headless, queue-based)
    # -----------------------------------------------------------------------
    log("Step 2: Starting ComfyUI headless server...")
    try:
        start_comfyui()
    except TimeoutError as e:
        log(f"Error: {e}")
        sys.exit(1)

    # -----------------------------------------------------------------------
    # Handle --list-workflows
    # -----------------------------------------------------------------------
    if args.list_workflows:
        log("\nAvailable workflows on pod:")
        workflows = list_remote_workflows()
        if not workflows:
            log("  No workflow JSON files found in known directories.")
        for wf in workflows:
            log(f"  {wf}")
        sys.exit(0)

    # -----------------------------------------------------------------------
    # Validate required args for processing
    # -----------------------------------------------------------------------
    if not args.workflow:
        print("Error: --workflow is required (use --list-workflows to see options)")
        sys.exit(1)
    if not args.input:
        print("Error: --input is required")
        sys.exit(1)

    # -----------------------------------------------------------------------
    # Step 3: Resolve workflow
    # -----------------------------------------------------------------------
    log("Step 3: Resolving workflow...")
    try:
        workflow_path = resolve_workflow_path(args.workflow)
        log(f"Using workflow: {workflow_path}")
    except FileNotFoundError as e:
        log(f"Error: {e}")
        sys.exit(1)

    # -----------------------------------------------------------------------
    # Step 4: Collect seed images
    # -----------------------------------------------------------------------
    input_path = Path(args.input).resolve()
    input_files = collect_input_files(input_path)
    if not input_files:
        log(f"No valid images found at {input_path}")
        sys.exit(1)
    log(f"Step 4: Found {len(input_files)} seed image(s):")
    for f in input_files:
        log(f"  - {f.name}")

    # -----------------------------------------------------------------------
    # Step 5: Generate videos
    # -----------------------------------------------------------------------
    output_dir = Path(args.output).resolve()
    generation_timeout = args.timeout

    log(f"\nStep 5: Processing {len(input_files)} image(s)...")
    results = process_batch(workflow_path, input_files, output_dir, generation_timeout)

    # -----------------------------------------------------------------------
    # Step 6: Summary and cleanup
    # -----------------------------------------------------------------------
    log(f"\n{'='*60}")
    log(f"BATCH COMPLETE")
    log(f"{'='*60}")
    log(f"Processed: {len(results)}/{len(input_files)} images")
    if results:
        log(f"Outputs saved to: {output_dir}")
        for r in results:
            log(f"  {r['input']} → {r['output']}")

    # Save manifest
    if results:
        manifest_path = output_dir / "batch_manifest.json"
        with open(manifest_path, "w") as f:
            json.dump(results, f, indent=2)
        log(f"Manifest: {manifest_path}")

    # Clear queue
    log("\nClearing ComfyUI queue...")
    try:
        comfyui_clear_queue()
        log("Queue cleared.")
    except Exception as e:
        log(f"Warning: Could not clear queue: {e}")

    # Stop pod
    if manage_pod and not args.no_stop:
        log("Stopping pod...")
        try:
            stop_pod()
            log("Pod stop requested.")
        except Exception as e:
            log(f"Warning: Could not stop pod: {e}")
    else:
        log("Pod left running (--no-stop or --no-manage-pod)")

    log("\nDone!")

if __name__ == "__main__":
    main()
