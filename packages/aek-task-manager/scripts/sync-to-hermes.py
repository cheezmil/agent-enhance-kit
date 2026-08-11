#!/usr/bin/env python3
"""Sync aek-task-manager plugin + binary to Hermes.

Cross-platform (Windows/Linux/macOS).
Usage: python scripts/sync-to-hermes.py
"""
import os
import shutil
import sys
from pathlib import Path

PKG = Path(__file__).resolve().parent.parent
# Monorepo root is two levels up from scripts/ (agent-enhance-kit/)
MONOREPO = PKG.parent.parent
PLUGIN_NAME = "aek-task-manager"

# Hermes home
if os.name == "nt":
    local_appdata = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
    HERMES_HOME = Path(local_appdata) / "hermes"
else:
    HERMES_HOME = Path.home() / ".hermes"

DST_PLUGIN = HERMES_HOME / "plugins" / PLUGIN_NAME
DST_SKILL = HERMES_HOME / "skills" / PLUGIN_NAME

# Source dirs
SRC_PLUGIN = PKG / "src" / "various_agents" / "hermes"
SRC_BIN = PKG / "bin"
SRC_SKILL = MONOREPO / "skills" / PLUGIN_NAME / "SKILL.md"

# Old cleanup
OLD = [
    HERMES_HOME / "plugins" / "sagtask",
    HERMES_HOME / "skills" / "sagtask",
]

EXTS = {".py", ".yaml", ".md", ".json"}


def copy_dir(src: Path, dst: Path) -> int:
    if not src.exists():
        return 0
    dst.mkdir(parents=True, exist_ok=True)
    count = 0
    for entry in sorted(src.iterdir()):
        if entry.name == "__pycache__":
            continue
        d = dst / entry.name
        if entry.is_dir():
            count += copy_dir(entry, d)
        elif entry.is_file():
            if entry.suffix in EXTS or entry.name == "VERSION":
                shutil.copy2(entry, d)
                count += 1
    return count


def remove_dir(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)
        print(f"  Removed: {path}")


print(f"[Sync] Source plugin: {SRC_PLUGIN}")
print(f"[Sync] Source binary: {SRC_BIN}")
print(f"[Sync] Target plugin: {DST_PLUGIN}")
print(f"[Sync] Target skill:  {DST_SKILL}")

# Clean old
for p in OLD:
    remove_dir(p)
remove_dir(DST_PLUGIN)

# Copy plugin files
n = copy_dir(SRC_PLUGIN, DST_PLUGIN)
print(f"  Copied {n} plugin files")

# Copy binary — only native platform binary
if SRC_BIN.exists():
    dst_bin = DST_PLUGIN / "bin"
    dst_bin.mkdir(parents=True, exist_ok=True)
    native_name = "aek-task-manager.exe" if os.name == "nt" else "aek-task-manager"
    native_path = SRC_BIN / native_name
    if native_path.exists():
        shutil.copy2(native_path, dst_bin / native_name)
        print(f"  Binary: {native_name}")
    else:
        # fallback: copy any binary
        for f in SRC_BIN.iterdir():
            if f.is_file() and not f.name.startswith("."):
                shutil.copy2(f, dst_bin / f.name)
                print(f"  Binary: {f.name} (fallback)")
                break
else:
    print("[Sync] WARNING: bin/ directory not found. Run `go build -o bin/aek-task-manager ./src/cmd/aek-task-manager/` first.")

# Copy SKILL.md
if SRC_SKILL.exists():
    DST_SKILL.mkdir(parents=True, exist_ok=True)
    shutil.copy2(SRC_SKILL, DST_SKILL / "SKILL.md")
    print(f"  SKILL.md copied")

print(f"[Sync] Done! Plugin synced to {DST_PLUGIN}")
print("[Sync] Restart Hermes to load the new plugin version.")