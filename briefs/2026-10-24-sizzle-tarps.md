# Brief from Claude chat, 24 Oct 2026: tarps on the sizzle Equipment checklist

Jon asked in Claude chat (24 Oct) to add tarps to the sizzle Equipment checklist (doc 03). Not crates.

## Already done by Claude chat

- Edited `data/sizzle/sizzle-2026.json`: one new equipment entry straight after "Gazebo (with weights/pegs)":
  `{"item": "Tarp or tarps (to cover up if it rains)", "status": "tbc", "qty": 1}`
  Not committed. Nothing else in this repo was changed.
- Claude chat ran only read-only git commands (status, diff, ls-remote) from its Linux shell. That view showed about 384 files changed, all line-ending noise. Ignore it and trust Windows git.

## To do in Claude Code on the hub

1. Run `git status`. Expect the JSON change plus what was already there: `.claude/settings.local.json`, `1 Start Claude Code.lnk`, `server/data/siteguide_airspace.txt`, `server/data/siteguide_zones.json` modified, `ecmwf-strip-after.png` untracked. Commit only the JSON.
2. Run the sizzle tests: `node --import tsx/esm shared/sizzle/sizzle.test.mjs`.
3. Commit `[TASK-037] Sizzle: tarps on the equipment checklist`, then push and deploy to main the usual way and live-check.
4. Re-save 03 Equipment checklist to Drive from the till Docs tab and check it lists the tarp.
5. Tick the tarp item in `tasks\todo.md`, update `RESUME_HERE.md` and the SkyHigh line in `C:\CodeFolder\TODO.md`.
