#!/usr/bin/env node
import { setWindowsNodePath } from './_win-bootstrap.mjs';
setWindowsNodePath();
import('../src/cli.js');
