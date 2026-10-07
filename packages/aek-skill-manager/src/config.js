// 配置读写（~/.aek/skill-manager/settings.yml）
// 支持 YAML，更新时尽量保留原有注释

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseDocument, stringify as stringifyYaml } from 'yaml';

import { CENTER_REPO_NAME } from './skills.js';

const CONFIG_FILE_NAME = 'settings.yml';

export const DEFAULT_CONFIG = {
  // WSL ↔ Windows 中心仓库双向同步开关（仅在 WSL/Windows 环境下生效，macOS/Linux 原生无此功能）
  transferSyncBeforeGen: true,
  transferBackupKeep: 3,
  wslDistro: null, // Windows 侧缓存探测到的 WSL 发行版名，失效自动清理
  // 默认生成的工具列表（不带 --tools 时生效），默认为空则生成全部
  // 示例：只生成 hermes 和 deepseek-harness，取消下面注释并填写
  // genDefaultTools: ['hermes', 'deepseek-harness'],
  genDefaultTools: [],
};

// 已改名的旧配置键。只提示改名，不做值迁移：旧键的取值会被忽略。
const RENAMED_CONFIG_KEYS = {
  transferSyncBeforeSync: 'transferSyncBeforeGen',
  syncDefaultTools: 'genDefaultTools',
};

export function getConfigPath(options = {}) {
  const { home = os.homedir() } = options;
  return path.join(home, '.aek', CENTER_REPO_NAME, CONFIG_FILE_NAME);
}

// 解析 YML：非对象或解析失败时返回 {}
export function parseConfigText(text) {
  try {
    const value = parseDocument(text, { logLevel: 'silent' }).toJS();
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

// 序列化：若提供了 rawTemplate，则在原文件基础上做字段级更新，尽量保留注释
export function stringifyConfig(obj, rawTemplate = '') {
  if (rawTemplate) {
    const doc = parseDocument(rawTemplate, { logLevel: 'silent' });
    for (const [key, value] of Object.entries(obj)) {
      doc.set(key, value);
    }
    return doc.toString();
  }
  return stringifyYaml(obj, { lineWidth: 0 });
}

export async function loadConfig(options = {}) {
  const filePath = getConfigPath(options);
  try {
    const raw = await readFile(filePath, 'utf-8');
    const parsed = parseConfigText(raw);
    warnRenamedKeys(parsed, filePath);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    // 文件不存在时自动生成默认配置
    await ensureConfigFile(filePath);
    return { ...DEFAULT_CONFIG };
  }
}

const warnedRenamedKeys = new Set();

function warnRenamedKeys(parsed, filePath) {
  for (const [oldKey, newKey] of Object.entries(RENAMED_CONFIG_KEYS)) {
    if (!(oldKey in parsed) || warnedRenamedKeys.has(oldKey)) continue;
    warnedRenamedKeys.add(oldKey);
    console.log(`[aek sm] 配置键已改名: ${oldKey} → ${newKey}（${filePath}），旧键的取值已被忽略。`);
  }
}

// 从模板生成默认配置文件
async function ensureConfigFile(filePath) {
  const templatePath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '..', 'templates', 'settings.yml',
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
  const config = { ...parseConfigText(raw), ...patch };
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, stringifyConfig(config, raw), 'utf-8');
  return { ...DEFAULT_CONFIG, ...config };
}
