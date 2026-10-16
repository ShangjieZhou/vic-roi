import { useCallback, useEffect, useState } from 'react'
import { DIMENSIONS, OCCUPATION_GROUPS, SECTION_LABELS, labelFor, melbourne, orderRows, percent } from './labels'
import { loadStats, loadTimeline, type AdminStats, type Timeline, type TimelineRange } from './types'
import { BTN, Card, Problem } from './ui'

// The first page: numbers for the whole pool.
export function Overview(props: { token: string; onExpired: () => void }) {
  const { token, onExpired } = props
  const [state, setState] = useState<{ kind: 'loading' } | { kind: 'problem'; status: string } | { kind: 'data'; stats: AdminStats }>({ kind: 'loading' })

  const load = useCallback(async () => {
    setState({ kind: 'loading' })
    const out = await loadStats(token)
    if (out.status === 'ok') return setState({ kind: 'data', stats: out.stats })
    if (out.status === 'signed_out') return onExpired()
    setState({ kind: 'problem', status: out.status })
  }, [token, onExpired])

  useEffect(() => {
    void load()
  }, [load])

  if (state.kind === 'loading') return <p className="text-sm text-stone-500">Loading...</p>
  if (state.kind === 'problem') return <Problem status={state.status} />
  return (
    <div className="grid gap-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-stone-500">Updated {melbourne(state.stats.generatedAt)} (Melbourne)</p>
        <button className={BTN} onClick={() => void load()}>
          Refresh
        </button>
      </div>
      <Dashboard stats={state.stats} token={token} onExpired={onExpired} />
    </div>
  )
}

