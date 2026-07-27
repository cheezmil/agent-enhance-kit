#!/usr/bin/env python3
# Start aek-mcp: start BOTH frontend (1351) + backend (1352)
# If services are already running, skips; otherwise runs deploy scripts to bring them up.
import os, subprocess, sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).parent


def main():
    print("=== Starting aek-mcp (frontend + backend) ===\n")

    fe_script = SCRIPTS_DIR / "start_deploy_fe_aek-mcp.py"
    be_script = SCRIPTS_DIR / "start_deploy_be_aek-mcp.py"

    for label, script in [("frontend", fe_script), ("backend", be_script)]:
        if not script.exists():
            print(f"Error: {script} not found")
            sys.exit(1)
        print(f"\n--- Running {label} ---")
        env = os.environ.copy()
        env["PYTHONUNBUFFERED"] = "1"
        r = subprocess.run([sys.executable, str(script)], env=env)
        if r.returncode != 0:
            print(f"Error: {label} script failed (exit {r.returncode})")
            sys.exit(1)

    print(f"""
=== aek-mcp started ===
    Main entry:  http://127.0.0.1:1351/aek-mcp/
    Gin backend: http://127.0.0.1:1352/ (pure API/MCP)
""")


if __name__ == "__main__":
    main()
