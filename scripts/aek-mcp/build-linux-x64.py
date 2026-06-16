#!/usr/bin/env python3
# Build aek-mcp for linux-x64 / 为 linux-x64 构建 aek-mcp

import os
import signal
import subprocess
import sys
import time
from pathlib import Path

# Add scripts dir to path for import / 将 scripts 目录添加到路径以便导入
sys.path.insert(0, str(Path(__file__).parent.parent))
from start_scripts_shared_logic import run, run_safe, PROJECT_ROOT, is_win


def kill_old_instance():
    """Kill any running one-mcp or aek-mcp process / 终结旧实例"""
    if is_win():
        run_safe(["taskkill", "/F", "/IM", "aek-mcp.exe"])
    else:
        # Use pgrep + kill instead of pkill -f to avoid killing build processes
        # Use pgrep 精确匹配进程名，避免误杀构建进程
        for name in ["one-mcp", "aek-mcp"]:
            try:
                result = subprocess.run(
                    ["pgrep", "-x", name],
                    capture_output=True, text=True
                )
                if result.returncode == 0:
                    pids = result.stdout.strip().split("\n")
                    for pid in pids:
                        if pid.strip():
                            os.kill(int(pid.strip()), signal.SIGTERM)
                            print(f"[aek-mcp] Killed PID {pid.strip()}")
            except (subprocess.SubprocessError, ValueError):
                pass
    time.sleep(1)
    print("[aek-mcp] Old instances killed")


def main():
    root = PROJECT_ROOT / "packages" / "aek-mcp"
    frontend_dir = root / "frontend"

    # Kill old running instance / 终结旧实例
    kill_old_instance()

    # Build frontend / 构建前端
    if frontend_dir.exists():
        print("[aek-mcp] Building frontend...")
        run(["pnpm", "install"], cwd=root)
        run(["pnpm", "frontend:build"], cwd=root)
        print("[aek-mcp] Frontend built to frontend/dist/")

    # Build Go backend / 构建 Go 后端
    print("[aek-mcp] Building Go backend...")
    run(["go", "build", "-o", "bin/aek-mcp", "./cmd/aek-mcp/"], cwd=root)
    print("[aek-mcp] Built to bin/aek-mcp")


if __name__ == "__main__":
    main()
