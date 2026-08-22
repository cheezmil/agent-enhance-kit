import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { stat, cp, mkdir } from 'node:fs/promises';

import { checkbox, confirm, select } from '@inquirer/prompts';

import {
  PLATFORMS,
  collectModelFields,
  listSkillFolders,
  resolveSkillsDir,
  resolveCenterRepoDir,
  syncFromCenterRepo,
  pullToCenterRepo,
  initCenterRepo,
  syncSkillFolders,
} from './skills.js';

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
    } else if (command === 'pull') {
      await runPull(scope, commandArgs);
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
    } else if (command === null && (arg === 'init' || arg === 'sync' || arg === 'pull')) {
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
  console.log('  aek sm pull <source>         从某个工具拉取 skill 到中心仓库');
  console.log('  aek sm init                  初始化中心仓库目录');
  console.log('');
  console.log('  aek sm <source> <target>     [--scope global|project] 直接复制');
  console.log('  无参数运行进入交互式向导');
  console.log('');
  console.log('全局范围（默认）: ~/.aek/skill-manager/skills/ → 各工具 ~/.xxx/skills/');
  console.log('项目范围: ./.aek/skill-manager/skills/ → 各工具 ./.xxx/skills/');
}

// ====== 子命令实现 ======

async function runInit(scope) {
  const dir = await initCenterRepo({ scope });

  // Auto-copy project-bundled system skills (aek-mcp, aek-websearch, aek-skill-manager)
  // from the project's skills/ directory to .system/.
  const systemDir = path.join(dir, '.system');
  const projectSkillsDir = path.join(process.cwd(), 'skills');
  const SYSTEM_SKILL_NAMES = ['aek-mcp', 'aek-websearch', 'aek-skill-manager'];

  for (const name of SYSTEM_SKILL_NAMES) {
    const src = path.join(projectSkillsDir, name);
    const dest = path.join(systemDir, name);
    try {
      const srcStat = await stat(src);
      if (srcStat.isDirectory()) {
        await mkdir(systemDir, { recursive: true });
        await cp(src, dest, { recursive: true, force: true });
        console.log(`[aek sm] 系统 skill 已安装: ${name}`);
      }
    } catch {
      // skill not found in project, skip silently
    }
  }

  console.log(`[aek sm] 中心仓库已初始化: ${formatPathForDisplay(dir)}`);
  console.log(`[aek sm] 将 skill 目录放到 ${formatPathForDisplay(dir)}/ 下，`);
  console.log(`[aek sm] 然后运行 "aek sm sync" 同步到各工具。`);
}

async function runSync(scope, args) {
  // 解析 --tools 参数
  let tools = null;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--tools') {
      tools = args[i + 1].split(',').map((t) => t.trim());
      break;
    }
    if (args[i].startsWith('--tools=')) {
      tools = args[i].slice('--tools='.length).split(',').map((t) => t.trim());
      break;
    }
  }

  const centerDir = resolveCenterRepoDir({ scope });
  const centerSkills = await listSkillFolders(centerDir);

  if (centerSkills.length === 0) {
    console.log(`[aek sm] 中心仓库为空: ${formatPathForDisplay(centerDir)}`);
    console.log(`[aek sm] 先放 skill 进去，或运行 "aek sm pull <source>" 拉取。`);
    return;
  }

  const { results } = await syncFromCenterRepo({ scope, tools });

  let totalCopy = 0;
  let totalOverwrite = 0;
  for (const r of results) {
    if (r.copied.length > 0 || r.overwritten.length > 0) {
      const label = r.platform ? `${r.platform.name} (${r.platform.id})` : '?';
      console.log(`[aek sm] → ${label}: ${r.copied.length} 新增, ${r.overwritten.length} 更新`);
      totalCopy += r.copied.length;
      totalOverwrite += r.overwritten.length;
    }
  }

  if (totalCopy === 0 && totalOverwrite === 0) {
    console.log(`[aek sm] 无变更。中心仓库 ${formatPathForDisplay(centerDir)} 有 ${centerSkills.length} 个 skill。`);
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