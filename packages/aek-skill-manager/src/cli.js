import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { stat, cp, mkdir, rm, readdir, readFile, writeFile } from 'node:fs/promises';

import { checkbox, confirm, select } from '@inquirer/prompts';

import {
  MODEL_SENSITIVE_FIELDS,
  PLATFORMS,
  collectModelFields,
  listSkillFolders,
  resolveCenterRepoDir,
  resolveSkillsDir,
  resolveWindowsNativeSkillsDir,
  syncFromCenterRepo,
  pullToCenterRepo,
  initCenterRepo,
  syncSkillFolders,
} from './skills.js';
import { loadConfig, getConfigPath } from './config.js';
import { transferSync } from './transfer-station.js';

const SCOPES = ['global', 'project'];

async function main() {
  try {
    const args = process.argv.slice(2);
    const { command, commandArgs, scope, help } = parseArgs(args);

    if (help) {
      printUsage();
      return;
    }

    if (command === 'init') {
      await runInit(scope);
    } else if (command === 'sync') {
      await runSync(scope, commandArgs);
    } else if (command === 'transfer-sync') {
      await runTransferSync(commandArgs);
    } else if (command === 'pull') {
      await runPull(scope, commandArgs);
    } else if (command === 'remove') {
      await runRemove(scope, commandArgs);
    } else if (command === null && commandArgs.length === 0) {
      await runInteractiveSync();
    } else if (command === null && commandArgs.length === 2) {
      await runDirectSync(commandArgs[0], commandArgs[1], { scope });
    } else {
      printUsage();
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`[aek sm] ${error?.message ?? error}`);
    process.exitCode = 1;
  }
}

function parseArgs(argv) {
  let command = null;
  const commandArgs = [];
  let scope = 'global';
  let help = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      help = true;
    } else if (arg === '--scope') {
      scope = argv[i + 1];
      i += 1;
    } else if (arg.startsWith('--scope=')) {
      scope = arg.slice('--scope='.length);
    } else if (command === null && (arg === 'init' || arg === 'sync' || arg === 'transfer-sync' || arg === 'pull' || arg === 'remove')) {
      command = arg;
    } else {
      commandArgs.push(arg);
    }
  }

  if (!SCOPES.includes(scope)) {
    throw new Error(`Invalid scope "${scope}". Use one of: ${SCOPES.join(', ')}.`);
  }

  return { command, commandArgs, scope, help };
}

function printUsage() {
  console.log('用法:');
  console.log('  aek sm sync                  从中心仓库同步 skill 到各工具');
  console.log('  aek sm sync --tools claude,cursor  同步到指定工具');
  console.log('  aek sm sync --allagents      同步到所有支持的 agent 工具');
  console.log('  aek sm transfer-sync         对齐 WSL 与 Windows 的中心仓库（以最新为准）');
  console.log('  aek sm pull <source>         从某个工具拉取 skill 到中心仓库');
  console.log('  aek sm remove <skill-name>...   从各工具中移除指定 skill（支持多个名称）');
  console.log('  aek sm remove --all             从各工具中移除全部 skill');
  console.log('  aek sm remove <skill-name>... --tools claude,cursor  只从指定工具移除');
  console.log('  aek sm init                  初始化中心仓库目录');
  console.log('');
  console.log('  aek sm <source> <target>     [--scope global|project] 直接复制');
  console.log('  无参数运行进入交互式向导');
  console.log('');
  console.log('全局范围（默认）: ~/.aek/skill-manager/skills/ → 各工具 ~/.xxx/skills/');
  console.log('项目范围: ./.aek/skill-manager/skills/ → 各工具 ./.xxx/skills/');
  console.log('配置文件: ~/.aek/skill-manager/settings.jsonc');
}

// ====== 子命令实现 ======

// 系统 skill 源目录名（开发仓库 skills/ 下）与包内捆绑目录名
const SYSTEM_SKILL_SOURCE_DIR = 'aek-system-skill';

