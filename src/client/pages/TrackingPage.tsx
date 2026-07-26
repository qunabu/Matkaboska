import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { foodLogApi, waterApi, recipesApi, settingsApi } from '../lib/api'
import pl from '../i18n/pl'

function todayDate() {
  return new Date().toISOString().slice(0, 10)
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

  const { data: water } = useQuery({
    queryKey: ['water', date],
    queryFn: () => waterApi.get(date),
  })

  const waterMutation = useMutation({
    mutationFn: (delta: number) => waterApi.update(date, { delta }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['water', date] }),
  })

  const deleteEntry = useMutation({
    mutationFn: (id: number) => foodLogApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['food-log', date] })
      qc.invalidateQueries({ queryKey: ['food-log-summary', date] })
    },
  })

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['food-log', date] })
    qc.invalidateQueries({ queryKey: ['food-log-summary', date] })
  }

  const glasses = water?.glasses ?? 0
  const waterTarget = water?.target_glasses ?? 8

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

      {/* Date picker */}
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="mb-4 rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
      />

      {/* Macro summary */}
      {summary && (
        <div className="mb-4 rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
          <h2 className="mb-3 font-semibold text-gray-900 dark:text-gray-100">{pl.tracking.summary}</h2>
          <div className="space-y-2">
            <MacroProgressBar label="kcal" value={summary.kcal} max={settings?.kcal_target ?? 2300} color="bg-orange-400" />
            <MacroProgressBar label={`${pl.macros.protein} g`} value={summary.protein_g} max={settings?.protein_g_target ?? 150} color="bg-blue-400" />
            <MacroProgressBar label={`${pl.macros.carbs} g`} value={summary.carbs_g} max={250} color="bg-yellow-400" />
            <MacroProgressBar label={`${pl.macros.fat} g`} value={summary.fat_g} max={80} color="bg-red-400" />
          </div>
        </div>
      )}

      {/* Water */}
      <div className="mb-4 rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
        <h2 className="mb-2 font-semibold text-gray-900 dark:text-gray-100">💧 {pl.tracking.water.title}</h2>
        <div className="flex items-center gap-4">
          <button
            onClick={() => waterMutation.mutate(-1)}
            disabled={glasses === 0}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-lg disabled:opacity-30 dark:bg-gray-700"
          >
            −
          </button>
          <div className="flex flex-1 gap-1.5">
            {Array.from({ length: waterTarget }, (_, i) => (
              <div
                key={i}
                className={`h-5 flex-1 rounded-sm transition-colors ${i < glasses ? 'bg-blue-400' : 'bg-gray-200 dark:bg-gray-600'}`}
              />
            ))}
          </div>
          <span className="text-sm text-gray-500">{glasses}/{waterTarget}</span>
          <button
            onClick={() => waterMutation.mutate(1)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-500 text-lg text-white"
          >
            +
          </button>
        </div>
      </div>

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
            <button
              onClick={() => deleteEntry.mutate(entry.id)}
              className="text-gray-300 hover:text-red-400"
            >
              ×
            </button>
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
