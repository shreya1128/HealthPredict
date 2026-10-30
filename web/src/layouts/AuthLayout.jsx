import { Activity, BellRing, Heart, ShieldCheck } from 'lucide-react'
import { Link, Outlet } from 'react-router-dom'

const points = [
  { icon: Heart, text: 'Track your medicines and never miss a dose' },
  { icon: Activity, text: 'Understand your numbers in plain language' },
  { icon: BellRing, text: 'Daily reminders that fit your schedule' },
  { icon: ShieldCheck, text: 'Your health data stays private and secure' },
]

export default function AuthLayout() {
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left panel — shown only on desktop */}
      <aside className="hidden lg:flex flex-col justify-between bg-gradient-to-br from-teal-800 via-teal-700 to-teal-600 p-12 text-white">
        <Link
          to="/"
          className="flex items-center gap-2.5 text-xl font-display font-bold focus:outline-none focus:ring-2 focus:ring-white/80 rounded-lg"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20">
            <Activity className="h-5 w-5" aria-hidden="true" />
          </span>
          HealthPredict
        </Link>

        <div>
          <h2 className="text-3xl font-display font-bold leading-snug">
            Your medicines, numbers<br />and daily habits in one place.
          </h2>
          <p className="mt-4 text-teal-100 text-sm leading-relaxed max-w-sm">
            Designed to help you and your family stay on top of health — not to replace your doctor.
          </p>
          <ul className="mt-8 space-y-4">
            {points.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-teal-50">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/15">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="text-sm">{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-teal-200 max-w-sm leading-relaxed">
          For wellness and education only. Not a substitute for professional medical advice —
          always consult a qualified healthcare provider for medical decisions.
        </p>
      </aside>

      {/* Right panel — the form */}
      <main className="flex items-center justify-center bg-slate-50 p-6 sm:p-10 min-h-screen lg:min-h-0">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <Link to="/" className="flex lg:hidden items-center gap-2 font-display font-bold text-teal-800 mb-8">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-700 text-white">
              <Activity className="h-4 w-4" aria-hidden="true" />
            </span>
            HealthPredict
          </Link>
          <Outlet />
        </div>
      </main>
    </div>
  )
}
