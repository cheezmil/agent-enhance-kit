#!/usr/bin/env python3
"""AEK 脚本共享逻辑 - 启动脚本和构建脚本共用的工具函数。

包含：
  - 平台检测 (detect_env, is_win, current_platform)
  - 工具链发现 (find_go, go_mod_required_version)
  - PowerShell / WSL 执行器查找 (find_pwsh, find_wsl_exe)
  - 全局安装路径 (pnpm_global_bin_dir)
  - 测试目录 (get_aek_test_dir)
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
import re
import shutil
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
# 工具链发现（Go / pnpm）
#
# 铁律：路径一律动态发现，禁止硬编码。
# 典型坑：/usr/bin/go 可能是 go1.18，而 go.mod 写的是 `go 1.26.4`，
#        直接 go build 会得到 invalid go version '1.26.4': must match format 1.23。
# ──────────────────────────────────────────────────────────────────────────

def go_mod_required_version(pkg_dir: Path) -> str | None:
    """读 go.mod 的 `go X.Y.Z` 指令，返回版本字符串；没有 go.mod 返回 None。"""
    gm = pkg_dir / "go.mod"
    if not gm.is_file():
        return None
    try:
        for line in gm.read_text(encoding="utf-8", errors="ignore").splitlines():
            parts = line.strip().split()
            if len(parts) == 2 and parts[0] == "go":
                return parts[1]
    except OSError:
        return None
    return None


def _parse_go_ver(s: str) -> tuple[int, ...]:
    """'1.26.4' -> (1, 26, 4)；解析不出时返回 (0, 0, 0)。"""
    m = re.match(r"(\d+)(?:\.(\d+))?(?:\.(\d+))?", s.strip())
    if not m:
        return (0, 0, 0)
    return tuple(int(x) for x in m.groups()) + (0,) * (3 - len(m.groups()))


def find_go(required: str | None = None) -> str:
    """动态发现 Go 工具链，返回可用的 go 可执行路径。

    required 不满足的候选直接排除；全部不满足时抛错并列出已发现的版本，
    避免 go1.18 之类的旧工具链悄悄编译失败。
    """
    home = Path.home()
    candidates: list[str] = []
    which = shutil.which("go")
    if which:
        candidates.append(which)
    for pat in ("go*/bin/go", ".local/go*/bin/go", ".local/bin/go"):
        candidates.extend(str(p) for p in home.glob(pat))
    candidates.extend([
        "/usr/local/go/bin/go",
        "/usr/lib/go/bin/go",
    ])
    candidates.extend(str(p) for p in Path("/usr/lib").glob("go-*/bin/go"))

    seen: set[str] = set()
    found: list[tuple[tuple[int, ...], str]] = []
    for c in candidates:
        rp = str(Path(c).expanduser())
        if rp in seen or not os.path.isfile(rp):
            continue
        seen.add(rp)
        try:
            out = subprocess.run([rp, "version"], capture_output=True, text=True, timeout=10).stdout
        except (OSError, subprocess.TimeoutExpired):
            continue
        m = re.search(r"go(\d+\.\d+(?:\.\d+)?)", out)
        if not m:
            continue
        found.append((_parse_go_ver(m.group(1)), rp))
    found.sort(key=lambda t: t[0], reverse=True)

    if not found:
        raise RuntimeError("找不到 Go 工具链（PATH 及常见安装位置都没有可用的 go）")

    if required:
        need = _parse_go_ver(required)
        ok = [(v, p) for v, p in found if v >= need]
        if ok:
            return ok[0][1]
        have = ", ".join(f"{p} (go{'.'.join(str(x) for x in v)})" for v, p in found)
        raise RuntimeError(
            f"go.mod 要求 go {required}，但没有满足该版本的工具链。\n"
            f"  已发现: {have}"
        )
    return found[0][1]


def pnpm_global_bin_dir() -> Path:
    """返回 pnpm 全局 bin 目录（必须在 PATH 中，否则 pnpm add -g 直接报错退出）。

    优先 $PNPM_HOME，其次 PATH 里已有的 ~/.local/bin、~/bin。
    一律不做任何 PATH 修改（项目铁律：不准永久修改 PATH）。
    """
    path_dirs = [d for d in os.environ.get("PATH", "").split(os.pathsep) if d]
    home = Path.home()

    env_pnpm_home = os.environ.get("PNPM_HOME")
    if env_pnpm_home and Path(env_pnpm_home).is_dir() and str(Path(env_pnpm_home)) in path_dirs:
        return Path(env_pnpm_home)

    for c in (home / ".local" / "bin", home / "bin"):
        if str(c) in path_dirs and c.is_dir():
            return c

    raise RuntimeError(
        "PATH 中找不到可用的 pnpm 全局 bin 目录（$PNPM_HOME / ~/.local/bin / ~/bin 都不在 PATH）。\n"
        "  本脚本不修改 PATH（项目铁律），请自行把其中一个加入 PATH 后重试。"
    )


def pnpm_global_config_args() -> list[str]:
    """返回 pnpm 全局安装/卸载需要的 --config.global-bin-dir 参数（可能为空列表）。

    pnpm 要求 global bin dir 在 PATH 中，否则报
    ERR_PNPM_GLOBAL_BIN_DIR_NOT_IN_PATH 并直接退出。取不到目录时返回空列表，
    让 pnpm 用它自己的默认目录（调用方自行判断失败）。
    """
    try:
        return [f"--config.global-bin-dir={pnpm_global_bin_dir()}"]
    except RuntimeError:
        return []


def get_aek_test_dir() -> Path:
    """返回测试目录 ~/.aek/test（项目铁律：改完代码必须在这里测）。"""
    d = Path.home() / ".aek" / "test"
    d.mkdir(parents=True, exist_ok=True)
    return d


# ──────────────────────────────────────────────────────────────────────────
# PowerShell / WSL 执行器查找
# ──────────────────────────────────────────────────────────────────────────

def find_pwsh() -> str | None:
    """在 WSL 中找到 Windows 的 PowerShell，pwsh 7 优先，没有就用 Windows PowerShell 5。

    按项目约定直接硬编码 /mnt/c 绝对路径，不做 where.exe 探测。
    这些路径只用于在 WSL 里拉起 pwsh 进程，不用于任何文件读写。
    """
    if detect_env() != "wsl":
        return None
    candidates = [
        # pwsh 7（优先）
        "/mnt/c/Program Files/PowerShell/7/pwsh.exe",
        "/mnt/c/Program Files (x86)/PowerShell/7/pwsh.exe",
        # Windows PowerShell 5（兜底）
        "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe",
    ]
    for p in candidates:
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

# 从 WSL 调 pwsh 时，继承下来的 CWD 是 UNC 路径（\\wsl.localhost\...）。
# pnpm 遇到这种 CWD 会直接 panic 退出：
#   Main thread panicked: current dir is an absolute path with drive letter
# 所以统一先切到 $env:USERPROFILE（Windows 原生盘符路径，不含用户名硬编码）。
# 需要其他工作目录的调用方自己再 Set-Location —— 现有调用方都传绝对路径，
# 不依赖继承的 CWD。
_PWSH_SAFE_CWD_PREAMBLE = "Set-Location $env:USERPROFILE\n"


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
) -> PwshResult:
    """从 WSL 调用 Windows pwsh 原生执行脚本，返回 PwshResult（不抛异常）。

    铁律：禁止 -NoProfile（项目规则要求保留 Windows 端 profile）。
    这里连该参数都不提供，从 API 层面杜绝误用。

    参数
    ----
    pwsh:    pwsh.exe 路径（用 find_pwsh() 获取，不要硬编码）。
    command: 要执行的 PowerShell 脚本/表达式。
    timeout: 秒；None 表示不超时。默认 600s。
    """
    if not pwsh:
        raise RuntimeError("pwsh 为空：请先 find_pwsh()")
    args = [pwsh, "-Command", _PWSH_SAFE_CWD_PREAMBLE + command]
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

    def platform_bin(self, pkg_dir: str, platform: str = "win",
                     filename: str = "") -> str:
        """某包某平台二进制的绝对路径。

        platform 取 linux / macos / win（OS 级），对应
        packages/<pkg>/bin/<platform>/ 布局。
        """
        base = f"{self.package_dir(pkg_dir)}\\bin\\{platform}"
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


def get_win_pnpm_home(pwsh: str) -> str:
    """返回 Windows 侧应设置的 PNPM_HOME（其 bin 子目录必须在 PATH 中）。

    pnpm 的全局 bin 目录 = $PNPM_HOME\\bin，且 pnpm 强制要求该目录在 PATH 中，
    否则报 ERR_PNPM_GLOBAL_BIN_DIR_NOT_IN_PATH 直接退出。

    Windows 的 PATH 里常有一个字面量 "%PNPM_HOME%\\bin"（pnpm 装完就该设的变量，
    实际并没被设），而 %USERPROFILE%\\.local\\bin 通常是真实在 PATH 里的目录，
    所以 PNPM_HOME = %USERPROFILE%\\.local。
    全部由 PowerShell 从 $env:PATH / $env:USERPROFILE 推导，不硬编码任何路径。
    """
    ps = r"""
