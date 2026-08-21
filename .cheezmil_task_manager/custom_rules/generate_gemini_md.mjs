#!/usr/bin/env node
import { execSync } from 'child_process';

console.log('Executing: ctm generate-gemini-md');
try {
  execSync('ctm generate-gemini-md', { stdio: 'inherit' });
  console.log('Successfully generated project GEMINI.md.');
} catch (error) {
  console.error('Failed to generate project GEMINI.md:', error.message);
}
