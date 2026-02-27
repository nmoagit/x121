#!/usr/bin/env python3
"""ComfyUI full-lifecycle generation script.

Supports three modes:
  1. Scene-based batch (recommended): scan character folders, auto-map scenes
  2. CSV/JSON batch: explicit job list
  3. Single job: one character/workflow/seed

Scene-based batch mode:
    Given a directory of character folders (each with clothed.png / topless.png),
    automatically maps all scenes to the correct workflow and seed image.

    python comfyui_generate.py --batch-dir /path/to/characters -o /path/to/output

    Character folder structure:
        batch5/videos/
            san_chan_claudia/
                clothed.png
                topless.png
            sabien_demonia/
                clothed.png
                topless.png

    Output structure:
        pod_output/
            san_chan_claudia/
                bj.mp4
                topless_bj.mp4
                feet.mp4
                ...
            sabien_demonia/
                bj.mp4
                ...

Scene filtering:
    --scenes bj,feet,bottom          Only these scenes
    --no-scenes topless_bj,topless_feet   All scenes except these

CSV/JSON batch mode:
    python comfyui_generate.py --batch batch.csv -o ./output

Single job mode:
    python comfyui_generate.py -c sabien_demonia -w bj-api.json -s seed.png -o ./output

Environment variables (or .env file):
    RUNPOD_API_KEY   - RunPod API key (required)
"""

import argparse
import csv
import json
import os
import subprocess
import sys
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
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
# Config
# ---------------------------------------------------------------------------

def load_env():
    env_path = Path(__file__).resolve().parent.parent.parent / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                os.environ.setdefault(key.strip(), value.strip().strip("'\""))

load_env()

RUNPOD_API_KEY = os.environ.get("RUNPOD_API_KEY", "")

# Pod creation defaults (matches x121_pod_001 config)
POD_DEFAULTS = {
    "name": "x121-batch-worker",
    "imageName": "runpod/comfyui:latest-5090",
    "gpuTypeId": "NVIDIA RTX PRO 6000 Blackwell Server Edition",
    "gpuCount": 1,
    "containerDiskInGb": 150,
    "volumeInGb": 0,
    "networkVolumeId": "glhxpn3tgb",
    "ports": "8188/http,22/tcp",
    "dataCenterId": "EU-CZ-1",
}

COMFYUI_DIR = "/workspace/ComfyUI"
STARTUP_SCRIPT = "/workspace/start_comfyui.sh"
WORKFLOW_DIRS = [
    f"{COMFYUI_DIR}/workflows_api",
    f"{COMFYUI_DIR}/user/default/workflows",
    f"{COMFYUI_DIR}/workflows",
]
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}
POLL_INTERVAL = 5
GENERATION_TIMEOUT = 600
JOB_MAX_RETRIES = 2  # retry up to 2 times on transient failures

# ---------------------------------------------------------------------------
# Scene definitions: scene_name -> (seed_file, workflow_file)
# ---------------------------------------------------------------------------

SCENE_DEFS = {
    "bj":                   ("clothed.png",  "bj-api.json"),
    "topless_bj":           ("topless.png",  "bj-api.json"),
    "feet":                 ("clothed.png",  "feet-api.json"),
    "topless_feet":         ("topless.png",  "feet-api.json"),
    "topless_sex":          ("topless.png",  "topless-sex-api.json"),
    "boobs_fondle":         ("clothed.png",  "boobs-fondle-api.json"),
    "topless_boobs_fondle": ("topless.png",  "boobs-fondle-api.json"),
    "bottom":               ("clothed.png",  "bottom-api.json"),
    "topless_bottom":       ("topless.png",  "topless-bottom-api.json"),
    "boobs_clothes_off":    ("clothed.png",  "strip-api.json"),
}
ALL_SCENE_NAMES = list(SCENE_DEFS.keys())

# ---------------------------------------------------------------------------
# Logging (thread-safe with per-worker prefix)
# ---------------------------------------------------------------------------

_thread_local = threading.local()
_log_lock = threading.Lock()

def log(msg: str):
    prefix = getattr(_thread_local, "log_prefix", "generate")
    with _log_lock:
        print(f"[{prefix}] {msg}", flush=True)

# ---------------------------------------------------------------------------
# RunPod API
# ---------------------------------------------------------------------------

def graphql(query: str) -> dict:
    resp = requests.post(
        f"https://api.runpod.io/graphql?api_key={RUNPOD_API_KEY}",
        json={"query": query},
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    if "errors" in data:
        raise RuntimeError(f"RunPod API: {data['errors']}")
    return data

# ---------------------------------------------------------------------------
# Pod lifecycle
# ---------------------------------------------------------------------------

def create_pod(name: Optional[str] = None) -> dict:
    """Create a new pod with network volume."""
    d = POD_DEFAULTS
    pod_name = name or d["name"]
    mutation = f'''
    mutation {{
        podFindAndDeployOnDemand(input: {{
            name: "{pod_name}"
            imageName: "{d["imageName"]}"
            gpuTypeId: "{d["gpuTypeId"]}"
            gpuCount: {d["gpuCount"]}
            containerDiskInGb: {d["containerDiskInGb"]}
            volumeInGb: {d["volumeInGb"]}
            networkVolumeId: "{d["networkVolumeId"]}"
            ports: "{d["ports"]}"
            dataCenterId: "{d["dataCenterId"]}"
        }}) {{
            id
            name
            desiredStatus
            imageName
            machine {{
                gpuDisplayName
            }}
        }}
    }}
    '''
    data = graphql(mutation)
    pod = data["data"]["podFindAndDeployOnDemand"]
    log(f"Pod created: {pod['id']} ({pod.get('machine', {}).get('gpuDisplayName', '?')})")
    return pod


def get_pod(pod_id: str) -> dict:
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
    resp = requests.post(
        f"https://api.runpod.io/graphql?api_key={RUNPOD_API_KEY}",
        json={"query": query},
        timeout=30,
    )
    data = resp.json()
    if "errors" in data:
        raise RuntimeError(f"RunPod API: {data['errors']}")
    pod = data["data"]["pod"]
    if not pod:
        raise RuntimeError(f"Pod {pod_id} not found")
    return pod


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
    return f"https://{pod_id}-8188.proxy.runpod.net"


def resume_pod(pod_id: str):
    mutation = f'''
    mutation {{
        podResume(input: {{podId: "{pod_id}", gpuCount: 1}}) {{
            id
            desiredStatus
        }}
    }}
    '''
    graphql(mutation)


def terminate_pod(pod_id: str):
    """Terminate (delete) a pod permanently."""
    mutation = f'''
    mutation {{
        podTerminate(input: {{podId: "{pod_id}"}})
    }}
    '''
    graphql(mutation)
    log(f"Pod {pod_id} terminated.")


def stop_pod(pod_id: str):
    """Stop (pause) a pod — can be resumed later."""
    mutation = f'''
    mutation {{
        podStop(input: {{podId: "{pod_id}"}}) {{
            id
            desiredStatus
        }}
    }}
    '''
    graphql(mutation)
    log(f"Pod {pod_id} stopped.")


def wait_for_pod(pod_id: str, timeout: int = 300) -> dict:
    """Wait for pod to be running with SSH accessible."""
    log("Waiting for pod to be ready...")
    start = time.time()
    while time.time() - start < timeout:
        pod = get_pod(pod_id)
        status = pod.get("desiredStatus", "")
        runtime = pod.get("runtime")
        if status == "RUNNING" and runtime:
            try:
                ssh_host, ssh_port = get_pod_ssh(pod)
                result = ssh_run(ssh_host, ssh_port, "echo ok", timeout=10)
                if result.returncode == 0 and "ok" in result.stdout:
                    log(f"Pod ready. SSH: {ssh_host}:{ssh_port}")
                    return pod
            except Exception:
                pass
        elapsed = int(time.time() - start)
        log(f"  Status: {status}, runtime: {'yes' if runtime else 'no'} ({elapsed}s)")
        time.sleep(10)
    raise TimeoutError(f"Pod not ready after {timeout}s")

# ---------------------------------------------------------------------------
# SSH helpers
# ---------------------------------------------------------------------------

def ssh_run(host: str, port: str, command: str, timeout: int = 30) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["ssh", "-i", os.path.expanduser("~/.ssh/id_ed25520"),
         "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null",
         "-o", "LogLevel=ERROR", "-p", port, f"root@{host}", command],
        capture_output=True, text=True, timeout=timeout,
    )


