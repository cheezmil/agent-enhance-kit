#!/usr/bin/env node
import { execSync } from 'child_process';

console.log('Executing: ctm generate-claude-md');
try {
  execSync('ctm generate-claude-md', { stdio: 'inherit' });
  console.log('Successfully generated project CLAUDE.md.');
} catch (error) {
  console.error('Failed to generate project CLAUDE.md:', error.message);
}
