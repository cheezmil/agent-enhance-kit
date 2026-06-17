#!/usr/bin/env python3
"""
用途：在 WSL 中执行，将 aek-websearch 安装到 Windows 全局 npm
使用：python3 scripts/aek-websearch/for-wsl/install-aek-to-windows.py
"""

import subprocess
import shutil
import os
import sys

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
    src = f"\\\\wsl.localhost\\{distro}\\home\\{user}\\CodeRelated\\agent-enhance-kit\\packages\\aek-websearch"

    print(f"[1/5] Building in WSL...")
    pkg_dir = f"/home/{user}/CodeRelated/agent-enhance-kit/packages/aek-websearch"
    subprocess.run(["go", "build", "-o", "bin/aek.exe", "./cmd/aek/"], cwd=pkg_dir, check=True)

    print(f"[2/5] 复制到 Windows 临时目录...")
    print(f"  源: {src}")

    ps_script = f"""
$src = "{src}"
$dest = Join-Path $env:TEMP "aek-websearch"
if (Test-Path $dest) {{ Remove-Item $dest -Recurse -Force }}
Copy-Item $src $dest -Recurse
Write-Host "[3/5] npm uninstall -g aek-websearch (if exists)..."
npm uninstall -g aek-websearch 2>$null
Write-Host "[4/5] npm install -g..."
Set-Location $env:TEMP
npm install -g $dest 2>&1 | Write-Host
Write-Host "[5/5] 复制 aek.exe 到用户 bin 目录..."
$userBin = Join-Path $env:USERPROFILE "bin"
if (!(Test-Path $userBin)) {{ New-Item -ItemType Directory -Path $userBin | Out-Null }}
$aekExe = Join-Path $dest "bin" "aek.exe"
if (Test-Path $aekExe) {{ Copy-Item $aekExe $userBin -Force }}
Write-Host "[✓] 验证..."
& (Join-Path $userBin "aek.exe") version
"""
    run_pwsh(ps_script)
    print("[✓] 安装完成")

if __name__ == "__main__":
    main()
