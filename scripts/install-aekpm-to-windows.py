#!/usr/bin/env python3
"""在 Windows 上安装 aek-prompt-manager 并复制到 fnm_multishells"""
import subprocess
import sys
from pathlib import Path

def run(cmd):
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    print(f"$ {cmd}")
    if result.stdout:
        print(result.stdout)
    if result.stderr:
        print(f"ERR: {result.stderr}", file=sys.stderr)
    return result

def main():
    pwsh = '/mnt/c/Program Files/PowerShell/7/pwsh.exe'
    
    # 1. 获取当前 fnm_multishells 目录
    cmd = pwsh + ' -Command "Split-Path (Get-Command npm).Source -Parent"'
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    multishell_dir = result.stdout.strip()
    print(f"Multishell dir: {multishell_dir}")
    
    if not multishell_dir or 'fnm_multishells' not in multishell_dir:
        print("ERROR: Could not find fnm_multishells directory")
        return
    
    # 2. 复制 aekpm shim 到 multishell
    npm_prefix = 'C:\\Users\\xdx\\AppData\\Roaming\\npm'
    shims = ['aekpm', 'aekpm.cmd', 'aekpm.ps1']
    
    for shim in shims:
        src = Path(npm_prefix) / shim
        dst = Path(multishell_dir) / shim
        if src.exists():
            subprocess.run(f'cp "{src}" "{dst}"', shell=True)
            print(f"Copied {shim}")
        else:
            print(f"WARNING: {shim} not found at {src}")
    
    # 3. 验证
    cmd = pwsh + ' -Command "aekpm --help 2>&1 | Select-Object -First 5"'
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    print("\n=== Verification ===")
    print(result.stdout)
    if result.stderr:
        print(f"STDERR: {result.stderr}")

if __name__ == '__main__':
    main()
