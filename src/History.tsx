import { useId, useState } from 'react'
import { ChevronIcon } from './icons'
import { useI18n, type Key } from './i18n'
import { occupationDisplayName } from './occupationSearch'
import { timeAgo, type HistoryEntry } from './saved'

// The visitor's submission on this device, expanded by default and can be collapsed. Each row opens that
// result with its full analysis.
export function HistoryList(props: {
  entries: HistoryEntry[]
  onOpen: (id: string) => void
}) {
  const { t, lang } = useI18n()
  const [open, setOpen] = useState(true)
  const panelId = useId()

  return (
    <section aria-label={t('hist.title')} className="mt-10 border-t border-stone-200">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex min-h-14 w-full items-center justify-between gap-3 text-left"
      >
        <span className="text-base font-semibold tracking-tight">{t('hist.title')}</span>
        <ChevronIcon open={open} />
      </button>

      {open && (
        <div id={panelId} className="pb-2">
          <ul className="mt-3 grid gap-2">
            {props.entries.map((e) => (
              <li key={e.id}>
                <a
                  href={`/r/${e.id}`}
                  onClick={(ev) => {
                    // Let the browser handle new-tab and modified clicks.
                    if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button !== 0) return
                    ev.preventDefault()
                    props.onOpen(e.id)
                  }}
                  className="flex min-h-16 items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 transition hover:border-accent active:scale-[0.99] active:bg-indigo-50"
                >
                  <span className="min-w-0">
                    <span className="block text-lg font-semibold tracking-tight tabular-nums">
                      {t('hist.points', { total: e.total })}
                    </span>
                    <span className="block truncate text-xs text-stone-500">
                      {t(`loc.${e.location}` as Key)} ·{' '}
                      {e.occupationCode ? occupationDisplayName(e.occupationCode, lang) : (e.occupation ?? t('hist.noOcc'))}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-stone-400">
                    {timeAgo(e.savedAt, lang)} <span aria-hidden="true">›</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>

        </div>
      )}
    </section>
  )
}
