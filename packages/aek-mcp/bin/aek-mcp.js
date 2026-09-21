#!/usr/bin/env node
// aek-mcp — JS 启动器
// 运行时定位本机平台二进制：bin/<linux|macos|win>/<binary>
//
// 布局（每个 Go 包各自一份，不再依赖 npm 平台子包）：
//   packages/aek-mcp/bin/linux/aek-mcp
//   packages/aek-mcp/bin/macos/aek-mcp
//   packages/aek-mcp/bin/win/aek-mcp.exe
//
// 不依赖任何 install 脚本：安装时零脚本，运行时才解析路径。

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(path.resolve(fileURLToPath(import.meta.url)));

// 平台目录名固定为 linux / macos / win（跨 OS 命名统一，不含架构）
const PLAT_DIR = { linux: 'linux', darwin: 'macos', win32: 'win' }[process.platform] ?? 'linux';
const BIN_NAME = 'aek-mcp';
const BIN_FILE = process.platform === 'win32' ? `${BIN_NAME}.exe` : BIN_NAME;

const candidates = [
  path.join(__dirname, PLAT_DIR, BIN_FILE),
  path.join(__dirname, BIN_FILE),
];

const bin = candidates.find(existsSync);
if (!bin) {
  console.error(
    `[aek-mcp] 未找到可执行二进制（本机 ${process.platform}-${process.arch}，查找 ${PLAT_DIR}/）。\n` +
      `安装/构建方式：python3 scripts/build_deploy.py --target-platform linux aek-mcp`
  );
  process.exit(1);
}

const result = spawnSync(bin, process.argv.slice(2), { stdio: 'inherit' });
process.exitCode = result.status ?? result.signal ?? 1;
