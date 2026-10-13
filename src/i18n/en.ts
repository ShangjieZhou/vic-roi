export type Params = Record<string, string | number>
// Strings may use {name} placeholders. Functions handle plurals and other grammar.
export type Msg = string | ((p: Params) => string)

export function ordinal(n: number): string {
  const lastTwo = n % 100
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`
}

const plural = (n: string | number, one: string, many: string) => (Number(n) === 1 ? one : many)

// English is the source of truth: the key set below defines what every language must provide.
export const en = {
  'app.title': 'VPT Calculator',
  'app.edition': 'Victoria 2026-27',
  'app.loading': 'Loading your result...',
  'lang.label': 'Language',
  'footer.before': 'An unofficial estimate based on the published Victorian Points Test. It does not guarantee a nomination. Check the ',
  'footer.link': 'official page',
  'footer.after': ' before you act on a score.',
  'meta.title': 'VPT Calculator | Victorian Points Test 2026-27',
  'common.back': 'Back',
  'common.continue': 'Continue',
  'progress.step': 'Step {n} of {total}',
  'loc.onshore': 'onshore',
  'loc.offshore': 'offshore',

  'q.age.title': 'How old are you?',
  'q.age.hint': 'Your age at the time of invitation. Points apply between 18 and 44.',
  'unit.years': 'years',
  'q.english.title': 'What is your English level?',
  'opt.english.competent': 'Competent',
  'opt.english.competent.hint': 'PTE 50 or IELTS 6 in each band, or equivalent',
  'opt.english.proficient': 'Proficient',
  'opt.english.proficient.hint': 'PTE 65 or IELTS 7 in each band, or equivalent',
  'opt.english.superior': 'Superior',
  'opt.english.superior.hint': 'PTE 79 or IELTS 8 in each band, or equivalent',
  'q.exp.title': 'How many years of experience do you have in your nominated occupation?',
  'opt.exp.0': '0 years',
  'opt.exp.1': 'Under 1 year',
  'opt.exp.2': '1 to 3 years',
  'opt.exp.4': '3 to 5 years',
  'opt.exp.6': '6 to 8 years',
  'opt.exp.9': 'More than 8 years',
  'q.edu.title': 'What is your highest education level?',
  'opt.edu.other': 'Other qualification',
  'opt.edu.other.hint': 'Diploma, trade or other',
  'opt.edu.bachelors': "Bachelor's or Honours",
  'opt.edu.masters': "Master's",
  'opt.edu.phd': 'PhD',
  'q.skill.title': 'What is the skill level of your nominated occupation?',
  'opt.skill.1': 'Skill level 1',
  'opt.skill.1.hint': 'Bachelor degree or higher (ANZSCO)',
  'opt.skill.2': 'Skill level 2',
  'opt.skill.2.hint': 'Advanced diploma or diploma',
  'opt.skill.3': 'Skill level 3',
  'opt.skill.3.hint': 'Certificate IV or III with experience',
  // One wording for every skippable question (skill level and partner skills).
  'opt.unsure': "Skip, I'm not sure",
  'opt.unsure.hint': 'Your score will show as a range',
  'q.partner.title': 'Do you qualify for partner skill points?',
  'partner.intro': 'You get 50 points only if all three of these apply:',
  'partner.req1': 'You have claimed 10 points for Partner Skills in your SkillSelect EOI',
  'partner.req2': 'Your partner will be included in your state nominated visa application',
  'partner.req3': "Your partner's occupation is a current priority industry occupation",
  'opt.partner.yes': 'Yes, all three apply',
  'opt.partner.yes.hint': 'You claim 50 points',
  'opt.partner.no': 'You are single, have an Australian partner, or do not meet the requirements above',
  'q.earn.title': 'What is your annual earnings from current skilled employment in Victoria?',
  'q.earn.hint': 'Before tax, in AUD. Points start at $80,000. Enter 0 if you are in Australia and below that.',
  'q.earn.submit': 'See my score',
  'q.earn.or': 'or',
  'q.earn.offshore': 'I am offshore',
  'q.earn.offshore.hint': 'You are outside Australia, so earnings points do not apply and your score is out of 800',

  'cat.age': 'Age',
  'cat.english': 'English language',
  'cat.experience': 'Experience in nominated occupation',
  'cat.education': 'Education',
  'cat.skillLevel': 'Occupation skill level',
  'cat.partner': "Partner's skill",
  'cat.earnings': 'Victorian skilled earnings',

  'res.title': 'Your estimated Victorian Points Test score',
  'res.titleRange': 'Your estimated Victorian Points Test score (range)',
  'res.of': 'of {max}',
  'res.offshore': 'Offshore: Victorian earnings points do not apply',
  'res.notApplicable': 'Not applicable offshore',
  'res.to': '{a} to {b}',
  'res.perYear': '${amount} a year',
  'res.notClaimed': 'Not claimed',
  'res.startOver': 'Start over',

  'refine.title': 'Your score is a range',
  'refine.body': (p) =>
    `You skipped ${Number(p.count) === 1 ? 'a question' : 'two questions'}. Answer ${Number(p.count) === 1 ? 'it' : 'them'} to get an exact score and compare yourself with other candidates.`,
  'refine.skillLegend': 'Skill level of your nominated occupation',
  'refine.skill.1': 'Skill level 1 (Bachelor degree or higher)',
  'refine.skill.2': 'Skill level 2 (Advanced diploma or diploma)',
  'refine.skill.3': 'Skill level 3 (Certificate III or IV)',

  'submit.title': 'See how you compare',
  'submit.body':
    'Add your score to the pool and unlock your insights straight away. It takes one tap, and the more candidates submit, the more useful the comparison becomes for everyone.',
  'submit.benefitsTitle': 'Once you submit, you will see:',
  'submit.benefit1': 'Your rank among all candidates, and within your occupation',
  'submit.benefit2': 'Where your score sits across the whole pool',
  'submit.benefit3': 'How each category compares with the average candidate',
  'submit.benefit4': 'The quickest ways to add points',
  'submit.anonDetail':
    'It is completely anonymous: no name, no email, no account. We store only your answers and occupation. Other candidates only ever see combined statistics, and only people you share your result link with can see your result.',
  'submit.occLabel': 'Your nominated occupation',
  'submit.occHint': 'Add it to also see how you compare with candidates in the same occupation.',
  'submit.optional': '(optional)',
  'submit.placeholder': 'e.g. Software Engineer',
  'submit.note':
    'Insights appear once {min} candidates in your group have submitted. If that has not happened yet, your result is saved and you can check back any time.',
  'submit.suggestCount': '{n} submitted',
  'submit.cta': 'Submit anonymously and see my insights',
  'submit.busy': 'Submitting...',
  'submit.rate': (p) =>
    `You have submitted several scores recently. Try again in about ${p.minutes} ${plural(p.minutes, 'minute', 'minutes')}.`,
  'submit.invalidOcc': 'Use letters, numbers and basic punctuation only for the occupation.',
  'submit.error': 'Could not submit right now. Your score above is unaffected. Try again shortly.',

  'wait.title': 'Your score is saved',
  'wait.body': (p) =>
    `Comparisons unlock once ${p.min} ${p.loc} candidates have submitted. So far ${p.n} ${plural(p.n, 'has', 'have')}, including you.`,
  'wait.stay':
    'You can stay on this page, or come back to this link later and refresh to see your analysis once enough candidates have submitted.',
  'wait.anon': 'Your submission is anonymous, so there is nothing to worry about while you wait.',
  'wait.device': 'Your result is also listed under Your submissions on the home page of this device, so you can find it again if you close this tab.',
  'wait.check': 'Check again',
  'wait.checking': 'Checking...',
  'wait.stillWaiting': 'Still waiting for more candidates. Check again later.',

  'hist.title': 'Your submissions',
  'hist.sub': 'Saved on this device only. Every submission is anonymous: no name or email is attached.',
  'hist.points': '{total} points',
  'hist.noOcc': 'No occupation given',
  'hist.showAll': 'Show all {n}',
  'hist.showLess': 'Show fewer',
  'hist.clear': 'Clear this list',
  'hist.clearNote': 'This only removes the list from this device.',
  'hist.back': 'My submissions',

  'anon.badge': 'Anonymous',
  'home.privacy': 'Free to use, with no sign-up. Submitting your score is anonymous.',

  'ins.heading': (p) => `Your competitiveness among ${p.loc} candidates`,
  'ins.overall': 'Overall',
  'ins.yourOcc': 'Your occupation',
  'ins.median': 'Median',
  'ins.top': 'Top {p}%',
  'ins.na': 'n/a',
  'ins.distTitle': 'Where you sit in the pool',
  'ins.distAria': 'Score distribution of submitted candidates',
  'ins.distNote': 'Your bar is highlighted. Each bar covers 50 points.',
  'ins.distIqr': ' The middle half of candidates score {p25} to {p75}.',
  'ins.cmpTitle': 'You compared with the average',
  'ins.cmpVs': '{a} vs {b}',
  'ins.cmpNote': 'The dark tick marks the average of all submitted candidates.',
  'ins.pct': (p) => `${ordinal(Number(p.p))} percentile`,
  'ins.pctNote':
    'Percentile is the share of candidates who scored lower than you, plus half of those who tied. When most candidates share the same points in a section, that score sits near the 50th percentile.',
  'ins.avg': 'Average',
  'ins.leversTitle': 'Quickest ways to add points',
  'ins.keepLink': 'Keep this link to return to your result.',
  'ins.share': 'Share',
  'ins.copyLink': 'Copy link',
  'ins.copied': 'Copied',
  'ins.shareTitle': 'My VPT score',
  'ins.disclaimer':
    'Comparisons use candidates who submitted here, a self-selected group. They do not reflect official invitation data, and Victoria sets no fixed pass mark.',

  'assess.label.none': 'Not enough data yet',
  'assess.label.veryStrong': 'Very strong',
  'assess.label.strong': 'Strong',
  'assess.label.mid': 'Mid-range',
  'assess.label.below': 'Below average',
  'assess.label.low': 'Low for this pool',
  'assess.waiting': (p) =>
    `Only ${p.n} ${plural(p.n, 'candidate has', 'candidates have')} submitted so far. Rankings appear at ${p.min}. Check back as more candidates join.`,
  'assess.lineOverall': (p) =>
    `You scored higher than ${p.p}% of ${p.n} submitted ${p.loc} candidates. The median score is ${p.median}.`,
  'assess.lineOcc': 'In {name} you are ahead of {p}% of {n} candidates.',
  'assess.lineOccWaiting': 'Only {n} submitted in {name} so far. Rankings appear at {min}.',

  'lever.english.proficient': 'Reach Proficient English (PTE 65 or IELTS 7)',
  'lever.english.superior': 'Reach Superior English (PTE 79 or IELTS 8)',
  'lever.edu.bachelors': "Complete a Bachelor's degree",
  'lever.edu.masters': "Complete a Master's degree",
  'lever.edu.phd': 'Complete a PhD',
  'lever.exp.under1': 'Reach under 1 year of experience in your occupation',
  'lever.exp.1to3': 'Reach 1 to 3 years of experience in your occupation',
  'lever.exp.3to5': 'Reach 3 to 5 years of experience in your occupation',
  'lever.exp.6to8': 'Reach 6 to 8 years of experience in your occupation',
  'lever.exp.over8': 'Reach more than 8 years of experience in your occupation',
  'lever.earn': 'Earn ${amount} a year in skilled Victorian work',
  'lever.partner': 'Qualify for partner skill points',
} satisfies Record<string, Msg>

export type Key = keyof typeof en
