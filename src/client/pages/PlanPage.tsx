import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { planApi, recipesApi, todayDate, getWeekStart, weekDates, addDays } from '../lib/api'
import pl from '../i18n/pl'
import type { MealType } from '../../shared/types'
import WeekPrintView from '../components/WeekPrintView'

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']
const mealLabel = (m: MealType) => pl.plan.meals[m]

const SHORT_DAYS = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb']

function formatShortDate(dateStr: string) {
  const d = new Date(dateStr)
  return `${SHORT_DAYS[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}`
}

interface RecipePickerProps {
  onPick: (recipeId: number, servings: number) => void
  onClose: () => void
}

function RecipePicker({ onPick, onClose }: RecipePickerProps) {
  const [search, setSearch] = useState('')
  const [servings, setServings] = useState(1)

  const { data } = useQuery({
    queryKey: ['recipes', search],
    queryFn: () => recipesApi.list({ search: search || undefined }),
    staleTime: 30_000,
  })

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40 md:items-center md:justify-center" onClick={onClose}>
      <div
        className="w-full max-h-[80vh] overflow-y-auto rounded-t-2xl bg-white p-4 md:max-w-lg md:rounded-2xl dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">{pl.plan.selectRecipe}</h3>
          <button onClick={onClose} className="text-gray-400">×</button>
        </div>
        <input
          autoFocus
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={pl.common.search}
          className="mb-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
        />
        <div className="mb-3 flex items-center gap-2">
          <label className="text-sm text-gray-600 dark:text-gray-400">{pl.plan.servingsForPlan}:</label>
          <input
            type="number" min="0.5" max="10" step="0.5"
            value={servings}
            onChange={(e) => setServings(Number(e.target.value))}
            className="w-20 rounded-lg border border-gray-200 px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          />
        </div>
        <ul className="space-y-1">
          {(data?.items ?? []).map(r => (
            <li key={r.id}>
              <button
                onClick={() => onPick(r.id, servings)}
                className="w-full rounded-lg px-3 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <p className="font-medium text-gray-900 dark:text-gray-100">{r.title}</p>
                {r.macros && (
                  <p className="text-xs text-gray-400">{r.macros.kcal} kcal · {r.macros.protein_g}g białka</p>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export default function PlanPage() {
  const qc = useQueryClient()
  const [weekStart, setWeekStart] = useState(() => getWeekStart(todayDate()))
  const dates = weekDates(weekStart)
  const weekEnd = dates[6]
  const today = todayDate()

  const [picking, setPicking] = useState<{ date: string; mealType: MealType } | null>(null)
  const [showPrint, setShowPrint] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['plan', weekStart, weekEnd],
    queryFn: () => planApi.list(weekStart, weekEnd),
  })

  const setMealMutation = useMutation({
    mutationFn: ({ date, mealType, recipeId, servings }: { date: string; mealType: MealType; recipeId: number; servings: number }) =>
      planApi.set(date, mealType, { recipe_id: recipeId, servings }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plan'] }),
  })

  const clearMealMutation = useMutation({
    mutationFn: ({ date, mealType }: { date: string; mealType: MealType }) =>
      planApi.delete(date, mealType),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plan'] }),
  })

  const entries = data?.items ?? []

  function getEntry(date: string, mealType: MealType) {
    return entries.find(e => e.date === date && e.meal_type === mealType)
  }

  return (
    <div className="mx-auto max-w-4xl p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{pl.plan.title}</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setWeekStart(getWeekStart(today))}
            className="rounded-lg bg-primary-100 px-3 py-1.5 text-sm font-medium text-primary-700 dark:bg-primary-900/30 dark:text-primary-400"
          >
            {pl.plan.today}
          </button>
          <button
            onClick={() => setShowPrint(true)}
            title={pl.plan.printWeek}
            className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
          >
            🖨
          </button>
        </div>
      </div>

      {/* Week nav */}
      <div className="mb-4 flex items-center gap-2">
        <button
          onClick={() => setWeekStart(addDays(weekStart, -7))}
          className="rounded-lg bg-gray-100 px-3 py-2 text-sm dark:bg-gray-700"
        >
          ‹
        </button>
        <div className="flex-1 text-center text-sm text-gray-600 dark:text-gray-400">
          {formatShortDate(weekStart)} – {formatShortDate(weekEnd)}
        </div>
        <button
          onClick={() => setWeekStart(addDays(weekStart, 7))}
          className="rounded-lg bg-gray-100 px-3 py-2 text-sm dark:bg-gray-700"
        >
          ›
        </button>
      </div>

      {isLoading ? (
        <p className="text-gray-500">{pl.common.loading}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr>
                <th className="w-24 py-2 text-left text-xs font-medium text-gray-500"></th>
                {dates.map(date => (
                  <th
                    key={date}
                    className={`px-2 py-2 text-center text-xs font-medium ${
                      date === today
                        ? 'text-primary-600 dark:text-primary-400'
                        : 'text-gray-500'
                    }`}
                  >
                    {formatShortDate(date)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MEAL_TYPES.map(mealType => (
                <tr key={mealType} className="border-t border-gray-100 dark:border-gray-700">
                  <td className="py-2 pr-2 text-xs font-medium text-gray-500">
                    {mealLabel(mealType)}
                  </td>
                  {dates.map(date => {
                    const entry = getEntry(date, mealType)
                    return (
                      <td key={date} className="px-1 py-1">
                        {entry ? (
                          <div
                            className={`relative min-h-[4rem] rounded-lg p-2 text-xs ${
                              entry.status === 'eaten'
                                ? 'bg-green-50 ring-1 ring-green-200 dark:bg-green-900/20 dark:ring-green-800/30'
                                : entry.status === 'skipped'
                                ? 'bg-gray-50 ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700'
                                : 'bg-white ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700'
                            }`}
                          >
                            <p className="font-medium text-gray-800 line-clamp-2 dark:text-gray-200">
                              {entry.recipe?.title ?? `#${entry.recipe_id}`}
                            </p>
                            <button
                              onClick={() => clearMealMutation.mutate({ date, mealType })}
                              className="absolute right-1 top-1 text-gray-300 hover:text-red-400"
                            >
                              ×
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setPicking({ date, mealType })}
                            className="flex min-h-[4rem] w-full items-center justify-center rounded-lg border border-dashed border-gray-200 text-gray-300 hover:border-primary-300 hover:text-primary-400 dark:border-gray-700"
                          >
                            +
                          </button>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {picking && (
        <RecipePicker
          onClose={() => setPicking(null)}
          onPick={(recipeId, servings) => {
            setMealMutation.mutate({ date: picking.date, mealType: picking.mealType, recipeId, servings })
            setPicking(null)
          }}
        />
      )}

      {showPrint && (
        <WeekPrintView
          weekStart={weekStart}
          weekEnd={weekEnd}
          onClose={() => setShowPrint(false)}
        />
      )}
    </div>
  )
}
