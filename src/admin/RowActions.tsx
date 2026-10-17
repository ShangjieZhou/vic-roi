import { useState } from 'react'
import { calculateVpt } from '../../supabase/functions/_shared/scoring'
import { OCCUPATION_BY_CODE } from '../../supabase/functions/_shared/occupations'
import type { OccupationChoice } from '../api'
import { Modal } from '../Modal'
import { OccupationPicker } from '../OccupationPicker'
import { AnswerFields, CHOICES, Select, inputFrom, type Answers } from './AnswerFields'
import { experienceBand } from './labels'
import { deleteSubmission, updateSubmission, type SubmissionRow } from './types'
import { BTN, problemText } from './ui'

// Edit and delete for one submission. Both change the stored data, so delete asks first, and an edit shows the new
// score before it is saved. Either one reloads the list through onChanged.
export function RowActions(props: { row: SubmissionRow; token: string; onExpired: () => void; onChanged: () => void }) {
  const { row, token, onExpired, onChanged } = props
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const remove = async () => {
    setBusy(true)
    const out = await deleteSubmission(token, row.id)
    setBusy(false)
    if (out.status === 'ok' || out.status === 'not_found') return onChanged()
    if (out.status === 'signed_out') return onExpired()
    setProblem(out.status)
  }

  return (
    <div className="mt-3">
      {!confirming ? (
        <div className="flex flex-wrap gap-2">
          <button className={BTN} onClick={() => setEditing(true)}>
            Edit
          </button>
          <button className={`${BTN} border-red-300 text-red-700 hover:bg-red-50`} onClick={() => setConfirming(true)}>
            Delete
          </button>
        </div>
      ) : (
        <div role="alertdialog" aria-label="Confirm delete" className="rounded-xl border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-900">Delete this submission? It is removed from every chart, and the candidate&apos;s result link stops working. This cannot be undone.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="min-h-11 rounded-lg bg-red-700 px-4 text-sm font-semibold text-white disabled:opacity-50 sm:min-h-10"
              disabled={busy}
              onClick={() => void remove()}
            >
              {busy ? 'Deleting...' : 'Delete permanently'}
            </button>
            <button className={BTN} disabled={busy} onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {problem && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {problemText(problem)}
        </p>
      )}
      {editing && (
        <EditModal
          row={row}
          token={token}
          onExpired={onExpired}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false)
            onChanged()
          }}
        />
      )}
    </div>
  )
}

type Occupation = 'keep' | 'clear' | OccupationChoice

function EditModal(props: { row: SubmissionRow; token: string; onExpired: () => void; onClose: () => void; onSaved: () => void }) {
  const { row } = props
  const band = experienceBand(row.experience)
  const [answers, setAnswers] = useState<Answers>({
    age: String(row.age),
    english: row.english,
    experience: band,
    education: row.education,
    skill: String(row.skill),
    partner: row.partner ? 'yes' : 'no',
    earnings: String(row.income),
    location: row.location,
  })
  const [occupation, setOccupation] = useState<Occupation>('keep')
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const patch = (p: Partial<Answers>) => setAnswers((a) => ({ ...a, ...p }))

  // A candidate whose saved years were typed in directly keeps that number when the band is left alone.
  const input = inputFrom({ ...answers, experience: answers.experience === band ? String(row.experience) : answers.experience })
  const newTotal = input ? calculateVpt(input).total : null

  const save = async () => {
    if (!input || busy) return
    setBusy(true)
    const code = occupation === 'keep' ? undefined : occupation === 'clear' ? null : occupation.kind === 'listed' ? occupation.code : undefined
    const out = await updateSubmission(props.token, row.id, input as unknown as Record<string, unknown>, code)
    setBusy(false)
    if (out.status === 'ok') return props.onSaved()
    if (out.status === 'signed_out') return props.onExpired()
    if (out.status === 'not_found') props.onSaved()
    setProblem(out.status)
  }

  const current = row.occupation ? `${row.occupation}${row.code ? ` (${row.code})` : ''}` : 'None'
  return (
    <Modal title="Edit submission" onClose={props.onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <p className="mt-1 text-xs text-stone-500">The score is worked out again from these answers. The submission time and the candidate&apos;s link stay the same.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <AnswerFields answers={answers} patch={patch} />
          <Select label="Location" value={answers.location} values={CHOICES.location} dimension="location" onChange={(v) => patch({ location: v })} />
        </div>

        <div className="mt-4">
          <span className="text-sm font-medium">Occupation</span>
          {occupation === 'keep' && !picking && (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="text-sm">{current}</span>
              <button type="button" className={BTN} onClick={() => setPicking(true)}>
                Change
              </button>
              {row.occupation && (
                <button type="button" className={BTN} onClick={() => setOccupation('clear')}>
                  Remove
                </button>
              )}
            </div>
          )}
          {occupation === 'clear' && (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="text-sm text-amber-800">The occupation will be removed.</span>
              <button type="button" className={BTN} onClick={() => setOccupation('keep')}>
                Undo
              </button>
            </div>
          )}
          {(picking || (occupation !== 'keep' && occupation !== 'clear')) && (
            <div className="mt-1">
              <OccupationPicker
                value={typeof occupation === 'object' ? occupation : null}
                onChange={(choice) => {
                  if (choice?.kind === 'listed' && OCCUPATION_BY_CODE.has(choice.code)) {
                    setOccupation(choice)
                    setPicking(false)
                  } else {
                    setOccupation('keep')
                    if (choice === null) setPicking(false)
                  }
                }}
              />
              <button type="button" className="mt-1 min-h-11 text-sm text-stone-500 underline" onClick={() => { setOccupation('keep'); setPicking(false) }}>
                Keep the current occupation
              </button>
            </div>
          )}
        </div>

        <p className="mt-4 text-sm">
          Score <span className="tabular-nums">{row.total}</span>
          {newTotal !== null && newTotal !== row.total && <> becomes <span className="font-semibold tabular-nums">{newTotal}</span></>}
          {newTotal === null && <span className="ml-2 text-red-700">Check the answers.</span>}
        </p>
        {problem && (
          <p role="alert" className="mt-2 text-sm text-red-700">
            {problemText(problem)}
          </p>
        )}
        <div className="mt-4 flex gap-2">
          <button type="button" className={`${BTN} flex-1`} onClick={props.onClose}>
            Cancel
          </button>
          <button type="submit" disabled={!input || busy} className="min-h-11 flex-1 rounded-lg bg-accent px-4 text-sm font-semibold text-white disabled:opacity-50 sm:min-h-10">
            {busy ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