// 系统 skill 安装目标：~/.aek/skill-manager/aek-system-skill/
// 与 skills/、backup/ 平级，不再是 skills/.system/ 子目录
async function getSystemSkillsDir(scope) {
  const centerDir = resolveCenterRepoDir({ scope }); // .../skill-manager/skills
  return path.join(centerDir, '..', SYSTEM_SKILL_SOURCE_DIR);
}

// 从源目录动态发现系统 skill（有什么装什么，不硬编码列表）
async function discoverSystemSkills(sourceDir) {
  const entries = await readdir(sourceDir, { withFileTypes: true }).catch(() => []);
  const names = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    // 必须有 SKILL.md 才算 skill
    if (existsSync(path.join(sourceDir, entry.name, 'SKILL.md'))) {
      names.push(entry.name);
    }
  }
  return names.sort();
}

async function ensureSystemSkills(scope) {
  const systemDir = await getSystemSkillsDir(scope);

  // 候选源：源码仓库 CWD/skills/aek-system-skill/（source of truth，开发时优先）或 npm 包内 aek-system-skill/
  const pkgDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', SYSTEM_SKILL_SOURCE_DIR);
  const repoDir = path.join(process.cwd(), 'skills', SYSTEM_SKILL_SOURCE_DIR);
  const candidates = [repoDir, pkgDir];

  // 找到第一个存在的源目录
  const srcRoot = candidates.find((dir) => existsSync(dir));
  if (!srcRoot) {
    console.log(`[aek sm] 系统 skill 源未找到（尝试过: ${candidates.join(', ')}）`);
    return;
  }

  const skillNames = await discoverSystemSkills(srcRoot);
  if (skillNames.length === 0) {
    console.log(`[aek sm] 系统 skill 源目录为空: ${srcRoot}`);
    return;
  }

  for (const name of skillNames) {
    const src = path.join(srcRoot, name);
    const dest = path.join(systemDir, name);
    try {
      await mkdir(systemDir, { recursive: true });
      await cp(src, dest, { recursive: true, force: true });
      console.log(`[aek sm] 系统 skill 已安装: ${name}`);
    } catch (err) {
      console.log(`[aek sm] 系统 skill 安装失败: ${name} (${err.message})`);
    }
  }

  // 清理目标目录中已不在源列表的旧 skill
  await removeStaleSystemSkills(systemDir, skillNames);
}

async function removeStaleSystemSkills(systemDir, currentNames) {
  let entries;
  try {
    entries = await readdir(systemDir, { withFileTypes: true });
  } catch {
    return; // 目录不存在，无需清理
  }
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    if (currentNames.includes(ent.name)) continue;
    await rm(path.join(systemDir, ent.name), { recursive: true, force: true });
    console.log(`[aek sm] 清理过期系统 skill: ${ent.name}`);
  }
}

// ====== transfer-sync ======

async function runTransferSync(args) {
  let force = false;
  for (const arg of args) {
    if (arg === '--force') force = true;
  }
  await doTransferSync({ force });
}

// 按配置决定是否自动执行 transfer-sync（sync 前）
// 检测策略：优先检查 record.jsonc 的 mtime，若近 1 分钟内更新过则跳过 transfer-sync
async function maybeTransferSync() {
  const cfg = await loadConfig();
  // 仅在 WSL 或 Windows 下才执行 transfer-sync
  const isWSLorWin = process.platform === 'win32' || !!process.env.WSL_DISTRO_NAME;
  if (!isWSLorWin || !cfg.transferSyncBeforeSync) {
    return;
  }
  // 快速检查：record.jsonc 是否最近有更新（表示刚做过 transfer-sync）
  const recordPath = path.join(os.homedir(), '.aek', 'skill-manager', 'record.jsonc');
  try {
    const stat = await stat(recordPath);
    if (Date.now() - stat.mtimeMs < 60_000) {
      return; // record 刚更新，跳过 transfer-sync
    }
  } catch {}
  // backup 目录最近是否有更新
  const backupDir = path.join(os.homedir(), '.aek', 'skill-manager', 'backup');
  let backupExists = false;
  try {
    const entries = await readdir(backupDir);
    const recent = entries.find(e => e.startsWith('skills.bak.') && (Date.now() - new Date(e.slice(11).replace(/-/g, '/').replace(/T/,' ').slice(0,19)).getTime()) < 60_000);
    backupExists = !!recent;
  } catch {}
  if (backupExists) {
    return; // 跳过，避免重复 transfer-sync
  }
  try {
    await doTransferSync({ quiet: true });
    // 强制等待一下，确保 record.jsonc 已写入
    await new Promise(r => setTimeout(r, 100));
  } catch (err) {
    console.log(`[aek sm] transfer-sync 自动执行失败（不影响后续 sync）: ${err.message}`);
  }
}

