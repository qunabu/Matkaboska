-- Blokady: reguły blokowania stron/aplikacji dla telefonu (SiteLimit na Androidzie).
-- Regułami zarządza się w PWA; telefon je tylko pobiera i trzyma lokalnie,
-- żeby blokowanie działało też bez internetu.

CREATE TABLE IF NOT EXISTS block_rules (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id             TEXT NOT NULL DEFAULT '',
  -- Host ("reddit.com"), sama nazwa ("facebook") albo pakiet ("com.instagram.android").
  pattern             TEXT NOT NULL,
  -- 0 = blokada na stałe; >0 = dzienny limit w minutach.
  daily_limit_minutes INTEGER NOT NULL DEFAULT 0,
  active              INTEGER NOT NULL DEFAULT 1,
  created_at          INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX IF NOT EXISTS block_rules_user_pattern_uidx ON block_rules(user_id, pattern);
CREATE INDEX IF NOT EXISTS block_rules_user_idx ON block_rules(user_id);

-- Telefon nie przejdzie logowania Google, więc dostaje własny długoterminowy token.
-- Token można w każdej chwili usunąć w PWA — wtedy urządzenie traci dostęp.
CREATE TABLE IF NOT EXISTS block_devices (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT NOT NULL DEFAULT '',
  name         TEXT NOT NULL,
  token        TEXT NOT NULL,
  last_seen_at INTEGER,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX IF NOT EXISTS block_devices_token_uidx ON block_devices(token);
CREATE INDEX IF NOT EXISTS block_devices_user_idx ON block_devices(user_id);
