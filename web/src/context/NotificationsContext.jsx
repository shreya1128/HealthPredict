import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from './AuthContext'
import { notificationService } from '../services/notificationService'
import { canAnnounce, showNotification } from '../utils/browserNotifications'

const NotificationsContext = createContext({ unread: 0, refreshCount: async () => {} })

const POLL_MS = 60_000
const DERIVE_EVERY_MS = 5 * 60_000

/**
 * Keeps the unread count fresh for the bell and the inbox page.
 *  - On sign-in and when the tab becomes visible again (at most every 5 minutes) it asks the server to derive any due notifications.
 *  - Every minute it re-reads the unread count. Failures are silent: the bell keeps its last value.
 *  - If the user opted in to desktop alerts, NEW unread notifications are announced while the tab is hidden.
 */
export function NotificationsProvider({ children }) {
  const { user } = useAuth()
  const userId = user?.id
  const [unread, setUnread] = useState(0)
  const announced = useRef(new Set())
  const primed = useRef(false)
  const lastDerive = useRef(0)

  const announceNew = useCallback(async () => {
    if (!canAnnounce(userId)) return
    const { items } = await notificationService.list({ unread_only: true, page_size: 10 })
    if (!primed.current) { // first look: remember what is already there instead of announcing old items
      items.forEach((n) => announced.current.add(n.id))
      primed.current = true
      return
    }
    items.filter((n) => !announced.current.has(n.id)).forEach((n) => { announced.current.add(n.id); showNotification(n) })
  }, [userId])

  const check = useCallback(async (derive = false) => {
    try {
      if (derive) { lastDerive.current = Date.now(); await notificationService.refresh() }
      const { unread: n } = await notificationService.unreadCount()
      setUnread(n)
      await announceNew()
    } catch { /* keep the last known count */ }
  }, [announceNew])

  useEffect(() => {
    if (!userId) return undefined
    void check(true)
    const timer = setInterval(() => void check(Date.now() - lastDerive.current > DERIVE_EVERY_MS), POLL_MS)
    const onVisible = () => { if (!document.hidden) void check(Date.now() - lastDerive.current > DERIVE_EVERY_MS) }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [userId, check])

  const value = useMemo(() => ({ unread, refreshCount: () => check(false) }), [unread, check])
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
}

export const useNotifications = () => useContext(NotificationsContext)
