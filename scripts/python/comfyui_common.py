"""Shared utilities for ComfyUI scripts.

Extracted from comfyui_generate.py, comfyui_batch.py, and comfyui_serverless.py
to eliminate duplication. All three scripts import from this module.

Contents:
    - load_env(): .env file loader
    - Constants: IMAGE_EXTENSIONS, COMFYUI_DIR, STARTUP_SCRIPT, POLL_INTERVAL,
      GENERATION_TIMEOUT, WORKFLOW_DIRS
    - SSH helpers: ssh_run(), scp_upload(), scp_download(), build_ssh_opts()
    - ComfyUI process management: start_comfyui(), comfyui_is_alive()
    - ComfyUI API: upload_image(), queue_prompt(), get_history(),
      wait_for_prompt(), download_output()
    - Workflow helpers: resolve_workflow(), load_workflow(), set_load_image(),
      get_output_files(), wf_short_name()
    - File helpers: collect_input_files()
    - RunPod GraphQL: runpod_graphql()
    - Pod lifecycle: get_pod(), resume_pod(), stop_pod(), wait_for_pod(),
      get_pod_ssh(), get_pod_comfyui_url()
"""

import json
import os
import subprocess
import sys
import time
import uuid
from pathlib import Path
from typing import Optional

try:
    import requests
except ImportError:
    print("Error: pip install requests")
    sys.exit(1)

try:
    import websocket
    HAS_WEBSOCKET = True
except ImportError:
    HAS_WEBSOCKET = False


# ---------------------------------------------------------------------------
# .env loader
# ---------------------------------------------------------------------------

def load_env():
    """Load .env file from project root if present."""
    env_path = Path(__file__).resolve().parent.parent.parent / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                os.environ.setdefault(key.strip(), value.strip().strip("'\""))


# ---------------------------------------------------------------------------
# Shared constants
# ---------------------------------------------------------------------------

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}
COMFYUI_DIR = "/workspace/ComfyUI"
COMFYUI_INPUT_DIR = f"{COMFYUI_DIR}/input"
STARTUP_SCRIPT = "/workspace/start_comfyui.sh"
POLL_INTERVAL = 5          # seconds between status checks
GENERATION_TIMEOUT = 600   # 10 min per generation

WORKFLOW_DIRS = [
    f"{COMFYUI_DIR}/workflows_api",
    f"{COMFYUI_DIR}/user/default/workflows",
    f"{COMFYUI_DIR}/custom_workflows",
    f"{COMFYUI_DIR}/workflows",
]


# ---------------------------------------------------------------------------
# SSH helpers
# ---------------------------------------------------------------------------

_SSH_OPTS = [
    "-o", "StrictHostKeyChecking=no",
    "-o", "UserKnownHostsFile=/dev/null",
    "-o", "LogLevel=ERROR",
]

_DEFAULT_SSH_KEY = "~/.ssh/id_ed25519"


def ssh_run(
    host: str,
    port: str,
    command: str,
    timeout: int = 30,
    key_path: str = _DEFAULT_SSH_KEY,
) -> subprocess.CompletedProcess:
    """Run a command on a remote host via SSH."""
    key = os.path.expanduser(key_path)
    return subprocess.run(
        ["ssh", "-i", key, *_SSH_OPTS, "-p", port, f"root@{host}", command],
        capture_output=True, text=True, timeout=timeout,
    )


def scp_upload(
    host: str,
    port: str,
    local: str,
    remote: str,
    key_path: str = _DEFAULT_SSH_KEY,
):
    """Upload a file to a remote host via SCP."""
    key = os.path.expanduser(key_path)
    result = subprocess.run(
        ["scp", "-i", key, *_SSH_OPTS, "-P", port, local, f"root@{host}:{remote}"],
        capture_output=True, text=True, timeout=120,
    )
    if result.returncode != 0:
        raise RuntimeError(f"SCP upload failed: {result.stderr}")


