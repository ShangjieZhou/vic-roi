import { useState } from 'react'
import { LockIcon } from './icons'
import { useI18n, type Key } from './i18n'
import { timeAgo, type HistoryEntry } from './saved'

const COLLAPSED = 3

// The visitor's earlier submissions on this device. Each row opens that result with its full analysis.
export function HistoryList(props: {
  entries: HistoryEntry[]
  onOpen: (id: string) => void
  onClear: () => void
}) {
  const { t, lang } = useI18n()
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? props.entries : props.entries.slice(0, COLLAPSED)
  const hidden = props.entries.length - COLLAPSED

  return (
    <section aria-label={t('hist.title')} className="mb-8">
      <h2 className="text-lg font-semibold tracking-tight">{t('hist.title')}</h2>
      <p className="mt-1 flex items-start gap-1.5 text-xs leading-relaxed text-stone-500">
        <LockIcon className="mt-0.5 size-3.5 text-emerald-700" />
        <span>{t('hist.sub')}</span>
      </p>

      <ul className="mt-3 grid gap-2">
        {shown.map((e) => (
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
                  {t(`loc.${e.location}` as Key)} · {e.occupation ?? t('hist.noOcc')}
                </span>
              </span>
              <span className="shrink-0 text-xs text-stone-400">
                {timeAgo(e.savedAt, lang)} <span aria-hidden="true">›</span>
              </span>
            </a>
          </li>
        ))}
      </ul>

      <div className="mt-2 flex flex-wrap items-center gap-x-4">
        {hidden > 0 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="min-h-11 text-sm font-medium text-accent active:opacity-60"
          >
            {expanded ? t('hist.showLess') : t('hist.showAll', { n: props.entries.length })}
          </button>
        )}
        <button onClick={props.onClear} title={t('hist.clearNote')} className="min-h-11 text-sm text-stone-500 active:text-stone-900">
          {t('hist.clear')}
        </button>
      </div>
      <p className="text-xs text-stone-400">{t('hist.clearNote')}</p>
    </section>
  )
}