def scp_upload(host: str, port: str, local: str, remote: str):
    result = subprocess.run(
        ["scp", "-i", os.path.expanduser("~/.ssh/id_ed25520"),
         "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null",
         "-o", "LogLevel=ERROR", "-P", port, local, f"root@{host}:{remote}"],
        capture_output=True, text=True, timeout=120,
    )
    if result.returncode != 0:
        raise RuntimeError(f"SCP upload failed: {result.stderr}")


def scp_download(host: str, port: str, remote: str, local: str):
    result = subprocess.run(
        ["scp", "-i", os.path.expanduser("~/.ssh/id_ed25520"),
         "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null",
         "-o", "LogLevel=ERROR", "-P", port, f"root@{host}:{remote}", local],
        capture_output=True, text=True, timeout=300,
    )
    if result.returncode != 0:
        raise RuntimeError(f"SCP download failed: {result.stderr}")

# ---------------------------------------------------------------------------
# ComfyUI management
# ---------------------------------------------------------------------------

def start_comfyui(host: str, port: str, base_url: str):
    """Start our ComfyUI on the pod."""
    result = ssh_run(host, port,
        f"ps aux | grep 'python.*main.py' | grep '{COMFYUI_DIR}' | grep -v grep || true")
    if result.stdout.strip():
        log("ComfyUI already running.")
    else:
        check = ssh_run(host, port, f"test -x {STARTUP_SCRIPT} && echo yes || echo no")
        if "yes" in check.stdout:
            log(f"Running startup script: {STARTUP_SCRIPT}")
            ssh_run(host, port,
                f"nohup bash {STARTUP_SCRIPT} > /workspace/startup.log 2>&1 &", timeout=10)
        else:
            log("Starting ComfyUI directly...")
            ssh_run(host, port,
                "for p in $(ps aux | grep 'python.*main.py' | grep -v grep | awk '{print $2}'); "
                "do kill -9 $p 2>/dev/null; done", timeout=10)
            time.sleep(2)
            ssh_run(host, port,
                f"cd {COMFYUI_DIR} && "
                "for d in custom_nodes/*/; do "
                '  [ -f "${d}requirements.txt" ] && pip3 install -q -r "${d}requirements.txt" 2>/dev/null; '
                "done && pip3 install -q sageattention 2>/dev/null",
                timeout=180)
            ssh_run(host, port,
                f"cd {COMFYUI_DIR} && "
                "nohup python3 main.py --listen 0.0.0.0 --port 8188 "
                "--disable-auto-launch > /workspace/comfyui_x121.log 2>&1 &",
                timeout=10)

    log("Waiting for ComfyUI API...")
    for _ in range(60):
        time.sleep(5)
        try:
            resp = requests.get(f"{base_url}/system_stats", timeout=5)
            if resp.status_code == 200:
                log("ComfyUI ready.")
                return
        except requests.exceptions.RequestException:
            pass
    raise TimeoutError("ComfyUI did not start within 5 minutes")

def comfyui_is_alive(base_url: str) -> bool:
    """Quick health check — True if ComfyUI API responds."""
    try:
        resp = requests.get(f"{base_url}/system_stats", timeout=10)
        return resp.status_code == 200
    except requests.exceptions.RequestException:
        return False


def ensure_comfyui(base_url: str, ssh_host: str, ssh_port: str):
    """Check ComfyUI health; restart if dead. Blocks until ready."""
    if comfyui_is_alive(base_url):
        return
    log("  ComfyUI not responding — restarting...")
    start_comfyui(ssh_host, ssh_port, base_url)


# ---------------------------------------------------------------------------
# ComfyUI API
# ---------------------------------------------------------------------------

def upload_image(base_url: str, local_path: Path, name: str) -> str:
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
    resp = requests.post(
        f"{base_url}/prompt",
        json={"prompt": workflow, "client_id": client_id},
        timeout=30,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"Queue failed ({resp.status_code}): {resp.text[:500]}")
    return resp.json()["prompt_id"]


def get_history(base_url: str, prompt_id: str) -> Optional[dict]:
    resp = requests.get(f"{base_url}/history/{prompt_id}", timeout=30)
    resp.raise_for_status()
    return resp.json().get(prompt_id)


