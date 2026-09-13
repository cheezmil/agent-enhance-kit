/**
 * Central definition of the aekb user-data directory.
 *
 * Everything that used to live directly under `~/.aek/browser/system/` now lives under
 * `~/.aek/browser/system/` so the whole aek family (mcp / prompt-manager /
 * skill-manager / websearch / browser) shares a single `~/.aek/` root.
 *
 * Env overrides (unchanged semantics, unchanged names):
 *   - AEKB_CONFIG_DIR: replaces the whole user-data root
 *   - AEKB_CACHE_DIR:  replaces only the `cache/` sub-directory
 */

import os from 'node:os';
import path from 'node:path';

/** Default user-data root: ~/.aek/browser/system */
export function getAekbHome(home: string = os.homedir()): string {
  return path.join(home, '.aek', 'browser', 'system');
}

/** Effective user-data root, honouring AEKB_CONFIG_DIR. */
export function getAekbConfigDir(home: string = os.homedir()): string {
  return process.env.AEKB_CONFIG_DIR || getAekbHome(home);
}

/** Effective cache dir, honouring AEKB_CACHE_DIR. */
export function getAekbCacheDir(home: string = os.homedir()): string {
  return process.env.AEKB_CACHE_DIR || path.join(getAekbHome(home), 'cache');
}
