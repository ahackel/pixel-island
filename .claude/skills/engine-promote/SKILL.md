---
name: engine-promote
description: Move local engine changes or general game assets from this game into the shared pixel-engine repo as one clean engine change on a branch. Use when the user says promote, push to the engine, make this part of the engine, or share a change or asset with other games.
---

# Promote to pixel-engine

The engine lives in `engine/` as a git subtree of `https://github.com/ahackel/pixel-engine.git`; `.engine-version` holds the tag last pulled. Game history may be messy: only the engine side must come out clean, as one change on a branch.

## 1. What is being promoted
- **Local engine patches** (edits under `engine/`): `git fetch https://github.com/ahackel/pixel-engine.git refs/tags/$(cat .engine-version)` then `git diff --stat FETCH_HEAD HEAD:engine` lists them (paths relative to the engine root). Use the full diff to read them.
- **Game assets or code** the user names (e.g. `src/content/face-shapes.json`, a preset, a helper): read them and decide where in the engine they belong (see engine/CLAUDE.md Layout).
Ask the user which of the changes to promote when it is not clear. What is not promoted stays a local patch.

## 2. Generalise
The engine must not know any game: no game names, quests, story text, seeds or imports from `src/`. Move game-specific values out into parameters or leave them in the game. A game asset that overrides an engine default (like `src/content/face-shapes.json`) becomes the new default in the engine file, and the game's copy is then deleted in step 5.
Run from the game: `node engine/scripts/check-boundary.mjs`.

## 3. Build the engine change in a scratch clone (never in `engine/` itself)
```bash
S=<scratchpad>/pixel-engine-promote
git clone https://github.com/ahackel/pixel-engine.git $S && cd $S
git checkout -b promote/<topic> $(cat <game>/.engine-version)
```
Apply the patch (`git diff FETCH_HEAD HEAD:engine > p.diff`, then `git apply p.diff`) or copy promoted assets in, adjust, then `git merge origin/main` (or rebase) when the engine moved on, and fix conflicts. In the clone run `npm ci`, `npx tsc --noEmit`, `node scripts/check-boundary.mjs` and the engine's checks that touch the change (`node scripts/check-all.mjs`).
Commit as **one commit** (or a few focused ones if the change is really several things) with a message that says what the engine can now do, not which game wanted it. Add `Co-Authored-By` as usual.

## 4. Push a branch, never main
`git push -u origin promote/<topic>`. Tell the user the branch and what it contains; they review and merge. Tagging is theirs too (`vX.Y.Z`); suggest a tag but do not create or push one unasked.

## 5. After the user merged and tagged
Run the `engine-upgrade` skill to that tag. Promoted files then match upstream; where the generalised version differs from the local patch, take upstream's side. Delete the game's now redundant override files.

## Never
- Push to pixel-engine `main`, force-push, or create tags without being asked.
- Promote anything that mentions this game.
