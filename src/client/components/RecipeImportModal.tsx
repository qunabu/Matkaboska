import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { recipesApi } from '../lib/api'
import pl from '../i18n/pl'
import type { Recipe } from '../../shared/types'

const CATEGORIES = ['breakfast', 'lunch', 'dinner', 'snack', 'soup', 'salad', 'smoothie', 'dessert', 'other'] as const

function buildPrompt(dishes: string): string {
  return `Wygeneruj przepisy kulinarne w formacie JSON dla następujących dań: ${dishes}

Zwróć TYLKO tablicę JSON (bez komentarzy, bez markdown, bez \`\`\`json) w dokładnie takim formacie:
[
  {
    "title": "Nazwa dania po polsku",
    "category": "breakfast|lunch|dinner|snack|soup|salad|smoothie|dessert|other",
    "servings": 4,
    "prep_minutes": 30,
    "ingredients": [
      {"name": "nazwa składnika", "amount": "100", "unit": "g"},
      {"name": "cebula", "amount": "1", "unit": "szt"}
    ],
    "steps": [
      "Krok 1: ...",
      "Krok 2: ..."
    ],
    "tags": ["wegetariańskie", "zdrowe"],
    "is_seafood": false
  }
]

Zasady:
- category musi być jedną z: breakfast, lunch, dinner, snack, soup, salad, smoothie, dessert, other
- amount to zawsze string (liczba jako tekst)
- steps to lista kroków z instrukcjami po polsku
- tags to lista po polsku (np. "wegetariańskie", "bezglutenowe", "szybkie")
- is_seafood to true tylko gdy danie zawiera owoce morza lub ryby
- Zwróć WYŁĄCZNIE poprawny JSON, bez żadnych wyjaśnień ani tekstu poza JSON`
}

interface ParsedRecipe {
  title: string
  category: string
  servings: number
  prep_minutes: number | null
  ingredients: { name: string; amount: string; unit: string }[]
  steps: string[]
  tags: string[]
  is_seafood: boolean
}

function validateRecipes(raw: unknown): { ok: true; data: ParsedRecipe[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: 'JSON musi być tablicą.' }
  if (raw.length === 0) return { ok: false, error: pl.import.noRecipes }

  for (let i = 0; i < raw.length; i++) {
    const r = raw[i] as Record<string, unknown>
    if (!r || typeof r !== 'object') return { ok: false, error: `Element ${i + 1} nie jest obiektem.` }
    if (!r.title || typeof r.title !== 'string') return { ok: false, error: `Element ${i + 1}: brak pola "title".` }
    if (!r.category || !CATEGORIES.includes(r.category as typeof CATEGORIES[number])) {
      return { ok: false, error: `Element ${i + 1}: nieprawidłowe "category". Dopuszczalne: ${CATEGORIES.join(', ')}.` }
    }
    if (!Array.isArray(r.ingredients)) return { ok: false, error: `Element ${i + 1}: "ingredients" musi być tablicą.` }
    if (!Array.isArray(r.steps)) return { ok: false, error: `Element ${i + 1}: "steps" musi być tablicą.` }
  }

  return { ok: true, data: raw as ParsedRecipe[] }
}

interface Props {
  onClose: () => void
}

