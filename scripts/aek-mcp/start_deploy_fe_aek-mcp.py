#!/usr/bin/env python3
# Deploy aek-mcp frontend only: stop old → build → start nextjs (1351)
import os, shutil, subprocess, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from start_scripts_shared_logic import run, kill_port, can_bind, is_win, AEK_MCP_FRONTEND_PORT

AEK_MCP_DIR = Path(__file__).parent.parent.parent / "packages" / "aek-mcp"
FRONTEND_DIR = AEK_MCP_DIR / "frontend"


def kill_old():
    if not is_win():
        # Kill next-server / next processes
        import subprocess as _sp
        r = _sp.run(["pgrep", "-f", "next-server|next start"], capture_output=True, text=True)
        if r.returncode == 0:
            for pid in r.stdout.strip().split():
                pid = pid.strip()
                if pid:
                    try: os.kill(int(pid), 15)
                    except Exception: pass
    kill_port(AEK_MCP_FRONTEND_PORT)
    time.sleep(1)
    print("[aek-mcp] Old frontend instances killed")


def main():
    print("=== Deploying aek-mcp frontend (nextjs 1351) ===\n")

    print("[1/4] Stopping old frontend...")
    kill_old()

    print("\n[2/4] Installing dependencies...")
    run(["pnpm", "install"], cwd=AEK_MCP_DIR)

    print("\n[3/4] Building frontend...")
    for cache_dir in [FRONTEND_DIR / ".next", FRONTEND_DIR / ".turbopack"]:
        if cache_dir.exists():
            shutil.rmtree(cache_dir, ignore_errors=True)
            print(f"[aek-mcp] Cleared {cache_dir}")
    run(["pnpm", "run", "build"], cwd=FRONTEND_DIR)
    print("[aek-mcp] Frontend built")

    print(f"\n[4/4] Starting nextjs on port {AEK_MCP_FRONTEND_PORT}...")
    cwd = FRONTEND_DIR
    env = os.environ.copy()
    env["NODE_ENV"] = "production"
    if is_win():
        proc = subprocess.Popen(
            ["pnpm", "run", "start"], cwd=cwd, env=env,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
        )
    else:
        proc = subprocess.Popen(
            ["pnpm", "run", "start"], cwd=cwd, env=env,
            start_new_session=True,
        )

    ready = False
    deadline = time.time() + 30
    while time.time() < deadline:
        try:
            import urllib.request
            resp = urllib.request.urlopen(
                f"http://127.0.0.1:{AEK_MCP_FRONTEND_PORT}/", timeout=3)
            if resp.status in (200, 404):
                ready = True
                break
        except Exception:
            pass
        time.sleep(1)

    if ready:
        print(f"[aek-mcp] Nextjs ready on port {AEK_MCP_FRONTEND_PORT} (pid {proc.pid})")
    else:
        print("Warning: Nextjs did not become ready in time")


if __name__ == "__main__":
    main()
