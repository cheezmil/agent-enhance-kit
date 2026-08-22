// aek-global-prompt-manager — core
// Inject a nested managed block into a platform's global prompt file.
//
// Managed block structure (injected / appended):
//
//   <!-- head-aek-gpm -->
//   <!-- head-aek-gpm-shared -->
//   <all-agents-share content>
//   <!-- end-aek-gpm-shared -->
//
//   <!-- head-aek-gpm-<tool> -->
//   <tool-specific content>
//   <!-- end-aek-gpm-<tool> -->
//   <!-- end-aek-gpm -->
//
// WSL↔Windows dual-write: when running inside WSL, a Linux target
// (e.g. ~/.codex/AGENTS.md) corresponds to an equivalent Windows UNC path
// (\\wsl.localhost\<distro>\home\<user>\.codex\AGENTS.md). We write both ends
// so the tool picks up the change regardless of which side launched it.
//
// If an existing managed block is found (head-aek-gpm ... end-aek-gpm) it is
// replaced in place, preserving the file's user-written content around it.
// Otherwise the block is appended at the end.

import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';

export const HEAD = '<!-- head-aek-gpm -->';
export const HEAD_SHARED = '<!-- head-aek-gpm-shared -->';
export const END_SHARED = '<!-- end-aek-gpm-shared -->';
export const END = '<!-- end-aek-gpm -->';

export const AEEK_DIR = join(process.env.HOME || '', '.aek', 'global-prompt-manager');
export const PATCH_DIR = join(AEEK_DIR, 'patch');
export const SHARED_DIR = join(PATCH_DIR, 'all-agents-share');
export const PATCH_FILENAME = 'patch.md';

function headTool(toolId) {
  return `<!-- head-aek-gpm-${toolId} -->`;
}
function endTool(toolId) {
  return `<!-- end-aek-gpm-${toolId} -->`;
}

export function toolPatchPath(toolId) {
  return join(PATCH_DIR, toolId, 'patch.md');
}
export function sharedPatchPath() {
  return join(SHARED_DIR, 'patch.md');
}

export function buildBlock(toolId, sharedContent = '', toolContent = '') {
  const sharedPart = sharedContent
    ? `${HEAD_SHARED}\n${sharedContent.trimEnd()}\n${END_SHARED}`
    : '';
  const toolPart = toolContent
    ? `${headTool(toolId)}\n${toolContent.trimEnd()}\n${endTool(toolId)}`
    : '';
  const inner = [sharedPart, toolPart].filter(Boolean).join('\n\n');
  return `${HEAD}\n${inner}\n${END}`;
}

function findBlockEnd(text, start) {
  const idx = text.indexOf(END, start);
  return idx === -1 ? -1 : idx + END.length;
}

export function mergeBlock(fileContent, toolId, sharedContent, toolContent) {
  const block = buildBlock(toolId, sharedContent, toolContent);
  const headIdx = fileContent.indexOf(HEAD);
  if (headIdx === -1) {
    const suffix = fileContent.length > 0 ? '\n\n' + block : block;
    return { content: fileContent + suffix, replaced: false };
  }
  const endIdx = findBlockEnd(fileContent, headIdx);
  if (endIdx === -1) {
    throw new Error('Malformed managed block: head-aek-gpm found without matching end-aek-gpm.');
  }
  return { content: fileContent.slice(0, headIdx) + block + fileContent.slice(endIdx), replaced: true };
}

async function readMaybe(filePath) {
  try {
    await access(filePath);
  } catch {
    return '';
  }
  return readFile(filePath, 'utf8');
}

// WSL↔Windows dual-write helpers.
export function isWSL() {
  try {
    if (!existsSync('/proc/version')) return false;
    return readFileSync('/proc/version', 'utf8').toLowerCase().includes('microsoft');
  } catch {
    return false;
  }
}

const DEFAULT_WSL_DISTRO = 'Ubuntu-22.04';
const WSL_QUERY_TIMEOUT_MS = 4000;
let cachedWslHomeWin = null;
let hasResolvedWslHomeWin = false;

function tryResolveWslHomeViaCommand(commandArgs) {
  const result = spawnSync('wsl', commandArgs, {
    encoding: 'utf8',
    timeout: WSL_QUERY_TIMEOUT_MS,
  });
  if (result.status !== 0) return null;
  return result.stdout.trim() || null;
}