def wait_for_prompt(base_url: str, prompt_id: str, client_id: str,
                    timeout: int = GENERATION_TIMEOUT) -> dict:
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
                                log(f"  Progress: {v}/{mx} ({int(v/mx*100)}%)")
                        elif msg_type == "executing":
                            if msg_data.get("node") is None and msg_data.get("prompt_id") == prompt_id:
                                ws.close()
                                history = get_history(base_url, prompt_id)
                                if history:
                                    return history
                        elif msg_type == "execution_error":
                            ws.close()
                            raise RuntimeError(f"Execution error: {json.dumps(msg_data, indent=2)[:500]}")
                except websocket.WebSocketTimeoutException:
                    history = get_history(base_url, prompt_id)
                    if history and (history.get("status", {}).get("completed") or "outputs" in history):
                        ws.close()
                        return history
            ws.close()
        except (websocket.WebSocketException, ConnectionError, OSError) as e:
            log(f"  WebSocket failed ({e}), polling HTTP...")

    # HTTP polling fallback
    while time.time() - start < timeout:
        history = get_history(base_url, prompt_id)
        if history:
            status = history.get("status", {})
            if status.get("completed") or "outputs" in history:
                return history
            if status.get("status_str") == "error":
                raise RuntimeError(f"Generation failed: {json.dumps(status, indent=2)[:500]}")
        elapsed = int(time.time() - start)
        log(f"  Waiting... ({elapsed}s)")
        time.sleep(POLL_INTERVAL)
    raise TimeoutError(f"Generation timed out after {timeout}s")


def download_output(base_url: str, filename: str, subfolder: str,
                    file_type: str, dest: Path):
    resp = requests.get(
        f"{base_url}/view",
        params={"filename": filename, "subfolder": subfolder, "type": file_type},
        stream=True, timeout=120,
    )
    resp.raise_for_status()
    with open(dest, "wb") as f:
        for chunk in resp.iter_content(chunk_size=8192):
            f.write(chunk)

# ---------------------------------------------------------------------------
# Workflow helpers
# ---------------------------------------------------------------------------

def resolve_workflow(host: str, port: str, name: str) -> str:
    """Find a workflow by name on the pod."""
    if name.startswith("/"):
        return name
    for d in WORKFLOW_DIRS:
        check = ssh_run(host, port, f"test -f '{d}/{name}' && echo found", timeout=10)
        if "found" in check.stdout:
            return f"{d}/{name}"
    result = ssh_run(host, port,
        f"find {COMFYUI_DIR} -name '{name}' -type f 2>/dev/null | head -1", timeout=15)
    found = result.stdout.strip()
    if found:
        return found
    raise FileNotFoundError(f"Workflow '{name}' not found on pod")


def load_workflow(host: str, port: str, remote_path: str) -> dict:
    result = ssh_run(host, port, f"cat '{remote_path}'", timeout=15)
    if result.returncode != 0:
        raise RuntimeError(f"Failed to read workflow: {result.stderr}")
    return json.loads(result.stdout)


def set_load_image(workflow: dict, image_name: str):
    for node_id, node in workflow.items():
        if isinstance(node, dict) and node.get("class_type") in ("LoadImage", "LoadImageFromPath"):
            node["inputs"]["image"] = image_name
            return
    raise ValueError("No LoadImage node in workflow")

# ---------------------------------------------------------------------------
# Batch file parsing (legacy CSV/JSON mode)
# ---------------------------------------------------------------------------

def load_batch_file(path: Path) -> list[dict]:
    """Load batch file (CSV or JSON). Returns list of {character, workflow, seed}."""
    text = path.read_text().strip()

    if text.startswith("["):
        jobs = json.loads(text)
        for job in jobs:
            if not all(k in job for k in ("character", "workflow", "seed")):
                raise ValueError("JSON jobs must have: character, workflow, seed")
        return jobs

    jobs = []
    reader = csv.DictReader(text.splitlines())
    for row in reader:
        if not all(k in row for k in ("character", "workflow", "seed")):
            raise ValueError("CSV must have columns: character, workflow, seed")
        jobs.append({
            "character": row["character"].strip(),
            "workflow": row["workflow"].strip(),
            "seed": row["seed"].strip(),
        })
    return jobs

# ---------------------------------------------------------------------------
# Scene-based batch: discovery, resolution, preview
# ---------------------------------------------------------------------------

def resolve_scenes(scenes_arg: Optional[str], no_scenes_arg: Optional[str]) -> list[str]:
    """Resolve which scenes to process from CLI args.

    Rules:
      - None or "ALL" -> all scenes
      - Comma-separated list -> only those scenes
      - "NO x, NO y" in scenes_arg -> all scenes minus x, y
      - --no-scenes arg -> additional exclusions
    """
    if not scenes_arg or scenes_arg.strip().upper() == "ALL":
        scenes = list(ALL_SCENE_NAMES)
    else:
        includes = []
        excludes = []
        for item in scenes_arg.split(","):
            item = item.strip()
            if not item:
                continue
            if item.upper().startswith("NO "):
                excludes.append(item[3:].strip())
            else:
                includes.append(item)
        if includes:
            scenes = includes
        else:
            scenes = list(ALL_SCENE_NAMES)
        for ex in excludes:
            if ex in scenes:
                scenes.remove(ex)

    # Apply --no-scenes exclusions
    if no_scenes_arg:
        for item in no_scenes_arg.split(","):
            item = item.strip().lower()
            if item and item in scenes:
                scenes.remove(item)

    # Validate
    for s in scenes:
        if s not in SCENE_DEFS:
            raise ValueError(f"Unknown scene: '{s}'. Valid scenes:\n  {', '.join(ALL_SCENE_NAMES)}")

    return scenes


def parse_scene_spec(spec: str) -> tuple[list[str], list[str]]:
    """Parse a scene spec string into (includes, excludes).

    Scene names are case-insensitive (normalized to lowercase).

    Examples:
        "ALL"                       -> ([], [])           meaning all scenes
        "bj, feet, bottom"          -> ([bj,feet,bottom], [])
        "NO bj, NO topless_bj"     -> ([], [bj,topless_bj])  meaning all minus these
    """
    includes = []
    excludes = []
    for item in spec.split(","):
        item = item.strip()
        if not item:
            continue
        if item.upper() == "ALL":
            continue  # ALL = no filter
        if item.upper().startswith("NO "):
            excludes.append(item[3:].strip().lower())
        else:
            includes.append(item.strip().lower())
    return includes, excludes


def apply_scene_spec(includes: list[str], excludes: list[str],
                     base_scenes: list[str]) -> list[str]:
    """Apply include/exclude filters to a base scene list."""
    if includes:
        scenes = [s for s in includes if s in SCENE_DEFS]
    else:
        scenes = list(base_scenes)
    for ex in excludes:
        if ex in scenes:
            scenes.remove(ex)
    return scenes


