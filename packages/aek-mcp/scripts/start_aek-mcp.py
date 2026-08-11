#!/usr/bin/env python3
# Start aek-mcp: launch backend (1352) first, then frontend (1351).
# Delegates to start_be_aek-mcp.py / start_fe_aek-mcp.py (one-shot launchers
# that spawn the real process, wait for readiness, then exit). We verify
# success via return code, then confirm ports are live ourselves.
import os
import subprocess
import sys
import time
from pathlib import Path

SCRIPTS_DIR = Path(__file__).parent

FE_SCRIPT = SCRIPTS_DIR / "start_fe_aek-mcp.py"
BE_SCRIPT = SCRIPTS_DIR / "start_be_aek-mcp.py"


def launch(label: str, script: Path, port: int):
    if not script.exists():
        print(f"Error: {script} not found")
        sys.exit(1)
    print(f"\n--- Starting {label} ({script}) ---")
    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"
    r = subprocess.run([sys.executable, str(script)], env=env, timeout=120)
    if r.returncode != 0:
        print(f"Error: {label} launcher failed (exit {r.returncode})")
        sys.exit(1)
    time.sleep(2)
    if port_ready(port):
        print(f"  {label} ready on port {port}")
    else:
        print(f"  Warning: {label} launcher exited 0 but port {port} is not listening")


def port_ready(port: int) -> bool:
    try:
        import socket
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(2)
        return s.connect_ex(("127.0.0.1", port)) == 0
    except Exception:
        return False


def main():
    print("=== Starting aek-mcp (backend + frontend) ===")
    launch("backend", BE_SCRIPT, 1352)
    launch("frontend", FE_SCRIPT, 1351)

    print(
        """
=== aek-mcp started ===
    Backend  (1352): http://127.0.0.1:1352/
    Frontend (1351): http://127.0.0.1:1351/aek-mcp/
"""
    )


if __name__ == "__main__":
    main()