export function Dashboard({ stats, token, onExpired }: { stats: AdminStats; token: string; onExpired: () => void }) {
  const { totals, score } = stats
  const seen = stats.support.find((e) => e.event === 'coffee_seen')
  const clicked = stats.support.find((e) => e.event === 'coffee_clicked')
  const minimized = stats.support.find((e) => e.event === 'coffee_minimized')
  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Submissions" value={totals.n.toLocaleString()} />
        <Stat label="Last 24 hours" value={totals.last24h.toLocaleString()} />
        <Stat label="Last 7 days" value={totals.last7d.toLocaleString()} />
        <Stat label="Median score" value={String(score.median)} />
        <Stat label="Mean score" value={`${score.mean} (sd ${score.sd})`} />
        <Stat label="With a listed occupation" value={percent(totals.withCode, totals.n)} />
      </div>

      <SubmissionsOverTime token={token} onExpired={onExpired} />

      <Card title="Score distribution" note="Candidates per 10-point band">
        <Histogram hist={stats.hist} />
        <dl className="mt-4 grid grid-cols-3 gap-2 text-center text-sm sm:grid-cols-7">
          {(
            [
              ['Lowest', score.min],
              ['10th percentile', score.p10],
              ['25th percentile', score.p25],
              ['Median', score.median],
              ['75th percentile', score.p75],
              ['90th percentile', score.p90],
              ['Highest', score.max],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="rounded-lg bg-stone-50 px-2 py-2">
              <dt className="text-xs text-stone-500">{label}</dt>
              <dd className="font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <section className="grid gap-5 lg:grid-cols-2">
        {DIMENSIONS.map((d) => {
          const rows = orderRows(d.key, stats.cuts[d.key] ?? [])
          const biggest = Math.max(1, ...rows.map((r) => r.n))
          return (
            <Card key={d.key} title={d.title} note="Candidates in each group and its median score. Bars are relative to the largest group.">
              <div className="grid gap-2">
                {rows.map((r) => (
                  <BarRow
                    key={r.k}
                    label={labelFor(d.key, r.k)}
                    fraction={r.n / biggest}
                    left={`${r.n.toLocaleString()} (${percent(r.n, totals.n)})`}
                    right={`median ${r.median}`}
                  />
                ))}
              </div>
            </Card>
          )
        })}
      </section>

      <Card title="Points in each section" note="Average, median and how many reach the maximum. Bars show how many candidates earned each points value.">
        <div className="grid gap-5 lg:grid-cols-2">
          {Object.entries(stats.sections).map(([key, s]) => {
            const biggest = Math.max(1, ...s.dist.map((p) => p.n))
            return (
              <div key={key} className="rounded-xl bg-stone-50 p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="font-medium">{SECTION_LABELS[key] ?? key}</h3>
                  <span className="text-xs text-stone-500">
                    average {s.avg} of {s.max}, median {s.median}, {percent(s.atMax, s.n)} at the maximum
                  </span>
                </div>
                <div className="mt-2 grid gap-1.5">
                  {s.dist.map((p) => (
                    <BarRow key={p.points} label={`${p.points} points`} fraction={p.n / biggest} left={`${p.n.toLocaleString()} (${percent(p.n, s.n)})`} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      <Card title="What the top quarter has that the rest lacks" note="Average points per section for candidates at or above the 75th percentile, against everyone else. Sorted by the gap.">
        <div className="grid gap-3">
          {stats.gap.map((g) => (
            <div key={g.key}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-medium">{SECTION_LABELS[g.key] ?? g.key}</span>
                <span className="text-xs text-stone-500 tabular-nums">
                  top {g.top}, rest {g.rest}, gap {(g.top - g.rest).toFixed(1)} (of {g.max})
                </span>
              </div>
              <TwoBars top={g.top / g.max} rest={g.rest / g.max} />
            </div>
          ))}
          <p className="text-xs text-stone-500">Dark bar: top quarter. Light bar: everyone else.</p>
        </div>
      </Card>

      <section className="grid gap-5 lg:grid-cols-2">
        <Card title="Occupation groups" note="First digit of the ANZSCO code">
          <div className="grid gap-2">
            {stats.occupationGroups.map((g) => (
              <BarRow
                key={g.group}
                label={OCCUPATION_GROUPS[g.group] ?? `Group ${g.group}`}
                fraction={g.n / Math.max(1, stats.occupationGroups[0]?.n ?? 1)}
                left={`${g.n.toLocaleString()} (${percent(g.n, totals.withCode)})`}
                right={`median ${g.median}`}
              />
            ))}
          </div>
        </Card>
        <Card title="Top 30 occupations" note="Candidates and median score">
          <div className="max-h-[32rem] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white text-left text-xs text-stone-500">
                <tr>
                  <th className="py-1 pr-2 font-medium">Occupation</th>
                  <th className="px-2 py-1 text-right font-medium">Candidates</th>
                  <th className="py-1 pl-2 text-right font-medium">Median</th>
                </tr>
              </thead>
              <tbody>
                {stats.occupations.map((o) => (
                  <tr key={o.code} className="border-t border-stone-100">
                    <td className="py-1.5 pr-2">
                      {o.name} <span className="text-xs text-stone-400">{o.code}</span>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{o.n.toLocaleString()}</td>
                    <td className="py-1.5 pl-2 text-right tabular-nums">{o.median}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      <Card title="Support card" note="Counted once per device">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Saw the card" value={(seen?.devices ?? 0).toLocaleString()} />
          <Stat label="Clicked the coffee button" value={`${(clicked?.devices ?? 0).toLocaleString()} (${percent(clicked?.devices ?? 0, seen?.devices ?? 0)})`} />
          <Stat label="Minimized it" value={`${(minimized?.devices ?? 0).toLocaleString()} (${percent(minimized?.devices ?? 0, seen?.devices ?? 0)})`} />
          <Stat label="Feedback messages" value={stats.feedback.count.toLocaleString()} />
        </dl>
      </Card>

      <Card title="Feedback" note={`Newest first, up to 100 of ${stats.feedback.count}`}>
        {stats.feedback.items.length === 0 ? (
          <p className="text-sm text-stone-500">No messages yet.</p>
        ) : (
          <ul className="grid gap-3">
            {stats.feedback.items.map((f, i) => (
              <li key={i} className="rounded-xl bg-stone-50 p-3">
                <p className="text-xs text-stone-500">
                  {melbourne(f.at)} · {f.lang === 'zh' ? 'Chinese' : 'English'}
                </p>
                <p className="mt-1 text-sm whitespace-pre-wrap">{f.message}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white p-3 shadow-sm">
      <p className="text-xs text-stone-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  )
}

function BarRow(props: { label: string; fraction: number; left: string; right?: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span>{props.label}</span>
        <span className="shrink-0 text-xs text-stone-500 tabular-nums">
          {props.left}
          {props.right && <> · {props.right}</>}
        </span>
      </div>
      <div className="mt-0.5 h-2 rounded-full bg-stone-100">
        <div className="h-2 rounded-full bg-accent" style={{ width: `${Math.max(1, Math.round(props.fraction * 100))}%` }} />
      </div>
    </div>
  )
}

function TwoBars({ top, rest }: { top: number; rest: number }) {
  return (
    <div className="mt-1 grid gap-1">
      <div className="h-2 rounded-full bg-stone-100">
        <div className="h-2 rounded-full bg-accent" style={{ width: `${Math.round(top * 100)}%` }} />
      </div>
      <div className="h-2 rounded-full bg-stone-100">
        <div className="h-2 rounded-full bg-indigo-300" style={{ width: `${Math.round(rest * 100)}%` }} />
      </div>
    </div>
  )
}

const RANGES: { value: TimelineRange; label: string; note: string }[] = [
  { value: '1h', label: 'Last hour', note: 'One bar per minute' },
  { value: '24h', label: 'Last 24 hours', note: 'One bar per hour' },
  { value: '7d', label: 'Last 7 days', note: 'One bar per 4 hours' },
  { value: '30d', label: 'Last 30 days', note: 'One bar per day' },
]

// A bar's label from its local start time, such as 2026-10-16T14:30.
export function barLabel(t: string, bucket: number): string {
  const [date, time] = t.split('T')
  const day = new Date(`${date}T00:00:00Z`).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
  if (bucket >= 86400) return day
  if (bucket >= 3600) return `${day} ${time}-${endOf(time, bucket)}`
  return time
}

function endOf(time: string, bucket: number): string {
  const [h, m] = time.split(':').map(Number)
  const end = (h * 60 + m + bucket / 60) % (24 * 60)
  return `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`
}

function SubmissionsOverTime({ token, onExpired }: { token: string; onExpired: () => void }) {
  const [range, setRange] = useState<TimelineRange>('24h')
  const [data, setData] = useState<Timeline | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    let current = true
    setData(null)
    setProblem(null)
    void loadTimeline(token, range).then((out) => {
      if (!current) return
      if (out.status === 'ok') return setData(out.data)
      if (out.status === 'signed_out') return onExpired()
      setProblem(out.status)
    })
    return () => {
      current = false
    }
  }, [token, range, onExpired])

  const note = RANGES.find((r) => r.value === range)?.note
  return (
    <Card title="Submissions over time" note={`${note}, Melbourne time`}>
      <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label="Time range">
        {RANGES.map((r) => (
          <button
            key={r.value}
            type="button"
            aria-pressed={range === r.value}
            onClick={() => setRange(r.value)}
            className={`min-h-9 rounded-full border px-3 text-sm ${range === r.value ? 'border-accent bg-accent text-white' : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'}`}
          >
            {r.label}
          </button>
        ))}
      </div>
      {problem && <p role="alert" className="text-sm text-red-700">Could not load this range. Try again shortly.</p>}
      {!problem && !data && <p className="text-sm text-stone-500">Loading...</p>}
      {data && <Bars data={data} />}
    </Card>
  )
}

function Bars({ data }: { data: Timeline }) {
  const biggest = Math.max(1, ...data.series.map((d) => d.n))
  const first = data.series[0]
  const last = data.series[data.series.length - 1]
  return (
    <div>
      <p className="mb-2 text-sm">
        <span className="font-semibold tabular-nums">{data.total.toLocaleString()}</span> submissions in this window
      </p>
      <div className="flex h-36 items-end gap-0.5">
        {data.series.map((d) => (
          <div
            key={d.t}
            title={`${barLabel(d.t, data.bucket)}: ${d.n}`}
            className="flex-1 rounded-t bg-accent/80"
            style={{ height: `${Math.max(2, (d.n / biggest) * 100)}%` }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-stone-500">
        <span>{first && barLabel(first.t, data.bucket)}</span>
        <span>most in one bar: {biggest.toLocaleString()}</span>
        <span>{last && barLabel(last.t, data.bucket)}</span>
      </div>
    </div>
  )
}

function Histogram({ hist }: { hist: number[] }) {
  const first = Math.max(0, hist.findIndex((n) => n > 0) - 1)
  const last = Math.min(hist.length - 1, hist.length - 1 - [...hist].reverse().findIndex((n) => n > 0) + 1)
  const bands = hist.slice(first, last + 1)
  const biggest = Math.max(1, ...bands)
  return (
    <div>
      <div className="flex h-40 items-end gap-0.5">
        {bands.map((n, i) => (
          <div key={i} title={`${(first + i) * 10} to ${(first + i) * 10 + 9}: ${n}`} className="flex-1 rounded-t bg-accent/80" style={{ height: `${Math.max(1, (n / biggest) * 100)}%` }} />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-stone-500">
        <span>{first * 10}</span>
        <span>{(last + 1) * 10}</span>
      </div>
    </div>
  )
}
