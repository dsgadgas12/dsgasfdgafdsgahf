# CloudeGift 0.6.22 — LIVE restored to uploaded 0.6.18 behavior

- Replaced the artificial two-row LIVE/DEMO widget with the exact single-row LiveFeed component
  from the user's uploaded `CloudeGift_0.6.18_upgrade_odds_restored.zip`.
- Preserved PAWW's authenticated `/api/live` polling every 5 seconds.
- Preserved withdrawal requests, user withdrawal history, and admin withdrawal management from PAWW.
- The frontend does not generate fake LIVE events for production users; real items come from `/api/live`.
- The source still requires a fresh frontend build before deployment.
