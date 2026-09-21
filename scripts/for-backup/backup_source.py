#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""AEK 源码备份脚本。

把源码备份到指定目录，遵守 .gitignore —— node_modules / dist / 构建产物 /
缓存 / 平台二进制不碰；但 .git 目录完整备份（含历史、reflog、pack 文件），
使备份副本可直接作为 git 仓库使用。

用法
----
    python3 scripts/for-backup/backup_source.py
    python3 scripts/for-backup/backup_source.py --src <目录> --dst <目录>
    python3 scripts/for-backup/backup_source.py --force   # 目标已存在时清空重建

备份范围
--------
1. git ls-files --cached --others --exclude-standard
   已跟踪文件 + 未被 .gitignore 忽略的新文件（基准）。

2. .aek/ 全量备份 —— 无论 .bak 备份副本还是误建路径，全部纳入。

3. 补充纳入 .cheezmil_quick_git/ —— 整个目录被 .gitignore 排除，但 config 和
   quick_*.mjs 是 cqg 的配置与脚本，确实需要备份。
   其中 logs/（日志）和 _platform_repos/（嵌套平台仓库）仍然排除。

4. 兜底排除：任何路径片段命中 node_modules / __pycache__ 一律跳过；
   非全量目录里命中 wsl.localhost 的跳过。

逐文件复制并保持相对路径；符号链接按链接复制（不解引用）。
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

DEFAULT_SRC = "~/CodeRelated/agent-enhance-kit"
DEFAULT_DST = "~/CodeRelated/agent-enhance-kit-bak4"

# ── 全量目录：git 跟踪的内容全部备份，不做任何额外排除 ──
FULL_INCLUDE = (
    ".aek/",
)

# ── 补充纳入：被 .gitignore 整体排除但确实需要备份的目录 ──
EXTRA_INCLUDE = (
    ".cheezmil_quick_git/",
)

# ── 补充纳入目录里仍然不要的子路径 ──
EXTRA_INCLUDE_EXCLUDES = (
    ".cheezmil_quick_git/logs/",            # cqg 运行日志
    ".cheezmil_quick_git/_platform_repos/",  # 嵌套平台仓库（含独立 .git）
)

# ── 硬规则：任何目录都不备份（包括全量目录） ──
HARD_EXCLUDE_PARTS = ("node_modules", "__pycache__")

# ── 软规则：仅对非全量目录生效的路径片段排除 ──
SOFT_EXCLUDE_PARTS = ("wsl.localhost",)


def _is_excluded(rel: str) -> bool:
    """判断一个相对路径是否该被排除。"""
    parts = rel.split("/")
    if any(p in HARD_EXCLUDE_PARTS for p in parts):
        return True
    if any(rel.startswith(p) for p in FULL_INCLUDE):
        return False                       # 全量目录：到此为止，全部纳入
    if any(rel.startswith(p) for p in EXTRA_INCLUDE_EXCLUDES):
        return True
    if any(p in SOFT_EXCLUDE_PARTS for p in parts):
        return True
    return False


def _git_tracked(src: Path) -> list[str]:
    """git 认为该进版本库的文件（遵守 .gitignore）。"""
    r = subprocess.run(
        ["git", "-C", str(src), "ls-files", "-z", "--cached", "--others",
         "--exclude-standard"],
        capture_output=True, check=True,
    )
    return [s for s in (b.decode("utf-8", "surrogateescape").strip()
                        for b in r.stdout.split(b"\0")) if s]


def _extra_included(src: Path) -> list[str]:
    """补充扫描 EXTRA_INCLUDE 目录（不受 .gitignore 影响）。"""
    out: list[str] = []
    for base in EXTRA_INCLUDE:
        root = src / base
        if not root.is_dir():
            continue
        for dirpath, dirnames, filenames in os.walk(root):
            rel_dir = Path(dirpath).relative_to(src).as_posix()
            # 不再 descend 进排除子树
            dirnames[:] = [d for d in dirnames
                           if not any(f"{rel_dir}/{d}/".startswith(p)
                                      for p in EXTRA_INCLUDE_EXCLUDES)]
            for fn in filenames:
                out.append(f"{rel_dir}/{fn}")
    return out


