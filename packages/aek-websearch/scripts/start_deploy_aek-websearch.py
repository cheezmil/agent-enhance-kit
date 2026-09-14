#!/usr/bin/env python3
# 开发部署 aek-websearch: 本地编译 → npm install -g（不做 npm publish）
# 使用：python3 packages/aek-websearch/scripts/start_deploy_aek-websearch.py

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "shared"))
from start_scripts_shared_logic import run, run_safe, is_win

AEK_WS_DIR = PROJECT_ROOT / "packages" / "aek-websearch"


def main():
    ext = ".exe" if is_win() else ""

    print("=== 开发部署 aek-websearch ===\n")

    # 1. 本地编译
    print("[1/3] 本地编译...")
    run(["go", "build", "-a", "-o", f"bin/aek{ext}", "./cmd/aek/"], cwd=AEK_WS_DIR)
    platforms_dir = AEK_WS_DIR / "platforms" / ("win32-x64" if is_win() else "linux-x64")
    platforms_bin = platforms_dir / f"aek{ext}"
    if platforms_bin.parent.exists():
        import shutil
        shutil.copy2(AEK_WS_DIR / f"bin/aek{ext}", platforms_bin)
        print(f"  已复制到 {platforms_bin}")
    print(f"  编译完成: bin/aek{ext}")

    # 2. 卸载旧版
    print("\n[2/3] 卸载旧版全局包...")
    run_safe(["npm", "uninstall", "-g", "aek-websearch"], cwd=AEK_WS_DIR)
    run_safe(["npm", "uninstall", "-g", "@cheezmil/aek-websearch"], cwd=AEK_WS_DIR)

    # 3. 本地安装到 PATH
    print("\n[3/3] 本地安装到 PATH (npm install -g .)...\n")
    run(["npm", "install", "-g", "."], cwd=AEK_WS_DIR)
    print("\n✓ 开发部署完成！")
    print("  命令: aek websearch --help")
    print("\n⚠ 注意: 此脚本只做本地开发部署，不做 npm publish")
    print("  如需发布到 npm，请手动运行: npm version && npm publish --access public")


if __name__ == "__main__":
    main()
