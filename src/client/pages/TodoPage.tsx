import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { todosApi } from '../lib/api'
import pl from '../i18n/pl'
import type { Todo, TodoPriority } from '../../shared/types'

const PRIORITIES: TodoPriority[] = ['high', 'medium', 'low']

const PRIORITY_STYLE: Record<TodoPriority, { dot: string; label: string }> = {
  high: { dot: 'bg-red-500', label: 'text-red-600 dark:text-red-400' },
  medium: { dot: 'bg-amber-500', label: 'text-amber-600 dark:text-amber-400' },
  low: { dot: 'bg-sky-500', label: 'text-sky-600 dark:text-sky-400' },
}

function AddTodoForm() {
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<TodoPriority>('medium')

  const create = useMutation({
    mutationFn: () => todosApi.create({ title: title.trim(), priority }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['todos'] }); setTitle('') },
  })

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
      <div className="space-y-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && title.trim() && create.mutate()}
          placeholder={pl.todos.placeholder}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        />
        <div className="flex gap-2">
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as TodoPriority)}
            aria-label={pl.todos.priority}
            className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          >
            {PRIORITIES.map((p) => <option key={p} value={p}>{pl.todos.priorities[p]}</option>)}
          </select>
          <button
            onClick={() => create.mutate()}
            disabled={create.isPending || !title.trim()}
            className="rounded-xl bg-primary-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {create.isPending ? '…' : pl.todos.add}
          </button>
        </div>
      </div>
    </div>
  )
}

interface TodoRowProps {
  todo: Todo
  onMoveUp?: () => void
  onMoveDown?: () => void
  canMoveUp?: boolean
  canMoveDown?: boolean
}

function TodoRow({ todo, onMoveUp, onMoveDown, canMoveUp, canMoveDown }: TodoRowProps) {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['todos'] })
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(todo.title)
  const [priority, setPriority] = useState<TodoPriority>(todo.priority)

  const toggle = useMutation({ mutationFn: () => todosApi.update(todo.id, { done: !todo.done }), onSuccess: invalidate })
  const remove = useMutation({ mutationFn: () => todosApi.delete(todo.id), onSuccess: invalidate })
  const save = useMutation({
    mutationFn: () => todosApi.update(todo.id, { title: title.trim(), priority }),
    onSuccess: () => { setEditing(false); invalidate() },
  })

  function startEdit() {
    setTitle(todo.title)
    setPriority(todo.priority)
    setEditing(true)
  }

  if (editing) {
    return (
      <div className="space-y-2 rounded-xl bg-white p-3 shadow-sm ring-1 ring-primary-200 dark:bg-gray-800 dark:ring-primary-800">
        <input
          value={title}
          autoFocus
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && title.trim()) save.mutate(); if (e.key === 'Escape') setEditing(false) }}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        />
        <div className="flex gap-2">
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as TodoPriority)}
            className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          >
            {PRIORITIES.map((p) => <option key={p} value={p}>{pl.todos.priorities[p]}</option>)}
          </select>
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

  const s = PRIORITY_STYLE[todo.priority]
  return (
    <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-3 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
      <input
        type="checkbox"
        checked={todo.done}
        onChange={() => toggle.mutate()}
        className="h-5 w-5 shrink-0 rounded border-gray-300 text-primary-600"
      />
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${s.dot}`} aria-hidden="true" />
      <button
        onClick={startEdit}
        className={`flex-1 truncate text-left text-sm ${todo.done ? 'text-gray-300 line-through' : 'text-gray-900 dark:text-gray-100'}`}
        title={pl.common.edit}
      >
        {todo.title}
      </button>
      {(onMoveUp || onMoveDown) && (
        <div className="flex shrink-0 flex-col leading-none">
          <button
            onClick={onMoveUp}
            disabled={!canMoveUp}
            aria-label="↑"
            className="px-1 text-xs text-gray-400 hover:text-primary-500 disabled:opacity-20"
          >▲</button>
          <button
            onClick={onMoveDown}
            disabled={!canMoveDown}
            aria-label="↓"
            className="px-1 text-xs text-gray-400 hover:text-primary-500 disabled:opacity-20"
          >▼</button>
        </div>
      )}
      <button onClick={startEdit} className="shrink-0 text-gray-300 hover:text-primary-500" aria-label={pl.common.edit}>✏️</button>
      <button
        onClick={() => { if (confirm(pl.todos.deleteConfirm)) remove.mutate() }}
        className="shrink-0 text-gray-300 hover:text-red-400"
        aria-label={pl.common.delete}
      >🗑</button>
    </div>
  )
}

export default function TodoPage() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['todos'], queryFn: () => todosApi.list() })
  const items = data?.items ?? []
  const active = items.filter((t) => !t.done)
  const done = items.filter((t) => t.done)

  // Persist a group's manual order by writing sequential sort_order values.
  const reorder = useMutation({
    mutationFn: (orderedIds: number[]) =>
      Promise.all(orderedIds.map((id, i) => todosApi.update(id, { sort_order: i }))),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['todos'] }),
  })

  function move(group: Todo[], index: number, dir: -1 | 1) {
    const j = index + dir
    if (j < 0 || j >= group.length) return
    const ids = group.map((t) => t.id)
    ;[ids[index], ids[j]] = [ids[j], ids[index]]
    reorder.mutate(ids)
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">✅ {pl.todos.title}</h1>

      <AddTodoForm />

      {isLoading ? (
        <p className="text-gray-500">{pl.common.loading}</p>
      ) : items.length === 0 ? (
        <p className="py-4 text-center text-gray-400">{pl.todos.empty}</p>
      ) : (
        <>
          {PRIORITIES.map((p) => {
            const group = active.filter((t) => t.priority === p)
            if (group.length === 0) return null
            const s = PRIORITY_STYLE[p]
            return (
              <div key={p} className="space-y-2">
                <h2 className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-wide ${s.label}`}>
                  <span className={`h-2.5 w-2.5 rounded-full ${s.dot}`} aria-hidden="true" />
                  {pl.todos.priorities[p]}
                </h2>
                {group.map((t, i) => (
                  <TodoRow
                    key={t.id}
                    todo={t}
                    onMoveUp={() => move(group, i, -1)}
                    onMoveDown={() => move(group, i, 1)}
                    canMoveUp={i > 0}
                    canMoveDown={i < group.length - 1}
                  />
                ))}
              </div>
            )
          })}

          {done.length > 0 && (
            <div className="space-y-2 pt-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                {pl.todos.doneSection} · {done.length}
              </h2>
              {done.map((t) => <TodoRow key={t.id} todo={t} />)}
            </div>
          )}
        </>
      )}
    </div>
  )
}
