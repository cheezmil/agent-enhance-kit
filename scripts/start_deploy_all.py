#!/usr/bin/env python3
# Deploy all modules / 全量部署所有模块
# Order: aek-websearch first (aek-mcp depends on 'aek' CLI), then aek-mcp

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from start_scripts_shared_logic import run, PROJECT_ROOT

DEPLOY_SCRIPTS = [
    ("aek-websearch", "start_deploy_aek-websearch.py"),
    ("aek-mcp", "start_deploy_aek-mcp.py"),
]


def main():
    scripts_dir = PROJECT_ROOT / "scripts"

    for mod_name, script_name in DEPLOY_SCRIPTS:
        script = scripts_dir / mod_name / script_name
        print(f"\n{'=' * 40}")
        print(f"=== Deploying {mod_name} ===")
        print(f"{'=' * 40}")
        if script.exists():
            run([sys.executable, str(script)], cwd=PROJECT_ROOT)
        else:
            print(f"  Warning: {script} not found, skipping")

    print(f"\n{'=' * 40}")
    print("=== All modules deployed ===")
    print(f"{'=' * 40}")


if __name__ == "__main__":
    main()
