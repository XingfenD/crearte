# Handoff — Game Runtime (crearte) — 2026-09-18

## Mission
Implement `docs/superpowers/plans/2026-09-17-game-runtime.md` (spec: `docs/superpowers/specs/2026-09-17-game-runtime-design.md`) using the subagent-driven-development workflow.

## Repo / branch state
- Repo: `/home/xingfen/Documents/MyDocs/Project/my-repos/crearte`
- Branch `feat/game-runtime`, pushed to `origin` (`git push -u origin feat/game-runtime` done).
- 25 commits ahead of `master`; HEAD = `08a8629 test: add playwright e2e for core runtime isolation`.
- Working tree clean except pre-existing untracked `STRUCTURE.md` (do NOT commit it unless the user asks).
- All npm commands run in `src/` (workdir=src). Node v24 / npm 11. System `google-chrome` exists; Playwright browsers were installed by Task 12 (check `src/playwright.config.ts` for whether `channel: 'chrome'` was used).

## Workflow being used (resume here)
- SDD workspace (gitignored): `.superpowers/sdd/`
  - Progress ledger: `.superpowers/sdd/progress.md` — read first; it records decisions, deferred minors, and per-task status.
  - Per task: `task-N-brief.md` (extracted from plan) and `task-N-report.md` (implementer report).
  - Review packages: `.superpowers/sdd/review-<base>..<head>.diff`.
- Skill scripts:
  - `/home/xingfen/.config/opencode/skills/subagent-driven-development/scripts/task-brief <PLAN> <N>`
  - `/home/xingfen/.config/opencode/skills/subagent-driven-development/scripts/review-package <BASE> <HEAD>`
- Controller pattern: dispatch implementer (fresh `general` subagent, brief + report path + context + adjudications) → review-package → dispatch task reviewer → fix loop → append ledger.

## Status
Tasks 1–11: complete, reviewed clean after fix rounds (see ledger for fix history).
Task 12: implemented (commit `08a8629`, implementer reports e2e 8/8 pass), **review was cancelled by the user mid-flight and never completed**. Next action: dispatch its reviewer.
- Reviewer input paths: brief `.superpowers/sdd/task-12-brief.md`, report `.superpowers/sdd/task-12-report.md`, diff `.superpowers/sdd/review-e344235..08a8629.diff` (Base `e344235`, Head `08a8629`).
- Task 12 files: `src/playwright.config.ts`, `src/e2e/helpers.ts`, `src/e2e/core.spec.ts`, plus root-cause fixes: `src/fixtures/catalog/*.json` gained `features.inlineScript: true`; `src/vite.config.ts` gained `test.exclude: ['e2e/**']`.
- Unverified claims to check: 8/8 pass; Chrome allows SW registration inside `sandbox="allow-scripts allow-same-origin …"` (two-stage fallback from spec §18 was not needed); storage-isolation test really asserts cross-origin `localStorage` (`storage` origin has `k=from-a`, `rel-paths` origin has `k=null`).

Remaining plan tasks: 13 (降级链/错误面板), 14 (版本更新/离线/缓存回收), 15 (存档 UI/清除/快照), 16 (C 模式 hosted), 17 (部署 nginx/k8s/docs), 18 (CI + 验收). Then final whole-branch review + changelog + finishing-a-development-branch.

## Controller adjudications already made (do not relitigate)
- Index.json summaries carry only `runtime`; detail JSON carries all runtime fields.
- Task 6 install keeps only the current `bundle-*` cache (plan code wins over spec keep-2/inconsistent comment); unconditional `skipWaiting` (spec idle-notify deferred).
- Per-game `features` pipeline implemented (user decision): fragment `features` JSON → bootstrap → `runtime:install` → meta → SW merges over `DEFAULT_FEATURES`.
- Bootstrap artifact is self-contained: `scripts/build-runtime.mjs` builds `bootstrap/main.ts` as IIFE and inlines it before `</body>` (Vite's `/assets/*` refs cannot be served by the 3-path wildcard host).
- SW client messages are listened on `navigator.serviceWorker` container, not `window` (verified empirically in Chrome; window never receives `client.postMessage`).
- `build:e2e` injects `VITE_GAMES_BASE_DOMAIN=localhost:4173`, `VITE_HOST_ORIGIN=http://localhost:4173` for both `vite build` and `build-runtime.mjs`.
- Task 17 repo drift: nginx lives at `deploy/nginx.conf`; repo has no `deploy/k8s/ingress.yaml` (CHANGELOG says ingress was removed for NodePort 30080) — adapt the plan task accordingly and verify against `deploy/k8s/*.yaml` + `deploy/compose*.yaml`.
- Final changelog goes to `docs/CHANGELOG.md` only (no `CHANGELOG_webui.md` in repo; web code lives under `src/`), per AGENTS.md format: English line then Chinese line, blank line between entries. Version bump suggestion: 0.2.0.

## Known risks for upcoming tasks
- Task 14 offline e2e (`context.setOffline(true)` + reload of the non-SW host page) may be flaky/fail; the host origin has no service worker. If it fails, keep the intent (installed game still playable offline) and adapt navigation (e.g. go to the game origin directly), and record the deviation.
- Task 13's `corrupt` fixture relies on shell `runtime:degrade` targetOrigin matching the host origin (solved by the e2e env injection above).
- Deferred minor findings (full list in ledger) include: `assetCacheKey` lacks JSDoc/guard for literal `.`/`..` segments; `useGameFrame` has no unit tests; dual watchers double-restart; SW `reader.cancel()` missing on early stop; `versionOverrides` persists per mock-server process.

## Commands
- Unit: `cd src && npx vitest run`
- Types/build: `cd src && npx vue-tsc --noEmit && npm run build`
- e2e: `cd src && npm run e2e` (webServer runs `npm run build:e2e && node scripts/serve-runtime.mjs --port 4173`)
- Data check: `cd src && npm run validate:data`

## Suggested skills for the next agent
1. `subagent-driven-development` — resume the per-task implement→review→fix loop; read `.superpowers/sdd/progress.md` first.
2. `verification-before-completion` — enforce evidence before claiming Task 12 review / final validation is done.
3. `requesting-code-review` — template for the final whole-branch review (use merge-base `master`..HEAD review package).
4. `finishing-a-development-branch` — after Tasks 13–18 and final review, decide integration (PR already available at https://github.com/XingfenD/crearte/pull/new/feat/game-runtime).
5. `systematic-debugging` — if Task 13/14 e2e exposes runtime failures (degrade chain, offline, cache self-heal).