$prof = $env:USERPROFILE
$preferred = Join-Path $prof '.local\bin'
if ($env:PATH -like "*$preferred*") {
    Split-Path $preferred -Parent
} else {
    $first = $env:PATH -split ';' |
        Where-Object { $_ -and (Test-Path $_ -PathType Container) } |
        Select-Object -First 1
    if ($first) { Split-Path $first -Parent }
}
"""
    r = run_pwsh_cmd(pwsh, ps, timeout=30)
    out = r.stdout.strip().splitlines()
    return out[-1].strip().strip('"') if out else ""


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
        aek_dir=f"{unc_base}\\.aek",
        src_dir=unc_project,
        packages_dir=f"{unc_project}\\packages",
        bin_win_dir="",
        npm_bin_dir="",
    )


def win_join(*parts: str) -> str:
    """拼接 Windows 路径，统一反斜杠。UNC 保留开头的双反斜杠。

    只统一分隔符，不加 \\?\\ 前缀：排除 node_modules 后本仓库最长路径 181 字符，
    远低于 MAX_PATH，没必要走 verbatim；而 \\?\\ 前缀在 pwsh 命令行传输里
    会被吃掉（\\U 被吞），实测会拼出非法路径。
    """
    is_unc = False
    cleaned: list[str] = []
    for part in parts:
        if not part:
            continue
        p = part.replace("/", "\\")
        if p.startswith("\\\\?\\"):
            p = p[4:]
        # 必须先判定 UNC 再剥前缀，否则 UNC 会退化成普通主机名路径
        if p.startswith("\\\\"):
            is_unc = True
            p = p.lstrip("\\")
            if p.startswith("UNC\\"):   # \\?\UNC\host\share 形式
                p = p[4:]
        else:
            p = p.lstrip("\\")
        p = p.rstrip("\\")
        if p:
            cleaned.append(p)
    return ("\\\\" if is_unc else "") + "\\".join(cleaned)


def run_windows_python(
    pwsh: str,
    script_path: str = "",
    args: list[str] | None = None,
    *,
    repo_root_unc: str = "",
    timeout: int | None = _PWSH_DEFAULT_TIMEOUT,
) -> PwshResult:
    """让 Windows 上的 Python 执行一个脚本 —— WSL 侧不写任何 pwsh 代码。

    模式：WSL Python 只负责「拉起进程」，真正的逻辑写在 .py 脚本里，
    在 Windows 侧以 sys.platform == "win32" 分支运行。这样跨端逻辑是
    一份 Python 代码，而不是 Python 拼 PowerShell 字符串。

    script_path 传 UNC 绝对路径，例如双反斜杠开头的 \\wsl.localhost 视图。
    """
    import shlex as _shlex

    # script_path 为空时从 repo_root_unc 推导 —— 让 build_deploy.py 把自己
    # （本仓库内的脚本）作为 Windows 侧执行的入口，不用另写 .py。
    if not script_path:
        if not repo_root_unc:
            raise ValueError("run_windows_python: script_path 与 repo_root_unc 至少要一个")
        script_path = win_join(repo_root_unc, "scripts", "build_deploy.py")

    py = "python " + _shlex.quote(script_path)
    for a in (args or []):
        py += " " + _shlex.quote(a)
    return run_pwsh_cmd(pwsh, py, timeout=timeout)


def copy_tree_excluding(src: str, dst: str, exclude: set) -> int:
    """递归复制目录树，顶层按目录名排除。返回复制的条目数。

    不用 shutil.copytree 的原因：它的 ignore 只跳过文件和空目录，遇到非空的
    node_modules 会先建目录再报"already exists"，没法"整棵子树不碰"。
    源/目的路径应为 win_join() 规范化后的普通 UNC/盘符路径。
    """
    import os as _os
    import shutil as _shutil

    _os.makedirs(dst, exist_ok=True)
    count = 0
    with _os.scandir(src) as it:
        for entry in it:
            if entry.name in exclude:
                continue
            dst_child = win_join(dst, entry.name)
            if entry.is_dir(follow_symlinks=False):
                _os.makedirs(dst_child, exist_ok=True)
                count += copy_tree_excluding(entry.path, dst_child, exclude)
            elif entry.is_symlink():
                if _os.path.lexists(dst_child):
                    _os.unlink(dst_child)
                _os.symlink(_os.readlink(entry.path), dst_child)
                count += 1
            elif entry.is_file(follow_symlinks=False):
                _shutil.copy2(entry.path, dst_child)
                count += 1
            # socket/fifo/device 跳过
    return count


# ──────────────────────────────────────────────────────────────
# Windows 侧操作（纯 Python，不含任何 pwsh 代码）
#
# build_deploy.py 通过 --win-* 自派发调用这些函数：它在自己身上加
# --win-stage / --win-pnpm-install / --win-shims，用 run_windows_python()
# 让 Windows 上的 python 重新执行本脚本，由这些函数干活。
# WSL 侧脚本本身不需要碰 /mnt/ 也不需要写 pwsh 脚本。
# ──────────────────────────────────────────────────────────────

WIN_PEER_EXCLUDE_DIRS = {"node_modules", ".git", "build", "__pycache__", ".venv", ".next"}


def _reset_win_stdio_utf8() -> None:
    """Windows 控制台默认 GBK，中文和勾号会 UnicodeEncodeError，强制切 UTF-8。"""
    import sys as _sys
    for _s in (_sys.stdout, _sys.stderr):
        try:
            _s.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass


def win_peer_workspace_root() -> str:
    """Windows workspace 根：%USERPROFILE%\\.aek\\src（不硬编码用户名）。"""
    return win_join(os.path.expanduser("~"), ".aek", "src")


def win_stage(repo_root: str, pkgs: list[str] | None = None) -> int:
    """把 WSL 仓库源码 stage 到 Windows workspace。Windows 侧执行。

    repo_root 是仓库根的 UNC 绝对路径；pkgs 为 None 时复制全部包。
    顺带复制仓库根的 package.json / pnpm-workspace.yaml —— workspace 定义
    的唯一真相来源，pnpm 不认 package.json 里的 workspaces 字段。
    """
    import json as _json
    import shutil as _shutil

    _reset_win_stdio_utf8()
    src_root = win_join(repo_root)
    win_root = win_peer_workspace_root()
    os.makedirs(win_root, exist_ok=True)

    for name in ("package.json", "pnpm-workspace.yaml"):
        s = win_join(src_root, name)
        if os.path.isfile(s):
            d = win_join(win_root, name)
            try:
                _shutil.copy2(s, d)
                print(f"  [stage] {name} -> {d}")
            except Exception as e:
                print(f"  [stage] ! 复制 {name} 失败: {e}", file=sys.stderr)

    packages_src = win_join(src_root, "packages")
    packages_dst = win_join(win_root, "packages")
    os.makedirs(packages_dst, exist_ok=True)

    ok = fail = 0
    for entry in sorted(os.scandir(packages_src), key=lambda e: e.name):
        if not entry.is_dir(follow_symlinks=False):
            continue
        if pkgs and entry.name not in pkgs:
            continue

        # dist/ 保留规则：没有 build 脚本的纯源码包不传 dist
        excl = set(WIN_PEER_EXCLUDE_DIRS)
        pj = win_join(entry.path, "package.json")
        if os.path.isfile(pj):
            try:
                meta = _json.load(open(pj, encoding="utf-8"))
                if not meta.get("scripts", {}).get("build"):
                    excl.add("dist")
            except Exception:
                pass

        dst = win_join(packages_dst, entry.name)
        if os.path.lexists(dst):
            _win_rmtree(dst)
        try:
            n = copy_tree_excluding(entry.path, dst, excl)
        except Exception as e:
            print(f"  [stage] ✗ {entry.name}: {e}", file=sys.stderr)
            fail += 1
            continue

        # staging 只给 Windows 用：剔掉 bin/linux、bin/macos 这类平台目录
        bin_dir = win_join(dst, "bin")
        if os.path.isdir(bin_dir):
            for sub in sorted(os.scandir(bin_dir), key=lambda e: e.name):
                if sub.is_dir(follow_symlinks=False) and sub.name != "win":
                    _win_rmtree(win_join(bin_dir, sub.name))

        print(f"  [stage] {entry.name} -> {dst}  ({n} 条目)")
        ok += 1

    print(f"✓ stage 完成：{ok} 成功，{fail} 失败")
    return 0 if fail == 0 else 1


def win_pnpm_install(workspace: str, pnpm_home: str = "", extra_paths: list[str] | None = None) -> int:
    """在 Windows workspace 里跑一次 pnpm install --ignore-scripts。Windows 侧执行。"""
    import subprocess as _subprocess
    import time as _time

    _reset_win_stdio_utf8()
    workspace = os.path.abspath(workspace or win_peer_workspace_root())
    if not os.path.isdir(workspace):
        print(f"[!] workspace 不存在: {workspace}", file=sys.stderr)
        return 1

    env = os.environ.copy()
    for d in (extra_paths or []):
        if d:
            env["PATH"] = d + os.pathsep + env.get("PATH", "")
    if pnpm_home:
        pnpm_home = os.path.abspath(pnpm_home)
        bin_dir = win_join(pnpm_home, "bin")
        os.makedirs(bin_dir, exist_ok=True)
        env["PNPM_HOME"] = pnpm_home
        if bin_dir not in env["PATH"].split(os.pathsep):
            env["PATH"] = bin_dir + os.pathsep + env["PATH"]

    pnpm_cmd = win_resolve_pnpm(env["PATH"])
    if not pnpm_cmd:
        print("[!] PATH 里找不到 pnpm.cmd / pnpm.exe:\n" + env["PATH"][:400], file=sys.stderr)
        return 1

    t0 = _time.time()
    print(f"  [win] pnpm: {pnpm_cmd}")
    print(f"  [win] pnpm install @ {workspace}")
    r = _subprocess.run([pnpm_cmd, "install", "--ignore-scripts"], cwd=workspace,
                        env=env, capture_output=True, text=True,
                        encoding="utf-8", errors="replace")
    if r.stdout:
        print(r.stdout.strip()[-2500:])
    if r.stderr:
        print(r.stderr.strip()[-1500:], file=sys.stderr)
    if r.returncode != 0:
        print(f"[!] pnpm install 失败 rc={r.returncode}", file=sys.stderr)
        return 1
    print(f"✓ pnpm install 完成 ({_time.time() - t0:.1f}s)")
    return 0


def win_resolve_pnpm(path_env: str) -> str:
    """在 PATH 里找可直接 CreateProcess 的 pnpm（优先 .cmd，其次 .exe）。

    Windows 上 pnpm 只有 pnpm.cmd / pnpm.ps1，没有裸 pnpm 可执行体，
    subprocess 直接传 "pnpm" 会 FileNotFoundError，必须解析成带扩展名的路径。
    """
    for d in path_env.split(os.pathsep):
        d = d.strip()
        if not d:
            continue
        for name in ("pnpm.cmd", "pnpm.exe"):
            cand = win_join(d, name)
            if os.path.isfile(cand):
                return cand
    return ""


def win_uninstall_pkgs(names: list[str], pnpm_home: str = "", extra_paths: list[str] | None = None) -> int:
    """在 Windows 端 pnpm remove -g 一批包（尽力而为，缺失不算失败）。Windows 侧执行。

    不用 pwsh 脚本做这事：$LASTEXITCODE / foreach 那套全用 Python 重写。
    """
    import subprocess as _subprocess

    _reset_win_stdio_utf8()
    env = os.environ.copy()
    for d in (extra_paths or []):
        if d:
            env["PATH"] = d + os.pathsep + env.get("PATH", "")
    if pnpm_home:
        pnpm_home = os.path.abspath(pnpm_home)
        bin_dir = win_join(pnpm_home, "bin")
        os.makedirs(bin_dir, exist_ok=True)
        env["PNPM_HOME"] = pnpm_home
        if bin_dir not in env["PATH"].split(os.pathsep):
            env["PATH"] = bin_dir + os.pathsep + env["PATH"]

    pnpm_cmd = win_resolve_pnpm(env["PATH"])
    if not pnpm_cmd:
        print("[!] PATH 里找不到 pnpm.cmd / pnpm.exe", file=sys.stderr)
        return 1
    bad = 0
    for n in names:
        r = _subprocess.run([pnpm_cmd, "remove", "-g", n], env=env,
                            capture_output=True, text=True,
                            encoding="utf-8", errors="replace")
        out = ((r.stdout or "") + (r.stderr or "")).strip()
        if r.returncode == 0:
            print(f"  removed {n}")
        elif "GLOBAL_PKG_NOT_FOUND" in out or "not found" in out:
            print(f"  not installed: {n}")
        else:
            print(f"  [!] {n} -> {out.splitlines()[-1] if out else 'rc=' + str(r.returncode)}")
            bad += 1
    return 0 if bad == 0 else 1

def win_global_install(pkg_dirs: list[str], pnpm_home: str = "", extra_paths: list[str] | None = None) -> int:
    """Windows 端全局安装：pnpm add -g 本地包，shim 由 pnpm 生成到 $PNPM_HOME\\bin。

    pkg_dirs 是包目录名（相对 workspace 的 packages/ 子目录），本函数拼成绝对路径。

    注意两点：
      1. 传本地包绝对路径而不是 workspace 包名 —— 从 workspace 根里 add -g 一个
         workspace 包会报 "workspace packages were not loaded into the resolver"。
      2. cwd 必须是 workspace 之外的目录（这里用用户主目录）—— 在 workspace 内执行
         会让 pnpm 进入 workspace 上下文，行为不符合预期。
    """
    import subprocess as _subprocess

    _reset_win_stdio_utf8()
    workspace = win_peer_workspace_root()
    if not os.path.isdir(workspace):
        print(f"[!] workspace 不存在: {workspace}", file=sys.stderr)
        return 1
    if not pkg_dirs:
        print("  [win] 无可全局安装的包")
        return 0
    pkg_paths = [win_join(workspace, "packages", d) for d in pkg_dirs]
    missing = [p for p in pkg_paths if not os.path.isdir(p)]
    if missing:
        print(f"[!] 以下包目录不存在:\n  " + "\n  ".join(missing), file=sys.stderr)
        return 1

    env = os.environ.copy()
    for d in (extra_paths or []):
        if d:
            env["PATH"] = d + os.pathsep + env.get("PATH", "")
    if pnpm_home:
        pnpm_home = os.path.abspath(pnpm_home)
        bin_dir = win_join(pnpm_home, "bin")
        os.makedirs(bin_dir, exist_ok=True)
        env["PNPM_HOME"] = pnpm_home
        if bin_dir not in env["PATH"].split(os.pathsep):
            env["PATH"] = bin_dir + os.pathsep + env["PATH"]
    pnpm_cmd = win_resolve_pnpm(env["PATH"])
    if not pnpm_cmd:
        print("[!] PATH 里找不到 pnpm.cmd / pnpm.exe", file=sys.stderr)
        return 1

    cwd = os.path.expanduser("~")
    cmd = [pnpm_cmd, "add", "-g", "--ignore-scripts", *pkg_paths]
    print(f"  [win] pnpm add -g @ {workspace}  (cwd={cwd})")
    print("  + " + " ".join(cmd))
    r = _subprocess.run(cmd, cwd=cwd, env=env, capture_output=True, text=True,
                        encoding="utf-8", errors="replace")
    if r.stdout:
        print(r.stdout.strip()[-2500:])
    if r.stderr:
        print(r.stderr.strip()[-1500:], file=sys.stderr)
    if r.returncode != 0:
        print(f"[!] pnpm add -g 失败 rc={r.returncode}", file=sys.stderr)
        return 1
    print(f"✓ 全局安装完成: {', '.join(pkg_dirs)}")
    return 0

def _win_rmtree(path: str) -> int:
    """删除目录树，含 UNC 路径的兜底清理。"""
    import shutil as _shutil
    try:
        _shutil.rmtree(path)
        return 0
    except OSError as e:
        for root, dirs, files in os.walk(path, topdown=False):
            for f in files:
                try:
                    os.remove(win_join(root, f))
                except OSError:
                    pass
            for d in dirs:
                try:
                    os.rmdir(win_join(root, d))
                except OSError:
                    pass
        print(f"  ! rmtree 部分失败: {path}: {e}", file=sys.stderr)
        return 1

def get_win_src_pkg_dir(pkg_dir: str) -> str:
    """便捷：WSL 环境下返回某包在 Windows staging 目录的挂载路径。"""
    pwsh = find_pwsh()
    if not pwsh:
        raise RuntimeError("找不到 pwsh，无法计算 Windows 路径")
    wp = get_wsl_win_paths(pwsh)
    return f"{wp.packages_dir}/{pkg_dir}"


def get_win_platform_bin_dir(pkg_dir: str, platform: str = "win") -> str:
    """便捷：返回某包某平台在 Windows 侧的二进制目录（WSL 挂载路径）。

    platform 取 linux / macos / win（OS 级）。
    """
    pwsh = find_pwsh()
    if not pwsh:
        raise RuntimeError("找不到 pwsh")
    wp = get_wsl_win_paths(pwsh)
    return f"{wp.packages_dir}/{pkg_dir}/bin/{platform}"


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
    """在指定目录中查找第一个存在的可执行文件。

    优先查当前 OS 的平台子目录（bin/<linux|macos|win>），再回退到
    目录本身（兼容历史布局 bin/<name>）。
    """
    ext = ".exe" if is_win() else ""
    plat = {"win": "win", "darwin": "macos", "linux": "linux"}.get(platform.system().lower())
    for name in names:
        if plat:
            for candidate in (dirpath / plat / f"{name}{ext}", dirpath / plat / name):
                if candidate.exists():
                    return candidate
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

        # bin/win
        plat_dir = win_paths.platform_bin(pkg_dir, "win")
        ok_plat = run_pwsh_cmd(pwsh, f"Test-Path '{plat_dir}'", timeout=10).stdout.strip().lower() == "true"
        status_p = "✓" if ok_plat else "○"
        print(f"  [{status_p}]   bin/win : {plat_dir}")

    # go 是否可用
    go_ver = run_pwsh_cmd(pwsh, "go version 2>$null", timeout=15).stdout.strip()
    print(f"\n  go version         : {go_ver if go_ver else '(未安装)'}")

    # pnpm 是否可用
    pnpm_out = run_pwsh_cmd(pwsh, "pnpm --version 2>$null", timeout=15).stdout.strip()
    pnpm_ver = pnpm_out.splitlines()[0] if pnpm_out else ""
    print(f"  pnpm version     : {pnpm_ver if pnpm_ver else '(未安装)'}")

    print(f"\n=== 检查完成，{errors} 个错误 ===")
    return errors
