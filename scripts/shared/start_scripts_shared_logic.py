#!/usr/bin/env python3
"""AEK 脚本共享逻辑 - 启动脚本和构建脚本共用的工具函数。

包含：
  - 端口检测与清理 (can_bind, kill_port)
  - 进程管理 (spawn)
  - HTTP 健康检查 (wait_http)
  - 二进制查找 (_find_binary)
  - 平台检测辅助 (is_win, py_exe)
"""
from __future__ import annotations

import os
import signal
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path


# ──────────────────────────────────────────────────────────────────────────
# 平台检测
# ──────────────────────────────────────────────────────────────────────────

def is_win() -> bool:
    """是否 Windows 环境（WSL win32 或原生 Windows）。"""
    return sys.platform == "win32"


def py_exe() -> str:
    """返回当前 Python 解释器路径。"""
    return sys.executable


# ──────────────────────────────────────────────────────────────────────────
# 端口工具
# ──────────────────────────────────────────────────────────────────────────

def can_bind(port: int) -> bool:
    """检查端口是否可用（未被占用）。"""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            s.bind(("0.0.0.0", port))
            return True
    except OSError:
        return False


def kill_port(port: int) -> bool:
    """杀掉占用指定端口的进程，等待端口释放。"""
    if can_bind(port):
        return True

    pids: set[int] = set()
    try:
        import psutil  # type: ignore
        for conn in psutil.net_connections(kind="inet"):
            laddr = getattr(conn, "laddr", None)
            laddr_port = getattr(laddr, "port", None)
            if laddr_port == port and conn.status == "LISTEN" and conn.pid:
                pids.add(conn.pid)
    except ImportError:
        # 没有 psutil 时的回退方案
        if is_win():
            out = subprocess.run(
                ["netstat", "-ano"], capture_output=True, text=True
            ).stdout
            for line in out.splitlines():
                if f":{port}" in line and "LISTENING" in line:
                    parts = line.split()
                    if parts and parts[-1].isdigit():
                        pids.add(int(parts[-1]))
        else:
            out = subprocess.run(
                ["lsof", "-ti", f":{port}"], capture_output=True, text=True
            ).stdout
            for tok in out.split():
                if tok.strip().isdigit():
                    pids.add(int(tok.strip()))

    for pid in pids:
        print(f"  Killing PID {pid} on port {port}")
        try:
            if is_win():
                subprocess.run(["taskkill", "/F", "/PID", str(pid)], check=False)
            else:
                os.kill(pid, signal.SIGTERM)
        except Exception:
            pass

    for _ in range(20):
        time.sleep(0.5)
        if can_bind(port):
            print(f"  Port {port} is now free")
            return True

    print(f"  Warning: port {port} still occupied")
    return False


# ──────────────────────────────────────────────────────────────────────────
# 进程管理
# ──────────────────────────────────────────────────────────────────────────

def spawn(cmd: list[str], cwd: Path, env: dict | None = None) -> subprocess.Popen:
    """启动一个后台进程（在 Windows 上会脱离父进程）。"""
    merged_env = os.environ.copy()
    if env:
        merged_env.update(env)
    merged_env["PYTHONUNBUFFERED"] = "1"
    if is_win():
        flags = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
        return subprocess.Popen(
            cmd, cwd=str(cwd), env=merged_env, creationflags=flags,
        )
    return subprocess.Popen(cmd, cwd=str(cwd), env=merged_env, start_new_session=True)


# ──────────────────────────────────────────────────────────────────────────
# HTTP 健康检查
# ──────────────────────────────────────────────────────────────────────────

def wait_http(port: int, path: str = "/", timeout_s: float = 30.0,
              ok_codes: tuple = (200, 404)) -> bool:
    """等待 HTTP 服务就绪。"""
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        try:
            req = urllib.request.Request(f"http://127.0.0.1:{port}{path}")
            with urllib.request.urlopen(req, timeout=1.5) as resp:
                if resp.status in ok_codes:
                    return True
        except Exception:
            pass
        time.sleep(0.5)
    return False


# ──────────────────────────────────────────────────────────────────────────
# 二进制查找
# ──────────────────────────────────────────────────────────────────────────

def _find_binary(dirpath: Path, names: list[str]) -> Path | None:
    """在指定目录中查找第一个存在的可执行文件（自动处理 .exe 后缀）。"""
    ext = ".exe" if is_win() else ""
    for name in names:
        for candidate in (dirpath / f"{name}{ext}", dirpath / name):
            if candidate.exists():
                return candidate
    return None
