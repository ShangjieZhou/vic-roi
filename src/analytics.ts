import { inject, type BeforeSend } from '@vercel/analytics'

// A result link carries the submission id, which works as a private link. Visits are counted under /r/:id so the
// id never reaches the analytics service.
export const hideResultId: BeforeSend = (event) => {
  const url = new URL(event.url)
  url.pathname = url.pathname.replace(/^\/r\/[^/]+/, '/r/:id')
  url.search = ''
  url.hash = ''
  return { ...event, url: url.toString() }
}

// Counts visits with Vercel Web Analytics. It sets no cookies and records no personal data. The script only loads
// on the production build, so local development and tests send nothing.
export function startAnalytics(): void {
  inject({ beforeSend: hideResultId })
}
