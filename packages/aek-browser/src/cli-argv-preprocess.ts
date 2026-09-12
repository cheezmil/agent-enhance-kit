/**
 * argv preprocessing: rewrite `aekb browser <session> <subcommand> ...`
 * into `aekb browser --session <session> <subcommand> ...` so commander
 * (which can't combine a parent positional with subcommand dispatch) can parse it.
 *
 * The user-facing form is positional; the internal form uses --session. Help text
 * for the `browser` command is overridden to advertise the positional form.
 */

/**
 * Browser subcommand names. If `<session>` would collide with one of these,
 * we treat it as a missing-positional error and leave argv alone so commander
 * reports a usable diagnostic.
 *
 * Keep in sync with the subcommands declared on the `browser` command in cli.ts.
 */
const BROWSER_SUBCOMMAND_NAMES: ReadonlySet<string> = new Set([
  'analyze',
  'back',
  'bind',
  'check',
  'click',
  'close',
  'console',
  'dblclick',
  'dialog',
  'drag',
  'eval',
  'extract',
  'fill',
  'find',
  'focus',
  'frames',
  'get',
  'help',
  'hover',
  'init',
  'keys',
  'network',
  'open',
  'screenshot',
  'scroll',
  'select',
  'state',
  'tab',
  'type',
  'unbind',
  'uncheck',
  'upload',
  'verify',
  'wait',
]);

/**
 * Root program options that consume the following token as their value. Used by
 * the preprocessor to identify which token is the root command name (so e.g.
 * `aekb --profile work browser foo state` is recognised as the `browser`
 * command with `<session>=foo`, not the value of --profile).
 *
 * Keep in sync with `program.option(...)` calls in cli.ts.
 */
const ROOT_VALUE_FLAGS: ReadonlySet<string> = new Set(['--profile']);

/**
 * Top-level program command names (registered via program.command(...) in
 * cli.ts). The implicit-browser heuristic must not treat one of these as a
 * browser `<session>` token — e.g. `aekb adapter init browser/x` is the
 * `adapter` command with `init browser/x`, not a browser call, even though
 * `init` collides with a browser subcommand name.
 *
 * Keep in sync with the top-level .command() registrations in cli.ts.
 */
const ROOT_COMMAND_NAMES: ReadonlySet<string> = new Set([
  'adapter',
  'antigravity',
  'browser',
  'completion',
  'convention-audit',
  'daemon',
  'doctor',
  'external',
  'list',
  'plugin',
  'profile',
  'read',
  'skills',
  'validate',
  'verify',
]);

/**
 * Returns the set of reserved subcommand names (exposed for tests so they stay
 * synced with the actual registrations in cli.ts).
 */
export function getBrowserSubcommandNames(): ReadonlySet<string> {
  return BROWSER_SUBCOMMAND_NAMES;
}

/**
 * Rewrite `argv` to convert the positional `<session>` after `browser`
 * into the internal `--session <name>` flag form.
 *
 * Only acts when `browser` is the root command (i.e. the first non-flag token
 * after any leading root options), so it can't mis-interpret occurrences of
 * the literal word `browser` deeper in the argv (e.g. `aekb adapter init
 * browser/x`, or a URL value containing `browser`).
 *
 * Leaves argv unchanged when:
 *   - root command is not `browser`
 *   - the token after `browser` is a flag (e.g. `--help`)
 *   - the token after `browser` is a known subcommand name (session was
 *     omitted; commander will surface its own required-flag error)
 */
