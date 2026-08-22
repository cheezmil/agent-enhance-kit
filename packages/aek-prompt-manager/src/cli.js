// aek-prompt-manager — CLI
import process from 'node:process';

import { PLATFORMS, SUPPORTED_IDS } from './platforms.js';
import {
  AEEK_DIR,
  aekDir,
  sharedDir,
  toolPatchPath,
  sharedPatchPath,
  patch,
  unpatch,
  isWSL,
} from './core.js';

const CMD = 'aek gpm';

async function main() {
  try {
    const args = process.argv.slice(2);
    const { command, commandArgs, help } = parseArgs(args);
    if (help) { printUsage(); return; }

    if (command === 'init') {
      await runInit();
    } else if (command === 'patch') {
      await runPatch(commandArgs);
    } else if (command === 'remove') {
      await runRemove(commandArgs);
    } else if (command === 'status') {
      await runStatus(commandArgs);
    } else if (command === null && commandArgs.length === 0) {
      printUsage();
    } else {
      printUsage();
      process.exitCode = 1;
    }
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
    else if (command === null && ['init', 'patch', 'remove', 'status'].includes(arg)) command = arg;
    else commandArgs.push(arg);
  }
  return { command, commandArgs, help };
}

function findTool(id) {
  const t = PLATFORMS.find((p) => p.id === id);
  if (!t) {
    const supported = SUPPORTED_IDS.join(', ');
    throw new Error(`Unsupported or unknown tool "${id}". Supported: ${supported}.`);
  }
  return t;
}

async function runInit() {
  const { mkdir, writeFile } = await import('node:fs/promises');
  const { dirname } = await import('node:path');

  const dirs = [sharedDir(), ...PLATFORMS.map((p) => dirname(toolPatchPath(p.id)))];
  for (const d of dirs) await mkdir(d, { recursive: true });

  const sharedContent = `# Aek Global Prompt (shared)

Instructions here apply to all supported agent tools.
`;
  await writeFile(sharedPatchPath(), sharedContent, 'utf8');

  for (const p of PLATFORMS) {
    await writeFile(toolPatchPath(p.id), `# Aek Global Prompt (${p.id})

Tool-specific instructions for ${p.name}.
`, 'utf8');
  }
  console.log(`[${CMD}] Initialized at ${AEEK_DIR}/`);
  console.log(`[${CMD}] Created shared: ${sharedPatchPath()}`);
  for (const p of PLATFORMS) {
    console.log(`[${CMD}] Created      : ${toolPatchPath(p.id)}`);
  }
}

async function runPatch(args) {
  const tool = args[0] || 'all';
  if (tool === 'all') {
    let failed = 0;
    for (const p of PLATFORMS) {
      try {
        const r = await patch(p);
        const verb = r.replaced ? 'updated' : 'patched';
        console.log(`[${CMD}] ${p.id}: ${verb} → ${r.target}`);
        if (r.writes && r.writes.length > 1) {
          console.log(`[${CMD}]   dual-write: ${r.writes.map((w) => w.path).join('  &  ')}`);
        }
      } catch (e) {
        console.error(`[${CMD}] ${p.id}: ${e.message}`);
        failed += 1;
      }
    }
    if (failed) process.exitCode = 1;
    return;
  }
  const t = findTool(tool);
  const r = await patch(t);
  const verb = r.replaced ? 'updated' : 'patched';
  console.log(`[${CMD}] ${t.id}: ${verb} → ${r.target}`);
  if (r.writes && r.writes.length > 1) {
    console.log(`[${CMD}]   dual-write: ${r.writes.map((w) => w.path).join('  &  ')}`);
  }
}

async function runRemove(args) {
  const tool = args[0] || 'all';
  if (tool === 'all') {
    for (const p of PLATFORMS) {
      const r = await unpatch(p);
      console.log(`[${CMD}] ${p.id}: ${r.removed ? 'removed' : 'not present'} at ${r.target}`);
    }
    return;
  }
  const t = findTool(tool);
  const r = await unpatch(t);
  console.log(`[${CMD}] ${t.id}: ${r.removed ? 'removed' : 'not present'} at ${r.target}`);
}

async function runStatus(args) {
  const { readFile } = await import('node:fs/promises');
  const tool = args[0] || 'all';
  if (tool === 'all') {
    console.log(`[${CMD}] WSL: ${isWSL() ? 'yes' : 'no'}`);
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
  console.log(`[${CMD}] Patch managed instructions into each tool's global prompt file.

Commands:
  init            Create patch source dirs and empty patch.md templates
  patch <tool>    Inject the managed block into one tool's global prompt file
  patch all       Inject into every supported tool
  remove <tool>   Remove the managed block from one tool's global prompt file
  remove all      Remove from every supported tool
  status <tool>   Show whether a tool's global prompt file is patched
  status all      Show status for every supported tool

Options:
  -h, --help      Show this help

Supported tools (${supported}):
${PLATFORMS.map((p) => `  ${p.id.padEnd(14)} ${p.globalPromptLabel(p.id)}`).join('\n')}

Dual-write (WSL↔Windows):
  When running inside WSL, each Linux target is also mirrored to its
  Windows UNC path (\\\\wsl.localhost\\<distro>\\home\\<user>\\...) so tools
  launched from either side see the same managed block.

Patch sources (edit these, then run 'patch'):
  ~/.aek/global-prompt-manager/patch/all-agents-share/patch.md   (shared, always first)
  ~/.aek/global-prompt-manager/patch/<tool>/patch.md             (tool-specific)
`);
}

main();