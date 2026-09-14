#!/usr/bin/env python3
"""检查 Windows 上 aek 包的完整状态"""
import subprocess
import os

def run(cmd):
    r = subprocess.run(
        ["/mnt/c/Program Files/PowerShell/7/pwsh.exe", "-Command", cmd],
        capture_output=True, text=True
    )
    return r.stdout.strip(), r.stderr.strip(), r.returncode

print("=== 1. 检查 npm prefix 配置 ===")
out, err, rc = run("npm config get prefix")
print(f"prefix: {out}")

print("\n=== 2. 检查当前 shell 的 node ===")
out, err, rc = run("where.exe node")
print(out)

print("\n=== 3. 检查所有 fnm_multishells 目录 ===")
out, err, rc = run("""
Get-ChildItem 'C:\\Users\\xdx\\AppData\\Local\\fnm_multishells' -Directory |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 3 |
  ForEach-Object { Write-Host $_.FullName; Get-ChildItem $_.FullName }
""")
print(out[:500] if len(out) > 500 else out)

print("\n=== 4. 检查 AppData/npm 下的 aek 包 ===")
out, err, rc = run("ls 'C:\\Users\\xdx\\AppData\\Roaming\\npm\\node_modules\\@cheezmil' 2>&1")
print(out)

print("\n=== 5. 检查 aekpm 脚本 ===")
out, err, rc = run("type 'C:\\Users\\xdx\\AppData\\Roaming\\npm\\aekpm.ps1' 2>$null")
print(out[:300] if out else "no aekpm.ps1")