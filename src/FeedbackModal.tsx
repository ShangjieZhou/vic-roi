import { useState } from 'react'
import { FEEDBACK_MAX, sendFeedback, type FeedbackOutcome } from './feedback'
import { useI18n } from './i18n'
import { Modal } from './Modal'

// A box for a short note. The text stays in the box when sending fails, so nothing typed is lost.
export function FeedbackModal(props: { onClose: () => void }) {
  const { t, lang } = useI18n()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<FeedbackOutcome | null>(null)
  const ready = text.trim().length > 0 && !busy

  const submit = async () => {
    if (!ready) return
    setBusy(true)
    const result = await sendFeedback(text, lang)
    setBusy(false)
    setOutcome(result)
  }

  if (outcome === 'ok') {
    return (
      <Modal title={t('feedback.thanksTitle')} onClose={props.onClose}>
        <p className="mt-2 text-sm leading-relaxed text-stone-700">{t('feedback.thanks')}</p>
        <button
          type="button"
          onClick={props.onClose}
          className="mt-5 min-h-12 w-full rounded-xl bg-[#f28b50] px-5 py-3 text-sm font-semibold text-stone-900 transition hover:bg-[#ee7d3d] active:scale-[0.98]"
        >
          {t('feedback.done')}
        </button>
      </Modal>
    )
  }

  return (
    <Modal title={t('feedback.title')} onClose={props.onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <p className="mt-1 text-sm leading-relaxed text-stone-600">{t('feedback.hint')}</p>
        <label htmlFor="feedback-text" className="sr-only">
          {t('feedback.label')}
        </label>
        <textarea
          id="feedback-text"
          value={text}
          maxLength={FEEDBACK_MAX}
          rows={6}
          placeholder={t('feedback.placeholder')}
          onChange={(e) => setText(e.target.value)}
          className="mt-3 w-full resize-none rounded-xl border border-stone-300 bg-white p-3 text-base leading-relaxed text-stone-900 placeholder:text-stone-400 focus:border-[#f28b50] focus:outline-none focus:ring-2 focus:ring-[#f28b50]/30"
        />
        <div className="mt-1 flex items-start justify-between gap-3 text-xs leading-relaxed text-stone-500">
          <span>{t('feedback.anon')}</span>
          <span className="shrink-0 tabular-nums">{t('feedback.count', { n: text.length, max: FEEDBACK_MAX })}</span>
        </div>
        {(outcome === 'error' || outcome === 'rate_limited') && (
          <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
            {t(outcome === 'rate_limited' ? 'feedback.limit' : 'feedback.error')}
          </p>
        )}
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={props.onClose}
            className="min-h-12 flex-1 rounded-xl border border-stone-300 px-5 py-3 text-sm font-semibold text-stone-700 transition active:bg-stone-100"
          >
            {t('feedback.cancel')}
          </button>
          <button
            type="submit"
            disabled={!ready}
            className="min-h-12 flex-1 rounded-xl bg-[#f28b50] px-5 py-3 text-sm font-semibold text-stone-900 transition hover:bg-[#ee7d3d] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t(busy ? 'feedback.sending' : 'feedback.send')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
