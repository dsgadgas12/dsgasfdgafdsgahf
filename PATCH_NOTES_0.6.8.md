# CloudeGift 0.6.8

- Reduced the flat-price look in the gift shop: the 34 common gifts previously listed at 433 Stars now range from 438 to 453 Stars.
- Applied small per-gift increases of +5, +10, +15 or +20 Stars; other catalog prices were left unchanged.
- Backend startup sync already upserts the catalog prices from `frontend/src/data/gifts.json`, so the updated prices propagate to the database on restart.
- Preserved the LIVE strip, header balance and top-up window from 0.6.7.
