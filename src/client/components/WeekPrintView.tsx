import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { planApi, formatDate, weekDates } from '../lib/api'
import pl from '../i18n/pl'
import type { MealPlanEntryFull, MealType, Recipe } from '../../shared/types'

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']
const MEAL_ICONS: Record<MealType, string> = {
  breakfast: '🌅',
  lunch: '🍽',
  dinner: '🌙',
  snack: '🍎',
}

const DAY_NAMES = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota']
const SHORT_DAYS = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb']

function formatShortDate(dateStr: string) {
  const d = new Date(dateStr)
  return `${SHORT_DAYS[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}`
}

function formatLongDate(dateStr: string) {
  const d = new Date(dateStr)
  return `${DAY_NAMES[d.getDay()]}, ${d.getDate()} ${new Intl.DateTimeFormat('pl-PL', { month: 'long' }).format(d)}`
}

function MacroRow({ recipe, servings }: { recipe: Recipe; servings: number }) {
  if (!recipe.macros) return null
  const m = recipe.macros
  const factor = servings / recipe.servings
  return (
    <div className="mt-1 text-xs text-gray-500 flex flex-wrap gap-x-3">
      <span>{Math.round(m.kcal * factor)} {pl.print.kcal}</span>
      <span>{pl.print.protein}: {Math.round(m.protein_g * factor)}g</span>
      <span>{pl.print.carbs}: {Math.round(m.carbs_g * factor)}g</span>
      <span>{pl.print.fat}: {Math.round(m.fat_g * factor)}g</span>
    </div>
  )
}

interface WeekPrintViewProps {
  weekStart: string
  weekEnd: string
  onClose: () => void
}