def scp_download(
    host: str,
    port: str,
    remote: str,
    local: str,
    key_path: str = _DEFAULT_SSH_KEY,
):
    """Download a file from a remote host via SCP."""
    key = os.path.expanduser(key_path)
    result = subprocess.run(
        ["scp", "-i", key, *_SSH_OPTS, "-P", port, f"root@{host}:{remote}", local],
        capture_output=True, text=True, timeout=300,
    )
    if result.returncode != 0:
        raise RuntimeError(f"SCP download failed: {result.stderr}")


# ---------------------------------------------------------------------------
# ComfyUI process management
# ---------------------------------------------------------------------------

def comfyui_is_alive(base_url: str) -> bool:
    """Quick health check -- True if ComfyUI API responds."""
    try:
        resp = requests.get(f"{base_url}/system_stats", timeout=10)
        return resp.status_code == 200
    except requests.exceptions.RequestException:
        return False


def start_comfyui(
    host: str,
    port: str,
    base_url: str,
    log_fn=None,
    key_path: str = _DEFAULT_SSH_KEY,
):
    """Start our ComfyUI on the pod, replacing the template instance if needed.

    Uses /workspace/start_comfyui.sh which:
      1. Kills the template's ComfyUI (runpod-slim) on port 8188
      2. Installs custom node Python dependencies
      3. Starts our ComfyUI from /workspace/ComfyUI on port 8188
    """
    _log = log_fn or (lambda msg: print(f"[comfyui] {msg}", flush=True))

    # Check if already running
    result = ssh_run(host, port,
        f"ps aux | grep 'python.*main.py' | grep '{COMFYUI_DIR}' | grep -v grep || true",
        key_path=key_path)
    if result.stdout.strip():
        _log("ComfyUI already running.")
    else:
        check = ssh_run(host, port,
            f"test -x {STARTUP_SCRIPT} && echo yes || echo no",
            key_path=key_path)
        if "yes" in check.stdout:
            _log(f"Running startup script: {STARTUP_SCRIPT}")
            ssh_run(host, port,
                f"nohup bash {STARTUP_SCRIPT} > /workspace/startup.log 2>&1 &",
                timeout=10, key_path=key_path)
        else:
            _log("Starting ComfyUI directly...")
            ssh_run(host, port,
                "for p in $(ps aux | grep 'python.*main.py' | grep -v grep | awk '{print $2}'); "
                "do kill -9 $p 2>/dev/null; done",
                timeout=10, key_path=key_path)
            time.sleep(2)
            ssh_run(host, port,
                f"cd {COMFYUI_DIR} && "
                "for d in custom_nodes/*/; do "
                '  [ -f "${d}requirements.txt" ] && pip3 install -q -r "${d}requirements.txt" 2>/dev/null; '
                "done && pip3 install -q sageattention 2>/dev/null",
                timeout=180, key_path=key_path)
            ssh_run(host, port,
                f"cd {COMFYUI_DIR} && "
                "nohup python3 main.py --listen 0.0.0.0 --port 8188 "
                "--disable-auto-launch > /workspace/comfyui_x121.log 2>&1 &",
                timeout=10, key_path=key_path)

    _log("Waiting for ComfyUI API...")
    for _ in range(60):
        time.sleep(5)
        if comfyui_is_alive(base_url):
            _log("ComfyUI ready.")
            return
    raise TimeoutError("ComfyUI did not start within 5 minutes")


def ensure_comfyui(
    base_url: str,
    ssh_host: str,
    ssh_port: str,
    log_fn=None,
    key_path: str = _DEFAULT_SSH_KEY,
):
    """Check ComfyUI health; restart if dead. Blocks until ready."""
    if comfyui_is_alive(base_url):
        return
    _log = log_fn or (lambda msg: print(f"[comfyui] {msg}", flush=True))
    _log("  ComfyUI not responding -- restarting...")
    start_comfyui(ssh_host, ssh_port, base_url, log_fn=_log, key_path=key_path)


