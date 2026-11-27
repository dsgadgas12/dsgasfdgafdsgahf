# CloudeGift 0.6.12 — Update 3

## Case list
- Removed the separate “Кейсы за звёзды ⭐” and “Кейсы с NFT 💎” section headings.
- All paid cases now appear together in one grid under the main “Кейсы” heading.

## Star rewards
- Cases priced at 500–1,500 Stars: added Star rewards from 100 to 5,000.
- The 2,500-Star Techno case: added Star rewards from 100 to 5,000.
- Both 5,000-Star cases: added Star rewards from 100 to 3,000.
- The 10,000-Star and 15,000-Star cases: added 10,000-Star and 20,000-Star rewards.
- Existing NFT gifts remain in every case; all 10 paid cases contain 16 NFT gifts.

## Drop chances
- The five previously mixed low-price cases retain their existing 40% NFT / 60% Stars split.
- The 2,500-, 5,000-, 10,000-, and 15,000-Star cases use 90% NFT / 10% Stars. This keeps the new Star prizes as a rare bonus in the premium cases.
- Each case's drop weights sum to 10,000 basis points.
- Added all new Star reward records to the backend's startup seed list so case rewards resolve correctly in the database.

## Validation
- All 10 case pools validated: 16 NFT gifts, correct Star reward ranges, and 10,000 total weight each.
- Frontend TSX syntax check passed.
- Backend Python syntax check passed.
- A full Vite production build was not run because frontend dependencies are not installed in this working copy.
