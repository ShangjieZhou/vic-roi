import { useId, useMemo, useState } from 'react'
import { normalizeOccupation } from '../supabase/functions/_shared/insights'
import { OCCUPATION_BY_CODE } from '../supabase/functions/_shared/occupations'
import type { OccupationChoice } from './api'
import { useI18n } from './i18n'
import { occupationLabel, searchOccupations } from './occupationSearch'

// Lets a candidate pick their occupation from the official list, so everyone with the same occupation
// lands in the same group whatever words or language they use. Anything missing can be entered as text.
export function OccupationPicker(props: {
  value: OccupationChoice | null
  onChange: (value: OccupationChoice | null) => void
}) {
  const { t, lang } = useI18n()
  const [query, setQuery] = useState('')
  const listId = useId()
  const hits = useMemo(() => searchOccupations(query), [query])
  const typed = query.trim()
  // Free text is only offered when the server would accept it.
  const freeOk = typed.length >= 2 && normalizeOccupation(typed) !== 'invalid'

  // Clearing the search on selection means "Change" starts from an empty box rather than the old query.
  const choose = (value: OccupationChoice) => {
    setQuery('')
    props.onChange(value)
  }

  if (props.value) {
    return <Chosen value={props.value} onClear={() => props.onChange(null)} />
  }

  return (
    <div>
      <input
        type="search"
        value={query}
        maxLength={80}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint="search"
        role="combobox"
        aria-expanded={typed.length > 0}
        aria-controls={listId}
        placeholder={t('occ.placeholder')}
        onChange={(e) => setQuery(e.target.value)}
        className="mt-2 min-h-12 w-full rounded-xl border border-stone-200 bg-white px-4 text-base outline-none focus:border-accent"
      />
      {typed.length === 0 && <p className="mt-2 text-xs leading-relaxed text-stone-500">{t('occ.listHint')}</p>}

      {typed.length > 0 && (
        <ul id={listId} aria-label={t('occ.results')} className="mt-2 grid gap-1">
          {hits.map((o) => {
            const { primary, secondary } = occupationLabel(o.code, lang)
            return (
              <li key={o.code}>
                <button
                  type="button"
                  onClick={() => choose({ kind: 'listed', code: o.code })}
                  className="flex min-h-12 w-full items-start justify-between gap-3 rounded-lg border border-stone-100 bg-white px-3 py-2 text-left text-sm active:bg-indigo-50"
                >
                  <span className="min-w-0">
                    <span className="block font-medium">{primary}</span>
                    {secondary && <span className="block text-xs text-stone-500">{secondary}</span>}
                    <span className="block text-xs text-stone-400">{t('occ.code', { code: o.code })}</span>
                  </span>
                  {!o.visa190 && (
                    <span
                      title={t('occ.only491Hint')}
                      className="mt-0.5 shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800"
                    >
                      {t('occ.only491')}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
          {hits.length === 0 && <li className="px-1 py-1 text-sm text-stone-500">{t('occ.noMatch')}</li>}
          {freeOk && (
            <li>
              <button
                type="button"
                onClick={() => choose({ kind: 'free', text: typed })}
                className="min-h-12 w-full rounded-lg border border-dashed border-stone-300 px-3 py-2 text-left text-sm text-stone-600 active:bg-stone-50"
              >
                {t('occ.other', { text: typed })}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

function Chosen(props: { value: OccupationChoice; onClear: () => void }) {
  const { t, lang } = useI18n()
  const { value } = props
  const listed = value.kind === 'listed' ? OCCUPATION_BY_CODE.get(value.code) : undefined
  const label = value.kind === 'listed' ? occupationLabel(value.code, lang) : { primary: value.text, secondary: null }

  return (
    <div className="mt-2 flex items-start justify-between gap-3 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm">
      <div className="min-w-0">
        <p className="font-medium text-indigo-950">{label.primary}</p>
        {label.secondary && <p className="text-xs text-indigo-900/70">{label.secondary}</p>}
        {value.kind === 'listed' && <p className="text-xs text-indigo-900/60">{t('occ.code', { code: value.code })}</p>}
        {listed && !listed.visa190 && (
          <p className="mt-1 text-xs text-amber-800">{t('occ.only491Hint')}</p>
        )}
      </div>
      <button
        type="button"
        onClick={props.onClear}
        className="-mr-2 min-h-11 shrink-0 px-2 font-medium text-accent active:opacity-60"
      >
        {t('occ.change')}
      </button>
    </div>
  )
}
