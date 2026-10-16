import { useCallback, useEffect, useState } from 'react'
import { SECTION_LABELS, experienceBand, labelFor, melbourne, money, orderRows } from './labels'
import {
  MAX_RULES, SORT_FIELDS, addRule, buildFilters, describeSort, emptyFilters, moveRule, removeRule, setRuleField,
  toggleRule, type FilterForm, type SortField, type SortRule,
} from './submissionQuery'
import { loadSubmissions, type SubmissionPage, type SubmissionRow } from './types'
import { BTN, CARD, INPUT, Problem, SELECT, TITLE } from './ui'

const PAGE_SIZE = 50

const CHOICES: { key: 'english' | 'education' | 'experience' | 'location'; title: string; values: string[] }[] = [
  { key: 'english', title: 'English level', values: ['competent', 'proficient', 'superior'] },
  { key: 'education', title: 'Education', values: ['other', 'bachelors', 'masters', 'phd'] },
  { key: 'experience', title: 'Experience', values: ['0', '1', '2', '4', '6', '9'] },
  { key: 'location', title: 'Location', values: ['onshore', 'offshore'] },
]

// The second page: every submission, filtered and sorted.
export function Submissions(props: { token: string; onExpired: () => void }) {
  const { token, onExpired } = props
  const [form, setForm] = useState<FilterForm>(emptyFilters)
  const [applied, setApplied] = useState<Record<string, unknown>>({})
  const [sort, setSort] = useState<SortRule[]>([{ f: 'total', d: 'desc' }])
  const [offset, setOffset] = useState(0)
  const [page, setPage] = useState<SubmissionPage | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setBusy(true)
    const out = await loadSubmissions(token, { filters: applied, sort, limit: PAGE_SIZE, offset })
    setBusy(false)
    if (out.status === 'ok') {
      setProblem(null)
      return setPage(out.data)
    }
    if (out.status === 'signed_out') return onExpired()
    setProblem(out.status)
  }, [token, applied, sort, offset, onExpired])

  useEffect(() => {
    void load()
  }, [load])

  const apply = () => {
    setOffset(0)
    setApplied(buildFilters(form))
  }
  const reset = () => {
    setForm(emptyFilters)
    setOffset(0)
    setApplied({})
  }
  const changeSort = (next: SortRule[]) => {
    setOffset(0)
    setSort(next)
  }
  const patch = (p: Partial<FilterForm>) => setForm((f) => ({ ...f, ...p }))

  const total = page?.total ?? 0
  const from = total === 0 ? 0 : offset + 1
  const to = Math.min(offset + PAGE_SIZE, total)

  return (
    <div className="grid gap-5">
      <form
        className={CARD}
        onSubmit={(e) => {
          e.preventDefault()
          apply()
        }}
      >
        <h2 className={TITLE}>Filters</h2>
        <p className="mt-0.5 mb-4 text-xs text-stone-500">Leave a box empty to skip that filter. Chips within a group match any selected value.</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Range label="Age" min={form.ageMin} max={form.ageMax} onMin={(v) => patch({ ageMin: v })} onMax={(v) => patch({ ageMax: v })} />
          <Range label="Total score" min={form.scoreMin} max={form.scoreMax} onMin={(v) => patch({ scoreMin: v })} onMax={(v) => patch({ scoreMax: v })} />
          <Range label="Income (AUD a year)" min={form.incomeMin} max={form.incomeMax} onMin={(v) => patch({ incomeMin: v })} onMax={(v) => patch({ incomeMax: v })} />
          <div>
            <label htmlFor="f-occupation" className="text-sm font-medium">
              Occupation
            </label>
            <input
              id="f-occupation"
              className={`${INPUT} mt-1`}
              value={form.occupation}
              onChange={(e) => patch({ occupation: e.target.value })}
              placeholder="Name or code, such as nurse or 2544"
            />
          </div>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CHOICES.map((c) => (
            <fieldset key={c.key}>
              <legend className="text-sm font-medium">{c.title}</legend>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {orderRows(c.key, c.values.map((k) => ({ k, n: 0, median: 0, avg: 0 }))).map(({ k }) => (
                  <Chip
                    key={k}
                    on={form[c.key].includes(k)}
                    label={labelFor(c.key, k)}
                    onToggle={() => patch({ [c.key]: form[c.key].includes(k) ? form[c.key].filter((x) => x !== k) : [...form[c.key], k] })}
                  />
                ))}
              </div>
            </fieldset>
          ))}
          <fieldset>
            <legend className="text-sm font-medium">Partner bonus</legend>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {(['any', 'yes', 'no'] as const).map((v) => (
                <Chip key={v} on={form.partner === v} label={{ any: 'Any', yes: 'Has the bonus', no: 'No bonus' }[v]} onToggle={() => patch({ partner: v })} />
              ))}
            </div>
          </fieldset>
        </div>
        <div className="mt-5 flex gap-2">
          <button type="submit" className="min-h-10 rounded-lg bg-accent px-4 text-sm font-semibold text-white">
            Apply filters
          </button>
          <button type="button" className={BTN} onClick={reset}>
            Reset
          </button>
        </div>
      </form>

      <SortBuilder rules={sort} onChange={changeSort} />

      {problem && <Problem status={problem} />}

      <section className={CARD}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className={TITLE}>{page ? `${total.toLocaleString()} submissions` : 'Submissions'}</h2>
          <p className="text-xs text-stone-500">{describeSort(sort)}</p>
        </div>
        {page && page.rows.length === 0 && <p className="mt-4 text-sm text-stone-500">No submissions match these filters.</p>}
        {page && page.rows.length > 0 && <Table rows={page.rows} />}
        <div className="mt-4 flex items-center justify-between gap-3 text-sm">
          <span className="text-stone-500">{page ? `${from.toLocaleString()} to ${to.toLocaleString()} of ${total.toLocaleString()}` : busy ? 'Loading...' : ''}</span>
          <div className="flex gap-2">
            <button className={BTN} disabled={offset === 0 || busy} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
              Previous
            </button>
            <button className={BTN} disabled={offset + PAGE_SIZE >= total || busy} onClick={() => setOffset(offset + PAGE_SIZE)}>
              Next
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}

