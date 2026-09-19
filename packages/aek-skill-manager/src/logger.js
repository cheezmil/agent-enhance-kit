// 日志记录工具
import { appendFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const LOG_FILE = 'log.txt';

export async function log(level, ...args) {
  const timestamp = new Date().toISOString();
  const message = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
  const line = `[${timestamp}] [${level}] ${message}\n`;

  try {
    const logDir = path.join(os.homedir(), '.aek', 'skill-manager');
    const logPath = path.join(logDir, LOG_FILE);
    await mkdir(logDir, { recursive: true });
    await appendFile(logPath, line);
  } catch (e) {
    // 日志失败不影响主流程
    console.error(`[aek sm] 日志写入失败: ${e.message}`);
  }
}

// 便捷方法
export const info = (...args) => log('INFO', ...args);
export const warn = (...args) => log('WARN', ...args);
export const error = (...args) => log('ERROR', ...args);
