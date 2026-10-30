import {
  Activity,
  AlertCircle,
  Check,
  ChevronRight,
  ClipboardList,
  Clock,
  Droplets,
  Moon,
  Pill,
  Plus,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
  X,
  Mic,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { dashboardService } from '../services/dashboardService'
import { medicineService } from '../services/medicineService'
import { trackingService } from '../services/trackingService'
import { Spinner } from '../components/common/Feedback'
import VoiceEntryModal from '../components/voice/VoiceEntryModal'

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
function greeting() {
  const h = new Date().getHours()
  if (h < 5) return 'Good night'
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function fmtTime(t) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`
}

/* ─── Progress ring ───────────────────────────────────────────────────────── */
function Ring({ pct = 0, color = '#0f766e', size = 64, label, value }) {
  const r = (size - 8) / 2
  const circ = 2 * Math.PI * r
  const dash = Math.max(0, Math.min(1, pct / 100)) * circ
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={6} />
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke={color} strokeWidth={6}
            strokeDasharray={`${dash} ${circ}`}
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 0.6s ease' }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-slate-800">
          {value}
        </span>
      </div>
      <span className="text-xs text-slate-500 text-center leading-tight max-w-16">{label}</span>
    </div>
  )
}

/* ─── Next dose card ──────────────────────────────────────────────────────── */
function NextDoseCard({ entry, onAction }) {
  const [busy, setBusy] = useState(null)

  async function act(action) {
    setBusy(action)
    try {
      if (action === 'taken') {
        await medicineService.markTaken(entry.medicine_id, entry.id)
      } else if (action === 'skipped') {
        await medicineService.markSkipped(entry.medicine_id, entry.id)
      }
      onAction()
    } catch {
      // silently handled — parent will refresh
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="rounded-2xl bg-gradient-to-br from-teal-600 to-teal-700 p-5 text-white shadow-md">
      <div className="flex items-center gap-1.5 text-teal-200 text-xs font-semibold uppercase tracking-wide mb-3">
        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
        Up next
      </div>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="font-display font-bold text-lg truncate">{entry.medicine_name}</p>
          <p className="text-teal-200 text-sm mt-0.5">
            {fmtTime(entry.scheduled_time)}
            {entry.dose_instructions && ` · ${entry.dose_instructions}`}
          </p>
        </div>
        {!entry.is_taken && !entry.is_skipped && (
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => act('taken')}
              disabled={busy != null}
              className="flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-sm font-bold text-teal-700 hover:bg-teal-50 disabled:opacity-60 transition"
              aria-label="Mark as taken"
            >
              {busy === 'taken' ? <Spinner label="Marking…" /> : <Check className="h-4 w-4" aria-hidden="true" />}
              Taken
            </button>
            <button
              onClick={() => act('skipped')}
              disabled={busy != null}
              className="flex items-center gap-1.5 rounded-xl bg-teal-500/40 px-3 py-2 text-sm font-medium text-white hover:bg-teal-500/60 disabled:opacity-60 transition"
              aria-label="Skip this dose"
            >
              <X className="h-4 w-4" aria-hidden="true" />
              Skip
            </button>
          </div>
        )}
        {entry.is_taken && (
          <span className="rounded-xl bg-white/20 px-3 py-2 text-sm font-bold text-white">Taken ✓</span>
        )}
        {entry.is_skipped && (
          <span className="rounded-xl bg-white/20 px-3 py-2 text-sm font-bold text-white">Skipped</span>
        )}
      </div>
    </div>
  )
}

/* ─── Quick log bottom sheet (simplified for web — full sheet on mobile) ── */
function QuickLogSheet({ onClose, onDone }) {
  const [saving, setSaving] = useState(false)

  async function addWater(ml) {
    setSaving(true)
    try {
      await trackingService.addHydration({ amount_ml: ml, beverage_type: 'water' })
      onDone()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-3xl sm:rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display font-bold text-slate-900">Quick log</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-slate-100">
            <X className="h-5 w-5 text-slate-500" aria-hidden="true" />
          </button>
        </div>

        {/* Water quick-add */}
        <div className="mb-5">
          <p className="text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
            <Droplets className="h-4 w-4 text-blue-500" aria-hidden="true" /> Water
          </p>
          <div className="flex gap-2">
            {[100, 250, 500, 750].map((ml) => (
              <button
                key={ml}
                onClick={() => addWater(ml)}
                disabled={saving}
                className="flex-1 rounded-xl border border-slate-200 py-2 text-sm font-semibold text-slate-700 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition disabled:opacity-60"
              >
                +{ml}ml
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-3 text-sm text-slate-500 pt-3 border-t border-slate-100">
          <Link to="/track" onClick={onClose} className="flex items-center gap-1.5 text-teal-700 font-medium hover:underline">
            <Plus className="h-4 w-4" aria-hidden="true" /> Log more (sleep, exercise, nutrition…)
          </Link>
        </div>
      </div>
    </div>
  )
}

/* ─── Stat card ───────────────────────────────────────────────────────────── */
function StatCard({ icon: Icon, label, value, to, color = 'text-teal-600 bg-teal-50' }) {
  const inner = (
    <div className="flex items-center gap-3">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${color}`}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <p className="font-bold text-slate-800">{value}</p>
      </div>
    </div>
  )
  return to ? (
    <Link to={to} className="rounded-2xl border border-slate-100 bg-white p-4 hover:border-teal-200 hover:shadow-sm transition block">
      {inner}
    </Link>
  ) : (
    <div className="rounded-2xl border border-slate-100 bg-white p-4">{inner}</div>
  )
}

