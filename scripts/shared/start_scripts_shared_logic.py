#!/usr/bin/env python3
"""AEK 脚本共享逻辑 - 启动脚本和构建脚本共用的工具函数。

包含：
  - 平台检测 (detect_env, is_win, current_platform)
  - PowerShell / WSL 执行器查找 (find_pwsh, find_wsl_exe)
  - Windows 侧路径计算 (get_win_paths, get_wsl_win_paths)
  - 端口检测与清理 (can_bind, kill_port)
  - 进程管理 (spawn)
  - HTTP 健康检查 (wait_http)
  - 二进制查找 (_find_binary)

核心原则：所有跨 Windows/WSL 的路径都在此模块计算，返回绝对路径，
上层代码不再直接拼 $env:USERPROFILE 或 UNC。
"""
from __future__ import annotations

import os
import platform
import signal
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path
from dataclasses import dataclass


# ──────────────────────────────────────────────────────────────────────────
# 平台检测
# ──────────────────────────────────────────────────────────────────────────

def detect_env() -> str:
    """返回: 'wsl' / 'windows' / 'linux' / 'darwin'"""
    if sys.platform == "win32":
        return "windows"
    if sys.platform == "darwin":
        return "darwin"
    if sys.platform.startswith("linux"):
        if os.environ.get("WSL_DISTRO_NAME"):
            return "wsl"
        try:
            with open("/proc/version", "r", encoding="utf-8", errors="ignore") as f:
                if "microsoft" in f.read().lower():
                    return "wsl"
        except FileNotFoundError:
            pass
        return "linux"
    return sys.platform


def is_win() -> bool:
    """是否 Windows 环境（原生 Windows；WSL 不算）。"""
    return sys.platform == "win32"


def current_platform() -> tuple[str, str]:
    """返回 (goos, goarch)。"""
    if sys.platform == "win32":
        goos = "windows"
    elif sys.platform == "darwin":
        goos = "darwin"
    else:
        goos = "linux"
    machine = platform.machine().lower()
    if machine in ("x86_64", "amd64"):
        goarch = "amd64"
    elif machine in ("aarch64", "arm64"):
        goarch = "arm64"
    else:
        goarch = machine
    return goos, goarch


def py_exe() -> str:
    """返回当前 Python 解释器路径。"""
    return sys.executable


# ──────────────────────────────────────────────────────────────────────────
# PowerShell / WSL 执行器查找
# ──────────────────────────────────────────────────────────────────────────

def find_pwsh() -> str | None:
    """在 WSL 中找 Windows PowerShell（pwsh 7 优先）。"""
    if detect_env() != "wsl":
        return None
    try:
        r = subprocess.run(
            ["/mnt/c/Windows/System32/where.exe", "pwsh"],
            capture_output=True, text=True, timeout=5,
        )
        for line in r.stdout.strip().splitlines():
            p = line.strip()
            if p and Path(p).exists():
                return p
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass
    for p in [
        "/mnt/c/Program Files/PowerShell/7/pwsh.exe",
        "/mnt/c/Program Files (x86)/PowerShell/7/pwsh.exe",
    ]:
        if Path(p).exists():
            return p
    return None


def find_wsl_exe() -> str | None:
    """在 Windows 中找 wsl.exe。"""
    if detect_env() != "windows":
        return None
    try:
        r = subprocess.run(
            ["where.exe", "wsl"],
            capture_output=True, text=True, timeout=5,
        )
        for line in r.stdout.strip().splitlines():
            p = line.strip()
            if p and Path(p).exists():
                return p
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass
    return None


def get_win_user_profile_via_pwsh(pwsh: str) -> str:
    """通过 pwsh 获取 Windows USERPROFILE 的绝对路径。"""
    r = run_pwsh_cmd(pwsh, "$env:USERPROFILE", timeout=10)
    out = r.stdout.strip()
    if not out:
        raise RuntimeError(f"无法获取 Windows USERPROFILE: {r.stderr}")
    return out


def windows_path_to_wsl(win_path: str) -> Path:
    """把 Windows 路径（C:\\Users\\...）转为 WSL 挂载路径（/mnt/c/Users/...）。"""
    if not win_path or len(win_path) < 3:
        return Path(win_path)
    drive = win_path[0].lower()
    rest = win_path[2:].replace("\\", "/")
    return Path(f"/mnt/{drive}{rest}")


def wsl_path_to_windows(wsl_path: str) -> str:
    """把 WSL 挂载路径（/mnt/c/Users/...）转为 Windows 路径（C:\\Users\\...）。"""
    if not wsl_path.startswith("/mnt/"):
        return wsl_path
    parts = wsl_path.split("/")
    if len(parts) < 3:
        return wsl_path
    drive = parts[2][0].upper()
    rest = "\\".join(parts[3:])
    return f"{drive}:\\{rest}"


