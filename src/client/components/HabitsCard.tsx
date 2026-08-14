import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { habitsApi } from '../lib/api'
import pl from '../i18n/pl'
import type { Habit } from '../../shared/types'

// Starter set offered when the user has no habits yet.
export const DEFAULT_HABITS: { name: string; remind_at: string | null }[] = [
  { name: 'Siłownia', remind_at: null },
  { name: 'Siłownia w domu', remind_at: null },
  { name: 'Mobility', remind_at: '20:30' },
]

export function streakLabel(n: number) {
  if (n <= 0) return pl.habits.noStreak
  return `🔥 ${n} ${n === 1 ? 'dzień' : 'dni'}`
}

function HabitRow({ habit }: { habit: Habit }) {
  const qc = useQueryClient()
  const checkin = useMutation({
    mutationFn: (success: boolean) => habitsApi.checkin(habit.id, success),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['habits'] }),
  })

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{habit.name}</p>
        <p className="text-xs text-gray-400">
          {streakLabel(habit.streak)}
          {habit.remind_at ? ` · ⏰ ${habit.remind_at}` : ''}
        </p>
      </div>
      <div className="flex shrink-0 gap-1.5">
        <button
          onClick={() => checkin.mutate(true)}
          disabled={checkin.isPending}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
            habit.today === 'yes' ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-200'
          }`}
          aria-label={`${habit.name}: ${pl.common.yes}`}
        >
          ✅
        </button>
        <button
          onClick={() => checkin.mutate(false)}
          disabled={checkin.isPending}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
            habit.today === 'no' ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-200'
          }`}
          aria-label={`${habit.name}: ${pl.common.no}`}
        >
          ❌
        </button>
      </div>
    </div>
  )
}

// `card` wraps the chips in a panel — and renders nothing at all when every
// suggested habit already exists (so no empty panel is left behind).
export function SuggestedHabits({ card = false }: { card?: boolean }) {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['habits'], queryFn: () => habitsApi.list() })
  const existing = new Set((data?.items ?? []).map((h) => h.name.toLowerCase()))
  const missing = DEFAULT_HABITS.filter((d) => !existing.has(d.name.toLowerCase()))

  const add = useMutation({
    mutationFn: (d: { name: string; remind_at: string | null }) => habitsApi.create(d.name, d.remind_at),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['habits'] }),
  })

  if (missing.length === 0) return null

  return (
    <div className={card ? 'rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700' : ''}>
      <p className="mb-2 text-xs text-gray-400">{pl.habits.suggestTitle}</p>
      <div className="flex flex-wrap gap-2">
        {missing.map((d) => (
          <button
            key={d.name}
            onClick={() => add.mutate(d)}
            disabled={add.isPending}
            className="rounded-full border border-dashed border-gray-300 px-3 py-1.5 text-xs font-medium text-primary-600 hover:border-primary-400 hover:bg-primary-50 disabled:opacity-50 dark:border-gray-600 dark:text-primary-400 dark:hover:bg-primary-900/20"
          >
            ➕ {d.name}{d.remind_at ? ` (${d.remind_at})` : ''}
          </button>
        ))}
      </div>
    </div>
  )
}

// Compact habit tracker for the home screen. `bare` drops the card chrome and
// adds a divider instead, so this can sit inside another panel (e.g. the water box).
export default function HabitsCard({ bare = false }: { bare?: boolean }) {
  const { data, isLoading } = useQuery({ queryKey: ['habits'], queryFn: () => habitsApi.list() })
  const items = (data?.items ?? []).filter((h) => h.active)
  const pending = items.filter((h) => h.today === null).length

  if (isLoading) return null

  return (
    <div className={bare
      ? 'mt-4 border-t border-gray-100 pt-4 dark:border-gray-700'
      : 'rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700'}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">🔁 {pl.habits.todayCard}</h2>
        <Link to="/habits" className="text-xs text-primary-600 dark:text-primary-400">{pl.habits.manage}</Link>
      </div>

      {items.length === 0 ? (
        <SuggestedHabits />
      ) : (
        <>
          <div className="space-y-3">
            {items.map((h) => <HabitRow key={h.id} habit={h} />)}
          </div>
          {pending === 0 && (
            <p className="mt-3 text-center text-xs text-gray-400">{pl.habits.allDone}</p>
          )}
        </>
      )}
    </div>
  )
}