export function rewriteBrowserArgv(argv: readonly string[]): string[] {
  const result = [...argv];
  // Walk past leading root flags + their values to find the root command token.
  let i = 0;
  while (i < result.length) {
    const tok = result[i];
    if (!tok.startsWith('-')) break;
    // `--flag=value` consumes one slot regardless of whether the flag expects a value.
    if (tok.includes('=')) {
      i += 1;
      continue;
    }
    if (ROOT_VALUE_FLAGS.has(tok) && i + 1 < result.length) {
      i += 2;
    } else {
      i += 1;
    }
  }
  const rootCmd = result[i];
  const isBrowserExplicit = rootCmd === 'browser' || rootCmd === 'b';
  if (!isBrowserExplicit) {
    // Implicit-browser mode: no explicit `browser`/`b` keyword. If argv looks
    // like `<session> <subcommand> ...` treat the first token as `<session>` and
    // splice in `--session` so commander can parse it. Guard against
    // false-positives by requiring the next token to be a known browser subcommand
    // AND the first token not to be a top-level root command (e.g. `adapter init
    // browser/x` must stay the `adapter` command, not be read as a browser call).
    const candidateSession = result[i];
    const candidateCmd = result[i + 1];
    if (
      candidateSession &&
      !ROOT_COMMAND_NAMES.has(candidateSession) &&
      candidateCmd &&
      BROWSER_SUBCOMMAND_NAMES.has(candidateCmd)
    ) {
      // Replace the <session> positional with --session <session>, leaving the rest intact.
      result.splice(i, 1, '--session', candidateSession);
      hoistBrowserWindowOption(result, i + 2);
    }
    return result;
  }
  // `b` is an alias for `browser`. Always canonicalize to `browser` so the
  // rest of the preprocessor can treat it uniformly.
  if (rootCmd === 'b') {
    result[i] = 'browser';
  }
  const sessionIdx = i + 1;
  const next = result[sessionIdx];
  if (next === undefined) return result;
  // The retired `--session` flag must not be a working public entrance.
  if (next === '--session' || next === '--session=' || next.startsWith('--session=')) {
    throw new BrowserSessionArgvError(
      'The `--session` flag is no longer a public option. Use the positional form: `aekb <session> <command>` or `aekb browser <session> <command>`.',
    );
  }
  if (next.startsWith('-')) return result;
  if (BROWSER_SUBCOMMAND_NAMES.has(next)) return result;
  // Splice in --session <name> in place of the positional.
  result.splice(sessionIdx, 1, '--session', next);
  // `--window` is a browser namespace option, so commander accepts it before the
  // leaf command. Users naturally put it at the end:
  // `browser work open https://x.com --window background`. Hoist that public
  // form into the namespace-option slot instead of mirroring the option onto
  // every browser leaf command.
  hoistBrowserWindowOption(result, sessionIdx + 2);
  return result;
}

/**
 * Move one trailing `--window <mode>` / `--window=<mode>` from after the browser
 * subcommand to just before it. Stops at `--` so literal browser arguments are
 * untouched. Mutates `argv` in place.
 */
function hoistBrowserWindowOption(argv: string[], fromIndex: number): void {
  const subcommandIdx = argv.findIndex((tok, idx) => idx >= fromIndex && BROWSER_SUBCOMMAND_NAMES.has(tok));
  if (subcommandIdx === -1) return;

  for (let i = subcommandIdx + 1; i < argv.length; i += 1) {
    const tok = argv[i];
    if (tok === '--') return;
    if (tok.startsWith('--window=')) {
      const removed = argv.splice(i, 1);
      argv.splice(subcommandIdx, 0, ...removed);
      return;
    }
    if (tok === '--window') {
      const value = argv[i + 1];
      if (value === undefined || value === '--') return;
      const removed = argv.splice(i, 2);
      argv.splice(subcommandIdx, 0, ...removed);
      return;
    }
  }
}

/**
 * Thrown by the preprocessor when user argv uses a retired/old form that we
 * intentionally refuse to accept. main.ts catches this and exits with a
 * usage error so it does not bubble up as an internal stacktrace.
 */
export class BrowserSessionArgvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BrowserSessionArgvError';
  }
}

/**
 * Minimal manifest shape consumed by escapeLeadingDashPositional. Imported
 * lazily by main.ts so this module stays dependency-free.
 */
export interface DashPositionalManifestEntry {
  site: string;
  name: string;
  args?: Array<{ name: string; positional?: boolean; required?: boolean; valueRequired?: boolean; default?: unknown }>;
  browser?: boolean;
}

type OptionValueMode = 'none' | 'required' | 'optional';
type OptionParse = { values: string[]; nextIndex: number };

