// Pure, dependency-light helpers for discovering, parsing, copying and backing
// up Agent Skills (SKILL.md folders). Everything here is injectable (home, OS,
// cwd, env) so the logic can be unit-tested without touching the real machine.

import { access, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { isWSL, getWindowsNativeRoot } from '@cheezmil/aek-common';

// Registry of supported platforms and where each one stores its skills.
//
// `*Path` arrays are path segments that end at the skills *directory*. Skills
// are discovered as immediate sub-folders that contain a SKILL.md file.
//
// winBase selects the Windows root the winPath is joined onto:
//   'home'        -> %USERPROFILE% (default; e.g. %USERPROFILE%\.codex\skills)
//   'appdata'     -> %APPDATA%
//   'localappdata'-> %LOCALAPPDATA%
//
// Note: VS Code and GitHub Copilot CLI share ~/.copilot/skills, so syncing
// between them under the global scope is a no-op. Many tools additionally read
// the cross-tool ~/.agents/skills (personal) and .agents/skills (project)
// locations; we use each platform's primary native directory here.
export const PLATFORMS = [
  {
    id: 'claude',
    name: 'Claude Code',
    keywords: ['claude', 'claude-code', 'claude code', 'anthropic'],
    docs: 'https://code.claude.com/docs/en/skills',
    unixPath: ['.claude', 'skills'],
    winPath: ['.claude', 'skills'],
    winBase: 'home',
    projectPath: ['.claude', 'skills'],
  },
  {
    id: 'codex',
    name: 'Codex',
    keywords: ['codex', 'openai', 'codex cli'],
    docs: 'https://developers.openai.com/codex/skills',
    unixPath: ['.codex', 'skills'],
    winPath: ['.codex', 'skills'],
    winBase: 'home',
    projectPath: ['.agents', 'skills'],
  },
  {
    id: 'cursor',
    name: 'Cursor',
    keywords: ['cursor', 'cursor ide'],
    docs: 'https://cursor.com/docs/skills',
    unixPath: ['.cursor', 'skills'],
    winPath: ['.cursor', 'skills'],
    winBase: 'home',
    projectPath: ['.cursor', 'skills'],
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    keywords: ['gemini', 'gemini cli', 'google', 'gcloud'],
    docs: 'https://geminicli.com/docs/cli/skills/',
    unixPath: ['.gemini', 'skills'],
    winPath: ['.gemini', 'skills'],
    winBase: 'home',
    projectPath: ['.gemini', 'skills'],
  },
  {
    id: 'copilot',
    name: 'GitHub Copilot CLI',
    keywords: ['copilot', 'copilot cli', 'github', 'gh'],
    docs: 'https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills',
    unixPath: ['.copilot', 'skills'],
    winPath: ['.copilot', 'skills'],
    winBase: 'home',
    projectPath: ['.github', 'skills'],
  },
  {
    id: 'vscode',
    name: 'Visual Studio Code',
    keywords: ['vscode', 'vs code', 'vs-code', 'code'],
    docs: 'https://code.visualstudio.com/docs/agent-customization/agent-skills',
    // Shares the personal skills directory with GitHub Copilot CLI.
    unixPath: ['.copilot', 'skills'],
    winPath: ['.copilot', 'skills'],
    winBase: 'home',
    projectPath: ['.github', 'skills'],
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    keywords: ['opencode', 'open code', 'anomaly'],
    docs: 'https://opencode.ai/docs/skills/',
    unixPath: ['.config', 'opencode', 'skills'],
    winPath: ['opencode', 'skills'],
    winBase: 'localappdata',
    projectPath: ['.opencode', 'skills'],
  },
  {
    id: 'cline',
    name: 'Cline',
    keywords: ['cline', 'roo code', 'roocode'],
    docs: 'https://cline.bot/blog/cline-3-48-0-skills-and-websearch-make-cline-smarter',
    unixPath: ['.cline', 'skills'],
    winPath: ['.cline', 'skills'],
    winBase: 'home',
    projectPath: ['.cline', 'skills'],
  },
  {
    id: 'hermes',
    name: 'Hermes Agent',
    keywords: ['hermes', 'hermes agent', 'nous'],
    docs: 'https://hermes-agent.nousresearch.com/docs/user-guide/features/skills',
    unixPath: ['.hermes', 'skills'],
    winPath: ['hermes', 'skills'],
    winBase: 'localappdata',
    projectPath: ['.hermes', 'skills'],
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    keywords: ['windsurf', 'cascade', 'codeium'],
    docs: 'https://docs.devinenterprise.com/desktop/cascade/skills',
    unixPath: ['.codeium', 'windsurf', 'skills'],
    winPath: ['.codeium', 'windsurf', 'skills'],
    winBase: 'home',
    projectPath: ['.windsurf', 'skills'],
  },
  {
    id: 'kilocode',
    name: 'Kilo Code',
    keywords: ['kilocode', 'kilo code', 'kilo'],
    docs: 'https://kilo.ai/docs/customize/marketplace',
    unixPath: ['.config', 'kilo', 'skills'],
    winPath: ['.config', 'kilo', 'skills'],
    winBase: 'home',
    projectPath: ['.config', 'kilo', 'skills'],
  },
  {
    id: 'claude-desktop',
    name: 'Claude Desktop',
    keywords: ['claude-desktop', 'claude desktop', 'anthropic desktop'],
    docs: 'https://support.claude.com/en/articles/12512180-use-skills-in-claude',
    unixPath: ['.claude', 'skills'],
    winPath: ['.claude', 'skills'],
    winBase: 'home',
    projectPath: ['.claude', 'skills'],
  },
  {
    id: 'cherry-studio',
    name: 'Cherry Studio',
    keywords: ['cherry-studio', 'cherry studio', 'cherry'],
    docs: 'https://github.com/CherryHQ/cherry-studio',
    unixPath: ['.claude', 'skills'],
    winPath: ['.claude', 'skills'],
    winBase: 'home',
    projectPath: ['.claude', 'skills'],
  },
  {
    id: 'chatbox',
    name: 'Chatbox',
    keywords: ['chatbox', 'chatbox ai'],
    docs: 'https://chatboxai.app/en/guide/work-mode/configuration',
    unixPath: ['.chatbox', 'skills'],
    winPath: ['.chatbox', 'skills'],
    winBase: 'home',
    projectPath: ['.chatbox', 'skills'],
  },
  {
    id: 'continue',
    name: 'Continue',
    keywords: ['continue', 'continue.dev', 'continue dev'],
    docs: 'https://github.com/continuedev/continue/commit/3ab5b5992bb7d8dc11e6589d97c435959de3d6bc',
    unixPath: ['.continue', 'skills'],
    winPath: ['.continue', 'skills'],
    winBase: 'home',
    projectPath: ['.continue', 'skills'],
  },
  {
    id: 'workbuddy',
    name: 'WorkBuddy',
    keywords: ['workbuddy', 'codebuddy', 'tencent'],
    docs: 'https://www.workbuddy.ai/docs/cli/codebuddy-dir',
    unixPath: ['.codebuddy', 'skills'],
    winPath: ['.codebuddy', 'skills'],
    winBase: 'home',
    projectPath: ['.codebuddy', 'skills'],
  },
  {
    id: 'openclaw',
    name: 'OpenClaw',
    keywords: ['openclaw', 'open claw'],
    docs: 'https://docs.openclaw.ai/cli/skills',
    unixPath: ['.openclaw', 'skills'],
    winPath: ['.openclaw', 'skills'],
    winBase: 'home',
    projectPath: ['.openclaw', 'skills'],
  },
  {
    id: 'qoder',
    name: 'Qoder',
    keywords: ['qoder', 'qoder cli'],
    docs: 'https://docs.qoder.com/cli/plugins',
    unixPath: ['.qoder', 'skills'],
    winPath: ['.qoder', 'skills'],
    winBase: 'home',
    projectPath: ['.qoder', 'skills'],
  },
  {
    id: 'qwencode',
    name: 'QWencode',
    keywords: ['qwencode', 'qwen code', 'qwen'],
    docs: 'https://github.com/QwenLM/qwen-code/pull/7395',
    unixPath: ['.qwen', 'skills'],
    winPath: ['.qwen', 'skills'],
    winBase: 'home',
    projectPath: ['.qwen', 'skills'],
  },
  {
    id: 'antigravity',
    name: 'Antigravity',
    keywords: ['antigravity', 'google antigravity'],
    docs: 'https://antigravity.google/docs/skills/',
    unixPath: ['.gemini', 'skills'],
    winPath: ['.gemini', 'skills'],
    winBase: 'home',
    projectPath: ['.gemini', 'skills'],
  },
  {
    id: 'kiro',
    name: 'Kiro',
    keywords: ['kiro', 'kiro agent'],
    docs: 'https://kiro.dev/docs/cli/skills/',
    unixPath: ['.kiro', 'skills'],
    winPath: ['.kiro', 'skills'],
    winBase: 'home',
    projectPath: ['.kiro', 'skills'],
  },
  {
    id: 'pi',
    name: 'Pi Agent',
    keywords: ['pi', 'pi agent', 'earendil'],
    docs: 'https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/skills.md',
    unixPath: ['.pi', 'agent', 'skills'],
    winPath: ['.pi', 'agent', 'skills'],
    winBase: 'home',
    projectPath: ['.pi', 'skills'],
  },
  {
    id: 'deepseek-harness',
    name: 'DeepSeek Harness',
    keywords: ['deepseek-harness', 'deepseek harness', 'dsh'],
    docs: 'https://skillvetai.com/deepseek-harness/skill-compatibility/',
    unixPath: ['.dsh', 'skills'],
    winPath: ['.dsh', 'skills'],
    winBase: 'home',
    projectPath: ['.dsh', 'skills'],
  },
];

// Frontmatter fields that bind a skill to a specific model/inference behaviour.
// These are Claude Code extensions; other platforms use different model
// families, so the values are meaningless after a cross-platform sync and must
// be edited by hand. We detect and report them but never rewrite them.
export const MODEL_SENSITIVE_FIELDS = ['model', 'effort'];

// 中心仓库目录名（~/.aek/skill-manager/skills/ 或 ./.aek/skill-manager/skills/）
export const CENTER_REPO_NAME = 'skill-manager';

// 解析中心仓库的 skills 目录
export function resolveCenterRepoDir(options = {}) {
  const {
    scope = 'global',
    home = os.homedir(),
    cwd = process.cwd(),
  } = options;

  if (scope === 'project') {
    return path.resolve(path.join(cwd, '.aek', CENTER_REPO_NAME, 'skills'));
  }
  return path.resolve(path.join(home, '.aek', CENTER_REPO_NAME, 'skills'));
}

// 从中心仓库同步到指定工具列表（或全部 PLATFORMS）
export async function syncFromCenterRepo(options = {}) {
  const {
    scope = 'global',
    tools = null, // null = 所有 PLATFORMS
    onConflict = null,
  } = options;

  const centerDir = resolveCenterRepoDir({ scope });
  let centerSkills = await listSkillFolders(centerDir);

  // Also scan the .system/ sub-directory for project-bundled system skills.
  // The system skills (aek-mcp, aek-websearch, aek-skill-manager) are defined in
  // the project's skills/ directory and auto-copied to .system/ by `aek sm init`.
  const systemDir = path.join(centerDir, '.system');
  const systemSkills = await listSkillFolders(systemDir);
  centerSkills = [...centerSkills, ...systemSkills];

  if (centerSkills.length === 0) {
    return { centerDir, results: [] };
  }

  const platforms = tools
    ? PLATFORMS.filter((p) => tools.includes(p.id))
    : PLATFORMS;

  const results = [];
  const winRoot = isWSL() ? getWindowsNativeRoot() : null;
  for (const platform of platforms) {
    const targetDir = resolveSkillsDir(platform, { scope });
    if (path.resolve(centerDir) === path.resolve(targetDir)) continue;

    const result = await syncSkillFolders({
      sourceDir: centerDir,
      targetDir,
      onConflict,
      extraSkills: systemSkills,
    });
    result.platform = platform;
    results.push(result);

    // WSL 下额外同步一份到 Windows 原生 profile（若可解析）。
    const winTargetDir = resolveWindowsNativeSkillsDir(platform, { scope, winRoot });
    if (winTargetDir && path.resolve(centerDir) !== path.resolve(winTargetDir)) {
      const winResult = await syncSkillFolders({
        sourceDir: centerDir,
        targetDir: winTargetDir,
        onConflict,
        extraSkills: systemSkills,
      });
      winResult.platform = platform;
      winResult.winTarget = winTargetDir;
      results.push(winResult);
    }
  }

  return { centerDir, results };
}

// 从某个工具拉取到中心仓库
export async function pullToCenterRepo(sourcePlatform, options = {}) {
  const {
    scope = 'global',
    selected = null,
    onConflict = null,
  } = options;

  const centerDir = resolveCenterRepoDir({ scope });
  const sourceDir = resolveSkillsDir(sourcePlatform, { scope });

  return {
    centerDir,
    result: await syncSkillFolders({ sourceDir, targetDir: centerDir, selected, onConflict }),
  };
}

// 初始化中心仓库
export async function initCenterRepo(options = {}) {
  const { scope = 'global' } = options;
  const dir = resolveCenterRepoDir({ scope });
  await mkdir(dir, { recursive: true });
  return dir;
}
export function resolveSkillsDir(platform, options = {}) {
  const {
    scope = 'global',
    home = os.homedir(),
    platformOS = process.platform,
    cwd = process.cwd(),
    env = process.env,
  } = options;

  // Use the path flavour that matches the *target* OS so Windows paths resolve
  // correctly even when the tool (or its tests) run on a POSIX host.
  const p = platformOS === 'win32' ? path.win32 : path.posix;

  if (scope === 'project') {
    return p.resolve(p.join(cwd, ...platform.projectPath));
  }

  if (platformOS === 'win32') {
    let base;
    if (platform.winBase === 'localappdata') {
      base = env.LOCALAPPDATA || p.join(home, 'AppData', 'Local');
    } else if (platform.winBase === 'appdata') {
      base = env.APPDATA || p.join(home, 'AppData', 'Roaming');
    } else {
      base = home;
    }
    return p.resolve(p.join(base, ...platform.winPath));
  }

  const segments = platformOS === 'darwin' && platform.macPath
    ? platform.macPath
    : platform.unixPath;

  return p.resolve(p.join(home, ...segments));
}

// 在 WSL 下，把某工具的 skill 目录解析到 Windows 原生 profile（/mnt/c/Users/<user>/...）。
// 返回 WSL 侧可直接写入的正斜杠路径；无法解析（无 winRoot / 项目范围 / 无 winPath）时返回 ''。
// 项目范围（project）不映射到 Windows 原生，因为 /mnt/ 布局只有全局 profile 才有意义。
export function resolveWindowsNativeSkillsDir(platform, options = {}) {
  const { scope = 'global', winRoot = '', env = process.env } = options;
  if (!winRoot) return '';
  if (scope === 'project') return '';
  const p = path.posix;
  let base;
  if (platform.winBase === 'localappdata') {
    base = p.join(winRoot, 'AppData', 'Local');
  } else if (platform.winBase === 'appdata') {
    base = p.join(winRoot, 'AppData', 'Roaming');
  } else {
    base = winRoot;
  }
  return p.resolve(p.join(base, ...platform.winPath));
}

// Minimal YAML frontmatter reader: returns top-level scalar key/value pairs
// found between the leading `---` fences. Nested/indented lines are skipped, so
// map-valued keys (e.g. `metadata`) are ignored rather than mis-parsed. This is
// deliberately tiny — it only needs name/description/model/effort for display
// and reporting, not a full YAML parse.
export function parseFrontmatter(text) {
  const result = {};
  const match = text.replace(/^﻿/, '').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    return result;
  }

  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim() || /^\s/.test(line)) {
      continue; // blank, comment-only handled below, or nested line
    }
    if (line.trimStart().startsWith('#')) {
      continue;
    }
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) {
      continue;
    }
    let value = m[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[m[1]] = value;
  }

  return result;
}

