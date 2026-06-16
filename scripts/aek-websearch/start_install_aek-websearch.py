#!/usr/bin/env python3
# Install aek-websearch / 安装 aek-websearch

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from start_scripts_shared_logic import run

AEK_WS_DIR = Path(__file__).parent.parent.parent / "packages" / "aek-websearch"


def main():
    print("[aek-websearch] Building and installing globally...")
    run(["go", "install", "./cmd/aek/"], cwd=AEK_WS_DIR)
    print("[aek-websearch] Installed via go install")


if __name__ == "__main__":
    main()
