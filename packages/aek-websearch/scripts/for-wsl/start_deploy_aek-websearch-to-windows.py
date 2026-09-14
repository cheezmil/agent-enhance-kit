#!/usr/bin/env python3
"""
开发部署 aek-websearch 到 Windows（本地编译，不做 npm publish）

使用：python3 packages/aek-websearch/scripts/for-wsl/start_deploy_aek-websearch-to-windows.py

流程：
  1. 读取本地已编译的 Windows 二进制（platforms/win32-x64/aek.exe）
  2. 复制到 Windows %USERPROFILE%\\.aek\\bin\\win\\
  3. 确保 PATH 已配置
"""

import subprocess
import os
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent.parent.parent
PKG_DIR = PROJECT_ROOT / "packages" / "aek-websearch"


def get_wsl_distro():
    distro = os.environ.get("WSL_DISTRO_NAME")
    if not distro:
        print("[✗] 找不到 WSL 发行版名，请设置 WSL_DISTRO_NAME 环境变量")
        sys.exit(1)
    return distro


def get_windows_pwsh():
    for p in ["/mnt/c/Program Files/PowerShell/7/pwsh.exe",
              "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe"]:
        if os.path.exists(p):
            return p
    return None


def main():
    distro = get_wsl_distro()
    pwsh = get_windows_pwsh()
    if not pwsh:
        print("[✗] 找不到 Windows PowerShell")
        sys.exit(1)

    # 检查本地编译的二进制
    win_bin = PKG_DIR / "platforms" / "win32-x64" / "aek.exe"
    if not win_bin.exists():
        print(f"[✗] 找不到 Windows 二进制: {win_bin}")
        print("  请先在 Windows 上运行: python3 scripts/start_deploy_aek-websearch.py")
        sys.exit(1)

    src_unc = f"\\\\wsl.localhost\\{distro}\\{str(PKG_DIR).lstrip('/')}"
    print(f"  包目录: {PKG_DIR}")
    print(f"  Windows 二进制: {win_bin}")

    ps_script = f"""
$ErrorActionPreference = 'Stop'
$srcUnc = "{src_unc}"
$winBin = Join-Path $srcUnc "platforms\\win32-x64\\aek.exe"
$destDir = Join-Path $env:USERPROFILE ".aek\\bin\\win"
$destBin = Join-Path $destDir "aek.exe"

Write-Host "[1/3] 复制 Windows 二进制..."
if (!(Test-Path $destDir)) {{ New-Item -ItemType Directory -Path $destDir -Force | Out-Null }}
Copy-Item $winBin $destBin -Force
Write-Host "  已复制: $destBin"

Write-Host "[2/3] 确保 PATH 已配置..."
if (!(Get-Command pave -ErrorAction SilentlyContinue)) {{
    winget install Microsoft.Pave --accept-source-agreements 2>$null
}}
pave add $destDir 2>&1 | Write-Host
$env:Path = $destDir + ';' + $env:Path

Write-Host "[3/3] 验证..."
& $destBin version
"""

    subprocess.run([pwsh, "-Command", ps_script], check=True)
    print("\n✓ 开发部署完成！")
    print("  注意: 此脚本只做本地开发部署，不做 npm publish")


if __name__ == "__main__":
    main()
