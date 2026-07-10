#!/usr/bin/env python3
# Start aek-mcp backend in dev mode / 后端开发模式启动 aek-mcp

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from start_scripts_shared_logic import run_safe, kill_port

AEK_MCP_DIR = Path(__file__).parent.parent.parent / "packages" / "aek-mcp"
AEK_MCP_PORT = 1351


def main():
    kill_port(AEK_MCP_PORT)

    print(f"[aek-mcp] Backend dev port: {AEK_MCP_PORT}")
    run_safe(["go", "run", "./cmd/aek-mcp/"], cwd=AEK_MCP_DIR)


if __name__ == "__main__":
    main()
