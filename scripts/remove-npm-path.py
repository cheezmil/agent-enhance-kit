#!/usr/bin/env python3
"""从 Windows 用户 PATH 中移除 npm 全局路径（该路径应通过 fnm 动态设置）"""
import subprocess

def run(cmd):
    result = subprocess.run(
        ["/mnt/c/Program Files/PowerShell/7/pwsh.exe", "-Command", cmd],
        capture_output=True, text=True
    )
    return result.stdout, result.stderr, result.returncode

def main():
    # 移除 User PATH 中的 C:\Users\xdx\AppData\Roaming\npm
    cmd = r'''
$userPath = [Environment]::GetEnvironmentVariable('PATH', 'User')
$newPath = $userPath -replace ';C:\\Users\\xdx\\AppData\\Roaming\\npm', '' -replace ';+$', ''
[Environment]::SetEnvironmentVariable('PATH', $newPath, 'User')
Write-Host "Removed from User PATH"
'''
    out, err, rc = run(cmd)
    print(f"stdout: {out}")
    print(f"stderr: {err}")
    print(f"rc: {rc}")
    
    # 验证
    out2, err2, rc2 = run(r'[Environment]::GetEnvironmentVariable("PATH", "User") -split ";" | Where-Object { $_ -like "*Roaming*npm*" }')
    print(f"After removal: {out2}")

if __name__ == "__main__":
    main()