async function doTransferSync({ force = false, quiet = false } = {}) {
  const result = await transferSync({ force });

  if (result.action === 'skipped') {
    if (!quiet) console.log(`[aek sm] ${result.message}`);
    return;
  }

  if (result.action === 'noop') {
    if (!quiet) console.log(`[aek sm] 两边已一致，无需同步。`);
    return;
  }

  const arrow = result.direction === 'local-to-peer' ? '本地 → 对侧' : '对侧 → 本地';
  console.log(`[aek sm] transfer-sync: ${arrow}`);
  console.log(`  源: ${formatPathForDisplay(result.sourceDir)}`);
  console.log(`  目标: ${formatPathForDisplay(result.targetDir)}`);
  if (result.backupDir) {
    console.log(`  备份: ${formatPathForDisplay(result.backupDir)}`);
  }
}

// 初始化中心仓库 + 生成默认配置文件
async function runInit(scope) {
  const dir = await initCenterRepo({ scope });
  await ensureSystemSkills(scope);

  // 生成默认 settings.jsonc（loadConfig 内部已处理不存在时自动生成）
  await loadConfig();
  const configPath = getConfigPath({ home: os.homedir() });
  if (existsSync(configPath)) {
    console.log(`[aek sm] 配置文件: ${formatPathForDisplay(configPath)}`);
  }

  console.log(`[aek sm] 中心仓库已初始化: ${formatPathForDisplay(dir)}`);
  console.log(`[aek sm] 将 skill 目录放到 ${formatPathForDisplay(dir)}/ 下，`);
  console.log(`[aek sm] 然后运行 "aek sm sync" 同步到各工具。`);
}

async function runSync(scope, args) {
  // 解析 --tools 和 --allagents 参数
  let tools = null;
  let allAgents = false;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--allagents') {
      allAgents = true;
    } else if (args[i] === '--tools') {
      tools = args[i + 1].split(',').map((t) => t.trim());
      break;
    }
    if (args[i].startsWith('--tools=')) {
      tools = args[i].slice('--tools='.length).split(',').map((t) => t.trim());
      break;
    }
  }

  // 如果指定了 --allagents，则同步所有工具
  if (allAgents) {
    tools = PLATFORMS.map(p => p.id);
  }

  // 如果 tools 未指定，从配置读取默认工具列表
  if (!tools && scope === 'global') {
    const cfg = await loadConfig();
    if (cfg.syncDefaultTools && cfg.syncDefaultTools.length > 0) {
      tools = cfg.syncDefaultTools;
    }
  }

  // 全局 scope 下，按配置先对齐 WSL ↔ Windows 中心仓库
  if (scope === 'global') {
    await maybeTransferSync();
  }

  const centerDir = resolveCenterRepoDir({ scope });
  await ensureSystemSkills(scope);
  const systemSkillsDir = await getSystemSkillsDir(scope);
  const systemSkills = await listSkillFolders(systemSkillsDir);

  if (systemSkills.length === 0) {
    console.log(`[aek sm] 中心仓库为空: ${formatPathForDisplay(centerDir)}`);
    console.log(`[aek sm] 先放 skill 进去，或运行 "aek sm pull <source>" 拉取。`);
    return;
  }

  const { results, centerSkills } = await syncFromCenterRepo({ scope, tools });

  let totalCopy = 0;
  let totalOverwrite = 0;
  const totalSkills = centerSkills?.length ?? 0;
  for (const r of results) {
    if (r.copied.length > 0 || r.overwritten.length > 0) {
      const label = r.platform ? `${r.platform.name} (${r.platform.id})` : '?';
      const side = r.winTarget ? ` [Windows 原生 -> ${formatPathForDisplay(r.winTarget)}]` : '';
      console.log(`[aek sm] → ${label}: ${r.copied.length} 新增, ${r.overwritten.length} 更新${side}`);
      totalCopy += r.copied.length;
      totalOverwrite += r.overwritten.length;
    }
  }

  if (totalCopy === 0 && totalOverwrite === 0) {
    const skillCount = (centerSkills?.length ?? 0);
    console.log(`[aek sm] 无变更。中心仓库 ${formatPathForDisplay(centerDir)} 有 ${skillCount} 个 skill。`);
  } else {
    console.log(`[aek sm] 完成: ${totalCopy} 新增, ${totalOverwrite} 更新`);
  }
}

