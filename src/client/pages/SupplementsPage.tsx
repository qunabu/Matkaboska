import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supplementsApi } from '../lib/api'
import pl from '../i18n/pl'
import type { SupKind } from '../../shared/types'

function todayDate() {
  return new Date().toISOString().slice(0, 10)
}

const DAYS_OF_WEEK = pl.supplements.daysOfWeek

interface SuppFormProps {
  suppId?: number
  onClose: () => void
  onSaved: () => void
}

function SuppForm({ suppId, onClose, onSaved }: SuppFormProps) {
  const qc = useQueryClient()
  const isEdit = !!suppId

  const { data: existing } = useQuery({
    queryKey: ['supplement', suppId],
    queryFn: () => supplementsApi.get(suppId!),
    enabled: isEdit,
  })

  const [name, setName] = useState(existing?.name ?? '')
  const [kind, setKind] = useState<SupKind>(existing?.kind ?? 'supplement')
  const [dose, setDose] = useState(existing?.dose ?? '')
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [times, setTimes] = useState<string[]>(existing?.schedule.times ?? ['08:00'])
  const [days, setDays] = useState<number[]>(existing?.schedule.days ?? [0, 1, 2, 3, 4, 5, 6])

  const saveMutation = useMutation({
    mutationFn: () => {
      const data = {
        name,
        kind,
        dose: dose || null,
        notes: notes || null,
        schedule: { times, days },
        active: true,
      }
      return isEdit ? supplementsApi.update(suppId!, data) : supplementsApi.create(data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supplements'] })
      onSaved()
      onClose()
    },
  })

  function toggleDay(day: number) {
    setDays(d => d.includes(day) ? d.filter(x => x !== day) : [...d, day].sort())
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40 md:items-center" onClick={onClose}>
      <div
        className="w-full max-h-[85vh] overflow-y-auto rounded-t-2xl bg-white p-4 md:mx-auto md:max-w-md md:rounded-2xl dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">{isEdit ? pl.common.edit : pl.supplements.new}</h3>
          <button onClick={onClose} className="text-gray-400">×</button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-0.5 block text-xs font-medium text-gray-600">{pl.supplements.name}</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-0.5 block text-xs font-medium text-gray-600">{pl.supplements.kind}</label>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as SupKind)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              >
                <option value="supplement">{pl.supplements.kinds.supplement}</option>
                <option value="medication">{pl.supplements.kinds.medication}</option>
              </select>
            </div>
            <div>
              <label className="mb-0.5 block text-xs font-medium text-gray-600">{pl.supplements.dose}</label>
              <input
                value={dose}
                onChange={(e) => setDose(e.target.value)}
                placeholder="np. 1 kapsułka"
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              />
            </div>
          </div>

          {/* Days */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600">{pl.supplements.days}</label>
            <div className="flex gap-1">
              {DAYS_OF_WEEK.map((d, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleDay(i)}
                  className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors ${
                    days.includes(i)
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-500 dark:bg-gray-700'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* Times */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600">{pl.supplements.times}</label>
            <div className="space-y-1.5">
              {times.map((t, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="time"
                    value={t}
                    onChange={(e) => setTimes(ts => ts.map((v, idx) => idx === i ? e.target.value : v))}
                    className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                  />
                  <button
                    type="button"
                    onClick={() => setTimes(ts => ts.filter((_, idx) => idx !== i))}
                    className="text-red-400 hover:text-red-600"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setTimes(ts => [...ts, '12:00'])}
              className="mt-1.5 text-xs text-primary-600 hover:underline"
            >
              + {pl.supplements.addTime}
            </button>
          </div>

          <div>
            <label className="mb-0.5 block text-xs font-medium text-gray-600">{pl.supplements.notes}</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            />
          </div>
        </div>

        <button
          onClick={() => saveMutation.mutate()}
          disabled={!name.trim() || saveMutation.isPending}
          className="mt-4 w-full rounded-xl bg-primary-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saveMutation.isPending ? '…' : pl.common.save}
        </button>
      </div>
    </div>
  )
}

export default function SupplementsPage() {
  const qc = useQueryClient()
  const today = todayDate()
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | undefined>()

  const { data, isLoading } = useQuery({
    queryKey: ['supplements', today],
    queryFn: () => supplementsApi.list(today),
  })

  const logMutation = useMutation({
    mutationFn: (id: number) => supplementsApi.log(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['supplements'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => supplementsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['supplements'] }),
  })

  const supplements = data?.items ?? []
  const active = supplements.filter(s => s.active)
  const inactive = supplements.filter(s => !s.active)

  return (
    <div className="mx-auto max-w-2xl p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{pl.supplements.title}</h1>
        <button
          onClick={() => { setEditId(undefined); setShowForm(true) }}
          className="rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white"
        >
          + {pl.supplements.new}
        </button>
      </div>

      {isLoading && <p className="text-gray-500">{pl.common.loading}</p>}

      {active.length > 0 && (
        <div className="space-y-3">
          {active.map((supp) => {
            const taken = supp.taken_today
            const due = supp.doses_due
            const allTaken = due > 0 && taken >= due

            return (
              <div
                key={supp.id}
                className={`rounded-xl bg-white p-4 shadow-sm ring-1 ${
                  allTaken
                    ? 'ring-green-200 dark:bg-gray-800 dark:ring-green-800/40'
                    : 'ring-gray-200 dark:bg-gray-800 dark:ring-gray-700'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-900 dark:text-gray-100">{supp.name}</p>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${
                        supp.kind === 'medication'
                          ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'
                          : 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
                      }`}>
                        {supp.kind === 'medication' ? pl.supplements.kinds.medication : pl.supplements.kinds.supplement}
                      </span>
                    </div>
                    {supp.dose && <p className="text-xs text-gray-500">{supp.dose}</p>}
                    <p className="mt-1 text-xs text-gray-400">
                      {pl.supplements.taken_today}: {taken} / {due}
                      {supp.schedule.times.length > 0 && (
                        <span> · {supp.schedule.times.join(', ')}</span>
                      )}
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    {!allTaken && (
                      <button
                        onClick={() => logMutation.mutate(supp.id)}
                        className="rounded-lg bg-green-500 px-3 py-1.5 text-xs font-medium text-white"
                      >
                        {pl.supplements.takeDose}
                      </button>
                    )}
                    {allTaken && (
                      <span className="rounded-lg bg-green-100 px-3 py-1.5 text-xs font-medium text-green-700 dark:bg-green-900/20 dark:text-green-400">
                        ✓ {pl.supplements.taken}
                      </span>
                    )}
                    <button
                      onClick={() => { setEditId(supp.id); setShowForm(true) }}
                      className="rounded-lg bg-gray-100 px-2 py-1.5 text-xs text-gray-500 dark:bg-gray-700"
                    >
                      ✎
                    </button>
                    <button
                      onClick={() => { if (confirm(pl.supplements.deleteConfirm)) deleteMutation.mutate(supp.id) }}
                      className="rounded-lg bg-gray-100 px-2 py-1.5 text-xs text-red-400 dark:bg-gray-700"
                    >
                      ×
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {inactive.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Nieaktywne</h2>
          <div className="space-y-2">
            {inactive.map((supp) => (
              <div key={supp.id} className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3 dark:bg-gray-800">
                <p className="text-sm text-gray-400 line-through">{supp.name}</p>
                <button
                  onClick={() => { if (confirm(pl.supplements.deleteConfirm)) deleteMutation.mutate(supp.id) }}
                  className="text-xs text-gray-300 hover:text-red-400"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!isLoading && supplements.length === 0 && (
        <p className="py-12 text-center text-gray-400">{pl.common.noResults}</p>
      )}

      {showForm && (
        <SuppForm
          suppId={editId}
          onClose={() => setShowForm(false)}
          onSaved={() => qc.invalidateQueries({ queryKey: ['supplements'] })}
        />
      )}
    </div>
  )
}
