#!/usr/bin/env python3
# Install aek-websearch / 安装 aek-websearch

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from start_scripts_shared_logic import run, is_win

AEK_WS_DIR = Path(__file__).parent.parent.parent / "packages" / "aek-websearch"


def main():
    ext = ".exe" if is_win() else ""
    src_bin = AEK_WS_DIR / f"bin/aek{ext}"

    if not src_bin.exists():
        print("[aek-websearch] Binary not found, building first...")
        run(["go", "build", "-o", f"bin/aek{ext}", "./cmd/aek/"], cwd=AEK_WS_DIR)

    print("[aek-websearch] Installing globally via npm...")
    run(["npm", "install", "-g", "."], cwd=AEK_WS_DIR)
    print("[aek-websearch] Done. 'aek' should now be available in PATH.")


if __name__ == "__main__":
    main()
