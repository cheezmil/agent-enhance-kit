#!/usr/bin/env python3
import subprocess
import sys

def run(cmd):
    r = subprocess.run(["/mnt/c/Program Files/PowerShell/7/pwsh.exe", "-Command", cmd],
                       capture_output=True, text=True)
    return r.stdout.strip(), r.stderr.strip(), r.returncode

def main():
    # Get current shell's node_modules path
    _, node_modules, _ = run("Get-ChildItem (Split-Path (Get-Command node).Source -Parent)\\..\\node_modules\\@cheezmil")
    print("=== Windows node_modules @cheezmil ===")
    print(node_modules)

    # Check aek-websearch-win32-x64
    _, shims, _ = run("Get-ChildItem (Split-Path (Get-Command node).Source -Parent) -Filter 'aek*'")
    print("\n=== Shell bin contents ===")
    print(shims)

    # Check what aek websearch does
    out, err, rc = run("aek websearch 'test' 2>&1")
    print(f"\n=== aek websearch test ===")
    print(f"RC: {rc}")
    print(f"OUT: {out[:500]}")
    if err:
        print(f"ERR: {err[:500]}")

if __name__ == "__main__":
    main()