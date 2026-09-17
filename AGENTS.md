# AGENTS.md

## Safety Rules
- Dev branch naming: `{feat|fix|docs|chore}/{branch-name}` (e.g. `feat/file-tag-done`, `fix/tree-render`).
- Before `git commit`: run `git branch --show-current`. If on `master`, do NOT commit — ask user for a branch name (suggest one based on the changes, e.g. `docs/simplify-branch-workflow`), create it, commit there.
- General changes → `docs/CHANGELOG.md`; WebUI changes → `docs/CHANGELOG_webui.md` (files under `web/`). Higher versions on top.
ANGELOG entry format: same entry has English line then Chinese line on consecutive lines (no blank line between them); different entries are separated by a blank line.
