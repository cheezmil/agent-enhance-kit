#!/usr/bin/env python3
# Deploy aek-mcp backend only: stop old → build → start gin (1352)
import os, signal, subprocess, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from start_scripts_shared_logic import run, kill_port, AEK_MCP_BACKEND_PORT, AEK_MCP_FRONTEND_PORT, can_bind, is_win

AEK_MCP_DIR = Path(__file__).parent.parent.parent / "packages" / "aek-mcp"


def kill_old():
    if is_win():
        run_safe_sub(["taskkill", "/F", "/IM", "aek-mcp.exe"])
    else:
        import subprocess as _sp
        for name in ["aek-mcp", "one-mcp"]:
            r = _sp.run(["pgrep", "-x", name], capture_output=True, text=True)
            if r.returncode == 0:
                for pid in r.stdout.strip().split():
                    pid = pid.strip()
                    if pid:
                        try: os.kill(int(pid), signal.SIGTERM)
                        except Exception: pass
    kill_port(AEK_MCP_BACKEND_PORT)
    time.sleep(1)
    print("[aek-mcp] Old backend instances killed")


def run_safe_sub(cmd):
    """Run a command, ignore non-zero exit."""
    subprocess.run(cmd, check=False)


def main():
    print("=== Deploying aek-mcp backend (gin 1352) ===\n")

    print("[1/3] Stopping old backend...")
    kill_old()

    print("\n[2/3] Building backend...")
    run(["go", "build", "-a", "-o", "bin/aek-mcp", "./cmd/aek-mcp/"], cwd=AEK_MCP_DIR)
    print("[aek-mcp] Built to bin/aek-mcp")

    print(f"\n[3/3] Starting gin backend on port {AEK_MCP_BACKEND_PORT}...")
    bin_path = AEK_MCP_DIR / "bin" / "aek-mcp"
    if not bin_path.exists():
        print("Error: bin/aek-mcp not found after build")
        sys.exit(1)

    if is_win():
        proc = subprocess.Popen(
            [str(bin_path)], cwd=AEK_MCP_DIR,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
        )
    else:
        proc = subprocess.Popen(
            [str(bin_path)], cwd=AEK_MCP_DIR,
            start_new_session=True,
        )

    ready = False
    deadline = time.time() + 40
    while time.time() < deadline:
        try:
            import urllib.request
            resp = urllib.request.urlopen(
                f"http://127.0.0.1:{AEK_MCP_BACKEND_PORT}/health", timeout=3)
            if resp.status == 200:
                ready = True
                break
        except Exception:
            pass
        time.sleep(1)

    if ready:
        print(f"[aek-mcp] Gin backend ready on port {AEK_MCP_BACKEND_PORT} (pid {proc.pid})")
    else:
        print("Warning: Gin did not become ready in time")

    print(f"""
=== aek-mcp backend deployed ===
    Gin backend: http://127.0.0.1:{AEK_MCP_BACKEND_PORT}/
""")


if __name__ == "__main__":
    main()
