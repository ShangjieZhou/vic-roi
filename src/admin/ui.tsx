import type { ReactNode } from 'react'

export const CARD = 'rounded-2xl bg-white p-4 shadow-sm sm:p-6'
export const TITLE = 'text-lg font-semibold tracking-tight'
export const BTN =
  'min-h-10 rounded-lg border border-stone-300 px-3 text-sm font-medium text-stone-700 hover:bg-stone-50 active:bg-stone-100'
export const SELECT =
  'rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30'
export const INPUT =
  'w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30'

export function Card(props: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className={CARD}>
      <h2 className={TITLE}>{props.title}</h2>
      {props.note && <p className="mt-0.5 mb-4 text-xs text-stone-500">{props.note}</p>}
      {props.children}
    </section>
  )
}


// What to tell the admin when a call to the server did not return data.
export function problemText(status: string): string {
  if (status === 'forbidden') return 'This account does not have access.'
  if (status === 'unconfigured') return 'The ADMIN_EMAIL secret is not set on the server.'
  if (status === 'bad_request') return 'The server rejected that request. Check the values and try again.'
  return 'Could not load the data. Try again shortly.'
}

export function Problem({ status }: { status: string }) {
  return (
    <div className={CARD}>
      <p role="alert">{problemText(status)}</p>
    </div>
  )
}
