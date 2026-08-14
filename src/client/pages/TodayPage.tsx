import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { planApi, waterApi, foodLogApi, settingsApi, productsApi, todayDate } from '../lib/api'
import HabitsCard from '../components/HabitsCard'
import pl from '../i18n/pl'
import type { MealType, PlanStatus, Product, FoodSuggestion } from '../../shared/types'

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

      {/* Habits share this box — both are quick daily check-offs. */}
      <HabitsCard bare />
    </div>
  )
}

function CustomFood() {
  const qc = useQueryClient()
  const [desc, setDesc] = useState('')
  const [debounced, setDebounced] = useState('')
  const [showSug, setShowSug] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)

  // Keep the suggestion request off the critical path of every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(desc.trim()), 200)
    return () => clearTimeout(t)
  }, [desc])

  const { data: log } = useQuery({
    queryKey: ['food-log', today],
    queryFn: () => foodLogApi.list(today),
  })

  const { data: sug } = useQuery({
    queryKey: ['food-suggestions', debounced],
    queryFn: () => foodLogApi.suggestions(debounced),
    // Empty query = recent entries + whole recipe book, shown as soon as the field is focused.
    enabled: showSug,
  })

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['food-log', today] })
    qc.invalidateQueries({ queryKey: ['food-log-summary', today] })
    qc.invalidateQueries({ queryKey: ['food-suggestions'] })
  }

  const reset = () => { setDesc(''); setDebounced(''); setShowSug(false); setActiveIdx(-1) }

  const estimateMutation = useMutation({
    mutationFn: (description: string) => foodLogApi.estimate({ description, date: today }),
    onSuccess: () => { reset(); refresh() },
  })

  // Picking a suggestion reuses the macros we already know — no AI call needed.
  const pickMutation = useMutation({
    mutationFn: (s: FoodSuggestion) => {
      if (s.recipe_id != null && s.kcal != null) {
        return foodLogApi.add({ date: today, recipe_id: s.recipe_id, servings: 1, portion: s.portion })
      }
      if (s.kcal != null) {
        return foodLogApi.add({
          date: today, description: s.label,
          kcal: s.kcal, protein_g: s.protein_g, carbs_g: s.carbs_g, fat_g: s.fat_g, iron_mg: s.iron_mg,
          portion: s.portion ?? 'custom',
        })
      }
      // Recipe without macros / older entry — fall back to the estimator.
      return foodLogApi.estimate({ description: s.label, date: today })
    },
    onSuccess: () => { reset(); refresh() },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => foodLogApi.delete(id),
    onSuccess: refresh,
  })

  const entries = log?.items ?? []
  const suggestions = sug?.items ?? []
  const busy = estimateMutation.isPending || pickMutation.isPending
  const submit = () => { if (desc.trim()) estimateMutation.mutate(desc.trim()) }
  const pick = (s: FoodSuggestion) => { setShowSug(false); pickMutation.mutate(s) }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' && suggestions.length) {
      e.preventDefault(); setShowSug(true)
      setActiveIdx((i) => (i + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp' && suggestions.length) {
      e.preventDefault()
      setActiveIdx((i) => (i <= 0 ? suggestions.length - 1 : i - 1))
    } else if (e.key === 'Enter') {
      const active = showSug && activeIdx >= 0 ? suggestions[activeIdx] : undefined
      if (active) pick(active)
      else submit()
    } else if (e.key === 'Escape') {
      setShowSug(false); setActiveIdx(-1)
    }
  }

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
      <h2 className="mb-1 font-semibold text-gray-900 dark:text-gray-100">🍽 {pl.today.addOwnFood}</h2>
      <p className="mb-3 text-xs text-gray-400">{pl.today.ownFoodHint}</p>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            value={desc}
            onChange={(e) => { setDesc(e.target.value); setShowSug(true); setActiveIdx(-1) }}
            onFocus={() => setShowSug(true)}
            onKeyDown={onKeyDown}
            placeholder={pl.today.ownFoodPlaceholder}
            disabled={busy}
            className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-primary-400 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />
          {showSug && (suggestions.length > 0 || desc.trim().length > 0) && (
            // Keep focus in the input so blur doesn't race the click.
            <div onMouseDown={(e) => e.preventDefault()}>
              {suggestions.length === 0 ? (
                <p className="absolute z-20 mt-1 w-full rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs text-gray-400 shadow-lg dark:border-gray-700 dark:bg-gray-900">
                  {pl.today.sugEmpty}
                </p>
              ) : (
                <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
                  {suggestions.map((s, i) => (
                    <li key={`${s.source}-${s.recipe_id ?? s.label}`}>
                      <button
                        type="button"
                        onClick={() => pick(s)}
                        onMouseEnter={() => setActiveIdx(i)}
                        className={`flex w-full items-center justify-between gap-2 px-4 py-2 text-left text-sm ${
                          i === activeIdx ? 'bg-gray-50 dark:bg-gray-800' : ''
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span aria-hidden>{s.source === 'recipe' ? '🍲' : '🕘'}</span>
                          <span className="truncate text-gray-900 dark:text-gray-100">{s.label}</span>
                        </span>
                        <span className="whitespace-nowrap text-xs text-gray-400">
                          {s.kcal != null ? `${Math.round(s.kcal)} kcal` : pl.today.sugNoMacros}
                          {' · '}
                          {s.source === 'recipe' ? pl.today.sugFromRecipe : pl.today.sugFromLog}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <button
          onClick={submit}
          disabled={busy || !desc.trim()}
          className="whitespace-nowrap rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {estimateMutation.isPending ? pl.today.estimating : pickMutation.isPending ? pl.today.sugAdding : pl.today.estimateAdd}
        </button>
      </div>
      {(estimateMutation.isError || pickMutation.isError) && (
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

function num(s: string): number | null {
  const n = parseFloat(s.replace(',', '.'))
  return isNaN(n) ? null : n
}

function ReadyProduct() {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [kcal, setKcal] = useState('')       // per 100 g
  const [protein, setProtein] = useState('')
  const [carbs, setCarbs] = useState('')
  const [fat, setFat] = useState('')
  const [iron, setIron] = useState('')       // mg per 100 g
  const [serving, setServing] = useState('') // grams of one portion
  const [pkg, setPkg] = useState('')         // grams of whole product
  const [grams, setGrams] = useState('')     // grams eaten now
  const [friscoPid, setFriscoPid] = useState('') // optional Frisco pid
  const [showSug, setShowSug] = useState(false)

  const { data: sug } = useQuery({
    queryKey: ['products', name],
    queryFn: () => productsApi.list(name),
    // Show saved products as soon as the field is focused (empty name = list all).
    enabled: showSug,
  })

  // Grams actually eaten: explicit input, else the portion, else 100 g.
  const eatenG = num(grams) || num(serving) || 100
  const factor = eatenG / 100
  const scaled = {
    kcal: num(kcal) != null ? Math.round((num(kcal) as number) * factor) : null,
    protein_g: num(protein) != null ? Math.round((num(protein) as number) * factor * 10) / 10 : null,
    carbs_g: num(carbs) != null ? Math.round((num(carbs) as number) * factor * 10) / 10 : null,
    fat_g: num(fat) != null ? Math.round((num(fat) as number) * factor * 10) / 10 : null,
    iron_mg: num(iron) != null ? Math.round((num(iron) as number) * factor * 10) / 10 : null,
  }

  const addMutation = useMutation({
    mutationFn: async () => {
      await productsApi.create({
        name: name.trim(),
        kcal: num(kcal), protein_g: num(protein), carbs_g: num(carbs), fat_g: num(fat),
        iron_mg: num(iron),
        serving_g: num(serving), package_g: num(pkg),
        frisco_product_id: friscoPid.trim() || null,
      })
      await foodLogApi.add({
        description: `${name.trim()} (${eatenG} g)`,
        kcal: scaled.kcal, protein_g: scaled.protein_g, carbs_g: scaled.carbs_g, fat_g: scaled.fat_g,
        iron_mg: scaled.iron_mg,
        portion: 'product',
      })
    },
    onSuccess: () => {
      setName(''); setKcal(''); setProtein(''); setCarbs(''); setFat(''); setServing(''); setPkg(''); setGrams(''); setFriscoPid(''); setShowSug(false)
      qc.invalidateQueries({ queryKey: ['food-log', today] })
      qc.invalidateQueries({ queryKey: ['food-log-summary', today] })
      qc.invalidateQueries({ queryKey: ['products'] })
    },
  })

  function pick(p: Product) {
    setName(p.name)
    setKcal(p.kcal?.toString() ?? '')
    setIron(p.iron_mg?.toString() ?? '')
    setProtein(p.protein_g?.toString() ?? '')
    setCarbs(p.carbs_g?.toString() ?? '')
    setFat(p.fat_g?.toString() ?? '')
    setServing(p.serving_g?.toString() ?? '')
    setPkg(p.package_g?.toString() ?? '')
    setGrams(p.serving_g?.toString() ?? '') // default to one portion
    setFriscoPid(p.frisco_product_id ?? '')
    setShowSug(false)
  }

  const suggestions = (sug?.items ?? []).filter(p => p.name.toLowerCase() !== name.trim().toLowerCase())
  const macroInput = 'w-full rounded-lg border border-gray-200 px-2 py-2 text-center text-sm outline-none focus:border-primary-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100'
  const numInput = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100'

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
      <h2 className="mb-1 font-semibold text-gray-900 dark:text-gray-100">🛒 {pl.today.readyProduct}</h2>
      <p className="mb-3 text-xs text-gray-400">{pl.today.readyPickHint}</p>

      <div className="relative">
        <input
          value={name}
          onChange={(e) => { setName(e.target.value); setShowSug(true) }}
          onFocus={() => setShowSug(true)}
          placeholder={pl.today.readyNamePlaceholder}
          className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-primary-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        />
        {showSug && suggestions.length > 0 && (
          <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
            {suggestions.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => pick(p)}
                  className="flex w-full items-center justify-between gap-2 px-4 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <span className="truncate text-gray-900 dark:text-gray-100">{p.name}</span>
                  <span className="whitespace-nowrap text-xs text-gray-400">
                    {p.kcal != null ? `${Math.round(p.kcal)} kcal/100g` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="mt-3 text-xs font-medium text-gray-400">{pl.today.readyPer100}</p>
      <div className="mt-1 grid grid-cols-5 gap-2">
        <input inputMode="decimal" value={kcal} onChange={(e) => setKcal(e.target.value)} placeholder={pl.today.mKcal} className={macroInput} />
        <input inputMode="decimal" value={protein} onChange={(e) => setProtein(e.target.value)} placeholder={pl.today.mProtein} className={macroInput} />
        <input inputMode="decimal" value={carbs} onChange={(e) => setCarbs(e.target.value)} placeholder={pl.today.mCarbs} className={macroInput} />
        <input inputMode="decimal" value={fat} onChange={(e) => setFat(e.target.value)} placeholder={pl.today.mFat} className={macroInput} />
        <input inputMode="decimal" value={iron} onChange={(e) => setIron(e.target.value)} placeholder={pl.today.mIron} className={macroInput} />
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="text-xs text-gray-400">
          {pl.today.readyServing}
          <input inputMode="decimal" value={serving} onChange={(e) => setServing(e.target.value)} placeholder="np. 150" className={`mt-1 ${numInput}`} />
        </label>
        <label className="text-xs text-gray-400">
          {pl.today.readyPackage}
          <input inputMode="decimal" value={pkg} onChange={(e) => setPkg(e.target.value)} placeholder="np. 200" className={`mt-1 ${numInput}`} />
        </label>
      </div>

      <label className="mt-2 block text-xs text-gray-400">
        {pl.today.readyFriscoPid}
        <input inputMode="numeric" value={friscoPid} onChange={(e) => setFriscoPid(e.target.value)} placeholder="np. 145836" className={`mt-1 ${numInput}`} />
      </label>

      <label className="mt-2 block text-xs font-medium text-gray-500 dark:text-gray-300">
        {pl.today.readyGrams}
        <input inputMode="decimal" value={grams} onChange={(e) => setGrams(e.target.value)} placeholder={serving || '100'} className={`mt-1 ${numInput}`} />
      </label>
      {num(kcal) != null && (
        <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:bg-gray-900 dark:text-gray-300">
          {eatenG} g = <strong>{scaled.kcal} kcal</strong> · B {scaled.protein_g}g · W {scaled.carbs_g}g · T {scaled.fat_g}g
          {scaled.iron_mg != null ? ` · Fe ${scaled.iron_mg}mg` : ''}
          {serving && grams && num(grams) !== num(serving) ? '' : serving ? ` (${pl.today.readyOnePortion})` : ''}
        </p>
      )}

      <button
        onClick={() => addMutation.mutate()}
        disabled={addMutation.isPending || !name.trim()}
        className="mt-3 w-full rounded-xl bg-primary-600 py-2.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {pl.today.readyAdd}
      </button>
      <p className="mt-2 text-xs text-gray-400">{pl.today.readyHint}</p>
    </div>
  )
}

// Logged-today food entries, shown on the main page (not just in the add modal).
function LoggedToday() {
  const qc = useQueryClient()
  const { data: log } = useQuery({ queryKey: ['food-log', today], queryFn: () => foodLogApi.list(today) })
  const del = useMutation({
    mutationFn: (id: number) => foodLogApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['food-log', today] })
      qc.invalidateQueries({ queryKey: ['food-log-summary', today] })
    },
  })
  const entries = log?.items ?? []
  if (entries.length === 0) return null
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
      <h2 className="mb-3 font-semibold text-gray-900 dark:text-gray-100">🍽 {pl.today.loggedToday}</h2>
      <div className="space-y-1.5">
        {entries.map((e) => (
          <div key={e.id} className="flex items-center justify-between gap-2 text-sm">
            <span className="flex-1 truncate text-gray-700 dark:text-gray-300">{e.description ?? '—'}</span>
            <span className="whitespace-nowrap text-xs text-gray-400">
              {Math.round(e.kcal ?? 0)} kcal · {Math.round(e.protein_g ?? 0)}g B
            </span>
            <button onClick={() => del.mutate(e.id)} className="text-gray-300 hover:text-red-400" aria-label={pl.common.delete}>×</button>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function TodayPage() {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)

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
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {pl.today.title} – {new Intl.DateTimeFormat('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}
        </h1>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{pl.today.blessing}</p>
      </div>

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
            <MacroBar label={`${pl.macros.iron} (mg)`} value={summary.iron_mg} max={settings?.iron_mg_target ?? 27} color="bg-emerald-500" />
          </div>
        </div>
      )}

      {/* What you've logged today */}
      <LoggedToday />

      {/* Rarely-used: add own food / product via a bottom modal */}
      <button
        onClick={() => setShowAdd(true)}
        className="w-full rounded-xl border border-dashed border-gray-300 py-3 text-sm font-medium text-primary-600 transition-colors hover:border-primary-400 hover:bg-primary-50 dark:border-gray-600 dark:text-primary-400 dark:hover:bg-primary-900/20"
      >
        ➕ {pl.today.addFoodButton}
      </button>

      {/* Water + habits — one box of daily check-offs */}
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
                          {entry.product
                            ? `🛒 ${entry.product.name}`
                            : entry.recipe?.title ?? `${pl.today.recipeFallback}${entry.recipe_id}`}
                        </p>
                        {entry.recipe?.macros && (
                          <p className="text-xs text-gray-400">
                            {Math.round(entry.recipe.macros.kcal * entry.servings)} kcal
                            · {Math.round(entry.recipe.macros.protein_g * entry.servings)}g B
                          </p>
                        )}
                        {entry.product && (() => {
                          const f = (entry.grams ?? entry.product.serving_g ?? 100) / 100
                          return (
                            <p className="text-xs text-gray-400">
                              {entry.grams ?? entry.product.serving_g ?? 100} g
                              {entry.product.kcal != null ? ` · ${Math.round(entry.product.kcal * f)} kcal` : ''}
                              {entry.product.protein_g != null ? ` · ${Math.round(entry.product.protein_g * f)}g B` : ''}
                            </p>
                          )
                        })()}
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

      {/* Bottom-sheet modal: add own food (AI) + ready product */}
      {showAdd && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/40 md:items-center md:justify-center"
          onClick={() => setShowAdd(false)}
        >
          <div
            className="max-h-[88vh] w-full space-y-4 overflow-y-auto rounded-t-2xl bg-gray-50 p-4 md:max-w-lg md:rounded-2xl dark:bg-gray-950"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100">{pl.today.addFoodTitle}</h2>
              <button onClick={() => setShowAdd(false)} className="text-2xl leading-none text-gray-400 hover:text-gray-600">×</button>
            </div>
            <CustomFood />
            <ReadyProduct />
          </div>
        </div>
      )}
    </div>
  )
}
