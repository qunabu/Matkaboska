import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { pantryApi } from '../lib/api'
import pl from '../i18n/pl'

export default function PantryPage() {
  const qc = useQueryClient()
  const [name, setName] = useState('')

  const { data, isLoading } = useQuery({ queryKey: ['pantry'], queryFn: () => pantryApi.list() })
  const items = data?.items ?? []

  const add = useMutation({
    mutationFn: () => pantryApi.create(name.trim()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pantry'] }); setName('') },
  })
  const remove = useMutation({
    mutationFn: (id: number) => pantryApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pantry'] }),
  })

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">🥫 {pl.pantry.title}</h1>
      <p className="text-xs text-gray-400">{pl.pantry.hint}</p>

      <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && name.trim() && add.mutate()}
            placeholder={pl.pantry.placeholder}
            className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />
          <button
            onClick={() => add.mutate()}
            disabled={add.isPending || !name.trim()}
            className="rounded-xl bg-primary-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {add.isPending ? '…' : pl.common.add}
          </button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-gray-500">{pl.common.loading}</p>
      ) : items.length === 0 ? (
        <p className="py-4 text-center text-gray-400">{pl.pantry.empty}</p>
      ) : (
        <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
          {items.map((it, idx) => (
            <div
              key={it.id}
              className={`flex items-center gap-3 px-4 py-3 ${idx < items.length - 1 ? 'border-b border-gray-50 dark:border-gray-700' : ''}`}
            >
              <span className="flex-1 text-sm text-gray-900 dark:text-gray-100">🥫 {it.name}</span>
              <button
                onClick={() => { if (confirm(pl.pantry.deleteConfirm)) remove.mutate(it.id) }}
                className="shrink-0 text-gray-300 hover:text-red-400"
                aria-label={pl.common.delete}
              >
                🗑
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