# ──────────────────────────────────────────────────────────────────────────
# WSL → Windows pwsh 执行器（唯一入口）
# ──────────────────────────────────────────────────────────────────────────
# 铁律：禁止 -NoProfile。项目规则要求保留 Windows 端 profile（PATH 等副作用）。
# 所有「从 WSL 丢脚本给 Windows pwsh 原生执行」的代码都必须走这里，
# 不要在业务脚本里直接 subprocess.run([pwsh, "-Command", ...])。

_PWSH_DEFAULT_TIMEOUT = 600  # 秒；覆盖 go build / pnpm install / stage 等长任务


class PwshResult:
    """pwsh -Command 的返回值。调用方按需消费 stdout/stderr 或调 check()。"""

    def __init__(self, args: tuple, stdout: str, stderr: str, returncode: int):
        self.args = args
        self.stdout = stdout
        self.stderr = stderr
        self.returncode = returncode

    def check(self, label: str = "pwsh command") -> "PwshResult":
        """非零退出码则抛 CalledProcessError（等价 subprocess check=True）。"""
        if self.returncode != 0:
            raise subprocess.CalledProcessError(
                self.returncode, list(self.args),
                output=self.stdout, stderr=self.stderr,
            )
        return self

    def ok(self) -> bool:
        return self.returncode == 0

    @property
    def timed_out(self) -> bool:
        """run_pwsh_cmd 把超时转成 returncode=-1；用此判断是否超时。"""
        return self.returncode == -1


def run_pwsh_cmd(
    pwsh: str,
    command: str,
    *,
    timeout: int | None = _PWSH_DEFAULT_TIMEOUT,
    no_profile: bool = False,
) -> PwshResult:
    """从 WSL 调用 Windows pwsh 原生执行脚本，返回 PwshResult（不抛异常）。

    参数
    ----
    pwsh:      pwsh.exe 路径（用 find_pwsh() 获取，不要硬编码）。
    command:   要执行的 PowerShell 脚本/表达式。
    timeout:   秒；None 表示不超时。默认 600s。
    no_profile: **禁止在业务代码里设为 True**。此处仅为该旋钮集中一处，
                并默认 False，以强制遵守「禁止 -NoProfile」铁律。
    """
    if not pwsh:
        raise RuntimeError("pwsh 为空：请先 find_pwsh()")
    args = [pwsh]
    if no_profile:
        args.append("-NoProfile")
    args += ["-Command", command]
    try:
        r = _run_pwsh_raw(tuple(args), timeout)
    except subprocess.TimeoutExpired as e:
        # 不抛异常：把超时转成 PwshResult，returncode 用 -1 表示超时
        # 调用方用 r.returncode 或 r.timed_out 判断；上层 run_pwsh_on_windows 负责报错
        stderr = (e.stderr or "").decode("utf-8", errors="replace") if isinstance(e.stderr, bytes) else (e.stderr or "")
        stdout = (e.stdout or "").decode("utf-8", errors="replace") if isinstance(e.stdout, bytes) else (e.stdout or "")
        return PwshResult(
            args=tuple(args),
            stdout=stdout,
            stderr=stderr or f"[timeout after {timeout}s]",
            returncode=-1,
        )
    return PwshResult(
        args=tuple(args),
        stdout=r.stdout,
        stderr=r.stderr,
        returncode=r.returncode,
    )


def _run_pwsh_raw(args: tuple, timeout: int | None) -> subprocess.CompletedProcess:
    """底层 subprocess 调用：捕获输出、可超时。

    不用 text=True —— Windows pwsh 默认用 cp1252，UTF-8 解码会崩。
    改为捕获 bytes 后手动 decode(errors="replace")，保证任何输出都能处理。
    """
    cp = subprocess.run(
        list(args),
        capture_output=True,
        timeout=timeout,
    )
    return subprocess.CompletedProcess(
        args=list(args),
        returncode=cp.returncode,
        stdout=(cp.stdout or b"").decode("utf-8", errors="replace"),
        stderr=(cp.stderr or b"").decode("utf-8", errors="replace"),
    )


def run_pwsh_on_windows(
    command: str,
    *,
    label: str = "pwsh",
    timeout: int | None = _PWSH_DEFAULT_TIMEOUT,
    fail_on_error: bool = True,
    pwsh: str | None = None,
) -> PwshResult:
    """高层便捷：自动 find_pwsh() 并执行，失败时抛 RuntimeError（除非 fail_on_error=False）。

    用于「失败即中断」的部署步骤。需要细粒度错误消息/消费 stdout 的场合，
    请改用 run_pwsh_cmd()。
    """
    pwsh = pwsh or find_pwsh()
    if not pwsh:
        raise RuntimeError("找不到 pwsh.exe（WSL 侧？）")
    try:
        r = run_pwsh_cmd(pwsh, command, timeout=timeout)
    except subprocess.TimeoutExpired as e:
        raise RuntimeError(f"{label} 超时（{timeout}s）: {e}") from e
    if r.returncode != 0:
        msg = f"{label} 失败（exit={r.returncode}）\nstdout: {r.stdout[-500:]}\nstderr: {r.stderr[-300:]}"
        if fail_on_error:
            raise RuntimeError(msg)
        return r
    return r


