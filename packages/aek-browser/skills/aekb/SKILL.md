1|---
2|name: aekb
3|description: Use when driving a website, desktop app, or external CLI through the `aekb` CLI, or when searching/researching with the smart-search router. Single entry point covering usage/orientation, live-browser driving, adapter authoring & autofix, sitemap authoring & consumption, and smart-search. Load references/ only as needed per task.
4|allowed-tools: "Bash(aek-b:*) Read Edit Write Grep"
5|metadata:
6|  author: cheezmil
7|  version: 1.0.0
8|---
9|
10|# AEK Browser (aekb)
11|
12|AEK Browser turns any website, Electron desktop app, or external CLI into a uniform `aekb <site> <command>` surface that agents can drive without screen-scraping. This single skill is the consolidated entry point for everything under the AEK Browser umbrella — the workload of the former `aek-b-usage`, `aek-b-browser`, `aek-b-adapter-author`, `aek-b-autofix`, `aek-b-browser-sitemap`, `aek-b-sitemap-author`, and `smart-search` skills.
13|
14|## Overview
15|
16|Do **not** load all reference documents up front. Each task maps to exactly one reference; read only what you need, on demand.
17|
18|| Task | Load |
19|| --- | --- |
20|| First-timer orientation, global flags, env vars, top-level groups, external CLI passthrough | `references/usage.md` |
21|| Drive a live Chrome window ad-hoc (inspect, fill forms, click logged-in flows, extract data), bind a current tab | `references/browser.md` |
22|| Implicit session mode, preprocessor rules, backtick escaping pitfalls, adding new browser subcommands | `references/cli-patterns.md` |
23|| Write a new adapter, or add a command to an existing site | `references/adapter-author.md` (+ `references/adapter/*`) |
24|| Fix a broken adapter after a command failure | `references/autofix.md` |
25|| Consume a site's sitemap context while driving a browser task | `references/browser-sitemap.md` |
26|| Author/update sitemap knowledge (durable paths, workflows, stale entries) | `references/sitemap-author.md` (+ `references/sitemap/sitemap-schema.md`) |
27|| Search/research via routing to the best `aekb` data source | `references/smart-search.md` (+ `references/search/sources-*.md`) |
28|
29|Every `aekb *` subcommand returns a structured machine-readable envelope — lean on it, never guess.
30|
31|## Prerequisites
32|
33|```bash
34|aekb doctor
35|```
36|
37|For `references/browser.md` browser-driving and `COOKIE` / `INTERCEPT` / `UI` adapters, `doctor` must be green (Chrome running, extension installed, debug port clear). `PUBLIC` / `LOCAL` adapters, `aekb list`, `validate`, `verify`, plugin commands, and external-CLI passthrough do not need it. Typical failures: Chrome not running, extension not installed, debug port blocked by 1Password / another extension. Run `aekb list -f json` for the live adapter surface — never hard-code adapter lists.
38|
39|## Process
40|
41|1. Identify what the agent actually wants to do (orient / drive browser / write adapter / autofix / sitemap consume / sitemap author / smart-search).
42|2. Load exactly one topic reference from the table above.
43|3. Load subreferences only when the topic doc points to one (e.g. an adapter-author reference, a sitemap schema, or a search-source file).
44|4. Follow that reference end-to-end. For live-browser or authenticated-adapter paths, keep `doctor` green and use stable `<session>` names and machine-readable `-f json` output where available.
45|
46|## Examples
47|
48|```
49|$ aekb list -f json                      # live adapter surface (usage.md)
50|$ aekb work open https://…               # own a session, then state/click (browser.md)
51|$ aekb gmail bind                        # take over the user's logged-in tab (browser.md)
52|$ aekb twitter post -h                   # adapter author's target contract (adapter-author.md)
53|$ aekb automatic686 … --trace retain-on-failure   # failing adapter → autofix.md
54|$ aekb grok "…"                          # smart-search AI default (smart-search.md)
55|```
56|
57|## Guidelines
58|
59|- One task → one reference. Do not pre-load bulk documents into context.
60|- `aekb doctor` green is mandatory only where the reference says so; `PUBLIC`/`LOCAL` paths don't need a browser.
61|- Adapters import only `@cheezmil/aek-b/registry` and `@cheezmil/aek-b/errors`; `columns` must align 1:1 (order and name) with the returned object keys.
62|- Machine errors are structured `{error:{code,message,hint?,candidates?}}` — branch on `code`, not message strings.
63|- Smart-search: budget calls per question; AI sources max 1 call/question each; non-AI sources max 2. Always end with a short search summary.
64|- Do not write README files into the individual package folders.
65|
66|## References
67|
68|See `references/` for the full per-topic docs:
69|
70|- `references/usage.md` — orientation, flags, env vars, external CLI passthrough
71|- `references/browser.md` — live-browser driving & current-tab binding
72|- `references/adapter-author.md` — writing adapters (with `references/adapter/*`)
73|- `references/autofix.md` — automatic adapter self-repair
74|- `references/browser-sitemap.md` — consuming site sitemap context
75|- `references/sitemap-author.md` — authoring/updating sitemaps (`references/sitemap/sitemap-schema.md`)
76|- `references/smart-search.md` — smart-search router (`references/search/sources-*.md`)