# CloudeGift — состояние проекта 0.6.19

## Реализовано

- React + Vite Mini App, увеличенный wordmark, каталог Telegram Gifts, кейсы, магазин, профиль и инвентарь.
- Авторизация только через Telegram Mini App `initData`; сервер проверяет HMAC и выдаёт JWT.
- Серверные операции для кейсов, апгрейдера, NFT-слотов, мин, покупок, промокодов и запросов на вывод.
- Telegram Stars invoice и обработка successful payment с идемпотентностью по `telegram_payment_charge_id`.
- Telegram-бот на aiogram 3 с кнопкой Mini App.
- Нет локального демонстрационного баланса, генерации фиктивного инвентаря, тестового входа `dev_user`, фальшивого LIVE feed или выдуманных строк лидерборда.
- При отсутствии backend/Telegram сессии интерфейс блокирует игровой функционал и не подменяет его локальной симуляцией.

## Bot-Hosting.net

- `bot_host.py` запускает FastAPI и Telegram polling в одном процессе.
- Корневой `requirements.txt` содержит Python-зависимости.
- Приложение слушает `0.0.0.0` на порту `SERVER_PORT`, который передаёт Bot-Hosting.
- Mini App раздаётся FastAPI из `frontend/dist` с того же HTTPS-origin, что и `/api`.
- Нужно сначала выполнить `cd frontend && npm ci && npm run build`, затем включить `frontend/dist` в загружаемый ZIP.
- Нужно заполнить секретные переменные в панели и настроить persistent storage для `backend/data`.

## Непроверенные внешние шаги

- Полная frontend-сборка в текущем окружении не завершилась: `npm ci` превысил лимит времени, поэтому `frontend/dist` не приложен.
- Реальное развёртывание в Bot-Hosting требует доступа к аккаунту, создания deployment и его HTTPS URL.
- GRAM auto-credit, автоматический вывод NFT/Stars, PostgreSQL/Redis и нагрузочное тестирование пока не реализованы.
