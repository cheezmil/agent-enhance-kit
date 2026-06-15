#!/usr/bin/env python3
# Test all modules / 测试所有模块

import sys
from pathlib import Path

# Add scripts dir to path for import / 将 scripts 目录添加到路径以便导入
sys.path.insert(0, str(Path(__file__).parent))
from start_scripts_shared_logic import run, PROJECT_ROOT

MODULES = ["aek-websearch", "aek-mcp"]


def main():
    scripts_dir = PROJECT_ROOT / "scripts"
    
    for mod in MODULES:
        script = scripts_dir / mod / "test.py"
        print(f"\n=== Testing {mod} ===")
        run([sys.executable, str(script)], cwd=PROJECT_ROOT)
    
    print("\n=== All tests passed ===")


if __name__ == "__main__":
    main()