async function runPull(scope, args) {
  if (args.length === 0 || args[0].startsWith('--')) {
    throw new Error('请指定源工具，例如: aek sm pull claude');
  }

  const sourceKeyword = args[0];
  const source = resolvePlatformByKeyword(sourceKeyword);
  if (!source) {
    throw new Error(`未知工具: ${sourceKeyword}`);
  }

  const centerDir = resolveCenterRepoDir({ scope });
  const sourceDir = resolveSkillsDir(source, { scope });

  const sourceSkills = await listSkillFolders(sourceDir);
  if (sourceSkills.length === 0) {
    console.log(`[aek sm] ${source.name} 目录为空: ${formatPathForDisplay(sourceDir)}`);
    return;
  }

  const { result } = await pullToCenterRepo(source, { scope });

  console.log(`[aek sm] 从 ${source.name} 拉取到 ${formatPathForDisplay(centerDir)}:`);
  if (result.copied.length > 0) console.log(`  新增: ${result.copied.join(', ')}`);
  if (result.overwritten.length > 0) console.log(`  更新: ${result.overwritten.join(', ')}`);
  if (result.skipped.length > 0) console.log(`  跳过: ${result.skipped.join(', ')}`);
  if (result.copied.length === 0 && result.overwritten.length === 0) {
    console.log('  无变更');
  }
}

async function runRemove(scope, args) {
  // Parse --tools flag, --all flag, and collect skill names
  let tools = null;
  let removeAll = false;
  const skillNames = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--tools') {
      tools = args[i + 1].split(',').map((t) => t.trim());
      i += 1;
    } else if (args[i].startsWith('--tools=')) {
      tools = args[i].slice('--tools='.length).split(',').map((t) => t.trim());
    } else if (args[i] === '--all') {
      removeAll = true;
    } else if (!args[i].startsWith('--')) {
      skillNames.push(args[i]);
    }
  }

  if (skillNames.length === 0 && !removeAll) {
    throw new Error('请指定要移除的 skill 名称，例如: aek sm remove my-skill-1 my-skill-2，或使用 --all 移除全部');
  }

  const platforms = tools
    ? tools.map((t) => resolvePlatformByKeyword(t)).filter(Boolean)
    : PLATFORMS;

  if (platforms.length === 0) {
    throw new Error(tools ? '未找到指定的工具' : '没有可用的工具');
  }

  let totalRemoved = 0;

  if (removeAll) {
    // Remove all skills from each platform
    for (const platform of platforms) {
      const targetDir = resolveSkillsDir(platform, { scope });
      const skills = await listSkillFolders(targetDir);
      if (skills.length === 0) continue;
      for (const skill of skills) {
        await rm(skill.path, { recursive: true, force: true });
        console.log(`[aek sm] 已移除: ${platform.name} (${skill.name})`);
        totalRemoved += 1;
      }
    }
    if (totalRemoved === 0) {
      console.log('[aek sm] 各工具中均无 skill 可移除');
    } else {
      console.log(`[aek sm] 完成: 共移除 ${totalRemoved} 个 skill`);
    }
    return;
  }

  let totalNotFound = 0;

  for (const skillName of skillNames) {
    let removed = 0;
    let notFound = 0;
    for (const platform of platforms) {
      const targetDir = resolveSkillsDir(platform, { scope });
      const skillPath = path.join(targetDir, skillName);
      try {
        const skillStat = await stat(skillPath);
        if (skillStat.isDirectory()) {
          await rm(skillPath, { recursive: true, force: true });
          console.log(`[aek sm] 已移除: ${platform.name} (${skillName})`);
          removed += 1;
        } else {
          notFound += 1;
        }
      } catch {
        notFound += 1;
      }
    }
    totalRemoved += removed;
    totalNotFound += notFound;

    if (removed === 0) {
      console.log(`[aek sm] 未在任何工具中找到 skill "${skillName}"`);
    } else {
      console.log(`[aek sm] 完成: 从 ${removed} 个工具中移除了 "${skillName}"`);
      if (notFound > 0) {
        console.log(`[aek sm] ${notFound} 个工具中不存在该 skill，已跳过`);
      }
    }
  }

  if (totalRemoved > 0) {
    console.log(`[aek sm] 共移除 ${totalRemoved} 个 skill`);
  }
}

