#!/usr/bin/env python3
# Build aek-websearch for all platforms / 为所有平台构建 aek-websearch

import sys
from pathlib import Path

# Add scripts dir to path for import / 将 scripts 目录添加到路径以便导入
sys.path.insert(0, str(Path(__file__).parent.parent))
from start_scripts_shared_logic import run, ensure_dir, PROJECT_ROOT

PLATFORMS = [
    {"goos": "linux",   "goarch": "amd64", "dir": "linux-x64",   "ext": ""},
    {"goos": "darwin",  "goarch": "amd64", "dir": "darwin-x64",  "ext": ""},
    {"goos": "darwin",  "goarch": "arm64", "dir": "darwin-arm64", "ext": ""},
    {"goos": "windows", "goarch": "amd64", "dir": "win32-x64",   "ext": ".exe"},
]


def main():
    root = PROJECT_ROOT / "packages" / "aek-websearch"
    
    for p in PLATFORMS:
        out_dir = ensure_dir(root / "platforms" / p["dir"])
        out_bin = out_dir / f"aek{p['ext']}"
        print(f"[aek] Building {p['goos']}-{p['goarch']}...")
        run(
            ["go", "build", "-o", str(out_bin), "./cmd/aek/"],
            cwd=root,
            env={"GOOS": p["goos"], "GOARCH": p["goarch"]}
        )
        # Windows: also copy to bin/ so npm install -g works
        if p["goos"] == "windows":
            bin_dir = ensure_dir(root / "bin")
            import shutil
            shutil.copy2(out_bin, bin_dir / "aek.exe")
    
    print("[aek] All platforms built to platforms/")
    run(["npm", "install", "-g", "."], cwd=root)
    print("[aek] Installed current platform globally via npm")


if __name__ == "__main__":
    main()