def load_config_file(path: Path) -> dict:
    """Parse a batch config file.

    Format:
        batch_path = /mnt/d/Projects/trulience/batch5/videos/
        output_dir = /mnt/d/Projects/trulience/batch5/pod_output/
        scenes = ALL
        pod_id = zhpx47iesi6pa2

        [characters]
        san_chan_claudia
        sabien_demonia = bj, feet, bottom
        carli_nicki = NO topless_bj, NO topless_feet

    Returns dict with keys: batch_path, output_dir, scenes, pod_id, characters
    characters is a list of {"name": str, "scenes": str|None} or None if section omitted.
    """
    text = path.read_text()
    config = {
        "batch_path": None,
        "output_dir": None,
        "scenes": None,
        "pod_id": None,
        "characters": None,
    }

    in_characters = False
    characters = []

    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue

        # Section header
        if line.lower() == "[characters]":
            in_characters = True
            continue

        if in_characters:
            # Character line: "name" or "name = scene_spec"
            if "=" in line:
                name, _, scene_spec = line.partition("=")
                characters.append({"name": name.strip(), "scenes": scene_spec.strip()})
            else:
                characters.append({"name": line, "scenes": None})
        else:
            # Key=value line
            if "=" in line:
                key, _, value = line.partition("=")
                key = key.strip().lower().replace(" ", "_")
                value = value.strip()
                if key in config:
                    config[key] = value

    if characters:
        config["characters"] = characters

    return config


def discover_characters(batch_dir: Path) -> list[dict]:
    """Scan batch_dir for character folders containing seed images."""
    characters = []
    for d in sorted(batch_dir.iterdir()):
        if not d.is_dir():
            continue
        clothed = d / "clothed.png"
        topless = d / "topless.png"
        if clothed.exists() or topless.exists():
            characters.append({
                "name": d.name,
                "dir": d,
                "has_clothed": clothed.exists(),
                "has_topless": topless.exists(),
            })
    return characters


def build_scene_jobs(characters: list[dict], default_scenes: list[str],
                     output_dir: Path,
                     char_scene_overrides: Optional[dict] = None,
                     ) -> tuple[list[dict], list[str]]:
    """Build job list from characters x scenes.

    Args:
        characters: list of character dicts from discover_characters()
        default_scenes: global scene list (used when no per-character override)
        output_dir: base output directory
        char_scene_overrides: optional dict of {char_name: scene_spec_string}
            from config file [characters] section

    Returns (jobs, warnings).
    """
    jobs = []
    warnings = []
    for char in characters:
        # Determine scenes for this character
        override = (char_scene_overrides or {}).get(char["name"])
        if override:
            includes, excludes = parse_scene_spec(override)
            char_scenes = apply_scene_spec(includes, excludes, default_scenes)
        else:
            char_scenes = default_scenes

        for scene in char_scenes:
            seed_file, workflow = SCENE_DEFS[scene]
            seed_path = char["dir"] / seed_file

            if not seed_path.exists():
                warnings.append(f"{char['name']}/{scene}: missing {seed_file}")
                continue

            char_output_dir = output_dir / char["name"]
            jobs.append({
                "character": char["name"],
                "scene": scene,
                "workflow": workflow,
                "seed": str(seed_path),
                "dest_dir": str(char_output_dir),
                "dest_name": scene,
            })
    return jobs, warnings


def preview_jobs(jobs: list[dict], characters: list[dict], scenes: list[str],
                 output_dir: Path, warnings: list[str],
                 num_pods: int = 1):
    """Display the execution plan for user review."""
    log(f"\n{'='*70}")
    log("GENERATION PLAN")
    log(f"{'='*70}")
    # Check which outputs already exist
    existing = 0
    for j in jobs:
        dest_dir = Path(j["dest_dir"]) if "dest_dir" in j else output_dir
        dest_name = j.get("dest_name")
        if dest_name:
            j["_exists"] = (dest_dir / f"{dest_name}.mp4").exists()
        else:
            wf_short = Path(j["workflow"]).stem.replace("-api", "")
            j["_exists"] = (dest_dir / f"{j['character']}_{wf_short}.mp4").exists()
        if j["_exists"]:
            existing += 1

    pending = len(jobs) - existing
    log(f"Characters:  {len(characters)}")
    log(f"Scenes:      {len(scenes)}")
    log(f"Total jobs:  {len(jobs)}" + (f" ({existing} already done, {pending} to run)" if existing else ""))
    log(f"Output dir:  {output_dir}")
    if num_pods > 1:
        serial_min = pending * 7
        parallel_min = serial_min // num_pods
        log(f"Pods:        {num_pods} (parallel)")
        log(f"Est. time:   ~{parallel_min} min ({pending} jobs / {num_pods} pods x ~7 min each)")
    else:
        log(f"Est. time:   ~{pending * 7} min ({pending} jobs x ~7 min each)")

    for char in characters:
        char_jobs = [j for j in jobs if j["character"] == char["name"]]
        char_existing = sum(1 for j in char_jobs if j["_exists"])
        seeds = []
        if char["has_clothed"]:
            seeds.append("clothed")
        if char["has_topless"]:
            seeds.append("topless")
        log(f"\n  {char['name']}/ ({', '.join(seeds)}) — {len(char_jobs)} scenes:")
        log(f"    {'Scene':<25s} {'Seed':<14s} {'Workflow':<25s} {'Output'}")
        log(f"    {'─'*25} {'─'*14} {'─'*25} {'─'*30}")
        for j in char_jobs:
            seed_file = SCENE_DEFS[j["scene"]][0]
            out_rel = f"{char['name']}/{j['dest_name']}.mp4"
            marker = " [EXISTS]" if j["_exists"] else ""
            log(f"    {j['scene']:<25s} {seed_file:<14s} {j['workflow']:<25s} {out_rel}{marker}")

    if warnings:
        log(f"\n  Skipped ({len(warnings)}):")
        for w in warnings:
            log(f"    ! {w}")

    if num_pods > 1:
        pod_groups = distribute_jobs(jobs, num_pods)
        log(f"\n  Pod allocation ({len(pod_groups)} pods):")
        for i, group in enumerate(pod_groups):
            chars = sorted(set(j["character"] for j in group))
            log(f"    pod-{i+1}: {len(group)} jobs — {', '.join(chars)}")

    log(f"\n{'='*70}")

# ---------------------------------------------------------------------------
# Progress tracking
# ---------------------------------------------------------------------------

def _job_key(job: dict) -> str:
    """Unique key for a job: character/scene or character/workflow."""
    scene = job.get("scene") or Path(job["workflow"]).stem.replace("-api", "")
    return f"{job['character']}/{scene}"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _fmt_duration(seconds: float) -> str:
    h, rem = divmod(int(seconds), 3600)
    m, s = divmod(rem, 60)
    if h > 0:
        return f"{h}h {m:02d}m {s:02d}s"
    return f"{m}m {s:02d}s"