// ====== 原有功能（保留） ======

async function runDirectSync(sourceKeyword, targetKeyword, { scope }) {
  const source = resolvePlatformByKeyword(sourceKeyword);
  if (!source) throw new Error(`Unknown source platform: ${sourceKeyword}`);

  const target = resolvePlatformByKeyword(targetKeyword);
  if (!target) throw new Error(`Unknown target platform: ${targetKeyword}`);

  console.log(`[aek sm] Syncing ${scope} skills from ${source.name} -> ${target.name}`);
  await performSync({ source, target, scope });
}

async function runInteractiveSync() {
  clearTerminal();
  console.log('\x1b[44m ***** Welcome to aek sm interactive mode. ***** \x1b[0m');

  const mode = await select({
    message: '选择模式:',
    choices: [
      { name: '中心仓库同步 (sync from ~/.aek/skill-manager/skills/)', value: 'center' },
      { name: '工具到工具直接复制 (direct copy)', value: 'direct' },
    ],
  });

  if (mode === 'center') {
    const scope = await select({
      message: '选择范围:',
      choices: [
        { name: '全局 (personal, ~/.aek/skill-manager/skills/)', value: 'global' },
        { name: '项目 (workspace, ./.aek/skill-manager/skills/)', value: 'project' },
      ],
    });
    await runSync(scope, []);
    return;
  }

  const scope = await select({
    message: 'Select the skill scope:',
    choices: [
      { name: 'Global (personal, e.g. ~/.claude/skills)', value: 'global' },
      { name: 'Project (workspace, e.g. ./.claude/skills)', value: 'project' },
    ],
  });

  const detected = await detectExistingSkillDirs({ scope });
  if (detected.length === 0) {
    throw new Error(`No ${scope} skill directories with skills were found. Add a skill first, or check the scope.`);
  }

  clearTerminal();
  const sourceId = await select({
    message: 'Select the source platform:',
    choices: detected.map(({ platform, dir, count }) => ({
      name: `${platform.name} (${count} skill${count === 1 ? '' : 's'}, ${formatPathForDisplay(dir)})`,
      value: platform.id,
    })),
  });
  const source = getPlatformById(sourceId);

  clearTerminal();
  const targetId = await select({
    message: 'Select the target platform:',
    choices: PLATFORMS.filter((platform) => platform.id !== source.id).map((platform) => ({
      name: `${platform.name} (${formatPathForDisplay(resolveSkillsDir(platform, { scope }))})`,
      value: platform.id,
    })),
  });
  const target = getPlatformById(targetId);

  const sourceDir = resolveSkillsDir(source, { scope });
  const sourceSkills = await listSkillFolders(sourceDir);

  clearTerminal();
  const selected = await checkbox({
    message: 'Select the skills to sync:',
    choices: sourceSkills.map((skill) => ({
      name: skill.description
        ? `${skill.name} — ${truncate(skill.description, 70)}`
        : skill.name,
      value: skill.name,
      checked: true,
    })),
  });

  if (selected.length === 0) {
    console.log('[aek sm] No skills selected. No action taken.');
    return;
  }

  clearTerminal();
  await performSync({ source, target, scope, selected });
}

