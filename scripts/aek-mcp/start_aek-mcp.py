#!/usr/bin/env python3
# Start aek-mcp in production mode / 以生产模式启动 aek-mcp

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from start_scripts_shared_logic import run, kill_port, can_bind, is_win

AEK_MCP_DIR = Path(__file__).parent.parent.parent / "packages" / "aek-mcp"
AEK_MCP_PORT = 1351


def main():
    bin_path = AEK_MCP_DIR / "bin" / "aek-mcp"

    if not bin_path.exists():
        print("Error: bin/aek-mcp not found")
        print("Run start_build_be_aek-mcp.py first")
        sys.exit(1)

    kill_port(AEK_MCP_PORT)

    if not can_bind(AEK_MCP_PORT):
        print(f"Port {AEK_MCP_PORT} is occupied")
        sys.exit(1)

    print(f"Starting aek-mcp on port {AEK_MCP_PORT}...")
    run(["./bin/aek-mcp"], cwd=AEK_MCP_DIR)


if __name__ == "__main__":
    main()
