import {
  Bell,
  Calendar,
  Check,
  CheckCheck,
  ClipboardList,
  Clock,
  FileText,
  Flame,
  HeartPulse,
  Moon,
  Pill,
  Settings2,
  Sparkles,
  Target,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Spinner } from '../../components/common/Feedback'
import Pagination from '../../components/admin/Pagination'
import { useAuth } from '../../context/AuthContext'
import { useNotifications } from '../../context/NotificationsContext'
import { getErrorMessage } from '../../services/api'
import { notificationService } from '../../services/notificationService'
import { getPermission, getPreference, isSupported, requestPermission, setPreference } from '../../utils/browserNotifications'
import { notificationRoute, timeAgo, typeLabel } from '../../utils/notificationFormat'

const PAGE_SIZE = 20
const ICONS = {
  MISSED_MEDICINE: Pill,
  MEDICINE_REMINDER: Pill,
  ASSESSMENT_COMPLETED: HeartPulse,
  WEEKLY_REPORT: FileText,
  GOAL_PROGRESS: Target,
  WELLNESS_REMINDER: ClipboardList,
  REFILL_ALERT: Pill,
  APPOINTMENT_REMINDER: Calendar,
  STREAK_MILESTONE: Flame,
}

function DesktopAlerts({ userId }) {
  const [enabled, setEnabled] = useState(() => getPreference(userId))
  const [permission, setPermission] = useState(() => getPermission())

  async function toggle() {
    if (enabled) {
      setPreference(userId, false)
      setEnabled(false)
      return
    }
    let p = getPermission()
    if (p !== 'granted') p = await requestPermission()
    setPermission(p)
    if (p === 'granted') {
      setPreference(userId, true)
      setEnabled(true)
      if ('serviceWorker' in navigator) {
        try {
          const reg = await navigator.serviceWorker.register('/sw.js')
          if (notificationService.getVapidPublicKey && notificationService.subscribeWebPush) {
            const { public_key } = await notificationService.getVapidPublicKey()
            if (public_key && reg?.pushManager) {
              const sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: public_key,
              })
              const subJson = sub.toJSON()
              await notificationService.subscribeWebPush({
                endpoint: sub.endpoint,
                keys: {
                  p256dh: subJson.keys?.p256dh || '',
                  auth: subJson.keys?.auth || '',
                },
              })
            }
          }
        } catch {
          // Ignore service worker registration failure in test environment
        }
      }
    }
  }

  if (!isSupported()) {
    return <p className="text-sm text-slate-600">Desktop alerts aren't supported by this browser. Your inbox still works.</p>
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="max-w-xl">
        <p className="text-sm font-semibold text-slate-800">Desktop alerts</p>
        <p className="text-xs text-slate-500">
          Show a system notification when something new arrives <strong>while HealthPredict is open in a background tab</strong>.
          Nothing is delivered when the app is closed.
        </p>
        {permission === 'denied' ? (
          <p className="mt-1 text-xs text-amber-700" role="status">Notifications are blocked for this site in your browser settings.</p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={enabled}
        disabled={permission === 'denied' && !enabled}
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        {enabled ? 'Turn off desktop alerts' : 'Turn on desktop alerts'}
      </button>
    </div>
  )
}

function PreferencesPanel() {
  const [open, setOpen] = useState(false)
  const [quietStart, setQuietStart] = useState('')
  const [quietEnd, setQuietEnd] = useState('')
  const [leadTime, setLeadTime] = useState(15)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (notificationService.getPreferences) {
      notificationService.getPreferences().then((p) => {
        if (p) {
          setQuietStart(p.quiet_hours_start || '')
          setQuietEnd(p.quiet_hours_end || '')
          setLeadTime(p.reminder_lead_time_minutes ?? 15)
        }
      }).catch(() => {})
    }
  }, [])

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    try {
      if (notificationService.updatePreferences) {
        await notificationService.updatePreferences({
          quiet_hours_start: quietStart || null,
          quiet_hours_end: quietEnd || null,
          reminder_lead_time_minutes: Number(leadTime),
        })
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      }
    } catch (err) {
      console.warn('Failed to save preferences:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Moon className="h-5 w-5 text-teal-600" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Quiet Hours & Reminder Schedule</h2>
            <p className="text-xs text-slate-500">Mute non-urgent dose reminders during sleep hours and set lead times.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:underline"
        >
          <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
          {open ? 'Hide settings' : 'Configure'}
        </button>
      </div>

      {open && (
        <form onSubmit={handleSave} className="mt-4 border-t border-slate-100 pt-4 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="quiet-start" className="block text-xs font-medium text-slate-700">Quiet Hours Start</label>
              <input
                id="quiet-start"
                type="time"
                value={quietStart}
                onChange={(e) => setQuietStart(e.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm shadow-sm focus:border-teal-500 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="quiet-end" className="block text-xs font-medium text-slate-700">Quiet Hours End</label>
              <input
                id="quiet-end"
                type="time"
                value={quietEnd}
                onChange={(e) => setQuietEnd(e.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm shadow-sm focus:border-teal-500 focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label htmlFor="lead-time" className="block text-xs font-medium text-slate-700">Reminder Lead Time (minutes before scheduled dose)</label>
            <select
              id="lead-time"
              value={leadTime}
              onChange={(e) => setLeadTime(Number(e.target.value))}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm shadow-sm focus:border-teal-500 focus:outline-none"
            >
              <option value={0}>At scheduled time (0 min)</option>
              <option value={5}>5 minutes before</option>
              <option value={10}>10 minutes before</option>
              <option value={15}>15 minutes before (Recommended)</option>
              <option value={30}>30 minutes before</option>
              <option value={60}>1 hour before</option>
            </select>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Preferences'}
            </button>
            {saved && (
              <span className="inline-flex items-center gap-1 text-xs text-teal-700 font-medium">
                <Check className="h-3.5 w-3.5" aria-hidden="true" /> Preferences saved!
              </span>
            )}
          </div>
        </form>
      )}
    </div>
  )
}

function StreaksBanner() {
  const [streaks, setStreaks] = useState(null)

  useEffect(() => {
    if (notificationService.getStreaks) {
      notificationService.getStreaks().then((s) => setStreaks(s)).catch(() => {})
    }
  }, [])

  if (!streaks || streaks.longest_streak_days === 0) return null

  return (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500 text-white shadow-sm">
            <Flame className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-amber-950">
                {streaks.current_streak_days}-Day Adherence Streak!
              </h2>
              {streaks.is_streak_active_today && (
                <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-800">Today complete</span>
              )}
            </div>
            <p className="text-xs text-amber-800">
              Best streak: {streaks.longest_streak_days} days • Next badge at {streaks.next_milestone || 30} days
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {streaks.badges.filter((b) => b.unlocked).map((badge) => (
            <span
              key={badge.id}
              title={`${badge.name}: ${badge.description}`}
              className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-xs font-semibold text-amber-800 shadow-sm border border-amber-200"
            >
              <Sparkles className="h-3 w-3 text-amber-500" aria-hidden="true" />
              {badge.name}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function Notifications() {
  const { user } = useAuth()
  const { refreshCount } = useNotifications()
  const [filter, setFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [version, setVersion] = useState(0)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [actionError, setActionError] = useState(null)
  const [snoozeStatus, setSnoozeStatus] = useState({})

  useEffect(() => {
    let cancelled = false
    notificationService.list({ page, page_size: PAGE_SIZE, ...(filter === 'unread' && { unread_only: true }) })
      .then((r) => { if (!cancelled) { setData(r); setError(null); setLoading(false) } })
      .catch((e) => { if (!cancelled) { setError(getErrorMessage(e)); setLoading(false) } })
    return () => { cancelled = true }
  }, [page, filter, version])

  const reload = useCallback(() => { setLoading(true); setVersion((v) => v + 1) }, [])

  async function markRead(n) {
    setActionError(null)
    try {
      await notificationService.markRead(n.id)
      setData((d) => d && { ...d, unread: Math.max(0, d.unread - (n.is_read ? 0 : 1)), items: d.items.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)) })
      void refreshCount()
    } catch (e) { setActionError(getErrorMessage(e)) }
  }

  async function markAll() {
    setActionError(null)
    try {
      await notificationService.markAllRead()
      setVersion((v) => v + 1)
      void refreshCount()
    } catch (e) { setActionError(getErrorMessage(e)) }
  }

  async function handleSnooze(n, minutes = 10) {
    setActionError(null)
    try {
      if (notificationService.snooze) {
        await notificationService.snooze(n.id, minutes)
        setSnoozeStatus((prev) => ({ ...prev, [n.id]: `Snoozed for ${minutes}m` }))
        setTimeout(() => {
          setSnoozeStatus((prev) => {
            const next = { ...prev }
            delete next[n.id]
            return next
          })
        }, 4000)
      }
    } catch (e) {
      setActionError(getErrorMessage(e))
    }
  }

  const tab = (value, label) => (
    <button
      type="button"
      onClick={() => { setFilter(value); setPage(1) }}
      aria-pressed={filter === value}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium ${filter === value ? 'bg-teal-600 text-white' : 'border border-slate-300 text-slate-600 hover:bg-slate-50'}`}
    >
      {label}
    </button>
  )

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Notifications</h1>
          <p className="mt-1 text-sm text-slate-600" aria-live="polite">{data ? `${data.unread} unread` : ' '}</p>
        </div>
        <button
          type="button"
          onClick={markAll}
          disabled={!data || data.unread === 0}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
        >
          <CheckCheck className="h-4 w-4" aria-hidden="true" /> Mark all as read
        </button>
      </div>

      <div className="mt-4">
        <StreaksBanner />
      </div>

      <div className="mt-4 flex gap-2" role="group" aria-label="Filter notifications">
        {tab('all', 'All')}
        {tab('unread', 'Unread')}
      </div>
      {actionError ? <div className="mt-3"><Alert>{actionError}</Alert></div> : null}

      <div className="mt-4 space-y-2">
        {loading ? <div className="flex justify-center py-12"><Spinner label="Loading notifications" /></div> : null}
        {error ? (
          <div className="space-y-2">
            <Alert>{error}</Alert>
            <button type="button" onClick={reload} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50">
              Try again
            </button>
          </div>
        ) : null}
        {!loading && !error && data ? (
          data.items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white py-12 text-center">
              <Bell className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
              <p className="mt-2 font-medium text-slate-700">{filter === 'unread' ? "You're all caught up" : 'No notifications yet'}</p>
              <p className="mt-1 text-sm text-slate-500">{filter === 'unread' ? 'Nothing unread.' : 'Reminders and updates about your health activity will appear here.'}</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {data.items.map((n) => {
                const Icon = ICONS[n.notification_type] || Bell
                const route = notificationRoute(n)
                const isDoseReminder = n.notification_type === 'MEDICINE_REMINDER'
                const snoozeMessage = snoozeStatus[n.id]

                return (
                  <li key={n.id} className={`rounded-xl border p-4 ${n.is_read ? 'border-slate-200 bg-white' : 'border-teal-200 bg-teal-50/50'}`}>
                    <div className="flex gap-3">
                      <span className="mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-white text-teal-700 ring-1 ring-slate-200">
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="font-semibold text-slate-900">{n.title}</h2>
                          {!n.is_read ? <span className="rounded-full bg-teal-600 px-2 py-0.5 text-[11px] font-bold text-white">New</span> : null}
                          {n.snoozed_until && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                              <Clock className="h-3 w-3" /> Snoozed
                            </span>
                          )}
                          <span className="text-xs text-slate-500">{typeLabel(n.notification_type)} · {timeAgo(n.created_at)}</span>
                        </div>
                        {n.message ? <p className="mt-1 text-sm text-slate-600">{n.message}</p> : null}
                        
                        {snoozeMessage && (
                          <p className="mt-1 text-xs font-medium text-amber-700">{snoozeMessage}</p>
                        )}

                        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                          {route ? (
                            <Link to={route} onClick={() => !n.is_read && markRead(n)} className="font-semibold text-teal-700 hover:underline">
                              Open<span className="sr-only">: {n.title}</span>
                            </Link>
                          ) : null}

                          {isDoseReminder && (
                            <button
                              type="button"
                              onClick={() => handleSnooze(n, 10)}
                              className="inline-flex items-center gap-1 font-medium text-amber-700 hover:underline"
                            >
                              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                              Snooze 10m<span className="sr-only">: {n.title}</span>
                            </button>
                          )}

                          {!n.is_read ? (
                            <button type="button" onClick={() => markRead(n)} className="font-medium text-slate-600 hover:underline">
                              Mark as read<span className="sr-only">: {n.title}</span>
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )
        ) : null}
      </div>
      {data && !error ? <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onChange={setPage} /> : null}

      <div className="mt-8 space-y-4">
        <PreferencesPanel />
        <section className="rounded-xl border border-slate-200 bg-white p-4" aria-label="Desktop alerts">
          <DesktopAlerts userId={user?.id} />
        </section>
      </div>

      <p className="mt-4 text-xs text-slate-500">
        Notifications are created from your own records when you open HealthPredict (for example missed doses, finished assessments and weekly reports).
        They are informational and not medical advice.
      </p>
    </div>
  )
}
