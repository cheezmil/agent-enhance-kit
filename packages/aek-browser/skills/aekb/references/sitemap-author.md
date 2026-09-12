1|# references/sitemap-author.md
2|
3|You are authoring a **task execution graph for agents**, not an SEO sitemap. The artifact should help an agent using `aekb browser` decide where it is, what path to take next, which AEK Browser adapter to prefer, and how to recover when the page disagrees with memory.
4|
5|Keep the sitemap small and verified. Do not crawl a whole site. Capture only task-relevant paths that you actually observed.
6|
7|---
8|
9|## Storage Model
10|
11|Two layers:
12|
13|- **Global seed**: `sitemaps/<site>/` (top-level)
14|- **Local overlay**: `~/.aek-b/sites/<site>/sitemap/`
15|
16|Local overlay wins by stable id. Write new discoveries to local first. Promote to global only after review.
17|
18|Recommended layout:
19|
20|```text
21|sitemap/
22|  SITE.md                 # site purpose, auth assumptions, stable page ids
23|  pages/<page-id>.md      # page state signatures, actions, linked APIs
24|  pages/_<partial>.md     # cross-page UI partial (e.g. _tweet_card.md)
25|  workflows/<task-id>.md  # best path, fallback path, avoid list
26|  pitfalls.md             # durable failure modes and stale areas
27|```
28|
29|### Size guidance（实测启发式）
30|
31|`references/sitemap/sitemap-schema.md` §1.1 spec 硬 800 token，但 PoC 实测简单站单 page 1-2 action 自然落到 800-2000 token。强拆反碎，author 用下表决策：
32|
33|> spec 800 是 lazy-load 优化目标 + Phase 2 audit 阈值；下表是 author 实战决策辅助，**不替代 spec hard 限制**。超 800 的文件 audit 会 flag，author 解释（"5 个 cohesive UI primitive 一起放"）或拆。
34|
35|| 文件 token | 决策 |
36||---|---|
37|| < 1500 | 自然 size，不动 |
38|| 1500-3000 | 看 cohesion — 5 个 cohesive UI primitive 一起放 OK；mixed 内容拆 |
39|| > 3000 | **必拆** sub-file 或 partial（agent lazy load budget 真有限制） |
40|
41|Phase 2 cron audit 按 token count 不按 byte count（CJK 中文 token-per-char 比 English 高 30-50%）。
42|
43|---
44|
45|## Authoring Loop
46|
47|1. **Load existing memory**: read local overlay first, then global seed if present.
48|2. **Verify reality**: use `aekb browser <session> state`, `find`, `network`, and `analyze`; browser state is truth. If you just completed an `references/adapter-author.md` session for this site, start from the retained browse trace under `~/.aek-b/sites/<site>/traces/` as seed evidence instead of re-discovering the path from zero.
49|3. **Record only durable structure**: page purpose, stable anchors, state signature, actions, workflows, API references, pitfalls.
50|4. **Use stable ids**: page/action/workflow ids should survive URL params, locale text drift, and minor layout changes.
51|5. **Write local draft**: update `~/.aek-b/sites/<site>/sitemap/...` unless explicitly promoting to repo.
52|6. **Mark stale on conflict**: if existing sitemap disagrees with current browser state, trust browser state and mark the item stale rather than forcing the old path.
53|
54|---
55|
56|## Required Action Schema
57|
58|Every action edge must include:
59|
60|```yaml
61|### action:<stable-id>
62|pre: <current page / state / auth requirements>
63|do: <agent action, adapter command, or semantic browser command>
64|post: <URL / state / output that proves success>
65|fail: <failure signal 1> | <signal 2>
66|recover: <fallback instruction>; adapter_health_update: <adapter> -> suspect
67|evidence: aekb browser <cmd> or trace:<path>
68|```
69|
70|Use this compact form by default. Use the longer Markdown form from `references/sitemap/sitemap-schema.md` only when an action genuinely needs long explanation. `verified_at` and `source` are inherited from file frontmatter; do not repeat them per action.
71|
72|Do not promote an action without evidence. If a recovery path marks `adapter_health_update`, the browser-sitemap consumer must write that health update to the local overlay so the next agent does not retry a known-suspect adapter.
73|
74|### Partial pages（跨页通用 UI）
75|
76|partial 文件 (`_<name>.md`，`url_patterns: []`) 装跨页 UI 原语（如 `_tweet_card.md` 的 like/reply/repost/bookmark）。被多 page 通过 `action:<id> in pages/_<name>.md` 引用。
77|
78|**Partial scope rule**：partial 内所有 selector（testid / a11y / structural）**必须 scoped 到 partial root**，不能是 page-level first match。例如 `_tweet_card.md`:
79|
80|```yaml
81|# ❌ 错：page-level first match，会点到 timeline 首条非 target card
82|do: click [data-testid="like"]
83|
84|# ✅ 对：scoped 到 article root
85|do: click [data-testid="like"] in article[role="article"] (card scope)
86|```
87|
88|partial 文件顶部写明 scope root 一行：
89|
90|```md
91|## Card scope rule
92|所有 testid selector 必须 scoped 到 `article[role="article"]`，不能用 page-level first match。
93|```
94|
95|---
96|
97|## Workflow Fields
98|
99|Each workflow should answer:
100|
101|- **Goal**: user-facing task this workflow solves.
102|- **State signature**: minimal observable checkpoint for resume after sleep/compaction.
103|- **Best path**: prefer existing `aekb <site> <command>` adapter if it covers the goal.
104|- **Fallback path**: browser workflow if the adapter is missing or failing.
105|- **Avoid**: tempting paths that waste turns, trigger modals, or rely on unstable selectors.
106|- **Stale markers**: last verified date and known layout/API drift signals.
107|
108|Endpoint/API knowledge should reference ids from `endpoints.json` when available. Do not duplicate full endpoint schemas inside sitemap files.
109|
110|### Fallback `on_adapter_fail:` convention（推荐）
111|
112|Fallback path 第一行声明触发条件 + adapter_health_update directive，把"为什么走 fallback"和"标 adapter suspect"放一起：
113|
114|```yaml
115|on_adapter_fail:
116|  - adapter_health_update: aekb twitter post -> suspect
117|  - aekb browser state (verify current page)
118|  - if not on /home: goto /home
119|  - action:open_compose in pages/home.md
120|  - ...
121|```
122|
123|比纯 step list 清晰：consumption skill 看到 `on_adapter_fail:` key 知道这是 adapter-trigger 而非 entry-point fallback，directive 先执行后续才走 steps。schema v1.2 candidate，目前作为 SKILL guideline 推荐。
124|
125|## SITE.md `Top-level routes` — 标 uncovered routes
126|
127|`SITE.md` 的 `Top-level routes` 不仅列已覆盖的 page，也应**显式标存在但 sitemap 不导航**的 route，避免 agent 默认"sitemap 没列 → 不存在"：
128|
129|```md
130|## Top-level routes
131|
132|- /home → pages/home.md
133|- /search → pages/search.md
134|- /messages → pages/messages.md（DM，本 PoC v1 不覆盖）   # ← 显式 uncovered marker
135|- /settings → 不在 sitemap scope，agent 自探         # ← 同上
136|```
137|
138|不写 = agent 不知该 route 存在；写 + 标 uncovered = agent 知道存在但 sitemap 帮不上忙，自己探。
139|
140|---
141|
142|## Red Lines
143|
144|- Sitemap is a hint; current browser state is truth.
145|- Do not write secrets, cookies, user-private ids, private messages, or account-specific values.
146|- Do not document bypasses for CAPTCHA, WAF, access control, rate limits, or paid gates.
147|- Do not store brittle snapshot indices like `[17]` as durable targets. Store semantic anchors and recovery instructions.
148|- Do not describe unverified paths as facts. Use `draft` or `stale` labels.
149|- Drafts go inside `sitemap/draft-<topic>.md`, not `~/.aek-b/sites/<site>/sitemap.draft.md` at the parent level — the latter is invisible to `aekb browser` sitemap availability detection.
150|
151|---
152|
153|## Detailed schema
154|
155|See [`references/sitemap/sitemap-schema.md`](references/sitemap/sitemap-schema.md) for the full field-level spec — `SITE.md` / `pages/<id>.md` / `workflows/<id>.md` / `apis.md` / `pitfalls.md` schemas, action-level state signatures, `adapter_health` enum (healthy / suspect / broken), endpoint reference rules, two-layer overlay semantics, draft placement, and Phase 2 validation rules.
156|