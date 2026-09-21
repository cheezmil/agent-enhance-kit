#!/usr/bin/env node
// aek — AEK 元包主入口（跨平台双向同步版）
//
// 二进制缓存：
//   - WSL/Linux 侧：~/.aek/windows-bin/   （存 Windows .exe 缓存）
//   - Windows 侧：  C:\Users\<user>\.aek\windows-bin\ （存从 WSL 同步过来的 .exe）
//
// 同步方向：
//   - WSL → Windows：bash cp 写入 /mnt/c/Users/<user>/.aek/windows-bin/
//   - Windows → WSL：pwsh 通过 UNC \\wsl.localhost\<distro>\ 写入 ~/.aek/windows-bin/

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { chdir } from 'node:process';
import path from 'node:path';
import os from 'node:os';

// ─── WSL UNC 路径修复 ────────────────────────────────────────────────────────
// 当从 WSL 调用 Windows PowerShell 时，process.cwd() 返回 UNC 路径
// （如 \\\\wsl.localhost\\Ubuntu\\home\\xdx\\...），导致 Node.js 模块解析失败
// 必须在 createRequire 之前执行，否则 require.resolve 会使用错误的 cwd
function fixWslCwd() {
  const cwd = process.cwd();
  if (cwd.startsWith('\\\\wsl.localhost\\') || cwd.startsWith('//wsl.localhost/')) {
    try {
      chdir('C:\\');
    } catch (_) {
      // 忽略错误
    }
  }
}
fixWslCwd();

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

// ─── 路径常量 ────────────────────────────────────────────────────────────────

const AEK_DIR       = path.join(os.homedir(), '.aek');
const WINDOWS_BIN   = path.join(AEK_DIR, 'windows-bin');
const MONOREPO_ROOT = path.resolve(__dirname, '..', '..', '..');

const BINS = ['aek', 'aek-websearch', 'aek-mcp', 'aek-task-manager', 'aekb'];

// ─── 环境检测 ────────────────────────────────────────────────────────────────

function getEnv() {
  if (process.platform === 'win32') return 'windows';
  const dist = process.env.WSL_DISTRO_NAME || '';
  let hasMicrosoft = false;
  try { hasMicrosoft = readFileSync('/proc/version', 'utf8').toLowerCase().includes('microsoft'); } catch (_) {}
  if (dist || hasMicrosoft) return 'wsl';
  return 'linux';
}

function getWslDistro()    { return process.env.WSL_DISTRO_NAME || ''; }
function getWindowsUser() {
  if (process.platform === 'win32') return process.env.USERNAME || process.env.USER || 'xdx';
  return process.env.USER || 'xdx';
}
function getWindowsPwsh() {
  for (const p of ['/mnt/c/Program Files/PowerShell/7/pwsh.exe',
                   '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe']) {
    if (existsSync(p)) return p;
  }
  return null;
}
// Windows 侧 ~/.aek/windows-bin/ 的绝对路径（Windows 视角）
function winAekBinDir() { return `C:\\\\Users\\\\${getWindowsUser()}\\\\.aek\\\\windows-bin`; }
// WSL 侧 /mnt/c/Users/<user>/.aek/windows-bin/（WSL 视角）
function wslWinAekBinDir() { return `/mnt/c/Users/${getWindowsUser()}/.aek/windows-bin`; }

// ─── WSL → Windows：bash cp 写入 /mnt/c/Users/<user>/.aek/windows-bin/ ───────

