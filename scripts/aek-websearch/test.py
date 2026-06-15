#!/usr/bin/env python3
# Run aek-websearch tests / 运行 aek-websearch 测试

import sys
from pathlib import Path

# Add scripts dir to path for import / 将 scripts 目录添加到路径以便导入
sys.path.insert(0, str(Path(__file__).parent.parent))
from start_scripts_shared_logic import run, PROJECT_ROOT


def main():
    root = PROJECT_ROOT / "packages" / "aek-websearch"
    
    print("[aek-websearch] Running tests...")
    run(["go", "test", "./..."], cwd=root)
    print("[aek-websearch] All tests passed")


if __name__ == "__main__":
    main()
