#!/usr/bin/env python3
# Deploy aek-mcp: stop old → build → start nextjs (1351) + gin (1352)
# 无反向代理：nextjs 1351 是主入口，gin 1352 是纯 API/MCP 后端，
# nextjs 通过 rewrites 规则把 /aek-mcp/api/* 等请求转发到 gin。
import os, shutil, signal, subprocess, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from start_scripts_shared_logic import run, run_safe, kill_port, is_win

AEK_MCP_DIR = Path(__file__).parent.parent.parent / "packages" / "aek-mcp"
AEK_MCP_BACKEND_PORT = 1352  # gin
AEK_MCP_FRONTEND_PORT = 1351  # nextjs (main entry)
FRONTEND_DIR = AEK_MCP_DIR / "frontend"


def kill_old():
    if is_win():
        run_safe(["taskkill", "/F", "/IM", "aek-mcp.exe"])
    if not is_win():
        for name in ["aek-mcp", "one-mcp"]:
            r = run_safe(["pgrep", "-x", name])
            if r is None or r.stdout is None:
                continue
            for pid in r.stdout.strip().split():
                if pid.strip():
                    try: os.kill(int(pid.strip()), signal.SIGTERM)
                    except Exception: pass
    kill_port(AEK_MCP_BACKEND_PORT)
    kill_port(AEK_MCP_FRONTEND_PORT)
    time.sleep(1)
    print("[aek-mcp] Old instances killed")


def main():
    print("=== Deploying aek-mcp (no reverse proxy) ===\n")

    print("[1/4] Stopping old instances...")
    kill_port(AEK_MCP_BACKEND_PORT)
    kill_port(AEK_MCP_FRONTEND_PORT)
    kill_old()

    print("\n[2/4] Building frontend...")
    run(["pnpm", "install"], cwd=AEK_MCP_DIR)
    for cache_dir in [FRONTEND_DIR / ".next", FRONTEND_DIR / ".turbopack"]:
        if cache_dir.exists():
            shutil.rmtree(cache_dir, ignore_errors=True)
            print(f"[aek-mcp] Cleared {cache_dir}")
    run(["pnpm", "run", "build"], cwd=FRONTEND_DIR)
    print("[aek-mcp] Frontend built")

    print("\n[3/4] Building backend...")
    run(["go", "build", "-a", "-o", "bin/aek-mcp", "./cmd/aek-mcp/"], cwd=AEK_MCP_DIR)
    print("[aek-mcp] Built to bin/aek-mcp")

    print(f"\n[4/4] Starting nextjs on port {AEK_MCP_FRONTEND_PORT} (main entry)...")
    # Start nextjs; detach so it survives script exit.
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
            if resp.status == 200:
                ready = True
                break
        except Exception:
            pass
        time.sleep(1)

    if ready:
        print(f"[aek-mcp] Nextjs ready on port {AEK_MCP_FRONTEND_PORT} (pid {proc.pid})")
    else:
        print(f"Warning: Nextjs did not become ready in time; continuing anyway")

    print(f"\n[5/5] Starting gin backend on port {AEK_MCP_BACKEND_PORT}...")
    cwd = AEK_MCP_DIR
    if is_win():
        gin_proc = subprocess.Popen(
            ["bin\\aek-mcp.exe"], cwd=cwd,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
        )
    else:
        gin_proc = subprocess.Popen(
            [str(cwd / "bin" / "aek-mcp")], cwd=cwd,
            start_new_session=True,
        )

    gin_ready = False
    deadline = time.time() + 40
    while time.time() < deadline:
        try:
            import urllib.request
            resp = urllib.request.urlopen(
                f"http://127.0.0.1:{AEK_MCP_BACKEND_PORT}/health", timeout=3)
            if resp.status == 200:
                gin_ready = True
                break
        except Exception:
            pass
        time.sleep(1)

    if gin_ready:
        print(f"[aek-mcp] Gin backend ready on port {AEK_MCP_BACKEND_PORT} (pid {gin_proc.pid})")
    else:
        print(f"Warning: Gin did not become ready in time; continuing anyway")

    print(f"""
=== aek-mcp deployed (zero reverse proxy) ===
    Main entry:  http://127.0.0.1:{AEK_MCP_FRONTEND_PORT}/aek-mcp/
    Gin backend: http://127.0.0.1:{AEK_MCP_BACKEND_PORT}/ (pure API/MCP)
""")


if __name__ == "__main__":
    main()
