// Pure, dependency-light helpers for discovering, parsing, copying and backing
// up Agent Skills (SKILL.md folders). Everything here is injectable (home, OS,
// cwd, env) so the logic can be unit-tested without touching the real machine.

import { access, cp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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
  const centerSkills = await listSkillFolders(centerDir);
  if (centerSkills.length === 0) {
    return { centerDir, results: [] };
  }

  const platforms = tools
    ? PLATFORMS.filter((p) => tools.includes(p.id))
    : PLATFORMS;

  const results = [];
  for (const platform of platforms) {
    const targetDir = resolveSkillsDir(platform, { scope });
    if (path.resolve(centerDir) === path.resolve(targetDir)) continue;

    const result = await syncSkillFolders({
      sourceDir: centerDir,
      targetDir,
      onConflict,
    });
    result.platform = platform;
    results.push(result);
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
export async function copySkillFolder(srcDir, destDir) {
  await cp(srcDir, destDir, { recursive: true });
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
  } = options;

  const sourceSkills = await listSkillFolders(sourceDir);
  const chosen = selected
    ? sourceSkills.filter((skill) => selected.includes(skill.name))
    : sourceSkills;

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