// Read and parse the frontmatter of a single skill folder's SKILL.md.
// Returns null if there's no SKILL.md, or {} if it's unreadable/invalid.
export async function readSkillFrontmatter(skillPath) {
  const skillMd = path.join(skillPath, 'SKILL.md');
  if (!(await pathExists(skillMd))) {
    return null;
  }
  try {
    return parseFrontmatter(await readFile(skillMd, 'utf-8'));
  } catch {
    return {};
  }
}

// List the skill folders inside a skills directory. Each entry is an immediate
// sub-directory containing a SKILL.md file. Returns [] if the directory is
// missing. Sorted by name for stable output.
export async function listSkillFolders(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const skills = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const skillPath = path.join(dir, entry.name);
    const frontmatter = await readSkillFrontmatter(skillPath);
    if (frontmatter === null) {
      continue;
    }

    skills.push({
      name: entry.name,
      path: skillPath,
      description: frontmatter.description ?? '',
      frontmatter,
    });
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

// From a list of skill folders, collect those declaring model-sensitive fields.
// Returns [{ name, fields: { model?, effort? } }] for reporting.
export function collectModelFields(skillFolders) {
  const report = [];
  for (const skill of skillFolders) {
    const fm = skill.frontmatter ?? {};
    const fields = {};
    for (const field of MODEL_SENSITIVE_FIELDS) {
      if (fm[field] !== undefined && fm[field] !== '') {
        fields[field] = fm[field];
      }
    }
    if (Object.keys(fields).length > 0) {
      report.push({ name: skill.name, fields });
    }
  }
  return report;
}

// Recursively copy a single skill folder.
//
// 不使用 fs.cp / copyFile：它们在目标上设置 Unix 文件 mode（chmod），在 WSL2 的
// drvfs 挂载（/mnt/c，即 Windows 原生盘）上不兼容该语义，会抛 EPERM。改用逐文件
// readFile -> writeFile 的字节复制，跨 ext4/drvfs/本地边界都稳定（skill 均为纯文本，
// 无需保留 mode/时间戳）。
export async function copySkillFolder(srcDir, destDir) {
  await mkdir(destDir, { recursive: true });
  const entries = await readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      await copySkillFolder(src, dest);
    } else if (entry.isFile()) {
      const content = await readFile(src);
      await writeFile(dest, content);
    }
    // 忽略符号链接等特殊条目（skill 目录内无需跟随）
  }
}

