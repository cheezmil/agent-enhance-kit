#!/usr/bin/env python3
"""AEK 统一开发构建 + 部署脚本（单一入口，禁止再分散到 packages/*/scripts/）。

用法：
  python3 scripts/build_deploy.py <target> [--no-deploy] [--skip-peer]

  <target>:
    aek-websearch      Go CLI + npm 包（跨平台）
    aek-mcp            Go CLI + npm 包
    aek-task-manager   Go CLI + npm 包
    aek-prompt-manager 纯 JS npm 包
    aek-skill-manager  纯 JS npm 包
    aek-browser        纯 JS npm 包
    aek-common         纯 JS npm 包
    aek                纯 JS npm 元包
    all-npm            所有 npm 包（不含 mcp 前端/后端服务）

  --no-deploy   只构建，不 npm install -g
  --skip-peer   WSL/Windows 双端环境下，跳过对端同步

行为：
  - 自动检测当前环境（wsl / windows / linux / darwin）
  - 对 Go 包：编译本机平台二进制；WSL/Windows 双端环境下顺带编译对端平台
  - 对 npm 包：本机 npm install -g
  - WSL↔Windows 双端：自动同步对端（清云端冲突包 → staging → 对端 npm install -g）
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
from shared.start_scripts_shared_logic import is_win, py_exe

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


def build(pkg_key: str, also_peer: bool) -> dict[str, Path]:
    """构建当前平台 + 可选对端平台。返回 {goos: bin_path}。"""
    spec = PACKAGES[pkg_key]
    if spec["kind"] != "go-cli":
        print(f"  {pkg_key} 是纯 JS 包，无需构建")
        return {}

    env = detect_env()
    goos, goarch = current_platform()
    outputs = {}

    # 本机平台
    outputs[goos] = build_go(pkg_key, goos, goarch)

    # 对端平台：仅 WSL/Windows 互推
    if also_peer:
        if env == "wsl":
            outputs["windows"] = build_go(pkg_key, "windows", "amd64")
        elif env == "windows":
            outputs["linux"] = build_go(pkg_key, "linux", "amd64")

    return outputs


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

    win_user = os.path.basename(os.path.expanduser("~"))
    staging_root = Path(f"/mnt/c/Users/{win_user}/.aek/dev-staging")
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
    """直接把包文件复制到 Windows 全局 node_modules，不走 npm install。"""
    import json as _json
    import subprocess as _subprocess
    import os as _os

    spec = PACKAGES[pkg_key]
    pwsh = find_pwsh()
    if not pwsh:
        raise RuntimeError("找不到 PowerShell")

    # 解析路径
    rest = staging_win[len("/mnt/c/"):]
    win_staging = "C:" + rest.replace("/", "\\")
    win_staging_root, pkg_dir_name = win_staging.rsplit("\\", 1)

    pkg_name = spec["npm"].split("/")[-1]
    print(f"  [win] pkg_name={pkg_name}, pkg_dir={pkg_dir_name}")

    # 获取 npm root 和 bin 目录（在 PowerShell 中处理 Windows 路径）
    npm_result = _subprocess.run(
        [pwsh, "-Command", "npm root -g"],
        capture_output=True, text=True
    )
    npm_root = npm_result.stdout.strip()
    # npm root 返回 D:\...\node_modules，bin 目录是其父目录
    npm_bin_dir = _subprocess.run(
        [pwsh, "-Command", "Split-Path (npm root -g) -Parent"],
        capture_output=True, text=True
    ).stdout.strip()
    print(f"  [win] npm_root={npm_root}")
    print(f"  [win] npm_bin_dir={npm_bin_dir}")

    # 读取 package.json 获取 bin 映射
    pkg_json_path = PACKAGES_DIR / spec["dir"] / "package.json"
    with open(pkg_json_path) as f:
        pkg_meta = _json.load(f)
    bin_map = pkg_meta.get("bin", {})
    if not bin_map:
        bin_map = {pkg_name: f"bin/{pkg_name}.js"}
    print(f"  [win] bin_map={bin_map}")

    # 复制包文件
    _subprocess.run([pwsh, "-Command", f"Set-Location C:\\; Copy-Item -Recurse -Force '{win_staging_root}/{pkg_dir_name}' '{npm_root}/@cheezmil/{pkg_name}'"], capture_output=True, text=True)
    _subprocess.run([pwsh, "-Command", f"Set-Location C:\\; Copy-Item -Recurse -Force '{win_staging_root}/aek-common' '{npm_root}/aek-common'"], capture_output=True, text=True)
    print("  [win] 复制包文件完成")

    # 创建 shim 文件（通过 PowerShell 写入，因为 Python 在 WSL 上无法写入 Windows 路径）
    for _bin_name, _js_rel in bin_map.items():
        _js_full = f"$basedir/node_modules/@cheezmil/{pkg_name}/{_js_rel}"
        _shim_content = (
            "$basedir=Split-Path $MyInvocation.MyCommand.Definition -Parent\n"
            '$exe=""\n'
            'if ($PSVersionTable.PSVersion -lt "6.0" -or $IsWindows) { $exe=".exe" }\n'
            "$ret=0\n"
            'if (Test-Path "$basedir/node$exe") {\n'
            f'    & "$basedir/node$exe" "{_js_full}" $args\n'
            "} else {\n"
            f'    & "node$exe" "{_js_full}" $args\n'
            "}\n"
            "$ret=$LASTEXITCODE\n"
            "exit $ret\n"
        )
        # 直接通过 WSL 路径写入 Windows 文件（/mnt/c/ 可在 WSL 中读写）
        # npm_bin_dir 是 Windows 路径，需要转为 WSL 路径
        _wsl_bin_dir = "/mnt/" + npm_bin_dir[0].lower() + npm_bin_dir[2:].replace("\\", "/")
        _wsl_path = _wsl_bin_dir + "/" + _bin_name + ".ps1"
        with open(_wsl_path, 'w', encoding='utf-8', newline='\n') as f:
            f.write(_shim_content)
        print(f"  [win] 创建 shim: {_bin_name}")

    print("  [win] 安装完成")


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

def deploy_one(pkg_key: str, no_deploy: bool, skip_peer: bool) -> None:
    spec = PACKAGES[pkg_key]
    env = detect_env()
    print(f"\n{'=' * 60}")
    print(f"  目标: {pkg_key}  (kind={spec['kind']})  环境: {env}")
    print(f"{'=' * 60}")

    # 1) 构建（Go 包才有）
    print("\n[1/4] 构建...")
    build(pkg_key, also_peer=not skip_peer)

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
        staging = stage_for_windows_peer(pkg_key)
        npm_install_on_windows_peer(pkg_key, staging)
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
    parser = argparse.ArgumentParser(description="AEK 统一开发构建+部署脚本")
    parser.add_argument("target", nargs="?", choices=list(PACKAGES.keys()) + ["all-npm"],
                        help="要构建/部署的目标包")
    parser.add_argument("--no-deploy", action="store_true", help="只构建不部署")
    parser.add_argument("--skip-peer", action="store_true", help="跳过对端同步")
    parser.add_argument("--build-platform-bins", action="store_true",
                        help="编译本机和对端平台二进制（默认行为；加 --cross-compile 可编译全部平台）")
    parser.add_argument("--cross-compile", action="store_true",
                        help="与 --build-platform-bins 配合，编译全部 5 个平台")
    parser.add_argument("--build-platform-bin-short", default=None,
                        help="只构建某个包的平台二进制（如 aek-websearch）")
    parser.add_argument("--sync-versions", action="store_true",
                        help="同步平台子包版本号到主包版本")
    args = parser.parse_args()

    print(f"PROJECT_ROOT: {PROJECT_ROOT}")
    print(f"当前环境: {detect_env()}")
    print(f"当前平台: {current_platform()}")

    # --build-platform-bins 模式：直接编译平台二进制
    if args.build_platform_bins:
        sys.exit(build_platform_bins(go_cmd="go", short=args.build_platform_bin_short,
                                      cross_compile=args.cross_compile))

    # --sync-versions 模式：对齐版本
    if args.sync_versions:
        sync_versions()
        return

    # 默认 deploy 模式
    target = args.target or "all-npm"
    if target == "all-npm":
        order = ["aek-common", "aek-websearch", "aek-mcp", "aek-task-manager",
                 "aek-prompt-manager", "aek-skill-manager", "aek-browser", "aek"]
        for k in order:
            deploy_one(k, args.no_deploy, args.skip_peer)
    else:
        deploy_one(target, args.no_deploy, args.skip_peer)

    print("\n✓ 完成")


if __name__ == "__main__":
    main()
