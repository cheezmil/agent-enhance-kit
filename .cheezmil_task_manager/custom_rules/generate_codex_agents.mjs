#!/usr/bin/env node
import { execSync } from 'child_process';

console.log('Executing: ctm generate-codex-agents');
try {
  execSync('ctm generate-codex-agents', { stdio: 'inherit' });
  console.log('Successfully generated Codex AGENTS.md.');
} catch (error) {
  console.error('Failed to generate Codex AGENTS.md:', error.message);
}
