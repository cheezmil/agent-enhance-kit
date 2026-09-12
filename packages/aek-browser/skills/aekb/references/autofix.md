1|# AEK Browser AutoFix — Automatic Adapter Self-Repair
2|
3|When an `aek-b` command fails because a website changed its DOM, API, or response schema, **automatically diagnose, fix the adapter, and retry** — don't just report the error.
4|
5|## Safety Boundaries
6|
7|**Before starting any repair, check these hard stops:**
8|
9|- **`AUTH_REQUIRED`** (exit code 77) — **STOP.** Do not modify code. Tell the user to log into the site in Chrome.
10|- **`BROWSER_CONNECT`** (exit code 69) — **STOP.** Do not modify code. Tell the user to run `aekb doctor`.
11|- **CAPTCHA / rate limiting** — **STOP.** Not an adapter issue.
12|
13|**Scope constraint:**
14|- **Only modify the file at `adapterSourcePath` in the trace `summary.md` front matter** — this is the authoritative adapter location (may be `clis/<site>/` in repo or `~/.aek-b/clis/<site>/` for npm installs)
15|- **Never modify** `src/`, `extension/`, `tests/`, `package.json`, or `tsconfig.json`
16|
17|**Retry budget:** Max **3 repair rounds** per failure. If 3 rounds of diagnose → fix → retry don't resolve it, stop and report what was tried.
18|
19|## Prerequisites
20|
21|```bash
22|aekb doctor    # Verify extension + daemon connectivity
23|```
24|
25|## When to Use This Skill
26|
27|Use when `aekb <site> <command>` fails with repairable errors:
28|- **SELECTOR** — element not found (DOM changed)
29|- **EMPTY_RESULT** — no data returned (API response changed)
30|- **API_ERROR** / **NETWORK** — endpoint moved or broke
31|- **PAGE_CHANGED** — page structure no longer matches
32|- **COMMAND_EXEC** — runtime error in adapter logic
33|- **TIMEOUT** — page loads differently, adapter waits for wrong thing
34|
35|## Before Entering Repair: "Empty" ≠ "Broken"
36|
37|`EMPTY_RESULT` — and sometimes a structurally-valid `SELECTOR` that returns nothing — is often **not an adapter bug**. Platforms actively degrade results under anti-scrape heuristics, and a "not found" response from the site doesn't mean the content is actually missing. Rule this out **before** committing to a repair round:
38|
39|- **Retry with an alternative query or entry point.** If `aekb xiaohongshu search "X"` returns 0 but `aekb xiaohongshu search "X 攻略"` returns 20, the adapter is fine — the platform was shaping results for the first query.
40|- **Spot-check in a normal Chrome tab.** If the data is visible in the user's own browser but the adapter comes back empty, the issue is usually authentication state, rate limiting, or a soft block — not a code bug. The fix is `aekb doctor` / re-login, not editing source.
41|- **Look for soft 404s.** Sites like xiaohongshu / weibo / douyin return HTTP 200 with an empty payload instead of a real 404 when an item is hidden or deleted. The snapshot will look structurally correct. A retry 2-3 seconds later often distinguishes "temporarily hidden" from "actually gone".
42|- **"0 results" from a search is an answer.** If the adapter successfully reached the search endpoint, got an HTTP 200, and the platform returned `results: []`, that is a valid answer — report it to the user as "no matches for this query" rather than patching the adapter.
43|
44|Only proceed to Step 1 if the empty/selector-missing result is **reproducible across retries and alternative entry points**. Otherwise you're patching a working adapter to chase noise, and the patched version will break the next working path.
45|
46|## Step 1: Collect Trace Context
47|
48|Run the failing command with failure-retained trace enabled:
49|
50|```bash
51|aekb <site> <command> [args...] --trace retain-on-failure 2>trace-error.yaml
52|```
53|
54|On failure, stderr contains the normal error envelope plus a small `trace` block:
55|
56|```yaml
57|ok: false
58|error:
59|  code: SELECTOR
60|  message: "Could not find element: .old-selector"
61|trace:
62|  schemaVersion: 1
63|  aek-browserVersion: "..."
64|  traceId: "..."
65|  dir: "/path/to/.aek-b/profiles/default/traces/..."
66|  summaryPath: "/path/to/.aek-b/profiles/default/traces/.../summary.md"
67|  receiptPath: "/path/to/.aek-b/profiles/default/traces/.../receipt.json"
68|```
69|
70|Read `summaryPath` first. It is the LLM-oriented entry point and includes front matter:
71|
72|```yaml
73|---
74|schemaVersion: 1
75|aek-browserVersion: "..."
76|traceId: "..."
77|status: failure
78|site: "example"
79|command: "example/search"
80|adapterSourcePath: "/path/to/clis/example/search.js"
81|errorCode: "SELECTOR"
82|errorMessage: "Could not find element: .old-selector"
83|---
84|```
85|
86|The artifact directory contains:
87|
88|```text
89|summary.md      # start here
90|receipt.json    # machine-readable trace receipt
91|trace.jsonl     # full redacted timeline
92|network.jsonl   # redacted network events
93|console.jsonl   # redacted console events
94|state/          # final snapshots when available
95|screenshots/    # final screenshots when available
96|```
97|
98|If you redirected stderr to a file, read that file and copy `trace.summaryPath`.
99|
100|Do not ask the user to rerun with legacy diagnostic env vars. Trace is the repair evidence path.
101|
102|## Step 2: Analyze the Failure
103|
104|Read the trace summary and the adapter source. Classify the root cause:
105|
106|| Error Code | Likely Cause | Repair Strategy |
107||-----------|-------------|-----------------|
108|| SELECTOR | DOM restructured, class/id renamed | Explore current DOM → find new selector |
109|| EMPTY_RESULT | API response schema changed, or data moved | Check network → find new response path |
110|| API_ERROR | Endpoint URL changed, new params required | Discover new API via network intercept |
111|| AUTH_REQUIRED | Login flow changed, cookies expired | **STOP** — tell user to log in, do not modify code |
112|| TIMEOUT | Page loads differently, spinner/lazy-load | Add/update wait conditions |
113|| PAGE_CHANGED | Major redesign | May need full adapter rewrite |
114|
115|**Key questions to answer:**
116|1. What is the adapter trying to do? (Read the file at `adapterSourcePath`)
117|2. What did the page look like when it failed? (Read `summary.md`, then `state/` if needed)
118|3. What network requests happened? (Read `Failed Network` in `summary.md`, then `network.jsonl` if needed)
119|4. What's the gap between what the adapter expects and what the page provides?
120|
121|## Step 3: Explore the Current Website
122|
123|Use `aekb browser` to inspect the live website. **Never use the broken adapter** — it will just fail again.
124|
125|### DOM changed (SELECTOR errors)
126|
127|```bash
128|# Open the page and inspect current DOM
129|aekb browser open https://example.com/target-page && aekb browser state
130|
131|# Look for elements that match the adapter's intent
132|# Compare the snapshot with what the adapter expects
133|```
134|
135|### API changed (API_ERROR, EMPTY_RESULT)
136|
137|```bash
138|# Open page with network interceptor, then trigger the action manually
139|aekb browser open https://example.com/target-page && aekb browser state
140|
141|# Interact to trigger API calls
142|aekb browser click <N> && aekb browser network
143|
144|# Narrow to the request you care about by the fields its body should have
145|aekb browser network --filter author,text,likes
146|
147|# Inspect specific API response (key is the `key` field from the default JSON output)
148|aekb browser network --detail <key>
149|```
150|
151|## Step 4: Patch the Adapter
152|
153|Read the adapter source file at `adapterSourcePath` from the trace summary front matter and make targeted fixes. This path is authoritative — it may be in the repo (`clis/`) or user-local (`~/.aek-b/clis/`).
154|
155|Use the `Read` tool on the exact path from summary.md front matter.
156|
157|### Common Fixes
158|
159|**Selector update:**
160|```typescript
161|// Before: page.evaluate('document.querySelector(".old-class")...')
162|// After:  page.evaluate('document.querySelector(".new-class")...')
163|```
164|
165|**API endpoint change:**
166|```typescript
167|// Before: const resp = await page.evaluate(`fetch('/api/v1/old-endpoint')...`)
168|// After:  const resp = await page.evaluate(`fetch('/api/v2/new-endpoint')...`)
169|```
170|
171|**Response schema change:**
172|```typescript
173|// Before: const items = data.results
174|// After:  const items = data.data.items  // API now nests under "data"
175|```
176|
177|**Wait condition update:**
178|```typescript
179|// Before: await page.wait({ selector: '.loading-spinner', hidden: true })
180|// After:  await page.wait({ selector: '[data-loaded="true"]' })
181|```
182|
183|### Rules for Patching
184|
185|1. **Make minimal changes** — fix only what's broken, don't refactor
186|2. **Keep the same output structure** — `columns` and return format must stay compatible
187|3. **Prefer API over DOM scraping** — if you discover a JSON API during exploration, switch to it
188|4. **Use `@cheezmil/aek-b/*` imports only** — never add third-party package imports
189|5. **Test after patching** — run the command again to verify
190|6. **Never relax `verify/<cmd>.json` fixtures to silence a failure.** A failing `patterns` / `notEmpty` / `mustNotContain` / `mustBeTruthy` rule means the adapter's output is broken. Tighten the adapter so it produces correct values; do not loosen the fixture to accept the broken values. The one legitimate reason to edit a fixture during repair is when the **site itself** changed shape (e.g. URL format migration) — in that case update the fixture and note the change in `~/.aek-b/sites/<site>/notes.md`. Otherwise editing the fixture is covering up a silent correctness regression.
191|
192|## Step 5: Verify the Fix
193|
194|```bash
195|# Run the command normally
196|aekb <site> <command> [args...]
197|```
198|
199|If it still fails, go back to Step 1 and collect a fresh trace. You have a budget of **3 repair rounds** (trace → fix → retry). If the same error persists after a fix, try a different approach. After 3 rounds, stop and report what was tried.
200|
201|## Step 6: File an Upstream Issue
202|
203|If the retry **passes**, the local adapter has drifted from upstream. File a GitHub issue so the fix flows back to `cheezmil/AEK Browser`.
204|
205|**Do NOT file for:**
206|- `AUTH_REQUIRED`, `BROWSER_CONNECT`, `ARGUMENT`, `CONFIG` — environment/usage issues, not adapter bugs
207|- CAPTCHA or rate limiting — not fixable upstream
208|- Failures you couldn't actually fix (3 rounds exhausted)
209|
210|**Only file after a verified local fix** — the retry must pass first.
211|
212|**Procedure:**
213|
214|1. Prepare the issue content from the trace summary you already have:
215|   - **Title:** `[autofix] <site>/<command>: <error_code>` (e.g. `[autofix] zhihu/hot: SELECTOR`)
216|   - **Body** (use this template):
217|
218|```markdown
219|## Summary
220|AEK Browser autofix repaired this adapter locally, and the retry passed.
221|
222|## Adapter
223|- Site: `<site>`
224|- Command: `<command>`
225|- AEK Browser version: `<version from aekb --version>`
226|
227|## Original failure
228|- Error code: `<error_code>`
229|
230|~~~
231|<error_message>
232|~~~
233|
234|## Local fix summary
235|
236|~~~
237|<1-2 sentence description of what you changed and why>
238|~~~
239|
240|_Issue filed by AEK Browser autofix after a verified local repair._
241|```
242|
243|2. **Ask the user before filing.** Show them the draft title and body. Only proceed if they confirm.
244|
245|3. If the user approves and `gh auth status` succeeds:
246|
247|```bash
248|gh issue create --repo cheezmil/AEK Browser \
249|  --title "[autofix] <site>/<command>: <error_code>" \
250|  --body "<the body above>"
251|```
252|
253|If `gh` is not installed or not authenticated, tell the user and skip — do not error out.
254|
255|## When to Stop
256|
257|**Hard stops (do not modify code):**
258|- **AUTH_REQUIRED / BROWSER_CONNECT** — environment issue, not adapter bug
259|- **Site requires CAPTCHA** — can't automate this
260|- **Rate limited / IP blocked** — not an adapter issue
261|
262|**Soft stops (report after attempting):**
263|- **3 repair rounds exhausted** — stop, report what was tried and what failed
264|- **Feature completely removed** — the data no longer exists
265|- **Major redesign** — needs full adapter rewrite via `references/adapter-author.md` skill
266|
267|In all stop cases, clearly communicate the situation to the user rather than making futile patches.
268|
269|## Example Repair Session
270|
271|```
272|1. User runs: aekb zhihu hot
273|   → Fails: SELECTOR "Could not find element: .HotList-item"
274|
275|2. AI runs: aekb zhihu hot --trace retain-on-failure 2>trace-error.yaml
276|   → Gets trace summary with final state and failed action evidence
277|
278|3. AI reads summary/state: page loaded but uses ".HotItem" instead of ".HotList-item"
279|
280|4. AI explores: aekb browser open https://www.zhihu.com/hot && aekb browser state
281|   → Confirms new class name ".HotItem" with child ".HotItem-content"
282|
283|5. AI patches: Edit adapter at `adapterSourcePath` — replace ".HotList-item" with ".HotItem"
284|
285|6. AI verifies: aekb zhihu hot
286|   → Success: returns hot topics
287|
288|7. AI prepares upstream issue draft, shows it to the user
289|
290|8. User approves → AI runs: gh issue create --repo cheezmil/AEK Browser --title "[autofix] zhihu/hot: SELECTOR" --body "..."
291|```
292|