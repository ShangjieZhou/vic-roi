import { useRef, useState } from 'react'
import type { EnglishLevel } from '../supabase/functions/_shared/scoring'
import { ENGLISH_REQUIREMENTS, ENGLISH_SOURCE, ENGLISH_TABLE_FROM } from './englishScores'
import { useI18n, type Key } from './i18n'
import { Modal } from './Modal'

const LEVELS: EnglishLevel[] = ['competent', 'proficient', 'superior']
const COLUMNS: Key[] = ['english.col.listening', 'english.col.reading', 'english.col.writing', 'english.col.speaking']

// A link under the English question that opens the minimum score for each test, with a tab for each level.
export function EnglishRequirementsLink({ initial }: { initial?: EnglishLevel }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="mb-5 -ml-1 inline-flex min-h-11 items-center px-1 text-sm font-medium text-accent underline underline-offset-2 active:opacity-60"
      >
        {t('english.link')}
      </button>
      {open && (
        <EnglishRequirementsDialog
          initial={initial}
          onClose={() => {
            setOpen(false)
            trigger.current?.focus()
          }}
        />
      )}
    </>
  )
}

function EnglishRequirementsDialog({ initial, onClose }: { initial?: EnglishLevel; onClose: () => void }) {
  const { t } = useI18n()
  const [level, setLevel] = useState<EnglishLevel>(initial ?? 'competent')

  return (
    <Modal title={t('english.modal.title')} onClose={onClose}>
      <p className="mt-1 text-sm leading-relaxed text-stone-600">
        {t('english.modal.intro', { date: ENGLISH_TABLE_FROM })}
      </p>

      <div role="group" aria-label={t('english.modal.title')} className="mt-4 flex gap-1 rounded-xl bg-stone-100 p-1">
        {LEVELS.map((l) => (
          <button
            key={l}
            type="button"
            aria-pressed={level === l}
            onClick={() => setLevel(l)}
            className={`min-h-10 flex-1 rounded-lg px-2 text-sm font-medium transition ${
              level === l ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 active:text-stone-900'
            }`}
          >
            {t(`opt.english.${l}` as Key)}
          </button>
        ))}
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[19rem] text-left text-sm tabular-nums">
          <thead>
            <tr className="border-b border-stone-200 text-xs text-stone-500">
              <th scope="col" className="py-2 pr-2 font-medium">{t('english.col.test')}</th>
              {COLUMNS.map((c) => (
                <th key={c} scope="col" className="px-1 py-2 text-right font-medium">{t(c)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ENGLISH_REQUIREMENTS[level].map((row) => (
              <tr key={row.test} className="border-b border-stone-100 last:border-0">
                <th scope="row" className="py-2.5 pr-2 font-medium">{row.test}</th>
                {row.scores.map((score, i) => (
                  <td key={i} className="px-1 py-2.5 text-right">{score}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-stone-500">{t('english.modal.all')}</p>
      <p className="mt-1 text-xs leading-relaxed text-stone-500">{t('english.modal.older')}</p>
      <a
        href={ENGLISH_SOURCE[level]}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-accent underline underline-offset-2 active:opacity-60"
      >
        {t('english.modal.source')} ↗
      </a>
    </Modal>
  )
}
