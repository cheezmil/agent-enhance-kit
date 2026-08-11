#!/usr/bin/env python3
# Start aek-mcp backend only: launch gin server (1352)
# Requires built binary (run start_deploy_be_aek-mcp.py first)
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "shared"))
from start_scripts_shared_logic import (
    kill_port,
    is_win,
    AEK_MCP_BACKEND_PORT,
    wait_health,
)

AEK_MCP_DIR = PROJECT_ROOT / "packages" / "aek-mcp"


def kill_old():
    if is_win():
        subprocess.run(["taskkill", "/F", "/IM", "aek-mcp.exe"], check=False)
    else:
        for name in ["aek-mcp", "one-mcp"]:
            r = subprocess.run(["pgrep", "-x", name], capture_output=True, text=True)
            if r.returncode == 0:
                for pid in r.stdout.strip().split():
                    pid = pid.strip()
                    if pid:
                        try:
                            os.kill(int(pid), signal.SIGTERM)  # noqa: F821
                        except Exception:
                            pass
    kill_port(AEK_MCP_BACKEND_PORT)
    time.sleep(1)
    print("[aek-mcp] Old backend stopped")


def main():
    print("=== Starting aek-mcp backend ===\n")

    bin_path = AEK_MCP_DIR / "bin" / "aek-mcp"
    if not bin_path.exists():
        print(f"Error: {bin_path} not found. Run start_deploy_be_aek-mcp.py first.")
        sys.exit(1)

    print("[1/2] Clearing port 1352 and killing old backend...")
    kill_old()

    print(f"\n[2/2] Launching gin backend on port {AEK_MCP_BACKEND_PORT}...")
    if is_win():
        proc = subprocess.Popen(
            [str(bin_path)],
            cwd=str(AEK_MCP_DIR),
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
        )
    else:
        proc = subprocess.Popen(
            [str(bin_path)],
            cwd=str(AEK_MCP_DIR),
            start_new_session=True,
        )

    print(f"[aek-mcp] Backend process started (pid {proc.pid})")

    ready = wait_health(AEK_MCP_BACKEND_PORT, timeout_s=40)
    if ready:
        print(f"[aek-mcp] Backend ready on http://127.0.0.1:{AEK_MCP_BACKEND_PORT}/")
    else:
        print(f"Warning: Backend did not become ready in time (pid {proc.pid})")

    print("\n=== aek-mcp backend started ===")
    print(f"  Backend: http://127.0.0.1:{AEK_MCP_BACKEND_PORT}/")


if __name__ == "__main__":
    main()
