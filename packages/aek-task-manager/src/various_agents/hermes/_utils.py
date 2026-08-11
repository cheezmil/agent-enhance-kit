"""Utility for locating and calling the aek-task-manager Go binary."""
from __future__ import annotations

import json
import logging
import os
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

_SUBPROCESS_TIMEOUT = 30


def _get_binary_path() -> Path:
    """Find the aek-task-manager binary.

    Search order:
    1. Next to the plugin directory (bin/aek-task-manager)
    2. PATH
    3. Source directory (dev mode)
    """
    # 1. Plugin-adjacent binary (synced with plugin)
    plugin_dir = Path(__file__).resolve().parent
    binary = plugin_dir / "bin" / "aek-task-manager"
    if os.name == "nt":
        binary = binary.with_suffix(".exe")
    if binary.exists():
        return binary

    # 2. PATH
    which = os.name == "nt" and "where" or "which"
    try:
        result = subprocess.run(
            [which, "aek-task-manager"],
            capture_output=True, text=True, timeout=5,
        )
        if result.returncode == 0:
            return Path(result.stdout.strip())
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    # 3. Source directory (dev mode)
    src = Path(__file__).resolve().parent.parent.parent
    binary = src / "bin" / "aek-task-manager"
    if os.name == "nt":
        binary = binary.with_suffix(".exe")
    if binary.exists():
        return binary

    raise RuntimeError("aek-task-manager binary not found. Run `go build -o bin/aek-task-manager ./src/cmd/aek-task-manager/`")


def call_binary(command: str, args: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Call the Go binary with a command and JSON args.

    Returns the parsed JSON result.
    """
    binary = str(_get_binary_path())
    cmd = [binary, command]
    if args:
        cmd.append(json.dumps(args, ensure_ascii=False))

    try:
        result = subprocess.run(
            cmd,
            capture_output=True, text=True, timeout=_SUBPROCESS_TIMEOUT,
            cwd=os.getcwd(),
        )
        if result.stdout:
            return json.loads(result.stdout)
        return {"ok": False, "error": result.stderr or "no output"}
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": f"Command timed out ({_SUBPROCESS_TIMEOUT}s)"}
    except json.JSONDecodeError as e:
        return {"ok": False, "error": f"Invalid JSON from binary: {e}"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def _validate_task_id(task_id: str) -> Optional[str]:
    """Validate task_id format. Returns error message or None if valid."""
    import re
    if not task_id:
        return "task_id cannot be empty"
    if len(task_id) > 64:
        return "task_id must be 64 characters or less"
    if not re.match(r"^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$", task_id):
        return "Invalid task_id format"
    return None


def _utcnow_iso() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")