class ProgressTracker:
    """Tracks batch progress to a JSON file for resume and monitoring.
    Thread-safe for parallel pod execution."""

    def __init__(self, output_dir: Path):
        self.path = output_dir / "progress.json"
        self._lock = threading.Lock()
        self.data = self._load()
        self._job_times: list[float] = []  # completed job durations for ETA

    def _load(self) -> dict:
        if self.path.exists():
            try:
                return json.loads(self.path.read_text())
            except (json.JSONDecodeError, OSError):
                pass
        return {"started": _now_iso(), "jobs": {}}

    def _save(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(self.data, indent=2))

    def is_completed(self, job: dict) -> bool:
        with self._lock:
            key = _job_key(job)
            entry = self.data["jobs"].get(key, {})
            return entry.get("status") == "completed"

    def count_completed(self) -> int:
        with self._lock:
            return sum(1 for j in self.data["jobs"].values() if j.get("status") == "completed")

    def start_job(self, job: dict):
        with self._lock:
            key = _job_key(job)
            self.data["jobs"][key] = {
                "status": "in_progress",
                "character": job["character"],
                "scene": job.get("scene", ""),
                "workflow": job.get("workflow", ""),
                "started": _now_iso(),
            }
            self._save()

    def complete_job(self, job: dict, files: list[dict], duration: float):
        with self._lock:
            key = _job_key(job)
            self.data["jobs"][key] = {
                "status": "completed",
                "character": job["character"],
                "scene": job.get("scene", ""),
                "workflow": job.get("workflow", ""),
                "started": self.data["jobs"].get(key, {}).get("started", _now_iso()),
                "finished": _now_iso(),
                "duration_s": round(duration, 1),
                "files": [f.get("file", "") for f in files],
            }
            self._job_times.append(duration)
            self._save()

    def fail_job(self, job: dict, error: str, duration: float):
        with self._lock:
            key = _job_key(job)
            self.data["jobs"][key] = {
                "status": "failed",
                "character": job["character"],
                "scene": job.get("scene", ""),
                "workflow": job.get("workflow", ""),
                "started": self.data["jobs"].get(key, {}).get("started", _now_iso()),
                "failed": _now_iso(),
                "duration_s": round(duration, 1),
                "error": str(error)[:200],
            }
            self._save()

    def log_eta(self, total: int, num_workers: int = 1):
        """Log progress stats and estimated time remaining."""
        with self._lock:
            done = sum(1 for j in self.data["jobs"].values() if j.get("status") == "completed")
            remaining = total - done
            job_times = list(self._job_times)

        if job_times:
            avg = sum(job_times) / len(job_times)
            # In parallel mode, N workers process simultaneously
            eta_s = (avg * remaining) / max(num_workers, 1)
            log(f"  Progress: {done}/{total} done | "
                f"Avg: {_fmt_duration(avg)}/job | "
                f"ETA: {_fmt_duration(eta_s)} ({remaining} remaining"
                f"{f', {num_workers} pods' if num_workers > 1 else ''})")
        else:
            log(f"  Progress: {done}/{total} done | {remaining} remaining")

    def finalize(self, total_jobs: int):
        with self._lock:
            completed = sum(1 for j in self.data["jobs"].values() if j.get("status") == "completed")
            failed = sum(1 for j in self.data["jobs"].values() if j.get("status") == "failed")
            self.data["finished"] = _now_iso()
            self.data["summary"] = {
                "total": total_jobs,
                "completed": completed,
                "failed": failed,
                "skipped": total_jobs - completed - failed,
            }
            self._save()


# ---------------------------------------------------------------------------
# Parallel pod orchestration
# ---------------------------------------------------------------------------

def distribute_jobs(jobs: list[dict], num_pods: int) -> list[list[dict]]:
    """Distribute jobs across pods, keeping same-character jobs together."""
    by_char: dict[str, list[dict]] = {}
    for job in jobs:
        by_char.setdefault(job["character"], []).append(job)

    pod_groups: list[list[dict]] = [[] for _ in range(num_pods)]
    for i, (_, char_jobs) in enumerate(by_char.items()):
        pod_groups[i % num_pods].extend(char_jobs)
    return [g for g in pod_groups if g]  # remove empty groups


def pod_worker(
    worker_id: int,
    worker_jobs: list[dict],
    output_dir: Path,
    tracker: ProgressTracker,
    total_jobs: int,
    num_workers: int,
    timeout: int,
    keep_pod: bool,
) -> tuple[str, list[dict]]:
    """Worker function: creates a pod, processes jobs, terminates pod.

    Runs in a thread. Returns (pod_id, results).
    """
    pod_id = None
    prefix = f"pod-{worker_id + 1}"
    _thread_local.log_prefix = prefix
    results = []

    # Summarize what this pod will do
    chars = sorted(set(j["character"] for j in worker_jobs))
    log(f"Starting — {len(worker_jobs)} jobs for: {', '.join(chars)}")

    try:
        # Create pod
        pod = create_pod(name=f"x121-batch-{worker_id + 1}")
        pod_id = pod["id"]
        log(f"Pod created: {pod_id}")

        # Wait for ready
        pod = wait_for_pod(pod_id)
        ssh_host, ssh_port = get_pod_ssh(pod)
        base_url = get_pod_comfyui_url(pod_id)
        log(f"Pod ready. SSH: {ssh_host}:{ssh_port}")

        # Start ComfyUI
        log("Starting ComfyUI...")
        start_comfyui(ssh_host, ssh_port, base_url)

        # Process jobs
        for i, job in enumerate(worker_jobs, 1):
            key = _job_key(job)

            if tracker.is_completed(job):
                log(f"[{i}/{len(worker_jobs)}] {key} — already done, skipping")
                continue

            tracker.start_job(job)
            job_start = time.time()

            try:
                job_results = process_job(
                    job, base_url, ssh_host, ssh_port,
                    output_dir, i, len(worker_jobs), timeout=timeout,
                )
                duration = time.time() - job_start
                results.extend(job_results)
                tracker.complete_job(job, job_results, duration)
                log(f"  Finished in {_fmt_duration(duration)}")
                tracker.log_eta(total_jobs, num_workers)
            except Exception as e:
                duration = time.time() - job_start
                tracker.fail_job(job, str(e), duration)
                log(f"  ERROR: {key}: {e}")
                log(f"  Failed after {_fmt_duration(duration)}")
                tracker.log_eta(total_jobs, num_workers)

        log(f"All jobs complete. {len(results)} files generated.")

    except Exception as e:
        log(f"FATAL: {e}")

    finally:
        # Cleanup pod
        if pod_id:
            try:
                if keep_pod:
                    stop_pod(pod_id)
                    log(f"Pod {pod_id} stopped (can resume later)")
                else:
                    terminate_pod(pod_id)
                    log(f"Pod {pod_id} terminated")
            except Exception as e:
                log(f"Warning: Pod cleanup failed: {e}")

    return pod_id or "unknown", results


