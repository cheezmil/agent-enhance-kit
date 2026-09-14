#!/usr/bin/env python3
import subprocess

def run(cmd):
    result = subprocess.run(
        ["/mnt/c/Program Files/PowerShell/7/pwsh.exe", "-Command", cmd],
        capture_output=True, text=True
    )
    return result.stdout.strip(), result.stderr.strip(), result.returncode

def main():
    # Check if npm prefix path is still in User PATH
    out, err, rc = run(r'[Environment]::GetEnvironmentVariable("PATH", "User") -split ";" | Where-Object { $_ -like "*AppData*Roaming*npm*" }')
    print(f"npm path in User PATH: '{out}' (rc={rc})")
    
    # Check fnm multishell path
    out2, err2, rc2 = run(r"fnm env")
    print(f"\nfnm env (first 500 chars):\n{out2[:500]}")
    
    # Try aekpm
    out3, err3, rc3 = run(r"aekpm --version 2>&1")
    print(f"\naekpm test:\nstdout: {out3}\nstderr: {err3}\nrc: {rc3}")

if __name__ == "__main__":
    main()