import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { recipesApi } from '../lib/api'
import pl from '../i18n/pl'

export default function RecipeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [noteText, setNoteText] = useState('')
  const [showNoteForm, setShowNoteForm] = useState(false)

  const recipeId = Number(id)

  const { data: recipe, isLoading, isError } = useQuery({
    queryKey: ['recipe', recipeId],
    queryFn: () => recipesApi.get(recipeId),
    enabled: !!recipeId,
  })

  const deleteMutation = useMutation({
    mutationFn: () => recipesApi.delete(recipeId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recipes'] })
      navigate('/recipes')
    },
  })

  const addNoteMutation = useMutation({
    mutationFn: (body: string) => recipesApi.addNote(recipeId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recipe', recipeId] })
      setNoteText('')
      setShowNoteForm(false)
    },
  })

  const deleteNoteMutation = useMutation({
    mutationFn: (noteId: number) => recipesApi.deleteNote(recipeId, noteId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recipe', recipeId] }),
  })

  const recalcMutation = useMutation({
    mutationFn: () => recipesApi.recalcMacros(recipeId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recipe', recipeId] }),
  })

  if (isLoading) return <div className="p-4 text-gray-500">{pl.common.loading}</div>
  if (isError || !recipe) return <div className="p-4 text-red-500">{pl.common.error}</div>

  return (
    <div className="mx-auto max-w-2xl p-4">
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <Link to="/recipes" className="mb-1 block text-sm text-gray-400 hover:text-gray-600">
            ← {pl.common.back}
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{recipe.title}</h1>
          <div className="mt-1 flex flex-wrap gap-2 text-xs text-gray-500">
            <span>{pl.recipes.categories[recipe.category as keyof typeof pl.recipes.categories] ?? recipe.category}</span>
            {recipe.prep_minutes && <span>· {recipe.prep_minutes} {pl.common.minutes}</span>}
            <span>· {recipe.servings} {pl.common.serving}</span>
            {recipe.is_seafood && <span>🐟</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            to={`/recipes/${recipeId}/edit`}
            className="rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300"
          >
            {pl.common.edit}
          </Link>
          <button
            onClick={() => { if (confirm(pl.recipes.deleteConfirm)) deleteMutation.mutate() }}
            className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400"
          >
            {pl.common.delete}
          </button>
        </div>
      </div>

      {/* Tags */}
      {recipe.tags.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {recipe.tags.map((tag) => (
            <span key={tag} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-300">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Macros */}
      {recipe.macros ? (
        <div className="mb-4 rounded-xl bg-orange-50 p-4 ring-1 ring-orange-100 dark:bg-orange-900/20 dark:ring-orange-800/30">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold text-orange-900 dark:text-orange-300">
              {pl.recipes.macros} <span className="text-xs font-normal text-orange-600">({pl.recipes.macrosPerServing})</span>
            </h2>
            <button
              onClick={() => recalcMutation.mutate()}
              disabled={recalcMutation.isPending}
              className="text-xs text-orange-600 underline"
            >
              {recalcMutation.isPending ? '…' : pl.recipes.recalcMacros}
            </button>
          </div>
          <div className="grid grid-cols-5 gap-3 text-center">
            {[
              { label: pl.macros.kcal, value: recipe.macros.kcal, unit: '' },
              { label: pl.macros.protein, value: recipe.macros.protein_g, unit: 'g' },
              { label: pl.macros.carbs, value: recipe.macros.carbs_g, unit: 'g' },
              { label: pl.macros.fat, value: recipe.macros.fat_g, unit: 'g' },
              { label: pl.macros.iron, value: recipe.macros.iron_mg ?? 0, unit: 'mg' },
            ].map(({ label, value, unit }) => (
              <div key={label}>
                <div className="text-xl font-bold text-orange-700 dark:text-orange-300">
                  {Math.round(value * 10) / 10}{unit}
                </div>
                <div className="text-xs text-orange-600 dark:text-orange-400">{label}</div>
              </div>
            ))}
          </div>
          {recipe.macros_confidence && (
            <p className="mt-1 text-right text-xs text-orange-500">
              pewność: {recipe.macros_confidence === 'high' ? pl.recipes.confidence.high :
                recipe.macros_confidence === 'medium' ? pl.recipes.confidence.medium :
                pl.recipes.confidence.low}
            </p>
          )}
        </div>
      ) : (
        <div className="mb-4 rounded-xl bg-gray-50 p-3 text-sm text-gray-400 dark:bg-gray-800">
          {pl.recipes.estimating}{' '}
          <button onClick={() => recalcMutation.mutate()} className="underline">
            {pl.recipes.recalcMacros}
          </button>
        </div>
      )}

      {/* Ingredients */}
      <div className="mb-4 rounded-xl bg-white shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
        <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">{pl.recipes.ingredients}</h2>
        </div>
        <ul className="divide-y divide-gray-50 dark:divide-gray-700">
          {recipe.ingredients.map((ing, i) => (
            <li key={i} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <span className="text-gray-900 dark:text-gray-100">{ing.name}</span>
              <span className="text-gray-500">{ing.amount} {ing.unit}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Steps */}
      <div className="mb-4 rounded-xl bg-white shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
        <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">{pl.recipes.steps}</h2>
        </div>
        <ol className="divide-y divide-gray-50 dark:divide-gray-700">
          {recipe.steps.map((step, i) => (
            <li key={i} className="flex gap-3 px-4 py-3 text-sm">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-700 dark:bg-primary-900/30 dark:text-primary-400">
                {i + 1}
              </span>
              <span className="text-gray-700 dark:text-gray-300">{step}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Notes */}
      <div className="mb-4 rounded-xl bg-white shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">{pl.recipes.notes}</h2>
          <button
            onClick={() => setShowNoteForm(!showNoteForm)}
            className="text-sm text-primary-600 hover:underline"
          >
            + {pl.recipes.addNote}
          </button>
        </div>
        {showNoteForm && (
          <div className="border-b border-gray-100 p-4 dark:border-gray-700">
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={3}
              placeholder={pl.recipes.notesPlaceholder}
              className="w-full rounded-lg border border-gray-200 p-2 text-sm outline-none focus:border-primary-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => addNoteMutation.mutate(noteText)}
                disabled={!noteText.trim()}
                className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
              >
                {pl.common.save}
              </button>
              <button
                onClick={() => setShowNoteForm(false)}
                className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm text-gray-600 dark:bg-gray-700"
              >
                {pl.common.cancel}
              </button>
            </div>
          </div>
        )}
        {recipe.notes.length === 0 && !showNoteForm && (
          <p className="px-4 py-3 text-sm text-gray-400">{pl.common.noResults}</p>
        )}
        <ul className="divide-y divide-gray-50 dark:divide-gray-700">
          {recipe.notes.map((note) => (
            <li key={note.id} className="flex items-start justify-between gap-2 px-4 py-3">
              <p className="flex-1 text-sm text-gray-700 dark:text-gray-300">{note.body}</p>
              <button
                onClick={() => deleteNoteMutation.mutate(note.id)}
                className="text-xs text-red-400 hover:text-red-600"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
