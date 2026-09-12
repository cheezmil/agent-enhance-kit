1|# references/usage.md
2|
3|AEK Browser turns any website, Electron desktop app, or external CLI into a uniform `aekb <site> <command>` surface that agents can drive without screen-scraping. This skill is the orientation layer — once you know what you want to do, load one of the specialized skills below.
4|
5|## The three pillars
6|
7|- **Adapter commands** — `aekb <site> <command> [...]`. Built-in adapters live in `clis/`, user adapters in `~/.aek-b/clis/`. Each is backed by a strategy (`PUBLIC | COOKIE | INTERCEPT | UI | LOCAL`) that tells you whether a Chrome session is needed.
8|- **Browser driving** — `aekb browser *` subcommands (`open`, `state`, `click`, `type`, `select`, `find`, `extract`, `network`, …) for ad-hoc interaction and scraping when no adapter covers the task. See `references/browser.md`.
9|- **Current-tab binding** — `aekb browser <session> bind` attaches the Chrome tab the user already opened/logged into to that browser session. Follow-up commands use `aekb browser <session> ...`. See `references/browser.md` before using it; bound sessions still block tab mutation.
10|- **External CLI passthrough** — `aekb gh`, `aekb docker`, `aekb vercel`, etc. Managed via `aekb external install <name>` (auto-install from `external-clis.yaml`) or `aekb external register <name>` (bring your own).
11|
12|## Install
13|
14|```bash
15|# npm global
16|npm install -g @cheezmil/aekb          # binary: aek-b, requires Node >= 21
17|aekb doctor                              # run before browser-dependent work (see below)
18|
19|# From source
20|git clone git@github.com:cheezmil/AEK Browser.git
21|cd AEK Browser && npm install
22|npx tsx src/main.ts <command>               # same surface, no global install
23|```
24|
25|`aekb doctor` prints a structured `DoctorReport` — daemon status, extension connection, version checks, and a live browser connectivity probe. Scope is narrow: it diagnoses the **browser bridge** (daemon + extension + Chrome wiring). `PUBLIC` / `LOCAL` adapters, `aekb list`, `validate`, `verify`, plugin commands, and external-CLI passthrough don't need it to be green — only `COOKIE` / `INTERCEPT` / `UI` adapters and the `aekb browser *` subcommands do. Flag: `-v` (verbose).
26|
27|## Prerequisites by command type
28|
29|| Strategy tag on `aekb list` | What it needs |
30||--------------------------------|---------------|
31|| `PUBLIC` | Nothing — pure HTTP, no browser. |
32|| `COOKIE` | Chrome logged into the target site + **AEK Browser** extension installed from the [Chrome Web Store](https://chromewebstore.google.com/detail/aek-b/ildkmabpimmkaediidaifkhjpohdnifk). Command captures the credential from your live session — no re-login. |
33|| `INTERCEPT` | Same as COOKIE, plus aekb opens an automation window to capture a signed request. |
34|| `UI` | Same as COOKIE, full DOM interaction. |
35|| `LOCAL` | No browser; talks to a local/dev endpoint. |
36|
37|Electron desktop apps (cursor, codex, chatwise, discord-app, doubao-app, antigravity, chatgpt-app) route through CDP against the running app — same cookie-less flow as a logged-in browser. Make sure the app is running before invoking.
38|
39|## Discover what's installed — don't read this file, run a command
40|
41|```bash
42|aekb list                    # table, grouped by site
43|aekb list -f json            # machine-readable; pipe to jq or your agent
44|aekb list | grep -i twitter  # find commands for a specific site
45|aekb <site> --help           # see that site's commands + flags
46|aekb <site> <command> --help # see positional args and command-specific flags
47|```
48|
49|Do not hard-code adapter lists — there are 100+ sites and the count moves every week. `aekb list -f json` is the source of truth; it emits one entry per command with `{site, name, aliases, description, strategy, browser, args, columns, ...}`. For an agent, that is always better than grepping a doc.
50|
51|Before falling back to raw `aekb browser` commands on high-change authenticated sites, check whether a site adapter already exposes the workflow. For example, ChatGPT web has higher-level commands for conversation reads and Deep Research result extraction; discover the current surface with `aekb chatgpt --help` or `aekb list -f json`.
52|
53|## Universal flags (work on every adapter command)
54|
55|| flag | effect |
56||------|--------|
57|| `-f, --format <fmt>` | `table` (default in TTY) · `yaml` (default in non-TTY) · `json` · `plain` · `md` · `csv`. Pass explicitly when you want a specific shape; agents almost always want `-f json`. |
58|| `-v, --verbose` | Debug logs + stack traces on failure; also sets `OPENCLI_VERBOSE=1` for the process. |
59|
60|Command-specific flags (`--limit`, `--tab`, `--filter`, …) are not universal — consult `<site> <command> --help`.
61|
62|## Output formats
63|
64|- `json` — pretty-printed, 2-space indent. Default choice for agents.
65|- `plain` — prints a single primary field for chat-style commands (`response`/`content`/`text`/`value`). Useful for piping to another tool.
66|- `yaml` — fallback when output is not a TTY and `-f` is not explicit.
67|- `table` — color-coded, site-grouped; meant for humans.
68|- `md`, `csv` — straightforward tabular dumps.
69|
70|A few commands override the default via `cmd.defaultFormat` (e.g. chat commands default to `plain`), so don't assume without reading `--help`.
71|
72|## Environment variables
73|
74|| variable | default | purpose |
75||----------|---------|---------|
76|| `OPENCLI_BROWSER_CONNECT_TIMEOUT` | `45` | Seconds to wait for the browser bridge. |
77|| `OPENCLI_BROWSER_COMMAND_TIMEOUT` | `60` | Per-command timeout. |
78|| `OPENCLI_CDP_ENDPOINT` | — | Manual CDP endpoint override (dev / remote Chrome / Electron). |
79|| `OPENCLI_CACHE_DIR` | `~/.aek-b/cache` | Network capture + browser-state cache. |
80|| `OPENCLI_WINDOW` | command-specific | `foreground` or `background` browser window mode. |
81|| `OPENCLI_VERBOSE` | `false` | Verbose logging (also triggered by `-v`). |
82|
83|## Self-repair
84|
85|When an adapter command fails because the site changed (selectors drifted, API rotated, response schema shifted), re-run with `--trace retain-on-failure`. The error envelope includes a `trace` block pointing at `summary.md`; patch only the `adapterSourcePath` from that summary and retry. Max 3 repair rounds. The full flow is in `references/autofix.md`.
86|
87|## Writing your own adapter
88|
89|Two-path storage:
90|
91|- **Private**: `~/.aek-b/clis/<site>/<command>.js` — no build step, hot-available, not visible in the public package.
92|- **Public / PR**: `clis/<site>/<command>.js` — for upstream contribution; requires build.
93|
94|Scaffolding & verification:
95|
96|```bash
97|aekb browser init <site>/<command>   # generates a skeleton
98|aekb validate [target]               # semantic checks on the loaded registry (description, domain, pipeline step names, func|pipeline|_lazy presence, arg duplicates) — no network, no browser
99|aekb verify [target] [--smoke]       # run the command with synthetic args
100|aekb browser verify <site>/<command> # end-to-end smoke inside the bridge
101|```
102|
103|Adapters import only `@cheezmil/aek-b/registry` and `@cheezmil/aek-b/errors`. `columns` must align 1:1 (in name and order) with keys of the object returned by `func`. For the full workflow see `references/adapter-author.md`.
104|
105|## Plugins
106|
107|Plugins are third-party extensions pulled from git, separate from the main adapter registry:
108|
109|```bash
110|aekb plugin install github:user/repo    # install
111|aekb plugin list [-f json]              # see installed
112|aekb plugin update [name] | --all       # keep current
113|aekb plugin uninstall <name>
114|aekb plugin create <name>               # scaffold a new plugin
115|```
116|
117|## External CLI passthrough
118|
119|Wraps external command-line tools so you can discover + invoke them through the same `aekb …` entrypoint:
120|
121|```bash
122|aekb external install gh    # auto-install via brew/apt/npm per external-clis.yaml
123|aekb external register my-tool \
124|    --binary my-tool \
125|    --install "npm i -g my-tool" \
126|    --desc "My internal CLI"
127|aekb external list
128|aekb gh pr list --limit 5   # passthrough; stdio is inherited, exit code propagated
129|aekb docker ps
130|```
131|
132|Built-in entries live in `src/external-clis.yaml`; user overrides and additions in `~/.aek-b/external-clis.yaml`. Commonly shipped: `gh`, `docker`, `vercel`, `lark-cli`, `longbridge`, `dws`, `wecom-cli`, `obsidian`, `ntn`, `tg(tg-cli)`, `discord(discord-cli)`, `wx(wx-cli)`.
133|
134|Some official CLIs use shell-script installers instead of a shell-free package-manager command. Entries without an `install` config, such as `ntn`, must be installed manually from their homepage before passthrough use.
135|
136|## Shell completion
137|
138|```bash
139|aekb completion bash   # also: zsh, fish
140|# -> script on stdout; source or save per your shell's convention
141|```
142|
143|## Where to go next
144|
145|| If you're about to… | Load this skill |
146||---------------------|-----------------|
147|| Drive a live browser ad-hoc (no adapter available, or prototyping) | `references/browser.md` |
148|| Write a new adapter, or add a command to an existing site | `references/adapter-author.md` |
149|| Fix a broken adapter after a command failure | `references/autofix.md` |
150|| Route a search / lookup / research request to the right adapter | `smart-search` |
151|
152|## Commands that used to exist
153|
154|The following were removed in the PR #1094 consolidation — don't try to invoke them:
155|
156|- `aekb explore <url>` — superseded by `aekb browser network` + `aekb browser find` for live API discovery, and by the `references/adapter-author.md` workflow for capture.
157|- `aekb record <url>` — removed; manual capture now lives in `aekb browser network --detail`.
158|- `aekb web read` / `aekb desktop *` as top-level groups — folded into their respective adapters (`aekb web read` still exists as the `web` adapter's `read` command, but there is no standalone `web` / `desktop` top-level group command).
159|
160|## Don't
161|
162|- Don't paste this skill's command list into your plan; it will rot. Call `aekb list -f json` at the start of a task instead.
163|- Don't assume every adapter needs a browser — strategy `PUBLIC` and `LOCAL` don't. Check the `strategy` field.
164|- Don't silently fall back from a failing adapter to a hand-rolled `fetch` — `--trace retain-on-failure` gives you the browser evidence and adapter source path. Do that first.
165|