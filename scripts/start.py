#!/usr/bin/env python3
# Unified AEK service launcher / AEK 服务统一启动脚本
#
# Usage / 用法:
#   python scripts/start.py                       # interactive: pick services to start
#   python scripts/start.py all                   # start all services (production mode)
#   python scripts/start.py mcp websearch         # start selected services
#   python scripts/start.py mcp --dev             # dev mode (hot reload)
#   python scripts/start.py --list                # list available services
#
# Services / 服务:
#   mcp        aek-mcp      gin backend (1352) + nextjs frontend (1351)
#   websearch  aek-websearch  REST API server (1350)
#   browser    aek-browser  daemon (auto-started by CLI; here: status check)

import argparse
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

# 添加 scripts 目录到路径以导入共享逻辑
SCRIPTS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS_DIR))

from shared.start_scripts_shared_logic import (
    can_bind,
    kill_port,
    spawn,
    wait_http,
    _find_binary,
)

PROJECT_ROOT = SCRIPTS_DIR.parent
PACKAGES = PROJECT_ROOT / "packages"


# ---------- aek-websearch / 网络搜索服务 ----------

WS_PORT = 1350
WS_DIR = PACKAGES / "aek-websearch"


def start_websearch() -> bool:
    bin_dir = WS_DIR / "bin"
    bin_path = _find_binary(bin_dir, ["aek-websearch", "aek"])
    if not bin_path:
        print(f"[websearch] Error: no aek binary found in {bin_dir}")
        print("[websearch] Build first: cd packages/aek-websearch && go build -o bin/ ./cmd/aek/")
        return False
    print(f"[websearch] Clearing port {WS_PORT}...")
    kill_port(WS_PORT)
    print(f"[websearch] Launching aek serve on port {WS_PORT}...")
    proc = spawn([str(bin_path), "serve"], cwd=WS_DIR)
    print(f"[websearch] Process started (pid {proc.pid})")
    if wait_http(WS_PORT, path="/api/health", timeout_s=30):
        print(f"[websearch] Ready: http://127.0.0.1:{WS_PORT}/")
        return True
    print("[websearch] Warning: did not become ready in time")
    return False


# ---------- aek-mcp / MCP 网关服务 ----------

MCP_DIR = PACKAGES / "aek-mcp"
MCP_FRONTEND_PORT = 1351  # nextjs 主入口
MCP_BACKEND_PORT = 1352   # gin


def start_mcp_backend() -> bool:
    bin_path = _find_binary(MCP_DIR / "bin", ["aek-mcp"])
    if not bin_path:
        print(f"[mcp] Error: backend binary not found in {MCP_DIR / 'bin'}")
        print("[mcp] Build first: cd packages/aek-mcp && go build -o bin/aek-mcp ./cmd/aek-mcp/")
        return False
    print(f"[mcp] Clearing backend port {MCP_BACKEND_PORT}...")
    kill_port(MCP_BACKEND_PORT)
    print(f"[mcp] Launching gin backend on port {MCP_BACKEND_PORT}...")
    proc = spawn([str(bin_path)], cwd=MCP_DIR)
    print(f"[mcp] Backend process started (pid {proc.pid})")
    if wait_http(MCP_BACKEND_PORT, path="/health", timeout_s=40):
        print(f"[mcp] Backend ready: http://127.0.0.1:{MCP_BACKEND_PORT}/")
        return True
    print("[mcp] Warning: backend did not become ready in time")
    return False


def start_mcp_frontend() -> bool:
    frontend_dir = MCP_DIR / "frontend"
    print(f"[mcp] Clearing frontend port {MCP_FRONTEND_PORT}...")
    kill_port(MCP_FRONTEND_PORT)
    print(f"[mcp] Launching nextjs production on port {MCP_FRONTEND_PORT}...")
    env = {"NODE_ENV": "production"}
    proc = spawn(["pnpm", "run", "start"], cwd=frontend_dir, env=env)
    print(f"[mcp] Frontend process started (pid {proc.pid})")
    if wait_http(MCP_FRONTEND_PORT, timeout_s=40):
        print(f"[mcp] Frontend ready: http://127.0.0.1:{MCP_FRONTEND_PORT}/aek-mcp/")
        return True
    print("[mcp] Warning: frontend did not become ready in time")
    return False


def start_mcp() -> bool:
    print("\n=== Starting aek-mcp (backend + frontend) ===")
    ok_be = start_mcp_backend()
    ok_fe = start_mcp_frontend()
    print("\n=== aek-mcp started ===")
    print(f"  Backend  ({MCP_BACKEND_PORT}): http://127.0.0.1:{MCP_BACKEND_PORT}/")
    print(f"  Frontend ({MCP_FRONTEND_PORT}): http://127.0.0.1:{MCP_FRONTEND_PORT}/aek-mcp/")
    return ok_be and ok_fe


