-- Transakcje z API banku miały IBAN-y z prefiksem „PL”, a rachunki i wyciągi CSV
-- bez niego. Przez to przelewy własne nie były rozpoznawane po IBAN-ach.
UPDATE budzet_transactions SET src_iban = substr(src_iban, 3)
 WHERE src_iban LIKE 'PL%' AND length(src_iban) = 28;
UPDATE budzet_transactions SET dst_iban = substr(dst_iban, 3)
 WHERE dst_iban LIKE 'PL%' AND length(dst_iban) = 28;
