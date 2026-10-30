import { NavLink, Outlet } from 'react-router-dom'

const tabs = [
  { to: '/admin', label: 'Overview', end: true },
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/model', label: 'AI model' },
  { to: '/admin/audit', label: 'Audit log' },
]
const tabClass = ({ isActive }) =>
  `rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-teal-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`

export default function AdminLayout() {
  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-slate-900">Administration</h1>
      <p className="mt-1 text-sm text-slate-600">System statistics are aggregates only. Individual health data is never shown here.</p>
      <nav className="mt-4 flex flex-wrap gap-1 border-b border-slate-200 pb-3" aria-label="Admin sections">
        {tabs.map((t) => <NavLink key={t.to} to={t.to} end={t.end} className={tabClass}>{t.label}</NavLink>)}
      </nav>
      <div className="mt-6"><Outlet /></div>
    </div>
  )
}
