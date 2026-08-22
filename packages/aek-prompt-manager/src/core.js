// aek-prompt-manager — core
// Two sources of platform-specific prompt fragments, each with different
// injection semantics:
//
//   global-prompt-mapping/   "patch" mode  -> managed block is REPLACED in place
//                            on repeat runs, preserving surrounding user content.
//   only-patch/              "apply" mode  -> block is APPENDED to end of file
//                            (still replaced in place if a block already exists,
//                            so repeated applies update rather than duplicate).
//
// Source layout (both sources share the same shape):
//   <source>/
//     all_agents_shared/
//       cross_platform_shared.md / linux.md / mac.md / windows.md / wsl.md
//     <tool_dir>/          dir name = tool id, hyphens -> underscores
//       cross_platform_shared.md / linux.md / mac.md / windows.md / wsl.md
//
// Injected block (merged, in order: shared cross-platform, shared current-plat,
// tool cross-platform, tool current-plat):
//
//   <!-- head-aek-gpm -->
//   <!-- head-aek-gpm-shared -->
//     <shared cross-platform>
//     <shared current-platform>
//   <!-- end-aek-gpm-shared -->
//
//   <!-- head-aek-gpm-<tool> -->
//     <tool cross-platform>
//     <tool current-platform>
//   <!-- end-aek-gpm-<tool> -->
//   <!-- end-aek-gpm -->
//
// WSL: Linux path and Windows UNC are the same file (same inode). We write the
// Linux path; the UNC path is recorded for display only. On native Windows we
// never mkdir/write a UNC.

import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

export const HEAD = '<!-- head-aek-gpm -->';
export const HEAD_SHARED = '<!-- head-aek-gpm-shared -->';
export const END_SHARED = '<!-- end-aek-gpm-shared -->';
export const END = '<!-- end-aek-gpm -->';

export const PLATFORM_FILES = ['cross_platform_shared', 'linux', 'mac', 'windows', 'wsl'];
export const PLATFORM_FILE = (name) => `${name}.md`;

const MAPPING_SOURCE = 'global-prompt-mapping';
const ONLY_PATCH_SOURCE = 'only-patch';
export { MAPPING_SOURCE, ONLY_PATCH_SOURCE };

export function sourceRoot(source) {
  return join(process.env.HOME || '', '.aek', 'prompt-manager', source);
}
export function aekDir() {
  return join(process.env.HOME || '', '.aek', 'prompt-manager');
}
export const MAPPING_ROOT = sourceRoot(MAPPING_SOURCE);
export const ONLY_PATCH_ROOT = sourceRoot(ONLY_PATCH_SOURCE);

function toolDirName(toolId) {
  return toolId.replace(/-/g, '_');
}
export function toolDirNameFor(toolId) {
  return toolDirName(toolId);
}

export function sharedDir(source) {
  return join(sourceRoot(source), 'all_agents_shared');
}
export function toolDir(source, toolId) {
  return join(sourceRoot(source), toolDirName(toolId));
}

export function currentPlatform() {
  if (isWSL()) return 'wsl';
  if (process.platform === 'win32') return 'windows';
  if (process.platform === 'darwin') return 'mac';
  return 'linux';
}

// Merge one directory's fragments: always cross_platform_shared, then current-platform.
export async function readPlatformBundle(dir, platform) {
  const parts = [];
  const cross = await readMaybe(join(dir, PLATFORM_FILE('cross_platform_shared')));
  if (cross.trim()) parts.push(cross.trimEnd());
  if (platform !== 'cross_platform_shared') {
    const plat = await readMaybe(join(dir, PLATFORM_FILE(platform)));
    if (plat.trim()) parts.push(plat.trimEnd());
  }
  return parts.join('\n\n');
}

function headTool(toolId) {
  return `<!-- head-aek-gpm-${toolId} -->`;
}
function endTool(toolId) {
  return `<!-- end-aek-gpm-${toolId} -->`;
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

// Insert block into file content. If a managed block already exists it is
// replaced in place (replaced=true). Otherwise the block is appended after
// the current content (replaced=false). This single function serves both
// "patch" (replace) and "apply" (append) semantics: for "apply" the first
// run appends, subsequent runs replace the existing block.
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

// ---------- WSL detection & dual-write (Linux path is authoritative) ----------
export function isWSL() {
  try {
    if (!existsSync('/proc/version')) return false;
    return readFileSync('/proc/version', 'utf8').toLowerCase().includes('microsoft');
  } catch {
    return false;
  }
}

const DEFAULT_WSL_DISTRO = 'Ubuntu-22.04';
let cachedWslHomeWin = null;
let hasResolvedWslHomeWin = false;

export function getWslHomeWin() {
  if (hasResolvedWslHomeWin) return cachedWslHomeWin;
  hasResolvedWslHomeWin = true;
  const username = process.env.USERNAME?.trim() || process.env.USER?.trim();
  if (username) {
    const distro = process.env.ASG_WSL_DISTRO?.trim() || DEFAULT_WSL_DISTRO;
    cachedWslHomeWin = `\\\\wsl.localhost\\${distro}\\home\\${username}`;
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

async function writeDual(linuxPath, content, winPath) {
  const writes = [{ path: linuxPath }];
  if (winPath) writes.push({ path: winPath });
  await writeOne(linuxPath, content);
  return writes;
}

// Merge both sources' fragments for one tool at the current platform.
async function gather(source, toolId, platform) {
  const sharedContent = await readPlatformBundle(sharedDir(source), platform);
  const toolContent = await readPlatformBundle(toolDir(source, toolId), platform);
  return { sharedContent, toolContent };
}

export async function patch(tool, force = false) {
  // "patch" = global-prompt-mapping source.
  return _applyBlock(MAPPING_SOURCE, tool, force);
}

export async function apply(tool, force = false) {
  // "apply" = only-patch source (appended to end; replaces block if present).
  return _applyBlock(ONLY_PATCH_SOURCE, tool, force);
}

async function _applyBlock(source, tool, force = false) {
  const toolId = tool.id;
  const target = tool.globalPromptPath(toolId);
  if (!target) {
    throw new Error(`Platform "${toolId}" has no global prompt path.`);
  }
  const platform = currentPlatform();
  const { sharedContent, toolContent } = await gather(source, toolId, platform);

  if (!force && !sharedContent.trim() && !toolContent.trim()) {
    throw new Error(
      `Nothing to ${source} for ${toolId} at platform "${platform}": all source files empty/missing.`
    );
  }

  const fileContent = (await readMaybe(target)) || '';
  const { content, replaced } = mergeBlock(fileContent, toolId, sharedContent, toolContent);

  const winPath = linuxToWinPath(target);
  const writes = await writeDual(target, content, winPath);

  return {
    toolId,
    source,
    target,
    replaced,
    writes,
    platform,
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