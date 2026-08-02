import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { recipesApi, onboardingApi } from '../lib/api'
import pl from '../i18n/pl'
import type { Category } from '../../shared/types'
import RecipeImportModal from '../components/RecipeImportModal'

const CATEGORIES: { value: Category | ''; label: string }[] = [
  { value: '', label: pl.recipes.all },
  { value: 'breakfast', label: pl.recipes.categories.breakfast },
  { value: 'main', label: pl.recipes.categories.main },
  { value: 'snack', label: pl.recipes.categories.snack },
  { value: 'classic', label: pl.recipes.categories.classic },
]

export default function RecipesPage() {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<Category | ''>('')
  const [seafoodOnly, setSeafoodOnly] = useState(false)
  const [showImport, setShowImport] = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['recipes', search, category, seafoodOnly],
    queryFn: () => recipesApi.list({
      search: search || undefined,
      category: category || undefined,
      seafood: seafoodOnly || undefined,
    }),
    staleTime: 30_000,
  })

  const recipes = data?.items ?? []

  const qc = useQueryClient()
  const { data: starter } = useQuery({ queryKey: ['starter-info'], queryFn: () => onboardingApi.starterInfo() })
  const starterMut = useMutation({
    mutationFn: () => onboardingApi.importStarter(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recipes'] })
      qc.invalidateQueries({ queryKey: ['starter-info'] })
    },
  })
  // Offer the starter import while the user's own collection is still thin (< 10).
  const showStarter = !!starter && !starter.isSource && starter.available > 0 && starter.mine < 10

  return (
    <div className="mx-auto max-w-2xl p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{pl.recipes.title}</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowImport(true)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            title={pl.import.buttonLabel}
          >
            ↓ JSON
          </button>
          <Link
            to="/recipes/new"
            className="rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            + {pl.recipes.new}
          </Link>
        </div>
      </div>

      {/* Starter recipes import (shown while the user's collection is thin) */}
      {showStarter && (
        <div className="mb-4 flex flex-col gap-2 rounded-2xl border border-primary-200 bg-primary-50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-primary-500/30 dark:bg-primary-500/10">
          <div>
            <p className="text-sm font-semibold text-primary-800 dark:text-primary-200">{pl.onboarding.starterTitle}</p>
            <p className="text-xs text-primary-700/80 dark:text-primary-300/80">{pl.onboarding.starterHint(starter!.available)}</p>
          </div>
          <button
            onClick={() => starterMut.mutate()}
            disabled={starterMut.isPending}
            className="shrink-0 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {starterMut.isPending ? pl.onboarding.importing : pl.onboarding.starterBtn(starter!.available)}
          </button>
        </div>
      )}

      {/* Search */}
      <div className="mb-3">
        <input
          type="search"
          placeholder={pl.recipes.searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm shadow-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
        />
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-2">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            onClick={() => setCategory(cat.value)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              category === cat.value
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300'
            }`}
          >
            {cat.label}
          </button>
        ))}
        <button
          onClick={() => setSeafoodOnly(!seafoodOnly)}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            seafoodOnly
              ? 'bg-blue-500 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300'
          }`}
        >
          🐟 {pl.recipes.seafoodOnly}
        </button>
      </div>

      {/* List */}
      {isLoading && <p className="text-gray-500">{pl.common.loading}</p>}
      {isError && <p className="text-red-500">{pl.common.error}</p>}

      <div className="space-y-3">
        {recipes.map((recipe) => (
          <Link
            key={recipe.id}
            to={`/recipes/${recipe.id}`}
            className="flex items-center gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 transition-shadow hover:shadow-md dark:bg-gray-800 dark:ring-gray-700"
          >
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 truncate dark:text-gray-100">{recipe.title}</p>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                <span>{CATEGORIES.find(c => c.value === recipe.category)?.label ?? recipe.category}</span>
                {recipe.prep_minutes && <span>· {recipe.prep_minutes} {pl.common.minutes}</span>}
                {recipe.is_seafood && <span>🐟</span>}
                {recipe.macros && (
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="font-medium text-orange-500">{Math.round(recipe.macros.kcal)} kcal</span>
                    <span className="text-blue-500">{Math.round(recipe.macros.protein_g)}g B</span>
                    <span className="text-yellow-600 dark:text-yellow-500">{Math.round(recipe.macros.carbs_g)}g W</span>
                    <span className="text-red-400">{Math.round(recipe.macros.fat_g)}g T</span>
                    <span className="text-emerald-600 dark:text-emerald-400">{Math.round((recipe.macros.iron_mg ?? 0) * 10) / 10}mg Fe</span>
                  </span>
                )}
              </div>
            </div>
            <span className="text-gray-400">›</span>
          </Link>
        ))}
        {!isLoading && recipes.length === 0 && (
          <p className="py-8 text-center text-gray-400">{pl.common.noResults}</p>
        )}
      </div>

      {showImport && <RecipeImportModal onClose={() => setShowImport(false)} />}
    </div>
  )
}
