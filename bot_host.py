"""Bot-Hosting entry point: serve the Mini App/API and poll Telegram in one process."""
from __future__ import annotations

import asyncio
import logging
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
os.chdir(ROOT)
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv
load_dotenv(ROOT / ".env")


def validate_environment() -> int:
    required = ("BOT_TOKEN", "WEBAPP_URL", "JWT_SECRET")
    missing = [key for key in required if not os.getenv(key, "").strip()]
    if missing:
        raise RuntimeError("Заполните переменные окружения: " + ", ".join(missing))
    jwt_secret = os.getenv("JWT_SECRET", "").strip()
    if jwt_secret in {"CHANGE_ME", "CHANGE_THIS_TO_A_LONG_RANDOM_SECRET", "local-isolated-test-secret-not-production"} or len(jwt_secret) < 48:
        raise RuntimeError("JWT_SECRET должен быть случайной строкой длиной не менее 48 символов")
    webapp_url = os.environ["WEBAPP_URL"].strip()
    if not webapp_url.startswith("https://"):
        raise RuntimeError("WEBAPP_URL должен быть публичным HTTPS-адресом Bot-Hosting")
    index_file = ROOT / "frontend" / "dist" / "index.html"
    if not index_file.is_file():
        raise RuntimeError("Не найден frontend/dist/index.html. Сначала соберите Mini App: cd frontend && npm ci && npm run build")
    try:
        port = int(os.getenv("SERVER_PORT", "3000"))
    except ValueError as exc:
        raise RuntimeError("SERVER_PORT должен быть числом") from exc
    if not 1 <= port <= 65535:
        raise RuntimeError("SERVER_PORT вне допустимого диапазона")
    return port


async def main() -> None:
    port = validate_environment()
    logging.basicConfig(
        level=os.getenv("LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    import uvicorn
    from backend.main import app, init_db
    from bot.bot import bot, dp

    init_db()
    config = uvicorn.Config(
        app,
        host="0.0.0.0",
        port=port,
        log_level="info",
        proxy_headers=True,
        forwarded_allow_ips="*",
    )
    server = uvicorn.Server(config)
    api_task = asyncio.create_task(server.serve(), name="cloudegift-api")
    bot_task = asyncio.create_task(dp.start_polling(bot, handle_signals=False), name="cloudegift-telegram-bot")
    try:
        done, _ = await asyncio.wait({api_task, bot_task}, return_when=asyncio.FIRST_COMPLETED)
        for task in done:
            await task
        if not server.should_exit:
            server.should_exit = True
        await api_task
    finally:
        server.should_exit = True
        for task in (bot_task, api_task):
            if not task.done():
                task.cancel()
        await asyncio.gather(bot_task, api_task, return_exceptions=True)
        await bot.session.close()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