# ---------------------------------------------------------------------------
# Main processing
# ---------------------------------------------------------------------------

def process_job(
    job: dict,
    base_url: str,
    ssh_host: str,
    ssh_port: str,
    output_dir: Path,
    job_num: int,
    total: int,
    timeout: int = GENERATION_TIMEOUT,
) -> list[dict]:
    """Process a single generation job. Returns list of saved files."""
    character = job["character"]
    workflow_name = job["workflow"]
    seed_path = Path(job["seed"]).resolve()
    scene = job.get("scene", "")

    # Determine output destination
    dest_dir = Path(job["dest_dir"]) if "dest_dir" in job else output_dir
    dest_name = job.get("dest_name")  # e.g., "bj" for scene-based mode

    label = f"{character}/{scene}" if scene else character
    log(f"\n{'='*60}")
    log(f"[{job_num}/{total}] {label}")
    log(f"  Workflow: {workflow_name}")
    log(f"  Seed: {seed_path.name}")
    if dest_name:
        log(f"  Output: {dest_dir.name}/{dest_name}.mp4")
    log(f"{'='*60}")

    # Skip if output already exists
    if dest_name:
        dest_file = dest_dir / f"{dest_name}.mp4"
    else:
        wf_short = Path(workflow_name).stem.replace("-api", "")
        dest_file = dest_dir / f"{character}_{wf_short}.mp4"
    if dest_file.exists():
        log(f"  SKIP: Output already exists: {dest_file.name}")
        return []

    if not seed_path.exists():
        log(f"  ERROR: Seed file not found: {seed_path}")
        return []

    # Resolve and load workflow
    workflow_path = resolve_workflow(ssh_host, ssh_port, workflow_name)
    workflow = load_workflow(ssh_host, ssh_port, workflow_path)

    # Upload seed image
    upload_name = seed_path.name
    log(f"  Uploading: {upload_name}")
    actual_name = upload_image(base_url, seed_path, upload_name)

    # Set input image in workflow
    try:
        set_load_image(workflow, actual_name)
    except ValueError as e:
        log(f"  Warning: {e}")

    # Queue and wait (with retry on transient failures)
    history = None
    for attempt in range(1, JOB_MAX_RETRIES + 2):  # attempt 1, 2, 3
        try:
            ensure_comfyui(base_url, ssh_host, ssh_port)
            client_id = str(uuid.uuid4())
            log("  Queueing prompt...")
            prompt_id = queue_prompt(base_url, workflow, client_id)
            log(f"  Prompt ID: {prompt_id}")
            log("  Generating...")
            history = wait_for_prompt(base_url, prompt_id, client_id, timeout=timeout)
            break  # success
        except (RuntimeError, requests.exceptions.HTTPError, TimeoutError) as e:
            err_msg = str(e)
            is_transient = (
                any(code in err_msg for code in ("404", "502", "503"))
                or isinstance(e, TimeoutError)
                or not comfyui_is_alive(base_url)
            )
            if is_transient and attempt <= JOB_MAX_RETRIES:
                log(f"  Transient error (attempt {attempt}/{JOB_MAX_RETRIES + 1}): {err_msg}")
                log("  Will restart ComfyUI and retry...")
                time.sleep(5)
                continue
            raise  # non-transient or final attempt — propagate

    # Extract and download outputs
    outputs = history.get("outputs", {})
    files = []
    for node_id, node_output in outputs.items():
        for key in ["gifs", "images", "videos"]:
            for item in node_output.get(key, []):
                if isinstance(item, dict) and "filename" in item:
                    files.append(item)

    if not files:
        log("  Warning: No output files.")
        return []

    # Only save the final output (last file produced by the workflow)
    final_item = files[-1]
    if len(files) > 1:
        log(f"  Workflow produced {len(files)} files, saving final only")

    dest_dir.mkdir(parents=True, exist_ok=True)
    saved = []

    ext = Path(final_item["filename"]).suffix or ".mp4"
    if dest_name:
        out_name = f"{dest_name}{ext}"
    else:
        wf_short = Path(workflow_name).stem.replace("-api", "")
        out_name = f"{character}_{wf_short}{ext}"

    dest = dest_dir / out_name
    log(f"  Downloading: {final_item['filename']} -> {out_name}")
    try:
        download_output(
            base_url,
            final_item["filename"],
            final_item.get("subfolder", ""),
            final_item.get("type", "output"),
            dest,
        )
        saved.append({
            "character": character,
            "scene": scene or Path(workflow_name).stem.replace("-api", ""),
            "file": str(dest.relative_to(dest_dir.parent) if dest_name else out_name),
        })
    except Exception as e:
        log(f"  Download failed: {e}")

    log(f"  Saved: {out_name}")
    return saved

# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="ComfyUI Full-Lifecycle Generation",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Config file mode (recommended):
  python comfyui_generate.py --config batch5.conf --pod-id zhpx47iesi6pa2

  Config file format:
    batch_path = /mnt/d/Projects/trulience/batch5/videos/
    output_dir = /mnt/d/Projects/trulience/batch5/pod_output/
    scenes = ALL

    [characters]
    san_chan_claudia
    sabien_demonia = bj, feet, bottom
    carli_nicki = NO topless_bj, NO topless_feet

  - Omit [characters] section to process ALL folders in batch_path
  - Per-character scene overrides: name = scene1, scene2
  - Per-character exclusions: name = NO scene1, NO scene2

Scene-based batch mode:
  python comfyui_generate.py --batch-dir /path/to/characters -o /path/to/output
  python comfyui_generate.py --batch-dir ./chars -o ./out --no-scenes bj,topless_bj
  python comfyui_generate.py --batch-dir ./chars -o ./out --scenes feet,bottom

Available scenes:
  bj, topless_bj, feet, topless_feet, topless_sex,
  boobs_fondle, topless_boobs_fondle, bottom, topless_bottom,
  boobs_clothes_off

CSV/JSON batch mode:
  python comfyui_generate.py --batch batch.csv -o ./output

