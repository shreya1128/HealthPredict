import { Bell } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useNotifications } from '../../context/NotificationsContext'
import { capCount } from '../../utils/notificationFormat'

/** Header bell linking to the inbox, with an unread badge that is also announced to screen readers. */
export default function NotificationBell() {
  const { unread } = useNotifications()
  return (
    <NavLink to="/notifications" aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500">
      <Bell className="h-4 w-4" aria-hidden="true" />
      {unread > 0 ? (
        <span className="absolute -right-1.5 -top-1.5 min-w-[1.25rem] rounded-full bg-red-600 px-1 text-center text-[11px] font-bold leading-5 text-white" aria-hidden="true">{capCount(unread)}</span>
      ) : null}
    </NavLink>
  )
}
