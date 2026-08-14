import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { habitsApi } from '../lib/api'
import { SuggestedHabits, streakLabel } from '../components/HabitsCard'
import pl from '../i18n/pl'
import type { Habit } from '../../shared/types'

function AddHabitForm() {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const create = useMutation({
    mutationFn: () => habitsApi.create(name.trim()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['habits'] }); setName('') },
  })
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && name.trim() && create.mutate()}
          placeholder={pl.habits.placeholder}
          className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        />
        <button
          onClick={() => create.mutate()}
          disabled={create.isPending || !name.trim()}
          className="rounded-xl bg-primary-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {create.isPending ? '…' : pl.common.add}
        </button>
      </div>
    </div>
  )
}

function HabitCard({ habit }: { habit: Habit }) {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['habits'] })
  const checkin = useMutation({
    mutationFn: (success: boolean) => habitsApi.checkin(habit.id, success),
    onSuccess: invalidate,
  })
  const remove = useMutation({ mutationFn: () => habitsApi.delete(habit.id), onSuccess: invalidate })
  const setTime = useMutation({
    mutationFn: (remind_at: string | null) => habitsApi.update(habit.id, { remind_at }),
    onSuccess: invalidate,
  })

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{habit.name}</p>
          <p className="mt-0.5 text-xs text-gray-400">{streakLabel(habit.streak)}</p>
        </div>
        <button onClick={() => { if (confirm(pl.habits.deleteConfirm)) remove.mutate() }} className="shrink-0 text-gray-300 hover:text-red-400" aria-label={pl.common.delete}>🗑</button>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className="mr-1 text-xs text-gray-400">{pl.habits.todayQuestion}</span>
        <button
          onClick={() => checkin.mutate(true)}
          disabled={checkin.isPending}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
            habit.today === 'yes' ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-200'
          }`}
        >
          ✅ {pl.common.yes}
        </button>
        <button
          onClick={() => checkin.mutate(false)}
          disabled={checkin.isPending}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
            habit.today === 'no' ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-200'
          }`}
        >
          ❌ {pl.common.no}
        </button>
      </div>
      <div className="mt-3 flex items-center gap-2 border-t border-gray-100 pt-3 dark:border-gray-700">
        <span className="text-xs text-gray-400">⏰ {pl.habits.reminderLabel}</span>
        <input
          type="time"
          value={habit.remind_at ?? ''}
          onChange={(e) => setTime.mutate(e.target.value || null)}
          className="rounded-lg border border-gray-200 px-2 py-1 text-xs outline-none focus:border-primary-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        />
        {habit.remind_at ? (
          <button onClick={() => setTime.mutate(null)} className="text-xs text-gray-400 underline">
            {pl.habits.reminderClear}
          </button>
        ) : (
          <span className="text-xs text-gray-400">({pl.habits.reminderRandom})</span>
        )}
      </div>
    </div>
  )
}

export default function HabitsPage() {
  const { data, isLoading } = useQuery({ queryKey: ['habits'], queryFn: () => habitsApi.list() })
  const items = data?.items ?? []

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">🔁 {pl.habits.title}</h1>
      <p className="text-xs text-gray-400">{pl.habits.hint}</p>

      <AddHabitForm />

      <SuggestedHabits card />

      {isLoading ? (
        <p className="text-gray-500">{pl.common.loading}</p>
      ) : items.length === 0 ? (
        <p className="py-4 text-center text-gray-400">{pl.habits.empty}</p>
      ) : (
        <div className="space-y-3">
          {items.map((h) => <HabitCard key={h.id} habit={h} />)}
        </div>
      )}
    </div>
  )
}
