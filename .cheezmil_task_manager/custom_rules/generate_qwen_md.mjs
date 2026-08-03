#!/usr/bin/env node
import { execSync } from 'child_process';

console.log('Executing: ctm generate-qwen-md');
try {
  execSync('ctm generate-qwen-md', { stdio: 'inherit' });
  console.log('Successfully generated project QWEN.md.');
} catch (error) {
  console.error('Failed to generate project QWEN.md:', error.message);
}
