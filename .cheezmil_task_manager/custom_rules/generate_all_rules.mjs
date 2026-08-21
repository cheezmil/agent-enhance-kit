#!/usr/bin/env node
import { execSync } from 'child_process';
// 每次ctm gen，就必须附带执行这个命令。
console.log('Executing: ctm generate-all-rules');
try {
  execSync('ctm generate-all-rules', { stdio: 'inherit' });
  console.log('Successfully generated all AI tool rules.');
} catch (error) {
  console.error('Failed to generate all AI tool rules:', error.message);
}
