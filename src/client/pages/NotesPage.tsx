import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { voiceNotesApi } from '../lib/api'
import pl from '../i18n/pl'
import type { VoiceNote } from '../../shared/types'

/* eslint-disable @typescript-eslint/no-explicit-any */

function pickMime(): string {
  const MR = (window as any).MediaRecorder
  if (MR?.isTypeSupported) {
    for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']) {
      if (MR.isTypeSupported(m)) return m
    }
  }
  return ''
}

function fmtDate(ts: number) {
  const d = new Date(ts * 1000)
  return d.toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function Recorder() {
  const qc = useQueryClient()
  const [recording, setRecording] = useState(false)
  const [saving, setSaving] = useState(false)
  const [live, setLive] = useState('')
  const [error, setError] = useState<string | null>(null)

  const recorderRef = useRef<any>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const recognitionRef = useRef<any>(null)
  const finalRef = useRef('')
  const startedRef = useRef(0)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => () => {
    try { recognitionRef.current?.stop() } catch { /* noop */ }
    streamRef.current?.getTracks().forEach((t) => t.stop())
  }, [])

  async function start() {
    setError(null)
    if (!navigator.mediaDevices?.getUserMedia || !(window as any).MediaRecorder) {
      setError(pl.notes.unsupported); return
    }
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setError(pl.notes.micDenied); return
    }
    streamRef.current = stream

    const mime = pickMime()
    const rec = new (window as any).MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
    chunksRef.current = []
    rec.ondataavailable = (e: any) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    rec.onstop = onStop
    recorderRef.current = rec

    // Native live speech-to-text (Android / Chrome / Safari), best-effort.
    finalRef.current = ''
    setLive('')
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (SR) {
      const r = new SR()
      r.lang = 'pl-PL'
      r.continuous = true
      r.interimResults = true
      r.onresult = (e: any) => {
        let interim = ''
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript
          if (e.results[i].isFinal) finalRef.current += t + ' '
          else interim += t
        }
        setLive((finalRef.current + interim).trim())
      }
      r.onerror = () => { /* ignore; audio still recorded */ }
      recognitionRef.current = r
      try { r.start() } catch { /* noop */ }
    }

    startedRef.current = Date.now()
    rec.start()
    setRecording(true)
  }

  async function onStop() {
    const mime = recorderRef.current?.mimeType || 'audio/webm'
    const blob = new Blob(chunksRef.current, { type: mime })
    const duration = Math.max(1, Math.round((Date.now() - startedRef.current) / 1000))
    const transcript = (finalRef.current || live).trim()
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setSaving(true)
    try {
      await voiceNotesApi.create(blob, { transcript, duration, mime })
      qc.invalidateQueries({ queryKey: ['voice-notes'] })
    } finally {
      setSaving(false)
      setLive('')
      finalRef.current = ''
    }
  }

  function stop() {
    try { recognitionRef.current?.stop() } catch { /* noop */ }
    recognitionRef.current = null
    recorderRef.current?.stop()
    setRecording(false)
  }

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
      <button
        onClick={recording ? stop : start}
        disabled={saving}
        className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white disabled:opacity-60 ${
          recording ? 'bg-red-500' : 'bg-primary-600'
        }`}
      >
        {saving ? pl.notes.saving
          : recording ? <><span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-white" /> {pl.notes.stop}</>
          : <>🎙️ {pl.notes.record}</>}
      </button>
      {recording && (
        <p className="mt-3 min-h-[2.5rem] whitespace-pre-wrap rounded-lg bg-gray-50 p-2 text-sm text-gray-700 dark:bg-gray-900 dark:text-gray-200">
          {live || <span className="text-gray-400">{pl.notes.recording}</span>}
        </p>
      )}
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </div>
  )
}

function NoteCard({ note }: { note: VoiceNote }) {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['voice-notes'] })
  const [text, setText] = useState(note.transcript ?? '')
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => { setText(note.transcript ?? '') }, [note.transcript])

  const save = useMutation({
    mutationFn: () => voiceNotesApi.update(note.id, { transcript: text.trim() || null, transcript_source: 'manual' }),
    onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 1500); invalidate() },
  })
  const transcribe = useMutation({
    mutationFn: () => voiceNotesApi.transcribe(note.id),
    onSuccess: (n) => { setText(n.transcript ?? ''); invalidate() },
    onError: (e) => {
      const msg = (e as Error).message
      setErr(/not_configured/.test(msg) ? pl.notes.transcribeNotConfigured : pl.notes.transcribeFailed)
      setTimeout(() => setErr(null), 4000)
    },
  })
  const remove = useMutation({
    mutationFn: () => voiceNotesApi.delete(note.id),
    onSuccess: invalidate,
  })

  return (
    <div className="space-y-2 rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">
          {fmtDate(note.created_at)}{note.duration_sec ? ` · ${note.duration_sec}s` : ''}
        </span>
        <button
          onClick={() => { if (confirm(pl.notes.deleteConfirm)) remove.mutate() }}
          className="text-gray-300 hover:text-red-400"
          aria-label={pl.common.delete}
        >
          🗑
        </button>
      </div>

      <audio controls preload="none" src={voiceNotesApi.audioUrl(note.id)} className="w-full" />

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={pl.notes.transcriptPlaceholder}
        rows={Math.min(8, Math.max(2, Math.ceil((text.length || 1) / 60)))}
        className="w-full resize-y rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending || text === (note.transcript ?? '')}
          className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {saved ? pl.notes.saved : pl.notes.save}
        </button>
        <button
          onClick={() => transcribe.mutate()}
          disabled={transcribe.isPending}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200"
        >
          {transcribe.isPending ? pl.notes.transcribing : pl.notes.transcribe}
        </button>
        {note.transcript_source && (
          <span className="text-[11px] text-gray-400">{note.transcript_source}</span>
        )}
        {err && <span className="text-xs text-red-500">{err}</span>}
      </div>
    </div>
  )
}

export default function NotesPage() {
  const { data, isLoading } = useQuery({ queryKey: ['voice-notes'], queryFn: () => voiceNotesApi.list() })
  const items = data?.items ?? []

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">🎙️ {pl.notes.title}</h1>
      <p className="text-xs text-gray-400">{pl.notes.hint}</p>

      <Recorder />

      {isLoading ? (
        <p className="text-gray-500">{pl.common.loading}</p>
      ) : items.length === 0 ? (
        <p className="py-4 text-center text-gray-400">{pl.notes.empty}</p>
      ) : (
        <div className="space-y-3">
          {items.map((n) => <NoteCard key={n.id} note={n} />)}
        </div>
      )}
    </div>
  )
}
