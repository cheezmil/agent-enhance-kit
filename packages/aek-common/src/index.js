// aek-common — 各包共用代码（工具函数、类型、常量）
// 目前主要为总入口 CLI 与后续公共逻辑预留

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

export const NAME = 'aek-common';

/** 子包短名 → npm scoped 包名（发布形态） */
export const SCOPED_NAME = '@cheezmil/aek-common';

// ---------- 跨平台工具 ----------

/**
 * 判断当前是否运行在 WSL（Windows Subsystem for Linux）内。
 * 双保险：只有 Linux 平台才可能处于 WSL；Windows/macOS 直接 false，
 * 避免某些 Windows 环境存在 /proc 映射（如 WSL 工具）导致误判。
 */
export function isWSL() {
  if (process.platform !== 'linux') return false;
  try {
    if (!existsSync('/proc/version')) return false;
    return readFileSync('/proc/version', 'utf8').toLowerCase().includes('microsoft');
  } catch {
    return false;
  }
}

// 用户偏好：禁止带 -NoProfile 参数，所以这里显式不带。
const PWSH_CANDIDATES = [
  '/mnt/c/Program Files/PowerShell/7/pwsh.exe',
  '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',
];

/**
 * 把 Windows 原生路径（如 C:\Users\xdx）转成 WSL 侧可访问的路径（如 /mnt/c/Users/xdx）。
 * 仅处理盘符反斜杠路径；不匹配时返回 null。
 */
export function winProfileToWsl(winPath) {
  if (typeof winPath !== 'string') return null;
  const m = winPath.match(/^([A-Za-z]):\\(.*)$/);
  if (!m) return null;
  const drive = m[1].toLowerCase();
  const rest = m[2].replace(/\\/g, '/');
  return `/mnt/${drive}/${rest}`;
}

let cachedWinRoot = null;
let resolvedWinRoot = false;

/**
 * 获取 Windows 原生用户 profile 在 WSL 侧可访问的根路径（如 /mnt/c/Users/xdx）。
 *
 * 用户拍板的两条约束：
 *   1. 用 /mnt/c/Users/<user> 直写（简单，依赖 /mnt/c 挂载）
 *   2. 用 pwsh 动态确认 %USERPROFILE%，而非直接取 $USER（用户名可能不同）
 *
 * 返回 null 表示：不处于 WSL，或拿不到 / 找不到 Windows 原生 profile（调用方应跳过双写）。
 * 支持环境变量 AEK_WIN_ROOT 强制覆盖（测试 / 调试用），该分支不缓存、每次读取。
 */
export function getWindowsNativeRoot() {
  if (!isWSL()) return null;
  const forced = process.env.AEK_WIN_ROOT;
  if (forced) return forced;
  if (resolvedWinRoot) return cachedWinRoot;
  resolvedWinRoot = true;
  cachedWinRoot = resolveWindowsNativeRoot();
  return cachedWinRoot;
}

function resolveWindowsNativeRoot() {
  // 1) 优先用 pwsh 动态读取 %USERPROFILE% 并转成 /mnt/ 路径。
  for (const pwsh of PWSH_CANDIDATES) {
    if (!existsSync(pwsh)) continue;
    try {
      const out = execFileSync(
        pwsh,
        ['-Command', '[Console]::OutputEncoding=[Text.Encoding]::UTF8; Write-Output $env:USERPROFILE'],
        { encoding: 'utf8', timeout: 15000, windowsHide: true },
      ).replace(/^\uFEFF/, '').trim();
      if (!out) continue;
      const wsl = winProfileToWsl(out);
      if (wsl && existsSync(wsl)) return wsl;
    } catch {
      // 该 pwsh 不可用，尝试下一个候选。
    }
  }

  // 2) 兜底：用当前用户名拼 /mnt/c/Users/<user>，仅当目录真实存在才采用。
  const user = process.env.USERNAME?.trim() || process.env.USER?.trim();
  if (user) {
    const fallback = `/mnt/c/Users/${user}`;
    if (existsSync(fallback)) return fallback;
  }

  return null;
}

export default { NAME, SCOPED_NAME };
