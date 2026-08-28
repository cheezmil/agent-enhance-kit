#!/bin/bash
# check-all.sh — AEK 完整检查脚本
set -e

echo "===== AEK 安装检查 ====="
echo ""

# 1. Git 状态
echo "[1] Git 提交"
git log --oneline -1
git status --short | head -5
echo ""

# 2. Linux 端命令
echo "[2] Linux 端命令"
which aek && aek version 2>&1 | tail -1
which aek-websearch && aek-websearch version 2>&1 | tail -1
which aek-skill-manager
which aek-prompt-manager
which aek-tm
echo ""

# 3. Windows 端二进制
echo "[3] Windows 端"
echo "WSL 缓存: ~/.aek/windows-bin/"
ls ~/.aek/windows-bin/ 2>/dev/null || echo "  (空)"
echo "Windows 路径: /mnt/c/Users/xdx/.aek/windows-bin/"
ls /mnt/c/Users/xdx/.aek/windows-bin/ 2>/dev/null || echo "  (空)"
echo ""

# 4. Prompt Patch 状态
echo "[4] Prompt Patch"
aek pm status 2>&1 | grep -c "patched" || echo "0 工具已 patch"
echo ""

# 5. Skills 状态
echo "[5] Skills (Hermes)"
ls ~/.hermes/skills/ 2>/dev/null | grep "^aek-" || echo "  (无)"
echo ""

# 6. 构建/测试
echo "[6] 构建/测试"
pnpm run test 2>&1 | tail -2
pnpm run build 2>&1 | tail -2
