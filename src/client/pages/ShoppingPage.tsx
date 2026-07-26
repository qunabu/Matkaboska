import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { shoppingApi, todayDate, addDays } from '../lib/api'
import pl from '../i18n/pl'
import type { ShoppingItem, ShopCategory } from '../../shared/types'

const CAT_LABELS: Record<ShopCategory, string> = {
  produce: pl.shopping.categories.produce,
  dairy: pl.shopping.categories.dairy,
  pantry: pl.shopping.categories.pantry,
  frozen: pl.shopping.categories.frozen,
  other: pl.shopping.categories.other,
}

const CAT_ORDER: ShopCategory[] = ['produce', 'dairy', 'pantry', 'frozen', 'other']

function ListDetail({ listId, onBack }: { listId: number; onBack: () => void }) {
  const qc = useQueryClient()
  const [newItem, setNewItem] = useState('')
  const [showAdd, setShowAdd] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['shopping-list', listId],
    queryFn: () => shoppingApi.getList(listId),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, checked }: { id: number; checked: boolean }) =>
      shoppingApi.updateItem(id, { checked }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shopping-list', listId] }),
  })

  const addMutation = useMutation({
    mutationFn: (name: string) => shoppingApi.addItem({ list_id: listId, name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shopping-list', listId] })
      setNewItem('')
      setShowAdd(false)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => shoppingApi.deleteItem(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shopping-list', listId] }),
  })

  if (isLoading) return <p className="p-4 text-gray-500">{pl.common.loading}</p>
  if (!data) return null

  const items = data.items ?? []
  const allChecked = items.length > 0 && items.every(i => i.checked)

  const byCategory: Record<ShopCategory, ShoppingItem[]> = {
    produce: [], dairy: [], pantry: [], frozen: [], other: [],
  }
  for (const item of items) {
    byCategory[item.category]?.push(item)
  }

  return (
    <div className="mx-auto max-w-2xl p-4">
      <button onClick={onBack} className="mb-4 block text-sm text-gray-400 hover:text-gray-600">
        ← {pl.common.back}
      </button>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{data.name}</h1>
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
            className="rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-medium text-white"
          >
            {pl.common.add}
          </button>
        </div>
      )}

      {items.length === 0 && (
        <p className="py-8 text-center text-gray-400">{pl.shopping.empty}</p>
      )}

      {allChecked && items.length > 0 && (
        <p className="mb-4 rounded-xl bg-green-50 p-3 text-center text-sm font-medium text-green-700 dark:bg-green-900/20 dark:text-green-400">
          {pl.shopping.allChecked}
        </p>
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
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={(e) => toggleMutation.mutate({ id: item.id, checked: e.target.checked })}
                    className="h-5 w-5 rounded border-gray-300 text-primary-600"
                  />
                  <span className={`flex-1 text-sm ${item.checked ? 'text-gray-300 line-through' : 'text-gray-900 dark:text-gray-100'}`}>
                    {item.name}
                    {item.quantity && (
                      <span className="ml-1 text-xs text-gray-400">
                        {item.quantity} {item.unit}
                      </span>
                    )}
                  </span>
                  <button
                    onClick={() => deleteMutation.mutate(item.id)}
                    className="text-gray-300 hover:text-red-400"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

interface GenerateFormProps {
  onClose: () => void
}

function GenerateForm({ onClose }: GenerateFormProps) {
  const qc = useQueryClient()
  const [from, setFrom] = useState(todayDate())
  const [to, setTo] = useState(addDays(todayDate(), 6))
  const [name, setName] = useState('')

  const mutation = useMutation({
    mutationFn: () => shoppingApi.generateList(from, to, name || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shopping-lists'] })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40 md:items-center" onClick={onClose}>
      <div
        className="w-full rounded-t-2xl bg-white p-4 md:max-w-sm md:mx-auto md:rounded-2xl dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-3 font-semibold text-gray-900 dark:text-gray-100">{pl.shopping.generate}</h3>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-gray-500">{pl.shopping.generateFrom}</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">{pl.shopping.generateTo}</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
          </div>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={pl.shopping.newName}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
        </div>
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="flex-1 rounded-xl bg-primary-600 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {mutation.isPending ? '…' : pl.shopping.generate}
          </button>
          <button onClick={onClose} className="flex-1 rounded-xl bg-gray-100 py-2.5 text-sm text-gray-600 dark:bg-gray-700">
            {pl.common.cancel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ShoppingPage() {
  const qc = useQueryClient()
  const [selectedList, setSelectedList] = useState<number | null>(null)
  const [showNewForm, setShowNewForm] = useState(false)
  const [showGenerate, setShowGenerate] = useState(false)
  const [newListName, setNewListName] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['shopping-lists'],
    queryFn: () => shoppingApi.lists(),
  })

  const createMutation = useMutation({
    mutationFn: (name: string) => shoppingApi.createList(name),
    onSuccess: (list) => {
      qc.invalidateQueries({ queryKey: ['shopping-lists'] })
      setNewListName('')
      setShowNewForm(false)
      setSelectedList(list.id)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => shoppingApi.deleteList(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shopping-lists'] }),
  })

  if (selectedList !== null) {
    return <ListDetail listId={selectedList} onBack={() => setSelectedList(null)} />
  }

  const lists = data?.items ?? []

  return (
    <div className="mx-auto max-w-2xl p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{pl.shopping.title}</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowGenerate(true)}
            className="rounded-lg bg-green-500 px-3 py-2 text-sm font-medium text-white"
          >
            🗓 {pl.shopping.generate}
          </button>
          <button
            onClick={() => setShowNewForm(!showNewForm)}
            className="rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white"
          >
            + {pl.shopping.new}
          </button>
        </div>
      </div>

      {showNewForm && (
        <div className="mb-4 flex gap-2">
          <input
            autoFocus
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            placeholder={pl.shopping.newName}
            onKeyDown={(e) => e.key === 'Enter' && newListName.trim() && createMutation.mutate(newListName.trim())}
            className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-primary-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          />
          <button
            onClick={() => newListName.trim() && createMutation.mutate(newListName.trim())}
            className="rounded-xl bg-primary-600 px-4 text-sm font-medium text-white"
          >
            {pl.common.add}
          </button>
        </div>
      )}

      {isLoading && <p className="text-gray-500">{pl.common.loading}</p>}

      <div className="space-y-3">
        {lists.map((list) => {
          const total = list.item_count ?? 0
          const checked = list.checked_count ?? 0
          const pct = total > 0 ? Math.round((checked / total) * 100) : 0
          return (
            <div
              key={list.id}
              className="flex items-center gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700"
            >
              <button
                onClick={() => setSelectedList(list.id)}
                className="flex-1 text-left"
              >
                <p className="font-semibold text-gray-900 dark:text-gray-100">{list.name}</p>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                  <div className="h-full rounded-full bg-green-400 transition-all" style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  {checked} / {total} {pl.shopping.items}
                </p>
              </button>
              <button
                onClick={() => { if (confirm(pl.shopping.deleteConfirm)) deleteMutation.mutate(list.id) }}
                className="shrink-0 text-gray-300 hover:text-red-400"
              >
                🗑
              </button>
            </div>
          )
        })}
        {!isLoading && lists.length === 0 && (
          <p className="py-8 text-center text-gray-400">{pl.common.noResults}</p>
        )}
      </div>

      {showGenerate && <GenerateForm onClose={() => setShowGenerate(false)} />}
    </div>
  )
}
