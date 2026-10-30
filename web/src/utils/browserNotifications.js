/**
 * Optional desktop alerts using the browser Notification API.
 *
 * WHAT THIS IS: a system notification shown by the open web app (while the tab is hidden) when a NEW in-app notification arrives.
 * WHAT THIS IS NOT: Web Push. There is no service worker and no push server, so nothing is delivered when the app is closed.
 * Opt-in only, remembered per user in localStorage.
 */
const key = (userId) => `hp.desktop_alerts.${userId}`

export const isSupported = (win = typeof window !== 'undefined' ? window : undefined) => Boolean(win && 'Notification' in win)

/** 'granted' | 'denied' | 'default' | 'unsupported' */
export function getPermission(win = typeof window !== 'undefined' ? window : undefined) {
  return isSupported(win) ? win.Notification.permission : 'unsupported'
}

export async function requestPermission(win = typeof window !== 'undefined' ? window : undefined) {
  if (!isSupported(win)) return 'unsupported'
  try {
    return await win.Notification.requestPermission()
  } catch {
    return win.Notification.permission
  }
}

export function getPreference(userId, storage = typeof localStorage !== 'undefined' ? localStorage : undefined) {
  try { return storage?.getItem(key(userId)) === '1' } catch { return false }
}

export function setPreference(userId, enabled, storage = typeof localStorage !== 'undefined' ? localStorage : undefined) {
  try { enabled ? storage?.setItem(key(userId), '1') : storage?.removeItem(key(userId)) } catch { /* not remembered */ }
}

/** Alerts are only shown when the user opted in, the browser allows it, and the tab is hidden (otherwise the bell is enough). */
export function canAnnounce(
  userId,
  win = typeof window !== 'undefined' ? window : undefined,
  doc = typeof document !== 'undefined' ? document : undefined,
  storage = typeof localStorage !== 'undefined' ? localStorage : undefined,
) {
  return getPreference(userId, storage) && getPermission(win) === 'granted' && Boolean(doc?.hidden)
}

export function showNotification(n, win = typeof window !== 'undefined' ? window : undefined) {
  if (!isSupported(win) || win.Notification.permission !== 'granted') return null
  try {
    return new win.Notification(n.title, { body: n.message || undefined, tag: `hp-notification-${n.id}` })
  } catch {
    return null // some browsers throw (e.g. constructing from an insecure context); the in-app inbox is unaffected
  }
}
