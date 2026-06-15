#!/usr/bin/env python3
# Build aek-websearch for linux-x64 / 为 linux-x64 构建 aek-websearch

import sys
from pathlib import Path

# Add scripts dir to path for import / 将 scripts 目录添加到路径以便导入
sys.path.insert(0, str(Path(__file__).parent.parent))
from start_scripts_shared_logic import run, PROJECT_ROOT


def main():
    root = PROJECT_ROOT / "packages" / "aek-websearch"
    
    run(["go", "build", "-o", "bin/aek", "./cmd/aek/"], cwd=root)
    print("[aek-websearch] Built to bin/aek (linux-x64)")


if __name__ == "__main__":
    main()
