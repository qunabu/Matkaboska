import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { recipesApi } from '../lib/api'
import pl from '../i18n/pl'

type Ref = { id: number; title: string; slug: string }

export default function RecipeModal({ recipes, onClose }: { recipes: Ref[]; onClose: () => void }) {
  const [id, setId] = useState<number>(recipes[0]?.id)
  const { data: recipe, isLoading } = useQuery({
    queryKey: ['recipe', id],
    queryFn: () => recipesApi.get(id),
    enabled: !!id,
  })

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm md:items-center" onClick={onClose}>
      <div className="flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white md:max-w-lg md:rounded-2xl dark:bg-gray-900" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-800">
          <h3 className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{pl.shopping.fromRecipe}</h3>
          <button onClick={onClose} className="ml-2 shrink-0 text-2xl leading-none text-gray-400">×</button>
        </div>

        {recipes.length > 1 && (
          <div className="flex flex-wrap gap-1.5 border-b border-gray-100 p-3 dark:border-gray-800">
            {recipes.map((r) => (
              <button
                key={r.id}
                onClick={() => setId(r.id)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${r.id === id ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}
              >
                {r.title}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          {isLoading || !recipe ? (
            <p className="p-8 text-center text-sm text-gray-400">{pl.common.loading}</p>
          ) : (
            <>
              <div className="mb-3 flex items-start justify-between gap-2">
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{recipe.title}</h2>
                <Link to={`/recipes/${recipe.id}`} onClick={onClose} className="shrink-0 text-xs text-primary-600 underline dark:text-primary-400">
                  {pl.shopping.openFullRecipe} ↗
                </Link>
              </div>
              {recipe.macros && (
                <p className="mb-3 flex flex-wrap gap-x-3 text-xs text-gray-500">
                  <span className="font-semibold">{Math.round(recipe.macros.kcal)} kcal</span>
                  <span>{Math.round(recipe.macros.protein_g)}g B</span>
                  <span>{Math.round(recipe.macros.carbs_g)}g W</span>
                  <span>{Math.round(recipe.macros.fat_g)}g T</span>
                  <span className="text-emerald-600 dark:text-emerald-400">{Math.round((recipe.macros.iron_mg ?? 0) * 10) / 10}mg Fe</span>
                </p>
              )}
              {recipe.ingredients.length > 0 && (
                <div className="mb-4">
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">{pl.print.ingredients}</p>
                  <ul className="space-y-0.5 text-sm text-gray-700 dark:text-gray-300">
                    {recipe.ingredients.map((ing, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-gray-400">•</span>
                        <span>{ing.amount ? <strong>{ing.amount}{ing.unit ? ` ${ing.unit}` : ''} </strong> : null}{ing.name}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {recipe.steps.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">{pl.print.steps}</p>
                  <ol className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
                    {recipe.steps.map((s, i) => (
                      <li key={i} className="flex gap-2"><span className="shrink-0 font-semibold text-gray-400">{i + 1}.</span><span>{s}</span></li>
                    ))}
                  </ol>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
