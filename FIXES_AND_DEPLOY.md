# CloudeGift deployment fixes

This source patch includes:
- Persistent SQLite path handling for Bot-Hosting (`/app/data`), with one-time copy of an existing project-relative database when present.
- `/health` diagnostics for database case/gift counts and frontend build presence.
- More informative 404 details for case IDs, to identify frontend/backend catalog mismatches.
- Bot-Hosting default web port set to `3000` (can still be overridden with `SERVER_PORT`).
- The existing `frontend/public/assets/cloudegift-intro.mp4` is used as the startup/auth loading animation; the shield screen and skip button are removed.
- The free-case task text now explains that three separate successful share actions are needed. Telegram's `shareMessage` callback only confirms that a share action completed; it does not disclose how many recipients were selected, so the app cannot verify three recipients from one multi-recipient share dialog.

## Before deployment

1. Back up the current Bot-Hosting persistent database directory (`/app/data`). Do not delete it.
2. In Bot-Hosting, set `DATABASE_PATH=/app/data/cloudegift.sqlite3` and `SERVER_PORT=3000`.
3. On the development PC, run `npm.cmd ci` and `npm.cmd run build` in `frontend`.
4. From the project root, run `git add -f frontend/dist`, `git add .`, commit, and push to the configured branch.
5. Rebuild/redeploy the bot. Check `/health`; expected database counts include 10 active cases and 180 case-item rows for the included catalog.

The existing database is not deleted or reset by this patch. The backend continues to seed/update the case catalog from `frontend/src/data/cases.json` on startup.
