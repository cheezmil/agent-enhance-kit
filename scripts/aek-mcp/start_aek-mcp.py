#!/usr/bin/env python3
# Start gin backend (1352) in production mode / 以生产模式启动 gin 后端
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from start_scripts_shared_logic import run, kill_port, can_bind, AEK_MCP_FRONTEND_PORT, AEK_MCP_BACKEND_PORT

AEK_MCP_DIR = Path(__file__).parent.parent.parent / "packages" / "aek-mcp"


def main():
    bin_path = AEK_MCP_DIR / "bin" / "aek-mcp"
    if not bin_path.exists():
        print("Error: bin/aek-mcp not found")
        print("Run start_deploy_aek-mcp.py first")
        sys.exit(1)

    # Verify nextjs is running on frontend port (main entry)
    import urllib.request
    try:
        resp = urllib.request.urlopen(f"http://127.0.0.1:{AEK_MCP_FRONTEND_PORT}/", timeout=3)
        if resp.status == 200:
            print(f"Nextjs (main entry) serving on port {AEK_MCP_FRONTEND_PORT}")
        else:
            print(f"Warning: Nextjs returned HTTP {resp.status}")
    except Exception:
        print(f"Warning: Nextjs not responding on port {AEK_MCP_FRONTEND_PORT}")
        print("Run start_deploy_aek-mcp.py first to deploy + start nextjs.")

    kill_port(AEK_MCP_BACKEND_PORT)
    if not can_bind(AEK_MCP_BACKEND_PORT):
        print(f"Port {AEK_MCP_BACKEND_PORT} is occupied")
        sys.exit(1)

    print(f"Starting gin backend on port {AEK_MCP_BACKEND_PORT}...")
    run(["./bin/aek-mcp"], cwd=AEK_MCP_DIR)


if __name__ == "__main__":
    main()
