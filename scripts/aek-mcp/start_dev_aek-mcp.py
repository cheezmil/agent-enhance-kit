#!/usr/bin/env python3
# Development mode for aek-mcp: Go hot reload + Next.js dev server / 开发模式：Go 热重载 + Next.js 开发服务器

import os
import signal
import subprocess
import sys
import shutil
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from start_scripts_shared_logic import kill_port, is_win, can_bind

AEK_MCP_DIR = Path(__file__).parent.parent.parent / "packages" / "aek-mcp"
GO_PORT = 1351
NEXT_PORT = 1352


def ensure_air():
    """Install air if not found / 安装 air（Go 热重载工具）"""
    # Check common locations including ~/go/bin
    go_bin = Path.home() / "go" / "bin" / "air"
    air_path = None
    if go_bin.exists():
        air_path = str(go_bin)
    elif shutil.which("air"):
        air_path = "air"

    if air_path:
        print(f"[dev] air found at {air_path}")
        return air_path

    print("[dev] Installing air...")
    subprocess.run(
        ["go", "install", "github.com/air-verse/air@latest"],
        check=True,
        shell=is_win(),
    )
    if go_bin.exists():
        print("[dev] air installed")
        return str(go_bin)
    print("[dev] air installed")
    return "air"


def main():
    print("=== aek-mcp Dev Mode ===\n")
    print(f"  Go backend + Frontend proxy: http://localhost:{GO_PORT}")
    print(f"  Next.js dev server (internal): http://localhost:{NEXT_PORT}")
    print(f"  Press Ctrl+C to stop\n")

    air_path = ensure_air()

    # Kill old instances
    kill_port(GO_PORT)
    kill_port(NEXT_PORT)

    procs = []

    try:
        # 1. Start Go backend with air (hot reload)
        print("[dev] Starting Go backend with air...")
        go_env = os.environ.copy()
        go_env["PORT"] = str(GO_PORT)
        go_env["DEV_PROXY"] = f"http://localhost:{NEXT_PORT}"
        air_cmd = [air_path, "-c", ".air.toml"] if (AEK_MCP_DIR / ".air.toml").exists() else [air_path]
        go_proc = subprocess.Popen(
            air_cmd,
            cwd=AEK_MCP_DIR,
            env=go_env,
            shell=is_win(),
        )
        procs.append(("air (Go)", go_proc))

        # 2. Start Next.js dev server
        print("[dev] Starting Next.js dev server...")
        fe_env = os.environ.copy()
        fe_env["PORT"] = str(NEXT_PORT)
        fe_env["NEXT_PUBLIC_API_URL"] = f"http://localhost:{GO_PORT}"
        fe_proc = subprocess.Popen(
            ["pnpm", "next", "dev", "-p", str(NEXT_PORT)],
            cwd=AEK_MCP_DIR / "frontend",
            env=fe_env,
            shell=is_win(),
        )
        procs.append(("next dev", fe_proc))

        # Wait for both
        print("\n[dev] Services running. Ctrl+C to stop.\n")
        while True:
            for name, p in procs:
                if p.poll() is not None:
                    print(f"\n[dev] {name} exited with code {p.returncode}")
                    raise KeyboardInterrupt
            time.sleep(1)

    except KeyboardInterrupt:
        print("\n[dev] Stopping...")
    finally:
        for name, p in procs:
            if p.poll() is None:
                print(f"[dev] Stopping {name}...")
                if is_win():
                    p.terminate()
                else:
                    p.send_signal(signal.SIGTERM)
                try:
                    p.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    p.kill()
        print("[dev] Stopped")


if __name__ == "__main__":
    main()
