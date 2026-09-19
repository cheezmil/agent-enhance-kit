// transfer-station — WSL 与 Windows 中心仓库（~/.aek/skill-manager/skills/）双向对齐
// 以最新修改的一方为准，整目录覆盖另一方；覆盖前自动备份

import { execFileSync } from 'node:child_process';
import { constants } from 'node:fs';
import { access, mkdir, readdir, rm, stat, utimes } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { isWSL, getWindowsNativeRoot } from '@cheezmil/aek-common';
import { CENTER_REPO_NAME, copySkillFolder, SYNC_EXCLUDE_DIRS } from './skills.js';
import { loadConfig, updateConfig, ensureConfigFileAt } from './config.js';

// 需要排除的目录/文件（不参与同步与 mtime 比较）
// 备份目录（skills.bak.*）与 skills 同级，不在扫描范围内；settings.jsonc 同理。
// 系统 skill 直接位于 skills/ 根目录下，由 ensureSystemSkills 重建，覆盖无所谓。
// 使用 skills.js 统一的同步排除集，避免重复维护。
const EXCLUDE_NAMES = SYNC_EXCLUDE_DIRS;

async function pathAccessible(p) {
  try {
    await access(p, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

// ---------- 路径解析 ----------

/**
 * 获取当前侧的中心仓库绝对路径
 * @param {string} [home] 覆盖 home（测试用）
 */
export function getLocalSkillsDir(home = os.homedir()) {
  return path.join(home, '.aek', CENTER_REPO_NAME, 'skills');
}

/**
 * 获取对侧中心仓库绝对路径
 * - 当前 WSL → Windows 侧：/mnt/c/Users/<user>/.aek/skill-manager/skills
 * - 当前 Windows → WSL 侧：\\wsl.localhost\<distro>\home\<user>\.aek\skill-manager\skills
 * 返回 null 表示无法确定对侧路径（如非 WSL/Windows 组合）
 */
export async function getPeerSkillsDir(options = {}) {
  const { home = os.homedir(), config = null, env = process.env } = options;

  if (isWSL()) {
    // WSL 侧：Windows 用户 profile 在 /mnt/c/Users/<user>
    // options.env 优先（测试注入），否则走 aek-common 的探测
    const winRoot = env.AEK_WIN_ROOT ?? getWindowsNativeRoot();
    if (!winRoot) return null;
    return path.join(winRoot, '.aek', CENTER_REPO_NAME, 'skills');
  }

  if (process.platform === 'win32') {
    // Windows 侧需要 WSL 发行版名 + WSL 内用户名
    const cfg = config ?? (await loadConfig({ home }));
    let distro = cfg.wslDistro;

    if (distro) {
      // 缓存的发行版可能已失效，验证一下；失效则清理缓存重新探测
      const testPath = `\\\\wsl.localhost\\${distro}\\`;
      if (!(await pathAccessible(testPath))) {
        distro = null;
        await updateConfig({ wslDistro: null }, { home });
      }
    }

    if (!distro) {
      distro = await detectWslDistro();
      if (distro) {
        await updateConfig({ wslDistro: distro }, { home });
      }
    }

    if (!distro) return null;

    // 获取 WSL 内用户名（通过 wsl.exe whoami）
    const wslUser = await getWslUsername(distro);
    if (!wslUser) return null;

    return `\\\\wsl.localhost\\${distro}\\home\\${wslUser}\\.aek\\${CENTER_REPO_NAME}\\skills`;
  }

  // macOS / Linux 原生（非 WSL）：无对侧概念
  return null;
}

// 探测第一个可用的 WSL 发行版名
async function detectWslDistro() {
  if (process.platform !== 'win32') return null;
  try {
    const out = execFileSync('wsl.exe', ['-l', '-q'], { encoding: 'utf8', timeout: 10000 });
    const lines = out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    return lines[0] ?? null;
  } catch {
    return null;
  }
}

// 通过 wsl.exe 获取指定发行版内的用户名
async function getWslUsername(distro) {
  if (process.platform !== 'win32') return null;
  try {
    const out = execFileSync('wsl.exe', ['-d', distro, '-e', 'whoami'], {
      encoding: 'utf8',
      timeout: 10000,
    });
    return out.trim() || null;
  } catch {
    return null;
  }
}

// ---------- 新鲜度判断 ----------

/**
 * 递归收集目录下所有文件及其 mtime
 * @returns {Map<string, number>} 相对路径 → mtimeMs
 */
export async function collectFileMtimes(rootDir, baseDir = rootDir, result = new Map()) {
  let entries;
  try {
    entries = await readdir(rootDir, { withFileTypes: true });
  } catch {
    return result;
  }

  for (const entry of entries) {
    if (EXCLUDE_NAMES.has(entry.name)) continue;
    const fullPath = path.join(rootDir, entry.name);
    const relPath = path.relative(baseDir, fullPath);

    if (entry.isDirectory()) {
      await collectFileMtimes(fullPath, baseDir, result);
    } else if (entry.isFile()) {
      const st = await stat(fullPath);
      result.set(relPath, st.mtimeMs);
    }
  }
  return result;
}

/**
 * 获取目录下最新文件的 mtime（秒）
 */
export async function getLatestMtime(dir) {
  const files = await collectFileMtimes(dir);
  if (files.size === 0) return 0;
  return Math.max(...files.values()) / 1000;
}

/**
 * 比较两个 skills 目录，返回更新的一方
 * 按 skill 文件夹粒度比较最新文件 mtime，避免新 skill（mtime 老）被旧版本覆盖
 * @returns {'local' | 'peer' | 'equal' | 'local-only' | 'peer-only'}
 */
export async function compareFreshness(localDir, peerDir) {
  const localFiles = await collectFileMtimes(localDir);
  const peerFiles = await collectFileMtimes(peerDir);

  if (localFiles.size === 0 && peerFiles.size === 0) return 'equal';
  if (localFiles.size === 0) return 'peer-only';
  if (peerFiles.size === 0) return 'local-only';

  // 按 skill 文件夹分组比较
  const TOLERANCE_MS = 2000;
  let localWins = 0;
  let peerWins = 0;
  let localOnlySkills = 0;
  let peerOnlySkills = 0;

  // 收集所有相对路径的 skill 根目录名
  const localSkillDirs = new Set();
  const peerSkillDirs = new Set();
  for (const relPath of localFiles.keys()) {
    const parts = relPath.split('/');
    if (parts[0]) localSkillDirs.add(parts[0]);
  }
  for (const relPath of peerFiles.keys()) {
    const parts = relPath.split('/');
    if (parts[0]) peerSkillDirs.add(parts[0]);
  }

  // 找出双方都有的 skill 名称（排除 .system、backup 等元目录）
  const META_DIRS = new Set(['.system', 'backup', 'aek-system-skill']);
  const commonSkills = [...localSkillDirs].filter(d => !META_DIRS.has(d) && peerSkillDirs.has(d));
  const localOnly = [...localSkillDirs].filter(d => !META_DIRS.has(d) && !peerSkillDirs.has(d));
  const peerOnly = [...peerSkillDirs].filter(d => !META_DIRS.has(d) && !localSkillDirs.has(d));

  peerOnlySkills = peerOnly.length;
  localOnlySkills = localOnly.length;

  // 对共有 skill，比较各自最新文件的 mtime
  for (const skill of commonSkills) {
    const localSkillFiles = new Map();
    const peerSkillFiles = new Map();
    for (const [rel, mt] of localFiles) {
      if (rel.startsWith(skill + '/')) localSkillFiles.set(rel, mt);
    }
    for (const [rel, mt] of peerFiles) {
      if (rel.startsWith(skill + '/')) peerSkillFiles.set(rel, mt);
    }
    const localMax = localSkillFiles.size ? Math.max(...localSkillFiles.values()) : 0;
    const peerMax = peerSkillFiles.size ? Math.max(...peerSkillFiles.values()) : 0;
    if (localMax - peerMax > TOLERANCE_MS) localWins++;
    else if (peerMax - localMax > TOLERANCE_MS) peerWins++;
    // 相等不计入任何一边
  }

  // 决策：有新增 skill 的一方胜出；同数量时看 mtime 差值更大的那边
  if (localOnlySkills > peerOnlySkills) return 'local';
  if (peerOnlySkills > localOnlySkills) return 'peer';
  if (localWins > peerWins) return 'local';
  if (peerWins > localWins) return 'peer';
  // 相同 skill 数且 mtime 相近，退回 max mtime 比较作为兜底
  const localMax = Math.max(...localFiles.values());
  const peerMax = Math.max(...peerFiles.values());
  if (localMax - peerMax > TOLERANCE_MS) return 'local';
  if (peerMax - localMax > TOLERANCE_MS) return 'peer';
  return 'equal';
}

// ---------- 备份与恢复 ----------

// 备份统一放在中心仓库管理目录下的 backup/ 子目录：
//   ~/.aek/skill-manager/backup/skills.bak.<timestamp>/
// 每个 backup 子目录里再放一份完整的 skills/ 快照，避免在管理目录根部散落。
async function backupRootFor(skillsDir) {
  const root = path.join(path.dirname(skillsDir), 'backup');
  await mkdir(root, { recursive: true });
  return root;
}

/**
 * 创建备份，保留最近 keep 份
 */
export async function createBackup(skillsDir, keep = 3) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupRoot = await backupRootFor(skillsDir);
  const backupDir = path.join(backupRoot, `skills.bak.${timestamp}`);
  await copySkillFolder(skillsDir, backupDir);
  await pruneBackups(backupRoot, keep);
  return backupDir;
}

export async function pruneBackups(backupRoot, keep) {
  let entries;
  try {
    entries = await readdir(backupRoot, { withFileTypes: true });
  } catch {
    return;
  }

  const backups = entries
    .filter((e) => e.isDirectory() && e.name.startsWith('skills.bak.'))
    .map((e) => e.name)
    .sort()
    .reverse(); // 最新在前

  for (let i = keep; i < backups.length; i++) {
    await rm(path.join(backupRoot, backups[i]), { recursive: true, force: true });
  }
}

// ---------- 主同步逻辑 ----------

/**
 * 执行 transfer-sync：对齐本地与对侧中心仓库
 * @returns {Promise<{action: string, from?: string, to?: string, backupDir?: string}>}
 */
export async function transferSync(options = {}) {
  const { home = os.homedir(), config = null, env = process.env, dryRun = false, force = false } = options;

  const localDir = getLocalSkillsDir(home);
  const peerDir = await getPeerSkillsDir({ home, config, env });

  if (!peerDir) {
    return { action: 'skipped', reason: 'no-peer', message: '无法确定对侧中心仓库路径（非 WSL/Windows 组合）' };
  }

  // 两边配置文件都确保存在（WSL 侧时顺手生成 Windows 侧，反之亦然）
  // peerDir 形如 /mnt/c/Users/<u>/.aek/skill-manager/skills 或 \\wsl.localhost\<d>\home\<u>\.aek\skill-manager\skills
  // 从 peerDir 提取对侧 home：去掉尾部 /.aek/skill-manager/skills
  const peerHome = peerDir.split(/[/\\]\.aek[/\\]/)[0];
  await ensureConfigFileAt(peerHome).catch(() => {});

  // 确保本地目录存在
  await mkdir(localDir, { recursive: true });

  const freshness = await compareFreshness(localDir, peerDir);

  if (freshness === 'equal' && !force) {
    return { action: 'noop', reason: 'equal', message: '两边已一致' };
  }

  const cfg = config ?? (await loadConfig({ home }));
  const keep = cfg.transferBackupKeep ?? 3;

  let sourceDir, targetDir, backupTarget, direction;
  if (freshness === 'local' || freshness === 'local-only' || (force && freshness === 'equal')) {
    sourceDir = localDir;
    targetDir = peerDir;
    backupTarget = peerDir;
    direction = 'local-to-peer';
  } else {
    sourceDir = peerDir;
    targetDir = localDir;
    backupTarget = localDir;
    direction = 'peer-to-local';
  }

  if (dryRun) {
    return { action: 'dry-run', sourceDir, targetDir, direction, freshness };
  }

  // 备份被覆盖的一方
  let backupDir = null;
  try {
    await access(backupTarget, constants.F_OK);
    backupDir = await createBackup(backupTarget, keep);
  } catch {
    // 目标不存在，无需备份
  }

  // 执行覆盖：对比双方文件，只同步有差异的 skill（增量）
  // 如果 force=true，则无条件复制
  const TOLERANCE_MS = 2000;
  const localFiles = await collectFileMtimes(sourceDir);
  const peerFiles = await collectFileMtimes(targetDir);
  const FILES_TO_COPY = new Set();

  if (force) {
    // force 模式：无条件复制所有文件
    for (const rel of localFiles.keys()) FILES_TO_COPY.add(rel);
  } else {
    // 增量模式：只复制有差异的文件
    for (const [rel, mt] of localFiles) {
      const peerMt = peerFiles.get(rel);
      if (peerMt === undefined || mt - peerMt > TOLERANCE_MS) {
        FILES_TO_COPY.add(rel);
      }
    }
    for (const [rel, mt] of peerFiles) {
      if (!localFiles.has(rel)) FILES_TO_COPY.add(rel);
    }
  }
  if (FILES_TO_COPY.size > 0) {
    await rm(targetDir, { recursive: true, force: true });
    await copySkillFolder(sourceDir, targetDir);
    // 同步 mtime 防止下次误判
    const now = new Date();
    for (const rel of FILES_TO_COPY) {
      try {
        const targetFile = path.join(targetDir, rel);
        const mtime = new Date(localFiles.get(rel));
        await utimes(targetFile, now, mtime);
      } catch {}
    }
  }

  return {
    action: FILES_TO_COPY.size > 0 ? 'copied' : 'noop',
    direction,
    sourceDir,
    targetDir,
    backupDir,
    copied: FILES_TO_COPY.size,
    prunedBackups: 0,
  };
}