function syncWSLToWindows() {
  const dist = getWslDistro();
  if (!dist) return;

  const dst = wslWinAekBinDir();
  mkdirSync(dst, { recursive: true });

  const cached = existsSync(WINDOWS_BIN)
    ? readdirSync(WINDOWS_BIN).filter(f => f.endsWith('.exe'))
    : [];
  if (cached.length === 0) return;

  let changed = false;
  for (const exe of cached) {
    const src = path.join(WINDOWS_BIN, exe);
    const dstPath = path.join(dst, exe);
    if (needsUpdate(src, dstPath)) {
      const r = spawnSync('cp', ['-f', src, dstPath], { encoding: 'utf8' });
      if (r.status === 0) { console.log(`[AEK] 已同步: ${exe} -> ${dst}`); changed = true; }
      else console.error(`[AEK] 同步失败 ${exe}: ${r.stderr || '未知错误'}`);
    }
  }
  if (changed) console.log('[AEK] WSL → Windows 同步完成');
}

// ─── Windows → WSL：pwsh + UNC ───────────────────────────────────────────────

function syncWindowsToWSL() {
  const dist = getWslDistro();
  if (!dist) return;

  const pwsh = getWindowsPwsh();
  if (!pwsh) { console.error('[AEK] 未找到 PowerShell，跳过同步'); return; }

  const psScript = `
$ErrorActionPreference = 'Continue'
$winBin  = '${winAekBinDir().replace(/\\/g, '\\\\')}'.Replace('\\', '\\\\')
$wslBin  = '\\\\\\\\wsl.localhost\\\\${dist}${AEK_DIR.replace(/\\/g, '\\\\')}\\\\windows-bin'

Write-Host "[AEK] Windows → WSL 同步..."

if (-not (Test-Path $winBin)) { New-Item -ItemType Directory -Path $winBin -Force | Out-Null }
if (-not (Test-Path $wslBin)) { Write-Host "[AEK] WSL 缓存不存在，跳过"; exit 0 }

$exes = Get-ChildItem $wslBin -Filter '*.exe' | Select-Object -ExpandProperty Name
foreach ($exe in $exes) {
  $src = Join-Path $wslBin $exe
  $dst = Join-Path $winBin $exe
  if (-not (Test-Path $dst) -or ((Get-Item $src).LastWriteTime -ne (Get-Item $dst).LastWriteTime)) {
    Copy-Item $src $dst -Force
    Write-Host "  [OK] $exe"
  }
}
Write-Host "[AEK] Windows → WSL 同步完成"
`;

  const r = spawnSync(pwsh, ['-NoProfile', '-Command', psScript],
    { stdio: 'inherit', encoding: 'utf8', timeout: 30000 });
  if (r.status !== 0) console.error('[AEK] Windows → WSL 同步失败');
}

function needsUpdate(src, dst) {
  try {
    const s = statSync(src), d = statSync(dst);
    return s.mtimeMs !== d.mtimeMs || s.size !== d.size;
  } catch { return true; }
}

// ─── 分发逻辑 ────────────────────────────────────────────────────────────────

function findSubBin(subDir, binRel) {
  // 兼容两种布局：
  //   - monorepo:  __dirname/../<subDir>/bin/<rel>   (aek/bin → ../aek-websearch/bin)
  //   - 全局安装:  __dirname/../../<subDir>/bin/<rel> (aek/bin → ../../aek-websearch/bin)
  const rel1 = path.resolve(__dirname, '..', subDir, binRel);
  const rel2 = path.resolve(__dirname, '..', '..', subDir, binRel);
  if (existsSync(rel1)) return rel1;
  if (existsSync(rel2)) return rel2;
  return null;
}
function missingTip(subPkg, hintCmd) {
  console.error(`[aek] 未安装 ${subPkg}，请执行：npm install -g ${hintCmd}`);
  process.exit(1);
}
function execTool(command, cmdArgs) {
  const result = spawnSync(command, cmdArgs, { stdio: 'inherit' });
  if (result.status !== null) process.exitCode = result.status;
}

