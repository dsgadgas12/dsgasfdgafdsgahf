import os, json, hmac, hashlib, secrets, sqlite3, time, math
from pathlib import Path
from urllib.parse import parse_qsl
from datetime import datetime, timezone, timedelta
from contextlib import contextmanager
from typing import Optional

import jwt
import httpx
from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv

BASE = Path(__file__).resolve().parent
PROJECT = BASE.parent
load_dotenv(PROJECT / ".env")
DB_PATH = Path(os.getenv("DATABASE_PATH", str(BASE / "data" / "cloudegift.sqlite3")))
BOT_TOKEN = os.getenv("BOT_TOKEN", "")
JWT_SECRET = os.getenv("JWT_SECRET", "CHANGE_ME_BEFORE_DEPLOYMENT")
WEBAPP_URL = os.getenv("WEBAPP_URL", "https://example.com")
BOT_USERNAME = os.getenv("BOT_USERNAME", "").strip().lstrip("@")
GRAM_WALLET_ADDRESS = (os.getenv("GRAM_WALLET_ADDRESS") or "UQD2v-fRnsSr8Jov3dp4hRa7vxZbtJVqJaZKrw0EhpEgo0Os").strip()
FREE_CASE_CHANNEL = (os.getenv("FREE_CASE_CHANNEL") or "@CloudeCaseNews").strip()
FREE_CASE_CHANNEL_URL = (os.getenv("FREE_CASE_CHANNEL_URL") or "https://t.me/CloudeCaseNews").strip()
FREE_CASE_COOLDOWN = timedelta(hours=24)
FREE_CASE_STAR_PRIZES = (5, 10, 25, 50, 100, 250, 500, 700)
ADMIN_IDS = {x.strip() for x in os.getenv("ADMIN_TG_IDS", "").split(",") if x.strip()}
GIFTS_FILE = BASE / "catalog" / "gifts.json"
CASES_FILE = BASE / "catalog" / "cases.json"

app = FastAPI(title="CloudeGift API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[x.strip() for x in os.getenv("CORS_ORIGINS", "*").split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@contextmanager
def connect():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB_PATH, timeout=20)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys=ON")
    con.execute("PRAGMA journal_mode=WAL")
    try:
        yield con
        con.commit()
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()

def now():
    return datetime.now(timezone.utc).isoformat()

def read_catalog(path: Path):
    try:
        rows = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise RuntimeError(f"Не удалось загрузить каталог {path.name}") from exc
    if not isinstance(rows, list) or not rows:
        raise RuntimeError(f"Каталог {path.name} пуст или повреждён")
    return rows


def init_db():
    gifts = read_catalog(GIFTS_FILE)
    cases = read_catalog(CASES_FILE)
    with connect() as con:
        con.executescript("""
        CREATE TABLE IF NOT EXISTS users(
          tg_id INTEGER PRIMARY KEY, username TEXT, first_name TEXT, last_name TEXT,
          photo_url TEXT, balance INTEGER NOT NULL DEFAULT 0, is_banned INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS gifts(
          id TEXT PRIMARY KEY, name TEXT NOT NULL, price_stars INTEGER NOT NULL,
          image TEXT, rarity TEXT, image_status TEXT
        );
        CREATE TABLE IF NOT EXISTS cases(
          id TEXT PRIMARY KEY, name TEXT NOT NULL, price_stars INTEGER NOT NULL,
          category TEXT NOT NULL, theme TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 1
        );
        CREATE TABLE IF NOT EXISTS case_items(
          case_id TEXT NOT NULL, gift_id TEXT NOT NULL, weight_bp INTEGER NOT NULL,
          PRIMARY KEY(case_id,gift_id),
          FOREIGN KEY(case_id) REFERENCES cases(id), FOREIGN KEY(gift_id) REFERENCES gifts(id)
        );
        CREATE TABLE IF NOT EXISTS case_open_counters(
          tg_id INTEGER NOT NULL, case_id TEXT NOT NULL, open_count INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY(tg_id,case_id),
          FOREIGN KEY(tg_id) REFERENCES users(tg_id), FOREIGN KEY(case_id) REFERENCES cases(id)
        );
        CREATE TABLE IF NOT EXISTS inventory(
          id INTEGER PRIMARY KEY AUTOINCREMENT, tg_id INTEGER NOT NULL, gift_id TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'owned', acquired_at TEXT NOT NULL,
          FOREIGN KEY(tg_id) REFERENCES users(tg_id), FOREIGN KEY(gift_id) REFERENCES gifts(id)
        );
        CREATE TABLE IF NOT EXISTS transactions(
          id INTEGER PRIMARY KEY AUTOINCREMENT, tg_id INTEGER NOT NULL, type TEXT NOT NULL,
          amount INTEGER NOT NULL, currency TEXT NOT NULL DEFAULT 'XTR', status TEXT NOT NULL,
          reference TEXT, note TEXT, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS payments(
          telegram_charge_id TEXT PRIMARY KEY, tg_id INTEGER NOT NULL, amount INTEGER NOT NULL,
          payload TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS referrals(
          id INTEGER PRIMARY KEY AUTOINCREMENT, referrer_id INTEGER NOT NULL, referred_id INTEGER NOT NULL UNIQUE,
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS promos(
          code TEXT PRIMARY KEY, reward_stars INTEGER NOT NULL, max_uses INTEGER NOT NULL DEFAULT 1,
          uses INTEGER NOT NULL DEFAULT 0, is_active INTEGER NOT NULL DEFAULT 1
        );
        CREATE TABLE IF NOT EXISTS promo_uses(
          code TEXT NOT NULL, tg_id INTEGER NOT NULL, created_at TEXT NOT NULL,
          PRIMARY KEY(code,tg_id)
        );
        CREATE TABLE IF NOT EXISTS action_logs(
          id INTEGER PRIMARY KEY AUTOINCREMENT, actor_id INTEGER, target_id INTEGER,
          action TEXT NOT NULL, details TEXT, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS withdrawal_requests(
          id INTEGER PRIMARY KEY AUTOINCREMENT, tg_id INTEGER NOT NULL, asset_type TEXT NOT NULL,
          amount INTEGER, inventory_id INTEGER, gift_id TEXT, destination TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'pending', submitted_at TEXT NOT NULL, updated_at TEXT NOT NULL,
          admin_note TEXT, inventory_ids_json TEXT NOT NULL DEFAULT '[]'
        );
        
        CREATE TABLE IF NOT EXISTS crash_rounds(
          id INTEGER PRIMARY KEY AUTOINCREMENT, status TEXT NOT NULL, created_at REAL NOT NULL,
          betting_ends_at REAL NOT NULL, started_at REAL, crash_at REAL NOT NULL, crashed_at REAL
        );
        CREATE TABLE IF NOT EXISTS crash_bets(
          id INTEGER PRIMARY KEY AUTOINCREMENT, round_id INTEGER NOT NULL, tg_id INTEGER NOT NULL,
          amount INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
          cashout_multiplier REAL, payout INTEGER NOT NULL DEFAULT 0, created_at REAL NOT NULL,
          UNIQUE(round_id,tg_id), FOREIGN KEY(round_id) REFERENCES crash_rounds(id)
        );
        CREATE TABLE IF NOT EXISTS mines_games(
          id INTEGER PRIMARY KEY AUTOINCREMENT, tg_id INTEGER NOT NULL, bet INTEGER NOT NULL,
          grid_size INTEGER NOT NULL, mine_count INTEGER NOT NULL, mines_json TEXT NOT NULL,
          opened_json TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'active',
          multiplier REAL NOT NULL DEFAULT 1.0, payout INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL, finished_at TEXT
        );
        CREATE TABLE IF NOT EXISTS free_case_opens(
          id INTEGER PRIMARY KEY AUTOINCREMENT, tg_id INTEGER NOT NULL,
          prize_id TEXT NOT NULL, prize_type TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS free_case_task_progress(
          tg_id INTEGER PRIMARY KEY, shares_sent INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS free_case_share_tokens(
          token TEXT PRIMARY KEY, tg_id INTEGER NOT NULL,
          created_at TEXT NOT NULL, confirmed_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_free_case_user ON free_case_opens(tg_id,id DESC);
        CREATE INDEX IF NOT EXISTS idx_free_case_share_tokens_user ON free_case_share_tokens(tg_id,created_at);
        CREATE INDEX IF NOT EXISTS idx_inventory_user ON inventory(tg_id,status);
        CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(tg_id,created_at);
        """)
        con.execute("BEGIN IMMEDIATE")
        withdrawal_columns={row["name"] for row in con.execute("PRAGMA table_info(withdrawal_requests)").fetchall()}
        if "inventory_ids_json" not in withdrawal_columns:
            con.execute("ALTER TABLE withdrawal_requests ADD COLUMN inventory_ids_json TEXT NOT NULL DEFAULT '[]'")
        case_columns = {row["name"] for row in con.execute("PRAGMA table_info(cases)")}
        for column in ("banner", "description"):
            if column not in case_columns:
                con.execute(f"ALTER TABLE cases ADD COLUMN {column} TEXT")
        for g in gifts:
            con.execute("""INSERT INTO gifts(id,name,price_stars,image,rarity,image_status)
              VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,
              price_stars=excluded.price_stars,image=excluded.image,rarity=excluded.rarity,
              image_status=excluded.image_status""",
              (g["id"],g["name"],g["price_stars"],g.get("image"),g.get("rarity"),g.get("image_status")))
        # Служебные призы-звёзды хранятся в gifts для связи case_items,
        # но не попадают в магазин и не добавляются в NFT-инвентарь.
        for amount in (10,25,50,80,100,250,300,500,1000,1500,2000,2500,3000,4000,5000,10000,20000):
            con.execute(
              "INSERT OR IGNORE INTO gifts(id,name,price_stars,image,rarity,image_status) VALUES(?,?,?,?,?,?)",
              (f"stars-{amount}",f"{amount} Telegram Stars",amount,None,"Звёзды","star")
            )
        for c in cases:
            con.execute("""INSERT INTO cases(id,name,price_stars,category,theme,banner,description,is_active)
              VALUES(?,?,?,?,?,?,?,1) ON CONFLICT(id) DO UPDATE SET name=excluded.name,
              price_stars=excluded.price_stars,category=excluded.category,theme=excluded.theme,
              banner=excluded.banner,description=excluded.description,is_active=1""",
              (c["id"],c["name"],c["price_stars"],c["category"],c["theme"],c.get("banner"),c.get("description")))
            con.execute("DELETE FROM case_items WHERE case_id=?",(c["id"],))
            for item in c["items"]:
                con.execute("INSERT INTO case_items(case_id,gift_id,weight_bp) VALUES(?,?,?)",
                            (c["id"],item["gift_id"],item["weight_bp"]))
        con.execute("DELETE FROM promos WHERE code='CLOUDYSTART'")

