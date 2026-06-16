#!/usr/bin/env python3
# Start aek-websearch / 启动 aek-websearch

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from start_scripts_shared_logic import run, is_win

AEK_WS_DIR = Path(__file__).parent.parent.parent / "packages" / "aek-websearch"


def main():
    ext = ".exe" if is_win() else ""
    bin_path = AEK_WS_DIR / f"bin/aek{ext}"

    if not bin_path.exists():
        print(f"Error: bin/aek{ext} not found")
        print("Run start_build_aek-websearch.py first")
        sys.exit(1)

    print("[aek-websearch] Starting aek serve...")
    run([f"./bin/aek{ext}", "serve"], cwd=AEK_WS_DIR)


if __name__ == "__main__":
    main()
