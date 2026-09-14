#!/usr/bin/env python3
"""从 WSL 中设置 Windows 用户 PATH，添加 npm 全局路径"""
import subprocess
from pathlib import Path

def main():
    pwsh = "/mnt/c/Program Files/PowerShell/7/pwsh.exe"
    
    # 添加 npm 全局路径到用户 PATH
    script = r'''
$userPath = [Environment]::GetEnvironmentVariable('PATH', 'User')
$npmPath = 'C:\Users\xdx\AppData\Roaming\npm'
if ($userPath -notlike "*$npmPath*") {
    $newPath = $userPath + ";$npmPath"
    [Environment]::SetEnvironmentVariable('PATH', $newPath, 'User')
    Write-Host "Added $npmPath to User PATH"
} else {
    Write-Host "$npmPath already in User PATH"
}
# 验证
$env:Path = [Environment]::GetEnvironmentVariable('PATH', 'User')
Write-Host "Current PATH contains npm: $(($env:Path -like '*Roaming*\npm'))"
'''
    
    result = subprocess.run(
        [pwsh, "-Command", script],
        capture_output=True,
        text=True
    )
    print(result.stdout)
    if result.stderr:
        print(f"stderr: {result.stderr}", file=__import__('sys').stderr)
    
    # 验证 aekpm
    print("\nVerifying aekpm...")
    result = subprocess.run(
        [pwsh, "-Command", "aekpm --version 2>&1"],
        capture_output=True,
        text=True
    )
    print(result.stdout)
    if result.stderr:
        print(f"stderr: {result.stderr}", file=__import__('sys').stderr)

if __name__ == "__main__":
    main()