@app.on_event("startup")
def startup():
    init_db()

def verify_init_data(init_data: str):
    if not BOT_TOKEN:
        raise HTTPException(503,"BOT_TOKEN не настроен")
    try:
        pairs = dict(parse_qsl(init_data, keep_blank_values=True))
        received_hash = pairs.pop("hash")
        data_check = "\n".join(f"{k}={v}" for k,v in sorted(pairs.items()))
        secret = hmac.new(b"WebAppData", BOT_TOKEN.encode(), hashlib.sha256).digest()
        calculated = hmac.new(secret, data_check.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(calculated, received_hash):
            raise ValueError("bad hash")
        auth_date = int(pairs.get("auth_date","0"))
        if time.time()-auth_date > 86400:
            raise ValueError("expired initData")
        user = json.loads(pairs["user"])
        return user
    except Exception:
        raise HTTPException(401,"Telegram initData недействителен или устарел")

def make_token(tg_id: int):
    return jwt.encode({"sub":str(tg_id),"exp":datetime.now(timezone.utc)+timedelta(days=7)},JWT_SECRET,algorithm="HS256")

def current_user(authorization: Optional[str] = Header(default=None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401,"Требуется авторизация Telegram")
    try:
        payload=jwt.decode(authorization[7:],JWT_SECRET,algorithms=["HS256"])
        tg_id=int(payload["sub"])
    except Exception:
        raise HTTPException(401,"Сессия истекла")
    with connect() as con:
        user=con.execute("SELECT * FROM users WHERE tg_id=?",(tg_id,)).fetchone()
    if not user:
        raise HTTPException(401,"Пользователь не найден")
    if user["is_banned"]:
        raise HTTPException(403,"Аккаунт заблокирован")
    return dict(user)

def admin_user(user=Depends(current_user)):
    if str(user["tg_id"]) not in ADMIN_IDS:
        raise HTTPException(403,"Недостаточно прав")
    return user

def log_action(con, actor, target, action, details=""):
    con.execute("INSERT INTO action_logs(actor_id,target_id,action,details,created_at) VALUES(?,?,?,?,?)",
                (actor,target,action,details,now()))


def telegram_api(method: str, payload: dict):
    if not BOT_TOKEN:
        raise HTTPException(503, "BOT_TOKEN не настроен")
    try:
        response = httpx.post(
            f"https://api.telegram.org/bot{BOT_TOKEN}/{method}",
            json=payload,
            timeout=12.0,
        )
        data = response.json()
    except Exception as exc:
        raise HTTPException(502, f"Не удалось связаться с Telegram: {exc}")
    if not response.is_success or not data.get("ok"):
        description = str(data.get("description", "Ошибка Telegram Bot API"))
        raise HTTPException(502, description)
    return data.get("result")


def get_free_case_subscription(tg_id: int):
    if not FREE_CASE_CHANNEL or not BOT_TOKEN:
        return {"configured": False, "subscribed": False}
    try:
        member = telegram_api("getChatMember", {"chat_id": FREE_CASE_CHANNEL, "user_id": tg_id})
        status = member.get("status")
        subscribed = status in ("creator", "administrator", "member") or (
            status == "restricted" and bool(member.get("is_member"))
        )
        return {"configured": True, "subscribed": subscribed}
    except HTTPException:
        # A missing admin permission, wrong channel ID or unavailable user is never treated as success.
        return {"configured": True, "subscribed": False}


def get_free_case_task_state(tg_id: int):
    with connect() as con:
        row = con.execute(
            "SELECT shares_sent FROM free_case_task_progress WHERE tg_id=?", (tg_id,)
        ).fetchone()
    shares_sent = min(3, int(row["shares_sent"]) if row else 0)
    channel = get_free_case_subscription(tg_id)
    share_complete = shares_sent >= 3
    return {
        "shares_sent": shares_sent,
        "share_required": 3,
        "share_complete": share_complete,
        "channel_configured": channel["configured"],
        "subscribed": channel["subscribed"],
        "channel_url": FREE_CASE_CHANNEL_URL,
        "tasks_complete": share_complete and channel["subscribed"],
    }


def free_case_cooldown_state(tg_id: int):
    with connect() as con:
        last = con.execute(
            "SELECT id,prize_id,prize_type,created_at FROM free_case_opens WHERE tg_id=? ORDER BY id DESC LIMIT 1",
            (tg_id,),
        ).fetchone()
    if not last:
        return {"last_open": None, "next_open_at": None, "can_open": True, "remaining_ms": 0}
    last_open = datetime.fromisoformat(last["created_at"])
    if last_open.tzinfo is None:
        last_open = last_open.replace(tzinfo=timezone.utc)
    next_open = last_open + FREE_CASE_COOLDOWN
    remaining_ms = max(0, int((next_open - datetime.now(timezone.utc)).total_seconds() * 1000))
    return {
        "last_open": dict(last),
        "next_open_at": next_open.isoformat(),
        "can_open": remaining_ms <= 0,
        "remaining_ms": remaining_ms,
    }

class AuthBody(BaseModel):
    init_data: str = ""
    start_param: str = ""

class AmountBody(BaseModel):
    amount: int = Field(ge=1, le=1000000)

class CaseOpenBatchBody(BaseModel):
    count: int = Field(default=1, ge=1, le=5)

class AdminBalanceBody(BaseModel):
    amount: int = Field(ge=-10000000, le=10000000)
    reason: str = Field(default="", max_length=300)

class AdminBanBody(BaseModel):
    banned: bool
    reason: str = Field(default="", max_length=300)

class AdminGiftBody(BaseModel):
    gift_id: str

class PromoBody(BaseModel):
    code: str

class UpgradeBody(BaseModel):
    inventory_id: int
    target_gift_id: str

class WithdrawalBody(BaseModel):
    asset_type: str
    amount: Optional[int] = Field(default=None, ge=1, le=1000000)
    inventory_id: Optional[int] = None
    inventory_ids: Optional[list[int]] = None
    destination: str = Field(default="", max_length=300)

class WithdrawalStatusBody(BaseModel):
    status: str
    admin_note: str = Field(default="", max_length=300)

class FreeCaseShareConfirmBody(BaseModel):
    share_token: str = Field(min_length=16, max_length=128)

@app.get("/api/public-config")
def public_config():
    """Expose only public client settings; never return secrets or bot credentials."""
    return {"gram_wallet_address": GRAM_WALLET_ADDRESS}


@app.get("/health")
def health():
    return {"ok":True,"service":"CloudeGift API","time":now()}

@app.post("/api/auth/telegram")
def auth(body: AuthBody):
    user=verify_init_data(body.init_data)
    tg_id=int(user["id"])
    with connect() as con:
        con.execute("""INSERT INTO users(tg_id,username,first_name,last_name,photo_url,created_at)
          VALUES(?,?,?,?,?,?) ON CONFLICT(tg_id) DO UPDATE SET username=excluded.username,
          first_name=excluded.first_name,last_name=excluded.last_name,photo_url=excluded.photo_url""",
          (tg_id,user.get("username"),user.get("first_name","Player"),user.get("last_name"),user.get("photo_url"),now()))
        if body.start_param.startswith("ref_"):
            try:
                ref_id=int(body.start_param[4:])
                if ref_id!=tg_id:
                    con.execute("INSERT OR IGNORE INTO referrals(referrer_id,referred_id,created_at) VALUES(?,?,?)",(ref_id,tg_id,now()))
            except ValueError: pass
        row=con.execute("SELECT * FROM users WHERE tg_id=?",(tg_id,)).fetchone()
    data=dict(row)
    data["is_admin"]=str(tg_id) in ADMIN_IDS
    return {"access_token":make_token(tg_id),"user":data}

@app.get("/api/me")
def me(user=Depends(current_user)):
    with connect() as con:
        inv=con.execute("""SELECT i.id AS inventory_id,i.gift_id,i.acquired_at,g.name,g.price_stars,g.image,g.rarity
          FROM inventory i JOIN gifts g ON g.id=i.gift_id WHERE i.tg_id=? AND i.status='owned' ORDER BY i.id DESC""",
          (user["tg_id"],)).fetchall()
    return {"user":user,"inventory":[dict(x) for x in inv]}

@app.get("/api/catalog/gifts")
def catalog():
    with connect() as con:
        rows=con.execute("SELECT * FROM gifts WHERE image_status IS NULL OR image_status != 'star' ORDER BY price_stars ASC").fetchall()
    return [dict(x) for x in rows]


def next_case_open_number(con, tg_id: int, case_id: str) -> int:
    row = con.execute(
        "SELECT open_count FROM case_open_counters WHERE tg_id=? AND case_id=?",
        (tg_id, case_id),
    ).fetchone()
    opening_number = (int(row["open_count"]) if row else 0) + 1
    con.execute(
        """INSERT INTO case_open_counters(tg_id,case_id,open_count) VALUES(?,?,1)
           ON CONFLICT(tg_id,case_id) DO UPDATE SET open_count=excluded.open_count+case_open_counters.open_count""",
        (tg_id, case_id),
    )
    return opening_number


def select_case_prize(con, items, case_price: int, opening_number: int):
    """Select a normal prize, or a premium NFT on every 20th opening for this case."""
    gift_rows = con.execute("SELECT id,price_stars FROM gifts").fetchall()
    gift_prices = {row["id"]: int(row["price_stars"]) for row in gift_rows}
    premium = []
    common = []
    for item in items:
        gift_id = item["gift_id"]
        if gift_id.startswith("stars-"):
            # Only the small 100/300-Star returns are available on regular openings.
            if gift_id in ("stars-100", "stars-300"):
                common.append(item)
            continue
        if gift_prices.get(gift_id, 0) >= case_price:
            premium.append(item)
        else:
            common.append(item)

    guaranteed = opening_number % 20 == 0
    pool = premium if guaranteed else common
    if not pool:
        raise HTTPException(500, "Для кейса не настроен пул обычных или редких призов")
    total_weight = sum(max(0, int(item["weight_bp"])) for item in pool)
    if total_weight <= 0:
        raise HTTPException(500, "Вес призов кейса настроен неверно")
    roll = secrets.randbelow(total_weight)
    cumulative = 0
    selected = pool[-1]["gift_id"]
    for item in pool:
        cumulative += max(0, int(item["weight_bp"]))
        if roll < cumulative:
            selected = item["gift_id"]
            break
    return selected, roll, guaranteed

@app.get("/api/cases")
def get_cases():
    with connect() as con:
        rows=con.execute("SELECT * FROM cases WHERE is_active=1 ORDER BY price_stars ASC").fetchall()
        result=[]
        for c in rows:
            items=con.execute("SELECT gift_id,weight_bp FROM case_items WHERE case_id=?",(c["id"],)).fetchall()
            result.append({**dict(c),"items":[dict(x) for x in items]})
    return result

@app.post("/api/cases/{case_id}/open")
def open_case(case_id: str, user=Depends(current_user)):
    with connect() as con:
        con.execute("BEGIN IMMEDIATE")
        case=con.execute("SELECT * FROM cases WHERE id=? AND is_active=1",(case_id,)).fetchone()
        if not case: raise HTTPException(404,"Кейс не найден")
        items=con.execute("SELECT gift_id,weight_bp FROM case_items WHERE case_id=?",(case_id,)).fetchall()
        if not items or sum(x["weight_bp"] for x in items)!=10000:
            raise HTTPException(500,"Вероятности кейса настроены неверно")
        current=con.execute("SELECT balance FROM users WHERE tg_id=?",(user["tg_id"],)).fetchone()["balance"]
        if current<case["price_stars"]: raise HTTPException(400,"Недостаточно звёзд")
        opening_number=next_case_open_number(con,user["tg_id"],case_id)
        selected,roll,guaranteed=select_case_prize(con,items,int(case["price_stars"]),opening_number)
        is_star_reward=selected.startswith("stars-")
        star_reward=int(selected.split("-",1)[1]) if is_star_reward else 0
        if is_star_reward:
            con.execute("UPDATE users SET balance=balance-?+? WHERE tg_id=?",
                        (case["price_stars"],star_reward,user["tg_id"]))
            inventory_id=None
            con.execute("INSERT INTO transactions(tg_id,type,amount,currency,status,reference,note,created_at) VALUES(?,?,?,?,?,?,?,?)",
                        (user["tg_id"],"case_reward",star_reward,"XTR","completed",case_id,selected,now()))
        else:
            con.execute("UPDATE users SET balance=balance-? WHERE tg_id=?",(case["price_stars"],user["tg_id"]))
            cur=con.execute("INSERT INTO inventory(tg_id,gift_id,acquired_at) VALUES(?,?,?)",(user["tg_id"],selected,now()))
            inventory_id=cur.lastrowid
        con.execute("INSERT INTO transactions(tg_id,type,amount,currency,status,reference,note,created_at) VALUES(?,?,?,?,?,?,?,?)",
                    (user["tg_id"],"case_open",-case["price_stars"],"XTR","completed",case_id,selected,now()))
        log_action(con,user["tg_id"],user["tg_id"],"case_open",
                   f"{case_id}:{selected};roll={roll};opening={opening_number};guaranteed={int(guaranteed)}")
        new_balance=con.execute("SELECT balance FROM users WHERE tg_id=?",(user["tg_id"],)).fetchone()["balance"]
        gift=con.execute("SELECT * FROM gifts WHERE id=?",(selected,)).fetchone()
    return {"gift_id":selected,"gift":dict(gift),"star_reward":star_reward,
            "balance":new_balance,"roll":roll,"inventory_id":inventory_id,
            "opening_number":opening_number,"rare_guaranteed":guaranteed,
            "opens_until_guarantee":20-(opening_number%20)}


@app.post("/api/cases/{case_id}/open-batch")
def open_case_batch(case_id: str, body: CaseOpenBatchBody, user=Depends(current_user)):
    """Атомарно открывает от 1 до 5 одинаковых кейсов и возвращает каждый результат."""
    results=[]
    with connect() as con:
        con.execute("BEGIN IMMEDIATE")
        case=con.execute("SELECT * FROM cases WHERE id=? AND is_active=1",(case_id,)).fetchone()
        if not case:
            raise HTTPException(404,"Кейс не найден")
        items=con.execute("SELECT gift_id,weight_bp FROM case_items WHERE case_id=?",(case_id,)).fetchall()
        if not items or sum(x["weight_bp"] for x in items)!=10000:
            raise HTTPException(500,"Вероятности кейса настроены неверно")
        current=con.execute("SELECT balance FROM users WHERE tg_id=?",(user["tg_id"],)).fetchone()["balance"]
        total_cost=int(case["price_stars"])*body.count
        if current<total_cost:
            raise HTTPException(400,"Недостаточно звёзд для выбранного количества кейсов")
        new_balance=current
        for index in range(body.count):
            opening_number=next_case_open_number(con,user["tg_id"],case_id)
            selected,roll,guaranteed=select_case_prize(con,items,int(case["price_stars"]),opening_number)
            is_star_reward=selected.startswith("stars-")
            star_reward=int(selected.split("-",1)[1]) if is_star_reward else 0
            new_balance-=int(case["price_stars"])
            inventory_id=None
            if is_star_reward:
                new_balance+=star_reward
                con.execute("INSERT INTO transactions(tg_id,type,amount,currency,status,reference,note,created_at) VALUES(?,?,?,?,?,?,?,?)",
                            (user["tg_id"],"case_reward",star_reward,"XTR","completed",case_id,selected,now()))
            else:
                cur=con.execute("INSERT INTO inventory(tg_id,gift_id,acquired_at) VALUES(?,?,?)",
                                (user["tg_id"],selected,now()))
                inventory_id=cur.lastrowid
            con.execute("INSERT INTO transactions(tg_id,type,amount,currency,status,reference,note,created_at) VALUES(?,?,?,?,?,?,?,?)",
                        (user["tg_id"],"case_open",-int(case["price_stars"]),"XTR","completed",case_id,selected,now()))
            log_action(con,user["tg_id"],user["tg_id"],"case_open",
                       f"{case_id}:{selected};batch={index+1}/{body.count};roll={roll};opening={opening_number};guaranteed={int(guaranteed)}")
            gift=con.execute("SELECT * FROM gifts WHERE id=?",(selected,)).fetchone()
            results.append({"gift_id":selected,"gift":dict(gift) if gift else None,
                            "star_reward":star_reward,"inventory_id":inventory_id,"roll":roll,
                            "opening_number":opening_number,"rare_guaranteed":guaranteed,
                            "opens_until_guarantee":20-(opening_number%20)})
        con.execute("UPDATE users SET balance=? WHERE tg_id=?",(new_balance,user["tg_id"]))
    return {"results":results,"balance":new_balance,"count":body.count}


@app.get("/api/free-case")
def free_case_info(user=Depends(current_user)):
    tasks = get_free_case_task_state(user["tg_id"])
    cooldown = free_case_cooldown_state(user["tg_id"])
    return {"name": "Бесплатный кейс", **tasks, **cooldown}


@app.post("/api/free-case/tasks/check")
def check_free_case_tasks(user=Depends(current_user)):
    return get_free_case_task_state(user["tg_id"])


@app.post("/api/free-case/share/prepare")
def prepare_free_case_share(user=Depends(current_user)):
    # Telegram's native shareMessage dialog sends this exact prepared photo + caption.
    # The client only counts the share when Telegram reports a successful send.
    if not BOT_TOKEN:
        raise HTTPException(503, "Для отправки баннера настрой BOT_TOKEN")
    if not WEBAPP_URL.startswith("https://") or "example.com" in WEBAPP_URL:
        raise HTTPException(503, "Сначала укажи публичный HTTPS WEBAPP_URL")
    bot_username = BOT_USERNAME
    if not bot_username:
        me = telegram_api("getMe", {})
        bot_username = str(me.get("username", "")).strip()
    if not bot_username:
        raise HTTPException(503, "Не удалось определить username Telegram-бота")

    referral_url = f"https://t.me/{bot_username}?start=ref_{user['tg_id']}"
    photo_url = f"{WEBAPP_URL.rstrip('/')}/assets/share/cloudec-case-invite.jpg"
    caption = (
        "<b>В CloudeCase друзей зови — подарки вместе лови!</b>\n"
        "Открывай бесплатный кейс каждый день ☁️\n\n"
        f'<a href="{referral_url}">Открыть CloudeCase</a>'
    )
    result = {
        "type": "photo",
        "id": secrets.token_hex(12),
        "photo_url": photo_url,
        "thumbnail_url": photo_url,
        "photo_width": 1672,
        "photo_height": 941,
        "title": "CloudeCase",
        "description": "Бесплатный кейс и подарки каждый день",
        "caption": caption,
        "parse_mode": "HTML",
    }
    prepared = telegram_api("savePreparedInlineMessage", {
        "user_id": user["tg_id"],
        "result": result,
        "allow_user_chats": True,
        "allow_group_chats": True,
        "allow_channel_chats": False,
        "allow_bot_chats": False,
    })
    share_token = secrets.token_urlsafe(24)
    with connect() as con:
        con.execute(
            "INSERT INTO free_case_share_tokens(token,tg_id,created_at) VALUES(?,?,?)",
            (share_token, user["tg_id"], now()),
        )
    return {"message_id": prepared["id"], "share_token": share_token, "expires_at": prepared.get("expiration_date")}


@app.post("/api/free-case/share/complete")
def complete_free_case_share(body: FreeCaseShareConfirmBody, user=Depends(current_user)):
    current = now()
    with connect() as con:
        con.execute("BEGIN IMMEDIATE")
        row = con.execute(
            "SELECT token,created_at,confirmed_at FROM free_case_share_tokens WHERE token=? AND tg_id=?",
            (body.share_token, user["tg_id"]),
        ).fetchone()
        if not row:
            raise HTTPException(404, "Ссылка для отправки не найдена")
        if row["confirmed_at"]:
            progress = con.execute(
                "SELECT shares_sent FROM free_case_task_progress WHERE tg_id=?", (user["tg_id"],)
            ).fetchone()
            return {"shares_sent": min(3, int(progress["shares_sent"]) if progress else 0), "counted": False}
        created = datetime.fromisoformat(row["created_at"])
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        if (datetime.now(timezone.utc) - created).total_seconds() > 900:
            raise HTTPException(410, "Время отправки истекло. Нажми отправить ещё раз.")
        con.execute(
            "UPDATE free_case_share_tokens SET confirmed_at=? WHERE token=? AND confirmed_at IS NULL",
            (current, body.share_token),
        )
        con.execute(
            "INSERT INTO free_case_task_progress(tg_id,shares_sent,updated_at) VALUES(?,1,?) "
            "ON CONFLICT(tg_id) DO UPDATE SET shares_sent=MIN(3,shares_sent+1),updated_at=excluded.updated_at",
            (user["tg_id"], current),
        )
        progress = con.execute(
            "SELECT shares_sent FROM free_case_task_progress WHERE tg_id=?", (user["tg_id"],)
        ).fetchone()
    return {"shares_sent": min(3, int(progress["shares_sent"])), "counted": True}


@app.post("/api/free-case/open")
def open_free_case(user=Depends(current_user)):
    tasks = get_free_case_task_state(user["tg_id"])
    if not tasks["channel_configured"]:
        raise HTTPException(503, "Канал бесплатного кейса ещё не настроен")
    if not tasks["share_complete"] or not tasks["subscribed"]:
        raise HTTPException(403, "Сначала выполни условия бесплатного кейса")

    with connect() as con:
        con.execute("BEGIN IMMEDIATE")
        last = con.execute(
            "SELECT created_at FROM free_case_opens WHERE tg_id=? ORDER BY id DESC LIMIT 1",
            (user["tg_id"],),
        ).fetchone()
        if last:
            last_open = datetime.fromisoformat(last["created_at"])
            if last_open.tzinfo is None:
                last_open = last_open.replace(tzinfo=timezone.utc)
            next_open = last_open + FREE_CASE_COOLDOWN
            remaining_ms = max(0, int((next_open - datetime.now(timezone.utc)).total_seconds() * 1000))
            if remaining_ms > 0:
                raise HTTPException(429, f"Кейс снова будет доступен через {remaining_ms} мс")

        gifts_pool = con.execute(
            "SELECT id,name,price_stars,image,rarity FROM gifts "
            "WHERE price_stars>=800 AND (image_status IS NULL OR image_status!='star') ORDER BY id"
        ).fetchall()
        rare_outcomes = [("stars", amount, None) for amount in FREE_CASE_STAR_PRIZES]
        rare_outcomes.extend(("gift", None, gift) for gift in gifts_pool)
        roll = secrets.randbelow(10**12)

        if roll < len(rare_outcomes):
            outcome_type, star_amount, selected_gift = rare_outcomes[roll]
            if outcome_type == "gift":
                cur = con.execute(
                    "INSERT INTO inventory(tg_id,gift_id,acquired_at) VALUES(?,?,?)",
                    (user["tg_id"], selected_gift["id"], now()),
                )
                prize_type = "gift"
                prize_id = selected_gift["id"]
                inventory_id = cur.lastrowid
                con.execute(
                    "INSERT INTO transactions(tg_id,type,amount,currency,status,reference,note,created_at) VALUES(?,?,?,?,?,?,?,?)",
                    (user["tg_id"], "free_case_gift", 0, "XTR", "completed", str(inventory_id), prize_id, now()),
                )
                result = {"prize_type": "gift", "gift": dict(selected_gift), "inventory_id": inventory_id, "star_reward": 0}
            else:
                prize_type = "stars"
                prize_id = f"stars-{star_amount}"
                inventory_id = None
                con.execute("UPDATE users SET balance=balance+? WHERE tg_id=?", (star_amount, user["tg_id"]))
                con.execute(
                    "INSERT INTO transactions(tg_id,type,amount,currency,status,reference,note,created_at) VALUES(?,?,?,?,?,?,?,?)",
                    (user["tg_id"], "free_case_reward", star_amount, "XTR", "completed", "free-case", prize_id, now()),
                )
                result = {"prize_type": "stars", "gift": None, "inventory_id": None, "star_reward": star_amount}
        else:
            prize_type = "stars"
            prize_id = "stars-2"
            inventory_id = None
            con.execute("UPDATE users SET balance=balance+2 WHERE tg_id=?", (user["tg_id"],))
            con.execute(
                "INSERT INTO transactions(tg_id,type,amount,currency,status,reference,note,created_at) VALUES(?,?,?,?,?,?,?,?)",
                (user["tg_id"], "free_case_reward", 2, "XTR", "completed", "free-case", "stars-2", now()),
            )
            result = {"prize_type": "stars", "gift": None, "inventory_id": None, "star_reward": 2}

        opened_at = now()
        cur = con.execute(
            "INSERT INTO free_case_opens(tg_id,prize_id,prize_type,created_at) VALUES(?,?,?,?)",
            (user["tg_id"], prize_id, prize_type, opened_at),
        )
        log_action(con, user["tg_id"], user["tg_id"], "free_case_open", f"{prize_type}:{prize_id}")
        balance = con.execute("SELECT balance FROM users WHERE tg_id=?", (user["tg_id"],)).fetchone()["balance"]
        next_open_at = (datetime.fromisoformat(opened_at) + FREE_CASE_COOLDOWN).isoformat()
    return {
        "ok": True,
        "open_id": cur.lastrowid,
        **result,
        "balance": balance,
        "can_open": False,
        "next_open_at": next_open_at,
        "remaining_ms": int(FREE_CASE_COOLDOWN.total_seconds() * 1000),
    }

@app.post("/api/shop/{gift_id}/buy")
def buy_gift(gift_id: str, user=Depends(current_user)):
    with connect() as con:
        con.execute("BEGIN IMMEDIATE")
        gift=con.execute("SELECT * FROM gifts WHERE id=?",(gift_id,)).fetchone()
        if not gift: raise HTTPException(404,"Подарок не найден")
        current=con.execute("SELECT balance FROM users WHERE tg_id=?",(user["tg_id"],)).fetchone()["balance"]
        if current<gift["price_stars"]: raise HTTPException(400,"Недостаточно звёзд")
        con.execute("UPDATE users SET balance=balance-? WHERE tg_id=?",(gift["price_stars"],user["tg_id"]))
        cur=con.execute("INSERT INTO inventory(tg_id,gift_id,acquired_at) VALUES(?,?,?)",(user["tg_id"],gift_id,now()))
        inventory_id=cur.lastrowid
        con.execute("INSERT INTO transactions(tg_id,type,amount,currency,status,reference,note,created_at) VALUES(?,?,?,?,?,?,?,?)",
                    (user["tg_id"],"shop_buy",-gift["price_stars"],"XTR","completed",gift_id,gift["name"],now()))
        new_balance=con.execute("SELECT balance FROM users WHERE tg_id=?",(user["tg_id"],)).fetchone()["balance"]
        log_action(con,user["tg_id"],user["tg_id"],"shop_buy",gift_id)
    return {"ok":True,"balance":new_balance,"gift_id":gift_id,"inventory_id":inventory_id}

@app.post("/api/upgrades")
def upgrade(body: UpgradeBody, user=Depends(current_user)):
    with connect() as con:
        con.execute("BEGIN IMMEDIATE")
        source=con.execute("""SELECT i.*,g.price_stars FROM inventory i JOIN gifts g ON g.id=i.gift_id
          WHERE i.id=? AND i.tg_id=? AND i.status='owned'""",(body.inventory_id,user["tg_id"])).fetchone()
        target=con.execute("SELECT * FROM gifts WHERE id=?",(body.target_gift_id,)).fetchone()
        if not source or not target: raise HTTPException(404,"Предмет не найден")
        if target["price_stars"]<source["price_stars"]: raise HTTPException(400,"Цель не может быть дешевле исходного подарка")
        chance_bp=min(9500,int(source["price_stars"]/target["price_stars"]*10000))
        roll=secrets.randbelow(10000); success=roll<chance_bp
        new_inventory_id=None
        if success:
            con.execute("UPDATE inventory SET status='upgraded' WHERE id=?",(body.inventory_id,))
            cur=con.execute("INSERT INTO inventory(tg_id,gift_id,acquired_at) VALUES(?,?,?)",(user["tg_id"],target["id"],now()))
            new_inventory_id=cur.lastrowid
        else:
            con.execute("UPDATE inventory SET status='burned' WHERE id=?",(body.inventory_id,))
        log_action(con,user["tg_id"],user["tg_id"],"upgrade",f"{source['gift_id']}->{target['id']};chance={chance_bp};roll={roll};success={success}")
    return {"success":success,"chance":chance_bp/100,"roll":roll,"gift_id":target["id"] if success else None,"inventory_id":new_inventory_id}

@app.post("/api/inventory/{inventory_id}/sell")
def sell_inventory(inventory_id: int, user=Depends(current_user)):
    with connect() as con:
        con.execute("BEGIN IMMEDIATE")
        item=con.execute("""SELECT i.id,i.gift_id,g.name,g.price_stars FROM inventory i
          JOIN gifts g ON g.id=i.gift_id WHERE i.id=? AND i.tg_id=? AND i.status='owned'""",
          (inventory_id,user["tg_id"])).fetchone()
        if not item: raise HTTPException(404,"Подарок не найден в инвентаре")
        price=int(item["price_stars"])
        con.execute("UPDATE inventory SET status='sold' WHERE id=?",(inventory_id,))
        con.execute("UPDATE users SET balance=balance+? WHERE tg_id=?",(price,user["tg_id"]))
        con.execute("INSERT INTO transactions(tg_id,type,amount,currency,status,reference,note,created_at) VALUES(?,?,?,?,?,?,?,?)",
                    (user["tg_id"],"inventory_sale",price,"XTR","completed",str(inventory_id),item["gift_id"],now()))
        log_action(con,user["tg_id"],user["tg_id"],"inventory_sale",f"{item['gift_id']}:{price}")
        balance=con.execute("SELECT balance FROM users WHERE tg_id=?",(user["tg_id"],)).fetchone()["balance"]
    return {"ok":True,"balance":balance,"sold_for":price,"gift_id":item["gift_id"]}

@app.post("/api/withdrawals")
def create_withdrawal(body: WithdrawalBody, user=Depends(current_user)):
    if body.asset_type not in ("stars","gift"):
        raise HTTPException(400,"Неизвестный тип вывода")
    if not body.destination.strip():
        raise HTTPException(400,"Укажи адрес или контакт для вывода")
    with connect() as con:
        con.execute("BEGIN IMMEDIATE")
        inventory_ids=[]
        gift_ids=[]
        amount=None
        withdrawal_tx_id=None
        if body.asset_type=="stars":
            if not body.amount or body.amount<1500:
                raise HTTPException(400,"Минимальный вывод — 1500 ⭐")
            current=con.execute("SELECT balance FROM users WHERE tg_id=?",(user["tg_id"],)).fetchone()["balance"]
            if current<body.amount: raise HTTPException(400,"Недостаточно звёзд на балансе")
            amount=body.amount
            con.execute("UPDATE users SET balance=balance-? WHERE tg_id=?",(amount,user["tg_id"]))
            tx=con.execute("INSERT INTO transactions(tg_id,type,amount,currency,status,note,created_at) VALUES(?,?,?,?,?,?,?)",
                           (user["tg_id"],"withdrawal_reserve",-amount,"XTR","pending","Запрос на вывод",now()))
            withdrawal_tx_id=tx.lastrowid
        else:
            requested=body.inventory_ids or ([body.inventory_id] if body.inventory_id else [])
            requested=list(dict.fromkeys(int(x) for x in requested if int(x)>0))
            if len(requested)<2:
                raise HTTPException(400,"Для вывода нужно выбрать минимум 2 NFT-подарка")
            placeholders=",".join("?" for _ in requested)
            rows=con.execute(f"""SELECT id,gift_id FROM inventory
              WHERE id IN ({placeholders}) AND tg_id=? AND status='owned'""",
              (*requested,user["tg_id"])).fetchall()
            if len(rows)!=len(requested):
                raise HTTPException(404,"Один или несколько подарков недоступны для вывода")
            inventory_ids=[row["id"] for row in rows]
            gift_ids=[row["gift_id"] for row in rows]
            con.execute(f"UPDATE inventory SET status='withdraw_pending' WHERE id IN ({placeholders})",
                        tuple(inventory_ids))
        submitted=now()
        cur=con.execute("""INSERT INTO withdrawal_requests(tg_id,asset_type,amount,inventory_id,gift_id,destination,status,submitted_at,updated_at,inventory_ids_json)
          VALUES(?,?,?,?,?,?,'pending',?,?,?)""",
          (user["tg_id"],body.asset_type,amount,inventory_ids[0] if inventory_ids else None,
           gift_ids[0] if gift_ids else None,body.destination.strip(),submitted,submitted,json.dumps(inventory_ids)))
        request_id=cur.lastrowid
        if withdrawal_tx_id:
            con.execute("UPDATE transactions SET reference=? WHERE id=?",(str(request_id),withdrawal_tx_id))
        log_action(con,user["tg_id"],user["tg_id"],"withdrawal_requested",
                   f"{request_id}:{body.asset_type}:{amount or ','.join(gift_ids)}")
        balance=con.execute("SELECT balance FROM users WHERE tg_id=?",(user["tg_id"],)).fetchone()["balance"]
    return {"ok":True,"id":request_id,"status":"pending","submitted_at":submitted,"balance":balance,
            "gift_count":len(inventory_ids),"message":"Заявка принята и ожидает обработки"}

@app.get("/api/withdrawals")
def list_withdrawals(user=Depends(current_user)):
    with connect() as con:
        rows=con.execute("""SELECT w.*,g.name AS gift_name,g.image AS gift_image
          FROM withdrawal_requests w LEFT JOIN gifts g ON g.id=w.gift_id
          WHERE w.tg_id=? ORDER BY w.id DESC LIMIT 20""",(user["tg_id"],)).fetchall()
    result=[]
    for row in rows:
        item=dict(row)
        item["gift_count"]=len(json.loads(item.get("inventory_ids_json") or "[]")) or (1 if item.get("inventory_id") else 0)
        result.append(item)
    return result

@app.get("/api/live")
def live_drops():
    with connect() as con:
        rows=con.execute("""SELECT t.id,t.type,t.amount,t.created_at,t.note,t.reference,u.username,u.first_name,
          g.name AS gift_name,g.price_stars AS gift_price,g.image AS gift_image
          FROM transactions t JOIN users u ON u.tg_id=t.tg_id
          LEFT JOIN gifts g ON g.id=t.note
          WHERE t.type IN ('case_open','crash_cashout','mines_cashout') ORDER BY t.id DESC LIMIT 12""").fetchall()
    result=[]
    for row in rows:
        item=dict(row)
        if item["type"] in ("crash_cashout","mines_cashout"):
            item["star_reward"]=int(item["amount"] or 0)
        elif item["note"] and item["note"].startswith("stars-"):
            try: item["star_reward"]=int(item["note"].split("-",1)[1])
            except ValueError: item["star_reward"]=None
        else:
            item["star_reward"]=None
        item["display_name"]=("@"+item["username"]) if item["username"] else (item["first_name"] or "Игрок")
        result.append(item)
    return result

def _ensure_crash_round(con):
    current=time.time()
    row=con.execute("SELECT * FROM crash_rounds ORDER BY id DESC LIMIT 1").fetchone()
    if row is None or (row["status"]=="crashed" and current-(row["crashed_at"] or current)>=3):
        crash_at=round(1.05+secrets.randbelow(18950)/1000,2)
        con.execute("""INSERT INTO crash_rounds(status,created_at,betting_ends_at,crash_at)
          VALUES('betting',?,?,?)""",(current,current+5,crash_at))
        row=con.execute("SELECT * FROM crash_rounds ORDER BY id DESC LIMIT 1").fetchone()
    if row["status"]=="betting" and current>=row["betting_ends_at"]:
        con.execute("UPDATE crash_rounds SET status='running',started_at=? WHERE id=? AND status='betting'",
                    (row["betting_ends_at"],row["id"]))
        row=con.execute("SELECT * FROM crash_rounds WHERE id=?",(row["id"],)).fetchone()
    if row["status"]=="running":
        elapsed=max(0,current-(row["started_at"] or current))
        multiplier=math.exp(elapsed*0.14)
        if multiplier>=row["crash_at"]:
            con.execute("UPDATE crash_rounds SET status='crashed',crashed_at=? WHERE id=? AND status='running'",
                        (current,row["id"]))
            con.execute("UPDATE crash_bets SET status='lost' WHERE round_id=? AND status='pending'",(row["id"],))
            row=con.execute("SELECT * FROM crash_rounds WHERE id=?",(row["id"],)).fetchone()
    return row

def _crash_multiplier(round_row):
    if round_row["status"]!="running" or not round_row["started_at"]:
        return 1.0
    elapsed=max(0,time.time()-round_row["started_at"])
    return min(float(round_row["crash_at"]),math.exp(elapsed*0.14))

@app.get("/api/crash/state")
def crash_state(user=Depends(current_user)):
    with connect() as con:
        con.execute("BEGIN IMMEDIATE")
        round_row=_ensure_crash_round(con)
        multiplier=_crash_multiplier(round_row)
        players=con.execute("""SELECT b.tg_id,b.amount,b.status,b.cashout_multiplier,b.payout,
          u.username,u.first_name,u.photo_url
          FROM crash_bets b JOIN users u ON u.tg_id=b.tg_id
          WHERE b.round_id=? ORDER BY b.created_at ASC""",(round_row["id"],)).fetchall()
        my_bet=con.execute("SELECT * FROM crash_bets WHERE round_id=? AND tg_id=?",
                           (round_row["id"],user["tg_id"])).fetchone()
        balance=con.execute("SELECT balance FROM users WHERE tg_id=?",(user["tg_id"],)).fetchone()["balance"]
    now_ts=time.time()
    phase=round_row["status"]
    return {
      "round_id":round_row["id"],"phase":phase,
      "countdown":max(0,math.ceil(round_row["betting_ends_at"]-now_ts)) if phase=="betting" else 0,
      "betting_elapsed":round(min(5.0,max(0.0,now_ts-round_row["created_at"])),3) if phase=="betting" else 5.0,
      "crash_elapsed":round(max(0.0,now_ts-(round_row["crashed_at"] or now_ts)),3) if phase=="crashed" else 0.0,
      "multiplier":round(multiplier,2),"crash_at":round_row["crash_at"] if phase=="crashed" else None,
      "balance":balance,
      "my_bet":dict(my_bet) if my_bet else None,
      "players":[{**dict(p),"display_name":("@"+p["username"]) if p["username"] else (p["first_name"] or "Игрок")} for p in players]
    }

class SlotsSpinBody(BaseModel):
    bet: int = Field(ge=25, le=1000000)


@app.post("/api/slots/spin")
def slots_spin(body: SlotsSpinBody, user=Depends(current_user)):
    """One server-authoritative slot spin: exactly 10% NFT win probability."""
    with connect() as con:
        con.execute("BEGIN IMMEDIATE")
        current=con.execute("SELECT balance FROM users WHERE tg_id=?",(user["tg_id"],)).fetchone()["balance"]
        if current<body.bet:
            raise HTTPException(400,"Недостаточно звёзд")
        pool=con.execute("""SELECT * FROM gifts
          WHERE COALESCE(image_status,'')!='star' ORDER BY id ASC""").fetchall()
        if not pool:
            raise HTTPException(503,"Каталог NFT временно недоступен")
        roll=secrets.randbelow(10000)
        won=roll<1000
        selected=None
        inventory_id=None
        if won:
            selected=pool[secrets.randbelow(len(pool))]
        con.execute("UPDATE users SET balance=balance-? WHERE tg_id=?",(body.bet,user["tg_id"]))
        con.execute("""INSERT INTO transactions(tg_id,type,amount,currency,status,reference,note,created_at)
          VALUES(?,?,?,?,?,?,?,?)""",
          (user["tg_id"],"slots_spin",-body.bet,"XTR","completed",str(roll),
           f"win={int(won)};gift={selected['id'] if selected else ''}",now()))
        if won and selected:
            cur=con.execute("INSERT INTO inventory(tg_id,gift_id,acquired_at) VALUES(?,?,?)",
                            (user["tg_id"],selected["id"],now()))
            inventory_id=cur.lastrowid
            con.execute("""INSERT INTO transactions(tg_id,type,amount,currency,status,reference,note,created_at)
              VALUES(?,?,?,?,?,?,?,?)""",
              (user["tg_id"],"slots_nft_win",0,"XTR","completed",str(inventory_id),selected["id"],now()))
        log_action(con,user["tg_id"],user["tg_id"],"slots_spin",
                   f"bet={body.bet};roll={roll};win={int(won)};gift={selected['id'] if selected else ''}")
        new_balance=con.execute("SELECT balance FROM users WHERE tg_id=?",(user["tg_id"],)).fetchone()["balance"]
    return {
      "won":won,
      "gift":dict(selected) if selected else None,
      "gift_id":selected["id"] if selected else None,
      "inventory_id":inventory_id,
      "balance":new_balance,
      "bet":body.bet,
      "roll":roll,
      "win_probability":10
    }


class CrashBetBody(BaseModel):
    amount: int = Field(ge=25, le=1000000)

class MinesStartBody(BaseModel):
    bet: int = Field(ge=25, le=1000000)
    grid_size: int
    mine_count: int = Field(ge=4, le=48)

class MinesRevealBody(BaseModel):
    cell_index: int = Field(ge=0, le=48)

def _mines_multiplier(total:int,mine_count:int,safe_count:int)->float:
    probability=1.0
    for index in range(safe_count):
        probability *= (total-mine_count-index)/(total-index)
    return round(0.96/probability,2) if probability>0 else 0.0

@app.get("/api/mines/active")
def mines_active(user=Depends(current_user)):
    with connect() as con:
        row=con.execute("SELECT * FROM mines_games WHERE tg_id=? AND status='active' ORDER BY id DESC LIMIT 1",
                        (user["tg_id"],)).fetchone()
    if not row:return {"game":None}
    data=dict(row)
    return {"game":{"id":data["id"],"bet":data["bet"],"grid_size":data["grid_size"],
      "mine_count":data["mine_count"],"opened":json.loads(data["opened_json"]),
      "multiplier":data["multiplier"],"status":data["status"]}}

@app.post("/api/mines/start")
def mines_start(body:MinesStartBody,user=Depends(current_user)):
    if body.grid_size not in (3,5,7):raise HTTPException(400,"Размер поля должен быть 3, 5 или 7")
    total=body.grid_size*body.grid_size
    if body.mine_count<4 or body.mine_count>=total:raise HTTPException(400,"Количество мин должно быть от 4 до размера поля минус 1")
    with connect() as con:
        con.execute("BEGIN IMMEDIATE")
        if con.execute("SELECT 1 FROM mines_games WHERE tg_id=? AND status='active'",(user["tg_id"],)).fetchone():
            raise HTTPException(409,"Сначала заверши текущую игру")
        current=con.execute("SELECT balance FROM users WHERE tg_id=?",(user["tg_id"],)).fetchone()["balance"]
        if current<body.bet:raise HTTPException(400,"Недостаточно звёзд")
        mines=sorted(secrets.SystemRandom().sample(range(total),body.mine_count))
        con.execute("UPDATE users SET balance=balance-? WHERE tg_id=?",(body.bet,user["tg_id"]))
        cur=con.execute("""INSERT INTO mines_games(tg_id,bet,grid_size,mine_count,mines_json,opened_json,status,multiplier,created_at)
          VALUES(?,?,?,?,?,'[]','active',1.0,?)""",
          (user["tg_id"],body.bet,body.grid_size,body.mine_count,json.dumps(mines),now()))
        game_id=cur.lastrowid
        con.execute("INSERT INTO transactions(tg_id,type,amount,currency,status,reference,note,created_at) VALUES(?,?,?,?,?,?,?,?)",
                    (user["tg_id"],"mines_bet",-body.bet,"XTR","completed",str(game_id),f"{body.grid_size}x{body.grid_size}:{body.mine_count}",now()))
        log_action(con,user["tg_id"],user["tg_id"],"mines_start",f"{game_id}:{body.bet}:{body.grid_size}:{body.mine_count}")
        balance=con.execute("SELECT balance FROM users WHERE tg_id=?",(user["tg_id"],)).fetchone()["balance"]
    return {"game_id":game_id,"bet":body.bet,"grid_size":body.grid_size,"mine_count":body.mine_count,
      "opened":[],"multiplier":1.0,"balance":balance}

@app.post("/api/mines/{game_id}/reveal")
def mines_reveal(game_id:int,body:MinesRevealBody,user=Depends(current_user)):
    with connect() as con:
        con.execute("BEGIN IMMEDIATE")
        game=con.execute("SELECT * FROM mines_games WHERE id=? AND tg_id=? AND status='active'",
                         (game_id,user["tg_id"])).fetchone()
        if not game:raise HTTPException(404,"Активная игра не найдена")
        total=game["grid_size"]*game["grid_size"]
        if body.cell_index>=total:raise HTTPException(400,"Клетка находится вне поля")
        opened=json.loads(game["opened_json"])
        if body.cell_index in opened:raise HTTPException(409,"Эта клетка уже открыта")
        mines=json.loads(game["mines_json"])
        if body.cell_index in mines:
            con.execute("UPDATE mines_games SET status='lost',finished_at=? WHERE id=?",(now(),game_id))
            log_action(con,user["tg_id"],user["tg_id"],"mines_lost",str(game_id))
            balance=con.execute("SELECT balance FROM users WHERE tg_id=?",(user["tg_id"],)).fetchone()["balance"]
            return {"hit_mine":True,"opened":opened,"mines":mines,"multiplier":game["multiplier"],"balance":balance}
        opened.append(body.cell_index)
        multiplier=_mines_multiplier(total,game["mine_count"],len(opened))
        con.execute("UPDATE mines_games SET opened_json=?,multiplier=? WHERE id=?",
                    (json.dumps(opened),multiplier,game_id))
        balance=con.execute("SELECT balance FROM users WHERE tg_id=?",(user["tg_id"],)).fetchone()["balance"]
        log_action(con,user["tg_id"],user["tg_id"],"mines_safe",f"{game_id}:{body.cell_index}:{multiplier}")
    return {"hit_mine":False,"opened":opened,"mines":[],"multiplier":multiplier,"balance":balance}

@app.post("/api/mines/{game_id}/cashout")
def mines_cashout(game_id:int,user=Depends(current_user)):
    with connect() as con:
        con.execute("BEGIN IMMEDIATE")
        game=con.execute("SELECT * FROM mines_games WHERE id=? AND tg_id=? AND status='active'",
                         (game_id,user["tg_id"])).fetchone()
        if not game:raise HTTPException(404,"Активная игра не найдена")
        opened=json.loads(game["opened_json"])
        if not opened:raise HTTPException(400,"Открой хотя бы одну безопасную клетку")
        payout=int(game["bet"]*game["multiplier"])
        con.execute("UPDATE mines_games SET status='cashed',payout=?,finished_at=? WHERE id=?",
                    (payout,now(),game_id))
        con.execute("UPDATE users SET balance=balance+? WHERE tg_id=?",(payout,user["tg_id"]))
        con.execute("INSERT INTO transactions(tg_id,type,amount,currency,status,reference,note,created_at) VALUES(?,?,?,?,?,?,?,?)",
                    (user["tg_id"],"mines_cashout",payout,"XTR","completed",str(game_id),f"x{game['multiplier']:.2f}",now()))
        log_action(con,user["tg_id"],user["tg_id"],"mines_cashout",f"{game_id}:{payout}")
        balance=con.execute("SELECT balance FROM users WHERE tg_id=?",(user["tg_id"],)).fetchone()["balance"]
    return {"ok":True,"payout":payout,"multiplier":game["multiplier"],"balance":balance}

@app.post("/api/crash/bet")
def crash_bet(body: CrashBetBody, user=Depends(current_user)):
    with connect() as con:
        con.execute("BEGIN IMMEDIATE")
        round_row=_ensure_crash_round(con)
        if round_row["status"]!="betting" or time.time()>=round_row["betting_ends_at"]:
            raise HTTPException(409,"Приём ставок на этот раунд завершён")
        if con.execute("SELECT 1 FROM crash_bets WHERE round_id=? AND tg_id=?",
                       (round_row["id"],user["tg_id"])).fetchone():
            raise HTTPException(409,"Ты уже поставил в этом раунде")
        current=con.execute("SELECT balance FROM users WHERE tg_id=?",(user["tg_id"],)).fetchone()["balance"]
        if current<body.amount: raise HTTPException(400,"Недостаточно звёзд")
        con.execute("UPDATE users SET balance=balance-? WHERE tg_id=?",(body.amount,user["tg_id"]))
        con.execute("INSERT INTO crash_bets(round_id,tg_id,amount,status,created_at) VALUES(?,?,?,'pending',?)",
                    (round_row["id"],user["tg_id"],body.amount,time.time()))
        con.execute("INSERT INTO transactions(tg_id,type,amount,currency,status,reference,note,created_at) VALUES(?,?,?,?,?,?,?,?)",
                    (user["tg_id"],"crash_bet",-body.amount,"XTR","completed",str(round_row["id"]),"Ставка в краше",now()))
        log_action(con,user["tg_id"],user["tg_id"],"crash_bet",f"{round_row['id']}:{body.amount}")
        balance=con.execute("SELECT balance FROM users WHERE tg_id=?",(user["tg_id"],)).fetchone()["balance"]
    return {"ok":True,"balance":balance,"round_id":round_row["id"]}

@app.post("/api/crash/cashout")
def crash_cashout(user=Depends(current_user)):
    with connect() as con:
        con.execute("BEGIN IMMEDIATE")
        round_row=_ensure_crash_round(con)
        if round_row["status"]!="running":
            raise HTTPException(409,"Раунд уже завершён или ещё не начался")
        bet=con.execute("SELECT * FROM crash_bets WHERE round_id=? AND tg_id=? AND status='pending'",
                        (round_row["id"],user["tg_id"])).fetchone()
        if not bet: raise HTTPException(409,"Нет активной ставки")
        multiplier=_crash_multiplier(round_row)
        if multiplier>=round_row["crash_at"]:
            raise HTTPException(409,"Облако уже лопнуло")
        payout=int(bet["amount"]*multiplier)
        con.execute("UPDATE crash_bets SET status='cashed',cashout_multiplier=?,payout=? WHERE id=? AND status='pending'",
                    (multiplier,payout,bet["id"]))
        con.execute("UPDATE users SET balance=balance+? WHERE tg_id=?",(payout,user["tg_id"]))
        con.execute("INSERT INTO transactions(tg_id,type,amount,currency,status,reference,note,created_at) VALUES(?,?,?,?,?,?,?,?)",
                    (user["tg_id"],"crash_cashout",payout,"XTR","completed",str(round_row["id"]),f"x{multiplier:.2f}",now()))
        log_action(con,user["tg_id"],user["tg_id"],"crash_cashout",f"{round_row['id']}:{multiplier:.2f}:{payout}")
        balance=con.execute("SELECT balance FROM users WHERE tg_id=?",(user["tg_id"],)).fetchone()["balance"]
    return {"ok":True,"balance":balance,"multiplier":round(multiplier,2),"payout":payout}

@app.post("/api/payments/stars/invoice")
async def create_stars_invoice(body: AmountBody, user=Depends(current_user)):
    if not BOT_TOKEN: raise HTTPException(503,"BOT_TOKEN не настроен")
    payload=f"deposit|{user['tg_id']}|{body.amount}|{secrets.token_urlsafe(10)}"
    data={
      "title":"CloudeGift Stars","description":f"Пополнение баланса на {body.amount} ⭐",
      "payload":payload,"provider_token":"","currency":"XTR",
      "prices":[{"label":f"{body.amount} Telegram Stars","amount":body.amount}]
    }
    async with httpx.AsyncClient(timeout=20) as client:
        response=await client.post(f"https://api.telegram.org/bot{BOT_TOKEN}/createInvoiceLink",json=data)
    result=response.json()
    if not result.get("ok"): raise HTTPException(502,"Telegram не создал счёт")
    return {"invoice_url":result["result"],"amount":body.amount}

@app.post("/api/promos/redeem")
def redeem_promo(body: PromoBody, user=Depends(current_user)):
    code=body.code.strip().upper()
    with connect() as con:
        con.execute("BEGIN IMMEDIATE")
        promo=con.execute("SELECT * FROM promos WHERE code=? AND is_active=1",(code,)).fetchone()
        if not promo or promo["uses"]>=promo["max_uses"]: raise HTTPException(400,"Промокод недоступен")
        if con.execute("SELECT 1 FROM promo_uses WHERE code=? AND tg_id=?",(code,user["tg_id"])).fetchone():
            raise HTTPException(400,"Промокод уже использован")
        con.execute("INSERT INTO promo_uses(code,tg_id,created_at) VALUES(?,?,?)",(code,user["tg_id"],now()))
        con.execute("UPDATE promos SET uses=uses+1 WHERE code=?",(code,))
        con.execute("UPDATE users SET balance=balance+? WHERE tg_id=?",(promo["reward_stars"],user["tg_id"]))
        con.execute("INSERT INTO transactions(tg_id,type,amount,currency,status,reference,note,created_at) VALUES(?,?,?,?,?,?,?,?)",
                    (user["tg_id"],"promo",promo["reward_stars"],"XTR","completed",code,"promo reward",now()))
        new_balance=con.execute("SELECT balance FROM users WHERE tg_id=?",(user["tg_id"],)).fetchone()["balance"]
    return {"ok":True,"balance":new_balance,"reward":promo["reward_stars"]}

@app.get("/api/admin/users")
def admin_search(q: str="", admin=Depends(admin_user)):
    with connect() as con:
        if q.isdigit():
            rows=con.execute("SELECT tg_id,username,first_name,balance,is_banned,created_at FROM users WHERE tg_id=?",(int(q),)).fetchall()
        else:
            rows=con.execute("SELECT tg_id,username,first_name,balance,is_banned,created_at FROM users WHERE username LIKE ? LIMIT 30",(f"%{q}%",)).fetchall()
    return [dict(x) for x in rows]

@app.post("/api/admin/users/{tg_id}/balance")
def admin_balance(tg_id:int,body:AdminBalanceBody,admin=Depends(admin_user)):
    if body.amount == 0:
        raise HTTPException(400,"Сумма должна быть ненулевой")
    with connect() as con:
        con.execute("BEGIN IMMEDIATE")
        target=con.execute("SELECT balance FROM users WHERE tg_id=?",(tg_id,)).fetchone()
        if not target: raise HTTPException(404,"Пользователь не найден")
        if target["balance"]+body.amount<0: raise HTTPException(400,"Нельзя списать больше баланса")
        con.execute("UPDATE users SET balance=balance+? WHERE tg_id=?",(body.amount,tg_id))
        con.execute("INSERT INTO transactions(tg_id,type,amount,currency,status,reference,note,created_at) VALUES(?,?,?,?,?,?,?,?)",
                    (tg_id,"admin_adjust",body.amount,"XTR","completed",str(admin["tg_id"]),body.reason,now()))
        log_action(con,admin["tg_id"],tg_id,"balance_adjust",f"{body.amount};{body.reason}")
    return {"ok":True}

@app.post("/api/admin/users/{tg_id}/ban")
def admin_ban(tg_id:int,body:AdminBanBody,admin=Depends(admin_user)):
    with connect() as con:
        cur=con.execute("UPDATE users SET is_banned=? WHERE tg_id=?",(1 if body.banned else 0,tg_id))
        if not cur.rowcount: raise HTTPException(404,"Пользователь не найден")
        log_action(con,admin["tg_id"],tg_id,"ban" if body.banned else "unban",body.reason)
    return {"ok":True,"banned":body.banned}

@app.post("/api/admin/users/{tg_id}/gift")
def admin_gift(tg_id:int,body:AdminGiftBody,admin=Depends(admin_user)):
    with connect() as con:
        if not con.execute("SELECT 1 FROM users WHERE tg_id=?",(tg_id,)).fetchone(): raise HTTPException(404,"Пользователь не найден")
        if not con.execute("SELECT 1 FROM gifts WHERE id=?",(body.gift_id,)).fetchone(): raise HTTPException(404,"Подарок не найден")
        con.execute("INSERT INTO inventory(tg_id,gift_id,acquired_at) VALUES(?,?,?)",(tg_id,body.gift_id,now()))
        log_action(con,admin["tg_id"],tg_id,"gift_grant",body.gift_id)
    return {"ok":True}

@app.get("/api/admin/withdrawals")
def admin_withdrawals(admin=Depends(admin_user)):
    with connect() as con:
        rows=con.execute("""SELECT w.*,u.username,u.first_name,u.photo_url,g.name AS gift_name
          FROM withdrawal_requests w JOIN users u ON u.tg_id=w.tg_id
          LEFT JOIN gifts g ON g.id=w.gift_id ORDER BY w.id DESC LIMIT 100""").fetchall()
    result=[]
    for row in rows:
        item=dict(row)
        item["gift_count"]=len(json.loads(item.get("inventory_ids_json") or "[]")) or (1 if item.get("inventory_id") else 0)
        result.append(item)
    return result

@app.post("/api/admin/withdrawals/{request_id}/status")
def admin_withdrawal_status(request_id:int,body:WithdrawalStatusBody,admin=Depends(admin_user)):
    if body.status not in ("processing","paid","rejected"):
        raise HTTPException(400,"Недопустимый статус")
    with connect() as con:
        con.execute("BEGIN IMMEDIATE")
        req=con.execute("SELECT * FROM withdrawal_requests WHERE id=?",(request_id,)).fetchone()
        if not req: raise HTTPException(404,"Заявка не найдена")
        if req["status"] in ("paid","rejected"):
            raise HTTPException(409,"Заявка уже закрыта")
        con.execute("UPDATE withdrawal_requests SET status=?,updated_at=?,admin_note=? WHERE id=?",
                    (body.status,now(),body.admin_note,request_id))
        gift_inventory_ids=json.loads(req["inventory_ids_json"] or "[]") if req["asset_type"]=="gift" else []
        if req["asset_type"]=="gift" and not gift_inventory_ids and req["inventory_id"]:
            gift_inventory_ids=[req["inventory_id"]]
        if body.status=="paid":
            if req["asset_type"]=="gift" and gift_inventory_ids:
                placeholders=",".join("?" for _ in gift_inventory_ids)
                con.execute(f"UPDATE inventory SET status='withdrawn' WHERE id IN ({placeholders}) AND status='withdraw_pending'",
                            tuple(gift_inventory_ids))
            elif req["asset_type"]=="stars":
                con.execute("UPDATE transactions SET status='completed' WHERE tg_id=? AND type='withdrawal_reserve' AND reference=?",
                            (req["tg_id"],str(request_id)))
        if body.status=="rejected":
            if req["asset_type"]=="stars" and req["amount"]:
                con.execute("UPDATE users SET balance=balance+? WHERE tg_id=?",(req["amount"],req["tg_id"]))
                con.execute("UPDATE transactions SET status='rejected' WHERE tg_id=? AND type='withdrawal_reserve' AND reference=?",
                            (req["tg_id"],str(request_id)))
                con.execute("INSERT INTO transactions(tg_id,type,amount,currency,status,reference,note,created_at) VALUES(?,?,?,?,?,?,?,?)",
                            (req["tg_id"],"withdrawal_refund",req["amount"],"XTR","completed",str(request_id),"Заявка отклонена",now()))
            elif req["asset_type"]=="gift" and gift_inventory_ids:
                placeholders=",".join("?" for _ in gift_inventory_ids)
                con.execute(f"UPDATE inventory SET status='owned' WHERE id IN ({placeholders}) AND status='withdraw_pending'",
                            tuple(gift_inventory_ids))
        log_action(con,admin["tg_id"],req["tg_id"],"withdrawal_status",f"{request_id}:{body.status}:{body.admin_note}")
    return {"ok":True,"status":body.status}

@app.get("/api/admin/stats")
def admin_stats(admin=Depends(admin_user)):
    with connect() as con:
        users=con.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        active=con.execute("SELECT COUNT(*) FROM users WHERE is_banned=0").fetchone()[0]
        inventory=con.execute("SELECT COUNT(*) FROM inventory WHERE status='owned'").fetchone()[0]
        paid=con.execute("SELECT COALESCE(SUM(amount),0) FROM transactions WHERE amount>0 AND status='completed'").fetchone()[0]
        spent=con.execute("SELECT COALESCE(SUM(-amount),0) FROM transactions WHERE amount<0 AND status='completed'").fetchone()[0]
    return {"users":users,"active_users":active,"inventory_items":inventory,"credited_stars":paid,"spent_stars":spent}

def add_stars_from_payment(tg_id:int, amount:int, charge_id:str, payload:str):
    # Idempotency: the Telegram charge id is unique, so webhook/poll retries cannot credit twice.
    parts=payload.split("|")
    if len(parts)<4 or parts[0]!="deposit" or int(parts[1])!=tg_id or int(parts[2])!=amount:
        raise ValueError("Payment payload mismatch")
    with connect() as con:
        con.execute("BEGIN IMMEDIATE")
        if con.execute("SELECT 1 FROM payments WHERE telegram_charge_id=?",(charge_id,)).fetchone():
            return False
        if not con.execute("SELECT 1 FROM users WHERE tg_id=?",(tg_id,)).fetchone():
            con.execute("INSERT INTO users(tg_id,first_name,created_at) VALUES(?,?,?)",(tg_id,"Player",now()))
        con.execute("INSERT INTO payments(telegram_charge_id,tg_id,amount,payload,created_at) VALUES(?,?,?,?,?)",
                    (charge_id,tg_id,amount,payload,now()))
        con.execute("UPDATE users SET balance=balance+? WHERE tg_id=?",(amount,tg_id))
        con.execute("INSERT INTO transactions(tg_id,type,amount,currency,status,reference,note,created_at) VALUES(?,?,?,?,?,?,?,?)",
                    (tg_id,"deposit",amount,"XTR","completed",charge_id,"Telegram Stars payment",now()))
        log_action(con,None,tg_id,"stars_deposit",f"{amount};{charge_id}")
    return True


# Production Mini App static files. API routes are registered above this mount.
WEBAPP_DIR = PROJECT / "webapp"
if not (WEBAPP_DIR / "index.html").is_file():
    legacy_dir = PROJECT / "frontend" / "dist"
    if (legacy_dir / "index.html").is_file():
        WEBAPP_DIR = legacy_dir
if (WEBAPP_DIR / "index.html").is_file():
    app.mount("/", StaticFiles(directory=WEBAPP_DIR, html=True), name="frontend")
