#!/usr/bin/env python3
"""
用途：在 WSL 中执行，将 aek-websearch 交叉编译并部署到 Windows
使用：python3 packages/aek-websearch/scripts/for-wsl/start_deploy_aek-websearch-to-windows.py

原理：
  1. 在 WSL 中交叉编译出 Windows 版 aek.exe（GOOS=windows GOARCH=amd64）
  2. 通过 wsl.localhost UNC 路径把整个包复制到 Windows 临时目录
  3. 直接把交叉编译好的 aek.exe 复制到 %USERPROFILE%\bin\（不依赖 npm postinstall，
     因为 npm 的 allow-scripts 机制会拦截 postinstall，导致 platforms/ 里的 Windows
     二进制从未被使用）
  4. 搜索 npm 全局 node_modules 下所有 aek-websearch.exe（平台子包二进制）并更新，
     以及同步到 %USERPROFILE%\.aek\windows-bin\aek-websearch.exe。
     这一步至关重要：aek 命令通过 JS wrapper 链（aek.ps1 → aek.js → aek-common →
     aek-websearch.js → resolveBin → 平台子包 aek-websearch.exe）调用的是 npm 全局
     安装的平台子包二进制，而非 %USERPROFILE%\bin\aek.exe。若不更新此处，aek 命令
     仍会使用旧二进制。
  5. 确保 %USERPROFILE%\bin 已加入当前用户 PATH（持久化 + 当前会话）
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

    # 1. 交叉编译 Windows 二进制（GOOS=windows 是关键，否则产出 Linux ELF）
    print("[1/6] 交叉编译 Windows 版 aek.exe (GOOS=windows GOARCH=amd64)...")
    env = os.environ.copy()
    env["GOOS"] = "windows"
    env["GOARCH"] = "amd64"
    subprocess.run(
        ["go", "build", "-a", "-o", "bin/aek.exe", "./cmd/aek/"],
        cwd=PKG_DIR, env=env, check=True,
    )
    # 同步到 platforms/win32-x64，保持与 postinstall 期望一致
    platforms_dir = PKG_DIR / "platforms" / "win32-x64"
    platforms_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(PKG_DIR / "bin" / "aek.exe", platforms_dir / "aek.exe")
    print("  已编译，并同步到 platforms/win32-x64/aek.exe")

    # 2-6. 在 Windows 上复制、安装、配置 PATH
    ps_script = f"""
$ErrorActionPreference = 'Stop'
$src = "{src}"
$dest = Join-Path $env:TEMP "aek-websearch"
if (Test-Path $dest) {{ Remove-Item $dest -Recurse -Force }}
Write-Host "[2/6] 复制 Windows 二进制到临时目录..."
# 只复制 bin 目录（含 aek.exe），避免整包复制时被 node_modules 的坏符号链接(平台子包)阻断
New-Item -ItemType Directory -Path $dest -Force | Out-Null
Copy-Item (Join-Path $src "bin") $dest -Recurse -Force

Write-Host "[3/6] 卸载旧版全局包(如存在)..."
npm uninstall -g aek-websearch 2>$null

Write-Host "[4/6] 复制 aek.exe 到 %USERPROFILE%\\bin..."
$userBin = Join-Path $env:USERPROFILE "bin"
if (!(Test-Path $userBin)) {{ New-Item -ItemType Directory -Path $userBin | Out-Null }}
$aekExe = Join-Path $dest "bin" "aek.exe"
if (Test-Path $aekExe) {{
    Copy-Item $aekExe $userBin -Force
    Write-Host "  已复制: $userBin\\aek.exe"
}} else {{
    throw "未找到 Windows 二进制: $aekExe"
}}

Write-Host "[5/6] 同步到 npm 全局平台子包和 .aek\\windows-bin..."
# 搜索 npm 全局 node_modules 下所有 aek-websearch.exe（平台子包二进制），全部更新。
# aek 命令通过 JS wrapper 链最终调用的是平台子包里的 aek-websearch.exe，
# 而非 %USERPROFILE%\\bin\\aek.exe，因此必须同步此处。
$npmRoot = npm root -g 2>$null
if ($npmRoot -and (Test-Path $npmRoot)) {{
    $binExes = Get-ChildItem $npmRoot -Recurse -Filter "aek-websearch.exe" -File -ErrorAction SilentlyContinue
    foreach ($binExe in $binExes) {{
        Copy-Item $aekExe $binExe.FullName -Force
        Write-Host "  已更新 npm 全局: $($binExe.FullName)"
    }}
    if (-not $binExes) {{ Write-Host "  未找到 npm 全局平台子包二进制（跳过）" }}
}} else {{
    Write-Host "  未找到 npm 全局目录（跳过）"
}}
# 同步到 .aek\\windows-bin（Hermes 同步目录）
$aekWinBin = Join-Path $env:USERPROFILE ".aek\\windows-bin"
if (!(Test-Path $aekWinBin)) {{ New-Item -ItemType Directory -Path $aekWinBin -Force | Out-Null }}
Copy-Item $aekExe (Join-Path $aekWinBin "aek-websearch.exe") -Force
Write-Host "  已更新: $aekWinBin\\aek-websearch.exe"

Write-Host "[6/6] 确保 %USERPROFILE%\\bin 在当前用户 PATH 中..."
$userBin = Join-Path $env:USERPROFILE "bin"
# 用微软 pave 管理 PATH；未安装则自动 winget 安装
if (!(Get-Command pave -ErrorAction SilentlyContinue)) {{
    Write-Host "  pave 未安装，通过 winget 安装..."
    winget install Microsoft.Pave --accept-source-agreements 2>&1 | Write-Host
}}
pave add $userBin 2>&1 | Write-Host
# 更新当前会话 PATH，方便本轮验证
$env:Path = $userBin + ';' + $env:Path

Write-Host "[✓] 验证..."
& (Join-Path $userBin "aek.exe") version
"""
    run_pwsh(ps_script)
    print("[✓] 部署完成")


if __name__ == "__main__":
    main()