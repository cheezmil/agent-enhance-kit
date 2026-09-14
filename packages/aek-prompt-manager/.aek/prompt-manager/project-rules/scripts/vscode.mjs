#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

execFileSync('aekpm', ['pr', 'gen', 'vscode'], { stdio: 'inherit' });