function knownCommandOptions(cmd: DashPositionalManifestEntry): Map<string, OptionValueMode> {
  const options = new Map<string, OptionValueMode>([
    ['-h', 'none'],
    ['--help', 'none'],
    ['-v', 'none'],
    ['--verbose', 'none'],
    ['-f', 'required'],
    ['--format', 'required'],
    ['--trace', 'required'],
  ]);
  if (cmd.browser) {
    options.set('--window', 'required');
    options.set('--site-session', 'required');
    options.set('--keep-tab', 'required');
  }
  for (const arg of cmd.args ?? []) {
    if (arg.positional) continue;
    // Keep in sync with commanderAdapter.ts:
    // required/valueRequired -> `<value>`; otherwise -> `[value]`.
    options.set(`--${arg.name}`, arg.required || arg.valueRequired ? 'required' : 'optional');
  }
  return options;
}

function consumeKnownOption(argv: readonly string[], index: number, options: ReadonlyMap<string, OptionValueMode>): OptionParse | null {
  const token = argv[index];
  if (!token || token === '--') return null;
  const eq = token.indexOf('=');
  const key = eq === -1 ? token : token.slice(0, eq);
  const mode = options.get(key);
  if (!mode && eq === -1 && token.startsWith('-') && !token.startsWith('--') && token.length > 2) {
    const shortKey = token.slice(0, 2);
    const shortMode = options.get(shortKey);
    if (shortMode === 'required') {
      return { values: [token], nextIndex: index + 1 };
    }
  }
  if (!mode) return null;
  if (eq !== -1 || mode === 'none') return { values: [token], nextIndex: index + 1 };
  const next = argv[index + 1];
  if (mode === 'required') {
    return next === undefined
      ? { values: [token], nextIndex: index + 1 }
      : { values: [token, next], nextIndex: index + 2 };
  }
  if (next !== undefined && !next.startsWith('-')) {
    return { values: [token, next], nextIndex: index + 2 };
  }
  return { values: [token], nextIndex: index + 1 };
}

/**
 * `aekb boss detail -abc123def` fails because commander parses
 * `-abc123def` as an unknown option rather than the required
 * `<security-id>` positional. BOSS 直聘 securityId tokens are opaque
 * strings that can legitimately start with `-` (issue #1160), and the
 * same shape can show up in any adapter that takes an opaque-id
 * positional. Insert a `--` separator so commander treats the next
 * token as the positional value.
 */
export function escapeLeadingDashPositional(
  argv: readonly string[],
  manifest: readonly DashPositionalManifestEntry[],
): string[] {
  const result = [...argv];
  const requiredFirstPositional = new Map<string, DashPositionalManifestEntry>();
  for (const cmd of manifest) {
    const first = cmd.args?.find((a) => a.positional);
    if (first?.required) requiredFirstPositional.set(cmd.site + '/' + cmd.name, cmd);
  }
  let i = 0;
  while (i < result.length) {
    const tok = result[i];
    if (!tok.startsWith('-')) break;
    if (tok.includes('=')) { i += 1; continue; }
    if (ROOT_VALUE_FLAGS.has(tok) && i + 1 < result.length) { i += 2; }
    else { i += 1; }
  }
  const site = result[i];
  const cmd = result[i + 1];
  const positionalIdx = i + 2;
  if (!site || !cmd || positionalIdx >= result.length) return result;
  const entry = requiredFirstPositional.get(site + '/' + cmd);
  if (!entry) return result;
  const options = knownCommandOptions(entry);

  const beforePositional: string[] = [];
  let j = positionalIdx;
  while (j < result.length) {
    const token = result[j];
    if (token === '--') return result;
    const consumed = consumeKnownOption(result, j, options);
    if (consumed) {
      beforePositional.push(...consumed.values);
      j = consumed.nextIndex;
      continue;
    }
    if (!token.startsWith('-')) return result;
    if (token.startsWith('--')) return result;
    break;
  }
  if (j >= result.length) return result;

  const positional = result[j];
  const trailingOptions: string[] = [];
  const trailingRest: string[] = [];
  j += 1;
  while (j < result.length) {
    const consumed = consumeKnownOption(result, j, options);
    if (consumed) {
      trailingOptions.push(...consumed.values);
      j = consumed.nextIndex;
      continue;
    }
    trailingRest.push(result[j]);
    j += 1;
  }
  return [
    ...result.slice(0, positionalIdx),
    ...beforePositional,
    ...trailingOptions,
    '--',
    positional,
    ...trailingRest,
  ];
}
