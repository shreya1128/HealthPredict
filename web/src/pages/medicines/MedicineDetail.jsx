import { ArrowLeft, Check, X as XIcon } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { medicineService } from '../../services/medicineService'
import { getErrorMessage } from '../../services/api'
import { Alert, Spinner } from '../../components/common/Feedback'

function AdherenceRing({ percent }) {
  const color = percent >= 80 ? '#059669' : percent >= 50 ? '#d97706' : '#dc2626'
  const r = 42, c = 2 * Math.PI * r
  return (
    <div className="relative h-28 w-28">
      <svg viewBox="0 0 100 100" className="-rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#e2e8f0" strokeWidth="10" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="10"
          strokeDasharray={c} strokeDashoffset={c * (1 - percent / 100)} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-xl font-bold text-slate-900">{percent}%</div>
    </div>
  )
}

export default function MedicineDetail() {
  const { id } = useParams()
  const [medicine, setMedicine] = useState(null)
  const [schedule, setSchedule] = useState([])
  const [adherence, setAdherence] = useState(null)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    const [m, sched, adh] = await Promise.all([
      medicineService.get(id), medicineService.schedule(id, 7, 14), medicineService.adherence(id, 30),
    ])
    setMedicine(m); setSchedule(sched); setAdherence(adh)
  }, [id])

  useEffect(() => { load().catch((err) => setError(getErrorMessage(err))) }, [load])

  async function act(scheduleId, action) {
    setBusyId(scheduleId)
    try {
      action === 'taken'
        ? await medicineService.markTaken(id, scheduleId)
        : await medicineService.markSkipped(id, scheduleId)
      await load()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  if (error) return <Alert>{error}</Alert>
  if (!medicine) return <div className="flex justify-center py-20"><Spinner label="Loading" /></div>

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="mx-auto max-w-2xl">
      <Link to="/medicines" className="inline-flex items-center gap-1 text-sm font-medium text-teal-700 hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to medicines
      </Link>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-display font-bold text-slate-900">{medicine.medicine_name}</h1>
            <p className="text-sm text-slate-500">
              {medicine.dosage ? `${medicine.dosage}${medicine.dosage_unit || ''} · ` : ''}
              {medicine.frequency_unit === 'AS_NEEDED'
                ? 'As needed'
                : medicine.frequency_unit === 'WEEKLY' && medicine.weekdays?.length
                ? `Weekly on ${medicine.weekdays.map((w) => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][w]).join(', ')} at ${medicine.time_of_day.join(', ')}`
                : medicine.frequency_unit === 'MONTHLY' && medicine.month_day
                ? `Monthly on day ${medicine.month_day} at ${medicine.time_of_day.join(', ')}`
                : `${medicine.frequency_unit.toLowerCase()} at ${medicine.time_of_day.join(', ')}`}
            </p>
            {medicine.instructions && <p className="mt-1 text-sm text-slate-600">{medicine.instructions}</p>}
          </div>
          {adherence && (
            <div className="text-center">
              <AdherenceRing percent={adherence.adherence_percent} />
              <p className="mt-1 text-xs text-slate-500">last {adherence.days} days</p>
            </div>
          )}
        </div>
      </div>

      <h2 className="mt-6 text-sm font-semibold text-slate-700">Schedule</h2>
      <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {schedule.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">No scheduled doses in this window.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <tbody className="divide-y divide-slate-100">
              {schedule.map((s) => (
                <tr key={s.id} className={s.scheduled_date === today ? 'bg-teal-50/50' : ''}>
                  <td className="px-4 py-3 text-slate-700">
                    {new Date(s.scheduled_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    {s.scheduled_time && ` · ${s.scheduled_time.slice(0, 5)}`}
                  </td>
                  <td className="px-4 py-3">
                    {s.is_taken ? (
                      <span className="text-emerald-600 font-medium">
                        Taken {s.dosage_at_intake ? `(${s.dosage_at_intake}${s.dosage_unit_at_intake || ''})` : ''}
                      </span>
                    ) : s.is_skipped ? (
                      <span className="text-amber-600 font-medium">Skipped</span>
                    ) : s.scheduled_date < today ? (
                      <span className="text-red-500 font-medium">Missed</span>
                    ) : (
                      <span className="text-slate-400">Pending</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!s.is_taken && !s.is_skipped && (
                      <div className="inline-flex gap-1">
                        <button onClick={() => act(s.id, 'taken')} disabled={busyId === s.id}
                          className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50 disabled:opacity-50" title="Mark taken">
                          <Check className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button onClick={() => act(s.id, 'skipped')} disabled={busyId === s.id}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-50" title="Mark skipped">
                          <XIcon className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
