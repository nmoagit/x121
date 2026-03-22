#!/usr/bin/env python3
"""Spin up a cheap RunPod pod and set up ComfyUI with a new workflow.

Handles:
  1. Create a cheap GPU pod attached to our network volume
  2. Wait for SSH access
  3. Install custom nodes into /workspace/ComfyUI/custom_nodes/
  4. Download models/checkpoints/LoRAs/VAEs/text encoders
  5. Save the workflow JSON to /workspace/ComfyUI/workflows/

Usage:
    python setup_comfyui_workflow.py

Environment variables (from .env):
    RUNPOD_API_KEY            - RunPod API key (required)
    RUNPOD_NETWORK_VOLUME_ID  - Network volume ID (required)
    SSH_KEY_PATH              - Path to SSH private key
"""

import json
import os
import subprocess
import sys
import time
from pathlib import Path

try:
    import requests
except ImportError:
    print("Error: pip install requests")
    sys.exit(1)

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
NETWORK_VOLUME_ID = os.environ.get("RUNPOD_NETWORK_VOLUME_ID", "")
SSH_KEY_PATH = os.path.expanduser(os.environ.get("SSH_KEY_PATH", "~/.ssh/id_ed25519"))

if not RUNPOD_API_KEY:
    print("Error: RUNPOD_API_KEY not set")
    sys.exit(1)
if not NETWORK_VOLUME_ID:
    print("Error: RUNPOD_NETWORK_VOLUME_ID not set")
    sys.exit(1)

COMFYUI_DIR = "/workspace/ComfyUI"

# Read the public key to inject into pods for SSH access.
_pub_key_path = Path(SSH_KEY_PATH + ".pub")
SSH_PUBLIC_KEY = _pub_key_path.read_text().strip() if _pub_key_path.exists() else ""

# Cheap GPU for setup work (just downloading, no inference needed).
# Try multiple GPU types in order of cost, falling back if unavailable.
GPU_TYPES_BY_COST = [
    "NVIDIA RTX 4000 Ada Generation",
    "NVIDIA RTX A4000",
    "NVIDIA RTX A4500",
    "NVIDIA RTX 4000 SFF Ada Generation",
    "NVIDIA L4",
    "NVIDIA RTX A5000",
    "NVIDIA RTX 4090",
    "NVIDIA RTX 3090",
    "NVIDIA RTX 3080",
    "NVIDIA RTX 3080 Ti",
    "NVIDIA RTX 3070",
    "NVIDIA RTX 4070 Ti",
    "NVIDIA RTX 4080",
    "NVIDIA RTX 4080 SUPER",
    "NVIDIA RTX A6000",
    "NVIDIA RTX 5080",
    "NVIDIA RTX PRO 6000 Blackwell Server Edition",
]

TEMPLATE_ID = os.environ.get("RUNPOD_TEMPLATE_ID", "")

SETUP_POD_CONFIG = {
    "name": "x121-setup-worker",
    "templateId": TEMPLATE_ID,
    "gpuTypeId": GPU_TYPES_BY_COST[0],  # Will be overridden by create_pod
    "gpuCount": 1,
    "containerDiskInGb": 20,
    "volumeInGb": 0,
    "networkVolumeId": NETWORK_VOLUME_ID,
    "ports": "8188/http,22/tcp",
    "dataCenterId": "EU-CZ-1",
}

# Workflow file to upload
WORKFLOW_PATH = Path("/mnt/d/Projects/trulience/models/LTX2.3KlingKiller (pose+depth) simplified - Icekiub v2.json")

# ---------------------------------------------------------------------------
# Models to download (URL → relative path under ComfyUI/models/)
# ---------------------------------------------------------------------------