async function performSync({ source, target, scope, selected = null }) {
  const sourceDir = resolveSkillsDir(source, { scope });
  const targetDir = resolveSkillsDir(target, { scope });

  if (path.resolve(sourceDir) === path.resolve(targetDir)) {
    console.log(`[aek sm] ${source.name} and ${target.name} share the same skills directory (${formatPathForDisplay(sourceDir)}). No action taken.`);
    return;
  }

  const sourceSkills = await listSkillFolders(sourceDir);
  if (sourceSkills.length === 0) {
    throw new Error(`No skills found in ${source.name} (${formatPathForDisplay(sourceDir)}).`);
  }

  async function confirmOverwrite({ skill, existingFrontmatter }) {
    console.log(`[aek sm] "${skill.name}" already exists in ${target.name} (${formatPathForDisplay(targetDir)}).`);
    const sourceVersion = skill.frontmatter?.version;
    const targetVersion = existingFrontmatter?.version;
    if (sourceVersion || targetVersion) {
      console.log(`[aek sm]   Source version: ${sourceVersion ?? '(none)'}  Target version: ${targetVersion ?? '(none)'}`);
    }
    return confirm({
      message: `Replace "${skill.name}"? This cannot be undone — no backup will be kept.`,
      default: false,
    });
  }

  const result = await syncSkillFolders({ sourceDir, targetDir, selected, onConflict: confirmOverwrite });

  if (result.skills.length === 0 && result.skipped.length === 0) {
    console.log('[aek sm] Nothing to sync.');
    return;
  }

  if (result.skills.length > 0) {
    console.log(`[aek sm] Synced ${result.skills.length} skill(s) ${source.name} -> ${target.name} (${formatPathForDisplay(targetDir)}).`);
  }
  if (result.copied.length > 0) console.log(`[aek sm]   Added: ${result.copied.join(', ')}`);
  if (result.overwritten.length > 0) console.log(`[aek sm]   Overwritten: ${result.overwritten.join(', ')}`);
  if (result.skipped.length > 0) console.log(`[aek sm]   Skipped (kept existing): ${result.skipped.join(', ')}`);

  reportModelFields(result.skills, target);
}

function reportModelFields(skills, target) {
  const report = collectModelFields(skills);
  if (report.length === 0) return;

  console.log('[aek sm] Heads up — some synced skills declare model-specific fields:');
  for (const { name, fields } of report) {
    const parts = Object.entries(fields).map(([key, value]) => `${key}: ${value}`).join(', ');
    console.log(`[aek sm]   - ${name} (${parts})`);
  }
  console.log(`[aek sm] ${target.name} uses a different model family. These values were copied as-is — please edit them manually.`);
}

async function detectExistingSkillDirs({ scope }) {
  const results = [];
  for (const platform of PLATFORMS) {
    const dir = resolveSkillsDir(platform, { scope });
    const skills = await listSkillFolders(dir);
    if (skills.length > 0) {
      results.push({ platform, dir, count: skills.length });
    }
  }
  return results;
}

function resolvePlatformByKeyword(keyword) {
  if (!keyword) return null;
  const normalized = keyword.trim().toLowerCase();
  return PLATFORMS.find(
    (platform) =>
      platform.id === normalized ||
      platform.name.toLowerCase() === normalized ||
      platform.keywords.some((alias) => alias.toLowerCase() === normalized),
  ) ?? null;
}

function getPlatformById(id) {
  const platform = PLATFORMS.find((entry) => entry.id === id);
  if (!platform) throw new Error(`Unsupported platform identifier: ${id}`);
  return platform;
}

function clearTerminal() {
  if (!process.stdout.isTTY) return;
  const clearCommand = process.platform === 'win32' ? '\x1Bc' : '\x1B[2J\x1B[3J\x1B[H';
  process.stdout.write(clearCommand);
}

function formatPathForDisplay(filePath) {
  const resolved = path.resolve(filePath);
  const home = os.homedir();
  if (resolved.startsWith(home)) return `~${resolved.slice(home.length)}`;
  return resolved;
}

function truncate(text, max) {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length > max ? `${collapsed.slice(0, max - 1)}…` : collapsed;
}

main();