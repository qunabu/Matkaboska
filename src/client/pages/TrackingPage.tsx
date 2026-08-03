import { useState } from 'react'
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query'
import { foodLogApi, waterApi, recipesApi, settingsApi, addDays } from '../lib/api'
import type { FoodLogEntry } from '../../shared/types'
import pl from '../i18n/pl'

function todayDate() {
  return new Date().toISOString().slice(0, 10)
}

const SHORT_DAYS = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb']
const dayLabel = (d: string) => SHORT_DAYS[new Date(d).getDay()]

// Simple dependency-free bar chart for a 7-day series, with a dashed target
// line (goal) overlaid so you can compare tracking (bars) vs cel (line).
function WeekBars({ days, values, target, color }: {
  days: string[]; values: number[]; target?: number; color: string
}) {
  const headroom = target ? target * 1.15 : 1 // keep the target line below the top
  const max = Math.max(headroom, ...values, 1)
  const today = todayDate()
  const targetPct = target ? Math.min(100, (target / max) * 100) : null
  return (
    <div>
      <div className="relative h-24">
        {targetPct != null && (
          <div
            className="pointer-events-none absolute inset-x-0 z-10 border-t border-dashed border-gray-500/70 dark:border-gray-300/60"
            style={{ bottom: `${targetPct}%` }}
          >
            <span className="absolute right-0 -top-2.5 rounded bg-white px-1 text-[8px] font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-300">
              cel {Math.round(target!)}
            </span>
          </div>
        )}
        <div className="flex h-full items-end gap-1">
          {values.map((v, i) => {
            const h = Math.max(Math.round((v / max) * 100), v > 0 ? 4 : 0)
            const hitTarget = target ? v >= target : false
            return (
              <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-0.5">
                <span className="text-[9px] leading-none text-gray-400">{v > 0 ? Math.round(v) : ''}</span>
                <div
                  className={`w-full rounded-t ${v > 0 ? (hitTarget ? 'bg-green-500' : color) : 'bg-gray-100 dark:bg-gray-700'}`}
                  style={{ height: `${Math.max(h, 2)}%` }}
                  title={hitTarget ? 'Cel osiągnięty' : undefined}
                />
              </div>
            )
          })}
        </div>
      </div>
      <div className="mt-1 flex gap-1">
        {days.map((d) => (
          <span
            key={d}
            className={`flex-1 text-center text-[9px] ${d === today ? 'font-bold text-primary-600 dark:text-primary-400' : 'text-gray-400'}`}
          >
            {dayLabel(d)}
          </span>
        ))}
      </div>
    </div>
  )
}

function WeekSummary({ date, kcalTarget, proteinTarget, waterTarget }: {
  date: string; kcalTarget: number; proteinTarget: number; waterTarget: number
}) {
  const [weekEnd, setWeekEnd] = useState(date) // last day of the shown week
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekEnd, i - 6)) // 7 days ending on weekEnd
  const canForward = weekEnd < todayDate()
  const fmt = (d: string) => { const x = new Date(d); return `${x.getDate()}.${x.getMonth() + 1}` }

  const summaries = useQueries({
    queries: days.map((d) => ({
      queryKey: ['food-log-summary', d],
      queryFn: () => foodLogApi.summary(d),
    })),
  })
  const waters = useQueries({
    queries: days.map((d) => ({
      queryKey: ['water', d],
      queryFn: () => waterApi.get(d),
    })),
  })

  const kcal = summaries.map((s) => s.data?.kcal ?? 0)
  const protein = summaries.map((s) => s.data?.protein_g ?? 0)
  const carbs = summaries.map((s) => s.data?.carbs_g ?? 0)
  const fat = summaries.map((s) => s.data?.fat_g ?? 0)
  const glasses = waters.map((w) => w.data?.glasses ?? 0)

  const avg = (arr: number[]) => Math.round(arr.reduce((a, b) => a + b, 0) / (arr.length || 1))

  const charts = [
    { label: pl.tracking.kcal, values: kcal, target: kcalTarget, color: 'bg-orange-400', unit: '' },
    { label: pl.tracking.protein, values: protein, target: proteinTarget, color: 'bg-blue-400', unit: 'g' },
    { label: pl.tracking.carbs, values: carbs, target: 250, color: 'bg-yellow-400', unit: 'g' },
    { label: pl.tracking.fat, values: fat, target: 80, color: 'bg-red-400', unit: 'g' },
    { label: `💧 ${pl.tracking.water.title}`, values: glasses, target: waterTarget, color: 'bg-cyan-400', unit: ` ${pl.tracking.glassesShort}` },
  ]

  return (
    <div className="mb-4 rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">📊 {pl.tracking.weekSummary}</h2>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setWeekEnd(addDays(weekEnd, -7))}
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-100 text-sm dark:bg-gray-700"
            aria-label="Poprzedni tydzień"
          >
            ‹
          </button>
          <span className="min-w-[86px] text-center text-xs text-gray-500 dark:text-gray-400">
            {fmt(days[0])} – {fmt(days[6])}
          </span>
          <button
            onClick={() => setWeekEnd((w) => { const n = addDays(w, 7); return n > todayDate() ? todayDate() : n })}
            disabled={!canForward}
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-100 text-sm disabled:opacity-30 dark:bg-gray-700"
            aria-label="Następny tydzień"
          >
            ›
          </button>
        </div>
      </div>
      <div className="space-y-4">
        {charts.map((c) => (
          <div key={c.label}>
            <div className="mb-1 flex items-baseline justify-between text-xs">
              <span className="font-medium text-gray-600 dark:text-gray-300">{c.label}</span>
              <span className="text-gray-400">
                {pl.tracking.weekAvg} {avg(c.values)}{c.unit} · cel {c.target}{c.unit}
              </span>
            </div>
            <WeekBars days={days} values={c.values} target={c.target} color={c.color} />
          </div>
        ))}
      </div>
    </div>
  )
}

function MacroProgressBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs text-gray-500">
        <span>{label}</span>
        <span>{Math.round(value)} / {max}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// Macro donut (like Fitatu): segments sized by each macro's calorie share.
function MacroDonut({ protein_g, carbs_g, fat_g, kcal, kcalTarget }: {
  protein_g: number; carbs_g: number; fat_g: number; kcal: number; kcalTarget: number
}) {
  const segs = [
    { label: pl.tracking.protein, g: protein_g, cal: protein_g * 4, color: '#60a5fa' },
    { label: pl.tracking.carbs, g: carbs_g, cal: carbs_g * 4, color: '#facc15' },
    { label: pl.tracking.fat, g: fat_g, cal: fat_g * 9, color: '#f87171' },
  ]
  const total = segs.reduce((s, x) => s + x.cal, 0)
  const r = 54
  const C = 2 * Math.PI * r
  let start = 0

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:justify-around">
      <div className="relative h-40 w-40 shrink-0">
        <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90">
          <circle cx="64" cy="64" r={r} fill="none" strokeWidth="16" className="stroke-gray-100 dark:stroke-gray-700" />
          {total > 0 && segs.map((s, i) => {
            const frac = s.cal / total
            const dash = frac * C
            const el = (
              <circle
                key={i} cx="64" cy="64" r={r} fill="none" stroke={s.color} strokeWidth="16"
                strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={-start * C}
              />
            )
            start += frac
            return el
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">{Math.round(kcal)}</span>
          <span className="text-[11px] text-gray-400">/ {kcalTarget} kcal</span>
        </div>
      </div>
      <div className="w-full max-w-[16rem] space-y-1.5">
        {segs.map((s, i) => {
          const pct = total > 0 ? Math.round((s.cal / total) * 100) : 0
          return (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
              <span className="flex-1 text-gray-600 dark:text-gray-300">{s.label}</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">{Math.round(s.g)} g</span>
              <span className="w-10 text-right text-gray-400">{pct}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface AddEntryFormProps {
  date: string
  onClose: () => void
  onSaved: () => void
}

function AddEntryForm({ date, onClose, onSaved }: AddEntryFormProps) {
  const [mode, setMode] = useState<'manual' | 'recipe'>('manual')
  const [description, setDescription] = useState('')
  const [kcal, setKcal] = useState('')
  const [protein, setProtein] = useState('')
  const [carbs, setCarbs] = useState('')
  const [fat, setFat] = useState('')
  const [portion, setPortion] = useState('')
  const [selectedRecipeId, setSelectedRecipeId] = useState<number | null>(null)
  const [servings, setServings] = useState('1')
  const [recipeSearch, setRecipeSearch] = useState('')

  const { data: recipesData } = useQuery({
    queryKey: ['recipes', recipeSearch],
    queryFn: () => recipesApi.list({ search: recipeSearch || undefined }),
    enabled: mode === 'recipe',
    staleTime: 30_000,
  })

  const addMutation = useMutation({
    mutationFn: () => {
      if (mode === 'recipe' && selectedRecipeId) {
        return foodLogApi.add({ date, recipe_id: selectedRecipeId, servings: Number(servings) })
      }
      return foodLogApi.add({
        date,
        description: description || null,
        kcal: kcal ? Number(kcal) : null,
        protein_g: protein ? Number(protein) : null,
        carbs_g: carbs ? Number(carbs) : null,
        fat_g: fat ? Number(fat) : null,
        portion: portion || null,
      })
    },
    onSuccess: () => { onSaved(); onClose() },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40 md:items-center" onClick={onClose}>
      <div
        className="w-full max-h-[85vh] overflow-y-auto rounded-t-2xl bg-white p-4 md:mx-auto md:max-w-md md:rounded-2xl dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">{pl.tracking.addEntry}</h3>
          <button onClick={onClose} className="text-gray-400">×</button>
        </div>

        <div className="mb-3 flex gap-2">
          <button
            onClick={() => setMode('manual')}
            className={`flex-1 rounded-lg py-2 text-sm font-medium ${mode === 'manual' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 dark:bg-gray-700'}`}
          >
            {pl.tracking.manual}
          </button>
          <button
            onClick={() => setMode('recipe')}
            className={`flex-1 rounded-lg py-2 text-sm font-medium ${mode === 'recipe' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 dark:bg-gray-700'}`}
          >
            {pl.tracking.fromRecipe}
          </button>
        </div>

        {mode === 'manual' ? (
          <div className="space-y-3">
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={pl.tracking.description}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-0.5 block text-xs text-gray-500">{pl.tracking.kcal}</label>
                <input type="number" value={kcal} onChange={(e) => setKcal(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
              </div>
              <div>
                <label className="mb-0.5 block text-xs text-gray-500">{pl.tracking.protein} (g)</label>
                <input type="number" value={protein} onChange={(e) => setProtein(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
              </div>
              <div>
                <label className="mb-0.5 block text-xs text-gray-500">{pl.tracking.carbs} (g)</label>
                <input type="number" value={carbs} onChange={(e) => setCarbs(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
              </div>
              <div>
                <label className="mb-0.5 block text-xs text-gray-500">{pl.tracking.fat} (g)</label>
                <input type="number" value={fat} onChange={(e) => setFat(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
              </div>
            </div>
            <input
              value={portion}
              onChange={(e) => setPortion(e.target.value)}
              placeholder={pl.tracking.portion}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            />
          </div>
        ) : (
          <div className="space-y-3">
            <input
              value={recipeSearch}
              onChange={(e) => setRecipeSearch(e.target.value)}
              placeholder={pl.common.search}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            />
            <div className="max-h-48 overflow-y-auto space-y-1">
              {(recipesData?.items ?? []).map(r => (
                <button
                  key={r.id}
                  onClick={() => setSelectedRecipeId(r.id)}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm ${selectedRecipeId === r.id ? 'bg-primary-50 ring-1 ring-primary-300 dark:bg-primary-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                >
                  {r.title}
                  {r.macros && <span className="ml-2 text-xs text-gray-400">{r.macros.kcal} kcal</span>}
                </button>
              ))}
            </div>
            <div>
              <label className="mb-0.5 block text-xs text-gray-500">{pl.tracking.servings}</label>
              <input
                type="number" min="0.5" step="0.5"
                value={servings}
                onChange={(e) => setServings(e.target.value)}
                className="w-24 rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              />
            </div>
          </div>
        )}

        <button
          onClick={() => addMutation.mutate()}
          disabled={addMutation.isPending || (mode === 'recipe' && !selectedRecipeId)}
          className="mt-4 w-full rounded-xl bg-primary-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {addMutation.isPending ? '…' : pl.common.add}
        </button>
      </div>
    </div>
  )
}

export default function TrackingPage() {
  const qc = useQueryClient()
  const [date, setDate] = useState(todayDate())
  const [showAdd, setShowAdd] = useState(false)
  const [copiedId, setCopiedId] = useState<number | null>(null)

  const { data: entries } = useQuery({
    queryKey: ['food-log', date],
    queryFn: () => foodLogApi.list(date),
  })

  const { data: summary } = useQuery({
    queryKey: ['food-log-summary', date],
    queryFn: () => foodLogApi.summary(date),
  })

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.get(),
  })

  const deleteEntry = useMutation({
    mutationFn: (id: number) => foodLogApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['food-log', date] })
      qc.invalidateQueries({ queryKey: ['food-log-summary', date] })
    },
  })

  // Copy a logged entry to today (re-log something you ate before).
  const copyEntry = useMutation({
    mutationFn: (entry: FoodLogEntry) => foodLogApi.add({
      date: todayDate(),
      description: entry.description,
      kcal: entry.kcal, protein_g: entry.protein_g, carbs_g: entry.carbs_g, fat_g: entry.fat_g,
      portion: entry.portion ?? 'custom',
    }),
    onSuccess: (_r, entry) => {
      setCopiedId(entry.id)
      setTimeout(() => setCopiedId((c) => (c === entry.id ? null : c)), 2000)
      qc.invalidateQueries({ queryKey: ['food-log', todayDate()] })
      qc.invalidateQueries({ queryKey: ['food-log-summary', todayDate()] })
    },
  })

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['food-log', date] })
    qc.invalidateQueries({ queryKey: ['food-log-summary', date] })
  }

  return (
    <div className="mx-auto max-w-2xl p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{pl.tracking.title}</h1>
        <button
          onClick={() => setShowAdd(true)}
          className="rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white"
        >
          + {pl.tracking.addEntry}
        </button>
      </div>

      {/* Date navigation */}
      <div className="mb-4 flex items-center gap-2">
        <button
          onClick={() => setDate(addDays(date, -1))}
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-lg dark:bg-gray-700"
          aria-label="Poprzedni dzień"
        >
          ‹
        </button>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-center text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
        />
        <button
          onClick={() => setDate(addDays(date, 1))}
          disabled={date >= todayDate()}
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-lg disabled:opacity-30 dark:bg-gray-700"
          aria-label="Następny dzień"
        >
          ›
        </button>
        <button
          onClick={() => setDate(todayDate())}
          className="rounded-lg bg-primary-100 px-3 py-2 text-sm font-medium text-primary-700 dark:bg-primary-900/30 dark:text-primary-400"
        >
          {pl.tracking.today}
        </button>
      </div>

      {/* Macro summary — donut + goal bars */}
      {summary && (
        <div className="mb-4 rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
          <h2 className="mb-3 font-semibold text-gray-900 dark:text-gray-100">{pl.tracking.summary}</h2>
          <MacroDonut
            protein_g={summary.protein_g}
            carbs_g={summary.carbs_g}
            fat_g={summary.fat_g}
            kcal={summary.kcal}
            kcalTarget={settings?.kcal_target ?? 2300}
          />
          <div className="mt-4 space-y-2">
            <MacroProgressBar label="kcal" value={summary.kcal} max={settings?.kcal_target ?? 2300} color="bg-orange-400" />
            <MacroProgressBar label={`${pl.macros.protein} g`} value={summary.protein_g} max={settings?.protein_g_target ?? 150} color="bg-blue-400" />
            <MacroProgressBar label={`${pl.macros.carbs} g`} value={summary.carbs_g} max={250} color="bg-yellow-400" />
            <MacroProgressBar label={`${pl.macros.fat} g`} value={summary.fat_g} max={80} color="bg-red-400" />
          </div>
        </div>
      )}

      {/* Weekly charts */}
      <WeekSummary
        date={date}
        kcalTarget={settings?.kcal_target ?? 2300}
        proteinTarget={settings?.protein_g_target ?? 150}
        waterTarget={settings?.water_glasses_target ?? 8}
      />

      {/* Log entries */}
      <div className="space-y-2">
        {(entries?.items ?? []).length === 0 && (
          <p className="py-8 text-center text-gray-400">{pl.tracking.noEntries}</p>
        )}
        {(entries?.items ?? []).map((entry) => (
          <div
            key={entry.id}
            className="flex items-center justify-between gap-2 rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700"
          >
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {entry.description ?? `${pl.tracking.entryFallback}${entry.id}`}
              </p>
              {(entry.kcal || entry.protein_g) && (
                <p className="text-xs text-gray-400">
                  {entry.kcal && <span>{entry.kcal} kcal</span>}
                  {entry.protein_g && <span> · {entry.protein_g}g B</span>}
                  {entry.carbs_g && <span> · {entry.carbs_g}g W</span>}
                  {entry.fat_g && <span> · {entry.fat_g}g T</span>}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                onClick={() => copyEntry.mutate(entry)}
                disabled={copyEntry.isPending}
                title={pl.tracking.copyToToday}
                className={`rounded-lg px-2 py-1 text-xs font-medium transition-colors ${
                  copiedId === entry.id
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-gray-100 text-gray-600 hover:bg-primary-100 hover:text-primary-700 dark:bg-gray-700 dark:text-gray-200'
                }`}
              >
                {copiedId === entry.id ? `✓ ${pl.tracking.copied}` : `📋 ${pl.tracking.toTodayBtn}`}
              </button>
              <button
                onClick={() => deleteEntry.mutate(entry.id)}
                className="text-gray-300 hover:text-red-400"
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>

      {showAdd && (
        <AddEntryForm
          date={date}
          onClose={() => setShowAdd(false)}
          onSaved={invalidateAll}
        />
      )}
    </div>
  )
}
