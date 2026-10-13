import { OCCUPATIONS, OCCUPATION_BY_CODE, type Occupation } from '../supabase/functions/_shared/occupations'
import { OCCUPATION_ZH } from './occupationNames'
import type { Lang } from './i18n'

// Everyday names people use that differ from the official title. Each entry points at the closest official codes.
const ALIASES: { words: string[]; codes: string[] }[] = [
  { words: ['software developer', 'developer', 'programmer', 'coder', 'software dev'], codes: ['261313', '261312', '261311'] },
  { words: ['it support', 'helpdesk', 'help desk', 'technical support', 'service desk'], codes: ['313112', '263212'] },
  { words: ['cyber security', 'cybersecurity', 'infosec', 'security analyst', 'security engineer'], codes: ['262112'] },
  { words: ['devops', 'sysadmin', 'system admin', 'cloud engineer'], codes: ['262113', '263111'] },
  { words: ['data analyst', 'business analyst'], codes: ['261111', '261112'] },
  { words: ['dba', 'database'], codes: ['262111'] },
  { words: ['tester', 'qa', 'quality assurance'], codes: ['261314', '263211'] },
  { words: ['doctor', 'gp', 'physician'], codes: ['253111', '253112', '253311'] },
  { words: ['lawyer', 'attorney'], codes: ['271311', '271111'] },
  { words: ['hr', 'human resources'], codes: ['132311', '223111', '223112'] },
  { words: ['pm', 'project manager'], codes: ['133111', '135112', '511112'] },
  { words: ['physio'], codes: ['252511'] },
  { words: ['vet'], codes: ['234711'] },
  { words: ['ux designer', 'ui designer', 'uiux'], codes: ['232413', '232414', '232411'] },
  { words: ['tcm', 'chinese medicine'], codes: ['252214'] },
]

const fold = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim()

const INDEX = OCCUPATIONS.map((o) => ({ occupation: o, title: fold(o.title), zh: OCCUPATION_ZH[o.code] ?? '' }))

function score(entry: (typeof INDEX)[number], q: string, qRaw: string): number {
  const { occupation, title, zh } = entry
  if (title === q) return 100
  if (occupation.code === q) return 95
  if (title.startsWith(q)) return 80
  if (occupation.code.startsWith(q) && q.length >= 3) return 70
  if (zh && qRaw.length >= 1 && zh.includes(qRaw)) return zh.startsWith(qRaw) ? 75 : 65
  if (title.split(' ').some((w) => w.startsWith(q))) return 60
  // Every typed word must appear somewhere in the title, in any order ("engineer software").
  const words = q.split(' ').filter(Boolean)
  if (words.length > 1 && words.every((w) => title.includes(w))) return 50
  if (q.length >= 3 && title.includes(q)) return 40
  return 0
}

export function searchOccupations(query: string, limit = 8): Occupation[] {
  const qRaw = query.trim()
  const q = fold(qRaw)
  if (!q) return []

  const scores = new Map<string, number>()
  for (const entry of INDEX) {
    const s = score(entry, q, qRaw)
    if (s > 0) scores.set(entry.occupation.code, s)
  }
  for (const alias of ALIASES) {
    if (alias.words.some((w) => w === q || (q.length >= 3 && w.startsWith(q)))) {
      alias.codes.forEach((code, i) => scores.set(code, Math.max(scores.get(code) ?? 0, 66 - i)))
    }
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || OCCUPATION_BY_CODE.get(a[0])!.title.localeCompare(OCCUPATION_BY_CODE.get(b[0])!.title))
    .slice(0, limit)
    .map(([code]) => OCCUPATION_BY_CODE.get(code)!)
}

// The name shown for an occupation code. Chinese shows the English title too, since that is the name used on the EOI.
export function occupationLabel(code: string, lang: Lang): { primary: string; secondary: string | null } {
  const occupation = OCCUPATION_BY_CODE.get(code)
  if (!occupation) return { primary: code, secondary: null }
  const zh = OCCUPATION_ZH[code]
  return lang === 'zh' && zh ? { primary: zh, secondary: occupation.title } : { primary: occupation.title, secondary: null }
}

export function occupationDisplayName(code: string, lang: Lang): string {
  const { primary, secondary } = occupationLabel(code, lang)
  return secondary ? `${primary}（${secondary}）` : primary
}
