import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ideasApi } from '../lib/api'
import pl from '../i18n/pl'
import type { Idea } from '../../shared/types'

function AddIdeaForm() {
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  const create = useMutation({
    mutationFn: () => ideasApi.create({ title: title.trim(), description: description.trim() || null }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ideas'] }); setTitle(''); setDescription('') },
  })

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
      <div className="space-y-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={pl.ideas.titlePlaceholder}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={pl.ideas.descPlaceholder}
          rows={3}
          className="w-full resize-y rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        />
        <button
          onClick={() => create.mutate()}
          disabled={create.isPending || !title.trim()}
          className="w-full rounded-xl bg-primary-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {create.isPending ? '…' : pl.ideas.add}
        </button>
      </div>
    </div>
  )
}

interface IdeaCardProps {
  idea: Idea
  onMoveUp?: () => void
  onMoveDown?: () => void
  canMoveUp?: boolean
  canMoveDown?: boolean
}

function IdeaCard({ idea, onMoveUp, onMoveDown, canMoveUp, canMoveDown }: IdeaCardProps) {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['ideas'] })
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(idea.title)
  const [description, setDescription] = useState(idea.description ?? '')

  const toggle = useMutation({ mutationFn: () => ideasApi.update(idea.id, { done: !idea.done }), onSuccess: invalidate })
  const remove = useMutation({ mutationFn: () => ideasApi.delete(idea.id), onSuccess: invalidate })
  const save = useMutation({
    mutationFn: () => ideasApi.update(idea.id, { title: title.trim(), description: description.trim() || null }),
    onSuccess: () => { setEditing(false); invalidate() },
  })

  function startEdit() {
    setTitle(idea.title)
    setDescription(idea.description ?? '')
    setEditing(true)
  }

  if (editing) {
    return (
      <div className="space-y-2 rounded-xl bg-white p-3 shadow-sm ring-1 ring-primary-200 dark:bg-gray-800 dark:ring-primary-800">
        <input
          value={title}
          autoFocus
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={pl.ideas.descPlaceholder}
          rows={3}
          className="w-full resize-y rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        />
        <div className="flex gap-2">
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending || !title.trim()}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {pl.common.save}
          </button>
          <button
            onClick={() => setEditing(false)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-300"
          >
            {pl.common.cancel}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-2 rounded-xl bg-white px-3 py-3 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
      <input
        type="checkbox"
        checked={idea.done}
        onChange={() => toggle.mutate()}
        className="mt-0.5 h-5 w-5 shrink-0 rounded border-gray-300 text-primary-600"
      />
      <button onClick={startEdit} className="min-w-0 flex-1 text-left" title={pl.common.edit}>
        <span className={`block text-sm font-medium ${idea.done ? 'text-gray-300 line-through' : 'text-gray-900 dark:text-gray-100'}`}>
          {idea.title}
        </span>
        {idea.description && (
          <span className={`mt-1 block whitespace-pre-wrap text-sm ${idea.done ? 'text-gray-300' : 'text-gray-500 dark:text-gray-400'}`}>
            {idea.description}
          </span>
        )}
      </button>
      {(onMoveUp || onMoveDown) && (
        <div className="flex shrink-0 flex-col leading-none">
          <button onClick={onMoveUp} disabled={!canMoveUp} aria-label="↑" className="px-1 text-xs text-gray-400 hover:text-primary-500 disabled:opacity-20">▲</button>
          <button onClick={onMoveDown} disabled={!canMoveDown} aria-label="↓" className="px-1 text-xs text-gray-400 hover:text-primary-500 disabled:opacity-20">▼</button>
        </div>
      )}
      <button onClick={startEdit} className="shrink-0 text-gray-300 hover:text-primary-500" aria-label={pl.common.edit}>✏️</button>
      <button
        onClick={() => { if (confirm(pl.ideas.deleteConfirm)) remove.mutate() }}
        className="shrink-0 text-gray-300 hover:text-red-400"
        aria-label={pl.common.delete}
      >🗑</button>
    </div>
  )
}

export default function IdeasPage() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['ideas'], queryFn: () => ideasApi.list() })
  const items = data?.items ?? []
  const active = items.filter((i) => !i.done)
  const done = items.filter((i) => i.done)

  const reorder = useMutation({
    mutationFn: (orderedIds: number[]) =>
      Promise.all(orderedIds.map((id, i) => ideasApi.update(id, { sort_order: i }))),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ideas'] }),
  })

  function move(index: number, dir: -1 | 1) {
    const j = index + dir
    if (j < 0 || j >= active.length) return
    const ids = active.map((x) => x.id)
    ;[ids[index], ids[j]] = [ids[j], ids[index]]
    reorder.mutate(ids)
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">💡 {pl.ideas.title}</h1>

      <AddIdeaForm />

      {isLoading ? (
        <p className="text-gray-500">{pl.common.loading}</p>
      ) : items.length === 0 ? (
        <p className="py-4 text-center text-gray-400">{pl.ideas.empty}</p>
      ) : (
        <>
          {active.length > 0 && (
            <div className="space-y-2">
              {active.map((i, idx) => (
                <IdeaCard
                  key={i.id}
                  idea={i}
                  onMoveUp={() => move(idx, -1)}
                  onMoveDown={() => move(idx, 1)}
                  canMoveUp={idx > 0}
                  canMoveDown={idx < active.length - 1}
                />
              ))}
            </div>
          )}
          {done.length > 0 && (
            <div className="space-y-2 pt-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                {pl.ideas.doneSection} · {done.length}
              </h2>
              {done.map((i) => <IdeaCard key={i.id} idea={i} />)}
            </div>
          )}
        </>
      )}
    </div>
  )
}
