import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { blocksApi } from '../lib/api'
import pl from '../i18n/pl'

const card = 'rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700'
const input = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100'
const button = 'rounded-xl bg-primary-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50'

function seen(at: number | null): string {
  if (!at) return pl.blocks.neverSeen
  const mins = Math.round((Date.now() / 1000 - at) / 60)
  if (mins < 1) return `${pl.blocks.lastSeen}: teraz`
  if (mins < 60) return `${pl.blocks.lastSeen}: ${mins} min temu`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${pl.blocks.lastSeen}: ${hours} h temu`
  return `${pl.blocks.lastSeen}: ${Math.round(hours / 24)} dni temu`
}

export default function BlokadyPage() {
  const qc = useQueryClient()
  const [pattern, setPattern] = useState('')
  const [minutes, setMinutes] = useState('')
  const [deviceName, setDeviceName] = useState('')
  // Shown once, right after minting — the API never returns it again.
  const [freshToken, setFreshToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const rules = useQuery({ queryKey: ['blocks'], queryFn: () => blocksApi.list() })
  const devices = useQuery({ queryKey: ['blocks', 'devices'], queryFn: () => blocksApi.devices() })

  const invalidateRules = () => qc.invalidateQueries({ queryKey: ['blocks'] })

  const addRule = useMutation({
    mutationFn: () => blocksApi.create(pattern.trim(), Number(minutes) || 0),
    onSuccess: () => { invalidateRules(); setPattern(''); setMinutes('') },
  })
  const toggleRule = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) => blocksApi.update(id, { active }),
    onSuccess: invalidateRules,
  })
  const removeRule = useMutation({
    mutationFn: (id: number) => blocksApi.delete(id),
    onSuccess: invalidateRules,
  })

  const addDevice = useMutation({
    mutationFn: () => blocksApi.createDevice(deviceName.trim()),
    onSuccess: (d) => {
      setFreshToken(d.token)
      setCopied(false)
      setDeviceName('')
      qc.invalidateQueries({ queryKey: ['blocks', 'devices'] })
    },
  })
  const removeDevice = useMutation({
    mutationFn: (id: number) => blocksApi.deleteDevice(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['blocks', 'devices'] }),
  })

  const items = rules.data?.items ?? []

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">🚫 {pl.blocks.title}</h1>
      <p className="text-xs text-gray-400">{pl.blocks.hint}</p>
      <p className="text-xs text-gray-400">{pl.blocks.unlockHint}</p>

      <div className={`${card} space-y-2`}>
        <input
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          placeholder={pl.blocks.patternPlaceholder}
          className={input}
        />
        <input
          value={minutes}
          onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ''))}
          inputMode="numeric"
          placeholder={pl.blocks.minutesPlaceholder}
          className={input}
        />
        <p className="text-xs text-gray-400">{pl.blocks.patternHelp}</p>
        <button
          onClick={() => addRule.mutate()}
          disabled={addRule.isPending || !pattern.trim()}
          className={button}
        >
          {addRule.isPending ? '…' : pl.blocks.add}
        </button>
      </div>

      {rules.isLoading ? (
        <p className="text-gray-500">{pl.common.loading}</p>
      ) : items.length === 0 ? (
        <p className="py-4 text-center text-gray-400">{pl.blocks.empty}</p>
      ) : (
        <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
          {items.map((r, idx) => (
            <div
              key={r.id}
              className={`flex items-center gap-3 px-4 py-3 ${idx < items.length - 1 ? 'border-b border-gray-50 dark:border-gray-700' : ''}`}
            >
              <div className="flex-1">
                <div className={`text-sm ${r.active ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 line-through'}`}>
                  {r.pattern}
                </div>
                <div className="text-xs text-gray-400">
                  {r.daily_limit_minutes > 0
                    ? `${r.daily_limit_minutes} ${pl.blocks.perDay}`
                    : pl.blocks.always}
                  {!r.active && ` · ${pl.blocks.inactive}`}
                </div>
              </div>
              <button
                onClick={() => toggleRule.mutate({ id: r.id, active: !r.active })}
                className="shrink-0 text-lg"
                aria-label={pl.blocks.inactive}
              >
                {r.active ? '⏸' : '▶️'}
              </button>
              <button
                onClick={() => { if (confirm(pl.blocks.deleteConfirm)) removeRule.mutate(r.id) }}
                className="shrink-0 text-gray-300 hover:text-red-400"
                aria-label={pl.common.delete}
              >
                🗑
              </button>
            </div>
          ))}
        </div>
      )}

      <h2 className="pt-4 text-lg font-bold text-gray-900 dark:text-gray-100">📱 {pl.blocks.devices}</h2>
      <p className="text-xs text-gray-400">{pl.blocks.devicesHint}</p>

      {freshToken && (
        <div className="rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200 dark:bg-amber-950 dark:ring-amber-800">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">{pl.blocks.tokenOnce}</p>
          <code className="mt-2 block break-all rounded-lg bg-white p-2 font-mono text-xs dark:bg-gray-900 dark:text-gray-100">
            {freshToken}
          </code>
          <button
            onClick={() => { navigator.clipboard.writeText(freshToken); setCopied(true) }}
            className="mt-2 rounded-lg bg-amber-600 px-3 py-1 text-xs font-semibold text-white"
          >
            {copied ? pl.blocks.copied : pl.blocks.copy}
          </button>
        </div>
      )}

      <div className={`${card} flex gap-2`}>
        <input
          value={deviceName}
          onChange={(e) => setDeviceName(e.target.value)}
          placeholder={pl.blocks.deviceNamePlaceholder}
          className={input}
        />
        <button
          onClick={() => addDevice.mutate()}
          disabled={addDevice.isPending || !deviceName.trim()}
          className={`${button} shrink-0`}
        >
          {addDevice.isPending ? '…' : pl.blocks.addDevice}
        </button>
      </div>

      {(devices.data?.items ?? []).length === 0 ? (
        <p className="py-2 text-center text-xs text-gray-400">{pl.blocks.noDevices}</p>
      ) : (
        <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
          {(devices.data?.items ?? []).map((d, idx, arr) => (
            <div
              key={d.id}
              className={`flex items-center gap-3 px-4 py-3 ${idx < arr.length - 1 ? 'border-b border-gray-50 dark:border-gray-700' : ''}`}
            >
              <div className="flex-1">
                <div className="text-sm text-gray-900 dark:text-gray-100">{d.name}</div>
                <div className="text-xs text-gray-400">{d.hint} · {seen(d.last_seen_at)}</div>
              </div>
              <button
                onClick={() => { if (confirm(pl.blocks.deleteDeviceConfirm)) removeDevice.mutate(d.id) }}
                className="shrink-0 text-gray-300 hover:text-red-400"
                aria-label={pl.common.delete}
              >
                🗑
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