export function getWslHomeWin() {
  if (hasResolvedWslHomeWin) return cachedWslHomeWin;
  hasResolvedWslHomeWin = true;

  const username = process.env.USERNAME?.trim() || process.env.USER?.trim();
  if (username) {
    const distro = process.env.ASG_WSL_DISTRO?.trim() || DEFAULT_WSL_DISTRO;
    cachedWslHomeWin = `\\\\wsl.localhost\\${distro}\\home\\${username}`;
    return cachedWslHomeWin;
  }

  try {
    const direct = tryResolveWslHomeViaCommand(['wslpath', '-w', '~']);
    if (direct) { cachedWslHomeWin = direct; return direct; }
    const linuxHome = tryResolveWslHomeViaCommand(['bash', '-lc', 'printf %s "$HOME"']);
    if (linuxHome) {
      const converted = tryResolveWslHomeViaCommand(['wslpath', '-w', linuxHome]);
      if (converted) { cachedWslHomeWin = converted; return converted; }
    }
  } catch {
    // ignore
  }
  return cachedWslHomeWin;
}

function mapLinuxHomeToWin(rel) {
  const winHome = getWslHomeWin();
  if (!winHome) return '';
  if (!rel) return winHome;
  return winHome + '\\' + rel.replace(/^\//, '');
}

export function linuxToWinPath(linuxPath) {
  if (!isWSL()) return '';
  const home = process.env.HOME || '';
  if (!linuxPath.startsWith(home)) return '';
  const rel = linuxPath.slice(home.length).replace(/^\//, '');
  return mapLinuxHomeToWin(rel);
}

function writeOne(filePath, content) {
  return mkdir(dirname(filePath), { recursive: true }).then(() => writeFile(filePath, content, 'utf8'));
}

// In WSL the Linux path and the Windows UNC path are the SAME file (same
// inode). Writing the Linux path is sufficient; we never mkdir/write a UNC
// path from Linux (it would be misread as a relative path with backslashes).
async function writeDual(linuxPath, content, winPath) {
  const writes = [{ path: linuxPath }];
  if (winPath) writes.push({ path: winPath });
  await writeOne(linuxPath, content);
  return writes;
}

export async function patch(tool, force = false) {
  const toolId = tool.id;
  const target = tool.globalPromptPath(toolId);
  if (!target) {
    throw new Error(`Platform "${toolId}" has no global prompt path.`);
  }

  const sharedContent = await readMaybe(sharedPatchPath());
  const toolContent = await readMaybe(toolPatchPath(toolId));

  if (!force && !sharedContent.trim() && !toolContent.trim()) {
    throw new Error(
      `Nothing to patch: both ${sharedPatchPath()} and ` +
        `${toolPatchPath(toolId)} are empty/missing.`,
    );
  }

  const fileContent = (await readMaybe(target)) || '';
  const { content, replaced } = mergeBlock(fileContent, toolId, sharedContent, toolContent);

  const winPath = linuxToWinPath(target);
  const writes = await writeDual(target, content, winPath);

  return {
    toolId,
    target,
    replaced,
    writes,
    shared: !!sharedContent.trim(),
    tool: !!toolContent.trim(),
  };
}

export async function unpatch(tool) {
  const target = tool.globalPromptPath(tool.id);
  if (!target) {
    throw new Error(`Platform "${tool.id}" has no global prompt path.`);
  }
  const fileContent = (await readMaybe(target)) || '';
  const headIdx = fileContent.indexOf(HEAD);
  if (headIdx === -1) {
    return { toolId: tool.id, target, removed: false };
  }
  const endIdx = findBlockEnd(fileContent, headIdx);
  if (endIdx === -1) {
    throw new Error('Malformed managed block: head-aek-gpm found without matching end-aek-gpm.');
  }
  const cleaned = fileContent.slice(0, headIdx).trimEnd() + fileContent.slice(endIdx).trimStart();
  const trimmed = cleaned.replace(/^\n+/, '').replace(/\n+$/, '');
  const winPath = linuxToWinPath(target);
  await writeDual(target, trimmed, winPath);
  return { toolId: tool.id, target, removed: true };
}