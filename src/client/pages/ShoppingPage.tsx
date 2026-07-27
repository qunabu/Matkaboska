import { useState } from 'react'
import { Routes, Route, Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { shoppingApi, todayDate, addDays } from '../lib/api'
import type { FriscoOrderResult } from '../lib/api'
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

// Build a copy-paste prompt for Claude (with claude-in-chrome) to add the
// list's items to a Frisco basket via Frisco's commerce API and report what it
// couldn't find. Uses the search API + a single cart PUT (auth read from the
// logged-in session cookie) — far more reliable than clicking product tiles.
function buildFriscoPrompt(listName: string, items: ShoppingItem[]): string {
  const names = items.filter((i) => !i.checked).map((i) => i.name)

  const snippet = [
    'const items = ' + JSON.stringify(names) + ';',
    "const c = Object.fromEntries(document.cookie.split('; ').map(x=>{const i=x.indexOf('=');return [x.slice(0,i),x.slice(i+1)]}));",
    "const token = decodeURIComponent(c.sessionIdN||''); const uid = c.userIdN; const WAREHOUSE = 'GDA'; /* kod pocztowy 80-282 */",
    "const HD = {accept:'application/json',authorization:'Bearer '+token,'x-frisco-warehouse':WAREHOUSE,'x-frisco-visitorid':c.sid||'','x-frisco-features':'MarginBoosting=1'};",
    "const H = Object.assign({'content-type':'application/json'}, HD);",
    "const U = '/app/commerce/api/v1/users/'+uid+'/cart';",
    'const avail = p => p && p.isAvailable && p.isStocked && (p.stock==null || p.stock>0);',
    'const clean = r => { let s = r.split("(")[0]; const low = s.toLowerCase(); for (const sep of [" lub "," albo "," oraz ","/"]) { const i = low.indexOf(sep); if (i>=0){ s = s.slice(0,i); break; } } return s.split(" ").filter(Boolean).join(" ").trim(); };',
    '// 1) wyczyść koszyk — PUT tylko dodaje/aktualizuje wskazane produkty, nie zastępuje całości',
    "await fetch(U+'/products',{method:'DELETE',headers:HD});",
    '// 2) wyszukaj i wybierz DOSTĘPNY produkt dla każdej pozycji',
    'const added=[], notFound=[];',
    'for (const raw of items){ const q = clean(raw); try {',
    "  const sr = await fetch('/app/commerce/api/v1/offer/products/query?purpose=Listing&pageIndex=1&search='+encodeURIComponent(q)+'&includeFacets=false&deliveryMethod=Van&pageSize=24&language=pl&disableAutocorrect=false',{headers:{accept:'application/json'}}).then(r=>r.json());",
    '  const pick = (sr.products||[]).find(p=>avail(p.product));',
    '  if (pick) added.push({raw, id:pick.productId, name:pick.product.name.pl}); else notFound.push(raw);',
    "} catch(e){ notFound.push(raw+' (blad)'); } }",
    'const seen=new Set(), products=[]; for (const a of added){ if(!seen.has(a.id)){ seen.add(a.id); products.push({productId:a.id, quantity:1}); } }',
    '// 3) ustaw koszyk = lista (jednym żądaniem PUT, bez contextCookie)',
    "await fetch(U,{method:'PUT',headers:H,body:JSON.stringify({products})});",
    '// 4) koszyk sprawdza dostępność dla konkretnego terminu dostawy — odczytaj go i usuń to, co niedostępne',
    "const cart = await fetch(U,{headers:HD,cache:'no-store'}).then(r=>r.json());",
    'const keep=[], usunieteNiedostepne=[]; for (const it of (cart.products||[])){ (avail(it.product)?keep:usunieteNiedostepne).push(avail(it.product)?{productId:it.productId,quantity:it.quantity||1}:it.product.name.pl); }',
    'if (usunieteNiedostepne.length){ await fetch(U+\'/products\',{method:\'DELETE\',headers:HD}); await fetch(U,{method:\'PUT\',headers:H,body:JSON.stringify({products:keep})}); }',
    'JSON.stringify({ dodano: added.map(a=>a.raw+" -> "+a.name), nieZnaleziono: notFound, usunieteNiedostepne, wKoszyku: keep.length }, null, 1)',
  ].join('\n')

  return [
    `Dodaj produkty do mojego koszyka na Frisco (lista „${listName}", ${names.length} pozycji).`,
    '',
    'Użyj claude-in-chrome. Otwórz https://www.frisco.pl — jestem zalogowany i mam ustawiony kod pocztowy.',
    'Frisco ma własne API — użyj go zamiast klikania w produkty. W karcie Frisco uruchom poniższy kod przez narzędzie javascript_tool. Kod czyta token z sesji, CZYŚCI koszyk, wyszukuje każdą pozycję, wybiera DOSTĘPNY produkt, ustawia koszyk = lista, a następnie usuwa pozycje, które koszyk oznacza jako niedostępne dla wybranego terminu dostawy:',
    '',
    '```js',
    snippet,
    '```',
    '',
    'Potem otwórz koszyk https://www.frisco.pl/koszyk. Jeśli u góry widać ostrzeżenia (np. „nie można go kupić samoistnie", „returnable bag / worek zwrotny", „Produkt wycofany") i przycisk „Usuń niedostępne produkty" — klikaj go, aż zniknie; te pozycje bywają dodawane automatycznie przez Frisco i blokują zamówienie.',
    'Na koniec pokaż mi wynik: „nieZnaleziono" jako WYRAŹNĄ listę brakujących pozycji (najważniejsze), „usunieteNiedostepne" (wyprzedane w tym terminie), oraz skrótowo „dodano" (pozycja -> produkt).',
    'WAŻNE: NIE finalizuj zamówienia i NIE płać — sprawdzę koszyk i kupię sam. Dopasowania bywają przybliżone, więc lista braków i mój przegląd koszyka są kluczowe.',
  ].join('\n')
}

function ListDetail({ listId, onBack }: { listId: number; onBack: () => void }) {
  const qc = useQueryClient()
  const [newItem, setNewItem] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [showFrisco, setShowFrisco] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copiedCmd, setCopiedCmd] = useState(false)
  const [orderResult, setOrderResult] = useState<FriscoOrderResult | null>(null)
  const orderMutation = useMutation({
    mutationFn: () => shoppingApi.friscoOrder(listId),
    onSuccess: (r) => setOrderResult(r),
  })

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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{data.name}</h1>
        <div className="flex gap-2">
          <button
            onClick={() => { setCopied(false); setShowFrisco(true) }}
            className="rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white"
          >
            🛒 {pl.shopping.frisco}
          </button>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white"
          >
            + {pl.shopping.addItem}
          </button>
        </div>
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
                    {item.quantity ? (
                      <span className="ml-1 text-xs text-gray-400">
                        {item.quantity} {item.unit}
                      </span>
                    ) : null}
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

      {showFrisco && (() => {
        const prompt = buildFriscoPrompt(data.name, items)
        return (
          <div
            className="fixed inset-0 z-50 flex items-end bg-black/40 md:items-center md:justify-center"
            onClick={() => setShowFrisco(false)}
          >
            <div
              className="w-full max-h-[88vh] overflow-y-auto rounded-t-2xl bg-white p-4 md:max-w-lg md:rounded-2xl dark:bg-gray-900"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">🛒 {pl.shopping.friscoTitle}</h3>
                <button onClick={() => setShowFrisco(false)} className="text-2xl leading-none text-gray-400">×</button>
              </div>
              <div className="mb-4 rounded-xl border border-primary-200 bg-primary-50 p-3 dark:border-primary-900 dark:bg-primary-950/40">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{pl.shopping.friscoServerTitle}</h4>
                <p className="mt-1 mb-2 text-xs text-gray-500 dark:text-gray-400">{pl.shopping.friscoServerHint}</p>
                <button
                  onClick={() => { setOrderResult(null); orderMutation.mutate() }}
                  disabled={orderMutation.isPending}
                  className="w-full rounded-xl bg-primary-600 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {orderMutation.isPending ? pl.shopping.friscoServerBusy : pl.shopping.friscoServerBtn}
                </button>
                {orderMutation.isError && (
                  <p className="mt-2 text-xs text-red-500">{(orderMutation.error as Error).message}</p>
                )}
                {orderResult && (
                  <div className="mt-3 space-y-2 text-xs">
                    <p className="font-medium text-gray-800 dark:text-gray-100">
                      {pl.shopping.friscoServerInCart}: {orderResult.inCart}/{orderResult.requested}
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
                    <p className="text-gray-500 dark:text-gray-400">{pl.shopping.friscoServerDone}</p>
                  </div>
                )}
              </div>

              <p className="mb-2 text-xs font-semibold text-gray-700 dark:text-gray-300">{pl.shopping.friscoManualTitle}</p>
              <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{pl.shopping.friscoHint}</p>
              <textarea
                readOnly
                value={prompt}
                rows={16}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 p-3 font-mono text-xs text-gray-800 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200"
              />
              <button
                onClick={async () => {
                  try { await navigator.clipboard.writeText(prompt); setCopied(true); setTimeout(() => setCopied(false), 2000) }
                  catch { /* clipboard blocked — user can select the text manually */ }
                }}
                className="mt-3 w-full rounded-xl bg-primary-600 py-2.5 text-sm font-semibold text-white"
              >
                {copied ? pl.shopping.friscoCopied : pl.shopping.friscoCopy}
              </button>

              <div className="mt-5 border-t border-gray-200 pt-4 dark:border-gray-700">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{pl.shopping.friscoNodeTitle}</h4>
                <p className="mt-1 mb-2 text-xs text-gray-500 dark:text-gray-400">{pl.shopping.friscoNodeHint}</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-lg bg-gray-100 px-3 py-2 font-mono text-xs text-gray-800 dark:bg-gray-950 dark:text-gray-200">
                    npm run frisco -- {listId}
                  </code>
                  <button
                    onClick={async () => {
                      try { await navigator.clipboard.writeText(`npm run frisco -- ${listId}`); setCopiedCmd(true); setTimeout(() => setCopiedCmd(false), 2000) }
                      catch { /* clipboard blocked */ }
                    }}
                    className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 dark:border-gray-700 dark:text-gray-200"
                  >
                    {copiedCmd ? pl.shopping.friscoCopied : pl.shopping.friscoCopy}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}
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
