#!/usr/bin/env python3
"""AEK 统一开发构建 + 部署脚本（单一入口，禁止再分散到 packages/*/scripts/）。

用法：
  python3 scripts/build_deploy.py                                  # 本机平台，全部包，构建+部署
  python3 scripts/build_deploy.py --target-platform linux          # 仅编译 linux（本机/WSL 常用）
  python3 scripts/build_deploy.py --target-platform windows        # 仅编译 windows
  python3 scripts/build_deploy.py aek-mcp --no-deploy              # 只构建单个包，不部署

  <target>（位置参数）:
    aek-websearch      Go CLI + npm 包
    aek-mcp            Go CLI + npm 包
    aek-task-manager   Go CLI + npm 包
    aek-prompt-manager 纯 JS npm 包
    aek-skill-manager  纯 JS npm 包
    aek-browser        纯 JS npm 包
    aek-dsh            纯 JS npm 包（DeepSeek Harness 插件）
    aek                纯 JS npm 元包
    all-npm            所有 npm 包（不含 mcp 前端/后端服务）

参数说明（四个概念互不相通，别混）：
  <target>            位置参数：要处理的包名，或 all-npm。
  --pkg               仅 --only 模式内使用：go / js / 具体包名。
  --target-platform   编译目标平台（linux/windows/darwin）。只影响 Go 交叉编译，
                      不限执行环境 —— 任意机器可编任意平台。
  --deploy-target     部署目标平台。严格强制，越界截停（wsl 仅 linux/windows）。

二进制布局（每个包各自一份，禁止再散落到别的目录）：
  packages/<pkg>/bin/linux/<binary>
  packages/<pkg>/bin/macos/<binary>
  packages/<pkg>/bin/win/<binary>.exe
  平台目录名固定为 linux / macos / win（OS 级，不含架构）。
  bin/ 根目录的 .js 是 JS 启动器脚本，属于源码，需入库并保留 +x。

部署（统一 pnpm add -g，禁止 npm install -g / yarn）：
  - pnpm 生成真 shim（exec node <path>），不依赖源码 .js 的 +x 位；
    npm 的全局 bin 是直接 symlink，源码丢 +x 就 Permission denied。
  - pnpm add -g 不解析 workspace:* 也不装第三方依赖 —— 运行时依赖一律从
    源码树自己的 node_modules 解析，所以部署前必须先跑 workspace 级
    pnpm install --ignore-scripts（见 ensure_workspace_deps）。
  - 全局 bin 目录动态取自 PATH（优先 ~/.local/bin），不改 PATH、不改 shell 配置。

行为：
  - 自动检测当前环境（wsl / windows / linux / darwin）
  - Go 工具链动态发现：go.mod 要 go>=1.26.4 时自动挑满足版本的路径
    （本机 /usr/bin/go 可能是 1.18，会 invalid go version 硬失败）
  - Go 包：按 --target-platform 编译到 packages/<pkg>/bin/<linux|macos|win>/
  - npm 包：本机 pnpm add -g
  - WSL<->Windows 双端：默认不编译对端，需显式 --target-platform windows
  - macOS：仅本机编译/部署（无对端概念）
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

# 添加 scripts 目录到路径以导入共享模块
_SCRIPTS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(_SCRIPTS_DIR))
from shared.start_scripts_shared_logic import (
    is_win, py_exe, get_win_paths, get_wsl_win_paths,
    windows_path_to_wsl, get_wsl_unc_paths, get_wsl_win_aek_test_dir,
    find_pwsh, run_pwsh_cmd, run_pwsh_on_windows,
    find_go, go_mod_required_version, pnpm_global_bin_dir, get_aek_test_dir,
    pnpm_global_config_args, get_win_pnpm_home,
    win_join, copy_tree_excluding, run_windows_python,
    win_stage, win_pnpm_install, win_global_install, win_peer_workspace_root,
    win_uninstall_pkgs,
)

PROJECT_ROOT = Path(__file__).resolve().parent.parent
PACKAGES_DIR = PROJECT_ROOT / "packages"

# ──────────────────────────────────────────────────────────────────────────
# 包注册表：name -> (subdir, kind, npm_name, go_build_cmd)
# kind: "go-cli" / "js-cli" / "meta"
# ──────────────────────────────────────────────────────────────────────────
PACKAGES = {
    "aek-websearch": {
        "dir": "aek-websearch",
        "kind": "go-cli",
        "npm": "@cheezmil/aek-websearch",
        "go_cmd": ["go", "build", "-o", None, "./cmd/aek/"],   # None = 输出路径运行时填
        "bin_name": "aek-websearch",
        "conflict_npm_names": [
            "@cheezmil/aek-websearch",
            "@cheezmil/aek-websearch-win32-x64",
            "@cheezmil/aek-websearch-linux-x64",
            "@cheezmil/aek-websearch-linux-arm64",
            "@cheezmil/aek-websearch-darwin-x64",
            "@cheezmil/aek-websearch-darwin-arm64",
        ],
    },
    "aek-mcp": {
        "dir": "aek-mcp",
        "kind": "go-cli",
        "npm": "@cheezmil/aek-mcp",
        "go_cmd": ["go", "build", "-o", None, "./cmd/aek-mcp/"],
        "bin_name": "aek-mcp",
        "conflict_npm_names": ["@cheezmil/aek-mcp"],
    },
    "aek-task-manager": {
        "dir": "aek-task-manager",
        "kind": "go-cli",
        "npm": "@cheezmil/aek-task-manager",
        "go_cmd": ["go", "build", "-o", None, "./src/cmd/aek-task-manager/"],
        "bin_name": "aek-task-manager",
        "conflict_npm_names": ["@cheezmil/aek-task-manager"],
    },
    "aek-prompt-manager": {
        "dir": "aek-prompt-manager",
        "kind": "js-cli",
        "npm": "@cheezmil/aek-prompt-manager",
        "conflict_npm_names": ["@cheezmil/aek-prompt-manager", "aek-prompt-manager"],
    },
    "aek-skill-manager": {
        "dir": "aek-skill-manager",
        "kind": "js-cli",
        "npm": "@cheezmil/aek-skill-manager",
        "conflict_npm_names": ["@cheezmil/aek-skill-manager"],
    },
    "aek-browser": {
        "dir": "aek-browser",
        "kind": "js-cli",
        "npm": "@cheezmil/aek-browser",
        "conflict_npm_names": ["@cheezmil/aek-browser"],
    },
    "aek-dsh": {
        "dir": "aek-dsh",
        "kind": "js-plugin",  # DSH插件，不全局安装
        "npm": "@cheezmil/aek-dsh",
        "conflict_npm_names": ["@cheezmil/aek-dsh"],
        "plugin": True,
    },
    "aek": {
        "dir": "aek",
        "kind": "meta",
        "npm": "@cheezmil/aek",
        "conflict_npm_names": ["@cheezmil/aek"],
    },
}

# 额外的全局清理目标（云端历史残留）
# aek-common 已于 2026-09 合并进 @cheezmil/aek，仍需清掉旧版本的云端残留。
GLOBAL_CONFLICT_EXTRA = ["@cheezmil/aek-common"]


# ──────────────────────────────────────────────────────────────────────────
# 环境检测
# ──────────────────────────────────────────────────────────────────────────

def detect_env() -> str:
    """返回: 'wsl' / 'windows' / 'linux' / 'darwin'"""
    if sys.platform == "win32":
        return "windows"
    if sys.platform == "darwin":
        return "darwin"
    if sys.platform.startswith("linux"):
        # 检测 WSL：microsoft / WSL_DISTRO_NAME
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


# find_pwsh() 已上移到 shared.start_scripts_shared_logic（WSL→Windows pwsh 唯一入口）。
# 需要 pwsh.exe 路径时直接 import 使用，禁止在此处重复实现。

def find_wsl_exe() -> str | None:
    """在 Windows 中找 wsl.exe，动态查找避免硬编码路径。"""
    if detect_env() != "windows":
        return None
    try:
        r = subprocess.run(
            ["where.exe", "wsl"], capture_output=True, text=True, timeout=5,
        )
        for line in r.stdout.strip().splitlines():
            p = line.strip()
            if p and Path(p).exists():
                return p
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass
    for p in [
        r"C:\Windows\System32\wsl.exe",
        r"C:\Windows\Sysnative\wsl.exe",
    ]:
        if Path(p).exists():
            return p
    return None


# ──────────────────────────────────────────────────────────────────────────
# 工具
# ──────────────────────────────────────────────────────────────────────────

def run(cmd: list[str], cwd: Path | None = None, check: bool = True, capture: bool = False, env_extra: dict | None = None) -> subprocess.CompletedProcess:
    env = os.environ.copy()
    if env_extra:
        env.update(env_extra)
    print(f"  + {' '.join(str(c) for c in cmd)}" + (f"  (cwd={cwd})" if cwd else ""))
    return subprocess.run(cmd, cwd=cwd, env=env, check=check, capture_output=capture, text=True)


def run_wsl_in_windows(wsl_exe: str, bash_cmd: str, label: str) -> None:
    """从 Windows 调 WSL bash 执行命令。"""
    print(f"  [wsl] {label}")
    r = subprocess.run([wsl_exe, "-e", "bash", "-lc", bash_cmd], capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stdout)
        print(r.stderr, file=sys.stderr)
        raise SystemExit(f"[✗] {label} 失败（exit={r.returncode}）")
    if r.stdout.strip():
        print(r.stdout)


def current_platform() -> tuple[str, str]:
    """返回 (goos, goarch) for Go build。"""
    sys_os = sys.platform
    if sys_os == "win32":
        goos = "windows"
    elif sys_os == "darwin":
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


# ──────────────────────────────────────────────────────────────────────────
# 环境信息 + 部署目标强制校验
#
# 核心原则：
#   - 编译（--target-platform）：不限环境，任意系统都能编任意目标平台的包
#   - 部署（--deploy-target）：严格强制，当前执行环境不能部署不属于自己的目标
#     违规即截停并显著打印错误
# ──────────────────────────────────────────────────────────────────────────

# 当前执行环境 → 本机平台
# 注：wsl 就是 linux（WSL 的根文件系统就是 Linux），不单独列 cur_platform
CURRENT_ENV_TO_PLATFORM = {
    "wsl":     "linux",
    "linux":   "linux",
    "darwin":  "darwin",
    "windows": "windows",
}

# 当前执行环境 → 允许的 --deploy-target 集合（= 该环境能触达的平台）
# 规则：
#   - wsl 能触达 windows（通过委派 Windows 跑本脚本）和 linux（本机）
#   - linux/darwin 单端环境，只能触达自己
#   - windows 只能触达 windows（本机）；windows→wsl 委派已 deprecated
# 跨端部署不直接做，会走 delegate_to_peer() 触发对端跑本脚本
ALLOWED_DEPLOY_TARGETS = {
    "wsl":     {"linux", "windows"},
    "linux":   {"linux"},
    "darwin":  {"darwin"},
    "windows": {"windows"},  # 仅本机；windows→wsl 委派已 deprecated
}

# 当前执行环境 → 可委派到的对端环境（用于跨端委派）
# 只保留 wsl→windows 一个方向；windows→wsl 已 deprecated
PEER_ENV_OF = {
    "wsl":     "windows",
    "linux":   None,
    "darwin":  None,
    "windows": None,   # deprecated：windows 端不再委派到 wsl
}

# 部署目标平台 → 该平台的委派环境（用于跨端委派）
# 目前只支持一个方向：wsl 端委派到 windows 跑本脚本
DEPLOY_PLATFORM_TO_ENV = {
    "windows": "windows",  # wsl + --deploy-target windows → 委派到 windows env
    # "linux": "wsl",    # deprecated：windows→wsl 委派已关闭
    # "darwin": "darwin",# deprecated
}

_ENV_LABELS = {
    "wsl":     "WSL（根文件系统是 Linux，cur_platform 视为 linux）",
    "linux":   "Linux 原生",
    "darwin":  "macOS",
    "windows": "Windows 原生",
}


def describe_current_env() -> dict:
    """返回当前执行环境的完整描述，供 banner / 校验共用。"""
    env = detect_env()
    cur_platform = CURRENT_ENV_TO_PLATFORM.get(env)
    peer_env = PEER_ENV_OF.get(env)
    return {
        "env": env,
        "label": _ENV_LABELS.get(env, env),
        "cur_platform": cur_platform,
        "peer_env": peer_env,
        "allowed_deploy_targets": sorted(ALLOWED_DEPLOY_TARGETS.get(env, set())),
    }


def resolve_deploy_targets(env: str, deploy_target: str | None) -> list[str]:
    """把 --deploy-target 解析成"本机要部署到的平台"列表。

    只允许单端：windows→["windows"]、linux/wsl→["linux"]、darwin→["darwin"]。
    越界立即抛 ValueError 由调用方截停。

    跨端部署不在这里处理，走 delegate_to_peer() 委派对端跑本脚本。

    返回: 用户显式指定的平台（单元素列表）。
    校验: deploy_target 必须在 ALLOWED_DEPLOY_TARGETS[env] 里。
    """
    cur_platform = CURRENT_ENV_TO_PLATFORM.get(env)
    allowed = ALLOWED_DEPLOY_TARGETS.get(env, set())

    # 默认 = 当前环境对应的本机平台
    if deploy_target is None:
        deploy_target = cur_platform

    if deploy_target not in allowed:
        raise ValueError(
            f"当前环境 {env} 不支持 --deploy-target {deploy_target!r}。\n"
            f"  允许的取值：{sorted(allowed)}\n"
            f"  当前环境 {env} 的本机平台是 {cur_platform}，\n"
            f"  跨端部署（如 wsl → windows）请改用 --deploy-target windows 委派对端执行，"
            f"或加 --peer 做本机+对端同步。\n"
            f"  若你要在 windows 终端跑本脚本部署到 windows，请用 --deploy-target windows。"
        )

    # 返回用户实际指定的平台（可能是本机，也可能是对端 → 触发委派）
    return [deploy_target]


def print_env_banner(deploy_target: str | None = None, target_platform: str | None = None,
                     peer_sync: bool = False) -> None:
    """显著打印当前执行环境 + 部署目标校验结果。

    这是脚本的"入口契约"：每次运行都能在输出开头明确看到
    "我在哪个系统" + "我要往哪些平台部署"，避免"不知道 py 在哪执行"。
    """
    info = describe_current_env()
    env = info["env"]
    cur_platform = info["cur_platform"]
    peer_env = info["peer_env"]

    print("=" * 72)
    print("  ▶ 当前执行环境")
    print("=" * 72)
    print(f"  环境类型        : {info['label']}  ({env})")
    print(f"  本机平台        : {cur_platform}")
    if peer_env:
        print(f"  对端环境        : {peer_env}  （对端同步需显式传 --peer，默认不同步）")
    else:
        print(f"  对端环境        : （无）")
    print(f"  允许的 deploy 目标: {info['allowed_deploy_targets']}")

    # 解析部署目标（校验就在这里发生）
    try:
        targets = resolve_deploy_targets(env, deploy_target)
    except ValueError as e:
        print()
        print("!" * 72)
        print("  ✗ 部署目标非法 —— 截停")
        print("!" * 72)
        print(f"  {e}")
        print("!" * 72)
        sys.exit(2)

    print()
    print(f"  ▶ 部署目标        : --deploy-target={deploy_target or cur_platform} → {targets}")
    if peer_sync:
        if peer_env:
            print(f"  ▶ 对端同步        : --peer 开启 → 同步到 {peer_env}")
        else:
            print(f"  ▶ 对端同步        : --peer 指定但 {env} 无对端，忽略")
    else:
        print(f"  ▶ 对端同步        : 关闭（默认，本脚本只碰本机平台）")
    print(f"  ▶ 编译目标        : --target-platform={target_platform or '(默认=本机)'}"
          f"  (任意环境可编任意平台，不拦截)")
    print("=" * 72)


def ensure_deploy_target_allowed(env: str, deploy_target: str | None) -> list[str]:
    """部署前的二次强制校验（banner 已调用过，这里是 fail-fast 兜底）。"""
    try:
        return resolve_deploy_targets(env, deploy_target)
    except ValueError as e:
        print()
        print("!" * 72)
        print("  ✗ 部署目标非法 —— 截停")
        print("!" * 72)
        print(f"  {e}")
        print("!" * 72)
        sys.exit(2)


# ──────────────────────────────────────────────────────────────────────────
# 跨端委派（delegate）
#
# 语义：
#   --deploy-target windows + 当前 wsl  → wsl 只做一件事：触发 Windows 端跑本脚本
#                                          本端不 build / stage / install 任何事
#   --deploy-target linux  + 当前 windows → windows 只做一件事：触发 WSL 端跑本脚本
#
# 实现：把当前 argv 原样转发给对端，让对端在自己环境里跑本脚本。
# 对端跑起来后 banner 会再次打印"我在哪个系统"，链路透明。
# ──────────────────────────────────────────────────────────────────────────

def delegate_to_peer(peer_env: str, extra_args: list[str], dry_run: bool = False) -> None:
    """委派对端执行本脚本。本端不做任何事。

    peer_env: 目标对端环境（"windows" 或 "linux"）
    extra_args: 传给对端的额外参数（不含原 argv 之外的内容）
    """
    cur_env = detect_env()
    print()
    print("=" * 72)
    print(f"  ▶ 委派对端执行")
    print("=" * 72)
    print(f"  当前环境        : {cur_env}")
    print(f"  委派到          : {peer_env}")
    print(f"  本端动作        : 仅触发对端跑本脚本，不做 build / stage / install")
    print("=" * 72)

    # 构造对端 argv：保留原 argv，但去掉 --deploy-peer 和 --deploy-target，
    # 加上 --deploy-target <本机平台> 让对端部署到它自己的本机
    import shlex
    my_args = sys.argv[1:]
    peer_args: list[str] = []
    drop_next = False
    for i, a in enumerate(my_args):
        if drop_next:
            drop_next = False
            continue
        if a == "--deploy-peer":
            continue
        if a == "--deploy-target":
            drop_next = True
            continue
        peer_args.append(a)
    # 对端要部署到它自己的本机平台
    peer_platform = CURRENT_ENV_TO_PLATFORM.get(peer_env)
    if peer_platform:
        peer_args.extend(["--deploy-target", peer_platform])
    if extra_args:
        peer_args.extend(extra_args)
    if dry_run and "--dry-run" not in peer_args:
        peer_args.append("--dry-run")

    if peer_env == "windows":
        pwsh = find_pwsh()
        if not pwsh:
            print("[!] 找不到 PowerShell，无法委派到 Windows")
            sys.exit(2)
        script_path = os.path.abspath(__file__)
        # 用 python 执行（Windows 上 python 通常可用）
        ps_cmd = (
            f"$ErrorActionPreference = 'Continue'\n"
            f"$Error.Clear()\n"
            f"python '{script_path}'"
        )
        # 把参数逐个加进去（pwsh 字符串拼接）
        for a in peer_args:
            ps_cmd += " " + shlex.quote(a)
        ps_cmd += "\nif ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }\n"
        print(f"  [pwsh] python {os.path.basename(script_path)} {' '.join(peer_args)}")
        r = run_pwsh_cmd(pwsh, ps_cmd, timeout=3600)
        print(r.stdout, end="")
        if r.returncode != 0:
            print(r.stderr, file=sys.stderr, end="")
            raise SystemExit(f"[✗] 委派到 Windows 失败 (exit={r.returncode})")
        return

    if peer_env == "linux":
        wsl = find_wsl_exe()
        if not wsl:
            print("[!] 找不到 wsl.exe，无法委派到 WSL")
            sys.exit(2)
        import shlex
        script_path = os.path.abspath(__file__)
        bash_cmd_parts = [f"python3 {shlex.quote(script_path)}"]
        bash_cmd_parts.extend(shlex.quote(a) for a in peer_args)
        bash_cmd = " ".join(bash_cmd_parts)
        print(f"  [wsl] python3 {os.path.basename(script_path)} {' '.join(peer_args)}")
        r = subprocess.run(
            [wsl, "-e", "bash", "-c", bash_cmd],
            capture_output=False, text=True,
        )
        if r.returncode != 0:
            raise SystemExit(f"[✗] 委派到 WSL 失败 (exit={r.returncode})")
        return

    print(f"[!] 未知对端环境 {peer_env}")
    sys.exit(2)


# ──────────────────────────────────────────────────────────────────────────
# 构建
# ──────────────────────────────────────────────────────────────────────────

def build_go(pkg_key: str, target_goos: str, target_goarch: str, out_suffix: str = "") -> Path:
    """交叉编译 Go 二进制，返回输出路径。

    输出到 packages/<pkg>/bin/<linux|macos|win>/<bin_name>[.exe] —— 每个包各一份，
    不再使用 esbuild 式的 platforms/<goos>-<arch>/bin/ 平台子包目录。

    Go 工具链不硬编码 "go"：go.mod 要 go>=1.26.4 时，PATH 里的 /usr/bin/go 可能是
    go1.18，会直接 invalid go version 硬失败。这里按各包 go.mod 动态挑工具链。
    """
    spec = PACKAGES[pkg_key]
    pkg_dir = PACKAGES_DIR / spec["dir"]
    bin_name = spec["bin_name"]
    ext = ".exe" if target_goos == "windows" else ""
    out_name = f"{bin_name}{ext}"
    # goos → 平台目录名（OS 级，不含架构）
    plat_dir_name = {"windows": "win", "darwin": "macos", "linux": "linux"}[target_goos]
    plat_bin = pkg_dir / "bin" / plat_dir_name
    plat_bin.mkdir(parents=True, exist_ok=True)
    out_path = plat_bin / out_name

    go_exe = go_toolchain_for(pkg_key)
    cmd = [go_exe] + list(spec["go_cmd"][1:])
    # 替换 None 为输出路径
    for i, c in enumerate(cmd):
        if c is None:
            cmd[i] = str(out_path)

    env_extra = {"GOOS": target_goos, "GOARCH": target_goarch, "CGO_ENABLED": "0"}
    print(f"  build {pkg_key} for {target_goos}/{target_goarch} → {out_path}")
    print(f"  using go: {go_exe}")
    run(cmd, cwd=pkg_dir, env_extra=env_extra)

    return out_path


_GO_TOOLCHAIN_CACHE: dict[str, str] = {}


def go_toolchain_for(pkg_key: str) -> str:
    """按该包 go.mod 的版本要求返回 Go 工具链路径（同包只探测一次）。"""
    if pkg_key in _GO_TOOLCHAIN_CACHE:
        return _GO_TOOLCHAIN_CACHE[pkg_key]
    pkg_dir = PACKAGES_DIR / PACKAGES[pkg_key]["dir"]
    go_exe = find_go(go_mod_required_version(pkg_dir))
    _GO_TOOLCHAIN_CACHE[pkg_key] = go_exe
    return go_exe


# (goos, goarch) → 平台目录名（OS 级，bin/ 下的子目录名）
GOOS_ARCH_TO_PLATFORM_DIR = {
    "linux": "linux",
    "darwin": "macos",
    "windows": "win",
}


def build(
    pkg_key: str,
    target_platform: str | None = None,
) -> dict[str, Path]:
    """构建 Go 包二进制。

    默认行为：只编译本机平台（goarch 固定 amd64）。

    参数:
        pkg_key: 包名
        target_platform: 目标平台
            - None           → 编译本机平台（linux 端 = linux/amd64）
            - "windows"      → 编译 windows/amd64
            - "linux"        → 编译 linux/amd64
            - "darwin"       → 编译 darwin/arm64

    编译阶段不限执行环境：linux/wsl/windows/darwin 任何环境都能编译任意目标平台。
    不再有 "both" 选项；要编对端就显式传 --target-platform <平台>。
    """
    spec = PACKAGES[pkg_key]
    if spec["kind"] != "go-cli":
        print(f"  {pkg_key} 是纯 JS 包，无需构建")
        return {}

    native = current_platform()  # (goos, goarch)

    if target_platform is None:
        goos, goarch = native
    elif target_platform == "windows":
        goos, goarch = "windows", "amd64"
    elif target_platform == "linux":
        goos, goarch = "linux", "amd64"
    elif target_platform == "darwin":
        goos, goarch = "darwin", "arm64"
    else:
        raise ValueError(f"未知 target_platform: {target_platform!r}")

    out_path = build_go(pkg_key, goos, goarch)
    return {goos: out_path}


def build_js(pkg_key: str) -> None:
    """运行 JS 包的构建脚本（pnpm run build），跳过已有 lib/ 的包。"""
    spec = PACKAGES[pkg_key]
    pkg_dir = PACKAGES_DIR / spec["dir"]
    pkg_json_path = pkg_dir / "package.json"
    if not pkg_json_path.exists():
        print(f"  [!] {pkg_key} 无 package.json，跳过构建")
        return
    import json as _json
    with open(pkg_json_path) as f:
        meta = _json.load(f)
    build_cmd = meta.get("scripts", {}).get("build", "")
    if not build_cmd:
        print(f"  {pkg_key} 无 build 脚本，跳过构建")
        return
    # lib/ 已存在说明已构建过，跳过
    if (pkg_dir / "lib").exists():
        print(f"  {pkg_key}: lib/ 已存在，跳过构建")
        return
    print(f"  {pkg_key}: pnpm run build")
    run(["pnpm", "run", "build"], cwd=pkg_dir)


def _build_go_on_windows_via_pwsh(pkg_key: str, pwsh: str, win_user_profile: str, dry_run: bool = False) -> None:
    """通过 PowerShell 在 Windows 端编译 Go 二进制。

    前提：Windows 侧必须有源码（通过 stage 或手动复制）。
    输出到 C:\\Users\\<user>\\.aek\\src\\packages\\<pkg>\\bin\\win\\<bin>.exe
    """
    spec = PACKAGES[pkg_key]
    pkg_dir = spec["dir"]
    bin_name = spec["bin_name"]
    build_target = spec["go_cmd"][4] if len(spec["go_cmd"]) > 4 else "./cmd/aek"

    # Windows 路径（供 pwsh 使用）
    out_dir = f"{win_user_profile}\\.aek\\src\\packages\\{pkg_dir}\\bin\\win"
    out_file = f"{out_dir}\\{bin_name}.exe"
    src_on_win = f"{win_user_profile}\\.aek\\src\\packages\\{pkg_dir}"

    if dry_run:
        print(f"  [dry-run] {pkg_key} → {out_file}")
        return

    # 检查 Windows 侧是否有源码（stage 已复制到 /mnt/c/Users/xdx/.aek/src/packages/）
    check_src_cmd = f"Test-Path '{src_on_win}\\package.json'"
    r = run_pwsh_cmd(pwsh, check_src_cmd, timeout=15)
    if r.stdout.strip().lower() != "true":
        raise RuntimeError(
            f"[!] {pkg_key} Windows 侧缺少源码（{src_on_win}）。\\n"
            f"    请先运行: python3 scripts/build_deploy.py --only stage"
        )

    # 确保输出目录存在
    mkdir_cmd = f"New-Item -ItemType Directory -Force -Path '{out_dir}'"
    run_pwsh_cmd(pwsh, mkdir_cmd, timeout=15).check(f"{pkg_key} 创建输出目录")

    # Go 编译命令
    build_cmd = (
        f"$env:GOOS='windows'; "
        f"$env:GOARCH='amd64'; "
        f"$env:CGO_ENABLED='0'; "
        f"Set-Location '{src_on_win}'; "
        f"go build -o '{out_file}' {build_target}"
    )

    print(f"  build {pkg_key} for windows/amd64 → {out_file}")
    r = run_pwsh_cmd(pwsh, build_cmd, timeout=180)
    if r.returncode != 0:
        print(f"  [!] {pkg_key} Windows 编译失败:")
        print(f"      stdout: {r.stdout[-500:]}")
        print(f"      stderr: {r.stderr[-300:]}")
        raise RuntimeError(f"{pkg_key} Windows 编译失败")
    if r.stdout.strip():
        print(f"  [info] {r.stdout.strip()[:200]}")

    print(f"  ✓ {pkg_key} Windows 二进制已编译")


# ──────────────────────────────────────────────────────────────────────────
# 部署
# ──────────────────────────────────────────────────────────────────────────

def uninstall_cloud_conflicts(pkg_key: str, where: str) -> None:
    """卸载本机/对端的云端冲突包。where: 'local' / 'windows-peer' / 'wsl-peer'

    卸载一律用 pnpm（项目铁律：禁止 npm / yarn）。
    """
    spec = PACKAGES[pkg_key]
    names = list(spec["conflict_npm_names"]) + list(GLOBAL_CONFLICT_EXTRA)

    if where == "local":
        # pnpm remove -g 同样要求 global bin dir 在 PATH 中，必须显式传
        cfg = pnpm_global_config_args()
        for n in names:
            run(["pnpm", "remove", "-g", *cfg, n], check=False)
    elif where == "windows-peer":
        pwsh = find_pwsh()
        if not pwsh:
            print("  [!] 无 pwsh，跳过对端卸载")
            return
        # Windows 侧的 pnpm remove 走 --win-uninstall 自派发，不写 pwsh 逻辑
        wp = get_win_paths(pwsh)
        extra = [wp.npm_bin_dir] if wp.npm_bin_dir else []
        repo_root_unc = get_wsl_unc_paths(pwsh, PROJECT_ROOT).src_dir
        r = run_windows_python(
            pwsh, args=["--win-uninstall", ",".join(names),
                        get_win_pnpm_home(pwsh), ",".join(extra)],
            repo_root_unc=repo_root_unc, timeout=600,
        )
        if r.stdout.strip():
            print(r.stdout.rstrip())
        if r.stderr.strip():
            print(f"  [peer stderr] {r.stderr.rstrip()}", file=sys.stderr)
    elif where == "wsl-peer":
        wsl = find_wsl_exe()
        if not wsl:
            print("  [!] 无 wsl.exe，跳过对端卸载")
            return
        joined = " ".join(names)
        run_wsl_in_windows(wsl, f"pnpm remove -g {joined} 2>/dev/null || true", f"卸载对端冲突包: {pkg_key}")


_WORKSPACE_DEPS_READY = False


def ensure_workspace_deps() -> None:
    """在 workspace 根跑一次 pnpm install --ignore-scripts（每个进程只跑一次）。

    为什么必须有这一步：pnpm add -g 既不解析 workspace:* 也不装第三方依赖，
    全局命令的运行时依赖一律从源码树自己的 node_modules 解析。跳过它会导致
    CLI 报 ERR_MODULE_NOT_FOUND（无论用 npm 还是 pnpm 全局安装都一样）。

    --ignore-scripts 必须带上：aek-browser 的 postinstall 会联网拉 adapters
    并去关本地 daemon，不适合在构建流程里跑。

    全量构建有 8 个包，每包跑一次纯属浪费，所以用进程级开关只跑一次。
    """
    global _WORKSPACE_DEPS_READY
    if _WORKSPACE_DEPS_READY:
        print("  workspace 依赖已就绪（本进程只跑一次，跳过）")
        return
    print(f"  pnpm install --ignore-scripts @ {PROJECT_ROOT}")
    run(["pnpm", "install", "--ignore-scripts"], cwd=PROJECT_ROOT)
    _WORKSPACE_DEPS_READY = True


def pnpm_global_install(pkg_key: str) -> None:
    """本机 pnpm add -g 当前包目录（禁止 npm install -g）。

    用 pnpm 而不是 npm 的原因：
    - pnpm 生成真 shim（exec node <path>），不依赖源码 .js 的 +x 位
    - npm 的全局 bin 是「直接 symlink 到源码 .js」，源码一丢 +x 就 Permission denied
      （本次踩坑：aekpm 曾因 bin 文件缺失/未加 +x 而 Permission denied）

    全局 bin 目录由 pnpm_global_bin_dir() 从 PATH 动态解析，不改 PATH。
    """
    spec = PACKAGES[pkg_key]
    pkg_dir = PACKAGES_DIR / spec["dir"]
    bin_dir = pnpm_global_bin_dir()
    print(f"  pnpm add -g --ignore-scripts {pkg_dir}")
    print(f"  global bin dir: {bin_dir}")
    run(["pnpm", "add", "-g", "--ignore-scripts",
         f"--config.global-bin-dir={bin_dir}", str(pkg_dir)],
        cwd=PROJECT_ROOT)


def stage_for_windows_peer(pkg_key: str) -> str:
    """在 WSL 侧把包拷贝到 Windows 原生 staging 目录，返回 Windows 视角路径。"""
    env = detect_env()
    if env != "wsl":
        raise RuntimeError("stage_for_windows_peer 仅 WSL 可用")

    spec = PACKAGES[pkg_key]
    pkg_dir = PACKAGES_DIR / spec["dir"]

    pwsh = find_pwsh()
    if not pwsh:
        raise RuntimeError("找不到 PowerShell")
    wp = get_wsl_win_paths(pwsh)
    # staging 使用用户约定的 dev-staging 子目录
    staging_root = Path(wp.src_dir).parent / "dev-staging"
    staging_win = str(staging_root / spec["dir"])

    # 创建目标目录（先清空，防止旧嵌套结构残留）
    staging_path = Path(staging_win)
    for p in (staging_path,):
        if p.exists():
            import shutil
            shutil.rmtree(p)
        p.mkdir(parents=True, exist_ok=True)

    # 排除规则（bin/ 不排除：Go 包的平台二进制在 bin/<linux|macos|win>/ 中）
    # 对于有 build 脚本的 JS 包，不排除 dist/
    import json as _json
    spec = PACKAGES[pkg_key]
    pkg_json_path = PACKAGES_DIR / spec["dir"] / "package.json"
    with open(pkg_json_path) as f:
        pkg_meta = _json.load(f)
    has_build = bool(pkg_meta.get("scripts", {}).get("build"))
    EXCLUDE_DIRS = {"node_modules", ".git", "build", "__pycache__", ".venv", ".next"}
    if not has_build:
        EXCLUDE_DIRS.add("dist")
    EXCLUDE_FILES = {"*.log", "*.tmp"}

    def copy_tree(src: Path, dst: Path) -> None:
        if not src.exists():
            print(f"  [!] 源不存在，跳过: {src}", file=sys.stderr)
            return
        for item in src.iterdir():
            if item.name in EXCLUDE_DIRS:
                continue
            if any(item.match(p) for p in EXCLUDE_FILES):
                continue
            dst_item = dst / item.name
            if item.is_dir():
                dst_item.mkdir(parents=True, exist_ok=True)
                copy_tree(item, dst_item)
            else:
                # WSL /mnt/c/ 不支持 chmod/utime，直接读写内容跳过元数据
                data = item.read_bytes()
                dst_item.write_bytes(data)

    print(f"  [copy] {pkg_key} → {staging_win}")
    copy_tree(pkg_dir, Path(staging_win))

    # 平台二进制只保留 win/（如有）：staging 是给 Windows 端用的
    pkg_bin_plat = Path(staging_win) / "bin"
    if pkg_bin_plat.exists():
        for d in pkg_bin_plat.iterdir():
            if d.is_dir() and d.name != "win":
                import shutil
                shutil.rmtree(d)
                print(f"  [rm] 剔除平台目录: bin/{d.name}")

    return staging_win


def win_workspace_pnpm_install(repo_root_unc: str) -> None:
    """在 Windows 端 workspace 执行一次 pnpm install（委托 Windows 侧 Python）。

    本脚本跑在 WSL 里，读不到 C:\\Users\\... 这类 Windows 路径，所以文件
    读写和 pnpm install 全部交给 shared 模块的 win_pnpm_install() 在 Windows 上做。
    workspace 根的 package.json / pnpm-workspace.yaml 由 stage 阶段复制。
    """
    pwsh = find_pwsh()
    if not pwsh:
        raise RuntimeError("找不到 PowerShell")
    wp = get_win_paths(pwsh)
    print(f"  [win] workspace root: {wp.src_dir}")
    extra = [wp.npm_bin_dir] if wp.npm_bin_dir else []
    r = run_windows_python(
        pwsh, args=["--win-pnpm-install", wp.src_dir,
                    "--pnpm-home", get_win_pnpm_home(pwsh),
                    "--extra-path", ",".join(extra)],
        repo_root_unc=repo_root_unc, timeout=600,
    )
    if r.returncode != 0:
        print(f"  [!] pnpm install 失败:\n{r.stdout[-800:]}", file=sys.stderr)
        raise RuntimeError("pnpm install 失败")
    if r.stdout.strip():
        print(r.stdout.rstrip())
    if r.stderr.strip():
        print(f"  [peer stderr] {r.stderr.rstrip()}", file=sys.stderr)

def npm_install_on_windows_peer(pkg_keys, repo_root_unc: str, staging_win: str = "") -> None:
    """Windows 对端全局安装：workspace 根跑一次 pnpm install，再 pnpm add -g 全部包。

    shim 交给 pnpm 自己生成到 $PNPM_HOME\\bin，不手动写 .ps1。
    pkg_keys 可以是单个 key 字符串或 key 列表；插件包（无全局 CLI）自动跳过。
    """
    win_workspace_pnpm_install(repo_root_unc)
    keys = [pkg_keys] if isinstance(pkg_keys, str) else list(pkg_keys)
    dirs = [PACKAGES[k]["dir"] for k in keys
            if PACKAGES[k].get("npm") and not PACKAGES[k].get("plugin")]
    if not dirs:
        print("  [win] 无可全局安装的包")
        return
    pwsh = find_pwsh()
    if not pwsh:
        raise RuntimeError("找不到 PowerShell")
    wp = get_win_paths(pwsh)
    extra = [wp.npm_bin_dir] if wp.npm_bin_dir else []
    r = run_windows_python(
        pwsh, args=["--win-global-install", ",".join(dirs),
                    get_win_pnpm_home(pwsh), ",".join(extra)],
        repo_root_unc=repo_root_unc, timeout=600,
    )
    if r.returncode != 0:
        print(f"  [!] Windows 全局安装失败:\n{r.stdout[-800:]}", file=sys.stderr)
        raise RuntimeError("Windows 全局安装失败")
    if r.stdout.strip():
        print(r.stdout.rstrip())
    if r.stderr.strip():
        print(f"  [peer stderr] {r.stderr.rstrip()}", file=sys.stderr)


def stage_all_for_windows_peer(no_cache: bool = False, repo_root_unc: str = "") -> None:
    """WSL 写源码到自身文件系统，PowerShell 通过 UNC 复制到 Windows。

    流程：
    1. WSL Python 写入 root package.json / pnpm-workspace.yaml（WSL 自身文件系统）
    2. WSL Python 校验包存在
    3. 返回 UNC 路径，让 PowerShell 从 UNC 复制到 C:\\Users\\<user>\\.aek\\src\\
    """
    import json as _root_json
    import hashlib as _hashlib

    pwsh = find_pwsh()
    if not pwsh:
        raise RuntimeError("找不到 PowerShell")

    # WSL 自身路径（写回 WSL 文件系统，不碰 /mnt/c/）
    src_dir_wsl = PROJECT_ROOT  # /home/xdx/CodeRelated/agent-enhance-kit
    packages_dir_wsl = PACKAGES_DIR  # .../packages

    src_dir_wsl.mkdir(parents=True, exist_ok=True)
    packages_dir_wsl.mkdir(parents=True, exist_ok=True)

    # 不写 package.json / pnpm-workspace.yaml：
    # 这个 workspace 的真源就是 PROJECT_ROOT 自身（下方 packages_dir_wsl == PACKAGES_DIR），
    # 再往 package.json 里塞 workspaces 只会让 pnpm 每次调用都打
    # WARN "workspaces field ... is not supported by pnpm"。
    # workspace 清单的唯一真相来源是 pnpm-workspace.yaml。

    # 计算 UNC 路径，让 PowerShell 读取
    wp_unc = get_wsl_unc_paths(pwsh, PROJECT_ROOT)
    packages_unc = wp_unc.packages_dir  # \\wsl.localhost\Ubuntu-22.04\home\xdx\CodeRelated\agent-enhance-kit\packages

    # 复制所有包：WSL 写入 WSL 文件系统（幂等操作），然后 PowerShell 从 UNC 复制到 Windows
    EXCLUDE_DIRS = {"node_modules", ".git", "build", "__pycache__", ".venv", ".next"}

    def compute_key(pkg_dir: Path) -> str:
        pkg_json = pkg_dir / "package.json"
        if not pkg_json.exists():
            return ""
        with open(pkg_json) as f:
            meta = _root_json.load(f)
        ver = meta.get("version", "")
        has_build = bool(meta.get("scripts", {}).get("build"))
        exclude = set(EXCLUDE_DIRS)
        if not has_build:
            exclude.add("dist")
        hashes = []
        for root, dirs, files in os.walk(pkg_dir):
            dirs[:] = [d for d in dirs if d not in exclude]
            for fn in sorted(files):
                if fn in (".gitignore", "package.json"):
                    continue
                fp = Path(root) / fn
                try:
                    h = _hashlib.md5(fp.read_bytes()).hexdigest()[:8]
                    rel = str(fp.relative_to(pkg_dir))
                    hashes.append(f"{rel}::{h}")
                except Exception:
                    pass
        return _hashlib.md5(f"{ver}::{'::'.join(hashes)}".encode()).hexdigest()[:16]

    for pkg_key, spec in PACKAGES.items():
        src = PACKAGES_DIR / spec["dir"]
        if not src.exists():
            print(f"  [!] 跳过 {pkg_key}: 不存在 {src}", file=sys.stderr)
            continue
        key_src = compute_key(src)
        print(f"  [wsl] {pkg_key} 就绪: {src}  (key={key_src})")

    # ── 委托 Windows 侧 Python 执行复制 ──
    # 跑 stage 的是 WSL 里的 Python，它访问不到 \\wsl.localhost\\... 这类 UNC
    # 路径（os.path.isdir 直接 False），所以复制必须在 Windows 上发生。
    # 但这里不写任何 pwsh 代码：真正的逻辑在 scripts/wsl_peer_stage.py 里，
    # pwsh 只负责把那个 .py 用 python 拉起来（见 run_windows_python）。
    pkg_names = [PACKAGES[k]["dir"] for k in PACKAGES]
    r = run_windows_python(
        pwsh, args=["--win-stage", wp_unc.src_dir, ",".join(pkg_names)],
        repo_root_unc=wp_unc.src_dir, timeout=600,
    )
    if r.returncode != 0:
        print(f"  [!] stage 失败:\n{r.stderr[-800:]}", file=sys.stderr)
        raise RuntimeError("stage 失败")
    if r.stdout.strip():
        print(r.stdout.rstrip())
    if r.stderr.strip():
        print(f"  [peer stderr] {r.stderr.rstrip()}", file=sys.stderr)
    print("\n✓ 完成")


def pnpm_install_on_wsl_peer(pkg_key: str) -> None:
    """让 WSL 端从源码路径 pnpm add -g。

    必须先跑 pnpm install --ignore-scripts：pnpm add -g 不解析 workspace:*
    也不装第三方依赖，CLI 运行时依赖全靠源码树自己的 node_modules。
    """
    wsl = find_wsl_exe()
    spec = PACKAGES[pkg_key]
    pkg_dir = PACKAGES_DIR / spec["dir"]

    # 把 Windows 路径翻译成 WSL 路径
    def win_to_wsl(p: Path) -> str:
        s = str(p).replace("\\", "/")
        # D:\CodeRelated\... → /mnt/d/CodeRelated/...
        if len(s) >= 2 and s[1] == ":":
            drive = s[0].lower()
            s = f"/mnt/{drive}{s[2:]}"
        return s

    root_wsl = win_to_wsl(PROJECT_ROOT)
    pkg_wsl = win_to_wsl(pkg_dir)

    cmd = (
        f"cd '{root_wsl}' && pnpm install --ignore-scripts && "
        f"pnpm add -g --ignore-scripts '{pkg_wsl}'"
    )
    run_wsl_in_windows(wsl, cmd, f"WSL 端 pnpm add -g {pkg_key}")


# ──────────────────────────────────────────────────────────────────────────
# 主流程
# ──────────────────────────────────────────────────────────────────────────

def deploy_one(pkg_key: str, no_deploy: bool, peer: bool, target_platform: str = None,
               dry_run: bool = False, fail_on_peer: bool = False, skip_build: bool = False) -> None:
    spec = PACKAGES[pkg_key]
    pkg_dir = PACKAGES_DIR / spec["dir"]
    env = detect_env()
    print(f"\n{'=' * 60}")
    print(f"  目标: {pkg_key}  (kind={spec['kind']})  环境: {env}"
          + ("  [dry-run]" if dry_run else ""))
    print(f"{'=' * 60}")

    # 1) 构建（Go 包才有）
    if skip_build:
        print("\n[1/4] --skip-build 指定，跳过构建（直接复用已有产物）")
        if no_deploy:
            return
    elif dry_run:
        # --dry-run 必须只读：不跑 go build / npm build，只打印将要构建什么
        spec_k = spec["kind"]
        if spec_k == "go-cli":
            # 推断目标平台
            cur = current_platform()
            if target_platform:
                goos_map = {"windows": ("windows", "amd64"),
                            "linux": ("linux", "amd64"),
                            "darwin": ("darwin", "arm64")}
                goos, goarch = goos_map.get(target_platform, cur)
            else:
                goos, goarch = cur
            out = (pkg_dir / "bin" / GOOS_ARCH_TO_PLATFORM_DIR[goos]
                   / f"{spec['bin_name']}{'.exe' if goos == 'windows' else ''}")
            print(f"  [dry-run] 将构建 {pkg_key} {goos}/{goarch} → {out}")
        else:
            build_cmd = "pnpm run build"
            print(f"  [dry-run] 将执行: cd {pkg_dir} && {build_cmd}")
    else:
        build(pkg_key, target_platform=target_platform)
        # JS 包有 build 脚本时也需要构建
        if spec["kind"] != "go-cli":
            build_js(pkg_key)

    if no_deploy:
        print("\n  --no-deploy 指定，跳过部署")
        return

    # 2) 本机卸载云端冲突 + 安装本地
    # DSH插件不需要全局安装，跳过
    if not spec.get("plugin"):
        print("\n[2/4] 本机卸载云端冲突包...")
        uninstall_cloud_conflicts(pkg_key, "local")
        print("\n[3/4] 本机 pnpm add -g ...")
        ensure_workspace_deps()
        pnpm_global_install(pkg_key)
    else:
        print("\n[2/4] DSH插件，跳过全局安装")

    # 3) 对端同步：默认关闭。
    # 指定 --target-platform linux 就只构建+部署 linux，绝不碰对端；
    # 需要同步到 Windows 时显式加 --peer。
    if not peer:
        print("\n[4/4] 未指定 --peer，跳过对端同步（只处理本机）")
        return

    print("\n[4/4] 对端同步...")
    sync_peer(pkg_key, spec, env, fail_on_error=fail_on_peer)


def sync_peer(pkg_key: str, spec: dict, env: str, fail_on_error: bool = False) -> None:
    """对端同步（插件包跑 dsh plugin add；其余包 stage + 对端 pnpm add -g）。

    对端同步是尽力而为：本机（linux/darwin/windows）已经构建+部署完，
    对端失败不应该让整个构建失败（比如 Windows pnpm 未配置 global bin dir）。
    默认只告警；需要严格中断时传 fail_on_error=True。
    """
    if env == "wsl" and not find_pwsh():
        print("  [!] 当前无 pwsh，跳过对端同步")
        return

    # 仓库在 Windows 侧的 UNC 视图，一次算好往下传（路径计算不散落各处）
    wp_unc = get_wsl_unc_paths(find_pwsh(), PROJECT_ROOT)
    repo_root_unc = wp_unc.src_dir

    def _run() -> None:
        if spec.get("plugin"):
            if env == "wsl":
                # WSL 端直接安装插件
                print("  WSL 端: dsh plugin --profile web add ...")
                run(["dsh", "plugin", "--profile", "web", "add", str(PACKAGES_DIR / spec["dir"])],
                    cwd=PROJECT_ROOT)
                # Windows 对端：只 stage 本插件包（复用 --win-stage，带 pkgs 过滤）。
                # 不能在这里 Path(UNC).mkdir() —— WSL 里 UNC 字符串是相对路径，
                # 会在 CWD 下创建垃圾目录（历史事故）。
                print("  Windows 对端: stage 插件包 + dsh plugin add ...")
                pwsh0 = find_pwsh()
                r = run_windows_python(
                    pwsh0, args=["--win-stage", repo_root_unc, spec["dir"]],
                    repo_root_unc=repo_root_unc, timeout=300,
                )
                if r.returncode != 0:
                    print(f"  [!] 插件 stage 失败:\n{r.stderr[-800:]}", file=sys.stderr)
                    raise RuntimeError("插件 stage 失败")
                if r.stdout.strip():
                    print(r.stdout.rstrip())
                wp = get_win_paths(pwsh0)
                win_pkg_dir = win_join(wp.src_dir, "packages", spec["dir"])
                r = run_pwsh_cmd(pwsh0,
                                 f'dsh plugin --profile web add "{win_pkg_dir}"',
                                 timeout=120)
                if r.returncode != 0:
                    print(f"[✗] Windows 端 dsh plugin add 失败:\n{r.stdout[-500:]}",
                          file=sys.stderr)
                    raise SystemExit("[✗] Windows 端 dsh plugin add 失败")
            elif env == "windows":
                print("  Windows 端: dsh plugin --profile web add ...")
                pwsh = find_pwsh()
                win_path = (PACKAGES_DIR / spec["dir"]).as_posix().replace("/", "\\")
                run_pwsh_cmd(pwsh, f'dsh plugin --profile web add "{win_path}"',
                             timeout=120).check("Windows 端 dsh plugin add")
                # WSL 对端：通过 WSL 安装
                wsl = find_wsl_exe()
                if wsl:
                    wsl_path = (PACKAGES_DIR / spec["dir"]).as_posix()
                    run_wsl_in_windows(wsl, f'dsh plugin --profile web add "{wsl_path}"',
                                        "WSL 对端 dsh plugin add")
            else:
                print(f"  当前环境 {env} 无对端概念，跳过")
        else:
            if env == "wsl":
                uninstall_cloud_conflicts(pkg_key, "windows-peer")
                stage_all_for_windows_peer(no_cache=False, repo_root_unc=repo_root_unc)
                npm_install_on_windows_peer([pkg_key], repo_root_unc, staging_win="")
            elif env == "windows":
                uninstall_cloud_conflicts(pkg_key, "wsl-peer")
                pnpm_install_on_wsl_peer(pkg_key)
            else:
                print(f"  当前环境 {env} 无对端概念，跳过")

    if fail_on_error:
        _run()
        return
    try:
        _run()
    except (RuntimeError, subprocess.CalledProcessError, SystemExit) as e:
        print(f"\n  [!] 对端同步失败（本机构建+部署已成功，继续）：{e}")


def infer_pkg_key(short: str) -> str | None:
    """将短名映射到 PACKAGES 中的键。"""
    if short in PACKAGES:
        return short
    # 反向查找（支持 aek-websearch-win32-x64 → aek-websearch 等）
    for k, v in PACKAGES.items():
        if v["dir"] == short or v.get("bin_name") == short:
            return k
    return None


# 注：esbuild 式的平台子包版本同步（platforms/<os>-<arch>/）已随平台分包一起废弃，
# 现在二进制直接落在 packages/<pkg>/bin/<linux|macos|win>/，没有独立子包可同步。


def dispatch_win_peer_op(argv: list[str]) -> int | None:
    """Windows 侧入口：argv 以 --win-* 开头时处理并返回退出码，否则返回 None。

    这就是「不写多余 .py」的关键：WSL 侧把 build_deploy.py 自己传给 Windows 的
    python 执行，靠这些 --win-* 标记决定干哪件事，真正逻辑全在 shared 模块。
    """
    if not argv or not argv[0].startswith("--win-"):
        return None
    if len(argv) < 2:
        print(f"[!] {argv[0]} 参数不足", file=sys.stderr)
        return 2
    op, a = argv[0], argv[1]
    if op == "--win-stage":
        pkgs = [x.strip() for x in argv[2].split(",") if x.strip()] if len(argv) > 2 else []
        return win_stage(a, pkgs)
    if op == "--win-pnpm-install":
        pnpm_home = argv[2] if len(argv) > 2 else ""
        extra = [x for x in argv[3].split(",") if x] if len(argv) > 3 else []
        return win_pnpm_install(a, pnpm_home, extra)
    if op == "--win-global-install":
        names = [x for x in a.split(",") if x]
        pnpm_home = argv[2] if len(argv) > 2 else ""
        extra = [x for x in argv[3].split(",") if x] if len(argv) > 3 else []
        return win_global_install(names, pnpm_home, extra)
    if op == "--win-uninstall":
        names = [x for x in a.split(",") if x]
        pnpm_home = argv[2] if len(argv) > 2 else ""
        extra = [x for x in argv[3].split(",") if x] if len(argv) > 3 else []
        return win_uninstall_pkgs(names, pnpm_home, extra)
    if op == "--win-shims":
        if len(argv) < 4:
            print("[!] --win-shims 需要 <repo_root_unc> <pkg_dir> <bin_dir>", file=sys.stderr)
            return 2
        return win_create_shims(a, argv[2], argv[3])
    print(f"[!] 未知 Windows 侧操作: {op}", file=sys.stderr)
    return 2

def main() -> None:
    w = dispatch_win_peer_op(sys.argv[1:])
    if w is not None:
        sys.exit(w)
    parser = argparse.ArgumentParser(
        description="AEK 统一开发构建+部署脚本",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
--only 动作（逗号分隔）：
  stage          仅 stage 源码到 Windows workspace（仅 WSL 环境）
  install-win    仅 Windows pnpm install + shim（不含 Go 编译）
  compile-win    仅通过 pwsh 在 Windows 端 go build（仅 WSL 环境）
  all            完整流水线（默认）

--target-platform 选项（只影响 Go 交叉编译，不限执行环境）：
  linux          编译 linux/amd64（默认=本机平台）
  windows        编译 windows/amd64
  darwin         编译 darwin/arm64

  没有 both 选项：要编对端就显式传 --target-platform <平台>。

对端同步（默认关闭）：
  不传 --peer   → 只构建+部署本机（--target-platform linux 就只碰 linux）
  加 --peer     → 另外 stage 到对端并在对端 pnpm add -g / dsh plugin add
  --fail-on-peer → 配合 --peer，对端失败就中断（默认只告警）

示例：
  # 全部包，本机平台，构建+部署（不碰对端）
  python3 scripts/build_deploy.py

  # 仅编译 linux（本机/WSL 最常用）
  python3 scripts/build_deploy.py --target-platform linux

  # 只构建单个包，不部署
  python3 scripts/build_deploy.py aek-mcp --no-deploy

  # 单包构建+部署到本机，并且同步到 Windows 对端
  python3 scripts/build_deploy.py aek-mcp --peer

  # 仅 stage + 安装
  python3 scripts/build_deploy.py --only stage,install-win --no-cache
        """,
    )
    parser.add_argument("target", nargs="?", choices=list(PACKAGES.keys()) + ["all-npm"],
                        help="要构建/部署的目标包")
    parser.add_argument("--no-deploy", action="store_true", help="只构建不部署")
    parser.add_argument("--peer", action="store_true",
                        help="同时同步到对端（WSL↔Windows：stage + 对端 pnpm add -g / dsh plugin add）。\n"
                             "默认关闭 —— 只构建+部署本机，不碰对端。")
    parser.add_argument("--fail-on-peer", action="store_true",
                        help="配合 --peer 使用：对端同步失败时中断（默认只告警，本机构建+部署结果不受影响）")
    parser.add_argument("--skip-peer", action="store_true",
                        help="[已废弃] 对端同步现在默认关闭，用 --peer 显式开启")
    parser.add_argument("--peer-only", action="store_true",
                        help="只做对端同步（stage + pnpm install + pnpm add -g），"
                             "不跑本机构建/部署。仅 WSL 环境可用")
    parser.add_argument("--peer-pkgs", default=None,
                        help="配合 --peer/--peer-only：只同步这些包（逗号分隔包 key），"
                             "默认=--peer-only 时为全部非插件包")
    parser.add_argument("--skip-build", action="store_true",
                        help="跳过构建阶段，复用已有产物（仅影响本机 deploy 流程）")
    parser.add_argument("--no-cache", action="store_true",
                        help="跳过缓存，强制全量复制所有包到 Windows workspace")
    parser.add_argument("--only", default=None,
                        help="细粒度动作：stage,install-win,compile-win,all（逗号分隔）")
    parser.add_argument("--dry-run", action="store_true",
                        help="只打印路径和命令，不实际执行（可与 --only 配合使用）")
    parser.add_argument("--test", action="store_true",
                        help="运行 test_windows_workspace 验证 Windows workspace 配置")
    parser.add_argument("--target-platform", default=None, choices=["linux", "windows", "darwin"],
                        help="编译目标平台（仅影响 Go 交叉编译，不限执行环境）：\n"
                             "  linux    编译 linux/amd64 二进制\n"
                             "  windows  编译 windows/amd64 二进制\n"
                             "  darwin   编译 darwin/arm64 二进制\n"
                             "  默认=本机平台。任意环境都可编译任意目标，编译阶段不拦截")
    parser.add_argument("--deploy-target", default=None,
                        choices=["windows", "linux", "darwin"],
                        help="部署目标平台（严格强制，违规即截停）：\n"
                             "  windows/linux/darwin  部署到该平台\n"
                             "  默认=当前执行环境的本机平台（wsl=linux）\n"
                             "  跨端示例：wsl 环境传 --deploy-target windows → wsl 仅触发 Windows 跑本脚本\n"
                             "  linux/darwin 环境传 --deploy-target windows 会截停报错")
    parser.add_argument("--pkg", default=None, choices=list(PACKAGES.keys()) + ["js", "go"],
                        help="只编译指定包（或 'go' 只编所有 Go 包，'js' 只编所有 JS 包）")
    args = parser.parse_args()

    print(f"PROJECT_ROOT: {PROJECT_ROOT}")

    # 显著打印当前执行环境 + 部署目标校验结果（违规立即截停）
    # 编译不拦截环境；部署严格强制。详见 print_env_banner 注释。
    print_env_banner(deploy_target=args.deploy_target, target_platform=args.target_platform,
                     peer_sync=args.peer)

    # 解析部署目标（banner 已校验，违规会截停；这里再解析一次得到平台列表）
    env = detect_env()
    cur_platform = CURRENT_ENV_TO_PLATFORM[env]
    deploy_targets = resolve_deploy_targets(env, args.deploy_target)

    # ── --peer-only：只做对端同步，跳过本机构建/部署 ──
    if args.peer_only:
        env0 = detect_env()
        if env0 != "wsl":
            print("[!] --peer-only 仅 WSL 环境支持"); sys.exit(2)
        pwsh = find_pwsh()
        if not pwsh:
            print("[!] 找不到 PowerShell，--peer-only 不可用"); sys.exit(2)
        if args.peer_pkgs:
            keys = [k.strip() for k in args.peer_pkgs.split(",") if k.strip()]
            for k in keys:
                if k not in PACKAGES:
                    print(f"[!] 未知包: {k}"); sys.exit(2)
        elif args.target and args.target != "all-npm":
            keys = [args.target]
        else:
            keys = [k for k in PACKAGES if not PACKAGES[k].get("plugin")]
        print(f"\n▶ 仅对端同步（跳过本机）: {', '.join(keys)}")
        repo_root_unc = get_wsl_unc_paths(pwsh, PROJECT_ROOT).src_dir
        for k in keys:
            uninstall_cloud_conflicts(k, "windows-peer")
        stage_all_for_windows_peer(no_cache=args.no_cache, repo_root_unc=repo_root_unc)
        npm_install_on_windows_peer(keys, repo_root_unc)
        print("\n✓ 完成")
        return

    # ── 委派判定：deploy_targets 里若有非本机平台，本端只做委派 ──
    # 用户语义：wsl + --deploy-target windows → wsl 只触发 Windows 跑本脚本，
    # 自己不 stage/build/install 任何东西。
    # 本判定必须在 --test / --only / 默认 deploy 三种模式之前。
    peer_platforms = [p for p in deploy_targets if p != cur_platform]
    if peer_platforms:
        # 把要委派的每个对端平台找出来对应的 env 名
        peer_envs = []
        for p in peer_platforms:
            e = DEPLOY_PLATFORM_TO_ENV.get(p)
            if not e:
                print(f"[✗] 平台 {p} 无可委派的环境", file=sys.stderr)
                sys.exit(2)
            peer_envs.append((p, e))

        print()
        print("▶ 跨端委派模式")
        for p, e in peer_envs:
            print(f"  本端 {env} 不部署到 {p}，委派 {e} 执行本脚本")
        # 逐个委派；本端不做任何 build/stage/install
        for p, e in peer_envs:
            # extra_args 为空：delegate_to_peer 内部会自动加 --deploy-target <peer_platform>
            delegate_to_peer(e, [], dry_run=args.dry_run)
        sys.exit(0)

    # 到这里：所有 deploy_targets 都是本端平台。进入本机部署流程。

    # --test 模式：验证 Windows workspace
    if args.test:
        pwsh = find_pwsh()
        if not pwsh:
            print("[!] 找不到 PowerShell，仅 WSL 环境支持 --test"); sys.exit(2)
        sys.exit(test_windows_workspace(pwsh, verbose=True))

    # --only 模式：细粒度动作
    if args.only:
        actions = [a.strip() for a in args.only.split(",") if a.strip()]
        target = args.target or "all-npm"
        if target == "all-npm":
            # 根据 --pkg 过滤
            if args.pkg == "go":
                go_order = ["aek-websearch", "aek-mcp", "aek-task-manager"]
                js_order = []
            elif args.pkg == "js":
                go_order = []
                js_order = ["aek-prompt-manager", "aek-skill-manager",
                            "aek-browser", "aek-dsh", "aek"]
            elif args.pkg:
                go_order = [args.pkg] if PACKAGES[args.pkg]["kind"] == "go-cli" else []
                js_order = [args.pkg] if PACKAGES[args.pkg]["kind"] != "go-cli" else []
            else:
                go_order = ["aek-websearch", "aek-mcp", "aek-task-manager"]
                js_order = ["aek-prompt-manager", "aek-skill-manager",
                            "aek-browser", "aek"]
            all_order = go_order + js_order
        else:
            go_order = [target] if PACKAGES[target]["kind"] == "go-cli" else []
            js_order = [target] if PACKAGES[target]["kind"] != "go-cli" else []
            all_order = [target]

        def run_action(action: str) -> None:
            if action == "stage":
                if detect_env() != "wsl":
                    print("[!] stage 动作仅 WSL 环境支持"); sys.exit(2)
                if args.dry_run:
                    pwsh = find_pwsh()
                    if pwsh:
                        wp = get_wsl_win_paths(pwsh)
                        print(f"  [dry-run] Windows workspace: {wp.src_dir}")
                        print(f"  [dry-run] packages_dir:     {wp.packages_dir}")
                        for k in all_order:
                            print(f"  [dry-run]   {k} → {wp.packages_dir}/{PACKAGES[k]['dir']}")
                    return
                stage_all_for_windows_peer(no_cache=args.no_cache)
                return

            if action == "install-win":
                if detect_env() != "wsl":
                    print("[!] install-win 仅 WSL 环境支持"); sys.exit(2)
                stage_all_for_windows_peer(no_cache=args.no_cache)
                for k in all_order:
                    if args.dry_run:
                        print(f"  [dry-run] {k}: pnpm install (workspace)")
                        spec = PACKAGES[k]
                        bin_map = spec.get("bin", {})
                        for bn in bin_map:
                            print(f"    shim: {bn}.ps1")
                        continue
                    deploy_one(k, no_deploy=False, peer=False, target_platform=args.target_platform, dry_run=args.dry_run, fail_on_peer=args.fail_on_peer, skip_build=args.skip_build)
                return

            if action == "compile-win":
                if detect_env() != "wsl":
                    print("[!] compile-win 仅 WSL 环境支持"); sys.exit(2)
                # 必须显式指定 --pkg
                if not args.pkg:
                    print("[!] compile-win 必须指定 --pkg，例如：--pkg aek-mcp")
                    print("   可选: go（所有 Go 包）或具体包名")
                    sys.exit(2)
                pwsh = find_pwsh()
                if not pwsh:
                    print("[!] 找不到 PowerShell"); sys.exit(2)
                wp = get_win_paths(pwsh)
                if args.dry_run:
                    print("[dry-run] 将编译 Windows Go 二进制:")
                    for k in go_order:
                        spec = PACKAGES[k]
                        out = wp.platform_bin(spec["dir"], "win32-x64", f"{spec['bin_name']}.exe")
                        print(f"  {k} → {out}")
                    return
                win_up = wp.user_profile
                for k in go_order:
                    print(f"\n[compile-win] {k}")
                    _build_go_on_windows_via_pwsh(k, pwsh, win_up, dry_run=args.dry_run)
                return

            if action == "all":
                for k in all_order:
                    deploy_one(k, no_deploy=False, peer=args.peer, target_platform=args.target_platform, dry_run=args.dry_run, fail_on_peer=args.fail_on_peer, skip_build=args.skip_build)
                return

            print(f"[!] 未知动作: {action}"); sys.exit(2)

        for action in actions:
            print(f"\n{'=' * 60}")
            print(f"  动作: {action}")
            print(f"{'=' * 60}")
            run_action(action)

        print("\n✓ 完成")
        return

    # 默认 deploy 模式
    target = args.target or "all-npm"
    if target == "all-npm":
        order = ["aek-websearch", "aek-mcp", "aek-task-manager",
                 "aek-prompt-manager", "aek-skill-manager", "aek-browser", "aek-dsh", "aek"]
        for k in order:
            deploy_one(k, args.no_deploy, args.peer, target_platform=args.target_platform, dry_run=args.dry_run, fail_on_peer=args.fail_on_peer, skip_build=args.skip_build)
    else:
        deploy_one(target, args.no_deploy, args.peer, target_platform=args.target_platform, dry_run=args.dry_run, fail_on_peer=args.fail_on_peer, skip_build=args.skip_build)

    print("\n✓ 完成")


