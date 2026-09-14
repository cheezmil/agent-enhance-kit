# WSL → Windows Cross-Platform Deployment

**Session context:** 2026-09-14, debugging and fixing AEK Windows deployment from WSL.

## Problem: Windows `aek` Command Failing Silently

### Root Cause

Windows npm's global prefix was pointing to a transient `fnm_multishells` directory instead of the stable `%APPDATA%\npm` location. Each new PowerShell window creates a new temp directory under `C:\Users\<user>\AppData\Local\fnm_multishells\<random>\`, so the `aek.ps1` shim always pointed to a dead path.

### Diagnosis

```powershell
# Check current npm prefix
npm config get prefix
# Should return: C:\Users\<user>\AppData\Roaming\npm
# But was returning: C:\Users\<user>\AppData\Local\fnm_multishells\12345_...

# Check where aek points
Get-Command aek | Select-Object Source
# Shows: C:\Users\<user>\AppData\Local\fnm_multishells\12345_...\aek.ps1
```

### Fix

```powershell
# 1. Set correct persistent prefix
npm config set prefix "C:\Users\<user>\AppData\Roaming\npm"

# 2. Reinstall to update shims at correct location
npm install -g @cheezmil/aek@0.1.6 @cheezmil/aek-websearch@0.2.3 @cheezmil/aek-common@0.1.2 @cheezmil/aek-mcp@0.11.2 @cheezmil/aek-prompt-manager@0.1.3 @cheezmil/aek-skill-manager@0.1.2 @cheezmil/aek-task-manager@0.0.1
```

## Fix: Deploy Script Should Read from platforms/, Not Cross-Compile

The original script ran `go build GOOS=windows` during deploy, which is wrong:
1. Binary should be built once by `pnpm run build` into `platforms/win32-x64/`
2. Deploy script should just copy the pre-built binary
3. Cross-compiling in WSL can produce wrong output (not Windows PE)

### Correct Pattern

```python
# In start_deploy_aek-websearch-to-windows.py
platforms_bin = PKG_DIR / "platforms" / "win32-x64" / "aek.exe"
if not platforms_bin.exists():
    print("请先运行: pnpm run build")
    sys.exit(1)
# Copy platforms_bin to %USERPROFILE%\.aek\bin\win\
```

## Correct Deploy Target Path

**Old (wrong):** `%USERPROFILE%\bin\`
**New (correct):** `%USERPROFILE%\.aek\bin\win\`

The `.aek\bin\win\` directory is the Hermes sync target. Both `aek.exe` and `aek-websearch.exe` go there.

## pnpm Build/Install Gotchas

### esbuild ignore error

```
[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: esbuild@0.21.5, esbuild@0.28.1
Run "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.
[ERROR] Command failed with exit code 1: pnpm install
```

**Fix:** Run `pnpm install --ignore-scripts` first, then `pnpm approve-builds` interactively to allow esbuild scripts. Or set in `pnpm-workspace.yaml`:
```yaml
allowBuilds:
  esbuild: true
```

### pnpm --filter passes through to Go

```bash
# WRONG - passes --filter to go build:
pnpm run test --filter=@cheezmil/aek-websearch
# go build: package --filter=@cheezmil/aek-websearch: can only use path@version syntax

# CORRECT - pnpm filter syntax:
pnpm --filter=@cheezmil/aek-websearch test
```

## Key Code Pattern

```python
# WSL path → Windows UNC
DISTRO = os.environ.get('WSL_DISTRO_NAME', 'Ubuntu-22.04')

def wsl_to_unc(path):
    p = str(path).replace('/', '\\')
    if p.startswith('\\'): p = p.lstrip('\\')
    return f'\\\\wsl.localhost\\{DISTRO}\\{p}'

# Invoke PowerShell (NO -NoProfile!)
pwsh = '/mnt/c/Program Files/PowerShell/7/pwsh.exe'
subprocess.run([pwsh, '-Command', script], check=True)
```

## Important Rules

1. **Never pass `-NoProfile` to pwsh** — user rule, prevents loading user's PowerShell profile
2. **Use `pwsh -Command` not `pwsh -c`** — `-c` is shorter but `-Command` is more explicit
3. **Compile with `-a` flag** for reproducible builds: `go build -a -o bin/aek.exe ./cmd/aek/`
4. **Sync to `platforms/win32-x64/bin/`** after compiling — this is what the JS launcher expects
5. **Use UNC paths** (`\\wsl.localhost\<distro>\...`) for WSL→Windows file access from PowerShell
6. **`%USERPROFILE%\.aek\bin\win` must be on PATH** — verify with `pave` or manual PATH injection
7. **Deploy script reads from platforms/, not self-compiles** — always run `pnpm run build` first