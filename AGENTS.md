# AGENTS.md

## Safety Rules
- Dev branch naming: `{feat|fix|docs|chore}/{branch-name}` (e.g. `feat/file-tag-done`, `fix/tree-render`).
- Before `git commit`: run `git branch --show-current`. If on `master`, do NOT commit — ask user for a branch name (suggest one based on the changes, e.g. `docs/simplify-branch-workflow`), create it, commit there.
- General changes → `docs/CHANGELOG.md`; WebUI changes → `docs/CHANGELOG_webui.md` (files under `web/`). Higher versions on top.
- CHANGELOG entry format: same entry has English line then Chinese line on consecutive lines (no blank line between them); different entries are separated by a blank line.
- Merging into `master`: always create a merge commit — `git merge --no-ff <branch>` (never fast-forward, the integration point must be recorded). Delete the merged branch afterwards.

## Frontend build & guard invariants

Every rule below cost a rework cycle to learn (P13). They are checked by the build or by a guard, not by review diligence.

- **Tailwind v4 scans every source file, including `.test.ts` / `.spec.ts`.** A class-name literal in a test comment or assertion is treated as a candidate and burns a dead utility into the artifact. Measured: two comment literals produced `.bg-[#EFE9DA]{background-color:#efe9da}` and moved the artifact hash `C7966Gm-`→`CV7wAyTH` with `var(--color-*)` 75→76. Never write a full utility literal in a test or comment — build it by concatenation (`'backdrop:bg-i' + 'nk/60'`). This matters most for regression pins asserting a utility must *not* appear: writing the literal to forbid it is what re-creates it.
- **Source-level guards under `app/lib/*.test.ts` run in the node environment, not happy-dom.** `fileURLToPath(new URL('../..', import.meta.url))` throws `TypeError [ERR_INVALID_URL_SCHEME]: The URL must be of scheme file` under happy-dom. A guard that reads files from disk belongs in its own node-environment test file; every existing disk-reading guard in this repo already is.
- **A guard gets the same scrutiny as the code it guards — verify both directions**: no false-red on legal values *and* no false-green under mutation. Checking only the first direction is how a vacuous assertion ships. `max(a, b) >= k` is the hot zone: when `a` and `b` are complementary, `max` has a non-trivial lower bound, and any threshold below it can never fail. P13's scrim guard asserted `max(fill, border) >= 3` where the bound is `sqrt(cr(paper, ink)) = 4.0621`, so whitening the light scrim (fill side 1.1165, i.e. panel indistinguishable from backdrop) still passed. Pin the specific side that provides the property instead.
- **Match literal CSS selectors in build output with `grep -F`, never a hand-escaped backslash pattern.** An escaped pattern silently returns 0 for a rule that is present, which reads as "the class is gone" when it is not. Same trap in reverse: `grep -c` exits 1 when it prints 0, so a grep inside an `&&` chain silently skips everything after it — including a `git commit`.
