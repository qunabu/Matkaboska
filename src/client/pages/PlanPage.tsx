import { useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { planApi, recipesApi, productsApi, settingsApi, todayDate, getWeekStart, weekDates, addDays } from '../lib/api'
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

interface MealPickerProps {
  onPick: (recipeId: number, servings: number) => void
  onPickProduct: (productId: number, grams: number) => void
  onClose: () => void
}

function MealPicker({ onPick, onPickProduct, onClose }: MealPickerProps) {
  const [tab, setTab] = useState<'recipe' | 'product'>('recipe')
  const [search, setSearch] = useState('')
  const [servings, setServings] = useState(1)
  const [grams, setGrams] = useState('')

  const { data: recipeData } = useQuery({
    queryKey: ['recipes', search],
    queryFn: () => recipesApi.list({ search: search || undefined }),
    staleTime: 30_000,
    enabled: tab === 'recipe',
  })
  const { data: productData } = useQuery({
    queryKey: ['products', search],
    queryFn: () => productsApi.list(search || undefined),
    staleTime: 30_000,
    enabled: tab === 'product',
  })

  const tabBtn = (t: 'recipe' | 'product', label: string) => (
    <button
      onClick={() => { setTab(t); setSearch('') }}
      className={`flex-1 rounded-lg py-2 text-sm font-medium ${tab === t ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'}`}
    >
      {label}
    </button>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40 md:items-center md:justify-center" onClick={onClose}>
      <div
        className="w-full max-h-[80vh] overflow-y-auto rounded-t-2xl bg-white p-4 md:max-w-lg md:rounded-2xl dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">{pl.plan.selectRecipeOrProduct}</h3>
          <button onClick={onClose} className="text-gray-400">×</button>
        </div>
        <div className="mb-3 flex gap-2">
          {tabBtn('recipe', pl.plan.tabRecipe)}
          {tabBtn('product', pl.plan.tabProduct)}
        </div>
        <input
          autoFocus
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={pl.common.search}
          className="mb-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
        />

        {tab === 'recipe' ? (
          <>
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
              {(recipeData?.items ?? []).map(r => (
                <li key={r.id}>
                  <button onClick={() => onPick(r.id, servings)} className="w-full rounded-lg px-3 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800">
                    <p className="font-medium text-gray-900 dark:text-gray-100">{r.title}</p>
                    {r.macros && <p className="text-xs text-gray-400">{r.macros.kcal} kcal · {r.macros.protein_g}g białka</p>}
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <div className="mb-3 flex items-center gap-2">
              <label className="text-sm text-gray-600 dark:text-gray-400">{pl.plan.gramsForPlan}:</label>
              <input
                type="number" min="1" step="10"
                value={grams}
                onChange={(e) => setGrams(e.target.value)}
                placeholder={pl.plan.gramsDefault}
                className="w-24 rounded-lg border border-gray-200 px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              />
            </div>
            <ul className="space-y-1">
              {(productData?.items ?? []).map(p => (
                <li key={p.id}>
                  <button
                    onClick={() => onPickProduct(p.id, Number(grams) || p.serving_g || 100)}
                    className="w-full rounded-lg px-3 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    <p className="font-medium text-gray-900 dark:text-gray-100">{p.name}</p>
                    <p className="text-xs text-gray-400">
                      {p.kcal != null ? `${Math.round(p.kcal)} kcal/100g` : ''}
                      {p.serving_g ? ` · porcja ${p.serving_g} g` : ''}
                    </p>
                  </button>
                </li>
              ))}
              {(productData?.items ?? []).length === 0 && (
                <li className="px-3 py-4 text-center text-sm text-gray-400">{pl.settings.productsEmpty}</li>
              )}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}

export default function PlanPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { weekStart: weekParam } = useParams()
  const today = todayDate()
  // The week is driven by the URL (/plan/:weekStart); /plan shows the current week.
  const weekStart = getWeekStart(weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam) ? weekParam : today)
  const goToWeek = (start: string) => navigate(`/plan/${start}`)
  const dates = weekDates(weekStart)
  const weekEnd = dates[6]

  const [picking, setPicking] = useState<{ date: string; mealType: MealType } | null>(null)
  const [showPrint, setShowPrint] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['plan', weekStart, weekEnd],
    queryFn: () => planApi.list(weekStart, weekEnd),
  })
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => settingsApi.get() })
  const ironTarget = settings?.iron_mg_target ?? 27

  const appendMealMutation = useMutation({
    mutationFn: ({ date, mealType, recipeId, servings }: { date: string; mealType: MealType; recipeId: number; servings: number }) =>
      planApi.append(date, mealType, recipeId, servings),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plan'] }),
  })

  const appendProductMutation = useMutation({
    mutationFn: ({ date, mealType, productId, grams }: { date: string; mealType: MealType; productId: number; grams: number }) =>
      planApi.appendProduct(date, mealType, productId, grams),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plan'] }),
  })

  const deleteEntryMutation = useMutation({
    mutationFn: (id: number) => planApi.deleteEntry(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plan'] }),
  })

  const [batchInfo, setBatchInfo] = useState<string | null>(null)
  const generateWeekMutation = useMutation({
    mutationFn: () => planApi.generateWeek(weekStart),
    onSuccess: (d) => {
      setBatchInfo(pl.plan.generatedSummary(d.cookingSessions, d.inserted))
      qc.invalidateQueries({ queryKey: ['plan'] })
    },
    onError: (e: Error) => window.alert(e.message.includes('no_recipes') ? pl.plan.generateNoRecipes : pl.plan.generateError),
  })

  const entries = data?.items ?? []

  function generateWeek() {
    if (entries.length > 0 && !window.confirm(pl.plan.generateConfirm)) return
    generateWeekMutation.mutate()
  }

  function getEntries(date: string, mealType: MealType) {
    return entries.filter(e => e.date === date && e.meal_type === mealType)
  }

  // Sum planned kcal + macros for a day: recipe macros × servings, plus product
  // macros (per 100 g) × grams/100.
  function dayTotals(date: string) {
    let kcal = 0, protein_g = 0, carbs_g = 0, fat_g = 0, iron_mg = 0
    for (const e of entries) {
      if (e.date !== date) continue
      if (e.recipe?.macros) {
        const m = e.recipe.macros
        const mult = e.servings ?? 1
        kcal += (m.kcal ?? 0) * mult
        protein_g += (m.protein_g ?? 0) * mult
        carbs_g += (m.carbs_g ?? 0) * mult
        fat_g += (m.fat_g ?? 0) * mult
        iron_mg += (m.iron_mg ?? 0) * mult
      } else if (e.product) {
        const f = (e.grams ?? e.product.serving_g ?? 100) / 100
        kcal += (e.product.kcal ?? 0) * f
        protein_g += (e.product.protein_g ?? 0) * f
        carbs_g += (e.product.carbs_g ?? 0) * f
        fat_g += (e.product.fat_g ?? 0) * f
      }
    }
    return { kcal, protein_g, carbs_g, fat_g, iron_mg }
  }

  return (
    <div className="mx-auto max-w-4xl p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{pl.plan.title}</h1>
          {batchInfo && <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">♻︎ {batchInfo}</p>}
        </div>
        <div className="flex gap-2">
          <button
            onClick={generateWeek}
            disabled={generateWeekMutation.isPending}
            title={pl.plan.generateWeek}
            className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {generateWeekMutation.isPending ? '✨…' : `✨ ${pl.plan.generateWeek}`}
          </button>
          <button
            onClick={() => goToWeek(getWeekStart(today))}
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
          onClick={() => goToWeek(addDays(weekStart, -7))}
          className="rounded-lg bg-gray-100 px-3 py-2 text-sm dark:bg-gray-700"
        >
          ‹
        </button>
        <div className="flex-1 text-center text-sm text-gray-600 dark:text-gray-400">
          {formatShortDate(weekStart)} – {formatShortDate(weekEnd)}
        </div>
        <button
          onClick={() => goToWeek(addDays(weekStart, 7))}
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
                    const cellEntries = getEntries(date, mealType)
                    return (
                      <td key={date} className="px-1 py-1 align-top">
                        <div className="space-y-1">
                          {cellEntries.map(entry => (
                            <div
                              key={entry.id}
                              className={`relative rounded-lg p-2 pr-5 text-xs ${
                                entry.status === 'eaten'
                                  ? 'bg-green-50 ring-1 ring-green-200 dark:bg-green-900/20 dark:ring-green-800/30'
                                  : entry.status === 'skipped'
                                  ? 'bg-gray-50 ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700'
                                  : 'bg-white ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700'
                              }`}
                            >
                              {entry.recipe_id ? (
                                <Link
                                  to={`/recipes/${entry.recipe_id}`}
                                  className="font-medium text-primary-700 line-clamp-2 hover:underline dark:text-primary-300"
                                >
                                  {entry.is_leftover && (
                                    <span title={pl.plan.leftoverHint} className="mr-1">♻︎</span>
                                  )}
                                  {entry.recipe?.title ?? `#${entry.recipe_id}`}
                                </Link>
                              ) : entry.product ? (
                                <span className="font-medium text-gray-800 line-clamp-2 dark:text-gray-200">
                                  🛒 {entry.product.name}
                                </span>
                              ) : (
                                <span className="font-medium text-gray-800 line-clamp-2 dark:text-gray-200">—</span>
                              )}
                              {entry.recipe?.macros && (
                                <p className="mt-0.5 text-[10px] text-gray-400">
                                  {Math.round(entry.recipe.macros.kcal * (entry.servings ?? 1))} kcal
                                  {entry.batch_group ? ` · ${entry.is_leftover ? pl.plan.leftover : pl.plan.cookToday}` : ''}
                                </p>
                              )}
                              {entry.product && (
                                <p className="mt-0.5 text-[10px] text-gray-400">
                                  {entry.grams ?? entry.product.serving_g ?? 100} g
                                  {entry.product.kcal != null ? ` · ${Math.round(entry.product.kcal * ((entry.grams ?? entry.product.serving_g ?? 100) / 100))} kcal` : ''}
                                </p>
                              )}
                              <button
                                onClick={() => deleteEntryMutation.mutate(entry.id)}
                                className="absolute right-1 top-1 text-gray-300 hover:text-red-400"
                                aria-label={pl.common.delete}
                              >
                                ×
                              </button>
                            </div>
                          ))}
                          <button
                            onClick={() => setPicking({ date, mealType })}
                            className="flex w-full items-center justify-center rounded-lg border border-dashed border-gray-200 py-1.5 text-gray-300 hover:border-primary-300 hover:text-primary-400 dark:border-gray-700"
                            aria-label={pl.plan.addMeal}
                          >
                            +
                          </button>
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 dark:border-gray-600">
                <td className="py-2 pr-2 align-top text-xs font-semibold text-gray-500">
                  {pl.plan.plannedTotal}
                </td>
                {dates.map(date => {
                  const t = dayTotals(date)
                  return (
                    <td key={date} className="px-1 py-2 text-center align-top">
                      <div className="text-xs font-semibold text-primary-600 dark:text-primary-400">
                        {Math.round(t.kcal)} kcal
                      </div>
                      <div className="text-[10px] leading-tight text-gray-400">
                        {Math.round(t.protein_g)}g B · {Math.round(t.carbs_g)}g W · {Math.round(t.fat_g)}g T
                      </div>
                      <div
                        className={`text-[10px] font-medium leading-tight ${
                          t.iron_mg >= ironTarget
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-gray-400'
                        }`}
                        title={`Cel: ${ironTarget} mg Fe`}
                      >
                        {Math.round(t.iron_mg * 10) / 10}/{ironTarget} mg Fe
                      </div>
                    </td>
                  )
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {picking && (
        <MealPicker
          onClose={() => setPicking(null)}
          onPick={(recipeId, servings) => {
            appendMealMutation.mutate({ date: picking.date, mealType: picking.mealType, recipeId, servings })
            setPicking(null)
          }}
          onPickProduct={(productId, grams) => {
            appendProductMutation.mutate({ date: picking.date, mealType: picking.mealType, productId, grams })
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
