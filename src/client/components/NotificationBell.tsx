import Icon from './Icon'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { notificationsApi, type AppNotification } from '../lib/api'
import { playChime } from '../lib/sound'
import pl from '../i18n/pl'

// Older notifications were stored with emoji in their text; the SpaceX look has none.
const EMOJI = /(?:[\u{1F300}-\u{1FAFF}\u{2600}-\u{2712}\u{2714}-\u{27BF}\u{2B50}]\u{FE0F}?)+/gu
const clean = (s: string | null | undefined) => (s ?? '').replace(EMOJI, '').replace(/\s{2,}/g, ' ').trim()

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
  const sheetRef = useRef<HTMLDivElement>(null)

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
      const t = e.target as Node
      if (rootRef.current?.contains(t) || sheetRef.current?.contains(t)) return
      setOpen(false)
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
        className="sx-iconbtn relative h-10 w-10"
      >
        <span className={`inline-block leading-none ${shake ? 'animate-bell-shake' : ''}`} aria-hidden="true"><Icon name="bell" size={18} /></span>
        {unread > 0 && (
          <>
            <span className="absolute right-1 top-1 flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping-slow rounded-full bg-[var(--sx-bad)] opacity-70" />
            </span>
            <span className="sx-badge absolute right-0 top-0.5 animate-pop">
              {unread > 99 ? '99+' : unread}
            </span>
          </>
        )}
      </button>

      {open && (
        // Desktop: anchored under the bell.
        <div className="sx-panel absolute right-0 top-12 z-50 hidden w-[24rem] animate-fade-in border border-[var(--sx-line-2)] bg-[var(--sx-ground)] md:block">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--sx-line)] px-4 py-3">
            <span className="hud-label text-[var(--sx-ink-2)]">
              {pl.notifications.title}{unread > 0 && <span className="ml-2 text-[var(--sx-bad)]">{unread}</span>}
            </span>
            {unread > 0 && (
              <button onClick={() => readAll.mutate()} className="hud-label text-[10px] text-[var(--sx-ink-3)] hover:text-[var(--sx-ink)]">
                {pl.notifications.markAllRead}
              </button>
            )}
          </div>
          <div className="max-h-[min(70vh,34rem)] overflow-y-auto overscroll-contain">
            {items.length === 0 ? (
              <p className="hud-label px-4 py-10 text-center text-[var(--sx-ink-3)]">{pl.notifications.empty}</p>
            ) : (
              <ul>
                {items.map((n) => {
                  const unreadItem = n.read_at == null
                  return (
                    <li key={n.id} className="border-b border-[var(--sx-line)] last:border-b-0">
                      <button
                        onClick={() => openItem(n)}
                        className="relative flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-[var(--sx-wash)]"
                      >
                        {unreadItem && <span className="absolute inset-y-0 left-0 w-px bg-[var(--sx-bad)]" aria-hidden="true" />}
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-3">
                            <span className={`min-w-0 text-sm leading-snug ${unreadItem ? 'font-medium text-[var(--sx-ink)]' : 'text-[var(--sx-ink-2)]'}`}>
                              {clean(n.title)}
                            </span>
                            <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--sx-ink-3)]">{relTime(n.created_at)}</span>
                          </span>
                          {n.body && <span className="mt-1 block text-xs leading-relaxed text-[var(--sx-ink-3)]">{clean(n.body)}</span>}
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
      {open && createPortal(
        // Phones: a full-width sheet under the top bar, rendered into <body>.
        // Inside the header it would be trapped: the bar's backdrop-filter makes
        // it the containing block for `position: fixed`, so the scrim covered
        // only the bar and the sheet ran off the right edge.
        <div className="md:hidden">
          <div className="fixed inset-0 z-40 animate-fade-in bg-black/60 backdrop-blur-[2px]"
            onClick={() => setOpen(false)} aria-hidden="true" />
          <div ref={sheetRef} className="sx-panel fixed inset-x-3 top-[calc(env(safe-area-inset-top,0px)+3.75rem)] z-50 animate-fade-in border border-[var(--sx-line-2)] bg-[var(--sx-ground)]">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--sx-line)] px-4 py-3">
              <span className="hud-label text-[var(--sx-ink-2)]">
                {pl.notifications.title}{unread > 0 && <span className="ml-2 text-[var(--sx-bad)]">{unread}</span>}
              </span>
              {unread > 0 && (
                <button onClick={() => readAll.mutate()} className="hud-label text-[10px] text-[var(--sx-ink-3)] hover:text-[var(--sx-ink)]">
                  {pl.notifications.markAllRead}
                </button>
              )}
            </div>
            <div className="max-h-[min(70vh,34rem)] overflow-y-auto overscroll-contain">
              {items.length === 0 ? (
                <p className="hud-label px-4 py-10 text-center text-[var(--sx-ink-3)]">{pl.notifications.empty}</p>
              ) : (
                <ul>
                  {items.map((n) => {
                    const unreadItem = n.read_at == null
                    return (
                      <li key={n.id} className="border-b border-[var(--sx-line)] last:border-b-0">
                        <button
                          onClick={() => openItem(n)}
                          className="relative flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-[var(--sx-wash)]"
                        >
                          {unreadItem && <span className="absolute inset-y-0 left-0 w-px bg-[var(--sx-bad)]" aria-hidden="true" />}
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline justify-between gap-3">
                              <span className={`min-w-0 text-sm leading-snug ${unreadItem ? 'font-medium text-[var(--sx-ink)]' : 'text-[var(--sx-ink-2)]'}`}>
                                {clean(n.title)}
                              </span>
                              <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--sx-ink-3)]">{relTime(n.created_at)}</span>
                            </span>
                            {n.body && <span className="mt-1 block text-xs leading-relaxed text-[var(--sx-ink-3)]">{clean(n.body)}</span>}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