def collect_files(src: Path) -> tuple[list[str], int]:
    """收集待备份文件。返回 (文件列表, 被排除数)。"""
    seen: set[str] = set()
    for rel in _git_tracked(src) + _extra_included(src):
        seen.add(rel)
    files: list[str] = []
    excluded = 0
    for rel in sorted(seen):
        if _is_excluded(rel):
            excluded += 1
            continue
        files.append(rel)
    return files, excluded


def copy_one(s: Path, d: Path) -> None:
    """复制单个条目；符号链接按链接复制，不解引用。"""
    d.parent.mkdir(parents=True, exist_ok=True)
    if s.is_symlink():
        if d.is_symlink() or d.exists():
            d.unlink()
        os.symlink(os.readlink(s), d)
        return
    shutil.copy2(s, d)


def dir_size(root: Path) -> int:
    """目录体积（字节）；符号链接不计。"""
    total = 0
    for dirpath, _dirnames, filenames in os.walk(root):
        for fn in filenames:
            fp = Path(dirpath) / fn
            try:
                if fp.is_symlink():
                    continue
                total += fp.stat().st_size
            except OSError:
                pass
    return total


def _human(n: float) -> str:
    for unit in ("B", "K", "M", "G"):
        if n < 1024 or unit == "G":
            return f"{n:.1f}{unit}" if unit != "B" else f"{int(n)}B"
        n /= 1024
    return f"{n:.1f}G"


def main() -> int:
    ap = argparse.ArgumentParser(
        description="备份 AEK 源码（遵守 .gitignore）",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument("--src", default=DEFAULT_SRC,
                    help=f"源目录（默认 {DEFAULT_SRC}）")
    ap.add_argument("--dst", default=DEFAULT_DST,
                    help=f"目标目录（默认 {DEFAULT_DST}）")
    ap.add_argument("--force", action="store_true",
                    help="目标目录已存在时清空重建（默认拒绝覆盖）")
    args = ap.parse_args()

    src = Path(os.path.expanduser(args.src)).resolve()
    dst = Path(os.path.expanduser(args.dst)).resolve()

    if not src.is_dir():
        print(f"[!] 源目录不存在: {src}", file=sys.stderr)
        return 2
    if not (src / ".git").is_dir():
        print(f"[!] 源目录不是 git 仓库: {src}", file=sys.stderr)
        return 2
    if dst == src or src in dst.parents or dst in src.parents:
        print("[!] 目标目录不能与源目录相同或互为子目录", file=sys.stderr)
        return 2

    print(f"源   : {src}")
    print(f"目标 : {dst}")

    files, excluded = collect_files(src)
    print(f"待备份: {len(files)} 个文件（额外排除 {excluded} 个垃圾）")
    if not files:
        print("[!] 没有可备份的文件", file=sys.stderr)
        return 2

    if dst.exists():
        if args.force:
            shutil.rmtree(dst)
        else:
            print(f"[!] 目标已存在，加 --force 才会清空重建: {dst}",
                  file=sys.stderr)
            return 2

    t0 = time.time()
    copied = skipped = failed = 0
    errors: list[str] = []
    for i, rel in enumerate(files, start=1):
        s = src / rel
        if not s.exists():          # index 里有但工作区已删除
            skipped += 1
            continue
        try:
            copy_one(s, dst / rel)
            copied += 1
        except OSError as e:
            failed += 1
            if len(errors) < 20:
                errors.append(f"{rel}: {e}")
        if i % 1000 == 0:
            print(f"  {i}/{len(files)}", end="\r", flush=True)
    if copied + skipped + failed > 0:
        print(f"  {len(files)}/{len(files)}")

    # 完整复制 .git 目录（历史、reflog、pack 文件）
    git_src = src / ".git"
    git_dst = dst / ".git"
    print(f"  复制 .git ...", end="", flush=True)
    try:
        shutil.copytree(git_src, git_dst, symlinks=True)
        git_files = sum(1 for _ in os.walk(git_dst))
        print(f" ✓ ({git_files} 个条目)")
    except OSError as e:
        print(f" ✗ {e}", file=sys.stderr)
        failed += 1
        errors.append(f".git: {e}")

    print(f"\n✓ 备份完成 ({time.time() - t0:.1f}s)")
    print(f"  成功 {copied}  跳过 {skipped}  失败 {failed}")
    if errors:
        print("  失败样例:", file=sys.stderr)
        for e in errors:
            print(f"    {e}", file=sys.stderr)
    if dst.exists():
        print(f"  体积 {_human(dir_size(dst))} → {dst}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
