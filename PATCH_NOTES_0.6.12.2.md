# CloudeGift 0.6.12 — case catalogue and free-case controls

## Changes
- Expanded each of the 10 paid cases from 8 to 16 NFT gifts using existing catalog gifts and their original artwork.
- Kept each case's overall NFT probability unchanged. For the five mixed cases, the combined NFT weight remains 4,000 bp and all Star-prize weights remain unchanged at 6,000 bp. In NFT-only cases, the combined NFT weight remains 10,000 bp.
- Rebalanced the weight within each NFT pool by splitting each previous NFT weight between that gift and one newly added gift.
- Removed the quick-spin lightning control from the free case. Free-case openings always use the normal roulette animation; x1 and the existing cooldown remain.
- Sorted the prize list so all NFT gifts appear first and Star prizes appear below them.

## Unchanged
- Free-case rewards, task requirements, 24-hour cooldown, server-side RNG and inventory handling.
- Case prices, Star-prize weights, aggregate NFT/Stars odds, gift catalog prices, balances, and all other game screens.
- Backend and bot logic; the backend refreshes case drop tables from `frontend/src/data/cases.json` at startup.
