#!/usr/bin/env python3
"""检查 Windows 上 aek 包的完整状态"""
import subprocess
import sys

def run(cmd):
    r = subprocess.run(
        ["/mnt/c/Program Files/PowerShell/7/pwsh.exe", "-Command", cmd],
        capture_output=True, text=True
    )
    return r.stdout.strip(), r.stderr.strip(), r.returncode

# 1. 获取 Windows 当前 shell 的 node 路径
out, err, rc = run("Get-Command node | Select-Object -ExpandProperty Source")
print(f"=== node 路径 ===\n{out}")

# 2. 获取 multishell 目录
if "fnm_multishells" in out:
    parts = out.replace("\\", "/").split("/")
    for i, p in enumerate(parts):
        if "fnm_multishells" in p and i + 1 < len(parts):
            shell_dir = parts[i+1]
            print(f"=== shell dir ===\n{shell_dir}")
            
            # 3. 列出 multishell 下的 aek 包
            out2, _, _ = run(f"ls 'C:\\Users\\xdx\\AppData\\Local\\fnm_multishells\\{shell_dir}\\node_modules\\@cheezmil' 2>&1")
            print(f"=== aek packages in multishell ===\n{out2}")
            
            # 4. 检查 npm root -g
            out3, _, _ = run(f"cd 'C:\\Users\\xdx\\AppData\\Local\\fnm_multishells\\{shell_dir}'; npm root -g")
            print(f"=== npm root -g ===\n{out3}")
            
            # 5. 检查 aek-websearch 是否存在
            out4, _, _ = run(f"Test-Path 'C:\\Users\\xdx\\AppData\\Local\\fnm_multishells\\{shell_dir}\\node_modules\\@cheezmil\\aek-websearch'")
            print(f"=== aek-websearch exists ===\n{out4}")
            break

# 6. 检查 AppData/npm 下的 aek 包
print("\n=== aek packages in AppData/npm ===")
out, _, _ = run("ls 'C:\\Users\\xdx\\AppData\\Roaming\\npm\\node_modules\\@cheezmil' 2>&1")
print(out)

# 7. 检查 aekpm 是否可用
print("\n=== aekpm status ===")
out, err, rc = run("aekpm --version 2>&1 | Select-Object -First 1")
print(f"stdout: {out}")
print(f"stderr: {err[:200]}")
print(f"rc: {rc}")