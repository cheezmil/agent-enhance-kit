#!/usr/bin/env python3
# Deploy aek-websearch: build → install to PATH / 部署 aek-websearch：编译 → 安装到 PATH

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from start_scripts_shared_logic import run, is_win

AEK_WS_DIR = Path(__file__).parent.parent.parent / "packages" / "aek-websearch"


def main():
    ext = ".exe" if is_win() else ""

    print("=== Deploying aek-websearch ===\n")

    # 1. Build
    print("[1/2] Building...")
    run(["go", "build", "-o", f"bin/aek{ext}", "./cmd/aek/"], cwd=AEK_WS_DIR)
    print(f"[aek-websearch] Built to bin/aek{ext}")

    # 2. Install to PATH
    print("\n[2/2] Installing to PATH...")
    run(["npm", "install", "-g", "--force", "."], cwd=AEK_WS_DIR)
    print("[aek-websearch] Done. 'aek' should now be available in PATH.")

    print("\n=== aek-websearch deployed ===")


if __name__ == "__main__":
    main()
