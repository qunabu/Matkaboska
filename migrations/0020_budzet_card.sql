-- Karty kredytowe: nie mają IBAN-u, więc do dopasowania między sesjami służy
-- identification_hash. Typ rachunku (CARD/CACC/SVGS) decyduje o tym, czy saldo
-- jest gotówką, czy zobowiązaniem.
ALTER TABLE budzet_bank_accounts ADD COLUMN identification_hash TEXT;
ALTER TABLE budzet_bank_accounts ADD COLUMN cash_account_type TEXT;
-- Zapisujemy, który typ salda przyjęliśmy — przy karcie łatwo pomylić kwotę
-- zadłużenia z dostępnym limitem, a to widać tylko po kodzie typu.
ALTER TABLE budzet_accounts ADD COLUMN balance_type TEXT;
