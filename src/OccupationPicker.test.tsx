// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OccupationChoice } from './api'
import { LangProvider } from './i18n'
import { OccupationPicker } from './OccupationPicker'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

function Harness({ onChange }: { onChange?: (value: OccupationChoice | null) => void }) {
  const [value, setValue] = useState<OccupationChoice | null>(null)
  return (
    <OccupationPicker
      value={value}
      onChange={(next) => {
        setValue(next)
        onChange?.(next)
      }}
    />
  )
}

const setup = (onChange = vi.fn()) => {
  render(
    <LangProvider>
      <Harness onChange={onChange} />
    </LangProvider>,
  )
  return { onChange, box: () => screen.getByRole('combobox') as HTMLInputElement }
}
const typeQuery = (box: HTMLInputElement, text: string) => fireEvent.change(box, { target: { value: text } })

describe('OccupationPicker', () => {
  it('explains where the occupations come from and shows no results before typing', () => {
    setup()
    expect(screen.getByText('Search the official list by name or ANZSCO code.')).toBeTruthy()
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('finds an occupation, selects it by its code and lets the candidate change it', () => {
    const { onChange, box } = setup()
    typeQuery(box(), 'software engineer')
    expect(screen.getByText('ANZSCO 261313')).toBeTruthy()
    fireEvent.click(screen.getByText('Software engineer'))
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'listed', code: '261313' })

    // The search box is replaced by the chosen occupation.
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.getByText('Software engineer')).toBeTruthy()
    expect(screen.getByText('ANZSCO 261313')).toBeTruthy()

    fireEvent.click(screen.getByText('Change'))
    expect(onChange).toHaveBeenLastCalledWith(null)
    expect((box() as HTMLInputElement).value).toBe('')
  })

  it('finds by code and by everyday name', () => {
    const { box } = setup()
    typeQuery(box(), '261313')
    expect(screen.getByText('Software engineer')).toBeTruthy()
    typeQuery(box(), 'developer')
    expect(screen.getByText('Developer programmer')).toBeTruthy()
  })

  it('tags occupations that are on the regional list only', () => {
    const { box } = setup()
    typeQuery(box(), 'aquaculture')
    expect(screen.getByText('491 only')).toBeTruthy()

    typeQuery(box(), 'software engineer')
    expect(screen.queryByText('491 only')).toBeNull()
  })

  it('warns on the chosen occupation when it does not apply to subclass 190', () => {
    const { box } = setup()
    typeQuery(box(), 'aquaculture farmer')
    fireEvent.click(screen.getByText('Aquaculture farmer'))
    expect(screen.getByText(/only on the regional list, so it applies to subclass 491 but not 190/)).toBeTruthy()
  })

  it('offers free text for an occupation that is not listed', () => {
    const { onChange, box } = setup()
    typeQuery(box(), 'Barista')
    expect(screen.getByText('No match in the list. You can still use what you typed.')).toBeTruthy()
    fireEvent.click(screen.getByText('Use "Barista" (not in the list)'))
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'free', text: 'Barista' })
    expect(screen.getByText('Barista')).toBeTruthy()
    // Typed text has no ANZSCO code to show.
    expect(screen.queryByText(/ANZSCO/)).toBeNull()
  })

  it('does not offer free text the server would reject', () => {
    const { box } = setup()
    typeQuery(box(), '<script>')
    expect(screen.queryByText(/not in the list/)).toBeNull()
    typeQuery(box(), 'a')
    expect(screen.queryByText(/not in the list/)).toBeNull()
  })

  it('shows at most eight matches', () => {
    const { box } = setup()
    typeQuery(box(), 'manager')
    expect(screen.getAllByText(/^ANZSCO \d{6}$/).length).toBeLessThanOrEqual(8)
  })

  it('shows Chinese names with the English title beside them', () => {
    localStorage.setItem('vpt-lang', 'zh')
    const { onChange, box } = setup()
    expect(box().placeholder).toBe('搜索，例如：软件工程师')
    typeQuery(box(), '软件')
    expect(screen.getByText('软件工程师')).toBeTruthy()
    expect(screen.getByText('Software engineer')).toBeTruthy()
    fireEvent.click(screen.getByText('软件工程师'))
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'listed', code: '261313' })
    expect(screen.getByText('ANZSCO 261313')).toBeTruthy()
    expect(screen.getByText('更换')).toBeTruthy()
  })

  it('tags the regional-only occupations in Chinese too', () => {
    localStorage.setItem('vpt-lang', 'zh')
    const { box } = setup()
    typeQuery(box(), '水产养殖')
    expect(screen.getByText('仅限 491')).toBeTruthy()
  })
})
