#!/usr/bin/env python3
# Start aek-mcp frontend only: launch nextjs production server (1351)
# Requires deployed frontend (run start_deploy_fe_aek-mcp.py first)
import os
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from start_scripts_shared_logic import (
    kill_port,
    is_win,
    AEK_MCP_FRONTEND_PORT,
    wait_nextjs_ready,
)

AEK_MCP_DIR = Path(__file__).parent.parent.parent / "packages" / "aek-mcp"
FRONTEND_DIR = AEK_MCP_DIR / "frontend"


def main():
    print("=== Starting aek-mcp frontend ===\n")
    print(f"[1/2] Clearing port {AEK_MCP_FRONTEND_PORT}...")
    kill_port(AEK_MCP_FRONTEND_PORT)

    print(f"\n[2/2] Launching nextjs on port {AEK_MCP_FRONTEND_PORT}...")
    cwd = str(FRONTEND_DIR)
    env = os.environ.copy()
    env["NODE_ENV"] = "production"

    if is_win():
        proc = subprocess.Popen(
            ["pnpm", "run", "start"],
            cwd=cwd,
            env=env,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
        )
    else:
        proc = subprocess.Popen(
            ["pnpm", "run", "start"],
            cwd=cwd,
            env=env,
            start_new_session=True,
        )

    print(f"[aek-mcp] Frontend process started (pid {proc.pid})")

    ready = wait_nextjs_ready(AEK_MCP_FRONTEND_PORT, timeout_s=30)
    if ready:
        print(f"[aek-mcp] Frontend ready on http://127.0.0.1:{AEK_MCP_FRONTEND_PORT}/")
    else:
        print(f"Warning: Frontend did not become ready in time (pid {proc.pid})")

    print("\n=== aek-mcp frontend started ===")
    print(f"  Frontend: http://127.0.0.1:{AEK_MCP_FRONTEND_PORT}/")


if __name__ == "__main__":
    main()
