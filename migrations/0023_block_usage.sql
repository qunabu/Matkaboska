-- Statystyki ekranu z telefonu: ile czasu na czym i ile blokad/odblokowań.
-- Telefon jest źródłem prawdy i co kilka minut wysyła zbiorczy stan dnia
-- (upsert), więc powtórzony wysył niczego nie dubluje.

CREATE TABLE IF NOT EXISTS block_usage (
  user_id TEXT NOT NULL DEFAULT '',
  date    TEXT NOT NULL,              -- "YYYY-MM-DD" wg strefy telefonu
  target  TEXT NOT NULL,              -- host albo pakiet aplikacji
  seconds INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date, target)
);
CREATE INDEX IF NOT EXISTS block_usage_user_date_idx ON block_usage(user_id, date);

CREATE TABLE IF NOT EXISTS block_stats (
  user_id        TEXT NOT NULL DEFAULT '',
  date           TEXT NOT NULL,
  blocks         INTEGER NOT NULL DEFAULT 0,   -- ile razy coś zablokowano
  unlocks        INTEGER NOT NULL DEFAULT 0,   -- ile razy odhaczono nawyk po blokadzie
  screen_unlocks INTEGER NOT NULL DEFAULT 0,   -- ile razy odblokowano telefon
  PRIMARY KEY (user_id, date)
);
