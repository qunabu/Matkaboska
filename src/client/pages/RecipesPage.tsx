import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { recipesApi } from '../lib/api'
import pl from '../i18n/pl'
import type { Category } from '../../shared/types'

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

  return (
    <div className="mx-auto max-w-2xl p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{pl.recipes.title}</h1>
        <Link
          to="/recipes/new"
          className="rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700"
        >
          + {pl.recipes.new}
        </Link>
      </div>

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
    </div>
  )
}