def test_windows_workspace(pwsh: str, verbose: bool = True) -> int:
    """测试 Windows 侧 pnpm workspace 是否正确配置。"""
    import json as _json

    errors: list[str] = []
    # 用 WSL 挂载路径（/mnt/c/...）让 WSL Python 能直接读写
    wp = get_wsl_win_paths(pwsh)
    src_dir = Path(wp.src_dir)
    packages_dir = Path(wp.packages_dir)

    # 1. package.json 有 workspaces
    pkg_json_path = src_dir / "package.json"
    if pkg_json_path.exists():
        with open(pkg_json_path) as f:
            root_meta = _json.load(f)
        wss = root_meta.get("workspaces", [])
        if "packages/*" not in wss:
            errors.append(f"package.json 缺少 workspaces='packages/*': {wss}")
        if verbose:
            print(f"  [workspaces] {wss}")
    else:
        errors.append("package.json 不存在")

    # 2. aek/package.json 依赖是 workspace:*
    aek_pkg_json = packages_dir / "aek" / "package.json"
    if aek_pkg_json.exists():
        with open(aek_pkg_json) as f:
            aek_meta = _json.load(f)
        deps = aek_meta.get("dependencies", {})
        bad_deps = {k: v for k, v in deps.items() if v != "workspace:*" and k.startswith("@cheezmil/")}
        if bad_deps:
            errors.append(f"aek/package.json 有非 workspace:* 依赖: {bad_deps}")
        if verbose:
            print(f"  [aek deps] {deps}")
    else:
        errors.append("aek/package.json 不存在")

    # 3. 所有包存在
    for pkg_key, spec in PACKAGES.items():
        pkg_path = packages_dir / spec["dir"]
        if not pkg_path.exists():
            errors.append(f"包 {pkg_key} 不在 {pkg_path}")
        elif verbose:
            print(f"  [✓] {pkg_key}: {pkg_path}")

    # 4. pnpm install --dry-run 检查
    if not errors:
        check_cmd = f"""
Set-Location '{wp.src_dir}'
$ErrorActionPreference = 'Stop'
try {{
    $result = pnpm install --dry-run 2>&1 | Out-String
    if ($result -match 'ERR_PNPM_FETCH_404') {{
        Write-Host "FAIL:$result"
        exit 1
    }}
    Write-Host "PASS:workspace resolved"
}} catch {{
    Write-Host "ERROR:$_"
    exit 1
}}
"""
        r = run_pwsh_cmd(pwsh, check_cmd, timeout=60)
        out = r.stdout.strip()
        if r.returncode != 0 or "FAIL" in out or "ERROR" in out:
            errors.append(f"pnpm install --dry-run 失败: {out[:500]}")
        elif verbose:
            print(f"  [✓] pnpm workspace 解析正常")

    if errors:
        print("\n[✗] 验证失败:")
        for e in errors:
            print(f"  - {e}")
        return 1
    else:
        print("\n[✓] Windows workspace 验证通过")
        return 0



if __name__ == "__main__":
    # Windows 端 python 默认用 GBK，会崩在中文/emoji 输出上。
    # 强制 stdout/stderr 用 UTF-8（errors=replace 兜底），跨端一致。
    import sys as _sys
    if hasattr(_sys.stdout, "reconfigure"):
        try:
            _sys.stdout.reconfigure(encoding="utf-8", errors="replace")
            _sys.stderr.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass
    main()
