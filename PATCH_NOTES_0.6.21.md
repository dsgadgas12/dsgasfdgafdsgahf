# CloudeGift 0.6.21 — PAWW base + LIVE demo rail and withdrawal UI

## Merged
- PAWW 0.6.20 remains the base: backend, database schema, Telegram authentication,
  payment handling, withdrawal API, admin authorization, catalog and hosting entrypoint are preserved.
- Added the visually separate LIVE / ДЕМО feed from the LIVE source. The ДЕМО rail is explicitly
  labeled and is client-side presentation only: it does not create wins, balance changes or API requests.
- Kept the PAWW withdrawal flow: user request form, “Мои заявки” status history, and admin
  “Заявки на вывод” controls (processing / paid / rejected).
- `bot_host.py` now accepts either `SERVER_PORT` or `PORT`; `SERVER_PORT` takes precedence.

## Important build note
The source frontend is updated, but this package must be rebuilt before deployment.
Run `./build-for-bothost.sh` (Linux/macOS) or `build-for-bothost.ps1` (Windows) on a machine
with Node.js 20+ and npm. The package script now refuses to create the final Bot-Hosting ZIP
if the compiled bundle does not contain the LIVE demo rail and withdrawal UI markers.

## Verification
- Source-level checks: LIVE demo rail and user/admin withdrawal components are present.
- Backend routes: `/api/withdrawals`, `/api/admin/withdrawals`,
  `/api/admin/withdrawals/{request_id}/status`, and `/api/live` are present in PAWW backend.
- A fresh Vite build could not be completed in the preparation environment because npm registry
  access timed out. Do not deploy the existing `webapp` bundle until the build script succeeds.
