// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../services/notificationService', () => ({
  notificationService: { list: vi.fn(), unreadCount: vi.fn(), refresh: vi.fn(), markRead: vi.fn(), markAllRead: vi.fn() },
}))
const authState = { user: { id: 1, role: 'USER', full_name: 'Maya' }, loading: false, isAdmin: false }
vi.mock('../../context/AuthContext', () => ({ useAuth: () => authState }))

import NotificationBell from '../../components/notifications/NotificationBell'
import { NotificationsProvider, useNotifications } from '../../context/NotificationsContext'
import { notificationService as svc } from '../../services/notificationService'
import Notifications from './Notifications'

const N = (over = {}) => ({
  id: 1, notification_type: 'ASSESSMENT_COMPLETED', title: 'Assessment complete', message: 'Your health score is 72 (moderate risk).', is_read: false, read_at: null,
  related_entity_type: 'ASSESSMENT', related_entity_id: 5, action_url: null, created_at: new Date(Date.now() - 5 * 60_000).toISOString().slice(0, 19), ...over,
})
const page = (items, over = {}) => ({ items, total: items.length, unread: items.filter((i) => !i.is_read).length, page: 1, page_size: 20, ...over })

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  svc.list.mockResolvedValue(page([N(), N({ id: 2, notification_type: 'WEEKLY_REPORT', title: 'Weekly report ready', message: 'Ready.', is_read: true, related_entity_type: 'WEEKLY_REPORT', related_entity_id: 3 })]))
  svc.unreadCount.mockResolvedValue({ unread: 1 }); svc.refresh.mockResolvedValue({ created: 0 })
  svc.markRead.mockResolvedValue({}); svc.markAllRead.mockResolvedValue({ updated: 1 })
})
afterEach(() => { cleanup(); vi.useRealTimers(); delete window.Notification; Object.defineProperty(document, 'hidden', { configurable: true, value: false }) })

const Where = () => <p data-testid="where">{useLocation().pathname}</p>
const renderInbox = () => render(<MemoryRouter initialEntries={['/notifications']}><NotificationsProvider><Routes><Route path="/notifications" element={<Notifications />} /><Route path="*" element={<Where />} /></Routes></NotificationsProvider></MemoryRouter>)

describe('NotificationBell', () => {
  const bell = () => render(<MemoryRouter><NotificationsProvider><NotificationBell /></NotificationsProvider></MemoryRouter>)
  it('shows the unread count and announces it to screen readers', async () => {
    svc.unreadCount.mockResolvedValue({ unread: 3 })
    bell()
    expect(await screen.findByRole('link', { name: 'Notifications, 3 unread' })).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
  })
  it('shows no badge at zero and caps big numbers', async () => {
    svc.unreadCount.mockResolvedValue({ unread: 0 })
    const { unmount } = bell()
    expect(await screen.findByRole('link', { name: 'Notifications' })).toBeTruthy()
    expect(screen.queryByText('0')).toBeNull()
    unmount()
    svc.unreadCount.mockResolvedValue({ unread: 250 })
    bell()
    expect(await screen.findByText('99+')).toBeTruthy()
  })
  it('asks the server to derive due notifications first, then reads the count', async () => {
    bell()
    await screen.findByRole('link')
    await waitFor(() => expect(svc.unreadCount).toHaveBeenCalled())
    expect(svc.refresh).toHaveBeenCalledTimes(1)
    expect(svc.refresh.mock.invocationCallOrder[0]).toBeLessThan(svc.unreadCount.mock.invocationCallOrder[0])
  })
  it('keeps working (no crash, no badge) when the server is unreachable', async () => {
    svc.refresh.mockRejectedValue(new Error('offline')); svc.unreadCount.mockRejectedValue(new Error('offline'))
    bell()
    expect(await screen.findByRole('link', { name: 'Notifications' })).toBeTruthy()
  })
})