MODELS = [
    # Checkpoints
    {
        "url": "https://huggingface.co/Lightricks/LTX-2.3-fp8/resolve/main/ltx-2.3-22b-distilled-fp8.safetensors",
        "dest": "models/checkpoints/ltx-2.3-22b-distilled-fp8.safetensors",
    },
    # The dev variant is referenced by LTXAVTextEncoderLoader and LTXVAudioVAELoader
    {
        "url": "https://huggingface.co/Lightricks/LTX-2.3-fp8/resolve/main/ltx-2.3-22b-dev-fp8.safetensors",
        "dest": "models/checkpoints/ltx-2.3-22b-dev-fp8.safetensors",
    },
    # UNET (Klein KV) — URL filename differs from workflow reference
    {
        "url": "https://huggingface.co/black-forest-labs/FLUX.2-klein-9b-kv-fp8/resolve/main/flux-2-klein-9b-kv-fp8.safetensors",
        "dest": "models/diffusion_models/flux-2-klein-9b-kv-fp8.safetensors",
        # Workflow references "flux-2-klein-9b-kv.safetensors" — create a symlink
        "symlink_as": "models/diffusion_models/flux-2-klein-9b-kv.safetensors",
    },
    # Text encoders
    {
        "url": "https://huggingface.co/Comfy-Org/ltx-2/resolve/main/split_files/text_encoders/gemma_3_12B_it_fp4_mixed.safetensors",
        "dest": "models/text_encoders/gemma_3_12B_it_fp4_mixed.safetensors",
    },
    {
        "url": "https://huggingface.co/Comfy-Org/flux2-klein-9B/resolve/main/split_files/text_encoders/qwen_3_8b_fp8mixed.safetensors",
        "dest": "models/text_encoders/qwen_3_8b_fp8mixed.safetensors",
    },
    # VAE
    {
        "url": "https://huggingface.co/Comfy-Org/flux2-klein-9B/resolve/main/split_files/vae/flux2-vae.safetensors",
        "dest": "models/vae/flux2-vae.safetensors",
    },
    # LoRAs
    {
        "url": "https://huggingface.co/Lightricks/LTX-2.3-22b-IC-LoRA-Union-Control/resolve/main/ltx-2.3-22b-ic-lora-union-control-ref0.5.safetensors",
        "dest": "models/loras/ltx-2.3-22b-ic-lora-union-control-ref0.5.safetensors",
    },
]

# Models without URLs (user needs to provide these)
MISSING_MODELS = [
    "models/loras/Lora_lora_000000600.safetensors",
    "models/loras/LOURTALTX_000001000.safetensors",
]

# ---------------------------------------------------------------------------
# Custom nodes to install (git URL → folder name under custom_nodes/)
# ---------------------------------------------------------------------------

CUSTOM_NODES = [
    {
        "repo": "https://github.com/Fannovel16/comfyui_controlnet_aux.git",
        "name": "comfyui_controlnet_aux",
    },
    {
        "repo": "https://github.com/ClownsharkBatwing/RES4LYF.git",
        "name": "RES4LYF",
    },
    {
        "repo": "https://github.com/kijai/ComfyUI-KJNodes.git",
        "name": "ComfyUI-KJNodes",
    },
    {
        "repo": "https://github.com/Lightricks/ComfyUI-LTXVideo.git",
        "name": "ComfyUI-LTXVideo",
    },
    {
        "repo": "https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite.git",
        "name": "ComfyUI-VideoHelperSuite",
    },
    {
        "repo": "https://github.com/NVIDIA/ComfyUI-RTX-Nodes.git",
        "name": "ComfyUI-RTX-Nodes",
    },
    {
        "repo": "https://github.com/rgthree/rgthree-comfy.git",
        "name": "rgthree-comfy",
    },
]

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
        raise RuntimeError(f"RunPod API error: {data['errors']}")
    return data


