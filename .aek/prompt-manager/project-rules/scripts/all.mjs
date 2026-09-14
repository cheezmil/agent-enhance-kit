#!/usr/bin/env node
/**
 * 运行 aekpm pr gen all，生成所有 agent 的提示词文件。
 * 
 * 定位逻辑：
 *   - 脚本位于: .aek/prompt-manager/project-rules/scripts/all.mjs
 *   - 项目根是脚本向上4级: scripts/ → project-rules/ → prompt-manager/ → .aek/ → 项目根
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
// __dirname = .../.aek/prompt-manager/project-rules/scripts
// 向上4级到项目根
const PROJECT_ROOT = join(__dirname, '../../../..');

console.log(`[all.mjs] 项目根: ${PROJECT_ROOT}`);

process.chdir(PROJECT_ROOT);
execFileSync('aekpm', ['pr', 'gen', 'all'], { stdio: 'inherit' });
