import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { todosApi } from '../lib/api'
import pl from '../i18n/pl'
import type { Todo, TodoPriority } from '../../shared/types'

const PRIORITIES: TodoPriority[] = ['high', 'medium', 'low']

const PRIORITY_STYLE: Record<TodoPriority, { dot: string; label: string; ring: string }> = {
  high: { dot: 'bg-red-500', label: 'text-red-600 dark:text-red-400', ring: 'ring-red-100 dark:ring-red-900/40' },
  medium: { dot: 'bg-amber-500', label: 'text-amber-600 dark:text-amber-400', ring: 'ring-amber-100 dark:ring-amber-900/40' },
  low: { dot: 'bg-sky-500', label: 'text-sky-600 dark:text-sky-400', ring: 'ring-sky-100 dark:ring-sky-900/40' },
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

function TodoRow({ todo }: { todo: Todo }) {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['todos'] })
  const toggle = useMutation({
    mutationFn: () => todosApi.update(todo.id, { done: !todo.done }),
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: () => todosApi.delete(todo.id),
    onSuccess: invalidate,
  })
  const s = PRIORITY_STYLE[todo.priority]

  return (
    <div className="flex items-center gap-3 rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
      <input
        type="checkbox"
        checked={todo.done}
        onChange={() => toggle.mutate()}
        className="h-5 w-5 rounded border-gray-300 text-primary-600"
      />
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${s.dot}`} aria-hidden="true" />
      <span className={`flex-1 text-sm ${todo.done ? 'text-gray-300 line-through' : 'text-gray-900 dark:text-gray-100'}`}>
        {todo.title}
      </span>
      <button
        onClick={() => { if (confirm(pl.todos.deleteConfirm)) remove.mutate() }}
        className="shrink-0 text-gray-300 hover:text-red-400"
        aria-label={pl.common.delete}
      >
        🗑
      </button>
    </div>
  )
}

export default function TodoPage() {
  const { data, isLoading } = useQuery({ queryKey: ['todos'], queryFn: () => todosApi.list() })
  const items = data?.items ?? []
  const active = items.filter((t) => !t.done)
  const done = items.filter((t) => t.done)

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
                {group.map((t) => <TodoRow key={t.id} todo={t} />)}
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
