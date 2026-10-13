import { useId, useState } from 'react'
import { LockIcon } from './icons'
import { useI18n, type Key } from './i18n'
import { occupationDisplayName } from './occupationSearch'
import { timeAgo, type HistoryEntry } from './saved'

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
      className={`size-4 shrink-0 text-stone-500 transition-transform ${open ? 'rotate-180' : ''}`}
    >
      <path d="m5 7.5 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// The visitor's earlier submissions on this device, collapsed until they ask for it. Each row opens that
// result with its full analysis.
export function HistoryList(props: {
  entries: HistoryEntry[]
  onOpen: (id: string) => void
  onClear: () => void
}) {
  const { t, lang } = useI18n()
  const [open, setOpen] = useState(false)
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
        <span className="text-base font-semibold tracking-tight">{t('hist.titleCount', { n: props.entries.length })}</span>
        <Chevron open={open} />
      </button>

      {open && (
        <div id={panelId} className="pb-2">
          <p className="flex items-start gap-1.5 text-xs leading-relaxed text-stone-500">
            <LockIcon className="mt-0.5 size-3.5 text-emerald-700" />
            <span>{t('hist.sub')}</span>
          </p>

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

          <button
            onClick={props.onClear}
            title={t('hist.clearNote')}
            className="mt-1 min-h-11 text-sm text-stone-500 active:text-stone-900"
          >
            {t('hist.clear')}
          </button>
          <p className="text-xs text-stone-400">{t('hist.clearNote')}</p>
        </div>
      )}
    </section>
  )
}
