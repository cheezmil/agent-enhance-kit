#!/usr/bin/env node
import { execSync } from 'child_process';

console.log('Executing: ctm generate-kilocode-rules');
try {
  execSync('ctm generate-kilocode-rules', { stdio: 'inherit' });
  console.log('Successfully generated kilocode rules.');
} catch (error) {
  console.error('Failed to generate kilocode rules:', error.message);
}
