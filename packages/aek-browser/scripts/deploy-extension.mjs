#!/usr/bin/env node
/**
 * deploy-extension.mjs — 将 AEK Browser Chrome 扩展部署到目标目录
 *
 * 用法:
 *   node scripts/deploy-extension.mjs [target-dir]
 *
 * 默认 target-dir（按平台）:
 *   Windows: %USERPROFILE%\.aek\browser\bin\chrome-extension
 *   WSL (给 Windows Chrome 部署): /mnt/c/Users/$USER/.aek/browser/bin/chrome-extension
 *   macOS: ~/Library/Application Support/Google/Chrome/Default/Extensions/<ext-id>/
 *
 * 环境变量覆盖:
 *   AEK_EXT_TARGET=<path>  直接指定目标目录
 */

import { cp, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(__dirname, '..');

// 解析目标目录
const cliArg = process.argv[2];
let target;
if (cliArg) {
  target = resolve(cliArg);
} else if (process.env.AEK_EXT_TARGET) {
  target = resolve(process.env.AEK_EXT_TARGET);
} else if (process.platform === 'win32') {
  target = join(process.env.USERPROFILE || process.env.HOME || '', '.aek', 'browser', 'bin', 'chrome-extension');
} else if (process.platform === 'linux') {
  const user = (process.env.USER || 'xdx').toLowerCase();
  target = `/mnt/c/Users/${user}/.aek/browser/bin/chrome-extension`;
} else {
  target = join(process.env.HOME || '', '.aek', 'browser', 'bin', 'chrome-extension');
}

console.log(`Deploying AEK Browser extension → ${target}`);

// 源文件路径
const extDir = join(pkgRoot, 'extension');
const distSrc = join(extDir, 'dist');
const iconsSrc = join(extDir, 'icons');

// 确保目标目录存在
await mkdir(target, { recursive: true });

// 读取并写入文件（避免 cp EPERM，使用 readFile + writeFile）
async function deployFile(src, dst) {
  const content = await readFile(src);
  await writeFile(dst, content);
  console.log(`  copied ${dst.split('/').pop()}`);
}

// 复制根文件
await deployFile(join(extDir, 'manifest.json'), join(target, 'manifest.json'));
await deployFile(join(extDir, 'popup.html'), join(target, 'popup.html'));
await deployFile(join(extDir, 'popup.js'), join(target, 'popup.js'));

// 创建 dist/ 并复制 background.js
await mkdir(join(target, 'dist'), { recursive: true });
await deployFile(join(distSrc, 'background.js'), join(target, 'dist', 'background.js'));

// 复制 icons
const iconsDst = join(target, 'icons');
await mkdir(iconsDst, { recursive: true });
const iconFiles = await readdir(iconsSrc);
for (const f of iconFiles) {
  await deployFile(join(iconsSrc, f), join(iconsDst, f));
}
console.log(`  copied icons/ (${iconFiles.length} files)`);

// 清理根目录的 background.js（应在 dist/ 下）
const bgPath = join(target, 'background.js');
const bgStat = await stat(bgPath).catch(() => null);
if (bgStat?.isFile()) {
  await writeFile(bgPath, ''); // 清空
}

// 验证清单
const manifestPath = join(target, 'manifest.json');
try {
  await readFile(manifestPath, 'utf-8');
} catch {
  console.error('ERROR: manifest.json not found at', target);
  process.exit(1);
}

console.log('');
console.log('Done. Load in Chrome/Edge:');
console.log('  1. 打开 chrome://extensions（或 edge://extensions）');
console.log('  2. 开启「开发者模式」');
console.log('  3. 点击「加载已解压的扩展程序」');
console.log('  4. 选择目录: ' + target);
