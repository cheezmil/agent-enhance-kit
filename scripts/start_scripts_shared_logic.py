#!/usr/bin/env python3
# Shared logic for AEK start scripts / AEK 启动脚本的共享逻辑

import os
import sys
import subprocess
import shutil
import time
import socket
import urllib.request
from pathlib import Path
from typing import List, Optional

# ===== Config / 配置 =====

# Project root / 项目根目录
SCRIPTS_DIR = Path(__file__).parent.resolve()
PROJECT_ROOT = SCRIPTS_DIR.parent

# aek-mcp package dir / aek-mcp 包目录
AEK_MCP_DIR = PROJECT_ROOT / "packages" / "aek-mcp"

# aek-mcp backend port / aek-mcp 后端端口（从settings.jsonc读取，fallback 1351）
AEK_MCP_PORT = 1351

# Required Go version / 需要的 Go 版本
REQUIRED_GO_VERSION = ""


def is_win() -> bool:
    """Check if running on Windows"""
    return sys.platform == "win32"


def get_win_shell() -> str:
    """Get available Windows shell (pwsh > powershell)"""
    for shell in ["pwsh", "powershell"]:
        if shutil.which(shell):
            return shell
    return "powershell"


def run(cmd: List[str], cwd: Optional[Path] = None, env: Optional[dict] = None,
        capture: bool = False, shell: Optional[bool] = None) -> subprocess.CompletedProcess:
    """Run command synchronously"""
    if shell is None:
        shell = is_win()
    merged_env = os.environ.copy()
    if env:
        merged_env.update(env)
    return subprocess.run(cmd, cwd=cwd, env=merged_env, capture_output=capture,
                         text=True, shell=shell, check=True)


def run_safe(cmd: List[str], cwd: Optional[Path] = None, env: Optional[dict] = None,
             shell: Optional[bool] = None) -> subprocess.CompletedProcess:
    """Run command synchronously, non-zero exit does not raise"""
    if shell is None:
        shell = is_win()
    merged_env = os.environ.copy()
    if env:
        merged_env.update(env)
    return subprocess.run(cmd, cwd=cwd, env=merged_env, capture_output=False,
                         text=True, shell=shell, check=False)


def find_pids_by_port(port: int) -> set:
    """Find PIDs listening on a port"""
    import psutil
    pids = set()
    try:
        for conn in psutil.net_connections(kind="inet"):
            if conn.laddr.port == port and conn.status == "LISTEN":
                pids.add(conn.pid)
    except (psutil.AccessDenied, psutil.NoSuchProcess):
        pass
    return pids


def kill_port(port: int) -> bool:
    """Kill all processes occupying a port"""
    import psutil
    pids = find_pids_by_port(port)
    if not pids:
        print(f"  Port {port} is free")
        return True
    print(f"  Found {len(pids)} process(es) on port {port}, killing...")
    for pid in pids:
        try:
            p = psutil.Process(pid)
            print(f"  Killing PID {pid} ({p.name()})")
            p.kill()
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass
    time.sleep(1.5)
    remaining = find_pids_by_port(port)
    if remaining:
        print(f"  Warning: {len(remaining)} process(es) still alive on port {port}")
        return False
    print(f"  Port {port} is now free")
    return True


def can_bind(port: int) -> bool:
    """Check if a port is available"""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind(("127.0.0.1", port))
            return True
    except OSError:
        return False


def wait_health(port: int, timeout_s: float = 15.0) -> bool:
    """Wait for server health check to pass"""
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        for host in ["127.0.0.1", "[::1]"]:
            try:
                req = urllib.request.Request(f"http://{host}:{port}/health")
                with urllib.request.urlopen(req, timeout=1.5) as resp:
                    if resp.status == 200:
                        return True
            except Exception:
                pass
        time.sleep(0.3)
    return False
