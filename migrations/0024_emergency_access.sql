-- Dostęp awaryjny: wybrane reguły (np. poczta) można odblokować bez nawyku.
-- Domyślnie wyłączone — włącza się per reguła w PWA, żeby nie rozmiękczyć
-- wszystkich blokad naraz.

ALTER TABLE block_rules ADD COLUMN allow_emergency INTEGER NOT NULL DEFAULT 0;

-- Liczone osobno od odblokowań za nawyk: to ma być widoczne, jak często się
-- z tego korzysta.
ALTER TABLE block_stats ADD COLUMN emergency INTEGER NOT NULL DEFAULT 0;
