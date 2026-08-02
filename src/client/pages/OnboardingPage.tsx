import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { onboardingApi } from '../lib/api'
import StarterImportModal from '../components/StarterImportModal'
import pl from '../i18n/pl'

const MIN_DISHES = 10

// Tolerant JSON extraction from a pasted LLM reply. Handles: ```json code fences
// (even several), prose before/after, curly quotes, and trailing commas.
function extractJson(raw: string): unknown | null {
  const clean = (s: string) => s
    .replace(/[“”„‟]/g, '"')   // curly / low double quotes → "
    .replace(/[‘’‚‛]/g, "'")   // curly single quotes → '
    .replace(/,\s*([\]}])/g, '$1')                 // trailing commas before ] or }
  const tryParse = (s: string) => { try { return JSON.parse(clean(s)) } catch { return undefined } }

  let v = tryParse(raw.trim())
  if (v !== undefined) return v

  // Try each fenced code block in turn.
  for (const m of raw.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    v = tryParse(m[1].trim())
    if (v !== undefined) return v
  }
  // Fall back to the outermost array, then object, found anywhere in the text.
  const carve = (open: string, close: string) => {
    const a = raw.indexOf(open), b = raw.lastIndexOf(close)
    return a >= 0 && b > a ? raw.slice(a, b + 1) : null
  }
  for (const s of [carve('[', ']'), carve('{', '}')]) {
    if (s) { v = tryParse(s); if (v !== undefined) return v }
  }
  return null
}

// The JSON schema we ask the external LLM to emit, embedded in the prompt.
function buildPrompt(dishes: string[]): string {
  const list = dishes.map((d, i) => `${i + 1}. ${d}`).join('\n')
  return `Jesteś generatorem przepisów. Zwróć przepisy dla poniższych dań wyłącznie jako tablicę JSON w bloku kodu \`\`\`json ... \`\`\`.
Nie pisz żadnego tekstu przed ani po bloku kodu. Odpowiedź musi być poprawnym JSON-em (parsowalnym przez JSON.parse).
Każdy element tablicy ma pola:
{"title": string (po polsku), "category": jedno z ["breakfast","lunch","dinner","snack","soup","salad","smoothie","dessert","other"], "servings": liczba, "prep_minutes": liczba lub null, "ingredients": [{"name": string, "amount": string, "unit": string}], "steps": [string], "tags": [string], "is_seafood": boolean, "macros": {"kcal": liczba, "protein_g": liczba, "carbs_g": liczba, "fat_g": liczba, "fiber_g": liczba, "iron_mg": liczba}}
Makroskładniki podawaj na 1 porcję, realistycznie oszacowane. Składniki z realnymi ilościami (amount + unit, np. "200"/"g", "2"/"szt").
Skopiuj CAŁĄ odpowiedź (razem z blokiem kodu) i wklej ją w aplikacji.

Dania:
${list}`
}

