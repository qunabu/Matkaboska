import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { onboardingApi } from '../lib/api'
import pl from '../i18n/pl'

const MIN_DISHES = 10

export default function OnboardingPage({ onDone }: { onDone: () => void }) {
  const [kcal, setKcal] = useState(2300)
  const [protein, setProtein] = useState(150)
  const [dishes, setDishes] = useState<string[]>(() => Array(MIN_DISHES).fill(''))
  const [imported, setImported] = useState<number | null>(null)

  const filled = dishes.map((d) => d.trim()).filter(Boolean)
  const canSubmit = filled.length >= MIN_DISHES && kcal > 0 && protein > 0

  const generate = useMutation({
    mutationFn: () => onboardingApi.generate({
      dishes: filled,
      kcal_target: Math.round(kcal),
      protein_g_target: Math.round(protein),
    }),
    onSuccess: (r) => setImported(r.imported),
  })

  const errMsg = generate.isError
    ? ((generate.error as Error).message.includes('needs_key') ? pl.onboarding.errorKey : pl.onboarding.error)
    : null

  const setDish = (i: number, v: string) =>
    setDishes((prev) => prev.map((d, idx) => (idx === i ? v : d)))

  const numField = 'w-24 rounded-lg border border-gray-200 bg-white px-3 py-2 text-center text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100'
  const dishField = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100'

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
      <div className="mx-auto max-w-lg p-4 pb-28">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <img src="/icons/icon-192.png" alt="" className="h-16 w-16 rounded-2xl" />
          <h1 className="text-xl font-bold text-primary-600 dark:text-primary-400">{pl.onboarding.title}</h1>
          <p className="max-w-sm text-sm text-gray-600 dark:text-gray-300">{pl.onboarding.intro}</p>
        </div>

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

        {/* Dishes */}
        <section>
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

        {errMsg && <p className="mt-4 text-center text-sm text-red-500">{errMsg}</p>}
      </div>

      {/* Sticky submit */}
      <div className="fixed inset-x-0 bottom-0 border-t border-gray-200 bg-white/95 p-4 backdrop-blur dark:border-gray-800 dark:bg-gray-900/95">
        <div className="mx-auto max-w-lg">
          <button
            onClick={() => generate.mutate()}
            disabled={!canSubmit || generate.isPending}
            className="w-full rounded-xl bg-primary-600 py-3 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {generate.isPending ? pl.onboarding.generating : canSubmit ? pl.onboarding.generate : pl.onboarding.needMore}
          </button>
        </div>
      </div>
    </div>
  )
}