# ---------------------------------------------------------------------------
# ComfyUI API
# ---------------------------------------------------------------------------

def upload_image(base_url: str, local_path: Path, name: str) -> str:
    """Upload an image to ComfyUI via its /upload/image endpoint.

    Returns the actual filename assigned by ComfyUI.
    """
    with open(local_path, "rb") as f:
        resp = requests.post(
            f"{base_url}/upload/image",
            files={"image": (name, f, "image/png")},
            data={"overwrite": "true"},
            timeout=60,
        )
    resp.raise_for_status()
    return resp.json().get("name", name)


def queue_prompt(base_url: str, workflow: dict, client_id: str) -> str:
    """Queue a prompt (workflow) and return the prompt_id."""
    resp = requests.post(
        f"{base_url}/prompt",
        json={"prompt": workflow, "client_id": client_id},
        timeout=30,
    )
    if resp.status_code != 200:
        error_text = resp.text[:500]
        try:
            error_json = resp.json()
            if "node_errors" in error_json:
                error_text = json.dumps(error_json, indent=2)[:500]
        except Exception:
            pass
        raise RuntimeError(f"Queue failed ({resp.status_code}): {error_text}")
    return resp.json()["prompt_id"]


def get_history(base_url: str, prompt_id: str) -> Optional[dict]:
    """Get the history/result for a prompt_id."""
    resp = requests.get(f"{base_url}/history/{prompt_id}", timeout=30)
    resp.raise_for_status()
    return resp.json().get(prompt_id)


def wait_for_prompt(
    base_url: str,
    prompt_id: str,
    client_id: str,
    timeout: int = GENERATION_TIMEOUT,
    log_fn=None,
) -> dict:
    """Wait for a prompt to complete using WebSocket with HTTP polling fallback."""
    _log = log_fn or (lambda msg: print(f"[comfyui] {msg}", flush=True))

    ws_url = base_url.replace("https://", "wss://").replace("http://", "ws://")
    ws_url = f"{ws_url}/ws?clientId={client_id}"
    start = time.time()

    if HAS_WEBSOCKET:
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
                        if msg_type == "progress":
                            v = msg_data.get("value", 0)
                            mx = msg_data.get("max", 0)
                            if mx > 0:
                                _log(f"  Progress: {v}/{mx} ({int(v / mx * 100)}%)")
                        elif msg_type == "status":
                            queue_remaining = (
                                msg_data.get("status", {})
                                .get("exec_info", {})
                                .get("queue_remaining", "?")
                            )
                            _log(f"  Queue remaining: {queue_remaining}")
                        elif msg_type == "executing":
                            if (msg_data.get("node") is None
                                    and msg_data.get("prompt_id") == prompt_id):
                                ws.close()
                                history = get_history(base_url, prompt_id)
                                if history:
                                    return history
                        elif msg_type == "execution_error":
                            ws.close()
                            raise RuntimeError(
                                f"Execution error: {json.dumps(msg_data, indent=2)[:500]}"
                            )
                except websocket.WebSocketTimeoutException:
                    history = get_history(base_url, prompt_id)
                    if history and (
                        history.get("status", {}).get("completed")
                        or "outputs" in history
                    ):
                        ws.close()
                        return history
            ws.close()
        except (websocket.WebSocketException, ConnectionError, OSError) as e:
            _log(f"  WebSocket failed ({e}), polling HTTP...")

    # HTTP polling fallback
    while time.time() - start < timeout:
        history = get_history(base_url, prompt_id)
        if history:
            status = history.get("status", {})
            if status.get("completed") or "outputs" in history:
                return history
            if status.get("status_str") == "error":
                raise RuntimeError(
                    f"Generation failed: {json.dumps(status, indent=2)[:500]}"
                )
        elapsed = int(time.time() - start)
        _log(f"  Waiting... ({elapsed}s)")
        time.sleep(POLL_INTERVAL)

    raise TimeoutError(f"Generation timed out after {timeout}s")