// Core sync routine (pure of any console I/O so it can be unit-tested):
// copy the chosen source skills into the target directory, and never touch
// target skills that don't exist in the source (non-destructive merge).
//
// When a source skill shares its name with an existing target skill, the
// optional `onConflict({ skill, existingFrontmatter })` callback decides
// whether to proceed — if it resolves falsy, the existing target skill is
// left untouched and the name is reported in `skipped`. Without a callback,
// conflicts are overwritten unconditionally (matching historical behaviour).
// Overwrites are permanent: no backup of the replaced folder is kept.
export async function syncSkillFolders(options) {
  const {
    sourceDir,
    targetDir,
    selected = null,
    onConflict = null,
    extraSkills = null,
  } = options;

  const sourceSkills = await listSkillFolders(sourceDir);
  const allSkills = extraSkills ? [...sourceSkills, ...extraSkills] : sourceSkills;
  const chosen = selected
    ? allSkills.filter((skill) => selected.includes(skill.name))
    : allSkills;

  await mkdir(targetDir, { recursive: true });

  const copied = [];
  const overwritten = [];
  const skipped = [];

  for (const skill of chosen) {
    const destination = path.join(targetDir, skill.name);
    if (await pathExists(destination)) {
      if (onConflict) {
        const existingFrontmatter = await readSkillFrontmatter(destination);
        const proceed = await onConflict({ skill, existingFrontmatter });
        if (!proceed) {
          skipped.push(skill.name);
          continue;
        }
      }
      await rm(destination, { recursive: true, force: true });
      await copySkillFolder(skill.path, destination);
      overwritten.push(skill.name);
    } else {
      await copySkillFolder(skill.path, destination);
      copied.push(skill.name);
    }
  }

  return {
    copied,
    overwritten,
    skipped,
    skills: chosen.filter((skill) => !skipped.includes(skill.name)),
  };
}

export async function pathExists(targetPath) {
  try {
    await access(targetPath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
