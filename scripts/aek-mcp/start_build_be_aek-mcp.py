#!/usr/bin/env python3
# Build aek-mcp backend / 构建 aek-mcp 后端

import os
import signal
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from start_scripts_shared_logic import run, run_safe, is_win

AEK_MCP_DIR = Path(__file__).parent.parent.parent / "packages" / "aek-mcp"


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
    kill_old_instance()

    print("[aek-mcp] Building Go backend...")
    run(["go", "build", "-o", "bin/aek-mcp", "./cmd/aek-mcp/"], cwd=AEK_MCP_DIR)
    print("[aek-mcp] Built to bin/aek-mcp")


if __name__ == "__main__":
    main()
