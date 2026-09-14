// aek-prompt-manager — CLI
// Two sources of platform-specific prompt fragments, different semantics:
//   patch  -> global-prompt-mapping   (managed block replaced in place)
//   apply  -> only-patch              (appended to end; replaces block on repeat)
// Project rules:
//   pr     -> .aek/prompt-manager/project-rules (project-local prompt files)
import process from 'node:process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PLATFORMS, SUPPORTED_IDS } from './platforms.js';
import {
  aekDir,
  sharedDir,
  toolDir,
  sysPromptDir,
  toolDirNameFor,
  MAPPING_SOURCE,
  ONLY_PATCH_SOURCE,
  PLATFORM_FILES,
  PLATFORM_FILE,
  currentPlatform,
  patch,
  apply,
  unpatch,
  isWSL,
  windowsNativeTarget,
} from './core.js';
import {
  initProjectRules,
  generateProjectRules,
  listProjectAgents,
  findProjectAgent,
  projectAgentName,
} from './project-rules.js';

const CMD = 'aekpm';
const SOURCES = [MAPPING_SOURCE, ONLY_PATCH_SOURCE];
const COMMANDS = ['init', 'patch', 'map', 'apply', 'remove', 'status', 'pr', 'project-rules'];

async function main() {
  try {
    const args = process.argv.slice(2);
    const { command, commandArgs, help } = parseArgs(args);
    if (help) { printUsage(); return; }

    if (command === 'init') await runInit();
    else if (command === 'patch') await runPatch(commandArgs);
    else if (command === 'map') await runMap(commandArgs);
    else if (command === 'apply') await runApply(commandArgs);
    else if (command === 'remove') await runRemove(commandArgs);
    else if (command === 'status') await runStatus(commandArgs);
    else if (command === 'pr' || command === 'project-rules') await runProjectRules(commandArgs);
    else if (command === null && commandArgs.length === 0) printUsage();
    else { printUsage(); process.exitCode = 1; }
  } catch (error) {
    console.error(`[${CMD}] ${error?.message ?? error}`);
    process.exitCode = 1;
  }
}

function parseArgs(argv) {
  const help = argv.includes('--help') || argv.includes('-h');
  const first = argv.find((arg) => arg !== '--help' && arg !== '-h');
  if (!first) return { command: null, commandArgs: argv, help };
  if (!COMMANDS.includes(first)) return { command: null, commandArgs: argv, help };
  return { command: first, commandArgs: argv.slice(1), help };
}

function findTool(id) {
  const t = PLATFORMS.find((p) => p.id === id);
  if (!t) {
    throw new Error(`Unsupported or unknown tool "${id}". Supported: ${SUPPORTED_IDS.join(', ')}.`);
  }
  return t;
}

async function runInit() {
  const { mkdir, writeFile, readFile, access } = await import('node:fs/promises');
  const platformFiles = PLATFORM_FILES.map((n) => PLATFORM_FILE(n));

  // Source templates live in <pkg>/templates — copied into the user dir only
  // when a file is missing, so the user's own edits are never overwritten.
  const pkgRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const tplOnlyPatch = join(pkgRoot, 'templates', ONLY_PATCH_SOURCE, 'aek_system_prompt', 'all_agents_shared');

  for (const source of SOURCES) {
    const dirs = [sharedDir(source), ...PLATFORMS.map((p) => toolDir(source, p.id))];
    for (const d of dirs) await mkdir(d, { recursive: true });

    // Create empty (not placeholder-filled) files for every platform file.
    // Existing files are never overwritten — init only fills in what's missing.
    for (const pf of platformFiles) {
      await writeIfMissing(join(sharedDir(source), pf), '', access, writeFile);
    }
    for (const p of PLATFORMS) {
      for (const pf of platformFiles) {
        await writeIfMissing(join(toolDir(source, p.id), pf), '', access, writeFile);
      }
    }
    // System built-in prompt source (only-patch): seed from templates.
    if (source === ONLY_PATCH_SOURCE) {
      const sysDir = sysPromptDir(source);
      await mkdir(sysDir, { recursive: true });
      for (const pf of platformFiles) {
        const tpl = join(tplOnlyPatch, pf);
        let content = '';
        try {
          content = await readFile(tpl, 'utf8');
        } catch {
          // template missing -> empty file
        }
        await writeIfMissing(join(sysDir, pf), content, access, writeFile);
      }
    }
  }

  console.log(`[${CMD}] Initialized at ${aekDir()}/`);
  console.log(`[${CMD}] Sources (${platformFiles.length} platform files each):`);
  for (const source of SOURCES) {
    console.log(`[${CMD}]   ${source}/`);
  }
  for (const p of PLATFORMS) {
    console.log(`[${CMD}]   tool ${toolDirNameFor(p.id)}`);
  }
}

