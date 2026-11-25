# Каталог CloudeGift

- `telegram_gifts_market_stars_2026-11-25.xlsx` — актуальная таблица пользователя.
- `gifts_prices_source.csv` — полная копия листа `Floor по коллекциям`.
- `frontend/src/data/gifts.json` — нормализованный каталог 119 Telegram Gifts.
- `price_stars` берётся строго из колонки `Цена на маркете TG, ⭐ (от)`.
- `price_usd` берётся из колонки `Floor, $`.
- Названия коллекций синхронизированы с колонкой `Коллекция`.
- `frontend/public/assets/gifts/<folder>/model.png` — оригинальные PNG-модели подарков.
- `Mirage Lamp` присутствует в таблице, но исходного `model.png` в каталоге нет; для него используется placeholder.
- Редкость — внутренняя ценовая категория CloudeGift, не официальный атрибут Telegram.
