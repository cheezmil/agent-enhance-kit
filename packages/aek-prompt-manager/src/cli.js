// aek-prompt-manager — CLI
// Two sources of platform-specific prompt fragments, different semantics:
//   patch  -> global-prompt-mapping   (managed block replaced in place)
//   apply  -> only-patch              (appended to end; replaces block on repeat)
import process from 'node:process';
import { join } from 'node:path';

import { PLATFORMS, SUPPORTED_IDS } from './platforms.js';
import {
  aekDir,
  sharedDir,
  toolDir,
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
} from './core.js';

const CMD = 'aek pm';
const SOURCES = [MAPPING_SOURCE, ONLY_PATCH_SOURCE];

async function main() {
  try {
    const args = process.argv.slice(2);
    const { command, commandArgs, help } = parseArgs(args);
    if (help) { printUsage(); return; }

    if (command === 'init') await runInit();
    else if (command === 'patch') await runPatch(commandArgs);
    else if (command === 'apply') await runApply(commandArgs);
    else if (command === 'remove') await runRemove(commandArgs);
    else if (command === 'status') await runStatus(commandArgs);
    else if (command === null && commandArgs.length === 0) printUsage();
    else { printUsage(); process.exitCode = 1; }
  } catch (error) {
    console.error(`[${CMD}] ${error?.message ?? error}`);
    process.exitCode = 1;
  }
}

function parseArgs(argv) {
  let command = null;
  const commandArgs = [];
  let help = false;
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') help = true;
    else if (command === null && ['init', 'patch', 'apply', 'remove', 'status'].includes(arg)) command = arg;
    else commandArgs.push(arg);
  }
  return { command, commandArgs, help };
}

function findTool(id) {
  const t = PLATFORMS.find((p) => p.id === id);
  if (!t) {
    throw new Error(`Unsupported or unknown tool "${id}". Supported: ${SUPPORTED_IDS.join(', ')}.`);
  }
  return t;
}

async function runInit() {
  const { mkdir, writeFile } = await import('node:fs/promises');
  const platformFiles = PLATFORM_FILES.map((n) => PLATFORM_FILE(n));

  for (const source of SOURCES) {
    const dirs = [sharedDir(source), ...PLATFORMS.map((p) => toolDir(source, p.id))];
    for (const d of dirs) await mkdir(d, { recursive: true });

    await writeFile(
      join(sharedDir(source), PLATFORM_FILE('cross_platform_shared')),
      `# Aek shared prompt (cross-platform)\n\nShared cross-platform instructions.\n`,
      'utf8'
    );
    for (const pf of platformFiles) {
      if (pf === PLATFORM_FILE('cross_platform_shared')) continue;
      await writeFile(
        join(sharedDir(source), pf),
        `# Aek shared prompt (${pf.replace(/\.md$/, '')})\n\nShared instructions for this platform.\n`,
        'utf8'
      );
    }
    for (const p of PLATFORMS) {
      for (const pf of platformFiles) {
        if (pf === PLATFORM_FILE('cross_platform_shared')) {
          await writeFile(
            join(toolDir(source, p.id), pf),
            `# ${p.name} prompt (cross-platform)\n\nTool-specific instructions for ${p.name}.\n`,
            'utf8'
          );
        } else {
          await writeFile(
            join(toolDir(source, p.id), pf),
            `# ${p.name} prompt (${pf.replace(/\.md$/, '')})\n\nTool-specific instructions for ${p.name} on this platform.\n`,
            'utf8'
          );
        }
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

async function runPatch(args) {
  const tool = args[0] || 'all';
  const targetTools = tool === 'all' ? PLATFORMS : [findTool(tool)];
  let failed = 0;
  for (const t of targetTools) {
    try {
      const r = await patch(t);
      const verb = r.replaced ? 'updated' : 'patched';
      console.log(`[${CMD}] ${t.id}: ${verb} (${r.source}) -> ${r.target}`);
      if (r.writes && r.writes.length > 1) {
        console.log(`[${CMD}]   dual-write: ${r.writes.map((w) => w.path).join('  &  ')}`);
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
      if (r.writes && r.writes.length > 1) {
        console.log(`[${CMD}]   dual-write: ${r.writes.map((w) => w.path).join('  &  ')}`);
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
      console.log(`[${CMD}] ${p.id}: ${state.status}  ${state.target}`);
    }
    return;
  }
  const t = findTool(tool);
  const state = await toolState(t);
  console.log(`[${CMD}] ${t.id}: ${state.status}  ${state.target}`);
}

async function toolState(p) {
  const target = p.globalPromptPath(p.id);
  try {
    const { readFile } = await import('node:fs/promises');
    const content = await readFile(target, 'utf8');
    const patched = content.includes('<!-- head-aek-gpm -->');
    return { status: patched ? 'patched' : 'not-patched', target };
  } catch {
    return { status: 'file-missing', target };
  }
}

function printUsage() {
  const supported = SUPPORTED_IDS.join(', ');
  const platformList = PLATFORM_FILES.map((n) => PLATFORM_FILE(n)).join(', ');
  console.log(`[${CMD}] Manage platform-specific global prompt fragments across two sources.

Commands:
  init            Create source dirs with empty platform files for both sources
  patch <tool>    Inject global-prompt-mapping fragments into one tool's global prompt
  patch all       Inject into every supported tool
  apply <tool>    Append only-patch fragments to one tool's global prompt
  apply all       Append into every supported tool
  remove <tool>   Remove the managed block from one tool's global prompt
  remove all      Remove from every supported tool
  status <tool>   Show whether a tool's global prompt file is patched

Options:
  -h, --help      Show this help

Supported tools (${supported}):
${PLATFORMS.map((p) => `  ${p.id.padEnd(14)} ${p.globalPromptLabel(p.id)}`).join('\n')}

Two sources (~/.aek/prompt-manager/):
  global-prompt-mapping/   "patch" source   (managed block replaced in place)
  only-patch/              "apply" source   (appended to end; replaces block on repeat)

Layout inside each source:
  all_agents_shared/           shared across every tool
  <tool_dir>/                  per-tool  (dir name: tool id, hyphens -> underscores)
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