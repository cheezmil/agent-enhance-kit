#!/usr/bin/env python3
# Start aek-mcp: launch BOTH frontend (1351) + backend (1352)
# Requires deployed services (run start_deploy_aek-mcp.py first)
import os
import subprocess
import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).parent

FE_SCRIPT = SCRIPTS_DIR / "start_fe_aek-mcp.py"
BE_SCRIPT = SCRIPTS_DIR / "start_be_aek-mcp.py"


def run_script(label: str, script: Path):
    if not script.exists():
        print(f"Error: {script} not found")
        sys.exit(1)
    print(f"\n--- {label} ---")
    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"
    r = subprocess.run([sys.executable, str(script)], env=env)
    if r.returncode != 0:
        print(f"Error: {label} failed (exit {r.returncode})")
        sys.exit(1)


def main():
    print("=== Starting aek-mcp (frontend + backend) ===")

    for label, script in [("frontend", FE_SCRIPT), ("backend", BE_SCRIPT)]:
        run_script(label, script)

    print(f"""
=== aek-mcp started ===
    Frontend (main):  http://127.0.0.1:1351/
    Backend (gin):    http://127.0.0.1:1352/
""")


if __name__ == "__main__":
    main()
