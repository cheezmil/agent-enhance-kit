const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

if (!fs.existsSync(path.join(process.cwd(), 'src'))) {
  process.exit(0);
}

// If dist/src/main.js already exists (built on another platform like WSL),
// try to regenerate the manifest using tsx (only if available).
const distMain = path.join(process.cwd(), 'dist', 'src', 'main.js');
if (fs.existsSync(distMain)) {
  const tsxScript = path.join(process.cwd(), 'src', 'build-manifest.ts');
  const manifestResult = spawnSync('npx', ['tsx', tsxScript], {
    stdio: 'inherit',
  });
  // Non-fatal: proceed even if manifest regeneration fails
  if (manifestResult.status !== 0) {
    console.warn('[prepare] Manifest regeneration skipped (tsx unavailable)');
  }
  process.exit(0);
}

// If dist/ doesn't exist (Windows install without pre-build),
// try to run build-manifest directly (only if tsx is available).
const distExists = fs.existsSync(path.join(process.cwd(), 'dist'));
if (!distExists) {
  const tsxScript = path.join(process.cwd(), 'src', 'build-manifest.ts');
  const manifestResult = spawnSync('npx', ['tsx', tsxScript], {
    stdio: 'inherit',
  });
  // Non-fatal: package works without optimized manifest
  if (manifestResult.status !== 0) {
    console.warn('[prepare] Build manifest skipped (tsx unavailable)');
  }
  process.exit(0);
}

// Fallback: run full build if tsx not available but dist exists
const npmExecPath = process.env.npm_execpath;
const hasJsExecPath = npmExecPath && /\.(?:c|m)?js$/i.test(npmExecPath);
const command = hasJsExecPath ? process.execPath : (process.platform === 'win32' ? 'npm.cmd' : 'npm');
const args = hasJsExecPath ? [npmExecPath, 'run', 'build'] : ['run', 'build'];
const result = spawnSync(command, args, {
  stdio: 'inherit',
  shell: !hasJsExecPath && process.platform === 'win32',
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);