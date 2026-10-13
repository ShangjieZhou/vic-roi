// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// The in-memory fallback lives at module level, so each test loads a fresh copy.
async function load() {
  vi.resetModules()
  return (await import('./device')).getDeviceId
}

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('getDeviceId', () => {
  it('creates a random id, stores it, and returns the same one every time', async () => {
    const getDeviceId = await load()
    const id = getDeviceId()
    expect(id).toMatch(UUID)
    expect(localStorage.getItem('vpt-device')).toBe(id)
    expect(getDeviceId()).toBe(id)
  })

  it('keeps the id across page loads', async () => {
    const first = (await load())()
    const second = (await load())()
    expect(second).toBe(first)
  })

  it('gives a different id to a different browser', async () => {
    const first = (await load())()
    localStorage.clear()
    expect((await load())()).not.toBe(first)
  })

  it('replaces a stored value that is not a valid id', async () => {
    localStorage.setItem('vpt-device', 'not-a-uuid')
    const id = (await load())()
    expect(id).toMatch(UUID)
    expect(localStorage.getItem('vpt-device')).toBe(id)
  })

  it('still works, with one id for the visit, when storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const getDeviceId = await load()
    const id = getDeviceId()
    expect(id).toMatch(UUID)
    expect(getDeviceId()).toBe(id)
  })

  it('builds a valid id where crypto.randomUUID is unavailable, such as plain HTTP', async () => {
    vi.stubGlobal('crypto', { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) })
    expect((await load())()).toMatch(UUID)
  })
})
