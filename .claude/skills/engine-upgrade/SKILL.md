---
name: engine-upgrade
description: Upgrade this game to a newer pixel-engine version (git subtree pull), then fix what broke and record the new version. Use when the user says upgrade, update or pull the engine, or after an engine promote was merged and tagged.
---

# Upgrade the engine

The engine lives in `engine/` as a git subtree of `https://github.com/ahackel/pixel-engine.git`. `.engine-version` holds the tag last pulled; the game stays on it until you run this.

## 1. Before
- Working tree must be clean (`git status`); if not, ask the user to commit or stash.
- `cat .engine-version`, then `git ls-remote --tags https://github.com/ahackel/pixel-engine.git` for the tags. Use the tag the user names, else the newest.
- Show what changes: clone pixel-engine into the scratchpad and run `git log --oneline <old-tag>..<new-tag>` and `git diff --stat <old-tag> <new-tag>`; tell the user the notable changes.
- List local patches first: `git fetch ... refs/tags/$(cat .engine-version)` then `git diff --stat FETCH_HEAD HEAD:engine`. These must survive the pull (or have been promoted).

## 2. Pull
```bash
git subtree pull --prefix=engine https://github.com/ahackel/pixel-engine.git <new-tag> --squash -m "Engine <new-tag>"
```
On conflicts: files that were just promoted take upstream's side (`git checkout --theirs <file>`); real local patches are merged by hand so both are kept. Never resolve by discarding a local patch silently; say what you did.

## 3. After
- `echo <new-tag> > .engine-version`
- `npx tsc --noEmit -p .`, `npm run check:engine`, `npm test`, `npm run build`.
- Start the dev server and check the game loads (also `?cave` and an editor via F2), no console errors.
- Fix game code the engine change broke, in separate game commits from the engine pull.
- Commit `.engine-version` (with the fixes) and tell the user what the upgrade changed. Push only if asked.

## Rolling back
Before anything is pushed: `git reset --hard <commit before the pull>`. After pushing, revert the pull merge and `.engine-version`.
