-- Nagłówki PSU użyte przy autoryzacji. Część banków (mBank) wymaga ich także
-- przy pobieraniu danych, a synchronizacja z crona nie ma życiowego żądania
-- użytkownika, z którego mogłaby je wziąć.
ALTER TABLE budzet_bank_connections ADD COLUMN psu_ip TEXT;
ALTER TABLE budzet_bank_connections ADD COLUMN psu_user_agent TEXT;
