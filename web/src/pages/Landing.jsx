import {
  Activity,
  ArrowRight,
  Bell,
  Check,
  ChevronDown,
  Droplets,
  FileText,
  Heart,
  Lock,
  Moon,
  Pill,
  Shield,
  Smartphone,
  Star,
  TrendingUp,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useState } from 'react'

/* ─── Data ─────────────────────────────────────────────────────────────────── */

const benefits = [
  {
    icon: Pill,
    title: 'Never miss a medicine',
    body: 'Set it once. Get reminded at the right time, every day. Track what you took and when — so you always know.',
  },
  {
    icon: Heart,
    title: 'Understand your readings',
    body: 'Blood pressure, blood sugar, heart rate. We explain what your numbers mean in plain language, not medical jargon.',
  },
  {
    icon: FileText,
    title: 'Walk into your appointment prepared',
    body: 'One tap generates a summary of your last 90 days — medicines, trends, questions — ready to hand to your doctor.',
  },
]

const steps = [
  {
    number: '1',
    title: 'Add your medicines',
    body: 'Type the name, pick the times. Done in under a minute.',
    color: 'bg-teal-600',
  },
  {
    number: '2',
    title: 'Log daily',
    body: 'Mark doses taken. Add your BP, sleep or water in one tap.',
    color: 'bg-blue-600',
  },
  {
    number: '3',
    title: 'See your patterns',
    body: 'Charts and insights built from your real data. No guessing.',
    color: 'bg-purple-600',
  },
]

const faqs = [
  {
    q: 'Is this a medical app?',
    a: 'No. HealthPredict is a personal wellness tracker. It helps you record and understand your own health data. It does not diagnose, prescribe or treat. Always consult a qualified healthcare provider for medical decisions.',
  },
  {
    q: 'Is my data private?',
    a: 'Yes. Your health data is stored securely and never sold or shared with advertisers. You can export or delete everything at any time.',
  },
  {
    q: "Can I use it for a family member?",
    a: 'Yes. You can manage medicines and logs for a parent, child or spouse — all in one account with separate profiles.',
  },
  {
    q: "How accurate is the heart-risk estimate?",
    a: 'It is a rough estimate based on general population data (not a clinical tool). We show it alongside a clear disclaimer. A score is only as good as the data you enter, and it is never a substitute for a doctor\'s assessment.',
  },
]

/* ─── Sub-components ────────────────────────────────────────────────────────── */

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-slate-200 last:border-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between py-5 text-left font-medium text-slate-800 hover:text-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-inset rounded"
        aria-expanded={open}
      >
        <span>{q}</span>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>
      {open && <p className="pb-5 text-sm text-slate-600 leading-relaxed">{a}</p>}
    </div>
  )
}

function StatPill({ icon: Icon, label, color }) {
  return (
    <div className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white ${color}`}>
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
    </div>
  )
}

/* ─── App preview mockup (pure CSS, no screenshots needed) ──────────────────── */
function AppMockup() {
  return (
    <div className="relative mx-auto w-72 select-none">
      {/* Phone shell */}
      <div className="relative rounded-[2.5rem] bg-slate-900 p-3 shadow-2xl ring-1 ring-white/10">
        {/* Notch */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-24 h-5 bg-slate-900 rounded-b-xl z-10" />
        {/* Screen */}
        <div className="rounded-[2rem] bg-slate-50 overflow-hidden" style={{ minHeight: 520 }}>
          {/* Status bar */}
          <div className="bg-teal-700 px-5 pt-8 pb-5 text-white">
            <div className="flex items-center justify-between text-xs text-teal-200 mb-3">
              <span>9:41</span>
              <div className="flex gap-1">
                <span>●●●●</span>
                <span>WiFi</span>
                <span>🔋</span>
              </div>
            </div>
            <p className="text-teal-200 text-sm">Good morning,</p>
            <p className="text-xl font-bold">Sarah 👋</p>
          </div>
          {/* Content */}
          <div className="p-4 space-y-3">
            {/* Next dose card */}
            <div className="bg-white rounded-2xl p-3 border border-slate-100 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <Pill className="h-4 w-4 text-teal-600" aria-hidden="true" />
                <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Up next</span>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-800 text-sm">Metformin 500mg</p>
                  <p className="text-xs text-slate-500">in 15 minutes · with food</p>
                </div>
                <button className="rounded-xl bg-teal-600 px-3 py-1.5 text-xs font-bold text-white">
                  Taken ✓
                </button>
              </div>
            </div>
            {/* Progress rings */}
            <div className="bg-white rounded-2xl p-3 border border-slate-100 shadow-sm">
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-3">Today's progress</p>
              <div className="flex justify-around">
                {[
                  { label: 'Medicines', pct: 75, color: '#0f766e' },
                  { label: 'Water', pct: 60, color: '#2563eb' },
                  { label: 'Sleep', pct: 85, color: '#7c3aed' },
                ].map(({ label, pct, color }) => (
                  <div key={label} className="flex flex-col items-center gap-1">
                    <svg className="w-12 h-12 -rotate-90" viewBox="0 0 36 36" aria-hidden="true">
                      <circle cx="18" cy="18" r="14" fill="none" stroke="#e2e8f0" strokeWidth="3" />
                      <circle
                        cx="18" cy="18" r="14" fill="none"
                        stroke={color} strokeWidth="3" strokeDasharray={`${pct * 0.88} 88`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className="text-[10px] text-slate-500">{label}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* Quick log */}
            <div className="bg-white rounded-2xl p-3 border border-slate-100 shadow-sm">
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Quick log</p>
              <div className="flex gap-2 flex-wrap">
                {[
                  { icon: Droplets, label: '+250ml', color: 'text-blue-600 bg-blue-50' },
                  { icon: Moon, label: 'Sleep', color: 'text-purple-600 bg-purple-50' },
                  { icon: Activity, label: 'BP', color: 'text-red-600 bg-red-50' },
                ].map(({ icon: Icon, label, color }) => (
                  <button key={label} className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-medium ${color}`}>
                    <Icon className="h-3 w-3" aria-hidden="true" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Decorative glow */}
      <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-48 h-12 bg-teal-400/30 blur-2xl rounded-full" />
    </div>
  )
}

