import { useState } from 'react'
import { Routes, Route, Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { shoppingApi, todayDate, addDays } from '../lib/api'
import type { FriscoOrderResult } from '../lib/api'
import pl from '../i18n/pl'
import type { ShoppingItem, ShopCategory } from '../../shared/types'
import FriscoSearchModal from '../components/FriscoSearchModal'
import RecipeModal from '../components/RecipeModal'

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
  const [showShare, setShowShare] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)
  const [orderResult, setOrderResult] = useState<FriscoOrderResult | null>(null)
  const [friscoSearch, setFriscoSearch] = useState<{ id: number; name: string } | null>(null)
  const [recipeModal, setRecipeModal] = useState<{ id: number; title: string; slug: string }[] | null>(null)
  const orderMutation = useMutation({
    mutationFn: () => shoppingApi.friscoOrder(listId),
    onSuccess: (r) => { setOrderResult(r); qc.invalidateQueries({ queryKey: ['shopping-list', listId] }) },
  })

  // "Mam w domu": move to pantry, drop from Frisco cart, remove from list.
  const haveAtHomeMutation = useMutation({
    mutationFn: (id: number) => shoppingApi.haveAtHome(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shopping-list', listId] })
      qc.invalidateQueries({ queryKey: ['pantry'] })
    },
    onError: (e) => alert((e as Error).message),
  })

  const { data, isLoading } = useQuery({
    queryKey: ['shopping-list', listId],
    queryFn: () => shoppingApi.getList(listId),
  })
  const { data: sourcesData } = useQuery({
    queryKey: ['recipe-sources', listId],
    queryFn: () => shoppingApi.recipeSources(listId),
    staleTime: 60_000,
  })
  const recipeSources = sourcesData?.sources ?? {}

  const toggleMutation = useMutation({
    mutationFn: ({ id, checked }: { id: number; checked: boolean }) =>
      shoppingApi.updateItem(id, { checked }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shopping-list', listId] }),
  })

  // Toggling the 🛒 checkbox actually adds/removes the product in the Frisco
  // cart via the API (not just a local flag).
  const friscoToggleMutation = useMutation({
    mutationFn: ({ id, in_frisco }: { id: number; in_frisco: boolean }) =>
      shoppingApi.friscoSetItem(id, in_frisco),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shopping-list', listId] }),
    onError: (e) => alert((e as Error).message),
  })

  // Mark every in-Frisco item as bought (checked) in one go.
  const checkFriscoMutation = useMutation({
    mutationFn: () => shoppingApi.checkFrisco(listId),
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

  const shareMutation = useMutation({
    mutationFn: () => shoppingApi.shareList(listId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shopping-list', listId] }),
  })

  const revokeMutation = useMutation({
    mutationFn: () => shoppingApi.revokeShare(listId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shopping-list', listId] })
      setShowShare(false)
    },
  })

  function copyShareLink(token: string) {
    const url = `${window.location.origin}/s/${token}`
    navigator.clipboard.writeText(url).then(() => {
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 2000)
    })
  }

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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{data.name}</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowShare(!showShare)}
            className={`rounded-lg px-3 py-2 text-sm font-medium text-white ${data.share_token ? 'bg-amber-500' : 'bg-gray-500'}`}
          >
            🔗 {pl.shopping.share}
          </button>
          <button
            onClick={() => { setOrderResult(null); orderMutation.mutate() }}
            disabled={orderMutation.isPending}
            className="rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            🛒 {orderMutation.isPending ? pl.shopping.friscoServerBusy : pl.shopping.frisco}
          </button>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white"
          >
            + {pl.shopping.addItem}
          </button>
        </div>
      </div>

      {showShare && (
        <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
          <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">{pl.shopping.shareTitle}</p>
          <p className="mb-3 text-xs text-gray-500">{pl.shopping.shareHint}</p>
          {data.share_token ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  readOnly
                  value={`${window.location.origin}/s/${data.share_token}`}
                  className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-300"
                />
                <button
                  onClick={() => copyShareLink(data.share_token!)}
                  className="rounded-lg bg-primary-600 px-3 py-2 text-xs font-medium text-white"
                >
                  {shareCopied ? pl.shopping.shareCopied : pl.shopping.shareCopy}
                </button>
              </div>
              <button
                onClick={() => { if (confirm(pl.shopping.shareRevokeConfirm)) revokeMutation.mutate() }}
                disabled={revokeMutation.isPending}
                className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40"
              >
                {pl.shopping.shareRevoke}
              </button>
            </div>
          ) : (
            <button
              onClick={() => shareMutation.mutate()}
              disabled={shareMutation.isPending}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {shareMutation.isPending ? '…' : `🔗 ${pl.shopping.share}`}
            </button>
          )}
        </div>
      )}

      {orderMutation.isError && (
        <p className="mb-3 text-sm text-red-500">{(orderMutation.error as Error).message}</p>
      )}
      {orderResult && (
        <div className="mb-4 space-y-2 rounded-xl border border-primary-200 bg-primary-50 p-3 text-xs dark:border-primary-900 dark:bg-primary-950/40">
          <p className="font-medium text-gray-800 dark:text-gray-100">
            {pl.shopping.friscoServerInCart}: {orderResult.inCart}/{orderResult.total}
          </p>
          {orderResult.notFound.length > 0 && (
            <div>
              <p className="font-medium text-red-500">❗ {pl.shopping.friscoServerNotFound} ({orderResult.notFound.length}):</p>
              <ul className="ml-4 list-disc text-gray-600 dark:text-gray-300">
                {orderResult.notFound.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            </div>
          )}
          {orderResult.removedUnavailable.length > 0 && (
            <div>
              <p className="font-medium text-amber-600 dark:text-amber-400">⚠️ {pl.shopping.friscoServerRemoved} ({orderResult.removedUnavailable.length}):</p>
              <ul className="ml-4 list-disc text-gray-600 dark:text-gray-300">
                {orderResult.removedUnavailable.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            </div>
          )}
          {orderResult.skipped.length > 0 && (
            <div>
              <p className="font-medium text-gray-500">🚫 {pl.shopping.friscoServerSkipped} ({orderResult.skipped.length}):</p>
              <ul className="ml-4 list-disc text-gray-500 dark:text-gray-400">
                {orderResult.skipped.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            </div>
          )}
          <p className="text-gray-500 dark:text-gray-400">{pl.shopping.friscoServerDone}</p>
        </div>
      )}

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

      {items.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1 text-xs text-gray-400">
            🛒 {pl.shopping.inFriscoLegend} — {items.filter((i) => i.in_frisco).length}/{items.length}
          </p>
          {items.some((i) => i.in_frisco && !i.checked) && (
            <button
              onClick={() => checkFriscoMutation.mutate()}
              disabled={checkFriscoMutation.isPending}
              className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
            >
              ✓ {pl.shopping.checkFriscoBought}
            </button>
          )}
        </div>
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
                    {item.quantity ? (
                      <span className="ml-1 text-xs text-gray-400">
                        {item.quantity} {item.unit}
                      </span>
                    ) : null}
                    {recipeSources[item.id]?.length ? (
                      <button
                        onClick={() => setRecipeModal(recipeSources[item.id])}
                        title={pl.shopping.showRecipe}
                        className="ml-1.5 align-middle text-gray-400 hover:text-primary-600 dark:hover:text-primary-400"
                      >
                        📖
                      </button>
                    ) : null}
                  </span>
                  <span
                    className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium ${
                      item.in_frisco
                        ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                        : 'bg-gray-50 text-gray-400 dark:bg-gray-700/40'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={item.in_frisco}
                      disabled={friscoToggleMutation.isPending && friscoToggleMutation.variables?.id === item.id}
                      onChange={(e) => friscoToggleMutation.mutate({ id: item.id, in_frisco: e.target.checked })}
                      title={pl.shopping.inFriscoLabel}
                      className="h-4 w-4 rounded border-gray-300 text-green-600 disabled:opacity-40"
                    />
                    {item.frisco_product_id ? (
                      <a
                        href={`https://www.frisco.pl/pid,${item.frisco_product_id}/stn,product`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={pl.shopping.friscoOpenProduct}
                        className="hover:opacity-70"
                      >
                        🛒↗
                      </a>
                    ) : (
                      <span title={pl.shopping.inFriscoLabel}>🛒</span>
                    )}
                  </span>
                  <button
                    onClick={() => setFriscoSearch({ id: item.id, name: item.name })}
                    title={pl.shopping.friscoSearchTitle}
                    className="shrink-0 rounded-lg bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-primary-100 hover:text-primary-700 dark:bg-gray-700 dark:text-gray-200"
                  >
                    🔍
                  </button>
                  <button
                    onClick={() => haveAtHomeMutation.mutate(item.id)}
                    disabled={haveAtHomeMutation.isPending && haveAtHomeMutation.variables === item.id}
                    title={pl.shopping.haveAtHomeTitle}
                    className="shrink-0 rounded-lg bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-green-100 hover:text-green-700 disabled:opacity-40 dark:bg-gray-700 dark:text-gray-200"
                  >
                    🏠 {pl.shopping.haveAtHome}
                  </button>
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

      {friscoSearch && (
        <FriscoSearchModal
          item={friscoSearch}
          onClose={() => setFriscoSearch(null)}
          onPicked={() => { setFriscoSearch(null); qc.invalidateQueries({ queryKey: ['shopping-list', listId] }) }}
        />
      )}
      {recipeModal && (
        <RecipeModal recipes={recipeModal} onClose={() => setRecipeModal(null)} />
      )}
    </div>
  )
}

interface GenerateFormProps {
  onClose: () => void
}

function GenerateForm({ onClose }: GenerateFormProps) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [from, setFrom] = useState(todayDate())
  const [to, setTo] = useState(addDays(todayDate(), 6))
  const [name, setName] = useState('')

  const mutation = useMutation({
    mutationFn: () => shoppingApi.generateList(from, to, name || undefined),
    onSuccess: (list) => {
      qc.invalidateQueries({ queryKey: ['shopping-lists'] })
      onClose()
      navigate(`/shopping/${list.id}`)
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

// Detail route: /shopping/:id — gives every list its own shareable URL.
function ListDetailRoute() {
  const { id } = useParams()
  const navigate = useNavigate()
  return <ListDetail listId={Number(id)} onBack={() => navigate('/shopping')} />
}

export default function ShoppingPage() {
  return (
    <Routes>
      <Route index element={<ShoppingOverview />} />
      <Route path=":id" element={<ListDetailRoute />} />
    </Routes>
  )
}

function ShoppingOverview() {
  const qc = useQueryClient()
  const navigate = useNavigate()
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
      navigate(`/shopping/${list.id}`)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => shoppingApi.deleteList(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shopping-lists'] }),
  })

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
              <Link
                to={`/shopping/${list.id}`}
                className="flex-1 text-left"
              >
                <p className="font-semibold text-gray-900 dark:text-gray-100">{list.name}</p>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                  <div className="h-full rounded-full bg-green-400 transition-all" style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  {checked} / {total} {pl.shopping.items}
                </p>
              </Link>
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
