import { useEffect, useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { onboardingApi } from '../lib/api'
import pl from '../i18n/pl'

export default function StarterImportModal({ onClose, onImported }: { onClose: () => void; onImported: (n: number) => void }) {
  const { data, isLoading } = useQuery({ queryKey: ['starter-recipes'], queryFn: () => onboardingApi.starterRecipes() })
  const items = data?.items ?? []
  const owned = new Set(data?.mineSlugs ?? [])
  const importable = items.filter((i) => !owned.has(i.slug))

  const [selected, setSelected] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (data) setSelected(new Set(data.items.filter((i) => !new Set(data.mineSlugs).has(i.slug)).map((i) => i.slug)))
  }, [data])

  const allSelected = importable.length > 0 && importable.every((i) => selected.has(i.slug))
  const toggle = (slug: string) => setSelected((prev) => { const n = new Set(prev); n.has(slug) ? n.delete(slug) : n.add(slug); return n })
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(importable.map((i) => i.slug)))

  const importMut = useMutation({
    mutationFn: () => onboardingApi.importStarter([...selected]),
    onSuccess: (r) => onImported(r.imported),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm md:items-center" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white md:max-w-lg md:rounded-2xl dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{pl.onboarding.pickTitle}</h3>
          <button onClick={onClose} className="text-2xl leading-none text-gray-400">×</button>
        </div>

        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2 dark:border-gray-800">
          <button onClick={toggleAll} className="text-xs font-medium text-primary-600 dark:text-primary-400">
            {allSelected ? pl.onboarding.deselectAll : pl.onboarding.selectAll}
          </button>
          <span className="text-xs text-gray-400">{pl.onboarding.selectedCount(selected.size, importable.length)}</span>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <p className="p-8 text-center text-sm text-gray-400">{pl.common.loading}</p>
          ) : (
            <ul className="divide-y divide-gray-50 dark:divide-gray-800">
              {items.map((r) => {
                const has = owned.has(r.slug)
                const checked = has || selected.has(r.slug)
                return (
                  <li key={r.slug}>
                    <label className={`flex cursor-pointer items-center gap-3 px-4 py-2.5 ${has ? 'opacity-50' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                      <input type="checkbox" checked={checked} disabled={has} onChange={() => toggle(r.slug)}
                        className="h-4 w-4 shrink-0 accent-primary-600" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-gray-800 dark:text-gray-100">{r.title}</span>
                        <span className="text-[11px] text-gray-400">
                          {Math.round(r.kcal)} kcal · {Math.round(r.protein_g)}g B · {Math.round(r.iron_mg * 10) / 10}mg Fe
                          {has ? ` · ${pl.onboarding.alreadyHave}` : ''}
                        </span>
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-gray-100 p-3 dark:border-gray-800">
          <button
            onClick={() => importMut.mutate()}
            disabled={selected.size === 0 || importMut.isPending}
            className="w-full rounded-xl bg-primary-600 py-3 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {importMut.isPending ? pl.onboarding.importing : pl.onboarding.importSelected(selected.size)}
          </button>
        </div>
      </div>
    </div>
  )
}