async function writeIfMissing(filePath, content, access, writeFile) {
  try {
    await access(filePath);
    // already exists -> keep user content untouched
  } catch {
    await writeFile(filePath, content, 'utf8');
  }
}

async function runPatch(args) {
  const tool = args[0] || 'all';
  const targetTools = tool === 'all' ? PLATFORMS : [findTool(tool)];
  let failed = 0;
  for (const t of targetTools) {
    try {
      const r = await apply(t);
      const verb = r.replaced ? 'updated' : 'patched';
      console.log(`[${CMD}] ${t.id}: ${verb} (only-patch) -> ${r.target}`);
      if (r.winTarget) {
        console.log(`[${CMD}]   dual-write -> ${r.winTarget}`);
      }
    } catch (e) {
      console.error(`[${CMD}] ${t.id}: ${e.message}`);
      failed += 1;
    }
  }
  if (failed) process.exitCode = 1;
}

async function runMap(args) {
  const tool = args[0] || 'all';
  const targetTools = tool === 'all' ? PLATFORMS : [findTool(tool)];
  let failed = 0;
  for (const t of targetTools) {
    try {
      const r = await patch(t);
      const verb = r.replaced ? 'updated' : 'patched';
      console.log(`[${CMD}] ${t.id}: ${verb} (global-prompt-mapping) -> ${r.target}`);
      if (r.winTarget) {
        console.log(`[${CMD}]   dual-write -> ${r.winTarget}`);
      }
    } catch (e) {
      console.error(`[${CMD}] ${t.id}: ${e.message}`);
      failed += 1;
    }
  }
  if (failed) process.exitCode = 1;
}

async function runApply(args) {
  const tool = args[0] || 'all';
  const targetTools = tool === 'all' ? PLATFORMS : [findTool(tool)];
  let failed = 0;
  for (const t of targetTools) {
    try {
      const r = await apply(t);
      const verb = r.replaced ? 'updated' : 'applied';
      console.log(`[${CMD}] ${t.id}: ${verb} (${r.source}) -> ${r.target}`);
      if (r.winTarget) {
        console.log(`[${CMD}]   dual-write -> ${r.winTarget}`);
      }
    } catch (e) {
      console.error(`[${CMD}] ${t.id}: ${e.message}`);
      failed += 1;
    }
  }
  if (failed) process.exitCode = 1;
}

async function runRemove(args) {
  const tool = args[0] || 'all';
  const targetTools = tool === 'all' ? PLATFORMS : [findTool(tool)];
  for (const t of targetTools) {
    const r = await unpatch(t);
    console.log(`[${CMD}] ${t.id}: ${r.removed ? 'removed' : 'not present'} at ${r.target}`);
  }
}

async function runStatus(args) {
  const { readFile } = await import('node:fs/promises');
  const tool = args[0] || 'all';
  if (tool === 'all') {
    console.log(`[${CMD}] current platform: ${currentPlatform()}   WSL: ${isWSL() ? 'yes' : 'no'}`);
    for (const p of PLATFORMS) {
      const state = await toolState(p);
      printState(p.id, state);
    }
    return;
  }
  const t = findTool(tool);
  const state = await toolState(t);
  printState(t.id, state);
}

function printState(id, state) {
  let line = `[${CMD}] ${id}: ${state.status}  ${state.target}`;
  if (state.winTarget) line += `\n[${CMD}]    Windows 原生: ${state.winTarget}`;
  console.log(line);
}

async function toolState(p) {
  const target = p.globalPromptPath(p.id);
  const winTarget = windowsNativeTarget(p, p.id);
  try {
    const { readFile } = await import('node:fs/promises');
    const content = await readFile(target, 'utf8');
    const patched = content.includes('<!-- head-aek-pm-patch -->');
    return { status: patched ? 'patched' : 'not-patched', target, winTarget };
  } catch {
    return { status: 'file-missing', target, winTarget };
  }
}

async function runProjectRules(args) {
  const sub = args[0];
  const rest = args.slice(1);

  if (!sub || sub === '-h' || sub === '--help' || sub === 'help') {
    printProjectRulesUsage();
    return;
  }

  if (sub === 'init') {
    const res = await initProjectRules();
    for (const f of res.files) {
      console.log(`[${CMD}] ${f.created ? 'created' : 'exists'} ${f.path}`);
    }
    return;
  }

  if (sub === 'gen') {
    const agent = findProjectAgent(rest[0] || 'all').id;
    const res = await generateProjectRules(agent);
    for (const w of res.writes) {
      console.log(`[${CMD}] ${w.replaced ? 'updated' : 'created'} ${w.target}`);
    }
    console.log(`[${CMD}] generated ${res.generated} target(s) for ${res.agentId}`);
    return;
  }

  throw new Error(`Unknown project-rules subcommand "${sub}". Use "pr init" or "pr gen [agent]".`);
}

