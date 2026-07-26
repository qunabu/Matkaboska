import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { recipesApi } from '../lib/api'
import pl from '../i18n/pl'
import type { Ingredient, Category } from '../../shared/types'

const CATEGORIES: Category[] = ['breakfast', 'lunch', 'dinner', 'snack', 'soup', 'salad', 'smoothie', 'dessert', 'other']
const catLabel = (c: Category) => pl.recipes.categories[c as keyof typeof pl.recipes.categories] ?? c

interface FormState {
  title: string
  category: Category
  servings: number
  prep_minutes: string
  ingredients: Ingredient[]
  steps: string[]
  tags: string
  is_seafood: boolean
  source: string
  notes: string
}

const emptyForm: FormState = {
  title: '',
  category: 'lunch',
  servings: 2,
  prep_minutes: '',
  ingredients: [{ name: '', amount: '', unit: '' }],
  steps: [''],
  tags: '',
  is_seafood: false,
  source: '',
  notes: '',
}

export default function RecipeFormPage() {
  const { id } = useParams<{ id: string }>()
  const isEdit = !!id
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [form, setForm] = useState<FormState>(emptyForm)

  const { data: existing } = useQuery({
    queryKey: ['recipe', Number(id)],
    queryFn: () => recipesApi.get(Number(id)),
    enabled: isEdit,
  })

  useEffect(() => {
    if (existing) {
      setForm({
        title: existing.title,
        category: existing.category,
        servings: existing.servings,
        prep_minutes: existing.prep_minutes?.toString() ?? '',
        ingredients: existing.ingredients.length > 0 ? existing.ingredients : [{ name: '', amount: '', unit: '' }],
        steps: existing.steps.length > 0 ? existing.steps : [''],
        tags: existing.tags.join(', '),
        is_seafood: existing.is_seafood,
        source: existing.source ?? '',
        notes: '',
      })
    }
  }, [existing])

  const saveMutation = useMutation({
    mutationFn: (data: object) => isEdit
      ? recipesApi.update(Number(id), data)
      : recipesApi.create(data),
    onSuccess: (recipe) => {
      qc.invalidateQueries({ queryKey: ['recipes'] })
      if (isEdit) qc.invalidateQueries({ queryKey: ['recipe', Number(id)] })
      navigate(`/recipes/${recipe.id}`)
    },
  })

  function setIng(i: number, field: keyof Ingredient, value: string) {
    setForm(f => ({
      ...f,
      ingredients: f.ingredients.map((ing, idx) => idx === i ? { ...ing, [field]: value } : ing),
    }))
  }

  function setStep(i: number, value: string) {
    setForm(f => ({ ...f, steps: f.steps.map((s, idx) => idx === i ? value : s) }))
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    saveMutation.mutate({
      title: form.title,
      category: form.category,
      servings: form.servings,
      prep_minutes: form.prep_minutes ? Number(form.prep_minutes) : null,
      ingredients: form.ingredients.filter(i => i.name.trim()),
      steps: form.steps.filter(s => s.trim()),
      tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
      is_seafood: form.is_seafood,
      source: form.source || null,
    })
  }

  return (
    <div className="mx-auto max-w-2xl p-4">
      <Link to={isEdit ? `/recipes/${id}` : '/recipes'} className="mb-4 block text-sm text-gray-400 hover:text-gray-600">
        ← {pl.common.back}
      </Link>
      <h1 className="mb-4 text-2xl font-bold text-gray-900 dark:text-gray-100">
        {isEdit ? pl.common.edit : pl.recipes.new}
      </h1>

      <form onSubmit={submit} className="space-y-4">
        {/* Title */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{pl.recipes.titleLabel}</label>
          <input
            required
            value={form.title}
            onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
            className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-primary-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          />
        </div>

        {/* Category + servings */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{pl.recipes.category}</label>
            <select
              value={form.category}
              onChange={(e) => setForm(f => ({ ...f, category: e.target.value as Category }))}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            >
              {CATEGORIES.map(c => <option key={c} value={c}>{catLabel(c)}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{pl.recipes.servingsLabel}</label>
            <input
              type="number" min="1" max="20"
              value={form.servings}
              onChange={(e) => setForm(f => ({ ...f, servings: Number(e.target.value) }))}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            />
          </div>
        </div>

        {/* Prep + seafood */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{pl.recipes.prepLabel}</label>
            <input
              type="number" min="0"
              value={form.prep_minutes}
              onChange={(e) => setForm(f => ({ ...f, prep_minutes: e.target.value }))}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            />
          </div>
          <div className="flex items-center gap-2 pt-6">
            <input
              type="checkbox"
              id="seafood"
              checked={form.is_seafood}
              onChange={(e) => setForm(f => ({ ...f, is_seafood: e.target.checked }))}
              className="h-4 w-4 rounded"
            />
            <label htmlFor="seafood" className="text-sm text-gray-700 dark:text-gray-300">
              🐟 {pl.recipes.seafoodLabel}
            </label>
          </div>
        </div>

        {/* Ingredients */}
        <div>
          <h2 className="mb-2 font-semibold text-gray-900 dark:text-gray-100">{pl.recipes.ingredients}</h2>
          <div className="space-y-2">
            {form.ingredients.map((ing, i) => (
              <div key={i} className="flex gap-2">
                <input
                  placeholder={pl.recipes.name}
                  value={ing.name}
                  onChange={(e) => setIng(i, 'name', e.target.value)}
                  className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                />
                <input
                  placeholder={pl.recipes.amount}
                  value={ing.amount}
                  onChange={(e) => setIng(i, 'amount', e.target.value)}
                  className="w-20 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                />
                <input
                  placeholder={pl.recipes.unit}
                  value={ing.unit}
                  onChange={(e) => setIng(i, 'unit', e.target.value)}
                  className="w-16 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                />
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, ingredients: f.ingredients.filter((_, idx) => idx !== i) }))}
                  className="text-red-400 hover:text-red-600"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setForm(f => ({ ...f, ingredients: [...f.ingredients, { name: '', amount: '', unit: '' }] }))}
            className="mt-2 text-sm text-primary-600 hover:underline"
          >
            + {pl.recipes.addIngredient}
          </button>
        </div>

        {/* Steps */}
        <div>
          <h2 className="mb-2 font-semibold text-gray-900 dark:text-gray-100">{pl.recipes.steps}</h2>
          <div className="space-y-2">
            {form.steps.map((step, i) => (
              <div key={i} className="flex gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-bold dark:bg-gray-700">
                  {i + 1}
                </span>
                <textarea
                  rows={2}
                  value={step}
                  placeholder={pl.recipes.stepPlaceholder}
                  onChange={(e) => setStep(i, e.target.value)}
                  className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                />
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, steps: f.steps.filter((_, idx) => idx !== i) }))}
                  className="text-red-400 hover:text-red-600"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setForm(f => ({ ...f, steps: [...f.steps, ''] }))}
            className="mt-2 text-sm text-primary-600 hover:underline"
          >
            + {pl.recipes.addStep}
          </button>
        </div>

        {/* Tags */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{pl.recipes.tags}</label>
          <input
            value={form.tags}
            onChange={(e) => setForm(f => ({ ...f, tags: e.target.value }))}
            placeholder="śniadanie, fit, szybkie"
            className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-primary-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={saveMutation.isPending}
            className="flex-1 rounded-xl bg-primary-600 py-3 font-semibold text-white disabled:opacity-50 hover:bg-primary-700"
          >
            {saveMutation.isPending ? '…' : pl.common.save}
          </button>
          <Link
            to={isEdit ? `/recipes/${id}` : '/recipes'}
            className="flex-1 rounded-xl bg-gray-100 py-3 text-center font-semibold text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300"
          >
            {pl.common.cancel}
          </Link>
        </div>
      </form>
    </div>
  )
}
