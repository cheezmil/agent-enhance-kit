// record.jsonc 读写 — 记录中心仓库已知的 skill 列表和工具同步状态
//
// 格式（JSONC，注释友好）：
// {
//   // 自动生成的记录，不要手动编辑。运行 "aek sm sync" 后自动更新。
//   "version": 1,
//   // 中心仓库当前已知的所有 skill 名称
//   "skills": ["browser-harness", "superpowers", ...],
//   // 各工具最后成功同步时间戳（毫秒）
//   "synced": {
//     "claude": 1700000000000,
//     "opencode": 1700000000000
//   }
// }

import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const RECORD_FILE_NAME = 'record.jsonc';
const STALE_MS = 3_600_000; // 1 小时过期

/** 返回 record.jsonc 的绝对路径 */
export function getRecordPath(home = os.homedir()) {
  return path.join(home, '.aek', 'skill-manager', RECORD_FILE_NAME);
}

/** 读取 record.jsonc，不存在返回 null */
export async function readRecord(home = os.homedir()) {
  const filePath = getRecordPath(home);
  if (!existsSync(filePath)) return null;
  try {
    const text = await readFile(filePath, 'utf-8');
    // 简单解析：去掉注释后 parse JSON
    const stripped = text
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
      .replace(/,\s*([}\]])/g, '$1');
    return JSON.parse(stripped);
  } catch {
    return null;
  }
}

/** 判断 record 是否已过期（未过期返回 true） */
export async function isRecordFresh(record) {
  if (!record) return false;
  const now = Date.now();
  if (record.mtime && now - record.mtime < STALE_MS) return true;
  try {
    const s = await stat(getRecordPath());
    return now - s.mtimeMs < STALE_MS;
  } catch {
    return false;
  }
}

/**
 * 从已知 skill 名称列表重建 record
 * @param {string[]} skillNames - 中心仓库已知的 skill 名称
 * @param {object} synced - 各工具的同步时间戳
 */
export function buildRecord(skillNames, synced = {}) {
  return {
    version: 1,
    mtime: Date.now(),
    skills: [...skillNames].sort(),
    synced,
  };
}

/**
 * 写出 record.jsonc，完全重写（不保留注释）
 */
export async function writeRecord(home = os.homedir(), record) {
  const filePath = getRecordPath(home);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(record, null, 2) + '\n');
}
