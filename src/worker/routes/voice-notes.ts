import { Hono } from 'hono'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, voice_notes } from '../db/index'
import type { AppEnv } from '../types'

const app = new Hono<AppEnv>()

// GET /api/voice-notes
app.get('/', async (c) => {
  const userId = c.var.userId
  const db = getDb(c.env.DB)
  const rows = await db.select().from(voice_notes)
    .where(eq(voice_notes.user_id, userId))
    .orderBy(voice_notes.created_at)
  return c.json({ items: rows.reverse(), total: rows.length })
})

// POST /api/voice-notes
app.post('/', async (c) => {
  const userId = c.var.userId
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
  const key = `vn/${userId}/${Date.now()}-${Math.round(buf.byteLength)}`
  await c.env.KV.put(key, buf)

  const db = getDb(c.env.DB)
  const [row] = await db.insert(voice_notes).values({
    user_id: userId,
    audio_key: key,
    mime,
    duration_sec: duration,
    transcript,
    transcript_source: transcript ? 'speech' : null,
  }).returning()
  return c.json(row, 201)
})

// GET /api/voice-notes/:id/audio
app.get('/:id/audio', async (c) => {
  const id = Number(c.req.param('id'))
  const userId = c.var.userId
  const db = getDb(c.env.DB)
  const [row] = await db.select().from(voice_notes)
    .where(and(eq(voice_notes.id, id), eq(voice_notes.user_id, userId)))
  if (!row) return c.json({ error: 'Not found' }, 404)
  const data = await c.env.KV.get(row.audio_key, 'arrayBuffer')
  if (!data) return c.json({ error: 'audio_missing' }, 404)
  return new Response(data, {
    headers: { 'content-type': row.mime, 'cache-control': 'private, max-age=31536000' },
  })
})

// PATCH /api/voice-notes/:id
app.patch('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const userId = c.var.userId
  const parsed = z.object({
    transcript: z.string().nullable().optional(),
    transcript_source: z.enum(['speech', 'manual', 'whisper', 'elevenlabs']).nullable().optional(),
  }).safeParse(await c.req.json())
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)
  const db = getDb(c.env.DB)
  const [row] = await db.update(voice_notes).set(parsed.data)
    .where(and(eq(voice_notes.id, id), eq(voice_notes.user_id, userId)))
    .returning()
  if (!row) return c.json({ error: 'Not found' }, 404)
  return c.json(row)
})

// DELETE /api/voice-notes/:id
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const userId = c.var.userId
  const db = getDb(c.env.DB)
  const [row] = await db.select().from(voice_notes)
    .where(and(eq(voice_notes.id, id), eq(voice_notes.user_id, userId)))
  if (row) await c.env.KV.delete(row.audio_key)
  await db.delete(voice_notes).where(and(eq(voice_notes.id, id), eq(voice_notes.user_id, userId)))
  return c.json({ ok: true })
})

// POST /api/voice-notes/:id/transcribe  — server-side Whisper
app.post('/:id/transcribe', async (c) => {
  const id = Number(c.req.param('id'))
  const userId = c.var.userId
  if (!c.env.AI) return c.json({ error: 'AI not configured' }, 503)
  const db = getDb(c.env.DB)
  const [row] = await db.select().from(voice_notes)
    .where(and(eq(voice_notes.id, id), eq(voice_notes.user_id, userId)))
  if (!row) return c.json({ error: 'Not found' }, 404)
  const data = await c.env.KV.get(row.audio_key, 'arrayBuffer')
  if (!data) return c.json({ error: 'audio_missing' }, 404)

  const ai = c.env.AI as { run: (model: string, opts: { audio: number[] }) => Promise<{ text?: string }> }
  const result = await ai.run('@cf/openai/whisper', { audio: [...new Uint8Array(data)] })
  const transcript = result?.text?.trim() || null

  const [updated] = await db.update(voice_notes)
    .set({ transcript, transcript_source: 'whisper' })
    .where(eq(voice_notes.id, id))
    .returning()
  return c.json(updated)
})

export { app as voiceNotesRouter }
