#!/usr/bin/env python3
# Install aek-mcp dependencies / 安装 aek-mcp 依赖

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "shared"))
from start_scripts_shared_logic import run, run_safe, kill_port

AEK_MCP_DIR = PROJECT_ROOT / "packages" / "aek-mcp"
AEK_MCP_PORT = 1351


def main():
    print("[aek-mcp] Stopping running instances...")
    kill_port(AEK_MCP_PORT)

    print("[aek-mcp] Installing dependencies with pnpm...")
    result = run(["pnpm", "install"], cwd=AEK_MCP_DIR)
    if result.returncode == 0:
        print("[aek-mcp] pnpm install completed!")
    else:
        print(f"[aek-mcp] pnpm install failed with exit code {result.returncode}")
        sys.exit(result.returncode)

    go_check = run_safe(["go", "version"], cwd=AEK_MCP_DIR, capture=True)
    if go_check.returncode == 0:
        print(f"[aek-mcp] Go: {go_check.stdout.strip()}")
    else:
        print("[aek-mcp] Warning: Go not found")


if __name__ == "__main__":
    main()
