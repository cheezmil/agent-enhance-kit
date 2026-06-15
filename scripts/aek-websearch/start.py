#!/usr/bin/env python3
# Start aek-websearch server / 启动 aek-websearch 服务器

import sys
from pathlib import Path

# Add scripts dir to path for import / 将 scripts 目录添加到路径以便导入
sys.path.insert(0, str(Path(__file__).parent.parent))
from start_scripts_shared_logic import run, PROJECT_ROOT


def main():
    root = PROJECT_ROOT / "packages" / "aek-websearch"
    
    run(["./bin/aek", "serve"], cwd=root)


if __name__ == "__main__":
    main()
