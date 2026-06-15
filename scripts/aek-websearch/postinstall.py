#!/usr/bin/env python3
# Post-install script for aek-websearch / aek-websearch 安装后脚本

import sys
from pathlib import Path

# Add scripts dir to path for import / 将 scripts 目录添加到路径以便导入
sys.path.insert(0, str(Path(__file__).parent.parent))
from start_scripts_shared_logic import (
    get_platform_key, get_ext, copy_file, ensure_dir, PROJECT_ROOT
)


def main():
    pkg_dir = PROJECT_ROOT / "packages" / "aek-websearch"
    
    platform_key = get_platform_key()
    ext = get_ext()
    src_bin = pkg_dir / "platforms" / platform_key / f"aek{ext}"
    bin_dir = ensure_dir(pkg_dir / "bin")
    dest_bin = bin_dir / f"aek{ext}"
    
    if not src_bin.exists():
        print(f"[aek] Unsupported platform: {platform_key}")
        print("[aek] Supported: linux-x64, darwin-x64, darwin-arm64, win32-x64")
        sys.exit(1)
    
    # Remove old binary if exists / 删除旧的二进制文件
    if dest_bin.exists():
        dest_bin.unlink()
    
    copy_file(src_bin, dest_bin)
    print(f"[aek] Installed aek ({platform_key}) to {dest_bin}")


if __name__ == "__main__":
    main()