/* ─── Main component ────────────────────────────────────────────────────────── */
export default function Landing() {
  const { isAuthenticated } = useAuth()

  return (
    <div className="min-h-screen bg-white text-slate-800 antialiased">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-2 font-display text-lg font-bold tracking-tight text-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-500 rounded">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-700 text-white">
              <Activity className="h-4 w-4" aria-hidden="true" />
            </span>
            HealthPredict
          </Link>

          <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex" aria-label="Landing navigation">
            <a href="#how-it-works" className="transition hover:text-teal-800">How it works</a>
            <a href="#faq" className="transition hover:text-teal-800">FAQ</a>
          </nav>

          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2"
              >
                Go to app <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="text-sm font-medium text-slate-600 hover:text-teal-800 transition hidden sm:block"
                >
                  Sign in
                </Link>
                <Link
                  to="/register"
                  className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2"
                >
                  Get started free
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-teal-50 via-white to-blue-50 py-16 sm:py-24 lg:py-28">
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
          <div className="absolute -top-20 -right-20 h-80 w-80 rounded-full bg-teal-100/60 blur-3xl" />
          <div className="absolute -bottom-20 -left-20 h-80 w-80 rounded-full bg-blue-100/60 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left — copy */}
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-teal-100 px-3 py-1 text-xs font-semibold text-teal-800 mb-5">
                <Star className="h-3.5 w-3.5" aria-hidden="true" />
                Free to use · No subscription required
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-5xl font-display font-bold leading-tight text-slate-900">
                Your medicines, numbers{' '}
                <span className="text-teal-700">and daily habits</span>{' '}
                in one place.
              </h1>

              <p className="mt-5 text-lg text-slate-600 leading-relaxed max-w-lg">
                HealthPredict helps you manage medicines, track your vitals, and
                understand your health trends — so you're always prepared for
                your next doctor visit.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  to="/register"
                  className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-6 py-3 font-semibold text-white shadow-md transition hover:bg-teal-800 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2"
                >
                  Start for free <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link
                  to="/login"
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-6 py-3 font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
                >
                  Try demo account
                </Link>
              </div>

              {/* Trust signals */}
              <div className="mt-8 flex flex-wrap gap-4">
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Shield className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  No adverts, no data selling
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Lock className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  Protected accounts and private records
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Smartphone className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  Works on phone and desktop
                </div>
              </div>
            </div>

            {/* Right — app mockup */}
            <div className="flex justify-center lg:justify-end">
              <AppMockup />
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats bar ───────────────────────────────────────────────────── */}
      <section className="border-y border-slate-100 bg-white py-6">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap justify-center gap-3 sm:gap-4">
            <StatPill icon={Pill} label="Medicine reminders" color="bg-teal-600" />
            <StatPill icon={Activity} label="Vitals tracking" color="bg-blue-600" />
            <StatPill icon={TrendingUp} label="Health trends" color="bg-purple-600" />
            <StatPill icon={FileText} label="Doctor summaries" color="bg-amber-600" />
            <StatPill icon={Bell} label="Dose alerts" color="bg-rose-600" />
          </div>
        </div>
      </section>

      {/* ── Benefits ────────────────────────────────────────────────────── */}
      <section className="py-16 sm:py-20 bg-white" aria-labelledby="benefits-heading">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 id="benefits-heading" className="text-3xl font-display font-bold text-slate-900">
              Everything you need to manage your daily health
            </h2>
            <p className="mt-3 text-slate-600 max-w-xl mx-auto">
              Built around how real people actually take medicines and track numbers — without medical jargon.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {benefits.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm hover:shadow-md hover:border-teal-200 transition-all duration-200"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50 mb-4">
                  <Icon className="h-6 w-6 text-teal-700" aria-hidden="true" />
                </div>
                <h3 className="font-display font-semibold text-slate-900 text-lg mb-2">{title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── What HealthPredict is not ────────────────────────────────────── */}
      <section className="py-12 bg-slate-50 border-y border-slate-200/80" aria-labelledby="not-heading">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <h2 id="not-heading" className="text-2xl font-display font-bold text-slate-900">
              Clear expectations: What HealthPredict is not
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              We believe in honest technology. Here is what you should and shouldn't expect.
            </p>
          </div>
          <div className="grid sm:grid-cols-3 gap-4 text-left">
            <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
              <p className="font-semibold text-slate-900 text-sm mb-1">Not a medical device</p>
              <p className="text-xs text-slate-600 leading-relaxed">
                HealthPredict does not diagnose illnesses, prescribe medication, or give clinical instructions.
              </p>
            </div>
            <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
              <p className="font-semibold text-slate-900 text-sm mb-1">Not an emergency service</p>
              <p className="text-xs text-slate-600 leading-relaxed">
                If you experience chest pain, difficulty breathing, or severe symptoms, call emergency services immediately.
              </p>
            </div>
            <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
              <p className="font-semibold text-slate-900 text-sm mb-1">Not a replacement for doctors</p>
              <p className="text-xs text-slate-600 leading-relaxed">
                Calculations and trends are for your personal reference to prepare questions for your healthcare team.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ────────────────────────────────────────────────── */}
      <section id="how-it-works" className="py-16 sm:py-20 bg-white" aria-labelledby="how-heading">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 id="how-heading" className="text-3xl font-display font-bold text-slate-900">
              Up and running in 3 minutes
            </h2>
          </div>

          <div className="grid sm:grid-cols-3 gap-6 lg:gap-8">
            {steps.map(({ number, title, body, color }) => (
              <div key={number} className="relative">
                <div className="flex items-start gap-4">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${color} text-white font-bold text-lg`}>
                    {number}
                  </div>
                  <div>
                    <h3 className="font-display font-semibold text-slate-900 mb-1">{title}</h3>
                    <p className="text-sm text-slate-600">{body}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-12 text-center">
            <Link
              to="/register"
              className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-8 py-3.5 font-semibold text-white shadow-md transition hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2"
            >
              Create free account <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Privacy / Trust ─────────────────────────────────────────────── */}
      <section className="py-16 sm:py-20 bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl bg-gradient-to-br from-teal-700 to-teal-800 p-8 sm:p-12 text-white">
            <div className="grid sm:grid-cols-2 gap-8 items-center">
              <div>
                <h2 className="text-2xl font-display font-bold mb-3">Your health privacy matters.</h2>
                <p className="text-teal-100 leading-relaxed">
                  We don't sell your data, show you ads, or share your information with advertisers.
                  Your account is protected by strict authentication and access controls.
                </p>
              </div>
              <div className="space-y-3">
                {[
                  'No adverts, no data selling',
                  'Download weekly doctor reports as PDF',
                  'Emergency card for quick responder view',
                  'Encrypted passwords and authenticated sessions',
                ].map((item) => (
                  <div key={item} className="flex items-center gap-3">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/20">
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    </div>
                    <span className="text-sm text-teal-100">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────────────────── */}
      <section id="faq" className="py-16 sm:py-20 bg-slate-50" aria-labelledby="faq-heading">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 id="faq-heading" className="text-3xl font-display font-bold text-slate-900">
              Common questions
            </h2>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm divide-y divide-slate-100 px-6">
            {faqs.map((faq) => (
              <FaqItem key={faq.q} q={faq.q} a={faq.a} />
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────────────── */}
      <section className="py-16 sm:py-20 bg-white text-center">
        <div className="mx-auto max-w-xl px-4">
          <h2 className="text-3xl font-display font-bold text-slate-900 mb-4">
            Ready to take control of your health?
          </h2>
          <p className="text-slate-600 mb-8">
            Free to use. No credit card. Just sign up and start.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              to="/register"
              className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-8 py-3.5 font-semibold text-white shadow-md transition hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2"
            >
              Get started free <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-8 py-3.5 font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 font-display font-bold text-teal-800 mb-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-700 text-white">
                  <Activity className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                HealthPredict
              </div>
              <p className="text-xs text-slate-500 max-w-sm leading-relaxed">
                <strong>Medical disclaimer:</strong> HealthPredict is for personal wellness tracking only.
                It is not a medical device and does not diagnose, treat or prevent any condition.
                Always consult a qualified healthcare professional for medical decisions.
              </p>
            </div>
            <div className="flex gap-5 text-sm text-slate-500">
              <Link to="/login" className="hover:text-teal-700 transition">Sign in</Link>
              <Link to="/register" className="hover:text-teal-700 transition">Register</Link>
            </div>
          </div>
          <p className="mt-6 text-xs text-slate-400">
            © {new Date().getFullYear()} HealthPredict. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}