export default function RecipeImportModal({ onClose }: Props) {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'prompt' | 'json'>('prompt')
  const [dishes, setDishes] = useState('')
  const [prompt, setPrompt] = useState('')
  const [copied, setCopied] = useState(false)
  const [jsonText, setJsonText] = useState('')
  const [parsed, setParsed] = useState<ParsedRecipe[] | null>(null)
  const [parseError, setParseError] = useState('')
  const [importResult, setImportResult] = useState<string | null>(null)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  function handleGeneratePrompt() {
    const trimmed = dishes.trim()
    if (!trimmed) return
    setPrompt(buildPrompt(trimmed))
    setCopied(false)
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(prompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleOpenClaude() {
    const url = `https://claude.ai/new?q=${encodeURIComponent(prompt)}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  function handleValidateJson() {
    setParseError('')
    setParsed(null)
    setImportResult(null)
    try {
      const raw = JSON.parse(jsonText)
      const result = validateRecipes(raw)
      if (!result.ok) {
        setParseError(result.error)
      } else {
        setParsed(result.data)
      }
    } catch {
      setParseError('Nieprawidłowy JSON — sprawdź składnię.')
    }
  }

  const importMutation = useMutation({
    mutationFn: (items: ParsedRecipe[]) => recipesApi.bulkImport(items as Partial<Recipe>[]),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['recipes'] })
      setImportResult(`${pl.import.importSuccess}${data.imported}`)
      setParsed(null)
      setJsonText('')
    },
    onError: (err: Error) => {
      setParseError(`${pl.import.importError}: ${err.message}`)
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50 md:items-center md:justify-center" onClick={onClose}>
      <div
        className="w-full max-h-[90vh] overflow-y-auto rounded-t-2xl bg-white md:max-w-2xl md:rounded-2xl dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between border-b border-gray-100 bg-white px-5 py-4 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">{pl.import.modalTitle}</h2>
          <button onClick={onClose} className="text-xl text-gray-400 hover:text-gray-600">×</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 dark:border-gray-800">
          {(['prompt', 'json'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                tab === t
                  ? 'border-b-2 border-primary-600 text-primary-600'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
              }`}
            >
              {t === 'prompt' ? `1. ${pl.import.tabPrompt}` : `2. ${pl.import.tabJson}`}
            </button>
          ))}
        </div>

        <div className="p-5 space-y-4">
          {/* ── Tab: Generuj prompt ── */}
          {tab === 'prompt' && (
            <>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {pl.import.dishesLabel}
                </label>
                <textarea
                  rows={3}
                  value={dishes}
                  onChange={(e) => setDishes(e.target.value)}
                  placeholder={pl.import.dishesPlaceholder}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                />
                <p className="mt-1 text-xs text-gray-400">{pl.import.dishesHint}</p>
              </div>

              <button
                onClick={handleGeneratePrompt}
                disabled={!dishes.trim()}
                className="w-full rounded-xl bg-primary-600 py-3 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-40"
              >
                {pl.import.generatePrompt}
              </button>

              {prompt && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {pl.import.promptLabel}
                  </label>
                  <textarea
                    readOnly
                    rows={10}
                    value={prompt}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={handleCopy}
                      className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300"
                    >
                      {copied ? `✓ ${pl.import.copied}` : pl.import.copyPrompt}
                    </button>
                    <button
                      onClick={handleOpenClaude}
                      className="flex-1 rounded-lg bg-[#D97706] py-2.5 text-sm font-semibold text-white hover:bg-[#B45309]"
                    >
                      {pl.import.openInClaude} ↗
                    </button>
                  </div>
                  <p className="mt-2 text-center text-xs text-gray-400">
                    Po wygenerowaniu JSON przez Claude — przejdź do zakładki „{pl.import.tabJson}"
                  </p>
                </div>
              )}
            </>
          )}

          {/* ── Tab: Wklej JSON ── */}
          {tab === 'json' && (
            <>
              {importResult && (
                <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
                  ✓ {importResult}
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {pl.import.jsonLabel}
                </label>
                <textarea
                  rows={12}
                  value={jsonText}
                  onChange={(e) => { setJsonText(e.target.value); setParsed(null); setParseError(''); setImportResult(null) }}
                  placeholder={pl.import.jsonPlaceholder}
                  spellCheck={false}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-xs text-gray-700 outline-none focus:border-primary-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                />
              </div>

              {parseError && (
                <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
                  ✗ {parseError}
                </div>
              )}

              {!parsed && (
                <button
                  onClick={handleValidateJson}
                  disabled={!jsonText.trim()}
                  className="w-full rounded-xl border border-primary-600 py-3 text-sm font-semibold text-primary-600 hover:bg-primary-50 disabled:opacity-40 dark:hover:bg-primary-900/20"
                >
                  {pl.import.validate}
                </button>
              )}

              {parsed && (
                <>
                  <div className="rounded-lg bg-green-50 px-4 py-2 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
                    ✓ {pl.import.jsonValid} — {pl.import.preview}: {parsed.length}
                  </div>
                  <ul className="space-y-1.5">
                    {parsed.map((r, i) => (
                      <li key={i} className="flex items-center gap-3 rounded-lg border border-gray-100 px-3 py-2 text-sm dark:border-gray-700">
                        <div className="flex-1">
                          <p className="font-medium text-gray-900 dark:text-gray-100">{r.title}</p>
                          <p className="text-xs text-gray-400">
                            {r.category} · {r.ingredients.length} składników · {r.steps.length} kroków
                            {r.prep_minutes ? ` · ${r.prep_minutes} min` : ''}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => importMutation.mutate(parsed)}
                    disabled={importMutation.isPending}
                    className="w-full rounded-xl bg-primary-600 py-3 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
                  >
                    {importMutation.isPending ? pl.import.importing : `${pl.import.importBtn} (${parsed.length})`}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
