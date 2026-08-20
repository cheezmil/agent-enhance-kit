#!/usr/bin/env python3
"""Sync versions from package.json to Go source files."""

import json
import re
import sys
from pathlib import Path


def sync_go_version(pkg_dir: Path, version: str) -> bool:
    """Update version in Go main.go file."""
    # Try common locations
    candidates = [
        pkg_dir / "cmd" / "aek" / "main.go",
        pkg_dir / "cmd" / "aek" / "root.go",
        pkg_dir / "cmd" / "main" / "main.go",
        pkg_dir / "src" / "cmd" / "aek-task-manager" / "main.go",
        pkg_dir / "src" / "cmd" / "main" / "main.go",
    ]
    
    for main_go in candidates:
        if not main_go.exists():
            continue
        
        content = main_go.read_text()
        
        # Pattern 1: const Version = "..."
        new_content, n = re.subn(
            r'const\s+Version\s*=\s*"[^"]+"',
            f'const Version = "{version}"',
            content
        )
        
        # Pattern 2: var version = "..."
        if n == 0:
            new_content, n = re.subn(
                r'var\s+version\s*=\s*"[^"]+"',
                f'var version = "{version}"',
                content
            )
        
        # Pattern 3: version = "..." (exclude comments)
        if n == 0:
            lines = content.split('\n')
            for i, line in enumerate(lines):
                stripped = line.strip()
                # Skip comment lines
                if stripped.startswith('//'):
                    continue
                if re.match(r'version\s*=\s*"[^"]+"', stripped):
                    lines[i] = re.sub(
                        r'(version\s*=\s*)"[^"]+"',
                        rf'\g<1>"{version}"',
                        line
                    )
                    n += 1
            if n > 0:
                content = '\n'.join(lines)
        
        if n > 0:
            main_go.write_text(new_content)
            print(f"  ✓ Updated {main_go.relative_to(pkg_dir)}")
            return True
    
    return False


def sync_plugin_yaml(pkg_dir: Path, version: str) -> bool:
    """Update version in Hermes plugin.yaml."""
    plugin_yaml = pkg_dir / "src" / "various_agents" / "hermes" / "plugin.yaml"
    if not plugin_yaml.exists():
        return False
    
    content = plugin_yaml.read_text()
    new_content, n = re.subn(
        r'^(version:\s*)\S+',
        rf'\g<1>{version}',
        content,
        flags=re.MULTILINE
    )
    
    if n > 0:
        plugin_yaml.write_text(new_content)
        print(f"  ✓ Updated {plugin_yaml.relative_to(pkg_dir)}")
        return True
    
    return False


def main():
    print("Syncing versions from package.json to native manifests...\n")
    
    packages_dir = Path("packages")
    updated = 0
    
    for pkg_dir in sorted(packages_dir.iterdir()):
        if not pkg_dir.is_dir():
            continue
        # Skip node_modules
        if "node_modules" in pkg_dir.parts:
            continue
        pkg_json = pkg_dir / "package.json"
        if not pkg_json.exists():
            continue
        
        try:
            data = json.loads(pkg_json.read_text())
        except json.JSONDecodeError as e:
            print(f"  ✗ Failed to parse {pkg_json}: {e}")
            continue
        
        version = data.get("version")
        if not version or version in ("dev", "0.0.0-dev"):
            continue
        
        # Skip private packages
        if data.get("private", False):
            continue
        
        name = data.get("name", pkg_dir.name)
        print(f"{name} @ {version}")
        
        # Detect and sync based on language
        has_go = (pkg_dir / "go.mod").exists()
        has_plugin = (pkg_dir / "src" / "various_agents" / "hermes" / "plugin.yaml").exists()
        
        if has_go:
            sync_go_version(pkg_dir, version)
        
        if has_plugin:
            sync_plugin_yaml(pkg_dir, version)
        
        updated += 1
        print()
    
    print(f"Synced {updated} package(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
