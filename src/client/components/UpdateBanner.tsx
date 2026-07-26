import pl from '../i18n/pl'

type Props = {
  onUpdate: () => void
  onDismiss: () => void
}

export function UpdateBanner({ onUpdate, onDismiss }: Props) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-20 left-4 right-4 z-50 md:left-auto md:right-6 md:bottom-6 md:w-auto"
    >
      <div className="flex items-center gap-3 rounded-xl bg-white px-4 py-3 shadow-lg ring-1 ring-black/10 dark:bg-gray-800 dark:ring-white/10">
        <span className="flex-1 text-sm font-medium text-gray-900 dark:text-gray-100">
          {pl.update.available}
        </span>
        <button
          onClick={onDismiss}
          className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400"
          aria-label={pl.update.dismiss}
        >
          {pl.update.dismiss}
        </button>
        <button
          onClick={onUpdate}
          className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
        >
          {pl.update.refresh}
        </button>
      </div>
    </div>
  )
}

type ForceUpdateProps = {
  onUpdate: () => void
}

export function ForceUpdateScreen({ onUpdate }: ForceUpdateProps) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-white px-8 dark:bg-gray-900">
      <div className="text-5xl">🔄</div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
        {pl.update.required}
      </h1>
      <p className="text-center text-gray-600 dark:text-gray-400">
        {pl.update.requiredBody}
      </p>
      <button
        onClick={onUpdate}
        className="rounded-xl bg-primary-600 px-6 py-3 text-base font-semibold text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
      >
        {pl.update.refresh}
      </button>
    </div>
  )
}
