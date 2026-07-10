#!/usr/bin/env node

/**
 * Release script for agent-enhance-kit
 * 
 * This script:
 * 1. Reads version from packages/aek-websearch/VERSION
 * 2. Checks if tag already exists
 * 3. Creates git tag
 * 4. Pushes tag to GitHub
 * 
 * Used as a "finally" script in cqg acp configuration.
 * Config path: .cheezmil_quick_git/config/which_script_run_when_quick_add_commit_push_execute_finally.txt
 */

import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Paths
const ROOT_DIR = join(__dirname, '..');
const VERSION_FILE = join(ROOT_DIR, 'packages', 'aek-websearch', 'VERSION');

// Colors
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
    console.log(`${colors[color] || colors.reset}${message}${colors.reset}`);
}

function execCommand(command, options = {}) {
    try {
        return execSync(command, {
            cwd: ROOT_DIR,
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
            ...options,
        }).trim();
    } catch (error) {
        return null;
    }
}

function main() {
    log('\n=== Agent Enhance Kit Release ===\n', 'cyan');

    // 1. Check if VERSION file exists
    if (!existsSync(VERSION_FILE)) {
        log(`ERROR: VERSION file not found at ${VERSION_FILE}`, 'red');
        process.exit(1);
    }

    // 2. Read version
    const version = readFileSync(VERSION_FILE, 'utf-8').trim();
    if (!version) {
        log('ERROR: VERSION file is empty', 'red');
        process.exit(1);
    }

    const tagName = `v${version}`;
    log(`Version: ${version}`, 'green');
    log(`Tag: ${tagName}`, 'green');

    // 3. Check if tag already exists
    const existingTag = execCommand(`git tag -l "${tagName}"`);
    if (existingTag === tagName) {
        log(`\nTag ${tagName} already exists. Skipping release.`, 'yellow');
        log('If you want to re-release, delete the tag first:', 'yellow');
        log(`  git tag -d ${tagName}`, 'yellow');
        log(`  git push origin :refs/tags/${tagName}`, 'yellow');
        return;
    }

    // 4. Check if there are uncommitted changes
    const status = execCommand('git status --porcelain');
    if (status) {
        log('\nWARNING: There are uncommitted changes.', 'yellow');
        log('Please commit or stash changes before release.', 'yellow');
        process.exit(1);
    }

    // 5. Create tag
    log(`\nCreating tag ${tagName}...`, 'cyan');
    const tagResult = execCommand(`git tag -a ${tagName} -m "Release ${tagName}"`);
    if (tagResult === null) {
        log('ERROR: Failed to create tag', 'red');
        process.exit(1);
    }
    log(`Tag ${tagName} created successfully`, 'green');

    // 6. Push tag to GitHub
    log(`\nPushing tag ${tagName} to GitHub...`, 'cyan');
    const pushResult = execCommand(`git push origin ${tagName}`);
    if (pushResult === null) {
        log('ERROR: Failed to push tag', 'red');
        log('You may need to push manually:', 'yellow');
        log(`  git push origin ${tagName}`, 'yellow');
        process.exit(1);
    }

    log(`\n✅ Release ${tagName} initiated successfully!`, 'green');
    log('GitHub Actions will now build and publish the release.', 'cyan');
    log(`Check progress at: https://github.com/cheezmil/agent-enhance-kit/actions`, 'cyan');
}

main();
