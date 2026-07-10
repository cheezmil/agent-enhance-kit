#!/usr/bin/env python3
# Deploy aek-websearch: build → install to PATH / 部署 aek-websearch：编译 → 安装到 PATH

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from start_scripts_shared_logic import run, run_safe, is_win

AEK_WS_DIR = Path(__file__).parent.parent.parent / "packages" / "aek-websearch"


def main():
    ext = ".exe" if is_win() else ""

    print("=== Deploying aek-websearch ===\n")

    # 1. Build (-a forces rebuild to bypass Go 1.24+ binary cache)
    print("[1/2] Building...")
    run(["go", "build", "-a", "-o", f"bin/aek{ext}", "./cmd/aek/"], cwd=AEK_WS_DIR)
    # Also copy to platforms/ so postinstall doesn't overwrite with stale binary
    platforms_dir = AEK_WS_DIR / "platforms" / ("win32-x64" if is_win() else "linux-x64")
    platforms_bin = platforms_dir / f"aek{ext}"
    if platforms_bin.parent.exists():
        import shutil
        shutil.copy2(AEK_WS_DIR / f"bin/aek{ext}", platforms_bin)
        print(f"[aek-websearch] Copied to {platforms_bin}")
    print(f"[aek-websearch] Built to bin/aek{ext}")

    # 2. Install to PATH
    print("[aek-websearch] Uninstalling old version...")
    run_safe(["npm", "uninstall", "-g", "aek-websearch"], cwd=AEK_WS_DIR)

    print("\n[2/2] Installing to PATH...")
    run(["npm", "install", "-g", "."], cwd=AEK_WS_DIR)
    print("[aek-websearch] Done. 'aek' should now be available in PATH.")

    print("\n=== aek-websearch deployed ===")


if __name__ == "__main__":
    main()
