#!/usr/bin/env python3
"""检查 Windows 上 aek 包的完整状态"""
import subprocess

def run(cmd):
    r = subprocess.run(
        ["/mnt/c/Program Files/PowerShell/7/pwsh.exe", "-Command", cmd],
        capture_output=True, text=True
    )
    return r.stdout.strip(), r.stderr.strip(), r.returncode

print("=== 1. 检查 npm root ===")
out, err, rc = run("npm root -g")
print(f"npm root: {out}")

print("\n=== 2. 检查当前 multishell 目录 ===")
out, err, rc = run("(Get-Command node).Source")
print(f"node path: {out}")
if 'fnm_multishells' in out:
    shell_dir = out.split('\\fnm_multishells\\')[1].split('\\')[0]
    print(f"shell dir: fnm_multishells\\{shell_dir}")

print("\n=== 3. 检查 aek-websearch 是否可导入 ===")
out, err, rc = run('''
node -e "try { require('@cheezmil/aek-websearch'); console.log('OK'); } catch(e) { console.log('FAIL:', e.message); }"
''')
print(f"stdout: {out}")
print(f"stderr: {err}")

print("\n=== 4. 检查安装的 aek 包 ===")
out, err, rc = run("npm list -g --depth=0 2>&1 | Select-String 'aek'")
print(out)

print("\n=== 5. 检查 aekpm ===")
out, err, rc = run("aekpm --version 2>&1 | Select-Object -First 3")
print(f"stdout: {out}")
print(f"stderr: {err}")
print(f"rc: {rc}")