def start_mcp_dev() -> int:
    """Dev mode: Go hot reload (air) + Next.js dev server, foreground until Ctrl+C."""
    import shutil
    print("\n=== aek-mcp Dev Mode ===")
    print(f"  Go backend + proxy: http://localhost:{MCP_BACKEND_PORT}")
    print(f"  Next.js dev server: http://localhost:{MCP_FRONTEND_PORT}")
    print("  Press Ctrl+C to stop\n")

    # Ensure air (Go hot reload tool)
    air_path = None
    go_bin_air = Path.home() / "go" / "bin" / ("air.exe" if sys.platform == "win32" else "air")
    if go_bin_air.exists():
        air_path = str(go_bin_air)
    elif shutil.which("air"):
        air_path = "air"
    if not air_path:
        print("[mcp-dev] Installing air...")
        subprocess.run(["go", "install", "github.com/air-verse/air@latest"],
                       check=True, shell=(sys.platform == "win32"))
        air_path = str(go_bin_air) if go_bin_air.exists() else "air"

    kill_port(MCP_BACKEND_PORT)
    kill_port(MCP_FRONTEND_PORT)

    procs: list[tuple[str, object]] = []
    try:
        go_env = os.environ.copy()
        go_env["PORT"] = str(MCP_BACKEND_PORT)
        go_env["DEV_PROXY"] = f"http://localhost:{MCP_FRONTEND_PORT}"
        air_cmd = ([air_path, "-c", ".air.toml"]
                   if (MCP_DIR / ".air.toml").exists() else [air_path])
        procs.append(("air (Go)", subprocess.Popen(
            air_cmd, cwd=str(MCP_DIR), env=go_env, shell=(sys.platform == "win32"))))

        fe_env = os.environ.copy()
        fe_env["PORT"] = str(MCP_FRONTEND_PORT)
        fe_env["NEXT_PUBLIC_API_URL"] = f"http://localhost:{MCP_BACKEND_PORT}"
        procs.append(("next dev", subprocess.Popen(
            ["pnpm", "next", "dev", "-p", str(MCP_FRONTEND_PORT)],
            cwd=str(MCP_DIR / "frontend"), env=fe_env, shell=(sys.platform == "win32"))))

        print("[mcp-dev] Services running. Ctrl+C to stop.\n")
        while True:
            for name, p in procs:
                if p.poll() is not None:
                    print(f"[mcp-dev] {name} exited with code {p.returncode}")
                    raise KeyboardInterrupt
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n[mcp-dev] Stopping...")
    finally:
        for name, p in procs:
            if p.poll() is None:
                print(f"[mcp-dev] Stopping {name}...")
                try:
                    if sys.platform == "win32":
                        p.terminate()
                    else:
                        p.send_signal(signal.SIGTERM)
                    p.wait(timeout=5)
                except Exception:
                    p.kill()
        print("[mcp-dev] Stopped")
    return 0


# ---------- aek-browser / 浏览器自动化守护进程 ----------

BROWSER_DIR = PACKAGES / "aek-browser"
BROWSER_PORT = 19825


def start_browser() -> bool:
    """Start the aek-browser daemon. The daemon normally auto-starts when the
    CLI runs; here we start it explicitly via the CLI entry."""
    dist_main = BROWSER_DIR / "dist" / "src" / "main.js"
    src_main = BROWSER_DIR / "src" / "main.ts"
    if dist_main.exists():
        cmd = ["node", str(dist_main), "daemon", "status"]
    elif src_main.exists():
        print("[browser] dist not built; building first...")
        r = subprocess.run(["pnpm", "run", "build"], cwd=str(BROWSER_DIR))
        if r.returncode != 0 or not dist_main.exists():
            print("[browser] Error: build failed")
            return False
        cmd = ["node", str(dist_main), "daemon", "status"]
    else:
        print("[browser] Error: entry not found")
        return False
    print("[browser] Triggering daemon via CLI status check...")
    r = subprocess.run(cmd, cwd=str(BROWSER_DIR))
    if r.returncode == 0:
        print(f"[browser] Daemon OK: http://127.0.0.1:{BROWSER_PORT}/")
        return True
    print("[browser] Warning: daemon status check failed")
    return False


# ---------- registry / 服务注册表 ----------

SERVICES = {
    "mcp": {
        "package": "aek-mcp",
        "desc": "MCP gateway (gin :1352 + nextjs :1351)",
        "start": start_mcp,
        "start_dev": start_mcp_dev,
    },
    "websearch": {
        "package": "aek-websearch",
        "desc": "web search REST API (:1350)",
        "start": start_websearch,
    },
    "browser": {
        "package": "aek-browser",
        "desc": "browser daemon (:19825)",
        "start": start_browser,
    },
}


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Unified AEK service launcher",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "services", nargs="*",
        help="Services to start: " + ", ".join(SERVICES) + ", or 'all'. "
             "Omit for interactive selection.")
    parser.add_argument("--list", action="store_true", help="List services and exit")
    parser.add_argument("--dev", action="store_true",
                        help="Dev mode (hot reload) where supported")
    args = parser.parse_args()

    if args.list:
        for name, svc in SERVICES.items():
            dev = " [dev supported]" if "start_dev" in svc else ""
            print(f"  {name:<12} {svc['package']:<16} {svc['desc']}{dev}")
        return 0

    selected = list(args.services)
    if not selected:
        print("Select services to start (comma/space separated, or 'all'):")
        for name, svc in SERVICES.items():
            print(f"  {name:<12} {svc['desc']}")
        choice = input("> ").strip()
        selected = choice.replace(",", " ").split()

    if "all" in selected:
        selected = list(SERVICES)

    unknown = [s for s in selected if s not in SERVICES]
    if unknown:
        print(f"Unknown service(s): {', '.join(unknown)}")
        print("Available: " + ", ".join(SERVICES) + ", all")
        return 1

    results: dict[str, bool] = {}
    for name in selected:
        svc = SERVICES[name]
        print(f"\n########## {svc['package']} ({name}) ##########")
        if args.dev and "start_dev" in svc:
            rc = svc["start_dev"]()
            results[name] = rc == 0
            # dev mode is foreground; if user stopped it, stop launching more
            break
        else:
            results[name] = bool(svc["start"]())

    print("\n########## Summary ##########")
    for name, ok in results.items():
        print(f"  {name:<12} {'OK' if ok else 'FAILED/UNVERIFIED'}")
    return 0 if all(results.values()) else 1


if __name__ == "__main__":
    sys.exit(main())
