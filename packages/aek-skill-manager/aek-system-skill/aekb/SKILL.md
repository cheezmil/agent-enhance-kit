---
name: aekb
description: Use when driving a website, desktop app, or external CLI through the `aekb` CLI, or when searching/researching with the smart-search router. Single entry point covering usage/orientation, live-browser driving, adapter authoring & autofix, sitemap authoring & consumption, and smart-search. Load references/ only as needed per task.
allowed-tools: "Bash(aekb:*) Read Edit Write Grep"
metadata:
  author: cheezmil
  version: 1.0.0
---

# AEK Browser (aekb)

AEK Browser turns any website, Electron desktop app, or external CLI into a uniform `aekb <site> <command>` surface that agents can drive without screen-scraping. This single skill is the consolidated entry point for everything under the AEK Browser umbrella — the workload of the former `aekb-usage`, `aekb-browser`, `aekb-adapter-author`, `aekb-autofix`, `aekb-browser-sitemap`, `aekb-sitemap-author`, and `smart-search` skills.

## Overview

Do **not** load all reference documents up front. Each task maps to exactly one reference; read only what you need, on demand.

| Task | Load |
| --- | --- |
| First-timer orientation, global flags, env vars, top-level groups, external CLI passthrough | `references/usage.md` |
| Drive a live Chrome window ad-hoc (inspect, fill forms, click logged-in flows, extract data), bind a current tab | `references/browser.md` |
| Implicit session mode, preprocessor rules, backtick escaping pitfalls, adding new browser subcommands | `references/cli-patterns.md` |
| Write a new adapter, or add a command to an existing site | `references/adapter-author.md` (+ `references/adapter/*`) |
| Fix a broken adapter after a command failure | `references/autofix.md` |
| Consume a site's sitemap context while driving a browser task | `references/browser-sitemap.md` |
| Author/update sitemap knowledge (durable paths, workflows, stale entries) | `references/sitemap-author.md` (+ `references/sitemap/sitemap-schema.md`) |
| Search/research via routing to the best `aekb` data source | `references/smart-search.md` (+ `references/search/sources-*.md`) |

Every `aekb *` subcommand returns a structured machine-readable envelope — lean on it, never guess.

## Prerequisites

```bash
aekb doctor
```

For `references/browser.md` browser-driving and `COOKIE` / `INTERCEPT` / `UI` adapters, `doctor` must be green (Chrome running, extension installed, debug port clear). `PUBLIC` / `LOCAL` adapters, `aekb list`, `validate`, `verify`, plugin commands, and external-CLI passthrough do not need it. Typical failures: Chrome not running, extension not installed, debug port blocked by 1Password / another extension. Run `aekb list -f json` for the live adapter surface — never hard-code adapter lists.

## Process

1. Identify what the agent actually wants to do (orient / drive browser / write adapter / autofix / sitemap consume / sitemap author / smart-search).
2. Load exactly one topic reference from the table above.
3. Load subreferences only when the topic doc points to one (e.g. an adapter-author reference, a sitemap schema, or a search-source file).
4. Follow that reference end-to-end. For live-browser or authenticated-adapter paths, keep `doctor` green and use stable `<session>` names and machine-readable `-f json` output where available.

## Examples

```
$ aekb list -f json                      # live adapter surface (usage.md)
$ aekb work open https://…               # own a session, then state/click (browser.md)
$ aekb gmail bind                        # take over the user's logged-in tab (browser.md)
$ aekb twitter post -h                   # adapter author's target contract (adapter-author.md)
$ aekb automatic686 … --trace retain-on-failure   # failing adapter → autofix.md
$ aekb grok "…"                          # smart-search AI default (smart-search.md)
```

## Guidelines

- One task → one reference. Do not pre-load bulk documents into context.
- `aekb doctor` green is mandatory only where the reference says so; `PUBLIC`/`LOCAL` paths don't need a browser.
- Adapters import only `@cheezmil/aek-browser/registry` and `@cheezmil/aek-browser/errors`; `columns` must align 1:1 (order and name) with the returned object keys.
- Machine errors are structured `{error:{code,message,hint?,candidates?}}` — branch on `code`, not message strings.
- Smart-search: budget calls per question; AI sources max 1 call/question each; non-AI sources max 2. Always end with a short search summary.
- Do not write README files into the individual package folders.

## References

See `references/` for the full per-topic docs:

- `references/usage.md` — orientation, flags, env vars, external CLI passthrough
- `references/browser.md` — live-browser driving & current-tab binding
- `references/adapter-author.md` — writing adapters (with `references/adapter/*`)
- `references/autofix.md` — automatic adapter self-repair
- `references/browser-sitemap.md` — consuming site sitemap context
- `references/sitemap-author.md` — authoring/updating sitemaps (`references/sitemap/sitemap-schema.md`)
- `references/smart-search.md` — smart-search router (`references/search/sources-*.md`)