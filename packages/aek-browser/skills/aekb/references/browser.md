1|# references/browser.md
2|
3|The first reader of this CLI is an agent, not a human. Every subcommand returns a structured envelope that tells you exactly what matched, how confident the match is, and what to do if it didn't. Lean on those envelopes — do not guess.
4|
5|This skill is for **driving a live browser** to accomplish an agent task. If you are building a reusable adapter under `~/.aek-b/clis/<site>/` use `references/adapter-author.md` instead.
6|
7|---
8|
9|## Prerequisites
10|
11|```bash
12|aekb doctor
13|```
14|
15|Until `doctor` is green, nothing else will work. Typical failures: Chrome not running, extension not installed, debug port blocked by 1Password / other extensions. The doctor output tells you which.
16|
17|---
18|
19|## Session lifecycle
20|
21|- `aekb *` (or `aekb browser *`) commands require a `<session>` positional. You can omit `browser`/`b` — `aekb <session> <cmd>` is the preferred form. Use the same session name for a multi-step flow; use a different name to isolate parallel browser work.
22|- Use a stable session name for any multi-command or human-paced browser workflow. Example: `aekb fb-yaya-warmup open https://example.com`, then reuse `aekb fb-yaya-warmup state`, `extract`, `click`, etc.
23|- Owned browser sessions keep a tab lease alive between calls. Release it with `aekb <session> close` or let the idle timeout expire.
24|- `aekb <session> bind` binds the Chrome tab you already have open to that session. Use this for logged-in pages, SSO flows, or pages you manually positioned before handing control to the agent.
25|- `--window foreground|background` (or `OPENCLI_WINDOW=foreground|background`) chooses whether AEK Browser creates/focuses a foreground browser window or uses a background browser window for owned sessions.
26|
27|### Bind Tab
28|
29|```bash
30|aekb gmail bind
31|aekb gmail state
32|aekb gmail click "Search"
33|aekb gmail network
34|aekb gmail unbind
35|```
36|
37|Binding never owns the user window and never closes the user tab. It fails closed if the tab is closed or becomes non-debuggable. Re-run `aekb <session> bind` when you switch to a different real tab.
38|
39|Navigation is allowed on bound sessions because the session now represents explicit agent ownership of that tab. Tab mutation (`tab new`, `tab select`, `tab close`) is still blocked for bound sessions. Use an owned session when you want AEK Browser to manage tab lifecycle.
40|
41|Bound sessions have no AEK Browser idle-close timer; the binding lasts until `unbind`, tab close, window close, or daemon restart.
42|
43|---
44|
45|## Mental model
46|
47|1. **Selector-first target contract.** Every interaction command (`click`, `type`, `select`, `get text/value/attributes`) takes one `<target>`, which is *either* a numeric ref from `state`/`find` *or* a CSS selector. Use `--nth <n>` to disambiguate multiple CSS matches.
48|2. **Every envelope reports `matches_n` and `match_level`.** `match_level` is `exact`, `stable`, or `reidentified` — the CLI already rescued moderate DOM drift for you, but the level tells you how confident to be.
49|3. **Compact output first, full payload on demand.** `state` is a budget-aware snapshot; `get html --as json` supports `--depth/--children-max/--text-max`; `network` returns shape previews and you re-fetch a single body with `--detail <key>`. If you emit a giant payload you are burning context you did not need to burn.
50|4. **Structured errors are machine-readable.** On failure the CLI emits `{error: {code, message, hint?, candidates?}}`. Branch on `code`, not on message strings.
51|
52|---
53|
54|## Critical rules
55|
56|1. **Always inspect before you act.** Run `state` or `find` first. Never hard-code a ref or selector from memory across sessions — indices are per-snapshot.
57|2. **Prefer site adapters before raw browser driving.** If `aekb <site> <command>` already covers the task, use that adapter command first (`aekb facebook notifications`, `aekb reddit read`, `aekb chatgpt model <level>`, etc.). Use `aekb browser ...` only for gaps, debugging, or one-off UI flows the adapter does not expose.
58|3. **Prefer numeric ref over CSS once you have it.** Numeric refs survive mild DOM shifts because the CLI fingerprints each tagged element. A CSS selector written by hand will break the first time the site re-renders.
59|4. **Read `match_level` after every write.** `exact` = all good. `stable` = the element is the same but some soft attrs drifted — your action still applied. `reidentified` = the original ref was gone and the CLI found a unique replacement; double-check you hit the right element.
60|5. **Use the `compound` field for form controls.** Do not regex-guess a date format, do not `state` twice to get the full `<select>` options list. The compound envelope has the format string, full option list up to 50, `options_total` for overflow, and `accept`/`multiple` for `<input type=file>`.
61|6. **Verify writes that matter.** After `type <target> <text>`, run `get value <target>`. After `select`, run `get value`. Autocomplete widgets, React controlled inputs, and masked fields all silently eat characters. The CLI cannot detect this for you.
62|7. **`state` → action → `state` after a page change.** Navigations, form submits, and SPA route changes invalidate refs. Take a fresh snapshot. Do not reuse refs from before the transition.
63|8. **Chain with `&&` when reusing freshly parsed refs.** A chained sequence runs in one shell so the ref you just read from output can be passed directly to the next command. Separate shell invocations keep the named browser session, but any shell-local variables or copied refs from the previous command can go stale after page changes.
64|9. **`eval` is read-only.** Wrap the JS in an IIFE and return JSON. If you need to *change* the page, use the structured `click` / `type` / `select` / `keys` commands instead — they produce structured output and fingerprints, `eval` does not.
65|10. **Prefer `network` to screen-scraping.** If a page you care about fetches its data from a JSON API, the API is almost always more reliable than scraping the rendered DOM. Capture once, inspect the shape, then `--detail <key>` the body you need.
66|
67|---
68|
69|## Sitemaps
70|
71|If `browser open` or `browser analyze` returns `sitemap.available: true`, switch to `references/browser-sitemap.md` before continuing a multi-step site flow. The sitemap is prior context for pages, actions, workflows, APIs, and pitfalls; it is not truth. If the browser state disagrees with the sitemap, trust the browser and mark the sitemap stale via `references/sitemap-author.md`.
72|
73|---
74|
75|## Target contract (`<target>` for click / type / select / get text|value|attributes)
76|
77|```
78|<target> ::= <numeric-ref> | <css-selector>
79|```
80|
81|- **Numeric ref** — the `[N]` index from `state` or `find`. Cheap, resilient to soft DOM drift.
82|- **CSS selector** — anything `querySelectorAll` accepts. Must be unambiguous on write ops, or pair with `--nth <n>`.
83|
84|### Envelope on success
85|
86|```json
87|{ "clicked": true, "target": "3", "matches_n": 1, "match_level": "exact" }
88|```
89|
90|```json
91|{ "value": "kalevin@example.com", "matches_n": 1, "match_level": "stable" }
92|```
93|
94|### match_level
95|
96|| level | meaning | you should |
97||-------|---------|------------|
98|| `exact` | Fingerprint agreed on tag + strong IDs with at most one soft drift | Proceed. |
99|| `stable` | Tag + strong IDs still agree, soft signals (aria-label, role, text) drifted | Proceed, but if *what* you typed/clicked matters, re-check with `get value` or `state`. |
100|| `reidentified` | Original ref was gone; a unique live element matched the fingerprint and was re-tagged with the old ref | Double-check you hit the right element before chaining more writes. |
101|
102|### Structured error codes
103|
104|Branch on these, not on the human message:
105|
106|| code | meaning |
107||------|---------|
108|| `not_found` | Numeric ref is no longer in the DOM. Re-`state`. |
109|| `stale_ref` | Ref exists but the element at that ref changed identity. Re-`state`. |
110|| `invalid_selector` | CSS was rejected by `querySelectorAll`. Fix the selector. |
111|| `selector_not_found` | CSS matches 0 elements. Try `find` with a looser selector. |
112|| `selector_ambiguous` | CSS matches >1 and no `--nth`. Add `--nth` or narrow the selector. |
113|| `selector_nth_out_of_range` | `--nth` beyond match count. |
114|| `option_not_found` | `select` couldn't find an option matching that label/value. Error envelope includes `available: string[]` of the real option labels. |
115|| `not_a_select` | `select` was called on a non-`<select>` element. |
116|
117|Error envelope always includes `error.code` and `error.message`. Target errors (`selector_not_found`, `selector_ambiguous`, etc.) often add `error.candidates: string[]` with suggested selectors. `option_not_found` adds `error.available: string[]` instead.
118|
119|---
120|
121|## Command reference
122|
123|### Inspect
124|
125|| command | purpose |
126||---------|---------|
127|| `browser state` | Snapshot: text tree with `[N]` refs, scroll hints, hidden-interactive hints, `compounds (N):` sidecar for date/select/file refs. |
128|| `browser state --source ax` | Opt-in accessibility-tree snapshot. Use when custom controls, portals, or iframe contents are hard to identify in normal `state`. AX refs can recover stale React re-renders by role/name/nth and can route same-origin iframe refs. Cross-origin iframe refs are best-effort because Chrome may not expose attachable OOPIF targets to extensions. |
129|| `browser state --compare-sources` | Metrics-only DOM vs AX comparison for deciding whether AX should become default. It prints counts and sizes, not page text, so it is safer to share for validation. |
130|| `browser find --css <sel> [--limit N] [--text-max N]` | Run a CSS query and return one entry per match with `{nth, ref, tag, role, text, attrs, visible, compound?}`. Allocates refs for matches the prior snapshot didn't tag. Cheap alternative to `state` when you already know the selector. |
131|| `browser find --role button --name Save` | Semantic locator query. Also supports `--label`, `--text`, and `--testid`. Use before raw CSS when a control has accessible labels. |
132|| `browser frames` | List cross-origin iframe targets. Pass the index to `--frame` on `eval`. |
133|| `browser screenshot [path]` | Viewport PNG. No path → base64 to stdout. Prefer `state` when you just need structure. |
134|| `browser screenshot --annotate [path]` | Visual ref map. Refreshes DOM refs and overlays visible `[N]` labels so the screenshot maps back to `browser click <ref>` targets. Use for icon-only controls, visual layouts, charts, or when text state is ambiguous. |
135|
136|### Get (read-only)
137|
138|| command | returns |
139||---------|---------|
140|| `browser get title` | plain text |
141|| `browser get url` | plain text |
142|| `browser get text <target> [--nth N]` | `{value, matches_n, match_level}` |
143|| `browser get value <target> [--nth N]` | `{value, matches_n, match_level}` |
144|| `browser get attributes <target> [--nth N]` | `{value: {attr: val, ...}, matches_n, match_level}` |
145|| `browser get text --role option --name Travel` | Semantic locator read without a prior `state` call. Same flags as `browser find`. |
146|| `browser get html [--selector <css>] [--as html\|json] [--depth N] [--children-max N] [--text-max N] [--max N]` | Raw HTML, or structured tree. JSON tree nodes have `{tag, attrs, text, children[], compound?}`. Truncation reported via `truncated: {depth?, children_dropped?, text_truncated?}`. |
147|
148|### Interact
149|
150|| command | notes |
151||---------|-------|
152|| `browser click <target> [--nth N]` | Returns `{clicked, target, matches_n, match_level}`. |
153|| `browser click --role button --name Submit` | Semantic click. Write actions require a unique match; ambiguous locators return candidates instead of clicking the first match. |
154|| `browser hover [target] [--role R --name N] [--nth N]` | Moves the mouse over an element. Use for hover menus/tooltips before taking `state` or clicking submenu items. Returns `{hovered, target, matches_n, match_level}`. |
155|| `browser focus [target] [--role R --name N] [--nth N]` | Focuses an element without typing. Useful before `keys` or when a page reacts to focus/blur. Returns `{focused, target, matches_n, match_level}`. |
156|| `browser dblclick [target] [--role R --name N] [--nth N]` | Double-clicks an element via native mouse events when available. Returns `{dblclicked, target, matches_n, match_level}`. |
157|| `browser check [target] [--role R --name N] [--nth N]` | Ensures checkbox/radio/aria-checked control is checked. Returns `{checked, changed, target, matches_n, match_level, kind}`. Prefer this over blind `click` when target state matters. |
158|| `browser uncheck [target] [--role R --name N] [--nth N]` | Ensures checkbox/aria-checked control is unchecked. Radio buttons cannot be unchecked directly; select another radio in the group instead. |
159|| `browser upload [target] <file...> [--role R --name N] [--nth N]` | Attaches local file path(s) to an `input[type=file]` via CDP. With semantic flags, omit `target` and pass files as positionals. Returns `{uploaded, files, file_names, target, matches_n, match_level, multiple?, accept?}`. |
160|| `browser drag [source] [target] [--from-role R --from-name N] [--to-role R --to-name N] [--from-nth N] [--to-nth N]` | Mouse-based drag from one resolved element center to another. Works for mouse-listener drag libraries; native HTML5 `dataTransfer` drops may need a site-specific fallback. Returns `{dragged, source, target, source_matches_n, target_matches_n, ...}`. |
161|| `browser type [target] <text> [--role R --name N] [--nth N]` | Clicks first, then types. With semantic flags, omit `target` and pass text as the only positional. Returns `{typed, text, target, matches_n, match_level, autocomplete}`. `autocomplete: true` means a combobox/datalist popup appeared after typing — you almost always need `keys Enter` or a follow-up `click` on the suggestion to commit the value. |
162|| `browser fill [target] <text> [--role R --name N] [--nth N]` | Exact replacement for input, textarea, and contenteditable targets. With semantic flags, omit `target` and pass text as the only positional. Returns `{filled, verified, text, actual, matches_n, match_level}`. Use this when you need raw text set and verified, not keyboard/autocomplete behavior. Pipeline form supports `{ fill: { ref, text, submit: true } }`. |
163|| `browser select [target] <option> [--role R --name N] [--nth N]` | Matches native `<select>` option by label first, then value. With semantic flags, omit `target` and pass option as the only positional. Use `compound` from `find`/`state` to see exactly what labels are available. |
164|| `browser keys <key>` | `Enter`, `Escape`, `Tab`, `Control+a`, etc. Runs against the focused element. |
165|| `browser scroll <direction> [--amount px]` | `up` / `down`. Default amount `500`. |
166|
167|### Wait
168|
169|```bash
170|browser wait selector "<css>" [--timeout ms]    # wait until the selector matches
171|browser wait text "<substring>" [--timeout ms]  # wait until the text appears
172|browser wait download [pattern] [--timeout ms]  # wait for a Chrome download whose filename/URL/mime contains pattern
173|browser wait time <seconds>                     # hard sleep, last resort
174|```
175|
176|Default timeout `10000` ms. SPA routes, login redirects, and lazy-loaded lists need `wait` before `state`/`get`.
177|
178|`browser wait download` requires Browser Bridge extension 1.0.8+ because it uses
179|Chrome's downloads lifecycle API. Pass a narrow filename or URL substring such
180|as `receipt.pdf` when possible; an empty pattern waits for the next/recent
181|download in the timeout window. The command reports `{downloaded, filename, url,
182|state, elapsedMs}` on success and a JSON error envelope on timeout/failure.
183|
184|### Extract
185|
186|- **`web read --url <url>`** — One-shot Markdown reader for arbitrary pages. It expands relevant same-origin iframes by default, so old iframe-shell sites work better than with a top-document-only scrape. Use `--frames all-same-origin` when completeness matters more than Markdown noise. For AJAX shell pages use `aekb web read --url <url> --wait-for "<selector>" --wait-until networkidle --diagnose`; diagnostics show frame URLs, empty containers, and API-like XHRs. If the value you need is table/API data, switch to `browser network` or a dedicated adapter instead of relying on Markdown.
187|- **`browser eval <js> [--frame N]`** — Run an expression in the page (or in a cross-origin frame via `--frame`). Wrap in an IIFE and return JSON. Read-only: no `document.forms[0].submit()`, no clicks, no navigations. If the result is a string, stdout is the raw string; otherwise it's JSON.
188|- **`browser extract [--selector <css>] [--chunk-size N] [--start N]`** — Markdown extraction of long-form content with a continuation cursor. Returns `{url, title, selector, total_chars, chunk_size, start, end, next_start_char, content}`. Loop on `next_start_char` until it is `null`. Auto-scopes to `<main>`/`<article>`/`<body>` if you don't pass `--selector`.
189|
190|### Network
191|
192|```bash
193|browser network                        # shape preview + cache key list
194|browser network --detail <key>         # full body for one cached entry
195|browser network --filter "field1,field2"  # keep only entries whose body shape contains ALL fields as path segments
196|browser network --all                  # include static resources (usually noise)
197|browser network --raw                  # full bodies inline — large; use sparingly
198|browser network --ttl <ms>             # cache TTL (default 24h)
199|```
200|
201|List entries look like `{key, method, status, url, ct, size, shape, body_truncated?}`. Detail envelope is `{key, url, method, status, ct, size, shape, body, body_truncated?, body_full_size?, body_truncation_reason}`. Cache lives in `~/.aek-b/cache/browser-network/` so you can re-inspect without re-triggering the request.
202|
203|Default output keeps JSON/XML/plain-text and JS-like API responses, then drops obvious static assets and telemetry by URL. If an expected endpoint is missing, run `browser network --all` once and check whether an unusual content type or URL filter hid it.
204|
205|### Tabs & session
206|
207|| command | purpose |
208||---------|---------|
209|| `browser tab list` | JSON array of `{index, page, url, title, active}`. The `page` string is the tab identity you pass as `<targetId>` to `tab select` / `tab close`, or to `--tab <targetId>` on any subcommand. (`--tab`'s placeholder is historical — the value is always `page`.) |
210|| `browser tab new [url]` | Open a new tab. Prints the new `page` string. |
211|| `browser tab select [targetId]` | Make a tab the default. All subcommands accept `--tab <targetId>` to target one without changing the default. |
212|| `browser tab close [targetId]` | Close by `page`. |
213|| `browser back` | History back on the active tab. |
214|| `browser close` | Release the current owned browser session when done. |
215|| `browser <session> bind` | Bind the current Chrome tab to the named browser session. |
216|| `browser <session> unbind` | Detach the named bound session without closing the user tab/window. |
217|
218|---
219|
220|## Compound form controls
221|
222|Every date/time, select, and file input carries a `compound` field. Use it — do not regex attributes.
223|
224|### Date family
225|
226|```json
227|{
228|  "control": "date",
229|  "format": "YYYY-MM-DD",
230|  "current": "2026-04-21",
231|  "min": "2026-01-01",
232|  "max": "2026-12-31"
233|}
234|```
235|
236|`control` is one of `date | time | datetime-local | month | week`. `format` is a concrete template string — type into the field using that exact format, or `select` by label if the site wraps the native input in a custom widget.
237|
238|### Select
239|
240|```json
241|{
242|  "control": "select",
243|  "multiple": false,
244|  "current": "United States",
245|  "options": [
246|    { "label": "United States", "value": "us", "selected": true },
247|    { "label": "Canada", "value": "ca" }
248|  ],
249|  "options_total": 137
250|}
251|```
252|
253|`options[]` is capped at 50 entries. **`current` is always correct** even when the selected option is past the cap — it's computed by scanning every option, not from the truncated list. If `options_total > options.length` and you need an option that isn't in `options[]`, call `browser select <target> "<label>"` directly — the CLI matches against the live DOM, not the truncated list.
254|
255|### File
256|
257|```json
258|{
259|  "control": "file",
260|  "multiple": true,
261|  "current": ["report.pdf", "cover.png"],
262|  "accept": "application/pdf,image/*"
263|}
264|```
265|
266|Do not invent file paths. Upload is done via the normal click flow — respect `accept` when telling the user what to upload.
267|
268|### Where compounds show up
269|
270|- `browser find --css <sel>` entries: inline on each match.
271|- `browser get html --as json` tree nodes: inline on matching nodes.
272|- `browser state` snapshot: in a `compounds (N):` sidecar keyed by numeric ref, so you can tell at a glance which `[N]` entries have rich metadata.
273|
274|---
275|
276|## Cost guide
277|
278|Think about payload size per call. Budgets exist for a reason.
279|
280|| command | rough cost | when to use |
281||---------|-----------|-------------|
282|| `state` | medium (bounded by internal budget) | First call on any page, after every nav, when you need refs. |
283|| `find --css <sel>` | small | You already know the selector — one query, compact entries. |
284|| `get title` / `get url` | tiny | Sanity checks between steps. |
285|| `get text/value/attributes` | tiny per call | Verifying one specific field. |
286|| `get html` (raw) | can be huge | Avoid on unbounded pages. Always pair with `--selector` and a budget. |
287|| `get html --as json --depth 3 --children-max 20` | medium | When you need to reason about structure, not a specific field. |
288|| `screenshot` | large | Only when the page is visual (CAPTCHA, charts). Prefer `state`. |
289|| `extract` | medium per chunk | Long-form reading. Loop via `next_start_char`. |
290|| `network` (default) | small | First look at APIs. |
291|| `network --detail <key>` | varies | Pull one body. |
292|| `network --raw` | huge | Only after `--filter` narrowed the candidate set. |
293|| `eval "JSON.stringify(...)"` | controlled | Targeted extraction when none of the above fit. |
294|
295|Rule of thumb: **one `state` per page transition, one `find` per follow-up query, one `get`/`click`/`type` per action.** If your plan involves >10 calls per page you are probably scraping instead of interacting — consider `extract` or `network`.
296|
297|---
298|
299|## Chaining rules
300|
301|**Good — one shell, live session:**
302|
303|```bash
304|aekb hn open "https://news.ycombinator.com" \
305|  && aekb hn state \
306|  && aekb hn click 3
307|```
308|
309|**Bad — each line is a fresh shell, refs from call 1 are already forgotten when call 2 runs.** (Only a problem if you rely on shell-scoped state; browser refs themselves persist in-page, but interleaving unrelated shells invites races.) Prefer `&&` when the steps are meant to be atomic.
310|
311|**Never** chain a write and then an immediate `state` without a `wait` if the action causes a network round-trip — you will snapshot the pre-response DOM and make bad decisions off stale data.
312|
313|---
314|
315|## Recipes
316|
317|### Fill a login form
318|
319|```bash
320|aekb login open "https://example.com/login"
321|aekb login state                          # find [N] for email, password, submit
322|aekb login type 4 "me@example.com"
323|aekb login type 5 "hunter2"
324|aekb login get value 4                    # verify (autocomplete can eat chars)
325|aekb login click 6                        # submit
326|aekb login wait selector "[data-testid=account-menu]" --timeout 15000
327|aekb login state                          # fresh refs on the logged-in page
328|```
329|
330|### Pick from a long dropdown
331|
332|```bash
333|aekb form state                          # sidebar shows [12] <select name=country>
334|aekb form find --css "select[name=country]"
335|# the compound.options_total is 137, but compound.current is "" — unselected.
336|aekb form select 12 "Uruguay"
337|aekb form get value 12                   # { value: "uy", match_level: "exact" }
338|```
339|
340|### Pick from a custom React dropdown
341|
342|Use this for Radix, shadcn, Material UI, Mercury-style category fields, and
343|other controls that are not native `<select>`.
344|
345|```bash
346|aekb mercury state                          # find category trigger ref
347|# If the trigger/option is not clear, use AX:
348|aekb mercury state --source ax              # look for combobox/button/listbox/option names
349|aekb mercury click 7                        # click category trigger
350|aekb mercury state --source ax              # fresh refs after the portal/listbox opens
351|aekb mercury click 12                       # click option
352|aekb mercury get text 7                     # verify visible selected label
353|```
354|
355|Do not use `browser select` on these widgets. `browser select` is only for
356|native `<select>` elements. Custom dropdowns should be driven with
357|`state -> click trigger -> state -> click option -> verify`.
358|
359|### Compare DOM vs AX observation
360|
361|When deciding whether AX refs are better for a page, collect metrics without
362|sharing page contents:
363|
364|```bash
365|aekb compare state --compare-sources
366|```
367|
368|Report `sources.dom.refs`, `sources.ax.refs`, `frame_sections`,
369|`approx_tokens`, `elapsed_ms`, and any per-source `error`. Use this before
370|arguing that AX should become the default on a site.
371|
372|### Scrape a list via network instead of DOM
373|
374|```bash
375|aekb hn open "https://news.ycombinator.com"
376|aekb hn network --filter "title,score"
377|# -> find the /topstories entry, note its key
378|aekb hn network --detail topstories-a1b2
379|```
380|
381|### Read a long article in chunks
382|
383|```bash
384|aekb browser article open "https://blog.example.com/long-post"
385|aekb browser article extract --chunk-size 8000
386|# -> content + next_start_char: 8000
387|aekb browser article extract --start 8000 --chunk-size 8000
388|# ...until next_start_char is null
389|```
390|
391|### Cross-origin iframe
392|
393|```bash
394|aekb browser checkout frames
395|# -> [{"index": 0, "url": "https://checkout.stripe.com/...", ...}]
396|aekb browser checkout eval "(() => document.querySelector('input[name=cardnumber]')?.value)()" --frame 0
397|```
398|
399|`browser state --source ax` may omit cross-origin iframe contents or fail to
400|route actions into them when Chrome does not expose an attachable OOPIF target
401|to the extension. In that case use `browser frames` + `browser eval --frame`, a
402|normal DOM `state`, or navigate/bind directly to the iframe URL when possible.
403|
404|---
405|
406|## Pitfalls
407|
408|- **Do not submit forms via `eval "document.forms[0].submit()"`** — modern sites intercept with JS handlers and silently drop the call. Either `click` the submit button via its ref, or (if you know the GET URL) just `open` it directly.
409|- **Do not reuse refs across a page transition.** `wait` for the new state, then re-`state`. Old refs will either 404 or (worse) `reidentify` onto a similarly-shaped element on the new page.
410|- **`match_level: reidentified` is a warning, not an error.** The action went through, but if you are chaining 5 more writes that all depend on that being the right element, verify with a `get text` or `get value` before continuing.
411|- **Budget-aware commands silently cap.** `get html --as json` with default budgets will return `truncated: {...}`. If your downstream logic needs the whole subtree, raise `--depth` / `--children-max` or tighten the selector.
412|- **`autocomplete: true` on a `type` response is not an error.** It means a suggestion popup is open and your value isn't committed yet. Typically `keys Enter` to accept the first suggestion, or `click` the one you want.
413|- **`network --filter` is AND-semantics on path segments.** `--filter "title,score"` keeps entries whose body shape contains *both* `title` and `score` as path segments, at any depth. It is not a regex.
414|- **Screenshots are for humans, not for agents.** Use `state` + `find` unless the page is genuinely visual (captcha, chart). Screenshots burn tokens and rarely add signal an agent can act on.
415|
416|---
417|
418|## Troubleshooting
419|
420|| symptom | fix |
421||---------|-----|
422|| `aekb doctor` red: "Browser not connected" | Start Chrome with `--remote-debugging-port=9222`, or install the extension from the [Chrome Web Store](https://chromewebstore.google.com/detail/aek-b/ildkmabpimmkaediidaifkhjpohdnifk). |
423|| `attach failed: chrome-extension://...` | Disable 1Password / other CDP-hungry extensions temporarily. |
424|| `selector_not_found` right after `state` | Page mutated. `wait selector "..."` then retry. |
425|| `stale_ref` across every command | You are reusing refs from a prior page. Re-`state`. |
426|| `click` succeeds but nothing happens | The element is probably a decorative wrapper stealing clicks from the real target. `find --css "..."` with a narrower selector and retry on the inner element. |
427|| `type` appears to finish but value is wrong | Autocomplete, masked input, or React controlled re-render. Verify with `get value`. Add `keys Enter` or re-type. |
428|| Giant `get html` output | Pass `--selector` + `--as json --depth 3 --children-max 20 --text-max 200`. |
429|| Network cache seems stale | Bump `--ttl` down, or let it expire. The cache lives at `~/.aek-b/cache/browser-network/`. |
430|
431|---
432|
433|## See also
434|
435|- `references/adapter-author.md` — turning what you just figured out into a reusable `~/.aek-b/clis/<site>/<command>.js`.
436|- `references/browser-sitemap.md` — consuming site sitemap context while driving a browser task.
437|- `references/sitemap-author.md` — creating or updating sitemap knowledge when you discover a durable path or stale entry.
438|- `references/autofix.md` — when an existing adapter breaks, this skill walks you through `--trace retain-on-failure` evidence and filing a fix.
439|