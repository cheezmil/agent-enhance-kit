#!/usr/bin/env python3
# Build aek-mcp frontend / 构建 aek-mcp 前端

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from start_scripts_shared_logic import run

AEK_MCP_DIR = Path(__file__).parent.parent.parent / "packages" / "aek-mcp"


def main():
    print("[aek-mcp] Building frontend...")
    run(["pnpm", "install"], cwd=AEK_MCP_DIR)
    run(["pnpm", "frontend:build"], cwd=AEK_MCP_DIR)
    print("[aek-mcp] Frontend built to frontend/dist/")


if __name__ == "__main__":
    main()
