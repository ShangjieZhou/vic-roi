import { useI18n, type Key } from './i18n'

// Wording follows the Victorian Points Test page. All three must hold to claim the 50 points.
export const PARTNER_REQUIREMENTS: Key[] = ['partner.req1', 'partner.req2', 'partner.req3']

export function PartnerRequirements() {
  const { t } = useI18n()
  return (
    <div className="mb-5 rounded-xl bg-white p-4 text-sm">
      <p className="font-medium">{t('partner.intro')}</p>
      <ol className="mt-3 grid gap-3">
        {PARTNER_REQUIREMENTS.map((key, i) => (
          <li key={key} className="flex items-start gap-3">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-medium text-accent">
              {i + 1}
            </span>
            <span className="leading-snug">{t(key)}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
