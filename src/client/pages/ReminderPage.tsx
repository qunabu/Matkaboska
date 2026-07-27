import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { remindersApi } from '../lib/api'
import pl from '../i18n/pl'
import type { Reminder } from '../../shared/types'

const DAYS = pl.supplements.daysOfWeek // ['Nd','Pn','Wt','Śr','Cz','Pt','Sb']
const TYPES: Reminder['type'][] = ['supplement', 'cook', 'prep', 'water', 'custom']
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]

function daysLabel(days: number[]) {
  if (days.length === 7) return pl.reminders.everyDay
  return days.slice().sort().map((d) => DAYS[d]).join(', ')
}

function AddReminderForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient()
  const [type, setType] = useState<Reminder['type']>('custom')
  const [label, setLabel] = useState('')
  const [time, setTime] = useState('09:00')
  const [days, setDays] = useState<number[]>(ALL_DAYS)

  const create = useMutation({
    mutationFn: () => remindersApi.create({ type, label: label.trim(), time, days, enabled: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reminders'] })
      setLabel('')
      onDone()
    },
  })

  const toggleDay = (d: number) =>
    setDays((cur) => cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d])

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
      <h2 className="mb-3 font-semibold text-gray-900 dark:text-gray-100">{pl.reminders.new}</h2>
      <div className="space-y-3">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={pl.reminders.labelPlaceholder}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        />
        <div className="flex gap-2">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as Reminder['type'])}
            className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          >
            {TYPES.map((t) => <option key={t} value={t}>{pl.reminders.types[t]}</option>)}
          </select>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">{pl.reminders.days}</label>
          <div className="flex flex-wrap gap-1.5">
            {DAYS.map((d, i) => (
              <button
                key={i}
                type="button"
                onClick={() => toggleDay(i)}
                className={`h-9 w-9 rounded-full text-xs font-medium transition-colors ${
                  days.includes(i)
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={() => create.mutate()}
          disabled={create.isPending || !label.trim() || days.length === 0}
          className="w-full rounded-xl bg-primary-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {create.isPending ? '…' : pl.reminders.add}
        </button>
      </div>
    </div>
  )
}

export default function ReminderPage() {
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['reminders'],
    queryFn: () => remindersApi.list(),
  })

  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) => remindersApi.update(id, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reminders'] }),
  })

  const remove = useMutation({
    mutationFn: (id: number) => remindersApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reminders'] }),
  })

  const items = data?.items ?? []

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">🔔 {pl.reminders.title}</h1>
      <p className="text-xs text-gray-400">{pl.reminders.pushHint}</p>

      {isLoading ? (
        <p className="text-gray-500">{pl.common.loading}</p>
      ) : items.length === 0 ? (
        <p className="py-4 text-center text-gray-400">{pl.reminders.empty}</p>
      ) : (
        <div className="space-y-2">
          {items.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-3 rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700"
            >
              <div className="w-14 shrink-0 text-lg font-bold tabular-nums text-primary-600 dark:text-primary-400">
                {r.time}
              </div>
              <div className="min-w-0 flex-1">
                <p className={`truncate text-sm font-medium ${r.enabled ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 line-through'}`}>
                  {r.label}
                </p>
                <p className="text-xs text-gray-400">
                  {pl.reminders.types[r.type]} · {daysLabel(r.days)}
                </p>
              </div>
              <button
                onClick={() => toggle.mutate({ id: r.id, enabled: !r.enabled })}
                aria-label={pl.reminders.enabled}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${r.enabled ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'}`}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${r.enabled ? 'left-5' : 'left-0.5'}`} />
              </button>
              <button
                onClick={() => { if (confirm(pl.reminders.deleteConfirm)) remove.mutate(r.id) }}
                className="shrink-0 text-gray-300 hover:text-red-400"
                aria-label={pl.common.delete}
              >
                🗑
              </button>
            </div>
          ))}
        </div>
      )}

      <AddReminderForm onDone={() => {}} />
    </div>
  )
}
