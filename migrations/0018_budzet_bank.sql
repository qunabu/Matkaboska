-- Automatyczne pobieranie transakcji przez Enable Banking (PSD2 AIS).
-- Zgoda banku wygasa (zwykle do 180 dni), więc trzymamy jej datę ważności
-- i status, żeby interfejs mógł w porę poprosić o ponowne uwierzytelnienie.

CREATE TABLE IF NOT EXISTS budzet_bank_connections (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       TEXT NOT NULL DEFAULT '',
  aspsp_name    TEXT NOT NULL,
  aspsp_country TEXT NOT NULL,
  session_id    TEXT,
  status        TEXT NOT NULL DEFAULT 'PENDING',
  valid_until   TEXT,
  created_at    TEXT NOT NULL DEFAULT '',
  last_sync_at  TEXT,
  last_error    TEXT
);
CREATE INDEX IF NOT EXISTS budzet_bank_conn_user_idx ON budzet_bank_connections(user_id);

CREATE TABLE IF NOT EXISTS budzet_bank_accounts (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        TEXT NOT NULL DEFAULT '',
  connection_id  INTEGER NOT NULL,
  uid            TEXT NOT NULL,
  iban           TEXT,
  name           TEXT,
  currency       TEXT,
  account_id     TEXT,            -- powiązanie z budzet_accounts.id
  last_synced_to TEXT,
  enabled        INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS budzet_bank_acc_user_idx ON budzet_bank_accounts(user_id, connection_id);