Single job mode:
  python comfyui_generate.py -c name -w bj-api.json -s seed.png -o ./output
        """,
    )
    # Config file mode
    parser.add_argument("--config", help="Path to batch config file (see --help for format)")

    # Scene-based batch mode
    parser.add_argument("--batch-dir", "-d",
                        help="Directory of character folders (each with clothed.png/topless.png)")
    parser.add_argument("--scenes",
                        help="Scenes to process: ALL (default), comma-separated, or 'NO x, NO y' to exclude")
    parser.add_argument("--no-scenes",
                        help="Scenes to exclude (comma-separated)")
    parser.add_argument("--yes", "-y", action="store_true",
                        help="Skip confirmation prompt")
    parser.add_argument("--dry-run", action="store_true",
                        help="Show execution plan and exit (no pods created)")

    # Legacy CSV/JSON batch mode
    parser.add_argument("--batch", "-b", help="Path to batch file (CSV or JSON)")

    # Single job mode
    parser.add_argument("--character", "-c", help="Character name (single job mode)")
    parser.add_argument("--workflow", "-w", help="Workflow name (single job mode)")
    parser.add_argument("--seed", "-s", help="Seed image path (single job mode)")

    # Common options
    parser.add_argument("--output", "-o", default="./output", help="Output directory")
    parser.add_argument("--pod-id", help="Use existing pod (skip create/terminate)")
    parser.add_argument("--keep-pod", action="store_true",
                        help="Stop pod instead of terminating (can resume later)")
    parser.add_argument("--no-shutdown", action="store_true",
                        help="Leave pod running when done")
    parser.add_argument("--timeout", type=int, default=600,
                        help="Timeout per generation in seconds")
    parser.add_argument("--no-resume", action="store_true",
                        help="Ignore previous progress and re-run all jobs")
    parser.add_argument("--parallel", action="store_true",
                        help="Run on multiple pods in parallel (one per character group)")
    parser.add_argument("--max-pods", type=int, default=5,
                        help="Max pods in parallel mode (default: 5)")

    args = parser.parse_args()

    if not RUNPOD_API_KEY:
        print("Error: RUNPOD_API_KEY not set")
        sys.exit(1)

    # -------------------------------------------------------------------
    # Build job list from one of four modes
    # -------------------------------------------------------------------
    output_dir = Path(args.output).resolve()
    characters_info = None  # only set in batch-dir/config mode

    if args.config:
        # --- Config file mode ---
        config_path = Path(args.config).resolve()
        if not config_path.exists():
            print(f"Error: Config file not found: {config_path}")
            sys.exit(1)

        cfg = load_config_file(config_path)

        if not cfg["batch_path"]:
            print("Error: Config file must contain 'batch_path = ...'")
            sys.exit(1)

        batch_dir = Path(cfg["batch_path"]).resolve()
        if not batch_dir.is_dir():
            print(f"Error: batch_path is not a directory: {batch_dir}")
            sys.exit(1)

        if cfg["output_dir"]:
            output_dir = Path(cfg["output_dir"]).resolve()

        # Pod ID: config file -> CLI arg -> env
        if cfg["pod_id"] and not args.pod_id:
            args.pod_id = cfg["pod_id"]

        # Resolve global scenes (config file -> CLI override)
        try:
            scenes = resolve_scenes(args.scenes or cfg["scenes"], args.no_scenes)
        except ValueError as e:
            print(f"Error: {e}")
            sys.exit(1)

        # Discover characters: filter to config list if [characters] section present
        all_characters = discover_characters(batch_dir)
        if not all_characters:
            print(f"Error: No character folders found in {batch_dir}")
            sys.exit(1)

        char_scene_overrides = {}
        if cfg["characters"]:
            # Filter to only characters listed in config
            config_names = {c["name"] for c in cfg["characters"]}
            characters_info = [c for c in all_characters if c["name"] in config_names]

            # Warn about config names that don't match any folder
            found_names = {c["name"] for c in characters_info}
            for name in config_names - found_names:
                print(f"  Warning: Character '{name}' in config but no folder found in {batch_dir}")

            # Collect per-character scene overrides
            for c in cfg["characters"]:
                if c["scenes"]:
                    char_scene_overrides[c["name"]] = c["scenes"]
        else:
            characters_info = all_characters

        if not characters_info:
            print("Error: No matching character folders found")
            sys.exit(1)

        jobs, warnings = build_scene_jobs(
            characters_info, scenes, output_dir,
            char_scene_overrides=char_scene_overrides,
        )
        if not jobs:
            print("Error: No valid jobs to process")
            if warnings:
                for w in warnings:
                    print(f"  ! {w}")
            sys.exit(1)

        # Calculate parallel pod count
        num_unique_chars = len(set(j["character"] for j in jobs))
        num_pods = min(num_unique_chars, args.max_pods) if args.parallel else 1

        preview_jobs(jobs, characters_info, scenes, output_dir, warnings,
                     num_pods=num_pods)

        if args.dry_run:
            log("\nDry run — exiting.")
            sys.exit(0)
        if not args.yes:
            response = input("\nProceed? [y/N] ")
            if response.strip().lower() not in ("y", "yes"):
                log("Aborted.")
                sys.exit(0)

    elif args.batch_dir:
        # --- Scene-based batch mode (CLI args) ---
        batch_dir = Path(args.batch_dir).resolve()
        if not batch_dir.is_dir():
            print(f"Error: Not a directory: {batch_dir}")
            sys.exit(1)

        try:
            scenes = resolve_scenes(args.scenes, args.no_scenes)
        except ValueError as e:
            print(f"Error: {e}")
            sys.exit(1)

        characters_info = discover_characters(batch_dir)
        if not characters_info:
            print(f"Error: No character folders found in {batch_dir}")
            print("  Each character folder must contain clothed.png and/or topless.png")
            sys.exit(1)

        jobs, warnings = build_scene_jobs(characters_info, scenes, output_dir)
        if not jobs:
            print("Error: No valid jobs to process")
            if warnings:
                for w in warnings:
                    print(f"  ! {w}")
            sys.exit(1)

        # Calculate parallel pod count
        num_unique_chars = len(set(j["character"] for j in jobs))
        num_pods = min(num_unique_chars, args.max_pods) if args.parallel else 1

        preview_jobs(jobs, characters_info, scenes, output_dir, warnings,
                     num_pods=num_pods)

        if args.dry_run:
            log("\nDry run — exiting.")
            sys.exit(0)
        if not args.yes:
            response = input("\nProceed? [y/N] ")
            if response.strip().lower() not in ("y", "yes"):
                log("Aborted.")
                sys.exit(0)

    elif args.batch:
        # --- Legacy CSV/JSON batch mode ---
        jobs = load_batch_file(Path(args.batch))
        log(f"Jobs to process: {len(jobs)}")
        for j in jobs:
            log(f"  {j['character']}: {j['workflow']} <- {j['seed']}")

    elif args.character and args.workflow and args.seed:
        # --- Single job mode ---
        jobs = [{"character": args.character, "workflow": args.workflow, "seed": args.seed}]
        log(f"Single job: {args.character} / {args.workflow}")

    else:
        print("Error: Provide one of:")
        print("  --config FILE     Batch config file (recommended)")
        print("  --batch-dir DIR   Scene-based batch via CLI args")
        print("  --batch FILE      CSV/JSON batch file")
        print("  -c/-w/-s          Single job (character, workflow, seed)")
        sys.exit(1)

    # -------------------------------------------------------------------
    # Execution: parallel multi-pod or sequential single-pod
    # -------------------------------------------------------------------
    gen_timeout = args.timeout
    tracker = ProgressTracker(output_dir)
    batch_start = time.time()

    # Handle --no-resume: clear previous progress
    if args.no_resume and tracker.path.exists():
        tracker.path.unlink()
        tracker = ProgressTracker(output_dir)
        log("Previous progress cleared (--no-resume)")

    # Check for resumable progress
    already_done = sum(1 for j in jobs if tracker.is_completed(j))
    if already_done > 0:
        log(f"\nResuming: {already_done}/{len(jobs)} jobs already completed (from progress.json)")

    if args.parallel:
        # ---------------------------------------------------------------
        # Parallel execution: multiple pods via ThreadPoolExecutor
        # ---------------------------------------------------------------
        num_unique_chars = len(set(j["character"] for j in jobs))
        num_pods = min(num_unique_chars, args.max_pods)
        pod_groups = distribute_jobs(jobs, num_pods)

        log(f"\nParallel mode: {len(pod_groups)} pods for {len(jobs)} jobs")
        for i, group in enumerate(pod_groups):
            chars = sorted(set(j["character"] for j in group))
            log(f"  pod-{i+1}: {len(group)} jobs — {', '.join(chars)}")

        all_results = []
        with ThreadPoolExecutor(max_workers=len(pod_groups)) as executor:
            futures = {}
            for i, group in enumerate(pod_groups):
                f = executor.submit(
                    pod_worker,
                    worker_id=i,
                    worker_jobs=group,
                    output_dir=output_dir,
                    tracker=tracker,
                    total_jobs=len(jobs),
                    num_workers=len(pod_groups),
                    timeout=gen_timeout,
                    keep_pod=args.keep_pod,
                )
                futures[f] = i

            for future in as_completed(futures):
                worker_id = futures[future]
                try:
                    pod_id, results = future.result()
                    all_results.extend(results)
                    log(f"[pod-{worker_id + 1}] Finished — {len(results)} files from pod {pod_id}")
                except Exception as e:
                    log(f"[pod-{worker_id + 1}] Worker failed: {e}")

    else:
        # ---------------------------------------------------------------
        # Sequential execution: single pod
        # ---------------------------------------------------------------
        created_pod = False
        if args.pod_id:
            pod_id = args.pod_id
            log(f"\nStep 1: Using existing pod {pod_id}")
            pod = get_pod(pod_id)
            if pod["desiredStatus"] != "RUNNING":
                log("  Pod not running, resuming...")
                resume_pod(pod_id)
                pod = wait_for_pod(pod_id)
            else:
                log(f"  Pod already running (uptime: {pod.get('runtime', {}).get('uptimeInSeconds', '?')}s)")
        else:
            log("\nStep 1: Creating pod...")
            pod_info = create_pod()
            pod_id = pod_info["id"]
            created_pod = True
            pod = wait_for_pod(pod_id)

        ssh_host, ssh_port = get_pod_ssh(pod)
        base_url = get_pod_comfyui_url(pod_id)
        log(f"  SSH: {ssh_host}:{ssh_port}")
        log(f"  ComfyUI: {base_url}")

        log("\nStep 2: Starting ComfyUI...")
        start_comfyui(ssh_host, ssh_port, base_url)

        all_results = []
        log(f"\nStep 3: Processing {len(jobs)} job(s)...")
        for i, job in enumerate(jobs, 1):
            key = _job_key(job)

            if tracker.is_completed(job):
                log(f"\n  [{i}/{len(jobs)}] {key} — already done, skipping")
                continue

            tracker.start_job(job)
            job_start = time.time()

            try:
                results = process_job(
                    job, base_url, ssh_host, ssh_port,
                    output_dir, i, len(jobs), timeout=gen_timeout,
                )
                duration = time.time() - job_start
                all_results.extend(results)
                tracker.complete_job(job, results, duration)
                log(f"  Finished in {_fmt_duration(duration)}")
                tracker.log_eta(len(jobs))
            except Exception as e:
                duration = time.time() - job_start
                tracker.fail_job(job, str(e), duration)
                log(f"  ERROR processing {key}: {e}")
                log(f"  Failed after {_fmt_duration(duration)}")
                tracker.log_eta(len(jobs))

        # Pod cleanup
        if args.no_shutdown:
            log(f"\nPod {pod_id} left running (--no-shutdown)")
        elif created_pod and not args.keep_pod:
            log(f"\nTerminating pod {pod_id}...")
            terminate_pod(pod_id)
        elif args.keep_pod:
            log(f"\nStopping pod {pod_id} (--keep-pod, can resume later)...")
            stop_pod(pod_id)
        else:
            log(f"\nPod {pod_id} left running (existing pod)")

    # -------------------------------------------------------------------
    # Summary (shared by both paths)
    # -------------------------------------------------------------------
    tracker.finalize(len(jobs))
    total_time = time.time() - batch_start

    log(f"\n{'='*60}")
    log("COMPLETE")
    log(f"{'='*60}")
    completed = tracker.count_completed()
    failed = sum(1 for j in tracker.data["jobs"].values() if j.get("status") == "failed")
    log(f"Jobs: {completed}/{len(jobs)} completed"
        f"{f', {failed} failed' if failed else ''}"
        f" | Total time: {_fmt_duration(total_time)}")
    if all_results:
        log(f"Output: {output_dir}")
        if characters_info:
            by_char = {}
            for r in all_results:
                by_char.setdefault(r["character"], []).append(r)
            for char_name, char_results in by_char.items():
                log(f"  {char_name}/")
                for r in char_results:
                    log(f"    {r['file']}")
        else:
            for r in all_results:
                log(f"  {r['character']} ({r['scene']}): {r['file']}")

        manifest = output_dir / "manifest.json"
        manifest.write_text(json.dumps(all_results, indent=2))
        log(f"Manifest: {manifest}")

    log(f"Progress: {tracker.path}")
    log("Done!")


if __name__ == "__main__":
    main()
