import os, asyncio, logging
from dotenv import load_dotenv
from aiogram import Bot, Dispatcher, F
from aiogram.filters import CommandStart, Command
from aiogram.filters.command import CommandObject
from aiogram.types import Message, InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo, PreCheckoutQuery
from aiogram.enums import ParseMode
from aiogram.client.default import DefaultBotProperties

load_dotenv()
TOKEN=os.getenv("BOT_TOKEN","")
WEBAPP_URL=os.getenv("WEBAPP_URL","")
ADMIN_IDS={int(x.strip()) for x in os.getenv("ADMIN_TG_IDS","").split(",") if x.strip()}
if not TOKEN:
    raise RuntimeError("Укажи BOT_TOKEN в .env")

# Импортируем ту же функцию, которой пользуется API, чтобы начисления были идемпотентными.
import sys
sys.path.insert(0,os.path.abspath(os.path.join(os.path.dirname(__file__),"..","backend")))
from main import add_stars_from_payment, init_db

bot=Bot(TOKEN,default=DefaultBotProperties(parse_mode=ParseMode.HTML))
dp=Dispatcher()

@dp.message(CommandStart())
async def start(message:Message, command:CommandObject):
    payload=command.args or ""
    url=WEBAPP_URL
    if payload and payload.startswith("ref_"):
        separator="&" if "?" in url else "?"
        url=f"{url}{separator}startapp={payload}"
    keyboard=InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="☁️ Открыть CloudeGift",web_app=WebAppInfo(url=url))
    ]])
    await message.answer(
        "☁️ <b>Добро пожаловать в CloudeGift!</b>\n\n"
        "Открывай кейсы, собирай Telegram Gifts и пробуй игровые режимы.\n"
        "Твой инвентарь и баланс будут доступны в Mini App.",
        reply_markup=keyboard
    )

@dp.pre_checkout_query()
async def pre_checkout(query:PreCheckoutQuery):
    payload=query.invoice_payload.split("|")
    valid=False
    try:
        valid=(len(payload)>=4 and payload[0]=="deposit" and int(payload[1])==query.from_user.id
               and int(payload[2])==query.total_amount and query.currency=="XTR")
    except Exception:
        valid=False
    await query.answer(ok=valid,error_message=None if valid else "Счёт не прошёл проверку. Откройте пополнение заново.")

@dp.message(F.successful_payment)
async def successful_payment(message:Message):
    payment=message.successful_payment
    if not payment or payment.currency!="XTR":
        return
    try:
        credited=add_stars_from_payment(
            tg_id=message.from_user.id,
            amount=payment.total_amount,
            charge_id=payment.telegram_payment_charge_id,
            payload=payment.invoice_payload
        )
        if credited:
            await message.answer(f"✅ На баланс CloudeGift зачислено <b>{payment.total_amount} ⭐</b>.")
        else:
            await message.answer("Этот платёж уже был зачислен.")
    except Exception:
        logging.exception("Не удалось обработать Telegram Stars payment")
        await message.answer("Платёж получен Telegram, но возникла ошибка зачисления. Напиши в поддержку.")

@dp.message(Command("admin"))
async def admin(message:Message):
    if message.from_user.id not in ADMIN_IDS:
        await message.answer("Нет доступа.")
        return
    await message.answer(f"Панель администратора: {WEBAPP_URL}")

@dp.message(Command("help"))
async def help_cmd(message:Message):
    await message.answer("Поддержка CloudeGift: @cloudegift")

async def main():
    logging.basicConfig(level=logging.INFO)
    init_db()
    await dp.start_polling(bot)

if __name__=="__main__":
    asyncio.run(main())