/* ─── Insight card ────────────────────────────────────────────────────────── */
function InsightCard({ insight }) {
  const color = insight.direction === 'UP'
    ? 'text-emerald-700 bg-emerald-50 border-emerald-100'
    : insight.direction === 'DOWN'
    ? 'text-amber-700 bg-amber-50 border-amber-100'
    : 'text-blue-700 bg-blue-50 border-blue-100'

  return (
    <div className={`rounded-2xl border p-4 ${color}`}>
      <div className="flex items-start gap-3">
        <Sparkles className="h-5 w-5 shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-sm leading-relaxed font-medium">{insight.message}</p>
      </div>
    </div>
  )
}

/* ─── Empty state ─────────────────────────────────────────────────────────── */
function EmptyCard({ icon: Icon, title, body, actionLabel, actionTo }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-slate-200 p-6 text-center">
      <Icon className="h-8 w-8 text-slate-300 mx-auto mb-3" aria-hidden="true" />
      <p className="font-semibold text-slate-700 mb-1">{title}</p>
      <p className="text-sm text-slate-500 mb-4">{body}</p>
      {actionTo && (
        <Link
          to={actionTo}
          className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 transition"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          {actionLabel}
        </Link>
      )}
    </div>
  )
}

/* ─── Health score badge ──────────────────────────────────────────────────── */
function HealthScoreBadge({ assessment }) {
  const risk = assessment?.risk_category
  const score = assessment?.health_score

  const colors = {
    LOW: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-100', ring: '#059669' },
    MODERATE: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-100', ring: '#d97706' },
    HIGH: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-100', ring: '#dc2626' },
  }
  const labels = { LOW: 'Looking good', MODERATE: 'Keep an eye on this', HIGH: 'Worth discussing with your doctor' }
  const c = colors[risk] || colors.LOW

  return (
    <Link
      to={assessment ? `/assessment/${assessment.id}` : '/assessment'}
      className={`flex items-center gap-4 rounded-2xl border p-4 hover:shadow-sm transition ${c.bg} ${c.border}`}
    >
      <Ring pct={Number(score)} color={c.ring} size={56} value={`${Math.round(score)}`} label="" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-500 mb-0.5">Your health score</p>
        <p className={`font-bold text-lg ${c.text}`}>{Math.round(score)}/100</p>
        <p className={`text-xs ${c.text}`}>{labels[risk]}</p>
      </div>
      <ChevronRight className="h-5 w-5 text-slate-400 shrink-0" aria-hidden="true" />
    </Link>
  )
}

