-- Zaległe faktury spłacane ratami. Raty takiego zobowiązania to zapłaty, nie
-- odkładanie na jednorazowy przelew: zmniejszają dług, a na subkoncie nie musi
-- nic na nie czekać. Przykład: biuro wystawia co miesiąc fakturę bieżącą
-- i jedną zaległą, aż zaległość zniknie.

ALTER TABLE budzet_accruals ADD COLUMN pays_down INTEGER NOT NULL DEFAULT 0;