function runSkillManager(r)     { const b = findSubBin('aek-skill-manager', 'bin/aek-skill-manager.js'); if (!b) return missingTip('@cheezmil/aek-skill-manager', '@cheezmil/aek-skill-manager'); execTool('node', [b, ...r]); }
function runWebsearch(r)        { const b = findSubBin('aek-websearch',     'bin/aek-websearch.js');     if (!b) return missingTip('@cheezmil/aek-websearch',     '@cheezmil/aek-websearch');     execTool('node', [b, ...r]); }
function runMcp(r)              { const b = findSubBin('aek-mcp',           'bin/aek-mcp.js');           if (!b) return missingTip('@cheezmil/aek-mcp',           '@cheezmil/aek-mcp');           execTool('node', [b, ...r]); }
function runTaskManager(r)      { const b = findSubBin('aek-task-manager',  'bin/aek-tm.js');            if (!b) return missingTip('@cheezmil/aek-task-manager',  '@cheezmil/aek-task-manager');  execTool('node', [b, ...r]); }
function runBrowser(r)         { const b = findSubBin('aek-browser',  'dist/src/main.js');     if (!b) return missingTip('@cheezmil/aek-browser', '@cheezmil/aek-browser');      execTool('node', [b, ...r]); }
function runPromptManager(r)    { const b = findSubBin('aek-prompt-manager','bin/aek-prompt-manager.js'); if (!b) return missingTip('@cheezmil/aek-prompt-manager','@cheezmil/aek-prompt-manager');execTool('node', [b, ...r]); }

function dispatchCommand(cmd, rest) {
  const t = {
    'ws':'websearch','websearch':'websearch','web':'websearch',
    'mcp':'mcp',
    'task':'task-manager','tm':'task-manager','task-manager':'task-manager',
    'pm':'prompt-manager','gpm':'prompt-manager','pgm':'prompt-manager','prompt-manager':'prompt-manager',
    'b':'browser','browser':'browser','aekb':'browser',
    'help':'help','h':'help',
  };
  const target = t[cmd];
  if (!target) { runWebsearch([cmd, ...rest]); return; }
  switch (target) {
    case 'skill-manager':  runSkillManager(rest); break;
    case 'websearch':      runWebsearch(['websearch', ...rest]); break;
    case 'mcp':            runMcp(rest); break;
    case 'task-manager':   runTaskManager(rest); break;
    case 'prompt-manager': runPromptManager(rest); break;
    case 'browser':        runBrowser(rest); break;
  }
}

// ─── 主入口 ──────────────────────────────────────────────────────────────────

function main() {
  const env = getEnv(), dist = getWslDistro();

  if (env === 'wsl' && dist) {
    syncWSLToWindows();
    console.log('');
  } else if (env === 'windows') {
    syncWindowsToWSL();
    console.log('');
  }

  if (args.length === 0) {
    console.log(`Usage: aek <command> [options]

Available commands:
  aeksm                              Sync Agent Skills from central repo to agent tools
  ws, websearch, web                 Web search and content tools (multi-provider)
  mcp                                MCP proxy gateway
  task, tm                           Task management (experimental)
  pm, gpm, pgm, prompt-manager       Global prompt patch manager
  b, browser                         Browser automation (Chrome bridge + site adapters)
`);
    return;
  }

  // 处理 help 命令
  if (args[0] === 'help' || args[0] === '--help' || args[0] === '-h') {
    console.log(`Usage: aek <command> [options]

Available commands:
  aeksm                              Sync Agent Skills from central repo to agent tools
  ws, websearch, web                 Web search and content tools (multi-provider)
  mcp                                MCP proxy gateway
  task, tm                           Task management (experimental)
  pm, gpm, pgm, prompt-manager       Global prompt patch manager
  b, browser                         Browser automation (Chrome bridge + site adapters)

Use "aek [command] --help" for more information about a command.`);
    return;
  }

  // 处理 version 命令
  if (args[0] === 'version' || args[0] === '--version' || args[0] === '-v') {
    const pkgPath = path.join(__dirname, '..', 'package.json');
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      console.log(`aek, version ${pkg.version}`);
    } catch {
      console.log('aek, version unknown');
    }
    return;
  }

  dispatchCommand(args[0], args.slice(1));
}

main();
