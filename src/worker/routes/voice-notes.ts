import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, voice_notes } from '../db/index'
import type { Env } from '../types'

const app = new Hono<{ Bindings: Env }>()

// GET /api/voice-notes  — list (newest first); audio bytes are streamed separately
app.get('/', async (c) => {
  const db = getDb(c.env.DB)
  const rows = await db.select().from(voice_notes).orderBy(voice_notes.created_at)
  return c.json({ items: rows.reverse(), total: rows.length })
})

// POST /api/voice-notes  — multipart: audio (Blob) + optional transcript/duration/mime
app.post('/', async (c) => {
  const form = await c.req.formData()
  const audio = form.get('audio') as unknown
  if (!audio || typeof (audio as Blob).arrayBuffer !== 'function') {
    return c.json({ error: 'missing_audio' }, 400)
  }
  const blob = audio as Blob
  const transcript = (form.get('transcript') as string | null)?.trim() || null
  const durationRaw = Number(form.get('duration'))
  const duration = Number.isFinite(durationRaw) && durationRaw > 0 ? Math.round(durationRaw) : null
  const mime = (form.get('mime') as string | null) || blob.type || 'audio/webm'

  const buf = await blob.arrayBuffer()
  const key = `vn/${Date.now()}-${Math.round(buf.byteLength)}`
  await c.env.KV.put(key, buf)

  const db = getDb(c.env.DB)
  const [row] = await db.insert(voice_notes).values({
    audio_key: key,
    mime,
    duration_sec: duration,
    transcript,
    transcript_source: transcript ? 'speech' : null,
  }).returning()
  return c.json(row, 201)
})

// GET /api/voice-notes/:id/audio  — stream the stored audio
app.get('/:id/audio', async (c) => {
  const id = Number(c.req.param('id'))
  const db = getDb(c.env.DB)
  const [row] = await db.select().from(voice_notes).where(eq(voice_notes.id, id))
  if (!row) return c.json({ error: 'Not found' }, 404)
  const data = await c.env.KV.get(row.audio_key, 'arrayBuffer')
  if (!data) return c.json({ error: 'audio_missing' }, 404)
  return new Response(data, {
    headers: { 'content-type': row.mime, 'cache-control': 'private, max-age=31536000' },
  })
})

// PATCH /api/voice-notes/:id  — edit transcript
app.patch('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const parsed = z.object({
    transcript: z.string().nullable().optional(),
    transcript_source: z.enum(['speech', 'manual', 'whisper', 'elevenlabs']).optional(),
  }).safeParse(await c.req.json())
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)
  const db = getDb(c.env.DB)
  const [row] = await db.update(voice_notes).set(parsed.data).where(eq(voice_notes.id, id)).returning()
  if (!row) return c.json({ error: 'Not found' }, 404)
  return c.json(row)
})

// POST /api/voice-notes/:id/transcribe  — server transcription of stored audio.
// Prefers Workers AI Whisper (@cf/openai/whisper); falls back to ElevenLabs STT
// if ELEVENLABS_API_KEY is set. Returns 501 when neither is configured.
app.post('/:id/transcribe', async (c) => {
  const id = Number(c.req.param('id'))
  const db = getDb(c.env.DB)
  const [row] = await db.select().from(voice_notes).where(eq(voice_notes.id, id))
  if (!row) return c.json({ error: 'Not found' }, 404)
  const audio = await c.env.KV.get(row.audio_key, 'arrayBuffer')
  if (!audio) return c.json({ error: 'audio_missing' }, 404)

  let transcript: string | null = null
  let source: 'whisper' | 'elevenlabs' | null = null

  if (c.env.AI) {
    try {
      const res = (await c.env.AI.run('@cf/openai/whisper', {
        audio: [...new Uint8Array(audio)],
      })) as { text?: string }
      transcript = res.text?.trim() || null
      source = 'whisper'
    } catch (e) {
      return c.json({ error: 'transcribe_failed', detail: (e as Error).message }, 502)
    }
  } else if (c.env.ELEVENLABS_API_KEY) {
    try {
      const fd = new FormData()
      fd.append('file', new Blob([audio], { type: row.mime }), 'note.webm')
      fd.append('model_id', 'scribe_v1')
      const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
        method: 'POST',
        headers: { 'xi-api-key': c.env.ELEVENLABS_API_KEY },
        body: fd,
      })
      if (!res.ok) return c.json({ error: 'transcribe_failed', status: res.status }, 502)
      const j = (await res.json()) as { text?: string }
      transcript = j.text?.trim() || null
      source = 'elevenlabs'
    } catch (e) {
      return c.json({ error: 'transcribe_failed', detail: (e as Error).message }, 502)
    }
  } else {
    return c.json({ error: 'not_configured' }, 501)
  }

  const [updated] = await db.update(voice_notes)
    .set({ transcript, transcript_source: source })
    .where(eq(voice_notes.id, id)).returning()
  return c.json(updated)
})

// DELETE /api/voice-notes/:id
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const db = getDb(c.env.DB)
  const [row] = await db.select().from(voice_notes).where(eq(voice_notes.id, id))
  if (row) {
    await c.env.KV.delete(row.audio_key)
    await db.delete(voice_notes).where(eq(voice_notes.id, id))
  }
  return c.json({ ok: true })
})

export { app as voiceNotesRouter }