def download_output(
    base_url: str,
    filename: str,
    subfolder: str,
    file_type: str,
    dest: Path,
):
    """Download an output file from ComfyUI /view endpoint."""
    resp = requests.get(
        f"{base_url}/view",
        params={"filename": filename, "subfolder": subfolder, "type": file_type},
        stream=True, timeout=120,
    )
    resp.raise_for_status()
    with open(dest, "wb") as f:
        for chunk in resp.iter_content(chunk_size=8192):
            f.write(chunk)


def clear_queue(base_url: str):
    """Clear the ComfyUI queue."""
    requests.post(f"{base_url}/queue", json={"clear": True}, timeout=10)


# ---------------------------------------------------------------------------
# Workflow helpers
# ---------------------------------------------------------------------------

def resolve_workflow(
    host: str,
    port: str,
    name: str,
    search_dirs: Optional[list[str]] = None,
    key_path: str = _DEFAULT_SSH_KEY,
) -> str:
    """Find a workflow by name on the pod.

    Accepts a full remote path or just a filename (will search known dirs).
    """
    if name.startswith("/"):
        return name

    dirs = search_dirs or WORKFLOW_DIRS
    for d in dirs:
        check = ssh_run(host, port, f"test -f '{d}/{name}' && echo found",
                        timeout=10, key_path=key_path)
        if "found" in check.stdout:
            return f"{d}/{name}"

    result = ssh_run(host, port,
        f"find {COMFYUI_DIR} -name '{name}' -type f 2>/dev/null | head -1",
        timeout=15, key_path=key_path)
    found = result.stdout.strip()
    if found:
        return found

    raise FileNotFoundError(
        f"Workflow '{name}' not found on pod. "
        f"Use --list-workflows to see available workflows."
    )


def list_remote_workflows(
    host: str,
    port: str,
    search_dirs: Optional[list[str]] = None,
    key_path: str = _DEFAULT_SSH_KEY,
) -> list[str]:
    """List workflow JSON files on the pod."""
    dirs = search_dirs or WORKFLOW_DIRS
    search_cmd = " && ".join(
        f"find {d} -name '*.json' -type f 2>/dev/null || true"
        for d in dirs
    )
    result = ssh_run(host, port, search_cmd, timeout=15, key_path=key_path)
    workflows = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    return sorted(set(workflows))


def load_workflow(
    host: str,
    port: str,
    remote_path: str,
    key_path: str = _DEFAULT_SSH_KEY,
) -> dict:
    """Load a workflow JSON from the pod via SSH cat."""
    result = ssh_run(host, port, f"cat '{remote_path}'",
                     timeout=15, key_path=key_path)
    if result.returncode != 0:
        raise RuntimeError(f"Failed to read workflow: {result.stderr}")
    return json.loads(result.stdout)


def set_load_image(workflow: dict, image_name: str):
    """Set the input image filename on LoadImage nodes in the workflow.

    Searches for nodes with class_type 'LoadImage' or 'LoadImageFromPath'.
    """
    for node_id, node in workflow.items():
        if isinstance(node, dict) and node.get("class_type") in (
            "LoadImage", "LoadImageFromPath"
        ):
            node["inputs"]["image"] = image_name
            return
    raise ValueError("No LoadImage node in workflow")


def get_output_files(history: dict) -> list[dict]:
    """Extract output file info from a ComfyUI history entry."""
    outputs = history.get("outputs", {})
    files = []
    for _node_id, node_output in outputs.items():
        for key in ["gifs", "images", "videos"]:
            for item in node_output.get(key, []):
                if isinstance(item, dict) and "filename" in item:
                    files.append({
                        "filename": item["filename"],
                        "subfolder": item.get("subfolder", ""),
                        "type": item.get("type", "output"),
                    })
    return files


