// Removes the boot screen from index.html once the app knows what to show
// (login, onboarding or the app itself). It stays on screen for a moment at
// least, so a fast load reads as a launch sequence rather than a flash.
const MIN_VISIBLE_MS = 900
let done = false

export function hidePreloader() {
  if (done) return
  done = true
  const el = document.getElementById('boot')
  if (!el) return
  const wait = Math.max(0, MIN_VISIBLE_MS - performance.now())
  setTimeout(() => {
    el.classList.add('is-done')
    setTimeout(() => el.remove(), 600)
  }, wait)
}
