import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { blocksApi } from '../lib/api'
import pl from '../i18n/pl'

const card = 'rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700'

/** Minutes are the useful unit; sub-minute reads as "<1 min". */
function duration(seconds: number): string {
  if (seconds <= 0) return '0 min'
  if (seconds < 60) return '<1 min'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}

function dayKey(offset: number): string {
  const d = new Date()
  d.setDate(d.getDate() - offset)
  return d.toISOString().slice(0, 10)
}

/**
 * Mirrors the phone's home screen: today's screen time, how it compares with
 * yesterday, the day's counters, and where the time actually went.
 *
 * The numbers are measured and owned by the phone — this only renders what it
 * pushed up, so an unpaired or offline phone shows nothing rather than zeros.
 */
export default function ScreenTimeCard() {
  const [rangeDays, setRangeDays] = useState(1)
  const { data, isLoading } = useQuery({
    queryKey: ['blocks', 'usage'],
    queryFn: () => blocksApi.usage(7),
  })

  if (isLoading) return <p className="text-gray-500">{pl.common.loading}</p>
  if (!data || data.usage.length === 0) {
    return <p className="py-4 text-center text-xs text-gray-400">{pl.blocks.noUsage}</p>
  }

  const today = dayKey(0)
  const yesterday = dayKey(1)
  const secondsOn = (day: string) =>
    data.usage.filter((u) => u.date === day).reduce((sum, u) => sum + u.seconds, 0)

  const todaySeconds = secondsOn(today)
  const yesterdaySeconds = secondsOn(yesterday)
  const diff = todaySeconds - yesterdaySeconds
  const stats = data.stats.find((s) => s.date === today)

  // Less time than yesterday is the win, so that's the green one.
  const deltaClass = yesterdaySeconds === 0 || diff === 0
    ? 'text-gray-400'
    : diff < 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
  const deltaText = yesterdaySeconds === 0
    ? pl.blocks.noYesterday
    : diff < 0 ? `↘ ${duration(-diff)} ${pl.blocks.lessThanYesterday}`
    : diff > 0 ? `↗ ${duration(diff)} ${pl.blocks.moreThanYesterday}`
    : pl.blocks.sameAsYesterday

  const cutoff = dayKey(rangeDays - 1)
  const totals = new Map<string, number>()
  for (const row of data.usage) {
    if (row.date < cutoff) continue
    totals.set(row.target, (totals.get(row.target) ?? 0) + row.seconds)
  }
  const ranked = [...totals.entries()]
    .map(([target, seconds]) => ({ target, seconds }))
    .sort((a, b) => b.seconds - a.seconds)
  const max = ranked[0]?.seconds ?? 1

  return (
    <div className="space-y-4">
      <div className={`${card} text-center`}>
        <p className="text-sm text-gray-500 dark:text-gray-400">{pl.blocks.screenToday}</p>
        <p className="text-4xl font-bold text-gray-900 dark:text-gray-100">{duration(todaySeconds)}</p>
        <p className={`text-sm ${deltaClass}`}>{deltaText}</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          { label: pl.blocks.blockedToday, value: stats?.blocks ?? 0 },
          { label: pl.blocks.unlocks, value: stats?.unlocks ?? 0 },
          { label: pl.blocks.screenUnlocks, value: stats?.screen_unlocks ?? 0 },
        ].map((s) => (
          <div key={s.label} className={card}>
            <p className="text-xs text-gray-500 dark:text-gray-400">{s.label}</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{s.value}</p>
          </div>
        ))}
      </div>

      <div className={card}>
        <div className="flex items-center gap-2 pb-3">
          <h2 className="flex-1 text-base font-bold text-gray-900 dark:text-gray-100">
            {pl.blocks.attention}
          </h2>
          <button
            onClick={() => setRangeDays(rangeDays === 1 ? 7 : 1)}
            className="rounded-lg bg-primary-600 px-3 py-1 text-xs font-semibold text-white"
          >
            {rangeDays === 1 ? pl.blocks.today : pl.blocks.week}
          </button>
        </div>

        {ranked.slice(0, 12).map((r) => (
          <div key={r.target} className="py-2">
            <div className="flex items-baseline gap-2">
              <span className="flex-1 truncate text-sm text-gray-900 dark:text-gray-100">{r.target}</span>
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {duration(r.seconds)}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded bg-gray-200 dark:bg-gray-700">
              <div
                className="h-full rounded bg-primary-500"
                style={{ width: `${Math.max(2, (r.seconds / max) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
