#!/usr/bin/env python3

import json
import sys
import subprocess
from pathlib import Path

# Paths
SCRIPT_DIR = Path(__file__).parent
ROOT_DIR = SCRIPT_DIR.parent.parent  # up to scripts, then to root
VERSION_FILE = ROOT_DIR / "VERSION"
PACKAGE_JSON = ROOT_DIR / "package.json"

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

def get_version():
    """Read version from root package.json."""
    if not PACKAGE_JSON.exists():
        return None
    
    try:
        data = json.loads(PACKAGE_JSON.read_text())
        return data.get("version")
    except json.JSONDecodeError:
        return None

def main():
    print()
    log("=== Agent Enhance Kit Release ===", Colors.CYAN)
    print()

    # 1. Get version from package.json
    version = get_version()
    if not version:
        log("ERROR: Version not found in package.json", Colors.RED)
        sys.exit(1)

    log(f"Version: {version}", Colors.GREEN)

    # 3. Check if there are uncommitted changes
    status = exec_command("git status --porcelain")
    if status:
        print()
        log("WARNING: There are uncommitted changes.", Colors.YELLOW)
        log("Please commit or stash changes before release.", Colors.YELLOW)
        log("Run: pnpm changeset && git add . && git commit && git push", Colors.YELLOW)
        sys.exit(1)

    # 4. Check if changesets are pending
    changeset_status = exec_command("pnpm changeset status")
    if "No unreleased changesets found" not in (changeset_status or ""):
        print()
        log("There are pending changesets. Please run 'pnpm changeset' first.", Colors.YELLOW)
        sys.exit(1)

    # 5. Create tags for each package
    log(f"Creating tags for v{version}...", Colors.CYAN)
    
    packages = ["aek-websearch", "aek-task-manager"]
    tags_created = []
    
    for pkg in packages:
        tag_name = f"{pkg}@v{version}"
        existing_tag = exec_command(f'git tag -l "{tag_name}"')
        if existing_tag == tag_name:
            log(f"Tag {tag_name} already exists. Skipping.", Colors.YELLOW)
            continue
        
        tag_result = exec_command(f'git tag -a {tag_name} -m "Release {tag_name}"')
        if tag_result is None:
            log(f"ERROR: Failed to create tag {tag_name}", Colors.RED)
            continue
        
        log(f"Tag {tag_name} created", Colors.GREEN)
        tags_created.append(tag_name)

    if not tags_created:
        log("No new tags to create.", Colors.YELLOW)
        return

    # 6. Push tags
    print()
    log("Pushing tags to GitHub...", Colors.CYAN)
    push_result = exec_command("git push github --tags")
    if push_result is None:
        log("ERROR: Failed to push tags", Colors.RED)
        log("You may need to push manually:", Colors.YELLOW)
        for tag in tags_created:
            log(f"  git push github {tag}", Colors.YELLOW)
        sys.exit(1)

    # 7. Trigger GitHub Actions for npm publish
    print()
    log(f"✅ Release v{version} initiated!", Colors.GREEN)
    log("GitHub Actions will now build and publish to npm.", Colors.CYAN)
    log("Check progress at: https://github.com/cheezmil/agent-enhance-kit/actions", Colors.CYAN)

if __name__ == "__main__":
    main()
