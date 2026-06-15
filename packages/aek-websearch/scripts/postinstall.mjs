#!/usr/bin/env node

import { existsSync, mkdirSync, copyFileSync, chmodSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platform, arch } from 'node:process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgDir = join(__dirname, '..');

function getPlatformKey() {
  const os = platform === 'win32' ? 'win32' : platform === 'darwin' ? 'darwin' : 'linux';
  const cpu = arch === 'arm64' ? 'arm64' : 'x64';
  return `${os}-${cpu}`;
}

const platformKey = getPlatformKey();
const ext = platform === 'win32' ? '.exe' : '';
const srcBin = join(pkgDir, 'platforms', platformKey, `aek${ext}`);
const binDir = join(pkgDir, 'bin');
const destBin = join(binDir, `aek${ext}`);

if (!existsSync(srcBin)) {
  console.error(`[aek] Unsupported platform: ${platformKey}`);
  console.error(`[aek] Supported: linux-x64, darwin-x64, darwin-arm64, win32-x64`);
  process.exit(1);
}

mkdirSync(binDir, { recursive: true });

// Remove old binary if exists
if (existsSync(destBin)) {
  rmSync(destBin);
}

copyFileSync(srcBin, destBin);
if (platform !== 'win32') {
  chmodSync(destBin, 0o755);
}

console.log(`[aek] Installed aek (${platformKey}) to ${destBin}`);
