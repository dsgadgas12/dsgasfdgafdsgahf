-- Дополнение MVP: общий серверный Crash и очередь заявок на вывод.
CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tg_id INTEGER NOT NULL,
  asset_type TEXT NOT NULL,
  amount INTEGER,
  inventory_id INTEGER,
  gift_id TEXT,
  destination TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  submitted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  admin_note TEXT
);
CREATE TABLE IF NOT EXISTS crash_rounds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status TEXT NOT NULL,
  created_at REAL NOT NULL,
  betting_ends_at REAL NOT NULL,
  started_at REAL,
  crash_at REAL NOT NULL,
  crashed_at REAL
);
CREATE TABLE IF NOT EXISTS crash_bets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  round_id INTEGER NOT NULL,
  tg_id INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  cashout_multiplier REAL,
  payout INTEGER NOT NULL DEFAULT 0,
  created_at REAL NOT NULL,
  UNIQUE(round_id, tg_id),
  FOREIGN KEY(round_id) REFERENCES crash_rounds(id)
);
-- Псевдо-элементы используются только как ключи призов в case_items.
-- Backend трактует их как начисление Stars и исключает из каталога и инвентаря.
INSERT OR IGNORE INTO gifts(id,name,price_stars,image,rarity,image_status) VALUES
('stars-10','10 Telegram Stars',10,NULL,'Звёзды','star'),
('stars-25','25 Telegram Stars',25,NULL,'Звёзды','star'),
('stars-50','50 Telegram Stars',50,NULL,'Звёзды','star'),
('stars-80','80 Telegram Stars',80,NULL,'Звёзды','star'),
('stars-100','100 Telegram Stars',100,NULL,'Звёзды','star'),
('stars-250','250 Telegram Stars',250,NULL,'Звёзды','star'),
('stars-500','500 Telegram Stars',500,NULL,'Звёзды','star'),
('stars-1000','1000 Telegram Stars',1000,NULL,'Звёзды','star');

CREATE TABLE IF NOT EXISTS mines_games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tg_id INTEGER NOT NULL,
  bet INTEGER NOT NULL,
  grid_size INTEGER NOT NULL,
  mine_count INTEGER NOT NULL,
  mines_json TEXT NOT NULL,
  opened_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active',
  multiplier REAL NOT NULL DEFAULT 1.0,
  payout INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_mines_user_status ON mines_games(tg_id,status);
