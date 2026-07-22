#!/usr/bin/env python3

"""
Release script for agent-enhance-kit

This script:
1. Reads version from packages/aek-websearch/VERSION
2. Checks if tag already exists
3. Creates git tag
4. Pushes tag to GitHub

Used as a "finally" script in cqg acp configuration.
Config path: .cheezmil_quick_git/config/which_script_run_when_quick_add_commit_push_execute_finally.txt
"""

import os
import sys
import subprocess
from pathlib import Path

# Paths
SCRIPT_DIR = Path(__file__).parent
ROOT_DIR = SCRIPT_DIR.parent.parent  # up to scripts, then to root
VERSION_FILE = ROOT_DIR / "VERSION"

# Colors
class Colors:
    RESET = '\033[0m'
    RED = '\033[31m'
    GREEN = '\033[32m'
    YELLOW = '\033[33m'
    CYAN = '\033[36m'

def log(message, color=Colors.RESET):
    print(f"{color}{message}{Colors.RESET}")

def exec_command(command, check=False):
    """Execute a shell command and return output."""
    try:
        result = subprocess.run(
            command,
            cwd=ROOT_DIR,
            shell=True,
            capture_output=True,
            text=True,
            check=check
        )
        return result.stdout.strip()
    except subprocess.CalledProcessError:
        return None

def main():
    print()
    log("=== Agent Enhance Kit Release ===", Colors.CYAN)
    print()

    # 1. Check if VERSION file exists
    if not VERSION_FILE.exists():
        log(f"ERROR: VERSION file not found at {VERSION_FILE}", Colors.RED)
        sys.exit(1)

    # 2. Read version
    version = VERSION_FILE.read_text().strip()
    if not version:
        log("ERROR: VERSION file is empty", Colors.RED)
        sys.exit(1)

    tag_name = f"v{version}"
    log(f"Version: {version}", Colors.GREEN)
    log(f"Tag: {tag_name}", Colors.GREEN)

    # 3. Check if tag already exists
    existing_tag = exec_command(f'git tag -l "{tag_name}"')
    if existing_tag == tag_name:
        print()
        log(f"Tag {tag_name} already exists. Skipping release.", Colors.YELLOW)
        log("If you want to re-release, delete the tag first:", Colors.YELLOW)
        log(f"  git tag -d {tag_name}", Colors.YELLOW)
        log(f"  git push github :refs/tags/{tag_name}", Colors.YELLOW)
        return

    # 4. Check if there are uncommitted changes
    status = exec_command("git status --porcelain")
    if status:
        print()
        log("WARNING: There are uncommitted changes.", Colors.YELLOW)
        log("Please commit or stash changes before release.", Colors.YELLOW)
        sys.exit(1)

    # 5. Create tag
    print()
    log(f"Creating tag {tag_name}...", Colors.CYAN)
    tag_result = exec_command(f'git tag -a {tag_name} -m "Release {tag_name}"')
    if tag_result is None:
        log("ERROR: Failed to create tag", Colors.RED)
        sys.exit(1)
    log(f"Tag {tag_name} created successfully", Colors.GREEN)

    # 6. Push tag to GitHub
    print()
    log(f"Pushing tag {tag_name} to GitHub...", Colors.CYAN)
    push_result = exec_command(f"git push github {tag_name}")
    if push_result is None:
        log("ERROR: Failed to push tag", Colors.RED)
        log("You may need to push manually:", Colors.YELLOW)
        log(f"  git push github {tag_name}", Colors.YELLOW)
        sys.exit(1)

    print()
    log(f"✅ Release {tag_name} initiated successfully!", Colors.GREEN)
    log("GitHub Actions will now build and publish the release.", Colors.CYAN)
    log("Check progress at: https://github.com/cheezmil/agent-enhance-kit/actions", Colors.CYAN)

if __name__ == "__main__":
    main()
