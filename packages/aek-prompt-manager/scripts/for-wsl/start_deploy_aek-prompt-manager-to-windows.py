#!/usr/bin/env python3
"""
在 WSL 中执行，将 @cheezmil/aek-prompt-manager 部署到 Windows
使用：python3 packages/aek-prompt-manager/scripts/for-wsl/start_deploy_aek-prompt-manager-to-windows.py
"""

import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent.parent.parent  # -> 项目根
PKG_DIR = PROJECT_ROOT / "packages" / "aek-prompt-manager"


def get_wsl_distro():
    distro = __import__('os').environ.get("WSL_DISTRO_NAME")
    if not distro:
        print("[✗] 找不到 WSL 发行版名，请设置 WSL_DISTRO_NAME 环境变量")
        sys.exit(1)
    return distro


def get_wsl_user():
    user = __import__('os').environ.get("USER") or __import__('os').environ.get("USERNAME")
    if not user:
        print("[✗] 找不到用户名，请设置 USER 或 USERNAME 环境变量")
        sys.exit(1)
    return user


def wsl_path_to_unc(path: Path, distro: str) -> str:
    """把 WSL 绝对路径转成 wsl.localhost UNC 路径。"""
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
        if Path(p).exists():
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

    # 推导 UNC 路径
    src = wsl_path_to_unc(PKG_DIR, distro)
    print(f"  包目录: {PKG_DIR}")
    print(f"  UNC源: {src}")

    ps_script = """
$ErrorActionPreference = 'Stop'

Write-Host "[1/3] 更新 @cheezmil/aek-prompt-manager 到最新版本..."
npm install -g @cheezmil/aek-prompt-manager@latest 2>&1 | Write-Host

Write-Host "[2/3] 确保 npm 全局路径已加入用户 PATH..."
$npmPrefix = (npm config get prefix)
$userPath = [Environment]::GetEnvironmentVariable('PATH', 'User')
if ($userPath -notlike "*$npmPrefix*") {
    [Environment]::SetEnvironmentVariable('PATH', $userPath + ";$npmPrefix", 'User')
    Write-Host "  已添加 $npmPrefix 到用户 PATH"
} else {
    Write-Host "  npm 路径已在用户 PATH 中"
}

Write-Host "[3/3] 验证 aekpm 命令..."
$cmd = Get-Command aekpm -ErrorAction SilentlyContinue
if ($cmd) {
    Write-Host "  [✓] aekpm 已就绪: $($cmd.Source)"
} else {
    Write-Host "  [!] aekpm 未找到，可能需要在当前终端刷新 PATH"
    Write-Host "      提示: 新开一个 PowerShell 窗口后运行 aekpm --help"
}
"""

    run_pwsh(ps_script)
    print("\n[✓] 部署完成")
    print("  提示: 请在新开 PowerShell 窗口中运行 `aekpm --help` 验证")


if __name__ == "__main__":
    main()
