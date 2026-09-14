#!/usr/bin/env python3
"""
开发部署 aek-prompt-manager 到 Windows（本地编译，不做 npm publish）

使用：python3 packages/aek-prompt-manager/scripts/for-wsl/start_deploy_aek-prompt-manager-to-windows.py

流程：
  1. 复制本地源码到 Windows
  2. npm install -g 本地路径
"""

import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent.parent.parent
PKG_DIR = PROJECT_ROOT / "packages" / "aek-prompt-manager"


def get_wsl_distro():
    distro = __import__('os').environ.get("WSL_DISTRO_NAME")
    if not distro:
        print("[✗] 找不到 WSL 发行版名，请设置 WSL_DISTRO_NAME 环境变量")
        sys.exit(1)
    return distro


def get_windows_pwsh():
    for p in ["/mnt/c/Program Files/PowerShell/7/pwsh.exe",
              "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe"]:
        if Path(p).exists():
            return p
    return None


def main():
    distro = get_wsl_distro()
    pwsh = get_windows_pwsh()
    if not pwsh:
        print("[✗] 找不到 Windows PowerShell")
        sys.exit(1)

    if not PKG_DIR.exists():
        print(f"[✗] 找不到包目录: {PKG_DIR}")
        sys.exit(1)

    src_unc = f"\\\\wsl.localhost\\{distro}\\{str(PKG_DIR).lstrip('/')}"
    print(f"  包目录: {PKG_DIR}")
    print(f"  UNC源: {src_unc}")

    ps_script = f"""
$ErrorActionPreference = 'Stop'
$src = "{src_unc}"

Write-Host "[1/3] 卸载旧版全局包..."
npm uninstall -g aek-prompt-manager 2>$null
npm uninstall -g @cheezmil/aek-prompt-manager 2>$null

Write-Host "[2/3] 从本地源码安装..."
npm install -g $src 2>&1 | Write-Host

Write-Host "[3/3] 验证 aekpm 命令..."
$cmd = Get-Command aekpm -ErrorAction SilentlyContinue
if ($cmd) {{
    Write-Host "  [✓] aekpm 已就绪: $($cmd.Source)"
    aekpm --version
}} else {{
    Write-Host "  [!] aekpm 未找到，请刷新终端"
}}
"""

    subprocess.run([pwsh, "-Command", ps_script], check=True)
    print("\n✓ 开发部署完成！")
    print("  注意: 此脚本只做本地开发部署，不做 npm publish")


if __name__ == "__main__":
    main()
