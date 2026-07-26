import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { planApi, waterApi, foodLogApi, settingsApi, todayDate } from '../lib/api'
import pl from '../i18n/pl'
import type { MealType, PlanStatus } from '../../shared/types'

const today = todayDate()

const mealOrder: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']
const mealLabels: Record<MealType, string> = {
  breakfast: pl.today.breakfast,
  lunch: pl.plan.meals.lunch,
  dinner: pl.plan.meals.dinner,
  snack: pl.today.snack,
}

function MacroBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.min(100, Math.round((value / (max || 1)) * 100))
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>{label}</span>
        <span>{Math.round(value)} / {max}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function WaterTracker() {
  const qc = useQueryClient()
  const { data: water } = useQuery({
    queryKey: ['water', today],
    queryFn: () => waterApi.get(today),
  })
  const mutate = useMutation({
    mutationFn: (delta: number) => waterApi.update(today, { delta }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['water', today] }),
  })

  const glasses = water?.glasses ?? 0
  const target = water?.target_glasses ?? 8

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
      <h2 className="mb-3 font-semibold text-gray-900 dark:text-gray-100">
        💧 {pl.today.waterTitle}
      </h2>
      <div className="flex items-center gap-4">
        <button
          onClick={() => mutate.mutate(-1)}
          disabled={glasses === 0}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-xl disabled:opacity-30 dark:bg-gray-700"
        >
          −
        </button>
        <div className="flex flex-1 flex-col items-center">
          <div className="flex gap-1.5">
            {Array.from({ length: target }, (_, i) => (
              <div
                key={i}
                className={`h-6 w-4 rounded-sm transition-colors ${
                  i < glasses ? 'bg-blue-400' : 'bg-gray-200 dark:bg-gray-600'
                }`}
              />
            ))}
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {glasses} / {target} {pl.today.waterGlasses}
          </p>
        </div>
        <button
          onClick={() => mutate.mutate(1)}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500 text-xl text-white"
        >
          +
        </button>
      </div>
    </div>
  )
}

