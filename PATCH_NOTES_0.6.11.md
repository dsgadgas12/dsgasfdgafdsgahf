# CloudeGift 0.6.11 — Free Case tasks and share banner

- Added a free-case conditions modal matching the supplied reference: send the invitation to three chats, subscribe to the channel, then press “Я выполнил”. The “visit the app” task is not included.
- Added the user's supplied CloudeCase invitation banner to the Telegram share message. The image is converted to JPEG and served from `/assets/share/cloudec-case-invite.jpg`.
- Added Telegram native `shareMessage` flow. A share is counted only after Telegram's callback confirms that the message was sent; cancelled share dialogs are not counted.
- Added server-side share tokens and progress storage. Each successful share token can be counted once, and progress is capped at 3.
- Added channel membership verification through Bot API `getChatMember`. The bot must be an administrator in the configured channel. A missing or failed channel check never counts as success.
- Added a 24-hour free-case cooldown enforced by the backend. The UI shows a compact `HH:MM:SS.mmm` countdown.
- Added star prizes from 2 to 700 ⭐. 2 ⭐ remains the default result; other star tiers and original catalog gifts remain extremely rare. Drop odds are not shown in the UI or API response.
- Added `.env` settings `FREE_CASE_CHANNEL`, `FREE_CASE_CHANNEL_URL`, and optional `BOT_USERNAME`.

## Important Telegram limitation

Telegram confirms that a prepared message was sent, but does not expose the destination chat or recipient identity to the Mini App/bot. Therefore the app counts three successful Telegram send confirmations; it cannot prove that they were three different people/chats. The channel subscription is checked against Telegram through `getChatMember`.

## Setup required before production

1. Set `WEBAPP_URL` to the public HTTPS domain serving the Mini App.
2. Set `BOT_TOKEN`.
3. Set `FREE_CASE_CHANNEL` and `FREE_CASE_CHANNEL_URL` after the channel is chosen.
4. Add the bot as an administrator of that channel so `getChatMember` can check other users.
5. Confirm that `https://YOUR_DOMAIN/assets/share/cloudec-case-invite.jpg` is publicly accessible.