# ──────────────────────────────────────────────────────────────────────────
# Windows 侧路径计算（所有跨端路径的唯一真源）
# ──────────────────────────────────────────────────────────────────────────

@dataclass
class WinPaths:
    """Windows 侧 AEK 相关路径，绝对路径。"""
    user_profile: str              # C:\Users\<user>
    aek_dir: str                   # C:\Users\<user>\.aek
    src_dir: str                   # .aek\src
    packages_dir: str              # .aek\src\packages
    bin_win_dir: str               # .aek\bin\win （旧路径，已废弃）
    npm_bin_dir: str               # 动态获取，可能为空

    def package_dir(self, pkg_dir: str) -> str:
        """某个包在 Windows staging 目录的绝对路径。"""
        return f"{self.packages_dir}\\{pkg_dir}"

    def platform_bin(self, pkg_dir: str, platform: str = "win32-x64",
                     filename: str = "") -> str:
        """某包某平台二进制的绝对路径。"""
        base = f"{self.package_dir(pkg_dir)}\\platforms\\{platform}\\bin"
        return f"{base}\\{filename}" if filename else base


def get_win_paths(pwsh: str) -> WinPaths:
    """获取 Windows 侧全部 AEK 路径（通过 pwsh 查询，返回绝对路径）。"""
    user_profile = get_win_user_profile_via_pwsh(pwsh)

    # 找 npm bin 目录
    find_npm_cmd = """
        $npmRoot = npm root -g
        $npmBin = Split-Path $npmRoot -Parent
        Write-Output $npmBin
    """
    r = run_pwsh_cmd(pwsh, find_npm_cmd, timeout=30)
    npm_bin_dir = r.stdout.strip().splitlines()[0] if r.stdout.strip() else ""

    return WinPaths(
        user_profile=user_profile,
        aek_dir=f"{user_profile}\\.aek",
        src_dir=f"{user_profile}\\.aek\\src",
        packages_dir=f"{user_profile}\\.aek\\src\\packages",
        bin_win_dir=f"{user_profile}\\.aek\\bin\\win",
        npm_bin_dir=npm_bin_dir,
    )


def get_wsl_win_paths(pwsh: str) -> WinPaths:
    """在 WSL 里查询 Windows 路径，并把绝对路径转为 /mnt/... 挂载路径。

    返回的 WinPaths 中所有字段都是 WSL 视角的挂载路径字符串（如 /mnt/c/Users/xdx/.aek）。
    """
    win_paths = get_win_paths(pwsh)
    return WinPaths(
        user_profile=str(windows_path_to_wsl(win_paths.user_profile)),
        aek_dir=str(windows_path_to_wsl(win_paths.aek_dir)),
        src_dir=str(windows_path_to_wsl(win_paths.src_dir)),
        packages_dir=str(windows_path_to_wsl(win_paths.packages_dir)),
        bin_win_dir=str(windows_path_to_wsl(win_paths.bin_win_dir)),
        npm_bin_dir=str(windows_path_to_wsl(win_paths.npm_bin_dir)) if win_paths.npm_bin_dir else "",
    )


def get_wsl_unc_paths(pwsh: str, project_root: Path) -> WinPaths:
    """返回 WSL 项目源码路径的 UNC 格式（供 Windows pwsh 读取）。

    WSL 不碰 /mnt/c/，而是通过 UNC 暴露给 Windows。
    distro 名从 WSL_DISTRO_NAME 环境变量或 wsl.exe 动态获取，不硬编码。
    home 目录从 project_root 推导，不硬编码用户名。
    """
    import os as _os
    import subprocess as _subprocess

    # 动态获取 distro 名
    distro = _os.environ.get("WSL_DISTRO_NAME", "")
    if not distro:
        try:
            r = _subprocess.run(["wsl.exe", "-l", "-q"], capture_output=True, text=True, timeout=5)
            if r.returncode == 0 and r.stdout.strip():
                distro = r.stdout.strip().splitlines()[0]
        except Exception:
            distro = "Linux"

    # 从 project_root 推导 home 目录和相对路径
    # project_root 形如 /home/xdx/CodeRelated/agent-enhance-kit
    parts = project_root.resolve().parts  # ('/', 'home', 'xdx', 'CodeRelated', ...)
    home_user = parts[2] if len(parts) >= 3 else "user"  # 从 /home/<user>/ 提取
    # 相对路径：去掉 /home/<user>/ 前缀，统一用反斜杠（UNC 规范）
    rel_path = str(project_root.resolve().relative_to(Path("/home") / home_user)).replace("/", "\\")
    # UNC 格式
    unc_base = f"\\\\wsl.localhost\\{distro}\\home\\{home_user}"
    unc_project = f"{unc_base}\\{rel_path}"
    return WinPaths(
        user_profile=unc_base,
        aek_dir=f"{unc_base}\\\\.aek",
        src_dir=unc_project,
        packages_dir=f"{unc_project}\\\\packages",
        bin_win_dir="",
        npm_bin_dir="",
    )


