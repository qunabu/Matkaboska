-- Budżet: analiza wyciągów bankowych. Wszystko scope'owane po user_id (multi-tenant).
-- Konta NIE są wpisane na sztywno — powstają automatycznie przy imporcie CSV,
-- dzięki czemu moduł działa dla dowolnego konta, nie tylko autora.

CREATE TABLE IF NOT EXISTS budzet_accounts (
  user_id         TEXT NOT NULL DEFAULT '',
  id              TEXT NOT NULL,
  iban            TEXT,
  source_key      TEXT,          -- etykieta/IBAN prosto z wyciągu (nazwa bywa zmieniana przez użytkownika)
  name            TEXT NOT NULL,
  short           TEXT NOT NULL,
  kind            TEXT NOT NULL DEFAULT 'personal',
  bank            TEXT,
  current_balance REAL,
  balance_as_of   TEXT,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS budzet_accounts_iban_idx ON budzet_accounts(user_id, iban);

CREATE TABLE IF NOT EXISTS budzet_imports (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL DEFAULT '',
  filename    TEXT NOT NULL,
  file_hash   TEXT NOT NULL,
  format      TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  rows_parsed INTEGER NOT NULL DEFAULT 0,
  rows_new    INTEGER NOT NULL DEFAULT 0,
  rows_dup    INTEGER NOT NULL DEFAULT 0,
  period_from TEXT,
  period_to   TEXT
);
CREATE INDEX IF NOT EXISTS budzet_imports_user_idx ON budzet_imports(user_id);

CREATE TABLE IF NOT EXISTS budzet_transactions (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id           TEXT NOT NULL DEFAULT '',
  dedupe_key        TEXT NOT NULL,
  import_id         INTEGER,
  account_id        TEXT NOT NULL,
  booked_on         TEXT NOT NULL,
  value_on          TEXT,
  month             TEXT NOT NULL,
  amount            REAL NOT NULL,
  currency          TEXT NOT NULL DEFAULT 'PLN',
  counterparty      TEXT,
  counterparty_norm TEXT,
  description       TEXT,
  address           TEXT,
  src_iban          TEXT,
  dst_iban          TEXT,
  bank_category     TEXT,
  op_type           TEXT,
  reference         TEXT,
  haystack          TEXT NOT NULL DEFAULT '',
  category_id       TEXT NOT NULL DEFAULT 'do_sklasyfikowania',
  category_source   TEXT NOT NULL DEFAULT 'none',
  rule_id           INTEGER,
  is_business       INTEGER,
  business_source   TEXT NOT NULL DEFAULT 'none',
  transfer_group    TEXT,
  is_internal       INTEGER NOT NULL DEFAULT 0,
  excluded          INTEGER NOT NULL DEFAULT 0,
  orig_category_id  TEXT,
  note              TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS budzet_tx_dedupe ON budzet_transactions(user_id, dedupe_key);
CREATE INDEX IF NOT EXISTS budzet_tx_month    ON budzet_transactions(user_id, month);
CREATE INDEX IF NOT EXISTS budzet_tx_cat      ON budzet_transactions(user_id, category_id);
CREATE INDEX IF NOT EXISTS budzet_tx_acc      ON budzet_transactions(user_id, account_id);
CREATE INDEX IF NOT EXISTS budzet_tx_merchant ON budzet_transactions(user_id, counterparty_norm);
CREATE INDEX IF NOT EXISTS budzet_tx_booked   ON budzet_transactions(user_id, booked_on);

CREATE TABLE IF NOT EXISTS budzet_rules (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL DEFAULT '',
  pattern     TEXT NOT NULL,
  category_id TEXT NOT NULL,
  label       TEXT,
  is_business INTEGER,
  sign        TEXT,
  prio        INTEGER NOT NULL DEFAULT 100,
  enabled     INTEGER NOT NULL DEFAULT 1,
  origin      TEXT NOT NULL DEFAULT 'seed',
  hits        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS budzet_rules_user_idx ON budzet_rules(user_id, prio DESC);

CREATE TABLE IF NOT EXISTS budzet_budgets (
  user_id       TEXT NOT NULL DEFAULT '',
  category_id   TEXT NOT NULL,
  monthly_limit REAL NOT NULL,
  source        TEXT NOT NULL DEFAULT 'suggested',
  PRIMARY KEY (user_id, category_id)
);

CREATE TABLE IF NOT EXISTS budzet_settings (
  user_id TEXT NOT NULL DEFAULT '',
  key     TEXT NOT NULL,
  value   TEXT NOT NULL,
  PRIMARY KEY (user_id, key)
);

CREATE TABLE IF NOT EXISTS budzet_net_worth_items (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id  TEXT NOT NULL DEFAULT '',
  kind     TEXT NOT NULL,
  name     TEXT NOT NULL,
  category TEXT,
  amount   REAL NOT NULL,
  as_of    TEXT NOT NULL,
  note     TEXT
);
CREATE INDEX IF NOT EXISTS budzet_nw_user_idx ON budzet_net_worth_items(user_id);

-- Koszty poniesione, jeszcze niezafakturowane i niezapłacone.
CREATE TABLE IF NOT EXISTS budzet_accruals (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        TEXT NOT NULL DEFAULT '',
  name           TEXT NOT NULL,
  category_id    TEXT NOT NULL DEFAULT 'uslugi_firmowe',
  start_month    TEXT NOT NULL,
  end_month      TEXT,
  amount_net     REAL NOT NULL,
  vat_rate       REAL NOT NULL DEFAULT 0.23,
  vat_deductible INTEGER NOT NULL DEFAULT 1,
  is_business    INTEGER NOT NULL DEFAULT 1,
  settled        INTEGER NOT NULL DEFAULT 0,
  settled_on     TEXT,
  due_month      TEXT,
  save_from      TEXT,
  note           TEXT
);
CREATE INDEX IF NOT EXISTS budzet_accruals_user_idx ON budzet_accruals(user_id);

-- Rezerwy na wydatki cykliczne (ubezpieczenia roczne, przeglądy).
CREATE TABLE IF NOT EXISTS budzet_reserves (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        TEXT NOT NULL DEFAULT '',
  name           TEXT NOT NULL,
  category_id    TEXT NOT NULL DEFAULT 'ubezpieczenia',
  amount         REAL NOT NULL,
  period_months  INTEGER NOT NULL DEFAULT 12,
  next_due_month TEXT NOT NULL,
  target         TEXT NOT NULL DEFAULT '',
  active         INTEGER NOT NULL DEFAULT 1,
  note           TEXT
);
CREATE INDEX IF NOT EXISTS budzet_reserves_user_idx ON budzet_reserves(user_id);

-- Docelowa struktura: z którego konta MA być opłacana dana kategoria.
CREATE TABLE IF NOT EXISTS budzet_category_targets (
  user_id     TEXT NOT NULL DEFAULT '',
  category_id TEXT NOT NULL,
  target      TEXT NOT NULL,
  PRIMARY KEY (user_id, category_id)
);
