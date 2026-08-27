#!/usr/bin/env python3
"""build-platform-bins — 交叉编译三个 Go 包的全部平台二进制，填入对应平台子包。

用法:
    python scripts/for-maintainers/build-platform-bins.py            # 全部 5 平台 × 3 包
    python scripts/for-maintainers/build-platform-bins.py --go go    # 指定 go 命令（默认取 PATH）

矩阵（与 pnpm-workspace 平台子包一一对应）:
    linux/amd64    → linux-x64
    linux/arm64    → linux-arm64
    darwin/amd64   → darwin-x64
    darwin/arm64   → darwin-arm64
    windows/amd64  → win32-x64（go 自动加 .exe）
"""
import argparse
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PACKAGES = os.path.join(ROOT, "packages")

# 包短名 → Go 入口目录（相对包根，须带 ./ 前缀，否则 go 会按标准库解析 cmd/）
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


def build_one(go_cmd, short, goos, goarch, platform_key):
    src_dir = os.path.join(PACKAGES, short)
    dst_bin = os.path.join(src_dir, "platforms", platform_key, "bin")
    os.makedirs(dst_bin, exist_ok=True)
    out_name = short + (".exe" if goos == "windows" else "")
    out_path = os.path.join(dst_bin, out_name)

    env = dict(os.environ)
    env["GOOS"] = goos
    env["GOARCH"] = goarch
    env["CGO_ENABLED"] = "0"

    cmd = [go_cmd, "build", "-ldflags=-s -w", "-o", out_path, GO_ENTRY[short]]
    # Go 1.24+ 缓存：输出路径已存在且非对象文件时，go build 会报
    # "already exists and is not an object file"，先清掉目标再编译
    try:
        os.remove(out_path)
    except FileNotFoundError:
        pass
    print(f"[build] {short} {goos}/{goarch} → {os.path.relpath(out_path, ROOT)}")
    r = subprocess.run(cmd, cwd=src_dir, env=env, capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stderr, file=sys.stderr)
        return False
    os.chmod(out_path, 0o755)
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--go", default="go", help="go 命令（默认走 PATH）")
    ap.add_argument(
        "--short",
        default=None,
        help="只构建某个包（如 aek-websearch）；默认构建全部三个 Go 包",
    )
    args = ap.parse_args()

    shorts = [args.short] if args.short else list(GO_ENTRY)
    failed = []
    for short in shorts:
        if short not in GO_ENTRY:
            print(f"未知包: {short}（可选: {list(GO_ENTRY)}）", file=sys.stderr)
            return 1
        for (goos, goarch), platform_key in GOOS_ARCH_TO_PLATFORM.items():
            if not build_one(args.go, short, goos, goarch, platform_key):
                failed.append(f"{short} {goos}/{goarch}")

    if failed:
        print("失败:", *failed, sep="\n  ")
        return 1
    print("全部编译完成。")
    return 0


if __name__ == "__main__":
    sys.exit(main())