# CloudeGift 0.6.4

- Added the supplied 4.6-second CloudeGift logo animation as the launch intro. The main Mini App appears after playback ends; tap the intro to skip.
- Added a rotating demo drop feed in local Vite development mode. It cycles through inexpensive gifts, expensive gifts, and Telegram Stars, and is explicitly labelled `LIVE · ДЕМО`.
- In production, the live feed continues to use actual backend transactions only; demo entries are never generated for real users.
- Existing case-opening odds remain weighted and sum to 10,000 basis points per case. The backend remains authoritative for authenticated openings.
