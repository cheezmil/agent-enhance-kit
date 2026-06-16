#!/usr/bin/env python3
# Build aek-websearch / 构建 aek-websearch

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from start_scripts_shared_logic import run, is_win

AEK_WS_DIR = Path(__file__).parent.parent.parent / "packages" / "aek-websearch"


def main():
    ext = ".exe" if is_win() else ""
    print("[aek-websearch] Building Go backend...")
    run(["go", "build", "-o", f"bin/aek{ext}", "./cmd/aek/"], cwd=AEK_WS_DIR)
    print(f"[aek-websearch] Built to bin/aek{ext}")


if __name__ == "__main__":
    main()
