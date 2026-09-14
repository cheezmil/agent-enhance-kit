#!/usr/bin/env python3
"""
用途：在 WSL 中执行，将 aek-websearch Windows 二进制部署到 Windows
使用：python3 packages/aek-websearch/scripts/for-wsl/start_deploy_aek-websearch-to-windows.py

原理：
  1. 从 pnpm build 产出的 platforms/win32-x64/aek.exe 读取已编译好的 Windows 二进制，
     不再重复 go build（防止在 WSL 中交叉编译产出非 Windows 平台产物）。
  2. 通过 wsl.localhost UNC 路径把包文件复制到 Windows 临时目录，再复制到
     %USERPROFILE%\\.aek\\bin\\win\\
  3. 确保 %USERPROFILE%\\.aek\\bin\\win 已加入当前用户 PATH（持久化 + 当前会话）
     注意：aek 的 JS wrapper 链最终通过 resolveBin 找到平台子包的 aek-websearch.exe，
     因此也需同步到 npm 全局 node_modules 下的平台子包目录（若存在）。
"""

import subprocess
import shutil
import os
import sys
from pathlib import Path

# 本脚本位于 packages/aek-websearch/scripts/for-wsl/ 下，向上4级到项目根
SCRIPT_DIR = Path(__file__).resolve().parent             # packages/aek-websearch/scripts/for-wsl/
PROJECT_ROOT = SCRIPT_DIR.parent.parent.parent.parent    # -> 项目根
PKG_DIR = PROJECT_ROOT / "packages" / "aek-websearch"


def get_wsl_distro():
    distro = os.environ.get("WSL_DISTRO_NAME")
    if not distro:
        print("[✗] 找不到 WSL 发行版名，请设置 WSL_DISTRO_NAME 环境变量")
        sys.exit(1)
    return distro


def get_wsl_user():
    user = os.environ.get("USER") or os.environ.get("USERNAME")
    if not user:
        print("[✗] 找不到用户名，请设置 USER 或 USERNAME 环境变量")
        sys.exit(1)
    return user


def wsl_path_to_unc(path: Path, distro: str) -> str:
    """把 WSL 绝对路径转成 wsl.localhost UNC 路径。
    如 /home/xdx/foo -> \\\\wsl.localhost\\Ubuntu-22.04\\home\\xdx\\foo
    """
    p = str(path).replace("/", "\\")
    if p.startswith("\\"):
        p = p.lstrip("\\")
    return f"\\\\wsl.localhost\\{distro}\\{p}"


def get_windows_pwsh():
    candidates = [
        "/mnt/c/Program Files/PowerShell/7/pwsh.exe",
        "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe",
    ]
    for p in candidates:
        if os.path.exists(p):
            return p
    return None


def run_pwsh(script):
    pwsh = get_windows_pwsh()
    if not pwsh:
        print("[✗] 找不到 Windows PowerShell")
        sys.exit(1)
    subprocess.run([pwsh, "-Command", script], check=True)


def main():
    distro = get_wsl_distro()
    user = get_wsl_user()

    if not PKG_DIR.exists():
        print(f"[✗] 找不到包目录: {PKG_DIR}")
        sys.exit(1)

    # 动态推导 UNC 路径，不硬编码
    src = wsl_path_to_unc(PKG_DIR, distro)
    print(f"  包目录: {PKG_DIR}")
    print(f"  UNC源: {src}")

    # 1. 从已编译好的 platforms/win32-x64 读取二进制，不重复 go build
    platforms_bin = PKG_DIR / "platforms" / "win32-x64" / "aek.exe"
    if not platforms_bin.exists():
        print(f"[✗] 找不到已编译的二进制: {platforms_bin}")
        print("  请先运行: pnpm run build")
        sys.exit(1)
    print(f"[1/5] 使用已有 Windows 二进制: {platforms_bin}")

    # 2-5. 在 Windows 上复制、安装、配置 PATH
    ps_script = f"""
$ErrorActionPreference = 'Stop'
$src = "{src}"
$dest = Join-Path $env:TEMP "aek-websearch"
if (Test-Path $dest) {{ Remove-Item $dest -Recurse -Force }}
Write-Host "[2/5] 复制 Windows 二进制到临时目录..."
# 只复制 bin 目录（含 aek.exe），避免整包复制时被 node_modules 的坏符号链接(平台子包)阻断
New-Item -ItemType Directory -Path $dest -Force | Out-Null
Copy-Item (Join-Path $src "bin") $dest -Recurse -Force

Write-Host "[3/5] 卸载旧版全局包(如存在)..."
npm uninstall -g aek-websearch 2>$null

Write-Host "[4/5] 复制 aek.exe 到 %USERPROFILE%\\.aek\\bin\\win..."
$aekBinWin = Join-Path $env:USERPROFILE ".aek\\bin\\win"
if (!(Test-Path $aekBinWin)) {{ New-Item -ItemType Directory -Path $aekBinWin -Force | Out-Null }}
$aekExe = Join-Path $dest "bin" "aek.exe"
if (Test-Path $aekExe) {{
    Copy-Item $aekExe (Join-Path $aekBinWin "aek.exe") -Force
    Write-Host "  已复制: $aekBinWin\\aek.exe"
}} else {{
    throw "未找到 Windows 二进制: $aekExe"
}}

Write-Host "[5/5] 确保 %USERPROFILE%\\.aek\\bin\\win 在当前用户 PATH 中..."
# 用微软 pave 管理 PATH；未安装则自动 winget 安装
if (!(Get-Command pave -ErrorAction SilentlyContinue)) {{
    Write-Host "  pave 未安装，通过 winget 安装..."
    winget install Microsoft.Pave --accept-source-agreements 2>&1 | Write-Host
}}
pave add $aekBinWin 2>&1 | Write-Host
# 更新当前会话 PATH，方便本轮验证
$env:Path = $aekBinWin + ';' + $env:Path

Write-Host "[✓] 验证..."
& (Join-Path $aekBinWin "aek.exe") version
"""
    run_pwsh(ps_script)
    print("[✓] 部署完成")


if __name__ == "__main__":
    main()