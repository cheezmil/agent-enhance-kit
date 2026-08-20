#!/usr/bin/env python3

import json
import sys
import subprocess
from pathlib import Path

# Paths
SCRIPT_DIR = Path(__file__).parent
ROOT_DIR = SCRIPT_DIR.parent.parent  # up to scripts, then to root
PACKAGES_DIR = ROOT_DIR / "packages"


class Colors:
    RESET = '\033[0m'
    RED = '\033[31m'
    GREEN = '\033[32m'
    YELLOW = '\033[33m'
    CYAN = '\033[36m'


def log(message, color=Colors.RESET):
    print(f"{color}{message}{Colors.RESET}")


def exec_command(command, cwd=None, check=False):
    """Execute a shell command and return stdout."""
    cwd = cwd or ROOT_DIR
    try:
        result = subprocess.run(
            command,
            cwd=cwd,
            shell=True,
            capture_output=True,
            text=True,
            check=check
        )
        return result.stdout.strip()
    except subprocess.CalledProcessError:
        return None


def get_github_token():
    """Read GitHub token from git extraheader."""
    header = exec_command("git config --get http.https://github.com/.extraheader")
    if not header:
        return None
    import base64
    try:
        auth = base64.b64decode(header.split(": ", 1)[1][6:]).decode()
        return auth.split(":", 1)[1] if ":" in auth else auth
    except (IndexError, ValueError):
        return None


def get_versions():
    """Read versions from each package's package.json."""
    versions = {}

    for pkg_dir in sorted(PACKAGES_DIR.iterdir()):
        if not pkg_dir.is_dir():
            continue
        pkg_json = pkg_dir / "package.json"
        if not pkg_json.exists():
            continue

        try:
            data = json.loads(pkg_json.read_text())
            version = data.get("version")
            if version:
                versions[data["name"]] = {
                    "version": version,
                    "private": data.get("private", False),
                }
        except json.JSONDecodeError:
            continue

    return versions


def curl_json(method, url, token, data=None):
    """Make an authenticated GitHub API request."""
    cmd = ["curl", "-s", "--max-time", "10"]
    cmd += ["-H", f"Authorization: token {token}"]
    cmd += ["-H", "Accept: application/vnd.github.v3+json"]
    cmd += ["-H", "Content-Type: application/json"]
    if data is not None:
        cmd += ["-X", method, "-d", json.dumps(data)]
    else:
        cmd += ["-X", method]
    cmd.append(url)

    result = subprocess.run(cmd, capture_output=True, text=True)
    return json.loads(result.stdout) if result.stdout else {}


def create_github_release(token, tag_name, name, body):
    """Create a public (non-draft) GitHub Release."""
    url = f"https://api.github.com/repos/cheezmil/agent-enhance-kit/releases"
    data = {
        "tag_name": tag_name,
        "name": name,
        "body": body,
        "draft": False,
        "prerelease": False,
    }
    result = curl_json("POST", url, token, data)
    if "id" in result:
        return True, result["id"]
    return False, result.get("message", "unknown error")


def main():
    print()
    log("=== Agent Enhance Kit Release ===", Colors.CYAN)
    print()

    # 1. Get versions from package.json files
    versions = get_versions()
    if not versions:
        log("ERROR: No package versions found", Colors.RED)
        sys.exit(1)

    for name, info in versions.items():
        private_str = " [private]" if info["private"] else ""
        log(f"  {name}: v{info['version']}{private_str}", Colors.GREEN)

    # 2. Check if there are uncommitted changes
    status = exec_command("git status --porcelain")
    if status:
        print()
        log("WARNING: There are uncommitted changes.", Colors.YELLOW)
        log("Please commit or stash changes before release.", Colors.YELLOW)
        log("Run: pnpm changeset && git add . && git commit && git push", Colors.YELLOW)
        sys.exit(1)

    # 3. Check if changesets are pending
    changeset_result = subprocess.run(
        ["pnpm", "changeset", "status"],
        cwd=ROOT_DIR,
        capture_output=True,
        text=True,
    )
    has_changesets = (
        changeset_result.returncode == 0
        and "Packages to be bumped" in changeset_result.stdout
    )
    if not has_changesets:
        print()
        log("No unreleased changesets found.", Colors.YELLOW)
        log("Run: pnpm changeset && git add . && git commit", Colors.YELLOW)
        sys.exit(1)

    # 4. Create tags for each package
    log("Creating tags...", Colors.CYAN)

    tags_created = []

    for pkg_name, info in versions.items():
        pkg_version = info["version"]
        tag_name = f"{pkg_name}@v{pkg_version}"
        existing_tag = exec_command(f'git tag -l "{tag_name}"')
        if existing_tag == tag_name:
            log(f"  Tag {tag_name} already exists. Skipping.", Colors.YELLOW)
            continue

        tag_result = exec_command(
            f'git tag -a {tag_name} -m "Release {tag_name}"'
        )
        if tag_result is None:
            log(f"  ERROR: Failed to create tag {tag_name}", Colors.RED)
            continue

        log(f"  Tag {tag_name} created", Colors.GREEN)
        tags_created.append(tag_name)

    if not tags_created:
        log("No new tags to create.", Colors.YELLOW)
        return

    # 5. Push tags to both remotes
    print()
    log("Pushing tags...", Colors.CYAN)
    for remote in ("github", "gitea"):
        result = exec_command(f"git push {remote} --tags")
        if result is None:
            log(f"  ERROR: Failed to push tags to {remote}", Colors.RED)
            continue
        log(f"  {remote}: tags pushed", Colors.GREEN)

    # 6. Create GitHub Releases (non-draft)
    print()
    log("Creating GitHub Releases...", Colors.CYAN)
    token = get_github_token()
    if not token:
        log("  ERROR: GitHub token not found. Skipping Releases.", Colors.RED)
        log("  Run: git config http.https://github.com/.extraheader 'Authorization: Basic <base64>'", Colors.YELLOW)
    else:
        for tag_name in tags_created:
            pkg_name = tag_name.split("@")[0]
            rel_name = f"{pkg_name} {tag_name.split('@v')[1]}"
            body = f"AEK {pkg_name} {tag_name.split('@v')[1]}"
            ok, msg = create_github_release(token, tag_name, rel_name, body)
            if ok:
                log(f"  {tag_name}: Release created (id={msg})", Colors.GREEN)
            else:
                log(f"  {tag_name}: Failed — {msg}", Colors.RED)

    # 7. Done
    print()
    log("Release complete!", Colors.GREEN)
    log("Tags and releases created:", Colors.CYAN)
    for tag in tags_created:
        log(f"  {tag}", Colors.CYAN)


if __name__ == "__main__":
    main()
