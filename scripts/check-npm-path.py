#!/usr/bin/env python3
import subprocess
import sys

def run(cmd):
    r = subprocess.run(["/mnt/c/Program Files/PowerShell/7/pwsh.exe", "-Command", cmd], 
                       capture_output=True, text=True)
    return r.stdout, r.stderr, r.returncode

def main():
    # 1. Check what's in AppData\Roaming\npm
    out, err, rc = run("ls 'C:\\Users\\xdx\\AppData\\Roaming\\npm' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name")
    print("=== AppData\\Roaming\\npm ===")
    print(out)
    
    # 2. Check if aek packages are there
    out, err, rc = run("ls 'C:\\Users\\xdx\\AppData\\Roaming\\npm\\node_modules' -ErrorAction SilentlyContinue | Where-Object { $_ -like '*aek*' } | Select-Object -ExpandProperty Name")
    print("=== aek packages in Roaming\\npm ===")
    print(out)
    
    # 3. Check PATH
    out, err, rc = run("[Environment]::GetEnvironmentVariable('PATH', 'User') -split ';'")
    print("=== User PATH ===")
    print(out)
    
    # 4. Check Machine PATH
    out, err, rc = run("[Environment]::GetEnvironmentVariable('PATH', 'Machine') -split ';'")
    print("=== Machine PATH ===")
    print(out)
    
    # 5. Check if npm prefix is in PATH
    out, err, rc = run("npm config get prefix")
    print(f"=== npm prefix ===\n{out}")

if __name__ == "__main__":
    main()