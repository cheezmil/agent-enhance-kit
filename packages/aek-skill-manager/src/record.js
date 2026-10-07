// record.yml 读写 — 记录中心仓库已知的 skill 列表和工具同步状态
//
// 格式（YML，机器生成、不手写）：
// version: 1
// mtime: 1700000000000        # 上次「真正生成过」的时间戳（毫秒）
// skills:                    # 中心仓库当前已知的所有 skill 名称
//   - browser-harness
//   - superpowers
// synced:                    # 各工具最后成功同步时间戳（毫秒）
//   claude: 1700000000000
//   opencode: 1700000000000

import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

const RECORD_FILE_NAME = 'record.yml';
const STALE_MS = 3_600_000; // 1 小时过期

/** 返回 record.yml 的绝对路径 */
export function getRecordPath(home = os.homedir()) {
  return path.join(home, '.aek', 'skill-manager', RECORD_FILE_NAME);
}

/** 读取 record.yml，不存在返回 null */
export async function readRecord(home = os.homedir()) {
  const filePath = getRecordPath(home);
  if (!existsSync(filePath)) return null;
  try {
    const text = await readFile(filePath, 'utf-8');
    const parsed = parseYaml(text);
    return parsed && typeof parsed === 'object' ? parsed : null;
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
 * 写出 record.yml，完全重写
 */
export async function writeRecord(home = os.homedir(), record) {
  const filePath = getRecordPath(home);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, stringifyYaml(record, { lineWidth: 0 }));
}

/**
 * 使工具的 synced 记录失效，让下一次 gen 立即重新生成这些工具。
 * remove 之后必须调用，否则缓存窗口内 gen 会把这些工具全部跳过。
 * @param {string[]|null} platformIds - 要失效的工具 id；null 或空数组表示全部失效
 */
export async function invalidateSynced(platformIds = null, home = os.homedir()) {
  const record = await readRecord(home);
  if (!record) return null;

  record.synced = record.synced || {};
  if (platformIds && platformIds.length > 0) {
    for (const id of platformIds) {
      delete record.synced[id];
      delete record.synced[`${id}-win`];
    }
  } else {
    record.synced = {};
  }

  await writeRecord(home, record);
  return record;
}
