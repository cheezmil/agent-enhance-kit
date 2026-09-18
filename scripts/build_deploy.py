#!/usr/bin/env python3
"""AEK 统一开发构建 + 部署脚本（单一入口，禁止再分散到 packages/*/scripts/）。

用法：
  python3 scripts/build_deploy.py <target> [--no-deploy] [--skip-peer]
  python3 scripts/build_deploy.py --target-platform windows --pkg aek-mcp
  python3 scripts/build_deploy.py --target-platform both --pkg all

  <target>:
    aek-websearch      Go CLI + npm 包
    aek-mcp            Go CLI + npm 包
    aek-task-manager   Go CLI + npm 包
    aek-prompt-manager 纯 JS npm 包
    aek-skill-manager  纯 JS npm 包
    aek-browser        纯 JS npm 包
    aek-common         纯 JS npm 包
    aek                纯 JS npm 元包
    all-npm            所有 npm 包（不含 mcp 前端/后端服务）

  --no-deploy          只构建，不 npm install -g
  --skip-peer          跳过对端同步（WSL/Windows 双端环境）
  --target-platform    指定编译目标平台：
                         linux   仅本机 Linux 二进制（默认）
                         windows 仅 Windows 二进制
                         both    编译本机 + 对端平台

行为：
  - 自动检测当前环境（wsl / windows / linux / darwin）
  - Go 包：按 --target-platform 编译指定平台二进制
  - npm 包：本机 npm install -g
  - WSL↔Windows 双端：默认不同步对端，需 --target-platform both 才编译对端
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
from shared.start_scripts_shared_logic import is_win, py_exe, get_win_paths, get_wsl_win_paths, windows_path_to_wsl, get_wsl_unc_paths, get_wsl_pkg_unc_paths

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
        "platform_pkg": "@cheezmil/aek-websearch-{goos}-{goarch}",
        "platforms_dir": "platforms",
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
        "platforms_dir": "platforms",
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
    "aek-common": {
        "dir": "aek-common",
        "kind": "js-cli",
        "npm": "@cheezmil/aek-common",
        "conflict_npm_names": ["@cheezmil/aek-common"],
    },
    "aek": {
        "dir": "aek",
        "kind": "meta",
        "npm": "@cheezmil/aek",
        "conflict_npm_names": ["@cheezmil/aek"],
    },
}

# 额外的全局清理目标（云端历史残留）
GLOBAL_CONFLICT_EXTRA = ["aek-common"]  # 防止 aek-common 单独留在全局


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


def find_pwsh() -> str | None:
    """在 WSL 中找 Windows PowerShell，动态查找避免硬编码路径。"""
    if detect_env() != "wsl":
        return None
    # 通过 where.exe 动态查找 pwsh.exe，不硬编码路径
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
    # 兜底：尝试常见位置
    for p in [
        "/mnt/c/Program Files/PowerShell/7/pwsh.exe",
        "/mnt/c/Program Files (x86)/PowerShell/7/pwsh.exe",
        "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe",
    ]:
        if Path(p).exists():
            return p
    return None


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


def run_pwsh(pwsh: str, script: str, label: str) -> None:
    """从 WSL 调 Windows pwsh 执行脚本。"""
    print(f"  [pwsh] {label}")
    r = subprocess.run([pwsh, "-Command", script], capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stdout)
        print(r.stderr, file=sys.stderr)
        raise SystemExit(f"[✗] {label} 失败（exit={r.returncode}）")
    if r.stdout.strip():
        print(r.stdout)


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
# 构建
# ──────────────────────────────────────────────────────────────────────────

def build_go(pkg_key: str, target_goos: str, target_goarch: str, out_suffix: str = "") -> Path:
    """交叉编译 Go 二进制，返回输出路径。"""
    spec = PACKAGES[pkg_key]
    pkg_dir = PACKAGES_DIR / spec["dir"]
    bin_name = spec["bin_name"]
    ext = ".exe" if target_goos == "windows" else ""
    out_name = f"{bin_name}{ext}"
    out_path = pkg_dir / "bin" / out_name

    cmd = list(spec["go_cmd"])
    # 替换 None 为输出路径
    for i, c in enumerate(cmd):
        if c is None:
            cmd[i] = str(out_path)

    env_extra = {"GOOS": target_goos, "GOARCH": target_goarch, "CGO_ENABLED": "0"}
    print(f"  build {pkg_key} for {target_goos}/{target_goarch} → {out_path}")
    run(cmd, cwd=pkg_dir, env_extra=env_extra)

    # 同步到 platforms/<npm-platform>/bin/（npm 子包布局要求）
    # Go 的 (goos, goarch) 与 npm 命名不同：
    #   go:  windows/amd64  ↔  npm: win32-x64
    #   go:  darwin/arm64   ↔  npm: darwin-arm64
    if "platforms_dir" in spec:
        npm_os = {"windows": "win32", "darwin": "darwin", "linux": "linux"}[target_goos]
        npm_arch = {"amd64": "x64", "arm64": "arm64"}[target_goarch]
        plat_dir = pkg_dir / spec["platforms_dir"] / f"{npm_os}-{npm_arch}" / "bin"
        plat_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(out_path, plat_dir / out_name)
        print(f"  同步到平台子包目录: {plat_dir / out_name}")

    return out_path


# (goos, goarch) → npm platform key（用于 --target-platform 参数映射）
GOOS_ARCH_TO_NPM_PLATFORM = {
    ("linux", "amd64"): "linux-x64",
    ("linux", "arm64"): "linux-arm64",
    ("darwin", "amd64"): "darwin-x64",
    ("darwin", "arm64"): "darwin-arm64",
    ("windows", "amd64"): "win32-x64",
    ("windows", "arm64"): "win32-arm64",
}


def build(
    pkg_key: str,
    target_platform: str | None = None,
    also_peer: bool = False,
) -> dict[str, Path]:
    """构建 Go 包二进制。

    默认行为：只编译本机平台。
    要编译对端平台，使用 target_platform="both" 或 also_peer=True。

    参数:
        pkg_key: 包名
        target_platform: 目标平台选择
            - None / "local"   → 只编译本机平台（默认）
            - "windows"         → 只编译 Windows 二进制
            - "linux"           → 只编译 Linux 二进制
            - "both" / also_peer=True → 编译本机 + 对端
        also_peer: 向后兼容参数，等价于 target_platform="both"

    返回:
        {goos: bin_path} 输出路径映射
    """
    spec = PACKAGES[pkg_key]
    if spec["kind"] != "go-cli":
        print(f"  {pkg_key} 是纯 JS 包，无需构建")
        return {}

    env = detect_env()

    # 统一 also_peer → target_platform 语义
    if also_peer:
        target_platform = "both"

    # 计算要编译的平台列表
    targets: list[tuple[str, str]] = []  # [(goos, goarch), ...]
    native = current_platform()  # (goos, goarch)

    if target_platform in (None, "local"):
        targets.append(native)
    elif target_platform == "windows":
        targets.append(("windows", "amd64"))
    elif target_platform == "linux":
        targets.append(("linux", "amd64"))
    elif target_platform == "both":
        targets.append(native)
        # 仅 WSL↔Windows 有对端概念；其他平台无对端
        if env == "wsl":
            targets.append(("windows", "amd64"))
        elif env == "windows":
            targets.append(("linux", "amd64"))
    else:
        raise ValueError(f"未知 target_platform: {target_platform!r}")

    outputs: dict[str, Path] = {}
    for goos, goarch in targets:
        outputs[goos] = build_go(pkg_key, goos, goarch)

    return outputs


def _build_go_on_windows_via_pwsh(pkg_key: str, pwsh: str, win_user_profile: str, dry_run: bool = False) -> None:
    """通过 PowerShell 在 Windows 端编译 Go 二进制。

    前提：Windows 侧必须有源码（通过 stage 或手动复制）。
    输出到 C:\\Users\\<user>\\.aek\\src\\packages\\<pkg>\\platforms\\win32-x64\\bin\\
    """
    spec = PACKAGES[pkg_key]
    pkg_dir = spec["dir"]
    bin_name = spec["bin_name"]
    build_target = spec["go_cmd"][4] if len(spec["go_cmd"]) > 4 else "./cmd/aek"

    # Windows 路径（供 pwsh 使用）
    out_dir = f"{win_user_profile}\\.aek\\src\\packages\\{pkg_dir}\\platforms\\win32-x64\\bin"
    out_file = f"{out_dir}\\{bin_name}.exe"
    src_on_win = f"{win_user_profile}\\.aek\\src\\packages\\{pkg_dir}"

    if dry_run:
        print(f"  [dry-run] {pkg_key} → {out_file}")
        return

    # 检查 Windows 侧是否有源码（stage 已复制到 /mnt/c/Users/xdx/.aek/src/packages/）
    check_src_cmd = f"Test-Path '{src_on_win}\\package.json'"
    r = subprocess.run([pwsh, "-Command", check_src_cmd], capture_output=True, text=True)
    if r.stdout.strip().lower() != "true":
        raise RuntimeError(
            f"[!] {pkg_key} Windows 侧缺少源码（{src_on_win}）。\\n"
            f"    请先运行: python3 scripts/build_deploy.py --only stage"
        )

    # 确保输出目录存在
    mkdir_cmd = f"New-Item -ItemType Directory -Force -Path '{out_dir}'"
    subprocess.run([pwsh, "-Command", mkdir_cmd], capture_output=True, check=True)

    # Go 编译命令
    build_cmd = (
        f"$env:GOOS='windows'; "
        f"$env:GOARCH='amd64'; "
        f"$env:CGO_ENABLED='0'; "
        f"Set-Location '{src_on_win}'; "
        f"go build -o '{out_file}' {build_target}"
    )

    print(f"  build {pkg_key} for windows/amd64 → {out_file}")
    r = subprocess.run([pwsh, "-Command", build_cmd], capture_output=True, text=True, timeout=180)
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
    """卸载本机/对端的云端冲突包。where: 'local' / 'windows-peer' / 'wsl-peer'"""
    spec = PACKAGES[pkg_key]
    names = list(spec["conflict_npm_names"])
    if pkg_key != "aek-common":
        names.extend(GLOBAL_CONFLICT_EXTRA)

    if where == "local":
        for n in names:
            run(["npm", "uninstall", "-g", n], check=False)
    elif where == "windows-peer":
        pwsh = find_pwsh()
        if not pwsh:
            print("  [!] 无 pwsh，跳过对端卸载")
            return
        joined = ", ".join(f"'{n}'" for n in names)
        ps = f"""
