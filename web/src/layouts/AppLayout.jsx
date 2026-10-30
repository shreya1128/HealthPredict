import {
  Activity,
  Bean,
  Calendar,
  ChevronDown,
  ClipboardList,
  Droplets,
  FileText,
  Heart,
  HeartPulse,
  LayoutDashboard,
  LogOut,
  Pill,
  Shield,
  ShieldCheck,
  Stethoscope,
  Target,
  User as UserIcon,
} from 'lucide-react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { NotificationsProvider } from '../context/NotificationsContext'
import NotificationBell from '../components/notifications/NotificationBell'
import { useState } from 'react'
import ProfileSwitcher from '../components/common/ProfileSwitcher'
import { useProfile } from '../context/ProfileContext'

/* Navigation items — plain language, no technical terms */
const navSections = [
  {
    title: 'Daily Care',
    items: [
      { to: '/dashboard', label: 'Today', icon: LayoutDashboard, mobileLabel: 'Today' },
      { to: '/medicines', label: 'Medicines', icon: Pill, mobileLabel: 'Medicines' },
      { to: '/track', label: 'Daily log', icon: Heart, mobileLabel: 'Log' },
      { to: '/symptoms', label: 'Symptoms', icon: Stethoscope, mobileLabel: 'Symptoms' },
    ],
  },
  {
    title: 'Health Management',
    items: [
      { to: '/appointments', label: 'Appointments', icon: Calendar, mobileLabel: 'Visits' },
      { to: '/emergency-card', label: 'Emergency ID', icon: Shield, mobileLabel: 'Emergency' },
      { to: '/goals', label: 'Goals', icon: Target, mobileLabel: 'Goals' },
      { to: '/timeline', label: 'Health Timeline', icon: Activity, mobileLabel: 'Timeline' },
      { to: '/history', label: 'Trends', icon: Activity, mobileLabel: 'Trends' },
    ],
  },
  {
    title: 'Screenings',
    items: [
      { to: '/diabetes', label: 'Diabetes risk', icon: Droplets, mobileLabel: 'Diabetes' },
      { to: '/menstrual', label: 'Cycle tracking', icon: HeartPulse, mobileLabel: 'Cycle' },
      { to: '/fatty-liver', label: 'Liver awareness', icon: Bean, mobileLabel: 'Liver' },
    ],
  },
  {
    title: 'Insights & Reports',
    items: [
      { to: '/assessment', label: 'Health check', icon: ClipboardList, mobileLabel: 'Check' },
      { to: '/reports', label: 'Doctor summary', icon: FileText, mobileLabel: 'Summary' },
      { to: '/profile', label: 'Me', icon: UserIcon, mobileLabel: 'Me' },
    ],
  },
]

const memberLinks = navSections.flatMap((s) => s.items)

const adminLink = { to: '/admin', label: 'Admin', icon: ShieldCheck, mobileLabel: 'Admin' }

/* Mobile bottom tabs — show max 5 most important items */
const mobileTabLinks = [
  memberLinks[0], // Today (/dashboard)
  memberLinks[1], // Medicines (/medicines)
  memberLinks[2], // Daily log (/track)
  memberLinks[8], // Trends (/history)
  memberLinks[14], // Me (/profile)
]

const sidebarClass = ({ isActive }) =>
  `flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-150 ${
    isActive
      ? 'bg-teal-50 text-teal-700 shadow-sm font-semibold'
      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
  }`

const tabClass = ({ isActive }) =>
  `flex flex-col items-center justify-center min-h-[48px] gap-0.5 px-2 py-2 text-xs font-medium transition-colors min-w-0 flex-1 ${
    isActive ? 'text-teal-700 font-semibold' : 'text-slate-500'
  }`