function Range(props: { label: string; min: string; max: string; onMin: (v: string) => void; onMax: (v: string) => void }) {
  const id = props.label.replace(/\W+/g, '-').toLowerCase()
  return (
    <div>
      <span className="text-sm font-medium">{props.label}</span>
      <div className="mt-1 flex items-center gap-2">
        <input aria-label={`${props.label} minimum`} id={`${id}-min`} inputMode="decimal" className={INPUT} placeholder="From" value={props.min} onChange={(e) => props.onMin(e.target.value)} />
        <span className="text-stone-400">to</span>
        <input aria-label={`${props.label} maximum`} id={`${id}-max`} inputMode="decimal" className={INPUT} placeholder="To" value={props.max} onChange={(e) => props.onMax(e.target.value)} />
      </div>
    </div>
  )
}

function Chip(props: { on: boolean; label: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={props.on}
      onClick={props.onToggle}
      className={`min-h-9 rounded-full border px-3 text-sm ${props.on ? 'border-accent bg-accent text-white' : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'}`}
    >
      {props.label}
    </button>
  )
}

// Up to three sort rules. The first rule decides the order, and the next ones break its ties.
function SortBuilder(props: { rules: SortRule[]; onChange: (rules: SortRule[]) => void }) {
  const { rules, onChange } = props
  return (
    <section className={CARD}>
      <h2 className={TITLE}>Sort</h2>
      <p className="mt-0.5 mb-4 text-xs text-stone-500">Rule 1 decides the order. Each later rule breaks ties left by the rules above it.</p>
      <ol className="grid gap-2">
        {rules.map((r, i) => (
          <li key={r.f} className="flex flex-wrap items-center gap-2">
            <span className="w-14 text-sm text-stone-500">Rule {i + 1}</span>
            <select aria-label={`Rule ${i + 1} field`} className={SELECT} value={r.f} onChange={(e) => onChange(setRuleField(rules, i, e.target.value as SortField))}>
              {SORT_FIELDS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
            <button className={BTN} aria-label={`Rule ${i + 1} direction`} onClick={() => onChange(toggleRule(rules, i))}>
              {r.d === 'asc' ? 'Low to high' : 'High to low'}
            </button>
            <button className={BTN} aria-label={`Move rule ${i + 1} up`} disabled={i === 0} onClick={() => onChange(moveRule(rules, i, -1))}>
              Up
            </button>
            <button className={BTN} aria-label={`Move rule ${i + 1} down`} disabled={i === rules.length - 1} onClick={() => onChange(moveRule(rules, i, 1))}>
              Down
            </button>
            <button className={BTN} aria-label={`Remove rule ${i + 1}`} onClick={() => onChange(removeRule(rules, i))}>
              Remove
            </button>
          </li>
        ))}
      </ol>
      <button className={`${BTN} mt-3`} disabled={rules.length >= MAX_RULES} onClick={() => onChange(addRule(rules))}>
        Add a sort rule
      </button>
      {rules.length === 0 && <p className="mt-2 text-xs text-stone-500">With no rules, the newest submissions come first.</p>}
    </section>
  )
}

function Table({ rows }: { rows: SubmissionRow[] }) {
  const [open, setOpen] = useState<string | null>(null)
  const heads = ['Submitted', 'Score', 'Age', 'English', 'Education', 'Experience', 'Income', 'Partner', 'Location', 'Occupation']
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[56rem] text-sm">
        <thead className="text-left text-xs text-stone-500">
          <tr>
            {heads.map((h) => (
              <th key={h} className={`px-2 py-1 font-medium ${['Score', 'Age', 'Income'].includes(h) ? 'text-right' : ''}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <RowView key={r.id} row={r} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RowView({ row: r, open, onToggle }: { row: SubmissionRow; open: boolean; onToggle: () => void }) {
  return (
    <>
      <tr className="cursor-pointer border-t border-stone-100 hover:bg-stone-50" onClick={onToggle} aria-expanded={open}>
        <td className="px-2 py-1.5 whitespace-nowrap text-stone-500">{melbourne(r.at)}</td>
        <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{r.total}</td>
        <td className="px-2 py-1.5 text-right tabular-nums">{r.age}</td>
        <td className="px-2 py-1.5">{labelFor('english', r.english)}</td>
        <td className="px-2 py-1.5">{labelFor('education', r.education)}</td>
        <td className="px-2 py-1.5 whitespace-nowrap">{labelFor('experience', experienceBand(r.experience))}</td>
        <td className="px-2 py-1.5 text-right tabular-nums">{money(r.income)}</td>
        <td className="px-2 py-1.5">{r.partner ? 'Yes' : 'No'}</td>
        <td className="px-2 py-1.5">{labelFor('location', r.location)}</td>
        <td className="px-2 py-1.5">{r.occupation ?? 'Not given'}{r.code && <span className="ml-1 text-xs text-stone-400">{r.code}</span>}</td>
      </tr>
      {open && (
        <tr className="bg-stone-50">
          <td colSpan={10} className="px-3 py-3">
            <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
              {r.breakdown.map((b) => (
                <li key={b.key}>
                  <span className="text-stone-500">{SECTION_LABELS[b.key] ?? b.key}</span> <span className="font-medium tabular-nums">{b.points}</span>
                  <span className="text-stone-400"> / {b.max}</span>
                </li>
              ))}
              <li>
                <span className="text-stone-500">Skill level</span> <span className="font-medium">{r.skill}</span>
              </li>
            </ul>
            <a className="mt-2 inline-block text-sm text-accent underline" href={`/r/${r.id}`} target="_blank" rel="noopener noreferrer">
              Open the public result page
            </a>
          </td>
        </tr>
      )}
    </>
  )
}

