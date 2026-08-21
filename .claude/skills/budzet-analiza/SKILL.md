---
name: budzet-analiza
description: Comiesięczny przegląd budżetu Qunabu — pobiera dane z produkcyjnego D1, sprawdza integralność, liczy plan wypłaty i raportuje, co się zmieniło. Użyj, gdy użytkownik prosi o przegląd/analizę budżetu, pyta „ile mogę odłożyć", „jak wyszedł miesiąc", „rozpisz przelewy" albo gdy zadziałało przypomnienie z aplikacji (5. lub 25. dnia miesiąca).
---

# Analiza budżetu — stała procedura

Moduł Budżet żyje w aplikacji Matkaboska (Cloudflare Worker + D1), nie w lokalnym
prototypie `~/Desktop/localhost/budzet` — ten jest nieaktualny i służy już tylko
za archiwum. Katalog roboczy: `~/Desktop/localhost/Matkaboska`.

Produkcja: https://meal-planner.qunabu.workers.dev/budzet
Baza: D1 `meal-planner-db`, tabele z prefiksem `budzet_`, `user_id = 'qunabu.com@gmail.com'`.

## Krok 0 — autoryzacja

```bash
export CLOUDFLARE_API_TOKEN=$(cat ~/.config/budzet/cf-token)
```

Trwała sesja OAuth wranglera dotyczy konta handsontable.com i **nie ma dostępu**
do bazy Qunabu — bez tego tokenu każde zapytanie do D1 zwróci błąd. Jeśli token
wygasł, poproś użytkownika o odnowienie (instrukcja: `~/.config/budzet/README.md`)
i nie próbuj obchodzić tego `wrangler login` — nadpisałby profil do pracy z Handsontable.

Zapytania uruchamiaj z katalogu Matkaboska:
`npx wrangler d1 execute meal-planner-db --remote --json --command "…"`

## Krok 1 — świeżość i integralność

Zanim policzysz cokolwiek, sprawdź, czy dane nadają się do wnioskowania:

- **Synchronizacja**: `SELECT aspsp_name, status, last_sync_at, last_error, valid_until FROM budzet_bank_connections`
  Wszystkie trzy połączenia powinny mieć świeże `last_sync_at` i pusty `last_error`.
- **Zgoda bankowa**: jeśli `valid_until` jest bliżej niż 21 dni — powiedz o tym
  na początku raportu, nie na końcu. Po wygaśnięciu pobieranie milknie bez błędu.
- **Suma kontrolna**: `SELECT COUNT(*), ROUND(SUM(amount),2) FROM budzet_transactions WHERE user_id='qunabu.com@gmail.com'`
  Porównaj z poprzednim przeglądem. Skok liczby transakcji przy niezmienionym
  zakresie dat = prawdopodobne duplikaty (patrz Pułapki).
- **Duplikaty**: `SELECT account_id, booked_on, printf('%.2f',amount) k, COUNT(*) n FROM budzet_transactions WHERE user_id='qunabu.com@gmail.com' GROUP BY 1,2,3 HAVING n>1 ORDER BY n DESC LIMIT 10`
  Uwaga: dwie różne transakcje tej samej kwoty jednego dnia to norma — sprawdź
  `counterparty_norm`, zanim nazwiesz coś duplikatem.

## Krok 2 — liczby

Nie licz niczego ręcznie w SQL-u, jeśli robi to już kod aplikacji. Odtwórz
produkcję lokalnie i odpytaj prawdziwe endpointy — inaczej ryzykujesz rozjazd
z tym, co widzi użytkownik:

1. Wyeksportuj tabele `budzet_*` z produkcji **z jawną listą kolumn**
   (pozycyjny `INSERT` raz przesunął całą tabelę kont — patrz Pułapki).
2. Wgraj do lokalnego D1, uruchom `npx wrangler dev --local`.
3. Odpytaj `/api/budzet/overview` oraz `/api/budzet/payout/plan`.

## Krok 3 — co się zmieniło

- `/api/budzet/anomalies` — kategorie odstające od mediany 6 poprzednich miesięcy.
- `/api/budzet/recurring` — nowe pozycje cykliczne oraz oznaczone `stale`
  (wygasłe abonamenty to najszybsze realne oszczędności).
- `/api/budzet/review-queue` — nieskategoryzowane. Enable Banking nie zwraca
  kategorii bankowych, więc ta lista rośnie sama; zaproponuj użycie przycisku
  „Zaproponuj kategorie" albo dopisanie reguł.
- Trajektoria: czy `steady.net_accumulation` poprawił się względem poprzedniego
  miesiąca i dlaczego.

## Krok 4 — raport

Stały format, w tej kolejności:

1. **Czy dane są wiarygodne** — jedno zdanie. Jeśli nie, resztę opatrz zastrzeżeniem.
2. **Ile zostało w tym miesiącu** i ile docelowo (bez jednorazowych zdarzeń).
3. **Co się zmieniło** względem poprzedniego miesiąca — tylko rzeczy istotne kwotowo.
4. **Co wymaga decyzji** — konkretnie, z kwotą i progiem.

Nie powtarzaj liczb, które się nie zmieniły. Nie proponuj oszczędności poniżej
100 zł/mies. Jeśli nic się nie zmieniło, napisz to wprost zamiast produkować raport.

## Model finansowy — nie wyprowadzaj go od nowa

- **Przychód**: kaskada brutto → VAT (23%, przepływowy) → netto → ZUS, PIT-28
  (ryczałt ~11,2% netto) → koszty firmy → dostępne.
- **Struktura kont**: subkonto = podatki + biuro + telekom; firmowe = koszty
  i mini poduszka; **PKO = wyłącznie przelewy i oszczędności, nic się stamtąd
  nie płaci**; mBank = wszystkie wydatki niefirmowe; ING = sztywne 9 500 zł.
- **Saldo PKO to stan oszczędności** — to jest definicja, nie szacunek.
- Wyjazdy finansowane są z oszczędności, nie z bieżących wydatków.
- Zobowiązanie za biuro: 600 zł netto + VAT od 02-2025, zapłata luty 2027,
  6 rat po 2 952 zł od września 2026.
- Miesiące brzegowe są niepełne — nigdy nie wchodzą do średnich.

## Pułapki — sprawdzone, nie powtarzaj

- **Daty**: mBank podaje w CSV datę operacji, w API datę księgowania — różnią się
  o dzień. Deduplikacja działa w oknie ±4 dni. Dopasowanie po dokładnej dacie
  wpuściło kiedyś 992 duplikaty i zepsuło sumę kontrolną.
- **IBAN**: API zwraca z prefiksem `PL`, CSV bez — porównuj po samych cyfrach.
- **Karta kredytowa**: mBank raportuje ją jako `CACC`, nie `CARD`. Salda
  `ITBD`/`ITAV` to limit i dostępna część — **zadłużenie to różnica**.
- **Eksport między bazami**: zawsze z jawną listą kolumn.
- **Limity historii**: Pekao twarde 90 dni, mBank ignoruje `date_from` i oddaje
  od 2025-08-01. Operacji oczekujących nie zwraca żaden — świeża płatność
  pojawi się dopiero po zaksięgowaniu.
- **Cron**: jedno połączenie na tyknięcie; pełny przebieg przekracza budżet
  czasu Workera i urywa się bez śladu w logach.

## Czego nie robić bez pytania

- Nie zmieniaj kategorii ani reguł hurtowo — to decyzje użytkownika.
- Nie wysyłaj niczego do banków ani nie wykonuj przelewów; aplikacja tylko liczy.
- Nie commituj kluczy, tokenów ani plików CSV.
