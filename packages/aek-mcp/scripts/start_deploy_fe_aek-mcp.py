#!/usr/bin/env python3
# Deploy aek-mcp frontend: stop old → install → build
# Does NOT start the server (use start_fe_aek-mcp.py to launch)
import shutil
import sys
import time
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "shared"))
from start_scripts_shared_logic import run, kill_port, AEK_MCP_FRONTEND_PORT

AEK_MCP_DIR = PROJECT_ROOT / "packages" / "aek-mcp"
FRONTEND_DIR = AEK_MCP_DIR / "frontend"


def main():
    print("=== Deploying aek-mcp frontend (1351) ===\n")

    print("[1/3] Stopping old frontend...")
    kill_port(AEK_MCP_FRONTEND_PORT)
    print("[aek-mcp] Old frontend stopped")

    print("\n[2/3] Installing dependencies...")
    run(["pnpm", "install"], cwd=AEK_MCP_DIR)

    print("\n[3/3] Building frontend...")
    for cache_dir in [FRONTEND_DIR / ".next", FRONTEND_DIR / ".turbopack", FRONTEND_DIR / "dist"]:
        if cache_dir.exists():
            shutil.rmtree(cache_dir, ignore_errors=True)
            print(f"[aek-mcp] Cleared {cache_dir}")
    run(["pnpm", "run", "build"], cwd=FRONTEND_DIR)
    print("[aek-mcp] Frontend built")

    print("\n=== aek-mcp frontend deployed (NOT started) ===")
    print("Run: start_fe_aek-mcp.py  to launch")


if __name__ == "__main__":
    main()
