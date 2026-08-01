import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { choresApi } from '../lib/api'
import pl from '../i18n/pl'
import type { Chore } from '../../shared/types'

const DAYS = pl.supplements.daysOfWeek // ['Nd','Pn','Wt','Śr','Cz','Pt','Sb']

function recurrenceLabel(c: Chore): string {
  if (c.interval_days) return `${pl.chores.every} ${c.interval_days} ${c.interval_days === 1 ? pl.chores.day : pl.chores.days} · ${c.time}`
  if (c.weekdays && c.weekdays.length) return `${c.weekdays.slice().sort().map((d) => DAYS[d]).join(', ')} · ${c.time}`
  return c.time
}

function lastDoneLabel(c: Chore): string {
  if (!c.last_done_at) return pl.chores.neverDone
  const d = new Date(c.last_done_at * 1000)
  return `${pl.chores.lastDone}: ${d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' })} ${d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}`
}

function AddChoreForm() {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [mode, setMode] = useState<'interval' | 'weekly'>('interval')
  const [intervalDays, setIntervalDays] = useState('4')
  const [weekdays, setWeekdays] = useState<number[]>([3])
  const [time, setTime] = useState('20:00')
  const [nag, setNag] = useState('60')

  const create = useMutation({
    mutationFn: () => choresApi.create({
      name: name.trim(),
      interval_days: mode === 'interval' ? Number(intervalDays) || 1 : null,
      weekdays: mode === 'weekly' ? weekdays : null,
      time,
      nag_minutes: Number(nag) || 60,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['chores'] }); setName('') },
  })
  const toggleDay = (d: number) => setWeekdays((cur) => cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d])
  const canSave = name.trim() && (mode === 'interval' ? Number(intervalDays) > 0 : weekdays.length > 0)

  const modeBtn = (m: 'interval' | 'weekly', label: string) => (
    <button
      type="button"
      onClick={() => setMode(m)}
      className={`flex-1 rounded-lg py-2 text-sm font-medium ${mode === m ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}
    >{label}</button>
  )

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
      <h2 className="mb-3 font-semibold text-gray-900 dark:text-gray-100">{pl.chores.new}</h2>
      <div className="space-y-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={pl.chores.placeholder}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        />
        <div className="flex gap-2">
          {modeBtn('interval', pl.chores.modeInterval)}
          {modeBtn('weekly', pl.chores.modeWeekly)}
        </div>

        {mode === 'interval' ? (
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            <span>{pl.chores.every}</span>
            <input type="number" min="1" max="365" value={intervalDays} onChange={(e) => setIntervalDays(e.target.value)}
              className="w-20 rounded-lg border border-gray-200 px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100" />
            <span>{pl.chores.days}</span>
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {DAYS.map((d, i) => (
              <button key={i} type="button" onClick={() => toggleDay(i)}
                className={`h-9 w-9 rounded-full text-xs font-medium ${weekdays.includes(i) ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
                {d}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600 dark:text-gray-300">
          <label className="flex items-center gap-2">{pl.chores.time}:
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
              className="rounded-lg border border-gray-200 px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100" />
          </label>
          <label className="flex items-center gap-2">{pl.chores.nag}:
            <input type="number" min="5" step="5" value={nag} onChange={(e) => setNag(e.target.value)}
              className="w-20 rounded-lg border border-gray-200 px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100" />
            min
          </label>
        </div>

        <button
          onClick={() => create.mutate()}
          disabled={create.isPending || !canSave}
          className="w-full rounded-xl bg-primary-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {create.isPending ? '…' : pl.chores.add}
        </button>
      </div>
    </div>
  )
}

function ChoreRow({ chore }: { chore: Chore }) {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['chores'] })
  const done = useMutation({ mutationFn: () => choresApi.done(chore.id), onSuccess: invalidate })
  const remove = useMutation({ mutationFn: () => choresApi.delete(chore.id), onSuccess: invalidate })
  const remind = useMutation({
    mutationFn: () => choresApi.remindNow(chore.id),
    onSuccess: (r) => alert(r.sent > 0 ? pl.supplements.remindSent : pl.supplements.remindNone),
    onError: (e) => alert((e as Error).message),
  })

  return (
    <div className={`rounded-xl px-4 py-3 shadow-sm ring-1 ${chore.due ? 'bg-amber-50 ring-amber-200 dark:bg-amber-900/20 dark:ring-amber-800/40' : 'bg-white ring-gray-200 dark:bg-gray-800 dark:ring-gray-700'}`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {chore.due && '🔔 '}{chore.name}
          </p>
          <p className="mt-0.5 text-xs text-gray-400">{recurrenceLabel(chore)} · {pl.chores.nagEvery} {chore.nag_minutes} min</p>
          <p className="text-xs text-gray-400">
            {chore.done_today ? `✓ ${pl.chores.doneToday}` : lastDoneLabel(chore)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button onClick={() => remind.mutate()} disabled={remind.isPending} title={pl.supplements.remindNow}
            className="rounded-lg bg-gray-100 px-2 py-1.5 text-xs text-gray-500 disabled:opacity-40 dark:bg-gray-700">🔔</button>
          <button onClick={() => { if (confirm(pl.chores.deleteConfirm)) remove.mutate() }} className="text-gray-300 hover:text-red-400" aria-label={pl.common.delete}>🗑</button>
        </div>
      </div>
      <button
        onClick={() => done.mutate()}
        disabled={done.isPending}
        className={`mt-2 w-full rounded-lg py-2 text-sm font-semibold disabled:opacity-50 ${chore.due ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-200'}`}
      >
        ✅ {pl.chores.markDone}
      </button>
    </div>
  )
}

export default function ChoresPage() {
  const { data, isLoading } = useQuery({ queryKey: ['chores'], queryFn: () => choresApi.list() })
  const items = data?.items ?? []

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">🧹 {pl.chores.title}</h1>
      <p className="text-xs text-gray-400">{pl.chores.hint}</p>

      {isLoading ? (
        <p className="text-gray-500">{pl.common.loading}</p>
      ) : items.length === 0 ? (
        <p className="py-2 text-center text-gray-400">{pl.chores.empty}</p>
      ) : (
        <div className="space-y-2">
          {items.map((c) => <ChoreRow key={c.id} chore={c} />)}
        </div>
      )}

      <AddChoreForm />
    </div>
  )
}