/* ─── Main component ──────────────────────────────────────────────────────── */
export default function Dashboard() {
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [quickLogOpen, setQuickLogOpen] = useState(false)
  const [voiceModalOpen, setVoiceModalOpen] = useState(false)

  const load = useCallback(() => {
    setError(null)
    dashboardService
      .get()
      .then(setData)
      .catch((e) => {
        const detail = e?.response?.data?.detail
        if (!detail || typeof detail !== 'string' || detail.toLowerCase().includes('internal server error') || detail.toLowerCase().includes('error:') || detail.toLowerCase().includes('traceback') || detail.toLowerCase().includes('sql')) {
          setError('Something went wrong. Please try again.')
        } else {
          setError(detail)
        }
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(load, [load])

  const firstName = user?.full_name?.split(' ')[0] || 'there'

  /* Loading skeleton */
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 rounded-xl bg-slate-100 animate-pulse" />
        <div className="h-28 rounded-2xl bg-slate-100 animate-pulse" />
        <div className="h-24 rounded-2xl bg-slate-100 animate-pulse" />
        <div className="grid grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 rounded-2xl bg-slate-100 animate-pulse" />
          ))}
        </div>
        <p className="sr-only">Loading your today screen…</p>
      </div>
    )
  }

  /* Error state */
  if (error) {
    return (
      <div className="rounded-2xl border border-red-100 bg-red-50 p-6 text-center">
        <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-3" aria-hidden="true" />
        <p className="font-semibold text-red-700 mb-1">Couldn't load your today screen</p>
        <p className="text-sm text-red-600 mb-4">{error}</p>
        <button
          onClick={load}
          className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 transition"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Try again
        </button>
      </div>
    )
  }

  if (!data) return null

  /* Find the next upcoming / not-yet-acted-upon dose */
  const now = new Date()
  const pendingDoses = (data.today_medicines || []).filter(
    (e) => !e.is_taken && !e.is_skipped
  )
  const nextDose = pendingDoses.sort((a, b) =>
    (a.scheduled_time || '').localeCompare(b.scheduled_time || '')
  )[0]

  /* Hydration ring values */
  const hydrationMl = data.hydration_today?.total_ml || 0
  const hydrationGoalMl = 2500
  const hydrationPct = Math.min(100, Math.round((hydrationMl / hydrationGoalMl) * 100))

  /* Medicine adherence */
  const totalDoses = (data.today_medicines || []).length
  const takenDoses = (data.today_medicines || []).filter((e) => e.is_taken).length
  const medicinePct = totalDoses > 0 ? Math.round((takenDoses / totalDoses) * 100) : 0

  /* Sleep */
  const sleepH = data.sleep_this_week?.average_duration_hours
  const sleepPct = sleepH != null ? Math.min(100, Math.round((sleepH / 8) * 100)) : 0

  /* Top insight */
  const topInsight = (data.insights || [])[0]

  return (
    <div className="space-y-5">
      {/* Greeting & Today Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-100 text-teal-800">
            Today
          </span>
        </div>
        <h1 className="text-2xl font-display font-bold text-slate-900">
          {greeting()}, {firstName} 👋
        </h1>
        <p className="text-slate-500 text-sm mt-0.5">
          {now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* ── Up next card ──────────────────────────────────────────────── */}
      {nextDose ? (
        <NextDoseCard entry={nextDose} onAction={load} />
      ) : pendingDoses.length === 0 && totalDoses > 0 ? (
        <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-5 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100">
            <Check className="h-5 w-5 text-emerald-700" aria-hidden="true" />
          </div>
          <div>
            <p className="font-semibold text-emerald-800">All doses done for today!</p>
            <p className="text-sm text-emerald-600">Great job keeping up with your medicines.</p>
          </div>
        </div>
      ) : (
        <EmptyCard
          icon={Pill}
          title="No medicines added yet"
          body="Add your first medicine to start tracking doses and get reminders."
          actionLabel="Add medicine"
          actionTo="/medicines"
        />
      )}

      {/* ── Quick log row ─────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Quick log</p>
          <Link to="/track" className="text-xs text-teal-700 font-medium hover:underline">
            Full log
          </Link>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          <button
            onClick={() => setQuickLogOpen(true)}
            className="flex flex-col items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-medium text-blue-700 hover:bg-blue-50 hover:border-blue-300 transition min-w-fit shrink-0"
          >
            <Droplets className="h-5 w-5 text-blue-500" aria-hidden="true" />
            Water
          </button>
          <Link
            to="/track?tab=sleep"
            className="flex flex-col items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-medium text-purple-700 hover:bg-purple-50 hover:border-purple-300 transition min-w-fit shrink-0"
          >
            <Moon className="h-5 w-5 text-purple-500" aria-hidden="true" />
            Sleep
          </Link>
          <Link
            to="/track?tab=exercise"
            className="flex flex-col items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-medium text-teal-700 hover:bg-teal-50 hover:border-teal-300 transition min-w-fit shrink-0"
          >
            <Activity className="h-5 w-5 text-teal-500" aria-hidden="true" />
            Exercise
          </Link>
          <Link
            to="/assessment"
            className="flex flex-col items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-medium text-rose-700 hover:bg-rose-50 hover:border-rose-300 transition min-w-fit shrink-0"
          >
            <Activity className="h-5 w-5 text-rose-500" aria-hidden="true" />
            Vitals
          </Link>
          <button
            onClick={() => setVoiceModalOpen(true)}
            aria-label="Voice log"
            className="flex flex-col items-center gap-1.5 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-xs font-semibold text-teal-800 hover:bg-teal-100 hover:border-teal-300 transition min-w-fit shrink-0"
          >
            <Mic className="h-5 w-5 text-teal-600" aria-hidden="true" />
            Voice log
          </button>
        </div>
      </div>

      {/* ── Progress rings ────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-100 bg-white p-5">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">Today's progress</p>
        <div className="flex justify-around">
          <Ring pct={medicinePct} color="#0f766e" size={72}
            label="Medicines" value={totalDoses > 0 ? `${takenDoses}/${totalDoses}` : '—'} />
          <Ring pct={hydrationPct} color="#2563eb" size={72}
            label="Water" value={hydrationMl >= 1000 ? `${(hydrationMl / 1000).toFixed(1)}L` : `${hydrationMl}ml`} />
          <Ring pct={sleepPct} color="#7c3aed" size={72}
            label="Sleep (avg)" value={sleepH != null ? `${sleepH}h` : '—'} />
        </div>
      </div>

      {/* ── Health score ──────────────────────────────────────────────── */}
      {data.latest_assessment ? (
        <HealthScoreBadge assessment={data.latest_assessment} />
      ) : (
        <Link
          to="/assessment"
          className="flex items-center gap-4 rounded-2xl border-2 border-dashed border-slate-200 p-4 hover:border-teal-300 hover:bg-teal-50/50 transition group"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-100 group-hover:bg-teal-100">
            <ClipboardList className="h-6 w-6 text-slate-400 group-hover:text-teal-600" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-700">Check your health numbers</p>
            <p className="text-sm text-slate-500">Takes 2 minutes — blood pressure, heart rate and more</p>
          </div>
          <ChevronRight className="h-5 w-5 text-slate-400 shrink-0" aria-hidden="true" />
        </Link>
      )}

      {/* ── Insight ───────────────────────────────────────────────────── */}
      {topInsight && <InsightCard insight={topInsight} />}

      {/* ── Stats row ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard icon={Activity} label="Exercise this week"
          value={`${data.exercise_this_week?.total_minutes || 0} min`}
          to="/track" color="text-teal-600 bg-teal-50" />
        <StatCard icon={Target} label="Active goals"
          value={data.active_goals?.length || 0}
          to="/goals" color="text-purple-600 bg-purple-50" />
        <StatCard icon={TrendingUp} label="Adherence today"
          value={totalDoses > 0 ? `${medicinePct}%` : '—'}
          to="/medicines" color="text-blue-600 bg-blue-50" />
      </div>

      {/* ── All today's medicines ─────────────────────────────────────── */}
      {totalDoses > 0 && (
        <div className="rounded-2xl border border-slate-100 bg-white p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-semibold text-slate-900">Today's medicines</h2>
            <Link to="/medicines" className="text-xs text-teal-700 font-medium hover:underline">
              Manage
            </Link>
          </div>
          <ul className="space-y-2">
            {data.today_medicines.map((e) => (
              <li key={e.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5 text-sm">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Pill
                    className={`h-4 w-4 shrink-0 ${e.is_taken ? 'text-emerald-500' : e.is_skipped ? 'text-slate-300' : 'text-teal-600'}`}
                    aria-hidden="true"
                  />
                  <span className={`font-medium truncate ${e.is_skipped ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                    {e.medicine_name}
                  </span>
                  <span className="text-slate-400 text-xs shrink-0">{fmtTime(e.scheduled_time)}</span>
                </div>
                {e.is_taken ? (
                  <span className="text-emerald-600 font-semibold text-xs shrink-0">Taken ✓</span>
                ) : e.is_skipped ? (
                  <span className="text-slate-400 text-xs shrink-0">Skipped</span>
                ) : (
                  <span className="text-amber-600 font-medium text-xs shrink-0">Pending</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Quick log sheet */}
      {quickLogOpen && (
        <QuickLogSheet onClose={() => setQuickLogOpen(false)} onDone={load} />
      )}

      {/* Voice entry modal */}
      <VoiceEntryModal
        isOpen={voiceModalOpen}
        onClose={() => setVoiceModalOpen(false)}
        onSaved={load}
      />
    </div>
  )
}
