#!/usr/bin/env python3
# Shared logic for AEK build scripts / AEK 构建脚本的共享逻辑

import os
import sys
import subprocess
import shutil
from pathlib import Path
from typing import List, Optional

# Project root directory / 项目根目录
SCRIPTS_DIR = Path(__file__).parent.resolve()
PROJECT_ROOT = SCRIPTS_DIR.parent


def is_win() -> bool:
    """Check if running on Windows / 检测是否在 Windows 上运行"""
    return sys.platform == "win32"


def get_win_shell() -> str:
    """Get available Windows shell (pwsh > powershell) / 获取可用的 Windows shell"""
    for shell in ["pwsh", "powershell"]:
        if shutil.which(shell):
            return shell
    return "powershell"


def run(cmd: List[str], cwd: Optional[Path] = None, env: Optional[dict] = None,
        capture: bool = False, shell: Optional[bool] = None) -> subprocess.CompletedProcess:
    """Run command synchronously / 同步执行命令"""
    if shell is None:
        shell = is_win()
    merged_env = os.environ.copy()
    if env:
        merged_env.update(env)
    return subprocess.run(cmd, cwd=cwd, env=merged_env, capture_output=capture,
                         text=True, shell=shell, check=True)


def run_safe(cmd: List[str], cwd: Optional[Path] = None, env: Optional[dict] = None,
             shell: Optional[bool] = None) -> subprocess.CompletedProcess:
    """Run command synchronously without raising on non-zero exit / 同步执行命令，非零退出码不抛异常"""
    if shell is None:
        shell = is_win()
    merged_env = os.environ.copy()
    if env:
        merged_env.update(env)
    return subprocess.run(cmd, cwd=cwd, env=merged_env, capture_output=False,
                         text=True, shell=shell, check=False)


def get_platform_key() -> str:
    """Get platform key like linux-x64, darwin-arm64, win32-x64 / 获取平台标识"""
    os_map = {"win32": "win32", "darwin": "darwin", "linux": "linux"}
    arch_map = {"arm64": "arm64"}
    os_name = os_map.get(sys.platform, "linux")
    cpu = arch_map.get(__import__("platform").machine(), "x64")
    return f"{os_name}-{cpu}"


def get_ext() -> str:
    """Get executable extension / 获取可执行文件扩展名"""
    return ".exe" if is_win() else ""


def ensure_dir(path: Path) -> Path:
    """Ensure directory exists / 确保目录存在"""
    path.mkdir(parents=True, exist_ok=True)
    return path


def copy_file(src: Path, dst: Path) -> None:
    """Copy file and set permissions / 复制文件并设置权限"""
    shutil.copy2(src, dst)
    if not is_win():
        dst.chmod(0o755)
