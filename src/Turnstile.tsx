import { useEffect, useRef } from 'react'
import type { Lang } from './i18n'

// Cloudflare Turnstile, the bot check. With appearance 'interaction-only' the visitor sees nothing unless
// Cloudflare needs them to prove something. The token it produces is single use and goes to the server.
// https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/

interface TurnstileApi {
  render: (el: HTMLElement, options: Record<string, unknown>) => string
  reset: (widgetId: string) => void
  remove: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
let scriptPromise: Promise<void> | null = null

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const el = document.createElement('script')
    el.src = SCRIPT_SRC
    el.async = true
    el.onload = () => resolve()
    el.onerror = () => {
      scriptPromise = null // allow a later retry
      reject(new Error('turnstile script failed to load'))
    }
    document.head.appendChild(el)
  })
  return scriptPromise
}

export function Turnstile(props: {
  siteKey: string
  lang: Lang
  // Change this number to discard the current token and ask for a new one.
  resetKey: number
  // A token when the check passes. null when it expires, errors or is reset.
  onToken: (token: string | null) => void
  // Called when the check cannot run at all, for example because the script is blocked.
  onUnavailable: () => void
}) {
  const container = useRef<HTMLDivElement>(null)
  const widget = useRef<string | null>(null)
  // The handlers are kept in a ref so a changing callback never re-creates the widget.
  const handlers = useRef(props)
  handlers.current = props

  useEffect(() => {
    let cancelled = false
    loadScript()
      .then(() => {
        if (cancelled || !container.current || !window.turnstile) return
        widget.current = window.turnstile.render(container.current, {
          sitekey: props.siteKey,
          appearance: 'interaction-only',
          language: props.lang === 'zh' ? 'zh-cn' : 'en',
          callback: (token: string) => handlers.current.onToken(token),
          'expired-callback': () => handlers.current.onToken(null),
          'error-callback': () => {
            handlers.current.onToken(null)
            handlers.current.onUnavailable()
          },
        })
      })
      .catch(() => {
        if (!cancelled) handlers.current.onUnavailable()
      })
    return () => {
      cancelled = true
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current)
      widget.current = null
      handlers.current.onToken(null)
    }
  }, [props.siteKey, props.lang])

  useEffect(() => {
    if (props.resetKey > 0 && widget.current && window.turnstile) {
      handlers.current.onToken(null)
      window.turnstile.reset(widget.current)
    }
  }, [props.resetKey])

  return <div ref={container} />
}
