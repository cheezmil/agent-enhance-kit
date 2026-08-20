#!/usr/bin/env python3

import json
import sys
import subprocess
from pathlib import Path

# Paths
SCRIPT_DIR = Path(__file__).parent
ROOT_DIR = SCRIPT_DIR.parent.parent  # up to scripts, then to root
PACKAGE_JSON = ROOT_DIR / "package.json"
PACKAGES_DIR = ROOT_DIR / "packages"

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

def get_versions():
    """Read versions from each package's package.json."""
    packages_dir = ROOT_DIR / "packages"
    versions = {}
    
    for pkg_dir in sorted(packages_dir.iterdir()):
        if not pkg_dir.is_dir():
            continue
        pkg_json = pkg_dir / "package.json"
        if not pkg_json.exists():
            continue
        
        try:
            data = json.loads(pkg_json.read_text())
            if data.get("private"):
                continue
            version = data.get("version")
            if version:
                versions[data["name"]] = version
        except json.JSONDecodeError:
            continue
    
    return versions

def main():
    print()
    log("=== Agent Enhance Kit Release ===", Colors.CYAN)
    print()

    # 1. Get versions from package.json files
    versions = get_versions()
    if not versions:
        log("ERROR: No public package versions found", Colors.RED)
        sys.exit(1)

    for name, version in versions.items():
        log(f"  {name}: v{version}", Colors.GREEN)

    # 3. Check if there are uncommitted changes
    status = exec_command("git status --porcelain")
    if status:
        print()
        log("WARNING: There are uncommitted changes.", Colors.YELLOW)
        log("Please commit or stash changes before release.", Colors.YELLOW)
        log("Run: pnpm changeset && git add . && git commit && git push", Colors.YELLOW)
        sys.exit(1)

    # 4. Check if changesets are pending
    changeset_result = subprocess.run(
        ["pnpm", "changeset", "status"],
        cwd=ROOT_DIR,
        capture_output=True,
        text=True
    )
    has_changesets = changeset_result.returncode == 0 and "Packages to be bumped" in changeset_result.stdout
    if not has_changesets:
        print()
        log("No unreleased changesets found.", Colors.YELLOW)
        log("Run: pnpm changeset && git add . && git commit", Colors.YELLOW)
        sys.exit(1)

    # 5. Create tags for each package using their own versions
    log("Creating tags...", Colors.CYAN)
    
    tags_created = []
    
    for pkg_name, pkg_version in versions.items():
        tag_name = f"{pkg_name}@v{pkg_version}"
        existing_tag = exec_command(f'git tag -l "{tag_name}"')
        if existing_tag == tag_name:
            log(f"  Tag {tag_name} already exists. Skipping.", Colors.YELLOW)
            continue
        
        tag_result = exec_command(f'git tag -a {tag_name} -m "Release {tag_name}"')
        if tag_result is None:
            log(f"  ERROR: Failed to create tag {tag_name}", Colors.RED)
            continue
        
        log(f"  Tag {tag_name} created", Colors.GREEN)
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
    log("Release initiated!", Colors.GREEN)
    log("Tags created:", Colors.CYAN)
    for tag in tags_created:
        log(f"  {tag}", Colors.CYAN)

if __name__ == "__main__":
    main()
