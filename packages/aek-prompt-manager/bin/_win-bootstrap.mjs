/**
 * _win-bootstrap.mjs — 在 Windows 上运行前初始化 NODE_PATH
 *
 * 当进程从 WSL UNC 路径（\\wsl.localhost\...）启动时，Node.js 的模块解析
 * 会从 UNC CWD 开始向上查找 node_modules，永远找不到全局 npm 目录。
 * 解决方案：主动设置 NODE_PATH 指向全局 node_modules。
 *
 * 逻辑：
 * - Windows + NODE_PATH 未设置 → 尝试通过 npm root -g 获取全局路径
 * - macOS 同理（homebrew 安装路径不同）
 * - Linux / 已有 NODE_PATH → 跳过
 */
import { execSync } from 'node:child_process';
import path from 'node:path';

export function setWindowsNodePath() {
  if (process.platform !== 'win32' && process.platform !== 'darwin') return;
  if (process.env.NODE_PATH) return;
  if (process.cwd().startsWith('\\wsl.localhost')) return;

  try {
    const npmRoot = execSync('npm root -g', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
    if (npmRoot) process.env.NODE_PATH = npmRoot;
  } catch {
    // npm root -g 不可用，忽略
  }
}
