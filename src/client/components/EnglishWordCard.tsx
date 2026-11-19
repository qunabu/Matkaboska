// Flashcard with one English word, shown when the app is opened (and again
// after it has been in the background for a while). The word is picked by a
// small Leitner scheme kept in localStorage: "Pamiętam" pushes a word to a
// later box, "Nie pamiętam" sends it back to the start.
import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from './Icon'
import { ENGLISH_WORDS, type EnglishWord } from '../lib/englishWords'
import { useModuleSettings } from '../lib/moduleSettings'

const SRS_KEY = 'english-srs'
const SESSION_KEY = 'english-shown'
const AWAY_MS = 30 * 60_000
const DAY = 86_400_000
const BOX_DAYS = [0, 1, 3, 7, 21, 60]

type Srs = Record<string, { box: number; due: number }>

function loadSrs(): Srs {
  try { return JSON.parse(localStorage.getItem(SRS_KEY) || '{}') } catch { return {} }
}
function saveSrs(s: Srs) {
  try { localStorage.setItem(SRS_KEY, JSON.stringify(s)) } catch { /* private mode */ }
}

// Every opening is a coin toss: a word I have never seen (a surprise from the
// pool) or a review of one that is due. Once the surprises run out, only the
// Leitner reviews remain.
function pickWord(exclude?: string): EnglishWord {
  const srs = loadSrs()
  const now = Date.now()
  const pool = ENGLISH_WORDS.filter((w) => w.word !== exclude)
  const random = (list: EnglishWord[]) => list[Math.floor(Math.random() * list.length)]
  const unseenOwn = pool.filter((w) => w.own && !srs[w.word])
  if (unseenOwn.length) return random(unseenOwn)
  const unseen = pool.filter((w) => !srs[w.word])
  const due = pool.filter((w) => srs[w.word] && srs[w.word].due <= now)
  if (unseen.length && (!due.length || Math.random() < 0.5)) return random(unseen)
  if (due.length) {
    const minBox = Math.min(...due.map((w) => srs[w.word].box))
    return random(due.filter((w) => srs[w.word].box === minBox))
  }
  return [...pool].sort((a, b) => (srs[a.word]?.due ?? 0) - (srs[b.word]?.due ?? 0))[0]
}

function grade(word: string, known: boolean) {
  const srs = loadSrs()
  const box = known ? Math.min((srs[word]?.box ?? 0) + 1, BOX_DAYS.length - 1) : 0
  srs[word] = { box, due: Date.now() + BOX_DAYS[box] * DAY }
  saveSrs(srs)
}

function speak(text: string) {
  if (!('speechSynthesis' in window)) return
  const synth = window.speechSynthesis
  synth.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'en-US'
  u.rate = 0.85
  const voice = synth.getVoices().find((v) => v.lang === 'en-US') ?? synth.getVoices().find((v) => v.lang.startsWith('en'))
  if (voice) u.voice = voice
  synth.speak(u)
}

function alreadyShown() {
  try { return sessionStorage.getItem(SESSION_KEY) === '1' } catch { return false }
}
function markShown() {
  try { sessionStorage.setItem(SESSION_KEY, '1') } catch { /* ignore */ }
}

export default function EnglishWordCard() {
  const { english } = useModuleSettings()
  const [word, setWord] = useState<EnglishWord | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [isNew, setIsNew] = useState(false)

  const open = useCallback((exclude?: string) => {
    const next = pickWord(exclude)
    setIsNew(!loadSrs()[next.word])
    setWord(next)
    setRevealed(false)
    markShown()
  }, [])

  // On launch, and again when the app comes back after being away a while.
  useEffect(() => {
    if (!english) return
    if (!alreadyShown()) open()
    let hiddenAt = 0
    const onVis = () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now()
      else if (hiddenAt && Date.now() - hiddenAt > AWAY_MS) open()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [english, open])

  // Voices load asynchronously in Chrome; touching the list warms it up.
  useEffect(() => { if ('speechSynthesis' in window) window.speechSynthesis.getVoices() }, [])

  if (!english || !word) return null

  const close = () => { window.speechSynthesis?.cancel(); setWord(null) }
  const answer = (known: boolean) => { grade(word.word, known); close() }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-4 backdrop-blur-[2px] animate-fade-in md:items-center"
      onClick={close}>
      <div role="dialog" aria-modal="true" aria-label="Słówko na dziś"
        className="sx-panel w-full max-w-md border border-[var(--sx-line-2)] bg-[var(--sx-ground)] pb-safe"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[var(--sx-line)] px-4 py-3">
          <span className="hud-label text-[var(--sx-ink-2)]">
            English · {isNew ? (word.own ? 'z twojej listy' : 'niespodzianka') : 'powtórka'}
          </span>
          <button onClick={close} aria-label="Zamknij" className="sx-iconbtn p-1 text-[var(--sx-ink-3)]">
            <Icon name="close" size={14} />
          </button>
        </div>

        <div className="px-5 pb-5 pt-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="break-words font-cond text-4xl font-semibold tracking-wide text-[var(--sx-ink)]">{word.word}</h2>
              <p className="mt-1 font-mono text-sm text-[var(--sx-ink-2)]">
                {word.ipa} <span className="ml-2 text-[var(--sx-ink-3)]">{word.pos}</span>
              </p>
            </div>
            <button onClick={() => speak(word.word)} aria-label="Wymowa"
              className="sx-iconbtn sx-iconbtn--boxed shrink-0 p-3 text-[var(--sx-ink)]">
              <Icon name="speaker" size={20} />
            </button>
          </div>

          {word.tip && <p className="mt-3 text-sm text-[var(--sx-ink-2)]">{word.tip}</p>}

          {revealed ? (
            <div className="mt-5 animate-fade-in border-t border-[var(--sx-line)] pt-4">
              <p className="text-lg text-[var(--sx-ink)]">{word.pl}</p>
              <button onClick={() => speak(word.example)}
                className="mt-3 flex w-full items-start gap-2 text-left text-sm italic text-[var(--sx-ink-2)] hover:text-[var(--sx-ink)]">
                <Icon name="speaker" size={14} className="mt-0.5 shrink-0" />
                <span>{word.example}</span>
              </button>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <button onClick={() => answer(false)} className="sx-btn">Nie pamiętam</button>
                <button onClick={() => answer(true)} className="sx-btn sx-btn--primary">Pamiętam</button>
              </div>
            </div>
          ) : (
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button onClick={() => open(word.word)} className="sx-btn">Inne</button>
              <button onClick={() => { setRevealed(true); speak(word.word) }} className="sx-btn sx-btn--primary">Pokaż znaczenie</button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
