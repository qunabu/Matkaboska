import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { shoppingApi } from '../lib/api'
import pl from '../i18n/pl'

export default function FriscoSearchModal({ item, onClose, onPicked }: {
  item: { id: number; name: string }
  onClose: () => void
  onPicked: () => void
}) {
  const [q, setQ] = useState(item.name)
  const [query, setQuery] = useState(item.name)

  const { data, isFetching, isError } = useQuery({
    queryKey: ['frisco-search', query],
    queryFn: () => shoppingApi.friscoSearch(query),
    enabled: !!query.trim(),
  })
  const pickMut = useMutation({
    mutationFn: (productId: string) => shoppingApi.friscoPickItem(item.id, productId),
    onSuccess: onPicked,
  })
  const results = data?.items ?? []

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm md:items-center" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white md:max-w-lg md:rounded-2xl dark:bg-gray-900" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-800">
          <h3 className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{pl.shopping.friscoSearchTitle}: {item.name}</h3>
          <button onClick={onClose} className="ml-2 shrink-0 text-2xl leading-none text-gray-400">×</button>
        </div>

        <form
          className="flex gap-2 border-b border-gray-100 p-3 dark:border-gray-800"
          onSubmit={(e) => { e.preventDefault(); setQuery(q.trim()) }}
        >
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={pl.shopping.friscoSearchPlaceholder}
            className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          />
          <button type="submit" className="rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700">
            {pl.common.search}
          </button>
        </form>

        <div className="flex-1 overflow-y-auto">
          {isFetching ? (
            <p className="p-8 text-center text-sm text-gray-400">{pl.common.loading}</p>
          ) : isError ? (
            <p className="p-8 text-center text-sm text-red-500">{pl.shopping.friscoSearchError}</p>
          ) : results.length === 0 ? (
            <p className="p-8 text-center text-sm text-gray-400">{pl.shopping.friscoNoResults}</p>
          ) : (
            <ul className="divide-y divide-gray-50 dark:divide-gray-800">
              {results.map((r) => {
                const disabled = !r.available || !r.allowed || pickMut.isPending
                return (
                  <li key={r.productId} className="flex items-center gap-2 px-4 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-gray-800 dark:text-gray-100">{r.name}</span>
                      <span className="text-[11px] text-gray-400">
                        {r.available ? pl.shopping.friscoAvailable : pl.shopping.friscoUnavailable}
                        {!r.allowed ? ` · ${pl.shopping.friscoBlocked}` : ''}
                        {' · '}
                        <a href={`https://www.frisco.pl/pid,${r.productId}/stn,product`} target="_blank" rel="noopener noreferrer" className="underline hover:opacity-70">
                          {pl.shopping.friscoOpenProduct} ↗
                        </a>
                      </span>
                    </span>
                    <button
                      onClick={() => pickMut.mutate(r.productId)}
                      disabled={disabled}
                      className="shrink-0 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-40"
                    >
                      🛒 {pl.shopping.friscoAddToCart}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
