#!/usr/bin/env python3
"""AEK 测试脚本 — 替代 `pnpm -r test`。

为什么不用 pnpm -r test
========================
`pnpm -r test` 只对**声明了 `scripts.test` 的包**跑测试，其余**静默跳过**。
本仓库里 packages/aek-task-manager 有 330 个 .test.ts 文件，却既没有 test script
也没有安装 vitest —— pnpm 会一声不吭地跳过它，等于 95% 的测试没跑。
本脚本把这种情况显式标成 NO_SCRIPT，而不是假装它通过了。

用法
====
    python3 scripts/test.py                 # 跑全部，并行
    python3 scripts/test.py --pkg browser   # 只跑 aek-browser（支持模糊匹配）
    python3 scripts/test.py --serial        # 串行
    python3 scripts/test.py --timeout 600   # 单包超时秒数（默认 300）
    python3 scripts/test.py --list          # 只列出发现的包与 runner，不执行
    python3 scripts/test.py --all-failed    # 打印失败包的完整输出
    python3 scripts/test.py --no-browser-vitest   # 跳过 browser 的 vitest（依赖缺失时）

输出
====
每包日志落盘到 .hermes/test-out/<pkg>.log，结束时打印汇总表。
退出码：有 FAIL/TIMEOUT → 1；否则 0（NO_SCRIPT 不算失败，但会高亮）。
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
PACKAGES_DIR = REPO_ROOT / "packages"
OUT_DIR = REPO_ROOT / ".hermes" / "test-out"

# 单包 vitest 的默认参数（与 aek-browser/package.json 的 test script 对齐）。
# 用项目局部 node_modules/.bin/vitest，绕开 pnpm 的 script 解析开销。
BROWSER_VITEST_ARGS = ["run", "--project", "unit", "--project", "extension", "--project", "adapter"]

NO_RUNNER_HINT = (
    "有测试文件但没有 scripts.test，且未安装测试框架 → 需要给它加 devDependencies "
    "(vitest/typescript) 和 scripts.test 才能真正跑起来"
)


# ─── 发现 ────────────────────────────────────────────────────────────────────

def _read_pkg_json(pkg_dir: Path) -> dict | None:
    p = pkg_dir / "package.json"
    if not p.is_file():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def _count_test_files(pkg_dir: Path) -> int:
    """数 test/ 目录与 *.test.* / *.spec.* 文件，排除 node_modules / dist。"""
    n = 0
    skip = {"node_modules", "dist", "build", ".git", "platforms"}
    for root, dirs, files in os.walk(pkg_dir):
        dirs[:] = [d for d in dirs if d not in skip]
        rel = Path(root).relative_to(pkg_dir)
        if "test" in rel.parts:
            n += len(files)
        else:
            n += sum(
                1 for f in files
                if re.search(r"\.(test|spec)\.(js|mjs|cjs|ts|tsx|jsx)$", f)
            )
    return n


def discover() -> list[dict]:
    """返回每个包的信息：dir/name/scripts.test/runner/test 文件数。"""
    pkgs = []
    if not PACKAGES_DIR.is_dir():
        return pkgs
    for entry in sorted(PACKAGES_DIR.iterdir()):
        if not entry.is_dir() or entry.name.startswith("."):
            continue
        meta = _read_pkg_json(entry)
        if not meta:
            continue
        script = (meta.get("scripts") or {}).get("test")
        test_files = _count_test_files(entry)
        pkgs.append({
            "key": entry.name,
            "dir": entry,
            "name": meta.get("name", entry.name),
            "script": script,
            "test_files": test_files,
        })
    return pkgs


def pick_runner(pkg: dict) -> tuple[str, list[str]] | None:
    """决定怎么跑这个包。返回 (kind, argv) 或 None（无可跑的）。

    kind 取值: 'node-test' | 'vitest' | 'shell'
    """
    script = pkg["script"]
    if not script:
        return None

    # vitest：优先用项目局部的 .bin，避免 pnpm script 解析
    if "vitest" in script:
        local = pkg["dir"] / "node_modules" / ".bin" / "vitest"
        if local.exists():
            args = re.sub(r"^\s*vitest\b", "", script).strip().split()
            return "vitest", [str(local), *args]
        return "vitest", ["vitest", *args]

    if script.strip() in ("node --test", "node --test test", "node --test test/"):
        return "node-test", [sys.executable, "--test"]

    # 其它一律当 shell 脚本跑（保留 npm script 的语义）
    return "shell", ["/bin/sh", "-c", script]


# ─── 执行 ────────────────────────────────────────────────────────────────────

def run_one(pkg: dict, timeout: int, skip_vitest: bool) -> dict:
    """跑单个包的测试，写日志，返回结果 dict。"""
    out_path = OUT_DIR / f"{pkg['key']}.log"
    start = time.monotonic()

    runner = pick_runner(pkg)
    if not runner:
        status = "NO_SCRIPT" if pkg["test_files"] else "NO_TESTS"
        note = NO_RUNNER_HINT if pkg["test_files"] else "无测试文件也无 test script"
        out_path.write_text(f"{status}\n{pkg['name']}: {note}\n"
                            f"  test files: {pkg['test_files']}\n", encoding="utf-8")
        return {"key": pkg["key"], "status": status, "seconds": 0.0,
                "log": str(out_path), "note": note}

    kind, argv = runner
    if skip_vitest and kind == "vitest":
        out_path.write_text("SKIPPED\n--no-browser-vitest 指定\n", encoding="utf-8")
        return {"key": pkg["key"], "status": "SKIPPED", "seconds": 0.0,
                "log": str(out_path), "note": "--no-browser-vitest 指定"}

    try:
        proc = subprocess.run(
            argv,
            cwd=str(pkg["dir"]),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=timeout,
        )
        rc = proc.returncode
        output = proc.stdout.decode("utf-8", errors="replace")
        elapsed = time.monotonic() - start
        status = "PASS" if rc == 0 else "FAIL"
    except subprocess.TimeoutExpired as e:
        partial = (e.stdout or b"").decode("utf-8", errors="replace") if isinstance(e.stdout, bytes) else ""
        rc, output, elapsed = 124, partial, time.monotonic() - start
        status = "TIMEOUT"
    except FileNotFoundError as e:
        rc, output, elapsed = 127, str(e), time.monotonic() - start
        status = "FAIL"

    header = (f"pkg:    {pkg['name']}\nkind:   {kind}\ncwd:    {pkg['dir']}\n"
              f"argv:   {' '.join(str(a) for a in argv)}\n"
              f"rc:     {rc}\nstatus: {status}\n{'-' * 60}\n")
    out_path.write_text(header + output, encoding="utf-8")
    return {"key": pkg["key"], "status": status, "seconds": round(elapsed, 1),
            "log": str(out_path), "rc": rc}


# ─── 汇总 ────────────────────────────────────────────────────────────────────

STATUS_ORDER = {"FAIL": 0, "TIMEOUT": 1, "NO_SCRIPT": 2, "SKIPPED": 3, "NO_TESTS": 4, "PASS": 5}


def print_summary(results: list[dict], show_full: bool) -> int:
    results.sort(key=lambda r: (STATUS_ORDER.get(r["status"], 9), r["key"]))
    failed = [r for r in results if r["status"] in ("FAIL", "TIMEOUT")]
    no_script = [r for r in results if r["status"] == "NO_SCRIPT"]

    print("\n" + "=" * 74)
    print(f"{'PKG':<22} {'STATUS':<11} {'TIME':>8}  LOG")
    print("-" * 74)
    for r in results:
        secs = f"{r['seconds']:.1f}s" if r["seconds"] else "-"
        log = Path(r["log"]).relative_to(REPO_ROOT)
        print(f"{r['key']:<22} {r['status']:<11} {secs:>8}  {log}")
    print("-" * 74)
    counts = {}
    for r in results:
        counts[r["status"]] = counts.get(r["status"], 0) + 1
    bits = [f"{k}={v}" for k, v in sorted(counts.items(), key=lambda kv: STATUS_ORDER.get(kv[0], 9))]
    total_s = sum(r["seconds"] for r in results)
    print(f"合计 {len(results)} 包, 墙钟 {total_s:.1f}s | " + "  ".join(bits))
    print("=" * 74)

    if no_script:
        print(f"\n⚠️  {len(no_script)} 个包**根本没被测到**（有测试文件但无 runner）：")
        for r in no_script:
            print(f"   - {r['key']}: {r.get('note', '')}")
        print(f"   日志: {no_script[0]['log']}")

    if failed and show_full:
        for r in failed:
            print(f"\n{'#' * 74}\n# FAIL: {r['key']}  (rc={r.get('rc')})\n{'#' * 74}")
            try:
                tail = Path(r["log"]).read_text(encoding="utf-8", errors="replace").splitlines()
            except OSError:
                continue
            for line in tail[-60:]:
                print(f"  {line}")

    return 1 if failed else 0


# ─── CLI ─────────────────────────────────────────────────────────────────────

def parse_args(argv: list[str]) -> argparse.Namespace:
    ap = argparse.ArgumentParser(description="AEK 测试脚本（替代 pnpm -r test）")
    ap.add_argument("--pkg", action="append", default=[],
                    help="只跑匹配的包，可重复传；支持子串匹配，如 --pkg browser")
    ap.add_argument("--serial", action="store_true", help="串行执行")
    ap.add_argument("--timeout", type=int, default=300, help="单包超时秒数（默认 300）")
    ap.add_argument("--list", action="store_true", help="只列出发现的包与 runner")
    ap.add_argument("--all-failed", action="store_true", help="打印失败包的完整输出")
    ap.add_argument("--no-browser-vitest", action="store_true",
                    help="跳过 vitest 类测试（依赖缺失时用）")
    ap.add_argument("--workers", type=int, default=0, help="并行度，0=包数量")
    return ap.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    pkgs = discover()
    if args.pkg:
        pkgs = [p for p in pkgs
                if any(a in p["key"] or a in p["name"] for a in args.pkg)]

    if args.list:
        print(f"{'PKG':<22} {'TESTS':>6}  {'RUNNER':<14} COMMAND")
        print("-" * 74)
        for p in pkgs:
            r = pick_runner(p)
            label = r[0] if r else ("NO_SCRIPT" if p["test_files"] else "-")
            cmd = " ".join(r[1]) if r else ("无 → " + NO_RUNNER_HINT if p["test_files"] else "无测试")
            print(f"{p['key']:<22} {p['test_files']:>6}  {label:<14} {cmd}")
        return 0

    if not pkgs:
        print(f"[!] 未匹配到任何包（--pkg={args.pkg}）")
        return 2

    print(f"发现 {len(pkgs)} 个包，输出目录: {OUT_DIR.relative_to(REPO_ROOT)}")
    print(f"单包超时: {args.timeout}s\n")

    workers = args.workers or (1 if args.serial else len(pkgs))
    start = time.monotonic()
    results: list[dict] = []
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = {
            ex.submit(run_one, p, args.timeout, args.no_browser_vitest): p
            for p in pkgs
        }
        for fut in as_completed(futs):
            r = fut.result()
            results.append(r)
            wall = time.monotonic() - start
            print(f"  [{wall:6.1f}s] {r['status']:<10} {r['key']:<20} {r.get('seconds', 0)}s"
                  f"  → {Path(r['log']).relative_to(REPO_ROOT)}", flush=True)

    return print_summary(results, show_full=args.all_failed)


if __name__ == "__main__":
    sys.exit(main())
