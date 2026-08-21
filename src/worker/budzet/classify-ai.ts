import Anthropic from '@anthropic-ai/sdk'
import { CATEGORIES } from './categories'

/**
 * Podpowiadanie kategorii dla nieznanych sprzedawców.
 *
 * Enable Banking nie zwraca kategorii bankowych, więc dla danych z API znika
 * warstwa, która wcześniej pokrywała setki transakcji z CSV. Model uzupełnia tę
 * lukę, ale wyłącznie jako PROPOZYCJA — zapis wymaga zatwierdzenia przez
 * użytkownika w kolejce „Do sklasyfikowania".
 *
 * Wyszukiwanie w sieci włączamy, bo nazwy z terminali płatniczych („PL BK GDANSK
 * BALTYCKA", „KIP", „AUTOPAY") bywają nierozpoznawalne bez sprawdzenia, co to za
 * firma. Limit użyć chroni przed kosztem i przewlekaniem odpowiedzi.
 */

export type SuggestItem = {
  merchant: string
  sample?: string | null
  bank_categories?: string | null
  n?: number
  total?: number
}

export type Suggestion = {
  merchant: string
  category_id: string
  confidence: 'wysoka' | 'srednia' | 'niska'
  reason: string
}

const VALID = new Set(CATEGORIES.map((c) => c.id))

/** Model bywa gadatliwy mimo instrukcji — wyłuskujemy pierwszą tablicę JSON. */
function extractJsonArray(text: string): unknown[] | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = fenced ? fenced[1]! : text
  const start = raw.indexOf('[')
  const end = raw.lastIndexOf(']')
  if (start === -1 || end === -1 || end <= start) return null
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1))
    return Array.isArray(parsed) ? parsed : null
  } catch { return null }
}

export async function suggestCategories(
  env: { ANTHROPIC_API_KEY?: string },
  items: SuggestItem[],
): Promise<{ suggestions: Suggestion[]; usedSearch: boolean }> {
  if (!env.ANTHROPIC_API_KEY) throw new Error('Brak ANTHROPIC_API_KEY')
  if (!items.length) return { suggestions: [], usedSearch: false }

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })

  const catalogue = CATEGORIES
    .filter((c) => !['do_sklasyfikowania', 'transfer_wlasny'].includes(c.id))
    .map((c) => `${c.id} = ${c.name} (${c.group})`)
    .join('\n')

  const list = items.map((i, n) => {
    const bits = [`${n + 1}. "${i.merchant}"`]
    if (i.n) bits.push(`wystąpień: ${i.n}`)
    if (i.total) bits.push(`łącznie: ${i.total.toFixed(2)} zł`)
    if (i.bank_categories) bits.push(`kategoria banku: ${i.bank_categories}`)
    if (i.sample) bits.push(`opis: ${String(i.sample).slice(0, 120)}`)
    return bits.join(' | ')
  }).join('\n')

  const response = await client.messages.create({
    model: 'claude-opus-5',
    max_tokens: 8000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'low' },
    tools: [{
      type: 'web_search_20260209',
      name: 'web_search',
      max_uses: Math.min(10, items.length),
    }],
    system:
      'Kategoryzujesz transakcje z polskich wyciągów bankowych. Nazwy pochodzą z terminali ' +
      'płatniczych i przelewów, więc bywają skrócone lub zawierają numery sklepów.\n\n' +
      'Dostępne kategorie (użyj DOKŁADNIE identyfikatora z lewej strony):\n' + catalogue + '\n\n' +
      'Zasady:\n' +
      '- Jeśli nazwa jest nierozpoznawalna, użyj wyszukiwarki, żeby ustalić, czym jest ta firma.\n' +
      '- Nazwiska osób i przelewy P2P to "p2p", chyba że opis wskazuje na konkretny cel.\n' +
      '- Gdy naprawdę nie wiesz, zwróć "do_sklasyfikowania" z niską pewnością — zgadywanie jest gorsze niż przyznanie się.\n' +
      '- confidence: "wysoka" gdy rozpoznajesz markę, "srednia" gdy wnioskujesz z kontekstu, "niska" gdy zgadujesz.\n' +
      '- reason: maksymalnie 10 słów po polsku.\n\n' +
      'Odpowiedz WYŁĄCZNIE tablicą JSON, bez komentarza i bez bloku kodu:\n' +
      '[{"merchant":"...","category_id":"...","confidence":"wysoka|srednia|niska","reason":"..."}]',
    messages: [{ role: 'user', content: `Skategoryzuj:\n${list}` }],
  })

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text).join('\n')
  const usedSearch = response.content.some((b) => b.type === 'web_search_tool_result')

  const parsed = extractJsonArray(text) ?? []
  const byMerchant = new Map(items.map((i) => [i.merchant, i]))
  const suggestions: Suggestion[] = []
  for (const row of parsed) {
    const r = row as Record<string, unknown>
    const merchant = String(r.merchant ?? '')
    if (!byMerchant.has(merchant)) continue
    const category = String(r.category_id ?? '')
    // Model bywa kreatywny z identyfikatorami — nieznane odrzucamy, zamiast
    // zapisać kategorię, której nie ma w drzewie.
    if (!VALID.has(category)) continue
    const conf = String(r.confidence ?? 'niska')
    suggestions.push({
      merchant, category_id: category,
      confidence: (['wysoka', 'srednia', 'niska'].includes(conf) ? conf : 'niska') as Suggestion['confidence'],
      reason: String(r.reason ?? '').slice(0, 120),
    })
  }
  return { suggestions, usedSearch }
}