export default function OnboardingPage({ onDone }: { onDone: () => void }) {
  const [kcal, setKcal] = useState(2300)
  const [protein, setProtein] = useState(150)
  const [dishes, setDishes] = useState<string[]>(() => Array(MIN_DISHES).fill(''))
  const [json, setJson] = useState('')
  const [jsonErr, setJsonErr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [imported, setImported] = useState<number | null>(null)

  const filled = dishes.map((d) => d.trim()).filter(Boolean)
  const ready = filled.length >= MIN_DISHES && kcal > 0 && protein > 0
  const prompt = buildPrompt(filled)

  const importMut = useMutation({
    mutationFn: (recipes: unknown[]) => onboardingApi.import({
      recipes,
      kcal_target: Math.round(kcal),
      protein_g_target: Math.round(protein),
    }),
    onSuccess: (r) => setImported(r.imported),
  })

  const { data: starter } = useQuery({ queryKey: ['starter-info'], queryFn: () => onboardingApi.starterInfo() })
  const [showStarter, setShowStarter] = useState(false)
  const canImportStarter = !!starter && starter.available > 0 && !starter.isSource

  const setDish = (i: number, v: string) =>
    setDishes((prev) => prev.map((d, idx) => (idx === i ? v : d)))

  function copyPrompt() {
    navigator.clipboard?.writeText(prompt).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }

  function doImport() {
    setJsonErr(null)
    const parsed = extractJson(json)
    // Accept a bare array or an object wrapping it under a "recipes" key.
    const arr = Array.isArray(parsed)
      ? parsed
      : (parsed && typeof parsed === 'object' && Array.isArray((parsed as { recipes?: unknown[] }).recipes))
        ? (parsed as { recipes: unknown[] }).recipes
        : null
    if (!arr || arr.length === 0) {
      setJsonErr(pl.onboarding.jsonInvalid)
      return
    }
    importMut.mutate(arr)
  }

  const numField = 'w-24 rounded-lg border border-gray-200 bg-white px-3 py-2 text-center text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100'
  const dishField = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100'
  const linkBtn = 'flex-1 whitespace-nowrap rounded-lg bg-primary-600 px-3 py-2.5 text-center text-sm font-semibold text-white hover:bg-primary-700'
  const claudeUrl = `https://claude.ai/new?q=${encodeURIComponent(prompt)}`
  const chatgptUrl = `https://chatgpt.com/?q=${encodeURIComponent(prompt)}`

  // ── Success screen ──────────────────────────────────────────────────────────
  if (imported !== null) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-gray-50 p-6 text-center dark:bg-gray-950">
        <img src="/icons/icon-192.png" alt="" className="h-20 w-20 rounded-2xl" />
        <h1 className="text-2xl font-bold text-primary-600 dark:text-primary-400">{pl.onboarding.doneTitle}</h1>
        <p className="max-w-sm text-sm text-gray-600 dark:text-gray-300">{pl.onboarding.doneBody(imported)}</p>
        <button
          onClick={onDone}
          className="mt-2 rounded-xl bg-primary-600 px-6 py-3 text-sm font-semibold text-white hover:bg-primary-700"
        >
          {pl.onboarding.enter}
        </button>
      </div>
    )
  }

  // ── Onboarding form ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950">
      <div className="mx-auto max-w-lg p-4">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <img src="/icons/icon-192.png" alt="" className="h-16 w-16 rounded-2xl" />
          <h1 className="text-xl font-bold text-primary-600 dark:text-primary-400">{pl.onboarding.title}</h1>
          <p className="max-w-sm text-sm text-gray-600 dark:text-gray-300">{pl.onboarding.intro}</p>
        </div>

        {/* Quick start: import the shared starter recipes in one click */}
        {canImportStarter && (
          <div className="mb-6 rounded-2xl border border-primary-200 bg-primary-50 p-4 text-center dark:border-primary-500/30 dark:bg-primary-500/10">
            <p className="mb-1 text-sm font-semibold text-primary-800 dark:text-primary-200">{pl.onboarding.starterTitle}</p>
            <p className="mb-3 text-xs text-primary-700/80 dark:text-primary-300/80">{pl.onboarding.starterHint(starter!.available)}</p>
            <button
              onClick={() => setShowStarter(true)}
              className="w-full rounded-xl bg-primary-600 py-3 text-sm font-semibold text-white hover:bg-primary-700"
            >
              {pl.onboarding.starterBtn(starter!.available)}
            </button>
            <p className="mt-3 text-[11px] uppercase tracking-wide text-gray-400">{pl.onboarding.orDivider}</p>
          </div>
        )}
        {showStarter && (
          <StarterImportModal onClose={() => setShowStarter(false)} onImported={(n) => { setShowStarter(false); setImported(n) }} />
        )}

        {/* Targets */}
        <section className="mb-6">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">{pl.onboarding.targetsTitle}</h2>
          <div className="space-y-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{pl.onboarding.kcal}</label>
              <input type="number" min={500} max={10000} step={50} value={kcal}
                onChange={(e) => setKcal(Number(e.target.value))} className={numField} />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{pl.onboarding.protein}</label>
              <input type="number" min={20} max={1000} step={5} value={protein}
                onChange={(e) => setProtein(Number(e.target.value))} className={numField} />
            </div>
          </div>
        </section>

        {/* Step 1: dishes */}
        <section className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">{pl.onboarding.dishesTitle}</h2>
            <span className={`text-xs font-semibold ${filled.length >= MIN_DISHES ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`}>
              {pl.onboarding.counter(filled.length)}
            </span>
          </div>
          <div className="space-y-2">
            {dishes.map((d, i) => (
              <input
                key={i}
                value={d}
                onChange={(e) => setDish(i, e.target.value)}
                placeholder={`${i + 1}. ${pl.onboarding.dishPlaceholder}`}
                className={dishField}
              />
            ))}
          </div>
          <button
            onClick={() => setDishes((prev) => [...prev, ''])}
            className="mt-2 text-sm font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400"
          >
            {pl.onboarding.addDish}
          </button>
        </section>

        {/* Step 2: generate via external assistant */}
        <section className={`mb-6 ${ready ? '' : 'pointer-events-none opacity-40'}`}>
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">{pl.onboarding.genStep}</h2>
          <p className="mb-3 text-xs text-gray-400">{ready ? pl.onboarding.genHint : pl.onboarding.needMore}</p>
          <div className="flex flex-wrap gap-2">
            <a href={claudeUrl} target="_blank" rel="noopener noreferrer" className={linkBtn}>{pl.onboarding.openClaude}</a>
            <a href={chatgptUrl} target="_blank" rel="noopener noreferrer" className={linkBtn}>{pl.onboarding.openChatgpt}</a>
            <button
              onClick={copyPrompt}
              className="flex-1 whitespace-nowrap rounded-lg bg-gray-100 px-3 py-2.5 text-center text-sm font-semibold text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200"
            >
              {copied ? pl.onboarding.copied : pl.onboarding.copyPrompt}
            </button>
          </div>
        </section>

        {/* Step 3: paste + import */}
        <section className="mb-6">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">{pl.onboarding.pasteStep}</h2>
          <textarea
            value={json}
            onChange={(e) => setJson(e.target.value)}
            placeholder={pl.onboarding.pastePlaceholder}
            rows={6}
            className="w-full rounded-lg border border-gray-200 bg-white p-3 font-mono text-xs text-gray-900 placeholder:text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />
          {(jsonErr || importMut.isError) && (
            <p className="mt-2 text-sm text-red-500">{jsonErr ?? pl.onboarding.error}</p>
          )}
          <button
            onClick={doImport}
            disabled={!ready || !json.trim() || importMut.isPending}
            className="mt-3 w-full rounded-xl bg-primary-600 py-3 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {importMut.isPending ? pl.onboarding.importing : pl.onboarding.importBtn}
          </button>
        </section>
      </div>
    </div>
  )
}
