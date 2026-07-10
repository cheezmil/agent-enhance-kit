#!/usr/bin/env python3
# Start all services / 启动所有服务

import os
import signal
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from start_scripts_shared_logic import run, kill_port, can_bind, is_win, PROJECT_ROOT

AEK_MCP_DIR = PROJECT_ROOT / "packages" / "aek-mcp"
AEK_WS_DIR = PROJECT_ROOT / "packages" / "aek-websearch"
AEK_MCP_PORT = 1351


def main():
    print("=== Starting all services ===\n")

    procs = []

    # 1. aek-mcp
    bin_mcp = AEK_MCP_DIR / "bin" / "aek-mcp"
    if bin_mcp.exists():
        kill_port(AEK_MCP_PORT)
        if can_bind(AEK_MCP_PORT):
            print(f"[aek-mcp] Starting on port {AEK_MCP_PORT}...")
            p = subprocess.Popen(
                [str(bin_mcp)],
                cwd=str(AEK_MCP_DIR),
            )
            procs.append(("aek-mcp", p))
        else:
            print(f"[aek-mcp] Skipped: port {AEK_MCP_PORT} occupied")
    else:
        print("[aek-mcp] Skipped: binary not found")

    # 2. aek-websearch serve
    ext = ".exe" if is_win() else ""
    bin_ws = AEK_WS_DIR / f"bin/aek{ext}"
    if bin_ws.exists():
        print("[aek-websearch] Starting serve...")
        p = subprocess.Popen(
            [str(bin_ws), "serve"],
            cwd=str(AEK_WS_DIR),
        )
        procs.append(("aek-websearch", p))
    else:
        print("[aek-websearch] Skipped: binary not found")

    if not procs:
        print("\nNo services started. Run deploy first.")
        sys.exit(1)

    print(f"\n{len(procs)} service(s) running. Press Ctrl+C to stop.\n")

    # Wait for all, handle Ctrl+C
    try:
        while procs:
            for name, p in procs[:]:
                if p.poll() is not None:
                    print(f"[{name}] Exited with code {p.returncode}")
                    procs.remove((name, p))
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nStopping all services...")
        for name, p in procs:
            print(f"  Stopping {name}...")
            if is_win():
                p.terminate()
            else:
                p.send_signal(signal.SIGTERM)
        for name, p in procs:
            try:
                p.wait(timeout=5)
            except subprocess.TimeoutExpired:
                p.kill()
        print("All services stopped.")


if __name__ == "__main__":
    main()
