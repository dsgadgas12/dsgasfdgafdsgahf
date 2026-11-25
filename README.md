# CloudeGift 0.6.20

Telegram Mini App с кейсами, каталогом Telegram Gifts, магазином, профилем и инвентарём, апгрейдером, NFT-слотами и минами. Все игровые операции и изменения баланса выполняются backend после авторизации через Telegram Mini App `initData`. Клиентский локальный баланс, поддельный инвентарь, демонстрационные выигрыши и синтетический рейтинг удалены.

## Структура

- `frontend/` — React + Vite Mini App; 119 позиций каталога и изображения NFT в `public/assets/`.
- `backend/` — FastAPI API и SQLite-схема.
- `bot/` — Telegram-бот на aiogram 3.
- `bot_host.py` — единый entrypoint для Bot-Hosting: FastAPI + polling бота на порту `SERVER_PORT`.
- `BOT_HOSTING.md` — пошаговая настройка Bot-Hosting.net.

## Bot-Hosting.net

1. Установи Node.js 20+ на компьютере.
2. Собери frontend: запусти `build-for-bothost.ps1` в Windows или `./build-for-bothost.sh` в macOS/Linux. Скрипт автоматически создаст upload ZIP рядом с папкой проекта, добавив `frontend/dist`.
3. Загрузи созданный `CloudeGift_BotHosting.zip`; в нём файлы проекта находятся прямо в корне, без `.env`, `node_modules`, `.venv` и локальной базы.
4. Создай в Bot-Hosting deployment типа **Application**, runtime **Python** (рекомендуется 3.12), загрузи ZIP и распакуй его в корень deployment.
5. В Startup укажи `bot_host.py` как Entry File.
6. Установи переменные `BOT_TOKEN`, `WEBAPP_URL`, `JWT_SECRET`, `CORS_ORIGINS`, `ADMIN_TG_IDS`, `DATABASE_PATH` и настройки канала бесплатного кейса. Подробности — в `BOT_HOSTING.md`.
7. Включи HTTPS subdomain в панели. Укажи этот же адрес в `WEBAPP_URL` и `CORS_ORIGINS`, затем установи его в BotFather через `/setdomain` и Main App/Menu Button.
8. Проверь `/health`, затем открой приложение через Telegram.

Корневой `requirements.txt` устанавливает Python-пакеты. `bot_host.py` слушает `0.0.0.0:$SERVER_PORT`; порт выделяет Bot-Hosting. Для SQLite включи persistent storage для `backend/data`.

## Локальная сборка frontend

```bash
cd frontend
npm ci
npm run build
```

Для локального просмотра только оболочки Vite можно запустить `npm run dev`, но авторизация, баланс, инвентарь и игровые операции будут доступны только внутри Telegram с работающим backend и действительным `BOT_TOKEN`.

## Локальный backend и bot

Скопируй `.env.example` в `.env`, заполни `BOT_TOKEN`, `WEBAPP_URL`, `JWT_SECRET` и необходимые настройки. Затем:

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python bot_host.py
```

Для запуска Mini App локально через Telegram потребуется публичный HTTPS URL и корректная настройка BotFather; локальный браузерный вход в обход Telegram не предусмотрен.

## Безопасность и реальные ограничения

- Telegram `initData` проверяется HMAC-подписью на backend. Без `BOT_TOKEN` авторизация завершается ошибкой.
- JWT подписывается `JWT_SECRET`; заменяй шаблон на длинный случайный секрет.
- Админские endpoint проверяют числовой Telegram ID из `ADMIN_TG_IDS`; фронтенд не выдаёт административные права самостоятельно.
- Баланс и инвентарь загружаются только из backend. Если сервер недоступен, действия не выполняются локально.
- Результаты кейсов, апгрейдов, слотов и мин вычисляются на backend, а не выбираются клиентской анимацией.
- Для кейсов на каждом 20-м открытии предусмотрен премиальный пул согласно текущей серверной логике; остальные открытия используют обычный пул.
- Бесплатный кейс проверяет подписку на `@CloudeCaseNews`; бот должен быть администратором канала.
- Лидерборд не содержит вымышленных участников: пока нет серверного endpoint реального рейтинга, отображается пустое состояние.
- Tonkeeper открывает предзаполненный native transfer на `GRAM_WALLET_ADDRESS`; автоматическое подтверждение входящего блокчейн-платежа и зачисление в баланс не реализованы, требуется ручная проверка администратора. Для отдельного Jetton-токена нужна отдельная интеграция с master-адресом контракта.
- Вывод Stars и NFT создаёт заявку; фактический перевод выполняется оператором вручную.
- Перед публичным запуском нужны нагрузочное тестирование, rate limits, мониторинг, проверка резервного копирования и аудит игровых вероятностей.
