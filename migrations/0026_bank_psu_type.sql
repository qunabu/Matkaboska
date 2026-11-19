-- Typ konta (osobiste / firmowe) przy połączeniu z bankiem. W jednym banku
-- bywają dwa połączenia (np. Pekao osobiste i firmowe) — odnowienie zgody
-- jednego nie może zastępować drugiego.

ALTER TABLE budzet_bank_connections ADD COLUMN psu_type TEXT NOT NULL DEFAULT 'personal';

UPDATE budzet_bank_connections SET psu_type = 'business'
 WHERE id IN (SELECT DISTINCT connection_id FROM budzet_bank_accounts WHERE upper(name) = 'QUNABU');
