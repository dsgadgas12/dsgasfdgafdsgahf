# CloudeGift 0.6.20 — Tonkeeper и бесплатный кейс

- Привязан публичный адрес кошелька `UQD2v-fRnsSr8Jov3dp4hRa7vxZbtJVqJaZKrw0EhpEgo0Os` через серверную настройку `GRAM_WALLET_ADDRESS`.
- Добавлен публичный endpoint `/api/public-config`, который отдаёт только адрес получателя и не раскрывает секреты.
- Исправлена Tonkeeper-ссылка: теперь в неё передаются адрес, сумма нативного актива в минимальных единицах (9 знаков после запятой) и уникальный memo. Для Jetton-токена отдельно нужен master-адрес.
- Настроено задание подписки на `@CloudeCaseNews` со ссылкой `https://t.me/CloudeCaseNews`; эти значения также используются как fallback, если переменные окружения пустые.
- Обновлена подсказка об оплате: Tonkeeper-перевод пока подтверждается вручную; автоматическая проверка транзакции и автоматическое зачисление не реализованы.

## Развёртывание

На Bot-Hosting можно задать переменные явно:

```env
GRAM_WALLET_ADDRESS=UQD2v-fRnsSr8Jov3dp4hRa7vxZbtJVqJaZKrw0EhpEgo0Os
FREE_CASE_CHANNEL=@CloudeCaseNews
FREE_CASE_CHANNEL_URL=https://t.me/CloudeCaseNews
```

После изменения `backend/main.py` и `frontend/src/App.tsx` собери frontend и сформируй upload ZIP командами из `BOT_HOSTING.md`. Добавь бота администратором в канал.
