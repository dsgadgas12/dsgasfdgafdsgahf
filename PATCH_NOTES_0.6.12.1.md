# CloudeGift 0.6.12 — focused UI fixes

This patch is based on the uploaded 0.6.12 project. The previous 0.6.11 case layout was used as the visual reference; the 0.6.12 backend, free-case tasks/cooldown, batch-opening API, catalogue, prices, and drop probabilities were retained.

## Changes
- Restored the previous multi-open case preview: selecting x2–x5 now visibly changes the preview to the matching number of synchronized rows.
- Restored the `Что может выпасть` section title, placement, and compact prize-card grid from 0.6.11.
- Kept the 0.6.12 batch API for normal cases; opening x2–x5 requests and animates all returned prizes together.
- Restricted the free case to x1 only. Its x2–x5 controls are not shown because the free case is governed by its daily cooldown.
- Changed the lightning button into a persistent fast-mode toggle. It lights up when enabled; the next opening still runs the roulette, but the animation is shortened to about 1.15 seconds instead of skipping the animation.
- Kept the winning item neutral during the spin; it receives a subtle purple highlight only after all lanes stop.
- Removed the upgrade-history block and its local history-writing code.

## Intentionally unchanged
- Existing case catalogue, gift catalogue, prices, odds, balance handling, inventory, free-case tasks, cooldown checks, bot/backend, and other screens.