def wf_short_name(workflow_name: str) -> str:
    """Extract a short name from a workflow filename (strip path and '-api' suffix)."""
    return Path(workflow_name).stem.replace("-api", "")


# ---------------------------------------------------------------------------
# File helpers
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
# RunPod GraphQL API
# ---------------------------------------------------------------------------

def runpod_graphql(api_key: str, query: str) -> dict:
    """Execute a RunPod GraphQL query/mutation."""
    resp = requests.post(
        "https://api.runpod.io/graphql",
        headers={
            "Content-Type": "application/json",
            "api-key": api_key,
        },
        json={"query": query},
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    if "errors" in data:
        raise RuntimeError(f"RunPod API errors: {data['errors']}")
    return data


# ---------------------------------------------------------------------------
# Pod lifecycle
# ---------------------------------------------------------------------------

def get_pod(api_key: str, pod_id: str) -> dict:
    """Get current pod status and runtime info."""
    query = f'''
    query {{
        pod(input: {{podId: "{pod_id}"}}) {{
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
    '''
    data = runpod_graphql(api_key, query)
    pod = data.get("data", {}).get("pod")
    if not pod:
        raise RuntimeError(f"Pod {pod_id} not found. Check your RUNPOD_POD_ID.")
    return pod


def resume_pod(api_key: str, pod_id: str):
    """Resume/start a stopped pod."""
    mutation = f'''
    mutation {{
        podResume(input: {{podId: "{pod_id}", gpuCount: 1}}) {{
            id
            desiredStatus
        }}
    }}
    '''
    runpod_graphql(api_key, mutation)


def stop_pod(api_key: str, pod_id: str):
    """Stop (pause) a pod -- can be resumed later."""
    mutation = f'''
    mutation {{
        podStop(input: {{podId: "{pod_id}"}}) {{
            id
            desiredStatus
        }}
    }}
    '''
    runpod_graphql(api_key, mutation)


def get_pod_ssh(pod: dict) -> tuple[str, str]:
    """Extract SSH host and port from pod runtime info."""
    runtime = pod.get("runtime")
    if not runtime:
        raise RuntimeError("Pod has no runtime (not running?)")
    for port_info in runtime.get("ports", []):
        if port_info.get("privatePort") == 22 and port_info.get("isIpPublic"):
            return port_info["ip"], str(port_info["publicPort"])
    raise RuntimeError("No public SSH port found on pod")


def get_pod_comfyui_url(pod_id: str) -> str:
    """Get the ComfyUI proxy URL for a RunPod pod."""
    return f"https://{pod_id}-8188.proxy.runpod.net"


def wait_for_pod(
    api_key: str,
    pod_id: str,
    timeout: int = 300,
    log_fn=None,
    key_path: str = _DEFAULT_SSH_KEY,
) -> dict:
    """Wait for pod to be running with SSH accessible."""
    _log = log_fn or (lambda msg: print(f"[pod] {msg}", flush=True))
    _log("Waiting for pod to be ready...")
    start = time.time()
    while time.time() - start < timeout:
        try:
            pod = get_pod(api_key, pod_id)
            status = pod.get("desiredStatus", "")
            runtime = pod.get("runtime")
            if status == "RUNNING" and runtime:
                try:
                    ssh_host, ssh_port = get_pod_ssh(pod)
                    result = ssh_run(ssh_host, ssh_port, "echo ok",
                                     timeout=10, key_path=key_path)
                    if result.returncode == 0 and "ok" in result.stdout:
                        _log(f"Pod ready. SSH: {ssh_host}:{ssh_port}")
                        return pod
                except Exception:
                    pass
            elapsed = int(time.time() - start)
            _log(f"  Status: {status}, runtime: {'yes' if runtime else 'no'} ({elapsed}s)")
        except Exception as e:
            _log(f"  Waiting... ({e})")
        time.sleep(10)
    raise TimeoutError(f"Pod not ready after {timeout}s")