$ErrorActionPreference = 'Continue'
foreach ($n in @({joined})) {{
  Write-Host "  uninstalling $n ..."
  npm uninstall -g $n 2>&1 | Out-Null
}}
"""
        run_pwsh(pwsh, ps, f"卸载对端冲突包: {pkg_key}")
    elif where == "wsl-peer":
        wsl = find_wsl_exe()
        if not wsl:
            print("  [!] 无 wsl.exe，跳过对端卸载")
            return
        joined = " ".join(names)
        run_wsl_in_windows(wsl, f"npm uninstall -g {joined} 2>/dev/null || true", f"卸载对端冲突包: {pkg_key}")


def npm_install_local(pkg_key: str) -> None:
    """本机 npm install -g 当前包目录。"""
    spec = PACKAGES[pkg_key]
    pkg_dir = PACKAGES_DIR / spec["dir"]
    print(f"  npm install -g {pkg_dir}")
    run(["npm", "install", "-g", "."], cwd=pkg_dir)


def stage_for_windows_peer(pkg_key: str) -> str:
    """在 WSL 侧把包拷贝到 Windows 原生 staging 目录，返回 Windows 视角路径。"""
    env = detect_env()
    if env != "wsl":
        raise RuntimeError("stage_for_windows_peer 仅 WSL 可用")

    spec = PACKAGES[pkg_key]
    pkg_dir = PACKAGES_DIR / spec["dir"]
    common_dir = PACKAGES_DIR / "aek-common"

    pwsh = find_pwsh()
    if not pwsh:
        raise RuntimeError("找不到 PowerShell")
    wp = get_wsl_win_paths(pwsh)
    # staging 使用用户约定的 dev-staging 子目录
    staging_root = Path(wp.src_dir).parent / "dev-staging"
    staging_win = str(staging_root / spec["dir"])
    staging_common_win = str(staging_root / "aek-common")

    # 创建目标目录（先清空，防止旧嵌套结构残留）
    staging_path = Path(staging_win)
    staging_common_path = Path(staging_common_win)
    for p in (staging_path, staging_common_path):
        if p.exists():
            import shutil
            shutil.rmtree(p)
        p.mkdir(parents=True, exist_ok=True)

    # 排除规则（platforms 不 exclusion，Go 包的平台二进制在 platforms/<platform>/bin/ 中）
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
    print(f"  [copy] aek-common → {staging_common_win}")
    copy_tree(common_dir, Path(staging_common_win))

    # 平台二进制只保留 win32-x64（如有）
    pkg_plat = Path(staging_win) / "platforms"
    if pkg_plat.exists():
        for d in pkg_plat.iterdir():
            if d.is_dir() and d.name != "win32-x64":
                import shutil
                shutil.rmtree(d)
                print(f"  [rm] 剔除平台: {d.name}")

    return staging_win


def npm_install_on_windows_peer(pkg_key: str, staging_win: str) -> None:
    """通过 pnpm workspace install 安装到 Windows 侧，然后创建 shim。"""
    import json as _json
    import subprocess as _subprocess

    spec = PACKAGES[pkg_key]
    pwsh = find_pwsh()
    if not pwsh:
        raise RuntimeError("找不到 PowerShell")

    # 获取 Windows 路径（通过共享模块）
    wp = get_win_paths(pwsh)
    src_dir = Path(wp.src_dir)
    packages_dir = Path(wp.packages_dir)
    npm_bin_dir = wp.npm_bin_dir

    print(f"  [win] workspace root: {wp.src_dir}")
    print(f"  [win] packages_dir:   {wp.packages_dir}")
    print(f"  [win] npm bin dir:    {npm_bin_dir}")

    # 步骤1: 确保 workspace 配置文件存在
    pkg_json_path = src_dir / "package.json"
    if not pkg_json_path.exists():
        # 复制根 package.json（含 workspaces 字段）
        root_pkg = PROJECT_ROOT / "package.json"
        if root_pkg.exists():
            import json as _root_json
            with open(root_pkg) as f:
                root_meta = _root_json.load(f)
            if "workspaces" not in root_meta:
                root_meta["workspaces"] = ["packages/*", "packages/*/platforms/*"]
            pkg_json_path.write_text(
                _root_json.dumps(root_meta, indent=2, ensure_ascii=False) + "\n",
                encoding="utf-8"
            )
            print("  [win] 写入 package.json (含 workspaces)")

    workspace_yaml_path = src_dir / "pnpm-workspace.yaml"
    if not workspace_yaml_path.exists():
        workspace_yaml = PROJECT_ROOT / "pnpm-workspace.yaml"
        if workspace_yaml.exists():
            workspace_yaml_path.write_text(workspace_yaml.read_text(), encoding="utf-8")
            print("  [win] 写入 pnpm-workspace.yaml")

    # 步骤2: 运行 pnpm install --ignore-scripts
    install_cmd = f"""
