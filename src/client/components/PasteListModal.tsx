import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { shoppingApi } from '../lib/api'
import pl from '../i18n/pl'
import type { ParsedShoppingItem, ShopCategory } from '../../shared/types'

const CAT_LABELS: Record<ShopCategory, string> = {
  produce: pl.shopping.categories.produce,
  dairy: pl.shopping.categories.dairy,
  pantry: pl.shopping.categories.pantry,
  frozen: pl.shopping.categories.frozen,
  other: pl.shopping.categories.other,
}

// Paste a blob → review what was recognised → add the chosen items. The review
// step exists because the model does misread things, and a shopping list that
// silently gains ghost items is worse than one you had to correct.
export default function PasteListModal({ listId, onClose, onAdded }: {
  listId: number
  onClose: () => void
  onAdded: (added: number) => void
}) {
  const [text, setText] = useState('')
  const [parsed, setParsed] = useState<ParsedShoppingItem[] | null>(null)
  const [parsedBy, setParsedBy] = useState<'llm' | 'split'>('llm')
  const [selected, setSelected] = useState<Set<number>>(new Set())

  const parseMut = useMutation({
    mutationFn: () => shoppingApi.parseText(listId, text.trim()),
    onSuccess: (r) => {
      setParsed(r.items)
      setParsedBy(r.parsed_by)
      // Anything already on the list starts unchecked — no accidental doubles.
      setSelected(new Set(r.items.map((it, i) => it.duplicate ? -1 : i).filter((i) => i >= 0)))
    },
  })

  const addMut = useMutation({
    mutationFn: () => shoppingApi.addItemsBulk(
      listId,
      (parsed ?? []).filter((_, i) => selected.has(i))
        .map(({ name, quantity, unit, category }) => ({ name, quantity, unit, category })),
    ),
    onSuccess: (r) => onAdded(r.added),
  })

  function toggle(i: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i); else next.add(i)
      return next
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm md:items-center" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white md:max-w-lg md:rounded-2xl dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-800">
          <h3 className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{pl.shopping.pasteTitle}</h3>
          <button onClick={onClose} className="ml-2 shrink-0 text-2xl leading-none text-gray-400">×</button>
        </div>

        {parsed === null ? (
          <>
            <div className="flex-1 overflow-y-auto p-4">
              <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{pl.shopping.pasteHint}</p>
              <textarea
                autoFocus
                rows={9}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={pl.shopping.pastePlaceholder}
                className="w-full resize-y rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              />
              {parseMut.isError && (
                <p className="mt-2 text-sm text-red-500">{(parseMut.error as Error).message}</p>
              )}
            </div>
            <div className="border-t border-gray-100 p-3 dark:border-gray-800">
              <button
                onClick={() => parseMut.mutate()}
                disabled={!text.trim() || parseMut.isPending}
                className="w-full rounded-xl bg-primary-600 py-2.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {parseMut.isPending ? pl.shopping.pasteParsing : `✨ ${pl.shopping.pasteParse}`}
              </button>
            </div>
          </>
        ) : parsed.length === 0 ? (
          <>
            <p className="flex-1 p-8 text-center text-sm text-gray-400">{pl.shopping.pasteNothing}</p>
            <div className="border-t border-gray-100 p-3 dark:border-gray-800">
              <button
                onClick={() => setParsed(null)}
                className="w-full rounded-xl bg-gray-100 py-2.5 text-sm text-gray-600 dark:bg-gray-700 dark:text-gray-200"
              >
                ← {pl.shopping.pasteBack}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto">
              <div className="px-4 pt-3">
                <p className="text-xs text-gray-500 dark:text-gray-400">{pl.shopping.pasteReview(parsed.length)}</p>
                {parsedBy === 'split' && (
                  <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">{pl.shopping.pasteParsedBySplit}</p>
                )}
                <div className="mt-2 flex gap-3 text-[11px] text-primary-600 dark:text-primary-400">
                  <button onClick={() => setSelected(new Set(parsed.map((_, i) => i)))}>{pl.shopping.pasteSelectAll}</button>
                  <button onClick={() => setSelected(new Set())}>{pl.shopping.pasteSelectNone}</button>
                </div>
              </div>
              <ul className="mt-2 divide-y divide-gray-50 dark:divide-gray-800">
                {parsed.map((it, i) => (
                  <li key={i} className="flex items-center gap-3 px-4 py-2.5">
                    <input
                      type="checkbox"
                      checked={selected.has(i)}
                      onChange={() => toggle(i)}
                      className="h-5 w-5 shrink-0 rounded border-gray-300 text-primary-600"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-gray-800 dark:text-gray-100">
                        {it.name}
                        {it.quantity ? (
                          <span className="ml-1 text-xs text-gray-400">{it.quantity} {it.unit}</span>
                        ) : null}
                      </span>
                      <span className="text-[11px] text-gray-400">
                        {CAT_LABELS[it.category]}
                        {it.duplicate ? ` · ${pl.shopping.pasteDuplicate}` : ''}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              {addMut.isError && (
                <p className="px-4 py-2 text-sm text-red-500">{(addMut.error as Error).message}</p>
              )}
            </div>
            <div className="flex gap-2 border-t border-gray-100 p-3 dark:border-gray-800">
              <button
                onClick={() => setParsed(null)}
                className="rounded-xl bg-gray-100 px-4 py-2.5 text-sm text-gray-600 dark:bg-gray-700 dark:text-gray-200"
              >
                ←
              </button>
              <button
                onClick={() => addMut.mutate()}
                disabled={selected.size === 0 || addMut.isPending}
                className="flex-1 rounded-xl bg-primary-600 py-2.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {addMut.isPending ? pl.shopping.pasteAdding : pl.shopping.pasteConfirm(selected.size)}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
