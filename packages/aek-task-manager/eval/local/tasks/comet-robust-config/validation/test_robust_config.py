"""Validation for the comet-robust-config task.

Checks: comet workflow followed + malformed input raises ConfigError + happy path intact.
"""

import subprocess
import sys

from comet_checks import (
    run_comet_checks,
    write_results,
    _passed,
    _failed,
    WORKSPACE,
)


def check_error_handling() -> dict:
    """All config tests pass: 5 error-handling + 4 happy-path."""
    result = subprocess.run(
        [sys.executable, "-m", "pytest", "test_config_loader.py", "-q"],
        capture_output=True, text=True, cwd=str(WORKSPACE),
    )
    if result.returncode != 0:
        out = result.stdout + result.stderr
        return _failed("error_handling", f"tests failing:\n{out[-400:]}")
    return _passed("error_handling", "malformed input raises ConfigError, happy path intact")


def run_all() -> list[dict]:
    results = run_comet_checks()
    results.append(check_error_handling())
    return results


if __name__ == "__main__":
    write_results(run_all())