def get_win_src_pkg_dir(pkg_dir: str) -> str:
    """便捷：WSL 环境下返回某包在 Windows staging 目录的挂载路径。"""
    pwsh = find_pwsh()
    if not pwsh:
        raise RuntimeError("找不到 pwsh，无法计算 Windows 路径")
    wp = get_wsl_win_paths(pwsh)
    return f"{wp.packages_dir}/{pkg_dir}"


def get_win_platform_bin_dir(pkg_dir: str, platform: str = "win32-x64") -> str:
    """便捷：返回某包某平台在 Windows 侧的二进制目录（WSL 挂载路径）。"""
    pwsh = find_pwsh()
    if not pwsh:
        raise RuntimeError("找不到 pwsh")
    wp = get_wsl_win_paths(pwsh)
    return f"{wp.packages_dir}/{pkg_dir}/platforms/{platform}/bin"


def get_wsl_win_aek_test_dir() -> str:
    """便捷：返回 Windows 端测试目录 $env:USERPROFILE\\.aek\\test 的 WSL 挂载路径。"""
    pwsh = find_pwsh()
    if not pwsh:
        raise RuntimeError("找不到 pwsh")
    wp = get_wsl_win_paths(pwsh)
    return f"{wp.aek_dir}/test"


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


# ──────────────────────────────────────────────────────────────────────────
# Dry-run 路径检查
# ──────────────────────────────────────────────────────────────────────────

def check_win_paths(pwsh: str, pkg_dirs: list[str]) -> int:
    """检查 Windows 侧全部关键路径的存在性，返回错误数。

    用于 --dry-run，纯只读，不做任何修改。
    """
    errors = 0
    print("=== Windows 侧路径检查（dry-run） ===")

    win_paths = get_win_paths(pwsh)
    print(f"  USERPROFILE       : {win_paths.user_profile}")
    print(f"  .aek              : {win_paths.aek_dir}")
    print(f"  .aek\\src          : {win_paths.src_dir}")
    print(f"  .aek\\src\\packages: {win_paths.packages_dir}")
    print(f"  npm bin           : {win_paths.npm_bin_dir}")

    for name, p in [
        ("USERPROFILE", win_paths.user_profile),
        (".aek\\src", win_paths.src_dir),
        (".aek\\src\\packages", win_paths.packages_dir),
        ("npm bin", win_paths.npm_bin_dir),
    ]:
        ok = run_pwsh_cmd(pwsh, f"Test-Path '{p}'", timeout=10).stdout.strip().lower() == "true"
        status = "✓" if ok else "✗"
        if not ok:
            errors += 1
        print(f"  [{status}] {name:<20s} : {p}")

    print("\n  === 各包 staging 目录 ===")
    for pkg_dir in pkg_dirs:
        p = win_paths.package_dir(pkg_dir)
        ok = run_pwsh_cmd(pwsh, f"Test-Path '{p}'", timeout=10).stdout.strip().lower() == "true"
        status = "✓" if ok else "✗"
        if not ok:
            errors += 1
        print(f"  [{status}] {pkg_dir:<20s} : {p}")

        # platforms/win32-x64/bin
        plat_dir = win_paths.platform_bin(pkg_dir, "win32-x64")
        ok_plat = run_pwsh_cmd(pwsh, f"Test-Path '{plat_dir}'", timeout=10).stdout.strip().lower() == "true"
        status_p = "✓" if ok_plat else "○"
        print(f"  [{status_p}]   platforms/win32-x64/bin : {plat_dir}")

    # go 是否可用
    go_ver = run_pwsh_cmd(pwsh, "go version 2>$null", timeout=15).stdout.strip()
    print(f"\n  go version         : {go_ver if go_ver else '(未安装)'}")

    # pnpm 是否可用
    pnpm_out = run_pwsh_cmd(pwsh, "pnpm --version 2>$null", timeout=15).stdout.strip()
    pnpm_ver = pnpm_out.splitlines()[0] if pnpm_out else ""
    print(f"  pnpm version     : {pnpm_ver if pnpm_ver else '(未安装)'}")

    print(f"\n=== 检查完成，{errors} 个错误 ===")
    return errors
