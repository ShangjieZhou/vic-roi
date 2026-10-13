export type AssessmentKey = 'outstanding' | 'veryCompetitive' | 'competitive' | 'aboveAverage' | 'average' | 'belowAverage'

export interface Assessment {
  key: AssessmentKey
  // Classes for the badge.
  tone: string
}

// A plain label for where a score sits among everyone who submitted, from the top percent: the top 5%, 10%, 25%,
// 50% and 75%, and the rest. It compares candidates on this site only. It is not an official threshold.
export function assessmentFor(topPercent: number): Assessment {
  if (topPercent <= 5) return { key: 'outstanding', tone: 'bg-emerald-100 text-emerald-900' }
  if (topPercent <= 10) return { key: 'veryCompetitive', tone: 'bg-green-100 text-green-900' }
  if (topPercent <= 25) return { key: 'competitive', tone: 'bg-teal-100 text-teal-900' }
  if (topPercent <= 50) return { key: 'aboveAverage', tone: 'bg-sky-100 text-sky-900' }
  if (topPercent <= 75) return { key: 'average', tone: 'bg-amber-100 text-amber-900' }
  return { key: 'belowAverage', tone: 'bg-stone-200 text-stone-800' }
}
