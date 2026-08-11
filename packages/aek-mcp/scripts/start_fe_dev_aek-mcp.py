#!/usr/bin/env python3
# Start aek-mcp frontend in dev mode / 前端开发模式启动 aek-mcp

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "shared"))
from start_scripts_shared_logic import run_safe, kill_port

AEK_MCP_DIR = PROJECT_ROOT / "packages" / "aek-mcp"
VITE_PORT = 1352


def main():
    kill_port(VITE_PORT)

    print(f"[aek-mcp] Frontend dev port: {VITE_PORT}")
    run_safe(["pnpm", "frontend:dev"], cwd=AEK_MCP_DIR)


if __name__ == "__main__":
    main()
