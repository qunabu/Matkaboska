-- Zgoda PSD2 wygasa (do 180 dni) i trzeba ją odnowić recznie w banku.
-- Zapisujemy, przy jakim progu dni wysłaliśmy już powiadomienie, żeby cron
-- co 15 minut nie przypominał w kółko.
ALTER TABLE budzet_bank_connections ADD COLUMN expiry_notified_days INTEGER;