export default function AppLayout() {
  const { user, logout, isAdmin } = useAuth()
  const { activeProfile } = useProfile()
  const navigate = useNavigate()
  const [moreOpen, setMoreOpen] = useState(false)
  const links = isAdmin ? [...memberLinks, adminLink] : memberLinks

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  const firstName = user?.full_name?.split(' ')[0] || 'there'
  const initials = user?.full_name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?'

  return (
    <NotificationsProvider>
      <div className="min-h-screen bg-slate-50 flex">
        {/* ================================================================
            DESKTOP SIDEBAR — hidden on mobile
        ================================================================ */}
        <aside className="hidden lg:flex flex-col w-60 xl:w-64 shrink-0 bg-white border-r border-slate-200 sticky top-0 h-screen overflow-y-auto">
          {/* Logo */}
          <div className="p-5 pb-3">
            <NavLink to="/dashboard" className="flex items-center gap-2.5 font-display font-bold text-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-500 rounded-lg">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-700 text-white shrink-0">
                <Activity className="h-4 w-4" aria-hidden="true" />
              </span>
              HealthPredict
            </NavLink>
          </div>

          {/* Nav links grouped with section titles */}
          <nav className="flex-1 px-3 py-2 space-y-4" aria-label="Main navigation">
            {navSections.map((sec) => (
              <div key={sec.title} className="space-y-1">
                <p className="px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {sec.title}
                </p>
                {sec.items.map(({ to, label, icon: Icon }) => (
                  <NavLink key={to} to={to} className={sidebarClass} end={to === '/dashboard'}>
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{label}</span>
                  </NavLink>
                ))}
              </div>
            ))}
            {isAdmin && (
              <div className="space-y-1 pt-2 border-t border-slate-100">
                <p className="px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Administration
                </p>
                <NavLink to={adminLink.to} className={sidebarClass}>
                  <adminLink.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{adminLink.label}</span>
                </NavLink>
              </div>
            )}
          </nav>

          {/* User + logout */}
          <div className="p-3 border-t border-slate-100">
            <div className="flex items-center gap-3 rounded-xl p-2 bg-slate-50">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-700 text-white text-xs font-bold">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{firstName}</p>
                <p className="text-xs text-slate-500 truncate">{user?.email}</p>
              </div>
              <div className="flex items-center gap-1">
                <NotificationBell />
                <button
                  onClick={handleLogout}
                  title="Sign out"
                  className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500 transition"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only">Sign out</span>
                </button>
              </div>
            </div>
          </div>
        </aside>

        {/* ================================================================
            MAIN CONTENT
        ================================================================ */}
        <div className="flex-1 flex flex-col min-h-screen min-w-0">
          {/* Top bar (Desktop & Mobile) */}
          <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-200">
            <div className="flex items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
              <div className="flex items-center gap-3">
                <NavLink to="/dashboard" className="lg:hidden flex items-center gap-2 font-display font-bold text-teal-800">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-700 text-white">
                    <Activity className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  HealthPredict
                </NavLink>
                <div className="hidden lg:flex items-center gap-2 text-sm text-slate-500 font-medium">
                  Viewing health records for:
                </div>
                <ProfileSwitcher />
              </div>
              <div className="flex items-center gap-2">
                <NotificationBell />
                <div className="lg:hidden flex h-8 w-8 items-center justify-center rounded-full bg-teal-700 text-white text-xs font-bold">
                  {initials}
                </div>
              </div>
            </div>
            {/* Pediatric or Caregiver Notice Banner */}
            {activeProfile?.is_child && (
              <div className="bg-amber-50 border-t border-b border-amber-200 px-4 py-2 text-xs text-amber-800 flex items-center justify-between">
                <span>
                  <strong>Pediatric Notice:</strong> {activeProfile.clinical_notice || 'Standard adult vitals ranges may not apply to children.'}
                </span>
              </div>
            )}
            {activeProfile?.access_level === 'VIEW_ONLY' && (
              <div className="bg-blue-50 border-t border-b border-blue-200 px-4 py-1.5 text-xs text-blue-800 flex items-center justify-between">
                <span>
                  <strong>View-Only Caregiver:</strong> You are viewing records for {activeProfile.full_name}. Editing is disabled.
                </span>
              </div>
            )}
          </header>

          {/* Page content */}
          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8 pb-24 lg:pb-8">
            <div className="mx-auto max-w-5xl">
              <Outlet />
            </div>
          </main>
        </div>

        {/* ================================================================
            MOBILE BOTTOM TAB BAR
        ================================================================ */}
        <nav
          className="lg:hidden fixed bottom-0 inset-x-0 z-20 bg-white border-t border-slate-200 flex safe-area-inset-bottom"
          aria-label="Main navigation"
        >
          {mobileTabLinks.map(({ to, mobileLabel, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/dashboard'}
              className={tabClass}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              <span className="truncate max-w-full">{mobileLabel}</span>
            </NavLink>
          ))}
          {/* More menu for extra links */}
          <div className="flex flex-col items-center justify-center min-h-[48px] gap-0.5 px-2 py-2 text-xs font-medium flex-1 relative">
            <button
              onClick={() => setMoreOpen((o) => !o)}
              aria-label="More navigation options"
              aria-expanded={moreOpen}
              className={`flex flex-col items-center justify-center gap-0.5 transition-colors w-full h-full ${moreOpen ? 'text-teal-700' : 'text-slate-500'}`}
            >
              <ChevronDown className={`h-5 w-5 transition-transform ${moreOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
              <span>More</span>
            </button>
            {moreOpen && (
              <div className="absolute bottom-full mb-2 right-0 bg-white rounded-xl border border-slate-200 shadow-xl p-2 min-w-44">
                {links
                  .filter((l) => !mobileTabLinks.includes(l))
                  .map(({ to, label, icon: Icon }) => (
                    <NavLink
                      key={to}
                      to={to}
                      onClick={() => setMoreOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${
                          isActive ? 'bg-teal-50 text-teal-700' : 'text-slate-700 hover:bg-slate-50'
                        }`
                      }
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                      {label}
                    </NavLink>
                  ))}
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 mt-1 border-t border-slate-100 pt-2"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </nav>
      </div>
    </NotificationsProvider>
  )
}
