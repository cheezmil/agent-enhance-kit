#!/usr/bin/env python3
"""Test unified /mcp endpoint for aek-mcp"""

import json
import subprocess
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path

PORT = 1351
BASE_URL = f"http://localhost:{PORT}"


def kill_old_instance():
    """Kill any running aek-mcp process"""
    if sys.platform == "win32":
        subprocess.run(["taskkill", "/F", "/IM", "aek-mcp.exe"], capture_output=True)
    else:
        subprocess.run(["pkill", "-x", "aek-mcp"], capture_output=True)
    time.sleep(1)


def wait_for_server(timeout=10):
    """Wait until server is ready"""
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            req = urllib.request.Request(BASE_URL + "/api/status")
            urllib.request.urlopen(req, timeout=2)
            return True
        except Exception:
            time.sleep(0.3)
    return False


def http_request(method, path, data=None, headers=None):
    """Send HTTP request, return (status, parsed_json_or_raw_str)"""
    url = BASE_URL + path
    body = None
    if data is not None:
        body = json.dumps(data).encode("utf-8")
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header("Content-Type", "application/json")
    if headers:
        for k, v in headers.items():
            req.add_header(k, v)
    try:
        resp = urllib.request.urlopen(req, timeout=10)
        raw = resp.read().decode()
        try:
            return resp.status, json.loads(raw)
        except json.JSONDecodeError:
            return resp.status, raw
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except json.JSONDecodeError:
            return e.code, raw
    except Exception as e:
        return 0, str(e)


def login():
    """Login as root and return JWT token"""
    status, body = http_request("POST", "/api/user/login", {
        "username": "root",
        "password": "123456"
    })
    if status == 200 and isinstance(body, dict) and body.get("success"):
        data = body.get("data", {})
        return data.get("access_token") or data.get("token")
    print(f"  [FAIL] Login failed: status={status} body={json.dumps(body)[:200]}")
    return None


def main():
    print("=== Testing unified /mcp endpoint ===\n")

    # Step 1: Kill old instances
    print("[1] Killing old instances...")
    kill_old_instance()

    # Step 2: Start server
    binary = Path(__file__).parent.parent / "packages" / "aek-mcp" / "bin" / "aek-mcp"
    if not binary.exists():
        print(f"[FAIL] Binary not found: {binary}")
        sys.exit(1)

    print(f"[2] Starting server on port {PORT}...")
    proc = subprocess.Popen(
        [str(binary), "--port", str(PORT)],
        cwd=str(binary.parent.parent),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )

    try:
        if not wait_for_server(timeout=10):
            print("[FAIL] Server failed to start within 10s")
            sys.exit(1)
        print("[OK] Server started\n")

        passed = 0
        failed = 0

        # Step 3: Login
        print("[3] Login as root...")
        token = login()
        if not token:
            sys.exit(1)
        print(f"  [OK] Got token: {token[:20]}...")

        # Test 1: /mcp with valid token returns 200
        print("\n[4] POST /mcp with token -> expect 200...")
        status, body = http_request("POST", "/mcp", {
            "jsonrpc": "2.0",
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-03-26",
                "capabilities": {},
                "clientInfo": {"name": "test", "version": "1.0"}
            },
            "id": 1
        }, headers={"Authorization": f"Bearer {token}"})

        raw_str = json.dumps(body) if isinstance(body, dict) else str(body)
        if status == 200:
            print(f"  [PASS] status=200")
            passed += 1
        else:
            print(f"  [FAIL] status={status}: {raw_str[:300]}")
            failed += 1

        # Test 2: /mcp without token returns 401
        print("\n[5] POST /mcp without token -> expect 401...")
        status, body = http_request("POST", "/mcp", {
            "jsonrpc": "2.0",
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-03-26",
                "capabilities": {},
                "clientInfo": {"name": "test", "version": "1.0"}
            },
            "id": 1
        })

        raw_str = json.dumps(body) if isinstance(body, dict) else str(body)
        is_html = "<!doctype html>" in raw_str.lower() or "<html" in raw_str.lower()
        if status == 401 and not is_html:
            print(f"  [PASS] status=401 (auth required)")
            passed += 1
        else:
            print(f"  [FAIL] status={status}: {raw_str[:300]}")
            failed += 1

        # Test 3: /api/status returns 200
        print("\n[6] GET /api/status -> expect 200...")
        status, body = http_request("GET", "/api/status")
        raw_str = json.dumps(body) if isinstance(body, dict) else str(body)
        if status == 200 and "<!doctype html>" not in raw_str.lower():
            print(f"  [PASS] status=200")
            passed += 1
        else:
            print(f"  [FAIL] status={status}: {raw_str[:300]}")
            failed += 1

        print(f"\n=== Results: {passed} passed, {failed} failed ===")
        sys.exit(0 if failed == 0 else 1)

    finally:
        print("\n[Cleanup] Stopping server...")
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()
        print("[OK] Server stopped")


if __name__ == "__main__":
    main()
