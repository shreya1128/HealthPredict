import { describe, expect, it, vi } from 'vitest'
import { canAnnounce, getPermission, getPreference, isSupported, requestPermission, setPreference, showNotification } from './browserNotifications'

const memoryStorage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) } }
const fakeWindow = (permission = 'granted', ctor = vi.fn()) => { const N = function N(...a) { ctor(...a) }; N.permission = permission; N.requestPermission = vi.fn(async () => 'granted'); return { Notification: N, ctor } }

describe('support and permission', () => {
  it('reports unsupported browsers honestly', () => {
    expect(isSupported({})).toBe(false)
    expect(getPermission({})).toBe('unsupported')
    expect(isSupported(undefined)).toBe(false)
  })
  it('reads and requests permission', async () => {
    const w = fakeWindow('default')
    expect(getPermission(w)).toBe('default')
    expect(await requestPermission(w)).toBe('granted')
    expect(await requestPermission({})).toBe('unsupported')
  })
  it('survives requestPermission throwing', async () => {
    const w = fakeWindow('default'); w.Notification.requestPermission = vi.fn(async () => { throw new Error('nope') })
    expect(await requestPermission(w)).toBe('default')
  })
})

describe('preference is per user and opt-in', () => {
  it('defaults to off and remembers on/off for one user only', () => {
    const s = memoryStorage()
    expect(getPreference(1, s)).toBe(false)
    setPreference(1, true, s)
    expect(getPreference(1, s)).toBe(true)
    expect(getPreference(2, s)).toBe(false)
    setPreference(1, false, s)
    expect(getPreference(1, s)).toBe(false)
  })
  it('does not throw when storage is unavailable', () => {
    const broken = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') }, removeItem: () => { throw new Error('blocked') } }
    expect(getPreference(1, broken)).toBe(false)
    expect(() => setPreference(1, true, broken)).not.toThrow()
  })
})

describe('showNotification', () => {
  it('shows with a stable tag so the same notification is never stacked', () => {
    const w = fakeWindow('granted')
    expect(showNotification({ id: 7, title: 'Weekly report ready', message: 'Your report is available.' }, w)).not.toBeNull()
    expect(w.ctor).toHaveBeenCalledWith('Weekly report ready', { body: 'Your report is available.', tag: 'hp-notification-7' })
  })
  it('does nothing without permission or support, and swallows constructor errors', () => {
    const denied = fakeWindow('denied')
    expect(showNotification({ id: 1, title: 'x' }, denied)).toBeNull()
    expect(denied.ctor).not.toHaveBeenCalled()
    expect(showNotification({ id: 1, title: 'x' }, {})).toBeNull()
    const throwing = fakeWindow('granted', () => { throw new Error('insecure context') })
    expect(showNotification({ id: 1, title: 'x' }, throwing)).toBeNull()
  })
})

describe('canAnnounce needs opt-in AND permission AND a hidden tab', () => {
  const optedIn = () => { const s = memoryStorage(); setPreference(1, true, s); return s }
  it('is true only when all three hold', () => {
    expect(canAnnounce(1, fakeWindow('granted'), { hidden: true }, optedIn())).toBe(true)
  })
  it.each([
    ['not opted in', () => [fakeWindow('granted'), { hidden: true }, memoryStorage()]],
    ['permission default', () => [fakeWindow('default'), { hidden: true }, optedIn()]],
    ['permission denied', () => [fakeWindow('denied'), { hidden: true }, optedIn()]],
    ['browser unsupported', () => [{}, { hidden: true }, optedIn()]],
    ['tab visible', () => [fakeWindow('granted'), { hidden: false }, optedIn()]],
    ['opted in for a different user', () => { const s = memoryStorage(); setPreference(2, true, s); return [fakeWindow('granted'), { hidden: true }, s] }],
  ])('is false when %s', (_n, arrange) => {
    const [w, d, s] = arrange()
    expect(canAnnounce(1, w, d, s)).toBe(false)
  })
})