function printProjectRulesUsage() {
  const agents = listProjectAgents().map(projectAgentName).join(', ');
  console.log(`[${CMD}] Manage project-local prompt rules.

Commands:
  pr init                  Create .aek/prompt-manager/project-rules/ source files
  pr gen [all|agent]       Generate project prompt files; default is all
  project-rules ...        Alias for pr

Project-rule agents (${agents}):
  codex            -> AGENTS.md
  hermes           -> HERMES.md
  claude           -> CLAUDE.md
  gemini           -> GEMINI.md
  qwencode         -> QWEN.md
  copilot          -> .github/copilot-instructions.md
  vscode           -> .github/copilot-instructions.md
  cursor           -> .cursor/rules/CURSOR.md
  cline            -> .cline/rules/CLINE.md
  windsurf         -> .windsurf/rules/WINDSURF.md
  roocode          -> .roo/rules/ROOCODE.md
  kilocode         -> .kilocode/rules/KILOCODE.md
  antigravity      -> .agents/rules/ANTIGRAVITY.md
  qoder            -> AGENTS.md
  kiro             -> .kiro/steering/KIRO.md
  pi               -> AGENTS.md
  deepseek-harness -> AGENTS.md
  openclaw         -> AGENTS.md
  zcode            -> AGENTS.md
  trae             -> .trae/rules/TRAE.md
  trae-cn          -> .trae-cn/rules/TRAE-CN.md
  opencode         -> AGENTS.md

Source layout (.aek/prompt-manager/project-rules):
  all-agent-must-comply.md                     shared by all project-rule targets
  for-certain-agents/<target-path>/<agent>.md  per-agent content; dir name =
                                               target path ('/'->'@', '.'->'#'),
                                               e.g. AGENTS#md, #cursor@rules@CURSOR#md
  scripts/*.mjs                                thin wrappers around "aekpm pr gen ..."
`);
}

function printUsage() {
  const supported = SUPPORTED_IDS.join(', ');
  const platformList = PLATFORM_FILES.map((n) => PLATFORM_FILE(n)).join(', ');
  const agents = listProjectAgents().map(projectAgentName).join(', ');
  console.log(`[${CMD}] Manage global prompt fragments and project-local prompt rules.

Commands:
  init            Create source dirs with empty platform files for both sources
  patch <tool>    Append only-patch fragments to one tool's global prompt (末尾追加)
  patch all       Append to every supported tool
  map <tool>      Inject global-prompt-mapping fragments (原地替换)
  map all         Map into every supported tool
  apply <tool>    Append only-patch fragments (alias for patch)
  apply all       Append to every supported tool
  remove <tool>   Remove the managed block from one tool's global prompt
  remove all      Remove from every supported tool
  status <tool>   Show whether a tool's global prompt file is patched
  pr init         Create project-rules source files under .aek/prompt-manager/project-rules/
  pr gen          Generate all project prompt rules
  pr gen <agent>  Generate rules for one project-rule agent (${agents})

Options:
  -h, --help      Show this help

Supported tools (${supported}):
${PLATFORMS.map((p) => `  ${p.id.padEnd(14)} ${p.globalPromptLabel(p.id)}`).join('\n')}

Two sources (~/.aek/prompt-manager/):
  global-prompt-mapping/   "map" source     (managed block replaced in place)
  only-patch/              "patch"/"apply" source   (appended to end; replaces block on repeat)

Project-rules layout (.aek/prompt-manager/project-rules):
  all-agent-must-comply.md                     shared by all project-rule targets
  for-certain-agents/<target-path>/<agent>.md  per-agent content; dir name =
                                               target path ('/'->'@', '.'->'#'),
                                               e.g. AGENTS#md, #cursor@rules@CURSOR#md
  scripts/*.mjs                                thin wrappers around "aekpm pr gen ..."

Layout inside each source:
  all_agents_shared/           shared across every tool
  <tool_dir>/                  per-tool  (dir name: tool id, hyphen -> underscore)
    e.g.  claude_code/         for tool id "claude-code"

Platform files (${platformList}):
  cross_platform_shared.md   applies everywhere (always loaded)
  linux.md / mac.md / windows.md / wsl.md   applies only on that platform

Merge order (shared before tool-specific):
  1. <source>/all_agents_shared/cross_platform_shared.md
  2. <source>/all_agents_shared/<current-platform>.md
  3. <source>/<tool_dir>/cross_platform_shared.md
  4. <source>/<tool_dir>/<current-platform>.md

Dual-write (WSL↔Windows): the Linux path is authoritative; the equivalent
Windows UNC path (\\\\wsl.localhost\\<distro>\\home\\<user>\\...) is shown for
reference since it is the same file (same inode).
`);
}

main();