def create_pod() -> dict:
    """Try each GPU type until one is available."""
    d = SETUP_POD_CONFIG

    for gpu_type in GPU_TYPES_BY_COST:
        print(f"[setup] Trying {gpu_type}...")
        # Inject SSH public key via RunPod's PUBLIC_KEY env var
        env_block = ""
        if SSH_PUBLIC_KEY:
            # Escape for GraphQL string
            escaped_key = SSH_PUBLIC_KEY.replace('"', '\\"')
            env_block = f'env: [{{key: "PUBLIC_KEY", value: "{escaped_key}"}}]'

        mutation = f'''
        mutation {{
            podFindAndDeployOnDemand(input: {{
                name: "{d["name"]}"
                templateId: "{d["templateId"]}"
                gpuTypeId: "{gpu_type}"
                gpuCount: {d["gpuCount"]}
                containerDiskInGb: {d["containerDiskInGb"]}
                volumeInGb: {d["volumeInGb"]}
                networkVolumeId: "{d["networkVolumeId"]}"
                volumeMountPath: "/workspace"
                ports: "{d["ports"]}"
                dataCenterId: "{d["dataCenterId"]}"
                {env_block}
            }}) {{
                id
                name
                desiredStatus
                machine {{
                    gpuDisplayName
                }}
            }}
        }}
        '''
        try:
            data = graphql(mutation)
            pod = data["data"]["podFindAndDeployOnDemand"]
            gpu = pod.get("machine", {}).get("gpuDisplayName", gpu_type)
            print(f"[setup] Pod created: {pod['id']} ({gpu})")
            return pod
        except RuntimeError as e:
            if "SUPPLY_CONSTRAINT" in str(e):
                print(f"  Not available, trying next...")
                continue
            raise

    raise RuntimeError(
        f"No GPU available in EU-CZ-1 (network volume is DC-locked). "
        f"Tried {len(GPU_TYPES_BY_COST)} GPU types. Try again later."
    )


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
    data = graphql(query)
    return data["data"]["pod"]


def terminate_pod(pod_id: str):
    mutation = f'''
    mutation {{
        podTerminate(input: {{podId: "{pod_id}"}})
    }}
    '''
    graphql(mutation)
    print(f"[setup] Pod {pod_id} terminated")


def wait_for_ssh(pod_id: str, timeout: int = 600) -> tuple[str, int]:
    """Wait for pod to have SSH access. Returns (host, port)."""
    print(f"[setup] Waiting for pod {pod_id} to be ready...")
    deadline = time.time() + timeout

    while time.time() < deadline:
        pod = get_pod(pod_id)
        runtime = pod.get("runtime")
        if runtime and runtime.get("ports"):
            for port_info in runtime["ports"]:
                if port_info.get("privatePort") == 22 and port_info.get("publicPort"):
                    host = port_info["ip"]
                    port = port_info["publicPort"]
                    print(f"[setup] SSH available at {host}:{port}")
                    # Give sshd a moment to fully start
                    time.sleep(5)
                    return host, port
        time.sleep(5)

    raise TimeoutError(f"Pod {pod_id} did not become ready within {timeout}s")


# ---------------------------------------------------------------------------
# SSH helpers
# ---------------------------------------------------------------------------

def ssh_cmd(host: str, port: int, command: str, timeout: int = 600) -> subprocess.CompletedProcess:
    """Run a command on the pod via SSH."""
    ssh_args = [
        "ssh",
        "-o", "StrictHostKeyChecking=no",
        "-o", "UserKnownHostsFile=/dev/null",
        "-o", "LogLevel=ERROR",
        "-i", SSH_KEY_PATH,
        "-p", str(port),
        f"root@{host}",
        command,
    ]
    print(f"[ssh] {command[:120]}{'...' if len(command) > 120 else ''}")
    result = subprocess.run(ssh_args, capture_output=True, text=True, timeout=timeout)
    if result.returncode != 0 and result.stderr:
        print(f"[ssh] stderr: {result.stderr.strip()}")
    return result


def scp_to_pod(host: str, port: int, local_path: str, remote_path: str):
    """Copy a file to the pod via SCP."""
    scp_args = [
        "scp",
        "-o", "StrictHostKeyChecking=no",
        "-o", "UserKnownHostsFile=/dev/null",
        "-o", "LogLevel=ERROR",
        "-i", SSH_KEY_PATH,
        "-P", str(port),
        local_path,
        f"root@{host}:{remote_path}",
    ]
    print(f"[scp] {Path(local_path).name} → {remote_path}")
    subprocess.run(scp_args, check=True, timeout=120)