describe('Inbox page', () => {
  it('lists notifications with unread ones highlighted and the real message text', async () => {
    renderInbox()
    expect(await screen.findByText('Your health score is 72 (moderate risk).')).toBeTruthy()
    expect(screen.getByText('New')).toBeTruthy()
    expect(screen.getByText('1 unread')).toBeTruthy()
    expect(screen.getAllByText(/5 minutes ago/).length).toBe(2)
  })

  it('marks one as read via the API and updates the unread count without reloading', async () => {
    renderInbox()
    fireEvent.click(await screen.findByRole('button', { name: /Mark as read\s*:\s*Assessment complete/ }))
    await waitFor(() => expect(svc.markRead).toHaveBeenCalledWith(1))
    expect(await screen.findByText('0 unread')).toBeTruthy()
    expect(screen.queryByText('New')).toBeNull()
  })

  it('"Open" goes to the related page and marks the notification read', async () => {
    renderInbox()
    fireEvent.click(await screen.findByRole('link', { name: /Open\s*:\s*Assessment complete/ }))
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/assessment/5'))
    expect(svc.markRead).toHaveBeenCalledWith(1)
  })

  it('does not mark an already-read notification again when opened', async () => {
    renderInbox()
    fireEvent.click(await screen.findByRole('link', { name: /Open\s*:\s*Weekly report ready/ }))
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/reports'))
    expect(svc.markRead).not.toHaveBeenCalled()
  })

  it('marks all as read and reloads; the button is disabled when nothing is unread', async () => {
    renderInbox()
    fireEvent.click(await screen.findByRole('button', { name: /Mark all as read/ }))
    await waitFor(() => expect(svc.markAllRead).toHaveBeenCalled())
    await waitFor(() => expect(svc.list.mock.calls.length).toBeGreaterThan(1))
    cleanup()
    svc.list.mockResolvedValue(page([N({ is_read: true })]))
    renderInbox()
    await screen.findByText('0 unread')
    expect(screen.getByRole('button', { name: /Mark all as read/ }).disabled).toBe(true)
  })

  it('the Unread filter asks the API for unread only and resets to page 1', async () => {
    renderInbox()
    await screen.findByText('Assessment complete')
    fireEvent.click(screen.getByRole('button', { name: 'Unread' }))
    await waitFor(() => expect(svc.list).toHaveBeenLastCalledWith(expect.objectContaining({ unread_only: true, page: 1 })))
  })

  it('paginates', async () => {
    svc.list.mockResolvedValue(page([N()], { total: 45 }))
    renderInbox()
    await screen.findByText('Showing 1–20 of 45')
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(svc.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })))
  })

  it('has honest empty states for "all" and "unread"', async () => {
    svc.list.mockResolvedValue(page([]))
    renderInbox()
    expect(await screen.findByText('No notifications yet')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Unread' }))
    expect(await screen.findByText("You're all caught up")).toBeTruthy()
  })

  it('shows an error with a working retry', async () => {
    svc.list.mockRejectedValueOnce({ response: { status: 500, data: {} } })
    renderInbox()
    expect(await screen.findByText(/Something went wrong on our side/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Assessment complete')).toBeTruthy()
  })

  it('shows the server message if marking read fails, and keeps the item unread', async () => {
    svc.markRead.mockRejectedValue({ response: { status: 404, data: { detail: 'Notification not found' } } })
    renderInbox()
    fireEvent.click(await screen.findByRole('button', { name: /Mark as read\s*:\s*Assessment complete/ }))
    expect(await screen.findByText('Notification not found')).toBeTruthy()
    expect(screen.getByText('New')).toBeTruthy()
  })
})

describe('Desktop alerts (opt-in, browser Notification API)', () => {
  it('says so when the browser does not support them', async () => {
    renderInbox()
    expect(await screen.findByText(/aren't supported by this browser/)).toBeTruthy()
  })

  it('asks for permission only when the user turns it on, and remembers the choice per user', async () => {
    window.Notification = Object.assign(function () {}, { permission: 'default', requestPermission: vi.fn(async () => 'granted') })
    renderInbox()
    const toggle = await screen.findByRole('button', { name: 'Turn on desktop alerts' })
    expect(window.Notification.requestPermission).not.toHaveBeenCalled()
    fireEvent.click(toggle)
    await waitFor(() => expect(window.Notification.requestPermission).toHaveBeenCalled())
    expect(await screen.findByRole('button', { name: 'Turn off desktop alerts' })).toBeTruthy()
    expect(localStorage.getItem('hp.desktop_alerts.1')).toBe('1')
    fireEvent.click(screen.getByRole('button', { name: 'Turn off desktop alerts' }))
    expect(localStorage.getItem('hp.desktop_alerts.1')).toBeNull()
  })

  it('does not turn on when the user refuses permission, and explains a blocked browser', async () => {
    window.Notification = Object.assign(function () {}, { permission: 'default', requestPermission: vi.fn(async () => 'denied') })
    renderInbox()
    fireEvent.click(await screen.findByRole('button', { name: 'Turn on desktop alerts' }))
    expect(await screen.findByText(/blocked for this site/)).toBeTruthy()
    expect(localStorage.getItem('hp.desktop_alerts.1')).toBeNull()
    expect(screen.getByRole('button', { name: 'Turn on desktop alerts' }).disabled).toBe(true)
  })

  it('states plainly that nothing is delivered when the app is closed', async () => {
    window.Notification = Object.assign(function () {}, { permission: 'default', requestPermission: vi.fn() })
    renderInbox()
    expect(await screen.findByText(/Nothing is delivered when the app is closed/)).toBeTruthy()
  })
})

describe('NotificationsProvider: polling and desktop alerts', () => {
  const Probe = () => <p>unread:{useNotifications().unread}</p>
  const setup = () => render(<NotificationsProvider><Probe /></NotificationsProvider>)
  const hidden = (v) => Object.defineProperty(document, 'hidden', { configurable: true, value: v })
  const asleep = async (ms) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms) }) }

  it('re-reads the unread count every minute', async () => {
    vi.useFakeTimers()
    svc.unreadCount.mockResolvedValueOnce({ unread: 1 }).mockResolvedValue({ unread: 4 })
    setup()
    await asleep(10)
    expect(screen.getByText('unread:1')).toBeTruthy()
    await asleep(60_000)
    expect(screen.getByText('unread:4')).toBeTruthy()
  })

  it('derives due notifications at start but not on every poll', async () => {
    vi.useFakeTimers()
    setup()
    await asleep(10)
    await asleep(60_000 * 3)
    expect(svc.refresh).toHaveBeenCalledTimes(1)
    expect(svc.unreadCount.mock.calls.length).toBeGreaterThanOrEqual(4)
  })

  it('announces only NEW notifications, only when opted in + allowed + the tab is hidden', async () => {
    vi.useFakeTimers()
    const shown = []
    window.Notification = Object.assign(function (title, opts) { shown.push([title, opts.tag]) }, { permission: 'granted' })
    localStorage.setItem('hp.desktop_alerts.1', '1')
    hidden(true)
    svc.unreadCount.mockResolvedValueOnce({ unread: 1 }).mockResolvedValue({ unread: 2 })
    svc.list.mockResolvedValueOnce(page([N({ id: 1 })])).mockResolvedValue(page([N({ id: 2, title: 'Weekly report ready' }), N({ id: 1 })]))
    setup()
    await asleep(10)
    expect(shown).toEqual([]) // the first look only records what already exists
    await asleep(60_000)
    expect(shown).toEqual([['Weekly report ready', 'hp-notification-2']])
    await asleep(60_000)
    expect(shown).toHaveLength(1) // never announced twice
  })

  it.each([
    ['the user has not opted in', () => {}],
    ['the tab is visible', () => { localStorage.setItem('hp.desktop_alerts.1', '1'); hidden(false) }],
    ['permission is denied', () => { localStorage.setItem('hp.desktop_alerts.1', '1'); hidden(true); window.Notification.permission = 'denied' }],
  ])('stays silent when %s', async (_name, arrange) => {
    vi.useFakeTimers()
    const shown = []
    window.Notification = Object.assign(function (t) { shown.push(t) }, { permission: 'granted' })
    arrange()
    svc.unreadCount.mockResolvedValue({ unread: 2 })
    svc.list.mockResolvedValue(page([N({ id: 1 }), N({ id: 2 })]))
    setup()
    await asleep(10)
    await asleep(60_000)
    expect(shown).toEqual([])
  })
})
