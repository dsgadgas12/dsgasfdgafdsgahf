-- Основная схема CloudeGift. При первом запуске таблицы создаются backend/main.py.
CREATE TABLE users (
  tg_id INTEGER PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  photo_url TEXT,
  balance INTEGER NOT NULL DEFAULT 0,
  is_banned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE gifts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price_stars INTEGER NOT NULL,
  image TEXT,
  rarity TEXT,
  image_status TEXT
);
CREATE TABLE cases (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price_stars INTEGER NOT NULL,
  category TEXT NOT NULL,
  theme TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE case_items (
  case_id TEXT NOT NULL,
  gift_id TEXT NOT NULL,
  weight_bp INTEGER NOT NULL,
  PRIMARY KEY(case_id,gift_id)
);
CREATE TABLE inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tg_id INTEGER NOT NULL,
  gift_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'owned',
  acquired_at TEXT NOT NULL
);
CREATE TABLE transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tg_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'XTR',
  status TEXT NOT NULL,
  reference TEXT,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE payments (
  telegram_charge_id TEXT PRIMARY KEY,
  tg_id INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE action_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER,
  target_id INTEGER,
  action TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL
);
