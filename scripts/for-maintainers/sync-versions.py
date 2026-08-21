#!/usr/bin/env python3
"""sync-versions — 将主包版本同步到其平台子包，并保持 optionalDependencies 引用一致。

esbuild 式平台分包：@cheezmil/<主包>-<platform>-<arch> 的版本必须与主包同步。
changesets 只管 workspace 里的主包，平台子包版本由本脚本统一对齐。

用法（每次 changeset version 之后、publish 之前执行）:
    pnpm changeset version
    python3 scripts/for-maintainers/sync-versions.py
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PACKAGES = os.path.join(ROOT, "packages")

# 主包短名 → 平台子包目录
PLATFORM_SUFFIXES = [
    "-linux-x64",
    "-linux-arm64",
    "-darwin-x64",
    "-darwin-arm64",
    "-win32-x64",
]

MAIN_PACKAGES = [
    "aek-websearch",
    "aek-task-manager",
    "aek-mcp",
]


def main():
    changed = []
    for main_name in MAIN_PACKAGES:
        main_json = os.path.join(PACKAGES, main_name, "package.json")
        with open(main_json, encoding="utf-8") as f:
            main_data = json.load(f)
        main_version = main_data["version"]

        platform_dir = os.path.join(PACKAGES, main_name, "platforms")
        if not os.path.isdir(platform_dir):
            continue

        for suffix in PLATFORM_SUFFIXES:
            sub_json = os.path.join(platform_dir, suffix, "package.json")
            if not os.path.exists(sub_json):
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


if __name__ == "__main__":
    main()