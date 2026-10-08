// In-app loading state in the boot screen's voice: a small orbit with a
// satellite, a monospace label and a 2px scanning line.
import pl from '../i18n/pl'

export default function Loader({ label = pl.common.loading, className = '' }: { label?: string; className?: string }) {
  return (
    <div className={`sx-loader ${className}`} role="status" aria-live="polite">
      <span className="sx-loader-orbit" aria-hidden="true" />
      <span className="hud-label text-[var(--sx-ink-3)]">{label.replace(/[.…]+$/, '')}</span>
      <span className="sx-loader-bar" aria-hidden="true"><b /></span>
    </div>
  )
}
