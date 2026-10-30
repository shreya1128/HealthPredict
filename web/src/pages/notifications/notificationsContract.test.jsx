// @vitest-environment jsdom
/**
 * Renders the REAL inbox page from a response RECORDED from a real backend run (notifications.json: real records produced real
 * notifications; a second user saw none). Re-record it if the notifications API changes (see pages/admin/__fixtures__/README.md
 * for the approach: run a real scenario, save GET /api/notifications).
 */
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import recorded from './notifications.json'
import { notificationRoute } from '../../utils/notificationFormat'

vi.mock('../../services/notificationService', () => ({
  notificationService: { list: vi.fn(), unreadCount: vi.fn(), refresh: vi.fn(), markRead: vi.fn(), markAllRead: vi.fn() },
}))
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 1, role: 'USER' }, isAdmin: false }) }))

import { NotificationsProvider } from '../../context/NotificationsContext'
import { notificationService as svc } from '../../services/notificationService'
import Notifications from './Notifications'

beforeEach(() => {
  svc.list.mockResolvedValue(recorded); svc.unreadCount.mockResolvedValue({ unread: recorded.unread }); svc.refresh.mockResolvedValue({ created: 0 })
})
afterEach(cleanup)

describe('the inbox rendered from real recorded API data', () => {
  it('shows every recorded notification with its real title and message, and the real unread count', async () => {
    render(<MemoryRouter><NotificationsProvider><Notifications /></NotificationsProvider></MemoryRouter>)
    expect(await screen.findByText(`${recorded.unread} unread`)).toBeTruthy()
    for (const n of recorded.items) {
      expect(screen.getByRole('heading', { name: n.title })).toBeTruthy()
      if (n.message) expect(screen.getByText(n.message)).toBeTruthy()
    }
    expect(screen.getAllByText('New')).toHaveLength(recorded.items.filter((n) => !n.is_read).length)
  })

  it('every notification the backend really produced has a working destination in the web app', () => {
    expect(recorded.items.length).toBeGreaterThanOrEqual(4)
    for (const n of recorded.items) expect(notificationRoute(n), `${n.notification_type} / ${n.related_entity_type}`).not.toBeNull()
  })

  it('renders an "Open" link for each one, pointing at the real related record', async () => {
    render(<MemoryRouter><NotificationsProvider><Notifications /></NotificationsProvider></MemoryRouter>)
    await screen.findByText(`${recorded.unread} unread`)
    const list = within(screen.getByRole('list'))
    for (const n of recorded.items) {
      const link = list.getByRole('link', { name: new RegExp(`Open\\s*:\\s*${n.title}`) })
      expect(link.getAttribute('href')).toBe(notificationRoute(n))
    }
  })

  it('the recording contains no emails or credentials', () => {
    const text = JSON.stringify(recorded).toLowerCase()
    expect(text).not.toContain('@')
    expect(text).not.toContain('password')
  })
})
