#!/usr/bin/env python3
# Build aek-mcp for linux-x64 / 为 linux-x64 构建 aek-mcp

import sys
from pathlib import Path

# Add scripts dir to path for import / 将 scripts 目录添加到路径以便导入
sys.path.insert(0, str(Path(__file__).parent.parent))
from start_scripts_shared_logic import run, PROJECT_ROOT


def main():
    root = PROJECT_ROOT / "packages" / "aek-mcp"
    frontend_dir = root / "frontend"
    
    # Build frontend / 构建前端
    if frontend_dir.exists():
        print("[aek-mcp] Building frontend...")
        run(["npm", "install"], cwd=frontend_dir)
        run(["npm", "run", "build"], cwd=frontend_dir)
        print("[aek-mcp] Frontend built to frontend/dist/")
    
    # Build Go backend / 构建 Go 后端
    print("[aek-mcp] Building Go backend...")
    run(["go", "build", "-o", "bin/one-mcp", "."], cwd=root)
    print("[aek-mcp] Built to bin/one-mcp")


if __name__ == "__main__":
    main()
