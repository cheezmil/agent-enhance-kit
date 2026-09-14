#!/usr/bin/env node
/**
 * 运行 aekpm pr gen all，生成所有 agent 的提示词文件。
 * 
 * 定位逻辑：
 *   - 使用 process.argv[1] 获取脚本绝对路径（比 __dirname 更可靠）
 *   - 脚本位于: .aek/prompt-manager/project-rules/scripts/all.mjs
 *   - 项目根是脚本向上4级: scripts/ → project-rules/ → prompt-manager/ → .aek/ → 项目根
 */
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';

// 获取脚本的绝对路径（比 __dirname 更可靠，特别是在 -e 模式下）
const scriptPath = process.argv[1];
const __dirname = dirname(scriptPath);
// __dirname = .../.aek/prompt-manager/project-rules/scripts
// 向上4级到项目根
const PROJECT_ROOT = join(__dirname, '../../../..');

console.log(`[all.mjs] 脚本路径: ${scriptPath}`);
console.log(`[all.mjs] 项目根: ${PROJECT_ROOT}`);

// 切换到项目根目录再执行 aekpm
process.chdir(PROJECT_ROOT);
execFileSync('aekpm', ['pr', 'gen', 'all'], { stdio: 'inherit' });
