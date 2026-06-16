#!/usr/bin/env python3
# Build all modules / 构建所有模块

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from start_scripts_shared_logic import run, PROJECT_ROOT

MODULES = ["aek-websearch", "aek-mcp"]


def main():
    scripts_dir = PROJECT_ROOT / "scripts"

    for mod in MODULES:
        script = scripts_dir / f"start_build_{mod}.py"
        print(f"\n=== Building {mod} ===")
        run([sys.executable, str(script)], cwd=PROJECT_ROOT)

    print("\n=== All modules built ===")


if __name__ == "__main__":
    main()