# ---------------------------------------------------------------------------
# Setup steps
# ---------------------------------------------------------------------------

def install_custom_nodes(host: str, port: int):
    """Clone/update custom nodes into /workspace/ComfyUI/custom_nodes/."""
    print("\n=== Installing custom nodes ===")

    for node in CUSTOM_NODES:
        name = node["name"]
        repo = node["repo"]
        dest = f"{COMFYUI_DIR}/custom_nodes/{name}"

        # Check if already exists
        result = ssh_cmd(host, port, f"test -d {dest} && echo exists || echo missing")
        if "exists" in result.stdout:
            print(f"  [{name}] already exists, pulling latest...")
            ssh_cmd(host, port, f"cd {dest} && git pull --ff-only 2>/dev/null || true")
        else:
            print(f"  [{name}] cloning...")
            ssh_cmd(host, port, f"git clone {repo} {dest}", timeout=120)

        # Install requirements if present
        ssh_cmd(host, port,
            f"test -f {dest}/requirements.txt && pip install -q -r {dest}/requirements.txt 2>/dev/null || true",
            timeout=300)

    print("Custom nodes installed.")


def download_models(host: str, port: int):
    """Download models to /workspace/ComfyUI/models/."""
    print("\n=== Downloading models ===")

    for model in MODELS:
        url = model["url"]
        dest = f"{COMFYUI_DIR}/{model['dest']}"
        filename = Path(model["dest"]).name

        # Ensure target directory exists
        dest_dir = str(Path(dest).parent)
        ssh_cmd(host, port, f"mkdir -p {dest_dir}")

        # Check if already downloaded
        result = ssh_cmd(host, port, f"test -f {dest} && stat -c%s {dest} || echo missing")
        if "missing" not in result.stdout and result.stdout.strip():
            size_mb = int(result.stdout.strip()) / (1024 * 1024)
            print(f"  [{filename}] already exists ({size_mb:.0f} MB), skipping")
            continue

        print(f"  [{filename}] downloading...")
        # Use wget with resume support for large files
        dl_result = ssh_cmd(host, port,
            f"wget -c -q --show-progress -O {dest} '{url}'",
            timeout=1800)  # 30 min timeout for large models
        if dl_result.returncode != 0:
            print(f"  [{filename}] FAILED: {dl_result.stderr.strip()}")
        else:
            # Verify file exists and has size
            result = ssh_cmd(host, port, f"stat -c%s {dest} 2>/dev/null || echo 0")
            size_mb = int(result.stdout.strip() or "0") / (1024 * 1024)
            print(f"  [{filename}] done ({size_mb:.0f} MB)")

        # Create symlink if needed (e.g. workflow uses different filename)
        if "symlink_as" in model:
            symlink = f"{COMFYUI_DIR}/{model['symlink_as']}"
            ssh_cmd(host, port, f"ln -sf {dest} {symlink}")
            print(f"  [{filename}] symlinked as {Path(model['symlink_as']).name}")

    # Report missing models
    if MISSING_MODELS:
        print("\n  WARNING — The following models have no download URLs:")
        for m in MISSING_MODELS:
            print(f"    - {m}")
        print("  You'll need to upload these manually.")

    print("Model downloads complete.")


def upload_workflow(host: str, port: int):
    """Upload the workflow JSON to the pod."""
    print("\n=== Uploading workflow ===")

    if not WORKFLOW_PATH.exists():
        print(f"  WARNING: Workflow file not found: {WORKFLOW_PATH}")
        return

    # Create workflows directory
    ssh_cmd(host, port, f"mkdir -p {COMFYUI_DIR}/user/default/workflows")

    remote_path = f"{COMFYUI_DIR}/user/default/workflows/ltx23-kling-killer-pose-depth-v2.json"
    scp_to_pod(host, port, str(WORKFLOW_PATH), remote_path)
    print(f"  Workflow saved to {remote_path}")


