1|# references/browser-sitemap.md
2|
3|Use this skill when `aekb browser open` or `aekb browser analyze` reports `sitemap.available: true`, or when the user asks you to use a site's sitemap.
4|
5|The sitemap is **prior knowledge**, not ground truth. It should reduce blind clicking, but it must never override the live browser state.
6|
7|---
8|
9|## Consumption Loop
10|
11|1. Run or reuse `aekb browser <session> state` to know the current page.
12|2. Read only the smallest relevant sitemap files:
13|   - `SITE.md` for site-level orientation.
14|   - One matching `pages/<page-id>.md` for current state.
15|   - One matching `workflows/<task-id>.md` for the user goal.
16|   - `pitfalls.md` only when blocked or warned by the workflow.
17|3. Prefer the workflow's **Best path**. If it names an adapter such as `aekb twitter post`, use that before raw browser actions.
18|4. If the adapter is unavailable or fails, use the **Fallback path** browser workflow.
19|5. After each navigation or state-changing action, refresh `state` and compare the workflow's `state_signature`.
20|6. If reality disagrees, trust reality, continue probing, and write a local stale note or draft patch.
21|7. If an action recovery includes `adapter_health_update: <adapter> -> suspect|broken`, update the local overlay workflow that references that adapter so future agents go straight to the fallback path.
22|
23|---
24|
25|## Lookup Order
26|
27|Read local overlay first, then global seed:
28|
29|```text
30|~/.aek-b/sites/<site>/sitemap/    # local overlay
31|sitemaps/<site>/                    # repo seed (top-level)
32|```
33|
34|Local files override global files with the same stable id.
35|
36|Do not load an entire large sitemap into context. If the directory is large, list filenames first and then read only the page/workflow you need.
37|
38|---
39|
40|## Trust Reality Rule
41|
42|If sitemap says a button, URL, route, or API should exist but the browser does not show it:
43|
44|- Re-run `state` or `find` with semantic anchors.
45|- Check whether login, locale, viewport, A/B test, or route state differs.
46|- Follow the real page if a safe path is visible.
47|- Mark the sitemap item stale in local overlay.
48|
49|Never keep clicking because "the sitemap says it should work."
50|
51|---
52|
53|## Stale / Draft Notes
54|
55|When you discover drift, write a small local note under the relevant page/workflow file or a draft file in the local overlay:
56|
57|```md
58|Stale note:
59|- observed_at: YYYY-MM-DD
60|- current_url:
61|- expected:
62|- actual:
63|- next_probe:
64|```
65|
66|Do not edit global seed files unless the task is explicitly a sitemap-authoring or repo PR task.
67|
68|## Adapter Health Write-Back
69|
70|When an adapter fails and the sitemap action or workflow tells you to update adapter health:
71|
72|1. Find the local workflow file under `~/.aek-b/sites/<site>/sitemap/workflows/` whose `Best path` references the adapter command.
73|2. If no local workflow exists, copy the matching global workflow into the local overlay first; never edit the global seed directly during browser task execution.
74|3. Set `adapter_health: suspect` or `broken` as directed.
75|4. Add a short stale note with observed error, current URL, and timestamp.
76|5. Continue with the browser fallback path.
77|
78|This write-back is the memory loop: the current agent falls back once, and the next agent does not waste a turn retrying a known-suspect adapter.
79|
80|---
81|
82|## Output Discipline
83|
84|When reporting back, include:
85|
86|- Path chosen: adapter best path or browser fallback.
87|- Checkpoint reached: current URL/state signature.
88|- Sitemap health: used as-is, stale marked, or missing workflow.
89|
90|Keep the report task-focused. Do not summarize the whole sitemap.
91|