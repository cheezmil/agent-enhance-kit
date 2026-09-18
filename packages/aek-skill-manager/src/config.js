// 配置读写（~/.aek/skill-manager/settings.jsonc）
// 支持 JSONC（注释 + 尾逗号），更新时尽量保留原有注释

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CENTER_REPO_NAME } from './skills.js';

const CONFIG_FILE_NAME = 'settings.jsonc';

export const DEFAULT_CONFIG = {
  transferSyncBeforeSync: true,
  transferBackupKeep: 3,
  wslDistro: null, // Windows 侧缓存探测到的 WSL 发行版名，失效自动清理
};

export function getConfigPath(options = {}) {
  const { home = os.homedir() } = options;
  return path.join(home, '.aek', CENTER_REPO_NAME, CONFIG_FILE_NAME);
}

// 解析 JSONC：去块注释、行注释、尾逗号
export function parseJsonc(text) {
  try {
    const stripped = text
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/([^:"'])\/\/.*$/gm, '$1')
      .replace(/^\s*\/\/.*$/gm, '')
      .replace(/,(\s*[}\]])/g, '$1');
    return JSON.parse(stripped);
  } catch {
    return {};
  }
}

// 序列化：若提供了 rawTemplate，则在原文件基础上做字段级替换，尽量保留注释
export function stringifyJsonc(obj, rawTemplate = '') {
  if (rawTemplate) {
    let out = rawTemplate;
    for (const [key, value] of Object.entries(obj)) {
      const valueStr = JSON.stringify(value);
      // 匹配 "key": <任意非换行值>（含 null/字符串/数字/布尔）
      const re = new RegExp(`("${key}"\\s*:\\s*)([^,\\n}\\]]+)`, '');
      if (re.test(out)) {
        out = out.replace(re, `$1${valueStr}`);
      } else {
        // 字段不存在：在最后一个 } 前插入
        out = out.replace(/\n}(\s*)$/, `,\n  "${key}": ${valueStr}\n}$1`);
      }
    }
    return out;
  }
  return JSON.stringify(obj, null, 2) + '\n';
}

export async function loadConfig(options = {}) {
  const filePath = getConfigPath(options);
  try {
    const raw = await readFile(filePath, 'utf-8');
    const parsed = parseJsonc(raw);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    // 文件不存在时自动生成默认配置
    await ensureConfigFile(filePath);
    return { ...DEFAULT_CONFIG };
  }
}

// 从模板生成默认配置文件
async function ensureConfigFile(filePath) {
  const templatePath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '..', 'templates', 'settings.jsonc',
  );
  try {
    const template = await readFile(templatePath, 'utf-8');
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, template, 'utf-8');
  } catch {
    // 模板不存在时静默跳过
  }
}

// 在指定 home 下确保配置文件存在（用于跨系统调用：WSL 侧写 Windows 侧配置）
export async function ensureConfigFileAt(home) {
  const filePath = getConfigPath({ home });
  if (existsSync(filePath)) return;
  await ensureConfigFile(filePath);
}

export async function updateConfig(patch, options = {}) {
  const filePath = getConfigPath(options);
  let raw = '';
  try {
    raw = await readFile(filePath, 'utf-8');
  } catch {
    // 不存在则新建
  }
  const config = { ...parseJsonc(raw), ...patch };
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, stringifyJsonc(config, raw), 'utf-8');
  return { ...DEFAULT_CONFIG, ...config };
}
