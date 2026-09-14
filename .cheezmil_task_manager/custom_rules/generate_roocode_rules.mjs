#!/usr/bin/env node
import { execSync } from 'child_process';

console.log('Executing: ctm generate-roocode-rules');
try {
  execSync('ctm generate-roocode-rules', { stdio: 'inherit' });
  console.log('Successfully generated roocode rules.');
} catch (error) {
  console.error('Failed to generate roocode rules:', error.message);
}
