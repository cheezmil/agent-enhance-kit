#!/usr/bin/env python3
# Deploy aek-mcp: stop old → build be+fe / 部署 aek-mcp：停旧实例 → 编译

import os
import signal
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from start_scripts_shared_logic import run, run_safe, kill_port, is_win

AEK_MCP_DIR = Path(__file__).parent.parent.parent / "packages" / "aek-mcp"
AEK_MCP_PORT = 1351


def kill_old_instance():
    """Kill running aek-mcp process / 终结旧实例"""
    if is_win():
        run_safe(["taskkill", "/F", "/IM", "aek-mcp.exe"])
    else:
        for name in ["aek-mcp", "one-mcp"]:
            try:
                result = subprocess.run(["pgrep", "-x", name], capture_output=True, text=True)
                if result.returncode == 0:
                    for pid in result.stdout.strip().split("\n"):
                        if pid.strip():
                            os.kill(int(pid.strip()), signal.SIGTERM)
                            print(f"[aek-mcp] Killed PID {pid.strip()}")
            except (subprocess.SubprocessError, ValueError):
                pass
    time.sleep(1)
    print("[aek-mcp] Old instances killed")


def main():
    print("=== Deploying aek-mcp ===\n")

    # 1. Stop old instance
    print("[1/3] Stopping old instances...")
    kill_port(AEK_MCP_PORT)
    kill_old_instance()

    # 2. Build backend
    print("\n[2/3] Building backend...")
    run(["go", "build", "-o", "bin/aek-mcp", "./cmd/aek-mcp/"], cwd=AEK_MCP_DIR)
    print("[aek-mcp] Built to bin/aek-mcp")

    # 3. Build frontend
    print("\n[3/3] Building frontend...")
    run(["pnpm", "install"], cwd=AEK_MCP_DIR)
    run(["pnpm", "frontend:build"], cwd=AEK_MCP_DIR)
    print("[aek-mcp] Frontend built to frontend/dist/")

    print("\n=== aek-mcp deployed ===")


if __name__ == "__main__":
    main()