function CustomFood() {
  const qc = useQueryClient()
  const [desc, setDesc] = useState('')

  const { data: log } = useQuery({
    queryKey: ['food-log', today],
    queryFn: () => foodLogApi.list(today),
  })

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['food-log', today] })
    qc.invalidateQueries({ queryKey: ['food-log-summary', today] })
  }

  const estimateMutation = useMutation({
    mutationFn: (description: string) => foodLogApi.estimate({ description, date: today }),
    onSuccess: () => { setDesc(''); refresh() },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => foodLogApi.delete(id),
    onSuccess: refresh,
  })

  const entries = log?.items ?? []
  const submit = () => { if (desc.trim()) estimateMutation.mutate(desc.trim()) }

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
      <h2 className="mb-3 font-semibold text-gray-900 dark:text-gray-100">🍽 {pl.today.addOwnFood}</h2>
      <div className="flex gap-2">
        <input
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder={pl.today.ownFoodPlaceholder}
          disabled={estimateMutation.isPending}
          className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-primary-400 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        />
        <button
          onClick={submit}
          disabled={estimateMutation.isPending || !desc.trim()}
          className="whitespace-nowrap rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {estimateMutation.isPending ? pl.today.estimating : pl.today.estimateAdd}
        </button>
      </div>
      {estimateMutation.isError && (
        <p className="mt-2 text-xs text-red-500">{pl.today.estimateFailed}</p>
      )}

      {entries.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{pl.today.loggedToday}</p>
          {entries.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="flex-1 truncate text-gray-700 dark:text-gray-300">{e.description ?? '—'}</span>
              <span className="whitespace-nowrap text-xs text-gray-400">
                {Math.round(e.kcal ?? 0)} kcal · {Math.round(e.protein_g ?? 0)}g B
              </span>
              <button
                onClick={() => deleteMutation.mutate(e.id)}
                className="text-gray-300 hover:text-red-400"
                aria-label="Usuń"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function TodayPage() {
  const qc = useQueryClient()

  const { data: planData, isLoading } = useQuery({
    queryKey: ['plan', today, today],
    queryFn: () => planApi.list(today, today),
  })

  const { data: summary } = useQuery({
    queryKey: ['food-log-summary', today],
    queryFn: () => foodLogApi.summary(today),
  })

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.get(),
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: PlanStatus }) =>
      planApi.setStatus(id, status),
    onSuccess: () => {
      // Refresh the plan AND the daily macro totals — marking a meal eaten now
      // writes it to the food log, so the summary above must refetch.
      qc.invalidateQueries({ queryKey: ['plan', today, today] })
      qc.invalidateQueries({ queryKey: ['food-log-summary', today] })
      qc.invalidateQueries({ queryKey: ['food-log', today] })
    },
  })

  const entries = planData?.items ?? []

  const byMeal: Record<MealType, typeof entries> = {
    breakfast: [], lunch: [], dinner: [], snack: [],
  }
  for (const e of entries) {
    byMeal[e.meal_type]?.push(e)
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
        {pl.today.title} – {new Intl.DateTimeFormat('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}
      </h1>

      {/* Macro summary */}
      {summary && (
        <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
          <h2 className="mb-3 font-semibold text-gray-900 dark:text-gray-100">
            {pl.today.macroSummary}
          </h2>
          <div className="space-y-2">
            <MacroBar label={`${pl.macros.kcal}`} value={summary.kcal} max={settings?.kcal_target ?? 2300} color="bg-orange-400" />
            <MacroBar label={`${pl.macros.protein} (g)`} value={summary.protein_g} max={settings?.protein_g_target ?? 150} color="bg-blue-400" />
            <MacroBar label={`${pl.macros.carbs} (g)`} value={summary.carbs_g} max={250} color="bg-yellow-400" />
            <MacroBar label={`${pl.macros.fat} (g)`} value={summary.fat_g} max={80} color="bg-red-400" />
          </div>
        </div>
      )}

      {/* Add own food (AI macro estimate) */}
      <CustomFood />

      {/* Water */}
      <WaterTracker />

      {/* Meals */}
      {isLoading ? (
        <p className="text-gray-500">{pl.common.loading}</p>
      ) : (
        mealOrder.map((mealType) => (
          <div key={mealType} className="rounded-xl bg-white shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
            <div className="border-b border-gray-100 px-4 py-2 dark:border-gray-700">
              <h2 className="font-semibold text-gray-700 dark:text-gray-300">{mealLabels[mealType]}</h2>
            </div>
            <div className="p-4">
              {byMeal[mealType].length === 0 ? (
                <p className="text-sm text-gray-400">{pl.today.noMeals}</p>
              ) : (
                <div className="space-y-3">
                  {byMeal[mealType].map((entry) => (
                    <div key={entry.id} className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className={`font-medium ${
                          entry.status === 'eaten' ? 'text-gray-400 line-through' :
                          entry.status === 'skipped' ? 'text-gray-300' :
                          'text-gray-900 dark:text-gray-100'
                        }`}>
                          {entry.recipe?.title ?? `${pl.today.recipeFallback}${entry.recipe_id}`}
                        </p>
                        {entry.recipe?.macros && (
                          <p className="text-xs text-gray-400">
                            {Math.round(entry.recipe.macros.kcal * entry.servings)} kcal
                            · {Math.round(entry.recipe.macros.protein_g * entry.servings)}g B
                          </p>
                        )}
                      </div>
                      <div className="flex gap-1">
                        {entry.status !== 'eaten' && (
                          <button
                            onClick={() => statusMutation.mutate({ id: entry.id, status: 'eaten' })}
                            className="rounded-lg bg-green-100 px-2 py-1 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          >
                            {pl.today.markEaten}
                          </button>
                        )}
                        {entry.status === 'eaten' && (
                          <button
                            onClick={() => statusMutation.mutate({ id: entry.id, status: 'planned' })}
                            className="rounded-lg bg-gray-100 px-2 py-1 text-xs text-gray-500 dark:bg-gray-700"
                          >
                            ↩
                          </button>
                        )}
                        {entry.status !== 'skipped' && entry.status !== 'eaten' && (
                          <button
                            onClick={() => statusMutation.mutate({ id: entry.id, status: 'skipped' })}
                            className="rounded-lg bg-gray-100 px-2 py-1 text-xs text-gray-400 dark:bg-gray-700"
                          >
                            {pl.today.markSkipped}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