export default function WeekPrintView({ weekStart, weekEnd, onClose }: WeekPrintViewProps) {
  const printRoot = useRef<HTMLDivElement>(null)

  useEffect(() => {
    document.body.style.overflow = 'hidden'

    const style = document.createElement('style')
    style.id = 'week-print-style'
    style.textContent = `
      @page { margin: 10mm; }
      @media print {
        html, body { background: white !important; }
        body > *:not(#week-print-root) { display: none !important; }
        #week-print-root {
          position: static !important;
          overflow: visible !important;
          background: white !important;
          font-size: 10.5px !important;
        }
        #week-print-root * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .print-controls { display: none !important; }
        .print-avoid-break { page-break-inside: avoid; }
        table { border-collapse: collapse; }
        th, td { border: 1px solid #ccc; padding: 3px 6px; font-size: 10px; }
      }
    `
    document.head.appendChild(style)

    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKey)

    return () => {
      document.body.style.overflow = ''
      document.getElementById('week-print-style')?.remove()
      window.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  const { data, isLoading } = useQuery({
    queryKey: ['plan-print', weekStart, weekEnd],
    queryFn: () => planApi.listFull(weekStart, weekEnd),
    staleTime: 60_000,
  })

  const dates = weekDates(weekStart)
  const entries = data?.items ?? []

  function getEntry(date: string, mealType: MealType): MealPlanEntryFull | undefined {
    return entries.find(e => e.date === date && e.meal_type === mealType)
  }

  return createPortal(
    <div
      id="week-print-root"
      ref={printRoot}
      className="fixed inset-0 z-50 overflow-y-auto bg-white dark:bg-gray-900"
    >
      {/* Screen controls */}
      <div className="print-controls sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3 shadow-sm dark:border-gray-700 dark:bg-gray-900">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">
          {pl.print.previewTitle} — {formatShortDate(weekStart)} – {formatShortDate(weekEnd)}
        </h2>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            {pl.print.close}
          </button>
          <button
            onClick={() => window.print()}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            🖨 {pl.print.print}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center p-16 text-gray-500">{pl.common.loading}</div>
      ) : (
        <div className="mx-auto max-w-4xl px-8 py-10 print:max-w-full print:px-0 print:py-0">
          {/* Title */}
          <div className="mb-8 text-center print:mb-3">
            <h1 className="text-2xl font-bold text-gray-900 print:text-lg">{pl.print.weekHeading}</h1>
            <p className="mt-1 text-gray-500 print:text-xs">
              {formatDate(weekStart)} – {formatDate(weekEnd)}
            </p>
          </div>

          {/* Summary grid */}
          <section className="mb-10 print-avoid-break print:mb-4">
            <h2 className="mb-3 text-base font-semibold uppercase tracking-wide text-gray-500">{pl.print.summaryTitle}</h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border border-gray-200 px-3 py-2 text-left font-medium text-gray-500 w-24"></th>
                    {dates.map(date => (
                      <th key={date} className="border border-gray-200 px-2 py-2 text-center text-xs font-medium text-gray-700">
                        {formatShortDate(date)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MEAL_TYPES.map(mealType => (
                    <tr key={mealType}>
                      <td className="border border-gray-200 px-3 py-2 text-xs font-medium text-gray-500 bg-gray-50">
                        {pl.plan.meals[mealType]}
                      </td>
                      {dates.map(date => {
                        const entry = getEntry(date, mealType)
                        return (
                          <td key={date} className="border border-gray-200 px-2 py-2 text-xs text-gray-800 align-top">
                            {entry?.recipe?.title ?? (entry ? `#${entry.recipe_id}` : pl.print.noMeal)}
                            {entry && entry.servings !== 1 && (
                              <span className="text-gray-400 ml-1">×{entry.servings}</span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Per-day recipe details */}
          <section>
            <h2 className="mb-4 text-base font-semibold uppercase tracking-wide text-gray-500 print:mb-2">{pl.print.detailsTitle}</h2>

            {dates.map((date) => {
              const dayEntries = MEAL_TYPES
                .map(mt => getEntry(date, mt))
                .filter((e): e is MealPlanEntryFull => !!e && !!e.recipe)

              if (dayEntries.length === 0) return null

              return (
                <div key={date} className="mb-8 print:mb-3">
                  <h3 className="mb-4 border-b-2 border-gray-900 pb-1 text-lg font-bold uppercase text-gray-900 print:mb-2 print:text-sm">
                    {formatLongDate(date)}
                  </h3>

                  <div className="space-y-6 print:space-y-2">
                    {dayEntries.map(entry => {
                      const recipe = entry.recipe!
                      return (
                        <div key={entry.id} className="print-avoid-break rounded-lg border border-gray-200 p-4 print:p-2.5">
                          <div className="mb-3 flex items-start justify-between print:mb-1">
                            <div>
                              <p className="mb-0.5 text-xs font-medium uppercase tracking-wide text-gray-400">
                                {MEAL_ICONS[entry.meal_type]} {pl.plan.meals[entry.meal_type]}
                              </p>
                              <h4 className="text-base font-bold text-gray-900">{recipe.title}</h4>
                            </div>
                            <div className="text-right text-xs text-gray-400 shrink-0 ml-4">
                              {entry.servings !== recipe.servings && (
                                <p>{pl.print.servings}: {entry.servings}</p>
                              )}
                              {recipe.prep_minutes && (
                                <p>{pl.print.prepTime}: {recipe.prep_minutes} {pl.print.min}</p>
                              )}
                            </div>
                          </div>

                          {recipe.macros && (
                            <div className="mb-3 flex flex-wrap gap-4 rounded bg-gray-50 px-3 py-2 text-xs text-gray-600 print:mb-1.5 print:py-1">
                              <span className="font-semibold">{Math.round(recipe.macros.kcal * entry.servings / recipe.servings)} {pl.print.kcal}</span>
                              <span>{pl.print.protein}: <strong>{Math.round(recipe.macros.protein_g * entry.servings / recipe.servings)}g</strong></span>
                              <span>{pl.print.carbs}: <strong>{Math.round(recipe.macros.carbs_g * entry.servings / recipe.servings)}g</strong></span>
                              <span>{pl.print.fat}: <strong>{Math.round(recipe.macros.fat_g * entry.servings / recipe.servings)}g</strong></span>
                            </div>
                          )}

                          <div className="grid grid-cols-2 gap-6 print:gap-4">
                            {recipe.ingredients.length > 0 && (
                              <div>
                                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">{pl.print.ingredients}</p>
                                <ul className="space-y-0.5 text-sm text-gray-700">
                                  {recipe.ingredients.map((ing, i) => (
                                    <li key={i} className="flex gap-2">
                                      <span className="text-gray-400">•</span>
                                      <span>
                                        {ing.amount && <strong>{ing.amount}{ing.unit ? ` ${ing.unit}` : ''}</strong>}
                                        {ing.amount ? ' ' : ''}{ing.name}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {recipe.steps.length > 0 && (
                              <div>
                                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">{pl.print.steps}</p>
                                <ol className="space-y-1 text-sm text-gray-700">
                                  {recipe.steps.map((step, i) => (
                                    <li key={i} className="flex gap-2">
                                      <span className="shrink-0 font-semibold text-gray-400">{i + 1}.</span>
                                      <span>{step}</span>
                                    </li>
                                  ))}
                                </ol>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </section>
        </div>
      )}
    </div>,
    document.body,
  )
}