$env:PATH = '{npm_bin_dir};$env:PATH'
Set-Location '{wp.src_dir}'
pnpm install --ignore-scripts
"""
    r = _subprocess.run([pwsh, "-Command", install_cmd], capture_output=True, text=True, timeout=180)
    if r.returncode != 0:
        print(f"  [!] pnpm install 失败:\n{r.stdout[-500:]}\n{r.stderr[-300:]}")
        raise RuntimeError("pnpm install 失败")
    if r.stdout.strip():
        print(r.stdout[-500:])

    # 步骤3: 创建 shim 脚本到 npm bin 目录
    pkg_json_path = PACKAGES_DIR / spec["dir"] / "package.json"
    with open(pkg_json_path) as f:
        pkg_meta = _json.load(f)
    bin_map = pkg_meta.get("bin", {})
    if not bin_map:
        pkg_name = spec["npm"].split("/")[-1]
        bin_map = {pkg_name: f"bin/{pkg_name}.js"}

    for _bin_name, _js_rel in bin_map.items():
        _js_full = f"$env:USERPROFILE\\.aek\\src\\packages\\{spec['dir']}\\{_js_rel}"
        _shim_content = (
            "$basedir=Split-Path $MyInvocation.MyCommand.Definition -Parent\\n"
            '$exe=""\\n'
            'if ($PSVersionTable.PSVersion -lt "6.0" -or $IsWindows) { $exe=".exe" }\\n'
            "$ret=0\\n"
            'if (Test-Path "$basedir/node$exe") {\\n'
            f'    & "$basedir/node$exe" "{_js_full}" $args\\n'
            "} else {\\n"
            f'    & "node$exe" "{_js_full}" $args\\n'
            "}\\n"
            "$ret=$LASTEXITCODE\\n"
            "exit $ret\\n"
        )
        _wsl_bin_dir = "/mnt/" + npm_bin_dir[0].lower() + npm_bin_dir[2:].replace("\\", "/")
        _wsl_path = Path(_wsl_bin_dir) / f"{_bin_name}.ps1"
        _wsl_path.parent.mkdir(parents=True, exist_ok=True)
        with open(_wsl_path, 'w', encoding='utf-8', newline='\n') as f:
            f.write(_shim_content)
        print(f"  [win] 创建 shim: {_bin_name}")

    print("  [win] 安装完成")


def stage_all_for_windows_peer(no_cache: bool = False) -> None:
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

    # 写入根 package.json（含 workspaces）— 写到 WSL 自身文件系统
    root_pkg = PROJECT_ROOT / "package.json"
    dst_pkg = src_dir_wsl / "package.json"
    with open(root_pkg) as f:
        root_meta = _root_json.load(f)
    if "workspaces" not in root_meta:
        root_meta["workspaces"] = ["packages/*", "packages/*/platforms/*"]
    dst_pkg.write_text(_root_json.dumps(root_meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"  [wsl] package.json written: {dst_pkg}")

    # 写入 pnpm-workspace.yaml — 写到 WSL 自身文件系统
    ws_yaml = PROJECT_ROOT / "pnpm-workspace.yaml"
    dst_ws = src_dir_wsl / "pnpm-workspace.yaml"
    if ws_yaml.exists() and not dst_ws.exists():
        dst_ws.write_text(ws_yaml.read_text(), encoding="utf-8")
        print(f"  [wsl] pnpm-workspace.yaml written: {dst_ws}")

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

    # 构建 PowerShell 命令：从 UNC 复制源码到 Windows staging
    wp_win = get_win_paths(pwsh)
    packages_win = wp_win.packages_dir  # C:\\Users\\<user>\\.aek\\src\\packages

    # 构建 ps1 脚本
    import textwrap as _tw
    ps_script = _tw.dedent(f"""\
        $ErrorActionPreference = 'Continue'
        $Error.Clear()

        $uncPackages = '{packages_unc}'
        $winPackages = r'{packages_win.replace(chr(92), chr(92)+chr(92))}'

        # 确保目标目录存在
        if (-not (Test-Path $winPackages)) {{
            New-Item -ItemType Directory -Force -Path $winPackages | Out-Null
        }}

        $pkgs = @('aek-websearch','aek-mcp','aek-task-manager','aek-common',
                   'aek-prompt-manager','aek-skill-manager','aek-browser','aek')

        foreach ($p in $pkgs) {{
            $uncSrc = Join-Path $uncPackages $p
            $winDst = Join-Path $winPackages $p
            if (-not (Test-Path $uncSrc)) {{
                Write-Warning "UNC 源不存在: $uncSrc"
                continue
            }}
            # 删除旧目录（避免残留）
            if (Test-Path $winDst) {{
                Remove-Item $winDst -Recurse -Force
            }}
            # 复制
            Copy-Item $uncSrc -Destination $winDst -Recurse -Force
            Write-Host "  [pwsh] copied $p"
        }}

        # 剔除非 win32-x64 平台目录
        foreach ($p in $pkgs) {{
            $platDir = Join-Path (Join-Path $winPackages $p) 'platforms'
            if (Test-Path $platDir) {{
                Get-ChildItem $platDir -Directory | Where-Object {{ $_.Name -ne 'win32-x64' }} | ForEach-Object {{
                    Remove-Item $_.FullName -Recurse -Force
                    Write-Host "  [pwsh] rm platform: $($_.Name)"
                }}
            }}
        }}

        if ($Error.Count -gt 0) {{
            Write-Error "Stage 失败"
            exit 1
        }}
    """)

    r = subprocess.run([pwsh, "-Command", ps_script], capture_output=True, text=True, timeout=120)
    if r.returncode != 0:
        print(f"  [!] PowerShell stage 失败:\n{r.stderr[-500:]}", file=sys.stderr)
        raise RuntimeError(f"stage 失败: {r.stderr[:200]}")
    if r.stdout.strip():
        print(r.stdout.rstrip())
    if r.stderr.strip():
        print(f"  [pwsh stderr] {r.stderr.rstrip()}", file=sys.stderr)

    print("\n✓ 完成")


def stage_for_wsl_peer(pkg_key: str) -> str:
    """在 Windows 跑时，把源码反向 stage 到 WSL 侧（通过 wsl.exe 调 bash）。"""
    env = detect_env()
    if env != "windows":
        raise RuntimeError("stage_for_wsl_peer 仅 Windows 可用")
    wsl = find_wsl_exe()
    if not wsl:
        raise RuntimeError("找不到 wsl.exe")

    spec = PACKAGES[pkg_key]
    pkg_dir = PACKAGES_DIR / spec["dir"]
    common_dir = PACKAGES_DIR / "aek-common"

    # Windows 路径 → WSL 路径（这里我们直接复用 WSL 自己的源码，因为都在同一 repo）
    # 实际上：WSL 侧的源码就在 /home/xdx/CodeRelated/agent-enhance-kit 下
    # 只需让 WSL 端 npm install -g 那里即可。这一步留给 sync 函数处理。
    return ""  # 占位


def npm_install_on_wsl_peer(pkg_key: str) -> None:
    """让 WSL 端从源码路径 npm install -g。"""
    wsl = find_wsl_exe()
    spec = PACKAGES[pkg_key]
    pkg_dir = PACKAGES_DIR / spec["dir"]
    common_dir = PACKAGES_DIR / "aek-common"

    # 把 Windows 路径翻译成 WSL 路径
    def win_to_wsl(p: Path) -> str:
        s = str(p).replace("\\", "/")
        # D:\CodeRelated\... → /mnt/d/CodeRelated/...
        if len(s) >= 2 and s[1] == ":":
            drive = s[0].lower()
            s = f"/mnt/{drive}{s[2:]}"
        return s

    pkg_wsl = win_to_wsl(pkg_dir)
    common_wsl = win_to_wsl(common_dir)

    cmd = f"npm install -g '{common_wsl}' && npm install -g '{pkg_wsl}'"
    run_wsl_in_windows(wsl, cmd, f"WSL 端 npm install {pkg_key}")


# ──────────────────────────────────────────────────────────────────────────
# 主流程
# ──────────────────────────────────────────────────────────────────────────

def deploy_one(pkg_key: str, no_deploy: bool, skip_peer: bool, target_platform: str = None) -> None:
    spec = PACKAGES[pkg_key]
    env = detect_env()
    print(f"\n{'=' * 60}")
    print(f"  目标: {pkg_key}  (kind={spec['kind']})  环境: {env}")
    print(f"{'=' * 60}")

    # 1) 构建（Go 包才有）
    print("\n[1/4] 构建...")
    # target_platform 为 None 时仅编译本机；"both"/"windows"/"linux" 显式指定
    build(pkg_key, target_platform=target_platform if not skip_peer else "local")

    if no_deploy:
        print("\n  --no-deploy 指定，跳过部署")
        return

    # 2) 本机卸载云端冲突 + 安装本地
    print("\n[2/4] 本机卸载云端冲突包...")
    uninstall_cloud_conflicts(pkg_key, "local")
    print("\n[3/4] 本机 npm install -g ...")
    npm_install_local(pkg_key)

    # 3) 对端同步
    if skip_peer:
        print("\n[4/4] --skip-peer 指定，跳过对端同步")
        return

    print("\n[4/4] 对端同步...")
    if env == "wsl":
        uninstall_cloud_conflicts(pkg_key, "windows-peer")
        stage_all_for_windows_peer(no_cache=False)
        npm_install_on_windows_peer(pkg_key, staging_win="")
    elif env == "windows":
        uninstall_cloud_conflicts(pkg_key, "wsl-peer")
        npm_install_on_wsl_peer(pkg_key)
    else:
        print(f"  当前环境 {env} 无对端概念，跳过")


def infer_pkg_key(short: str) -> str | None:
    """将短名映射到 PACKAGES 中的键。"""
    if short in PACKAGES:
        return short
    # 反向查找（支持 aek-websearch-win32-x64 → aek-websearch 等）
    for k, v in PACKAGES.items():
        if v["dir"] == short or v.get("bin_name") == short:
            return k
    return None


def build_platform_bins(go_cmd: str = "go", short: str | None = None, cross_compile: bool = False) -> int:
    """编译 Go 包平台二进制。

    参数:
        go_cmd: go 命令路径
        short: 指定包名，None 则编译全部 Go 包
        cross_compile: 是否交叉编译所有平台（默认 False，只编译本机 + 对端）

    矩阵（cross_compile=True 时）:
        linux/amd64    → linux-x64
        linux/arm64    → linux-arm64
        darwin/amd64   → darwin-x64
        darwin/arm64   → darwin-arm64
        windows/amd64  → win32-x64（go 自动加 .exe）
    """
    GO_ENTRY = {
        "aek-websearch": "./cmd/aek",
        "aek-task-manager": "./src/cmd/aek-task-manager",
        "aek-mcp": "./cmd/aek-mcp",
    }
    GOOS_ARCH_TO_PLATFORM = {
        ("linux", "amd64"): "linux-x64",
        ("linux", "arm64"): "linux-arm64",
        ("darwin", "amd64"): "darwin-x64",
        ("darwin", "arm64"): "darwin-arm64",
        ("windows", "amd64"): "win32-x64",
    }

    shorts = [short] if short else list(GO_ENTRY.keys())

    # 根据当前环境决定编译哪些平台
    env_detect = detect_env()
    if cross_compile:
        # 全平台编译：(goos, goarch, platform_key)
        targets = [
            ("linux", "amd64", "linux-x64"),
            ("linux", "arm64", "linux-arm64"),
            ("darwin", "amd64", "darwin-x64"),
            ("darwin", "arm64", "darwin-arm64"),
            ("windows", "amd64", "win32-x64"),
        ]
    else:
        # 智能选择：本机平台 + 对端平台
        targets = []
        plat = current_platform()
        # 本机平台
        targets.append((plat[0], plat[1], GOOS_ARCH_TO_PLATFORM.get(plat, plat)))
        # 对端平台（WSL↔Windows 互编）
        if env_detect == "wsl":
            # WSL 编译 Windows 目标
            targets.append(("windows", "amd64", "win32-x64"))
        elif env_detect == "windows":
            # Windows 编译 Linux 目标
            targets.append(("linux", "amd64", "linux-x64"))

    failed = []

    def build_one(pkg_short: str, goos: str, goarch: str, platform_key: str) -> bool:
        src_dir = PACKAGES_DIR / pkg_short
        dst_bin = src_dir / "platforms" / platform_key / "bin"
        dst_bin.mkdir(parents=True, exist_ok=True)
        out_name = pkg_short + (".exe" if goos == "windows" else "")
        out_path = dst_bin / out_name

        env_build = dict(os.environ)
        env_build["GOOS"] = goos
        env_build["GOARCH"] = goarch
        env_build["CGO_ENABLED"] = "0"

        # 先清掉目标再编译（Go 1.24+ 会拒绝覆盖已有文件）
        try:
            out_path.unlink()
        except FileNotFoundError:
            pass

        cmd = [go_cmd, "build", "-ldflags=-s -w", "-o", str(out_path), GO_ENTRY[pkg_short]]
        print(f"  [build] {pkg_short} {goos}/{goarch} → {out_path.relative_to(PROJECT_ROOT)}")
        r = subprocess.run(cmd, cwd=str(src_dir), env=env_build, capture_output=True, text=True)
        if r.returncode != 0:
            print(r.stderr, file=sys.stderr)
            return False
        out_path.chmod(0o755)
        return True

    for pkg_short in shorts:
        if pkg_short not in GO_ENTRY:
            print(f"未知包: {pkg_short}（可选: {list(GO_ENTRY)}）", file=sys.stderr)
            return 1
        for goos, goarch, platform_key in targets:
            if not build_one(pkg_short, goos, goarch, platform_key):
                failed.append(f"{pkg_short} {goos}/{goarch}")

    if failed:
        print("失败:", *failed, sep="\n  ")
        return 1
    print("编译完成。")
    return 0


def sync_versions() -> None:
    """同步主包版本到平台子包（与 for-maintainers/sync-versions.py 等效）。

    esbuild 式平台分包：@cheezmil/<主包>-<platform>-<arch> 的版本必须与主包同步。
    changesets 只管 workspace 里的主包，平台子包版本由本脚本统一对齐。
    """
    PLATFORM_SUFFIXES = [
        "-linux-x64", "-linux-arm64",
        "-darwin-x64", "-darwin-arm64", "-win32-x64",
    ]
    MAIN_PACKAGES = ["aek-websearch", "aek-task-manager", "aek-mcp"]

    changed = []
    for main_name in MAIN_PACKAGES:
        main_json = PACKAGES_DIR / main_name / "package.json"
        with open(main_json, encoding="utf-8") as f:
            main_data = json.load(f)
        main_version = main_data["version"]

        platform_dir = PACKAGES_DIR / main_name / "platforms"
        if not platform_dir.is_dir():
            continue

        for suffix in PLATFORM_SUFFIXES:
            sub_json = platform_dir / suffix / "package.json"
            if not sub_json.exists():
                continue
            with open(sub_json, encoding="utf-8") as f:
                sub_data = json.load(f)
            if sub_data["version"] != main_version:
                sub_data["version"] = main_version
                with open(sub_json, "w", encoding="utf-8") as f:
                    json.dump(sub_data, f, indent=2, ensure_ascii=False)
                    f.write("\n")
                changed.append(f"{sub_data['name']}: → {main_version}")

    if changed:
        print("平台子包版本已同步:")
        for c in changed:
            print("  ", c)
    else:
        print("平台子包版本已一致，无需同步。")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="AEK 统一开发构建+部署脚本",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
--only 动作（逗号分隔）：
  stage          仅 stage 源码到 Windows workspace（仅 WSL 环境）
  install-win    仅 Windows pnpm install + shim（不含 Go 编译）
  compile-win    仅通过 pwsh 在 Windows 端 go build（仅 WSL 环境）
  all            完整流水线（默认）

--target-platform 选项：
  linux          仅编译本机 Linux 二进制（默认）
  windows        仅编译 Windows 二进制
  both           编译本机 + 对端平台二进制

示例：
  # 仅编译本机（WSL 环境默认行为）
  python3 scripts/build_deploy.py aek-mcp

  # 仅编译 Windows 二进制
  python3 scripts/build_deploy.py --target-platform windows --pkg aek-mcp

  # 编译全部平台（WSL ↔ Windows 互编）
  python3 scripts/build_deploy.py --target-platform both --pkg aek-mcp

  # 仅 stage + 安装
  python3 scripts/build_deploy.py --only stage,install-win --no-cache
        """,
    )
    parser.add_argument("target", nargs="?", choices=list(PACKAGES.keys()) + ["all-npm"],
                        help="要构建/部署的目标包")
    parser.add_argument("--no-deploy", action="store_true", help="只构建不部署")
    parser.add_argument("--skip-peer", action="store_true", help="跳过对端同步")
    parser.add_argument("--no-cache", action="store_true",
                        help="跳过缓存，强制全量复制所有包到 Windows workspace")
    parser.add_argument("--build-platform-bins", action="store_true",
                        help="[已弃用] 请使用 --target-platform 代替")
    parser.add_argument("--build-platform-bin-short", default=None,
                        help="[已弃用] 请使用 --target-platform 代替")
    parser.add_argument("--cross-compile", action="store_true",
                        help="[已弃用] 请使用 --target-platform both 代替")
    parser.add_argument("--sync-versions", action="store_true",
                        help="同步平台子包版本号到主包版本")
    parser.add_argument("--only", default=None,
                        help="细粒度动作：stage,install-win,compile-win,all（逗号分隔）")
    parser.add_argument("--dry-run", action="store_true",
                        help="只打印路径和命令，不实际执行（可与 --only 配合使用）")
    parser.add_argument("--test", action="store_true",
                        help="运行 test_windows_workspace 验证 Windows workspace 配置")
    parser.add_argument("--test-windows", action="store_true",
                        help="运行 test_windows_project_rules 测试 Windows 侧项目规则生成")
    parser.add_argument("--target-platform", default=None, choices=["linux", "windows", "both"],
                        help="指定编译目标平台（仅 WSL 环境下有效）：\n  linux    仅编译本机 Linux 二进制（默认）\n  windows  仅编译 Windows 二进制\n  both     编译全部平台")
    parser.add_argument("--pkg", default=None, choices=list(PACKAGES.keys()) + ["js", "go"],
                        help="只编译指定包（或 'go' 只编所有 Go 包，'js' 只编所有 JS 包）")
    args = parser.parse_args()

    print(f"PROJECT_ROOT: {PROJECT_ROOT}")
    print(f"当前环境: {detect_env()}")
    print(f"当前平台: {current_platform()}")

    # --test 模式：验证 Windows workspace
    if args.test:
        pwsh = find_pwsh()
        if not pwsh:
            print("[!] 找不到 PowerShell，仅 WSL 环境支持 --test"); sys.exit(2)
        sys.exit(test_windows_workspace(pwsh, verbose=True))

    # --test-windows 模式：测试 Windows 侧项目规则生成
    if args.test_windows:
        pwsh = find_pwsh()
        if not pwsh:
            print("[!] 找不到 PowerShell，仅 WSL 环境支持 --test-windows"); sys.exit(2)
        sys.exit(test_windows_project_rules(pkg_key=args.pkg or "aek-prompt-manager"))

    # --build-platform-bins 模式：直接编译平台二进制（已弃用，保留兼容）
    if args.build_platform_bins:
        sys.exit(build_platform_bins(go_cmd="go", short=args.build_platform_bin_short,
                                      cross_compile=args.cross_compile))

    # --sync-versions 模式：对齐版本
    if args.sync_versions:
        sync_versions()
        return

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
                js_order = ["aek-common", "aek-prompt-manager", "aek-skill-manager",
                            "aek-browser", "aek"]
            elif args.pkg:
                go_order = [args.pkg] if PACKAGES[args.pkg]["kind"] == "go-cli" else []
                js_order = [args.pkg] if PACKAGES[args.pkg]["kind"] != "go-cli" else []
            else:
                go_order = ["aek-websearch", "aek-mcp", "aek-task-manager"]
                js_order = ["aek-common", "aek-prompt-manager", "aek-skill-manager",
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
                    deploy_one(k, no_deploy=False, skip_peer=True, target_platform=args.target_platform)
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
                    deploy_one(k, no_deploy=False, skip_peer=not args.skip_peer, target_platform=args.target_platform)
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
        order = ["aek-common", "aek-websearch", "aek-mcp", "aek-task-manager",
                 "aek-prompt-manager", "aek-skill-manager", "aek-browser", "aek"]
        for k in order:
            deploy_one(k, args.no_deploy, args.skip_peer, target_platform=args.target_platform)
    else:
        deploy_one(target, args.no_deploy, args.skip_peer, target_platform=args.target_platform)

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
        r = subprocess.run([pwsh, "-Command", check_cmd], capture_output=True, text=True, timeout=60)
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


def test_windows_project_rules(pkg_key: str = "aek-prompt-manager") -> int:
    """在 Windows 侧测试项目规则生成（project-rules.js）。

    流程：
    1. WSL 写入 package.json + pnpm-workspace.yaml 到 src 目录
    2. PowerShell 从 UNC 复制包到 Windows
    3. PowerShell 运行 node --test
    """
    import json as _root_json

    pwsh = find_pwsh()
    if not pwsh:
        raise RuntimeError("找不到 PowerShell")

    spec = PACKAGES[pkg_key]
    pkg_dir = PACKAGES_DIR / spec["dir"]

    # 步骤1: 写入根 package.json（含 workspaces）
    src_dir_wsl = PROJECT_ROOT
    src_pkg_json = src_dir_wsl / "package.json"
    src_ws_yaml = src_dir_wsl / "pnpm-workspace.yaml"

    if src_pkg_json.exists():
        with open(src_pkg_json) as f:
            root_meta = _root_json.load(f)
        if "workspaces" not in root_meta:
            root_meta["workspaces"] = ["packages/*", "packages/*/platforms/*"]
        (src_dir_wsl / "package.json").write_text(
            _root_json.dumps(root_meta, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8"
        )
    else:
        root_meta = {"name": "aek-src-root", "workspaces": ["packages/*", "packages/*/platforms/*"]}
        (src_dir_wsl / "package.json").write_text(
            _root_json.dumps(root_meta, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8"
        )

    # 写入 pnpm-workspace.yaml
    if not (src_dir_wsl / "pnpm-workspace.yaml").exists() and src_ws_yaml.exists():
        (src_dir_wsl / "pnpm-workspace.yaml").write_text(src_ws_yaml.read_text(), encoding="utf-8")

    # 步骤2: PowerShell 从 UNC 复制到 Windows，并运行测试
    # 路径计算全部委托给 shared 模块
    wp_unc = get_wsl_pkg_unc_paths(pwsh, PROJECT_ROOT, spec["dir"])
    test_dir_win = "$env:USERPROFILE\\.aek\\test_" + pkg_key.replace("-", "_")
    src_src_unc = wp_unc.src_dir
    src_test_unc = wp_unc.packages_dir + "\\" + spec["dir"] + "\\test".replace("/", "\\")
    src_pkg_unc = wp_unc.packages_dir + "\\" + spec["dir"] + "\\package.json".replace("/", "\\")

    # 构建 PowerShell 脚本（用字符串拼接避免 f-string 解析 $）
    # 注意：包含 $ 的路径必须用双引号，其他路径可用单引号
    test_cmd_lines = [
        "$ErrorActionPreference = 'Stop'",
        "Set-Location $env:USERPROFILE",
        "",
        "# 清空并创建测试目录",
        'if (Test-Path "' + test_dir_win + '") { Remove-Item "' + test_dir_win + '" -Recurse -Force }',
        'New-Item -ItemType Directory -Path "' + test_dir_win + '" -Force | Out-Null',
        "",
        "# 复制源码和测试文件（不复制 node_modules）",
        'Copy-Item -Path "' + src_src_unc + '" -Destination "' + test_dir_win + '\\src' + '" -Recurse -Force',
        'Copy-Item -Path "' + src_test_unc + '" -Destination "' + test_dir_win + '\\test' + '" -Recurse -Force',
        'Copy-Item -Path "' + src_pkg_unc + '" -Destination "' + test_dir_win + '\\package.json' + '" -Force',
        "",
        "# 运行测试",
        'Set-Location "' + test_dir_win + '"',
        "try {",
        "    $result = node --test test/project-rules.test.js 2>&1 | Out-String",
        "    Write-Host $result",
        "    if ($result -match '✖ .*failed') { exit 1 }",
        "    if ($result -match 'fail 1') { exit 1 }",
        "    exit 0",
        "} catch {",
        "    Write-Host 'ERROR: ' + $_.Exception.Message",
        "    exit 1",
        "}",
    ]
    test_cmd = "\n".join(test_cmd_lines)

    print("  [win] 运行 Windows 测试...")
    r = subprocess.run([pwsh, "-Command", test_cmd], capture_output=True, text=True, timeout=120)
    if r.stdout:
        print(r.stdout[-2000:])
    if r.stderr:
        print("  [stderr] " + r.stderr[-500:])
    if r.returncode != 0:
        print("\n[✗] Windows 测试失败")
        return 1
    print("\n[✓] Windows 测试通过")
    return 0


if __name__ == "__main__":
    main()
