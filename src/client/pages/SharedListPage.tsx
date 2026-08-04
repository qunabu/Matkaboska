import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { shoppingApi } from '../lib/api'
import pl from '../i18n/pl'
import type { ShopCategory, ShoppingItem, ShoppingList } from '../../shared/types'

const CAT_LABELS: Record<ShopCategory, string> = {
  produce: pl.shopping.categories.produce,
  dairy: pl.shopping.categories.dairy,
  pantry: pl.shopping.categories.pantry,
  frozen: pl.shopping.categories.frozen,
  other: pl.shopping.categories.other,
}
const CAT_ORDER: ShopCategory[] = ['produce', 'dairy', 'pantry', 'frozen', 'other']

export default function SharedListPage() {
  const { token } = useParams<{ token: string }>()
  const qc = useQueryClient()
  const [newItem, setNewItem] = useState('')
  const [showAdd, setShowAdd] = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['shared-list', token],
    queryFn: () => shoppingApi.getShared(token!),
    enabled: !!token,
  })

  type SharedListData = ShoppingList & { items: ShoppingItem[] }

  const addMutation = useMutation({
    mutationFn: (name: string) => shoppingApi.addSharedItem(token!, { name }),
    onMutate: async (name) => {
      await qc.cancelQueries({ queryKey: ['shared-list', token] })
      const previous = qc.getQueryData<SharedListData>(['shared-list', token])
      const tempItem: ShoppingItem = {
        id: -Date.now(),
        list_id: previous?.id ?? 0,
        name,
        checked: false,
        in_frisco: false,
        frisco_product_id: null,
        source: 'manual',
        sort_order: 0,
        quantity: null,
        unit: null,
        category: 'other',
      }
      qc.setQueryData<SharedListData>(['shared-list', token], (old) => {
        if (!old) return old
        return { ...old, items: [...old.items, tempItem] }
      })
      setNewItem('')
      setShowAdd(false)
      return { previous, name }
    },
    onError: (_e, _name, context) => {
      if (context?.previous) qc.setQueryData(['shared-list', token], context.previous)
      if (context?.name) { setNewItem(context.name); setShowAdd(true) }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['shared-list', token] }),
  })

  if (isLoading) return (
    <div className="flex items-center justify-center p-8 text-gray-400">{pl.common.loading}</div>
  )

  if (isError || !data) return (
    <div className="mx-auto max-w-md p-8 text-center">
      <p className="text-2xl">🔗</p>
      <p className="mt-2 font-semibold text-gray-700 dark:text-gray-300">Link wygasł lub jest nieprawidłowy</p>
    </div>
  )

  const items = data.items ?? []
  const byCategory: Record<ShopCategory, typeof items> = {
    produce: [], dairy: [], pantry: [], frozen: [], other: [],
  }
  for (const item of items) {
    byCategory[item.category as ShopCategory]?.push(item)
  }

  return (
    <div className="mx-auto max-w-2xl p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{data.name}</h1>
          <p className="text-xs text-gray-400">{pl.shopping.shareListTitle}</p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white"
        >
          + {pl.shopping.addItem}
        </button>
      </div>

      {showAdd && (
        <div className="mb-4 flex gap-2">
          <input
            autoFocus
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            placeholder={pl.shopping.itemName}
            onKeyDown={(e) => e.key === 'Enter' && newItem.trim() && addMutation.mutate(newItem.trim())}
            className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-primary-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          />
          <button
            onClick={() => newItem.trim() && addMutation.mutate(newItem.trim())}
            disabled={addMutation.isPending}
            className="rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {pl.common.add}
          </button>
        </div>
      )}

      {items.length === 0 && (
        <p className="py-8 text-center text-gray-400">{pl.shopping.empty}</p>
      )}

      {CAT_ORDER.map(cat => {
        const catItems = byCategory[cat]
        if (catItems.length === 0) return null
        return (
          <div key={cat} className="mb-4">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
              {CAT_LABELS[cat]}
            </h2>
            <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
              {catItems.map((item, idx) => (
                <div
                  key={item.id}
                  className={`flex items-center gap-3 px-4 py-3 ${
                    idx < catItems.length - 1 ? 'border-b border-gray-50 dark:border-gray-700' : ''
                  }`}
                >
                  <span className={`flex-1 text-sm ${item.checked ? 'text-gray-300 line-through' : 'text-gray-900 dark:text-gray-100'}`}>
                    {item.name}
                    {item.quantity ? (
                      <span className="ml-1 text-xs text-gray-400">
                        {item.quantity} {item.unit}
                      </span>
                    ) : null}
                  </span>
                  {item.checked && (
                    <span className="text-xs text-green-500">✓</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
