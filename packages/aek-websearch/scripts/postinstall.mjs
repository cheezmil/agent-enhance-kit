#!/usr/bin/env node

/**
 * postinstall script for aek npm package
 * Downloads the correct platform binary from GitHub Releases
 */

import { existsSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platform, arch } from 'node:process';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import https from 'node:https';
import { createWriteStream } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgDir = join(__dirname, '..');

function getPlatformKey() {
  const os = platform === 'win32' ? 'windows' : platform === 'darwin' ? 'darwin' : 'linux';
  const cpu = arch === 'arm64' ? 'arm64' : 'amd64';
  return `${os}-${cpu}`;
}

async function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(destPath);
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Follow redirects
        https.get(res.headers.location, (redirectRes) => {
          redirectRes.pipe(file);
          file.on('finish', () => {
            file.close();
            resolve();
          });
        }).on('error', reject);
      } else {
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      }
    }).on('error', reject);
  });
}

async function main() {
  try {
    // Read version from package.json
    const pkgJson = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
    const version = pkgJson.version;
    
    if (!version || version === '0.0.0' || version === 'dev') {
      console.error('[aek] No version found in package.json, skipping binary download');
      return;
    }
    
    const platformKey = getPlatformKey();
    const ext = platform === 'win32' ? '.exe' : '';
    const binName = `aek${ext}`;
    const archiveName = `aek-${platformKey}${ext === '.exe' ? '.zip' : '.tar.gz'}`;
    
    // GitHub Release URL
    const releaseUrl = `https://github.com/cheezmil/agent-enhance-kit/releases/download/aek-websearch@v${version}/${archiveName}`;
    const binDir = join(pkgDir, 'bin');
    const destBin = join(binDir, binName);
    
    // Check if binary already exists
    if (existsSync(destBin)) {
      console.log(`[aek] Binary already exists: ${destBin}`);
      return;
    }
    
    // Create bin directory
    mkdirSync(binDir, { recursive: true });
    
    console.log(`[aek] Downloading ${binName} from ${releaseUrl}...`);
    
    // Download the archive
    const archivePath = join(binDir, archiveName);
    await downloadFile(releaseUrl, archivePath);
    
    // Extract the binary
    if (platform === 'win32') {
      // Windows: extract from zip
      execSync(`tar -xf "${archivePath}" -C "${binDir}"`);
    } else {
      // Linux/macOS: extract from tar.gz
      execSync(`tar -xzf "${archivePath}" -C "${binDir}"`);
    }
    
    // Clean up archive
    if (existsSync(archivePath)) {
      execSync(`rm "${archivePath}"`);
    }
    
    // Set executable permissions
    if (platform !== 'win32') {
      chmodSync(destBin, 0o755);
    }
    
    console.log(`[aek] Installed aek (${platformKey}) to ${destBin}`);
    
  } catch (error) {
    console.error('[aek] Failed to install binary:', error.message);
    // Don't fail the install, just log the error
    process.exit(0);
  }
}

main();
