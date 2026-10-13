import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from './i18n'

// A dialog over the page. It closes with the close button, Escape or a press on the backdrop, takes focus when it
// opens, and keeps the page behind it from scrolling.
export function Modal(props: { title: string; onClose: () => void; children: ReactNode }) {
  const { t } = useI18n()
  const { onClose } = props
  const titleId = useId()
  const close = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    close.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const before = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = before
    }
  }, [onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/50 sm:items-center sm:p-4"
      data-backdrop
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-lg font-semibold tracking-tight">{props.title}</h2>
          <button
            ref={close}
            type="button"
            onClick={onClose}
            aria-label={t('modal.close')}
            className="-mt-1 -mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-2xl leading-none text-stone-500 active:bg-stone-100"
          >
            ×
          </button>
        </div>
        {props.children}
      </div>
    </div>,
    document.body,
  )
}
