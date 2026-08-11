#!/usr/bin/env python3
# Deploy aek-mcp backend: stop old → build
# Does NOT start the server (use start_be_aek-mcp.py to launch)
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "shared"))
from start_scripts_shared_logic import run, kill_port, AEK_MCP_BACKEND_PORT, is_win

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
                            signal.os.kill(int(pid), signal.SIGTERM)
                        except Exception:
                            pass
    kill_port(AEK_MCP_BACKEND_PORT)
    time.sleep(1)
    print("[aek-mcp] Old backend stopped")


def main():
    print("=== Deploying aek-mcp backend (1352) ===\n")

    print("[1/2] Stopping old backend...")
    kill_old()

    print("\n[2/2] Building backend...")
    run(["go", "build", "-a", "-o", "bin/aek-mcp", "./cmd/aek-mcp/"], cwd=AEK_MCP_DIR)
    print("[aek-mcp] Built to bin/aek-mcp")

    bin_path = AEK_MCP_DIR / "bin" / "aek-mcp"
    if not bin_path.exists():
        print("Error: bin/aek-mcp not found after build")
        sys.exit(1)

    print("\n=== aek-mcp backend deployed (NOT started) ===")
    print("Run: start_be_aek-mcp.py  to launch")


if __name__ == "__main__":
    main()
