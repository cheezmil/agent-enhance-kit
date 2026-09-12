/**
 * Shared constants used across explore, synthesize, and pipeline modules.
 */

/** Default daemon port for HTTP/WebSocket communication with browser extension */
export const DEFAULT_DAEMON_PORT = 19825;

export function unsupportedDaemonPortEnvMessage(value?: string): string {
  const suffix = value ? ` (received ${value})` : '';
  return `AEKB_DAEMON_PORT is no longer supported${suffix}. ` +
    `The AEK Browser Chrome extension can only connect to localhost:${DEFAULT_DAEMON_PORT}. ` +
    'Unset AEKB_DAEMON_PORT and rerun.aekb.';
}

/**
 * True when AEKB_DAEMON_PORT carries no real configuration: unset, empty,
 * or equal to the default port. Launchers (notably AEK BrowserApp) inject the
 * variable with the default value into every CLI they manage — rejecting that
 * harmless redundancy bricked all commands on fresh installs (#2068). Only a
 * NON-default value is a genuine misconfiguration worth failing on.
 */
export function isIgnorableDaemonPortEnv(value: string | undefined): boolean {
  if (value === undefined) return true;
  const trimmed = value.trim();
  if (!trimmed) return true;
  return Number(trimmed) === DEFAULT_DAEMON_PORT;
}
