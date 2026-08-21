---
name: budzet-analiza
description: Comiesięczny przegląd budżetu Qunabu — pobiera dane z produkcyjnego D1, sprawdza integralność, liczy plan wypłaty i raportuje, co się zmieniło. Użyj, gdy użytkownik prosi o przegląd/analizę budżetu, pyta „ile mogę odłożyć", „jak wyszedł miesiąc", „rozpisz przelewy" albo gdy zadziałało przypomnienie z aplikacji (5. lub 25. dnia miesiąca).
---

# Analiza budżetu — stała procedura

Moduł Budżet żyje w aplikacji Matkaboska (Cloudflare Worker + D1), nie w lokalnym
prototypie `~/Desktop/localhost/budzet` — ten jest nieaktualny i służy już tylko
za archiwum. Katalog roboczy: `~/Desktop/localhost/Matkaboska`.

Produkcja: https://meal-planner.qunabu.workers.dev/budzet
Baza: D1 `meal-planner-db`, tabele z prefiksem `budzet_`. Wszystko jest
scope'owane po `user_id` (adres e-mail konta Google) — ustal go raz na początku:
`SELECT DISTINCT user_id FROM budzet_transactions` i podstawiaj w kolejnych
zapytaniach. To repozytorium jest **publiczne**, więc nie wpisuj tu adresów,
kwot ani innych danych konkretnej osoby.

## Krok 0 — autoryzacja

```bash
export CLOUDFLARE_API_TOKEN=$(cat "$BUDZET_TOKEN_FILE")   # ścieżkę poda użytkownik
```

Trwała sesja OAuth wranglera może dotyczyć innego konta Cloudflare niż to, które
jest właścicielem bazy — wtedy każde zapytanie do D1 zwróci błąd mimo „zalogowania".
Poproś wówczas użytkownika o token API do właściwego konta i **nie ratuj się
`wrangler login`**: nadpisałby profil używany do innej pracy.

Zapytania uruchamiaj z katalogu Matkaboska:
`npx wrangler d1 execute meal-planner-db --remote --json --command "…"`

## Krok 1 — świeżość i integralność

Zanim policzysz cokolwiek, sprawdź, czy dane nadają się do wnioskowania:

- **Synchronizacja**: `SELECT aspsp_name, status, last_sync_at, last_error, valid_until FROM budzet_bank_connections`
  Wszystkie trzy połączenia powinny mieć świeże `last_sync_at` i pusty `last_error`.
- **Zgoda bankowa**: jeśli `valid_until` jest bliżej niż 21 dni — powiedz o tym
  na początku raportu, nie na końcu. Po wygaśnięciu pobieranie milknie bez błędu.
- **Suma kontrolna**: `SELECT COUNT(*), ROUND(SUM(amount),2) FROM budzet_transactions WHERE user_id = ?`
  Porównaj z poprzednim przeglądem. Skok liczby transakcji przy niezmienionym
  zakresie dat = prawdopodobne duplikaty (patrz Pułapki).
- **Duplikaty**: `SELECT account_id, booked_on, printf('%.2f',amount) k, COUNT(*) n FROM budzet_transactions WHERE user_id = ? GROUP BY 1,2,3 HAVING n>1 ORDER BY n DESC LIMIT 10`
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

Konkretne kwoty, stawki i terminy są **danymi w bazie, nie w tym pliku** —
odczytaj je, zamiast zakładać:

- parametry planu → `GET /api/budzet/payout/defaults` oraz tabela `budzet_settings`
- role rachunków → `budzet_settings` (`account_business`, `account_tax`,
  `account_daily`, `account_hub`) i tabela `budzet_accounts`
- przypisanie kategorii do kont → `budzet_category_targets`
- zobowiązania z terminem i rezerwy → `budzet_accruals`, `budzet_reserves`

Zasady modelu, które nie zmieniają się między miesiącami:

- **Przychód**: kaskada brutto → VAT (przepływowy, nie jest dochodem) → netto →
  ZUS i PIT-28 → koszty firmy → dostępne.
- **Konto główne (hub) nie jest kontem wydatkowym** — przyjmuje resztę, zasila
  pozostałe rachunki i gromadzi oszczędności. **Jego saldo to stan oszczędności**:
  definicja, nie szacunek.
- Wyjazdy finansowane są z oszczędności, nie z bieżących wydatków.
- Kwoty stałych przelewów są zobowiązaniami z ustawień, nie medianą z historii.
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
