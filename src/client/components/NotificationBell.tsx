import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { notificationsApi, type AppNotification } from '../lib/api'
import { playChime } from '../lib/sound'
import pl from '../i18n/pl'

function relTime(unix: number): string {
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - unix)
  if (diff < 60) return pl.notifications.now
  if (diff < 3600) return pl.notifications.min(Math.floor(diff / 60))
  if (diff < 86400) return pl.notifications.hour(Math.floor(diff / 3600))
  return pl.notifications.day(Math.floor(diff / 86400))
}

export default function NotificationBell() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [shake, setShake] = useState(false)
  const prevUnread = useRef<number | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationsApi.list(),
    refetchInterval: 45_000,
    refetchOnWindowFocus: true,
  })
  const unread = data?.unread ?? 0
  const items = data?.items ?? []

  // Chime + shake whenever the unread count rises (skip the very first load).
  useEffect(() => {
    if (data == null) return
    if (prevUnread.current != null && unread > prevUnread.current) {
      playChime()
      setShake(true)
      const t = setTimeout(() => setShake(false), 900)
      prevUnread.current = unread
      return () => clearTimeout(t)
    }
    prevUnread.current = unread
  }, [unread, data])

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  const readOne = useMutation({
    mutationFn: (id: number) => notificationsApi.read(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
  const readAll = useMutation({
    mutationFn: () => notificationsApi.readAll(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  function openItem(n: AppNotification) {
    if (n.read_at == null) readOne.mutate(n.id)
    if (n.url) { setOpen(false); navigate(n.url) }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={pl.notifications.title}
        className="relative flex h-10 w-10 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-100"
      >
        <span className={`text-xl leading-none ${shake ? 'animate-bell-shake' : ''}`} aria-hidden="true">🔔</span>
        {unread > 0 && (
          <>
            <span className="absolute right-1 top-1 flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping-slow rounded-full bg-primary-500/70" />
            </span>
            <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] animate-pop items-center justify-center rounded-full bg-primary-600 px-1 text-[10px] font-bold text-white ring-2 ring-white dark:ring-ink-800">
              {unread > 99 ? '99+' : unread}
            </span>
          </>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-[min(22rem,calc(100vw-1.5rem))] origin-top-right animate-scale-in overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-white/10 dark:bg-ink-700">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-white/10">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{pl.notifications.title}</h3>
            {unread > 0 && (
              <button
                onClick={() => readAll.mutate()}
                className="text-xs font-medium text-primary-600 hover:text-primary-500 dark:text-primary-400"
              >
                {pl.notifications.markAllRead}
              </button>
            )}
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-gray-400">{pl.notifications.empty}</p>
            ) : (
              <ul className="divide-y divide-gray-50 dark:divide-white/5">
                {items.map((n) => {
                  const unreadItem = n.read_at == null
                  return (
                    <li key={n.id}>
                      <button
                        onClick={() => openItem(n)}
                        className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-white/5 ${unreadItem ? 'bg-primary-50/60 dark:bg-primary-500/5' : ''}`}
                      >
                        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${unreadItem ? 'bg-primary-500' : 'bg-transparent'}`} />
                        <span className="min-w-0 flex-1">
                          <span className={`block truncate text-sm ${unreadItem ? 'font-semibold text-gray-900 dark:text-gray-100' : 'font-medium text-gray-700 dark:text-gray-300'}`}>
                            {n.title}
                          </span>
                          <span className="mt-0.5 block text-xs text-gray-500 line-clamp-2 dark:text-gray-400">{n.body}</span>
                          <span className="mt-1 block text-[11px] text-gray-400">{relTime(n.created_at)}</span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