def verify_setup(host: str, port: int):
    """Print a summary of what's installed."""
    print("\n=== Verification ===")

    # Custom nodes
    result = ssh_cmd(host, port, f"ls -1 {COMFYUI_DIR}/custom_nodes/")
    if result.returncode == 0:
        nodes = [n for n in result.stdout.strip().split("\n") if n and not n.startswith(".")]
        print(f"  Custom nodes ({len(nodes)}):")
        for n in sorted(nodes):
            print(f"    - {n}")

    # Models
    for subdir in ["checkpoints", "diffusion_models", "text_encoders", "vae", "loras"]:
        result = ssh_cmd(host, port,
            f"ls -1 {COMFYUI_DIR}/models/{subdir}/ 2>/dev/null || echo '(empty)'")
        files = [f for f in result.stdout.strip().split("\n") if f and f != "(empty)"]
        if files:
            print(f"  models/{subdir}/:")
            for f in sorted(files):
                print(f"    - {f}")

    # Workflows
    result = ssh_cmd(host, port,
        f"ls -1 {COMFYUI_DIR}/user/default/workflows/ 2>/dev/null || echo '(empty)'")
    files = [f for f in result.stdout.strip().split("\n") if f and f != "(empty)"]
    if files:
        print(f"  workflows/:")
        for f in sorted(files):
            print(f"    - {f}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print("=" * 60)
    print("ComfyUI Workflow Setup — RunPod Network Volume")
    print("=" * 60)
    print(f"Network volume: {NETWORK_VOLUME_ID}")
    print(f"ComfyUI path:   {COMFYUI_DIR}")
    print(f"SSH key:        {SSH_KEY_PATH}")
    print(f"Workflow:       {WORKFLOW_PATH.name}")
    print()

    # Step 1: Create pod
    pod = create_pod()
    pod_id = pod["id"]

    try:
        # Step 2: Wait for SSH
        host, port = wait_for_ssh(pod_id)

        # Verify we can connect
        result = ssh_cmd(host, port, "echo connected && hostname")
        if result.returncode != 0:
            print(f"SSH connection failed: {result.stderr}")
            sys.exit(1)
        print(f"[setup] Connected to {result.stdout.strip()}")

        # Verify network volume is mounted with our ComfyUI
        result = ssh_cmd(host, port, f"test -d {COMFYUI_DIR} && echo found || echo missing")
        if "missing" in result.stdout:
            print(f"ERROR: {COMFYUI_DIR} not found on network volume!")
            print("The network volume may not have ComfyUI installed yet.")
            sys.exit(1)
        print(f"[setup] Found ComfyUI at {COMFYUI_DIR}")

        # Step 3: Install custom nodes
        install_custom_nodes(host, port)

        # Step 4: Download models
        download_models(host, port)

        # Step 5: Upload workflow
        upload_workflow(host, port)

        # Step 6: Verify
        verify_setup(host, port)

        print("\n" + "=" * 60)
        print("Setup complete!")
        print("=" * 60)
        print(f"\nPod ID: {pod_id}")
        print(f"SSH:    ssh -i {SSH_KEY_PATH} -p {port} root@{host}")
        print(f"\nThe pod is still running. Terminate when done:")
        print(f"  python {__file__} --terminate {pod_id}")

        # Ask whether to terminate
        try:
            answer = input("\nTerminate pod now? [y/N] ").strip().lower()
            if answer == "y":
                terminate_pod(pod_id)
        except (EOFError, KeyboardInterrupt):
            print("\nPod left running — remember to terminate it!")

    except KeyboardInterrupt:
        print(f"\n\nInterrupted! Terminating pod {pod_id}...")
        terminate_pod(pod_id)
        sys.exit(1)
    except Exception as e:
        print(f"\nError: {e}")
        print(f"Pod {pod_id} is still running — terminate manually if needed:")
        print(f"  python {__file__} --terminate {pod_id}")
        raise


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "--terminate":
        terminate_pod(sys.argv[2])
    else:
        main()
