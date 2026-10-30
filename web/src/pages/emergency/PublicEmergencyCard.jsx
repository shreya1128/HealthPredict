import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Heart,
  Phone,
  Pill,
  ShieldAlert,
} from 'lucide-react'
import { emergencyService } from '../../services/emergencyService'

export default function PublicEmergencyCard() {
  const { token } = useParams()
  const [card, setCard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function fetchCard() {
      setLoading(true)
      setError(null)
      try {
        const data = await emergencyService.getPublicCard(token)
        setCard(data)
      } catch (err) {
        setError('This emergency card is private or the link is invalid.')
      } finally {
        setLoading(false)
      }
    }
    if (token) fetchCard()
  }, [token])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="h-10 w-10 border-4 border-red-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-slate-300">Loading emergency details...</p>
        </div>
      </div>
    )
  }

  if (error || !card) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center space-y-4">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto" />
          <h2 className="text-xl font-bold">Emergency Card Unavailable</h2>
          <p className="text-sm text-slate-400">
            {error || 'This card cannot be displayed.'}
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-slate-800 hover:bg-slate-700 text-white transition"
          >
            <ArrowLeft className="h-4 w-4" />
            Go to HealthPredict
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-6 px-4 sm:px-6">
      <div className="max-w-xl mx-auto space-y-5">
        {/* Top Emergency Banner */}
        <div className="bg-red-600 rounded-2xl p-4 text-white flex items-center justify-between shadow-lg shadow-red-950/50">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <ShieldAlert className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">EMERGENCY MEDICAL ID</h1>
              <p className="text-xs text-red-100">Self-reported by patient for first responders</p>
            </div>
          </div>
          {card.blood_type && card.blood_type !== 'Unknown' && (
            <div className="text-right">
              <span className="text-[10px] uppercase font-bold tracking-widest text-red-200 block">BLOOD</span>
              <span className="text-2xl font-black">{card.blood_type}</span>
            </div>
          )}
        </div>

        {/* Emergency Contact Click-to-Call */}
        {card.emergency_contact_phone && (
          <div className="bg-slate-900 border-2 border-emerald-500/70 rounded-2xl p-4 shadow-md">
            <p className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-1">
              Primary Emergency Contact
            </p>
            <div className="flex items-center justify-between gap-3 mt-2">
              <div>
                <h3 className="font-bold text-lg text-white">
                  {card.emergency_contact_name || 'Emergency Contact'}
                </h3>
                {card.emergency_contact_relationship && (
                  <p className="text-xs text-slate-400">
                    Relationship: {card.emergency_contact_relationship}
                  </p>
                )}
              </div>
              <a
                href={`tel:${card.emergency_contact_phone}`}
                className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-bold text-sm text-white shadow-md shadow-emerald-950/50 transition shrink-0"
              >
                <Phone className="h-4 w-4" />
                Call Now
              </a>
            </div>
          </div>
        )}

        {/* Allergies Warning */}
        {card.allergies && card.allergies.length > 0 && (
          <div className="bg-slate-900 border border-red-500/40 rounded-2xl p-4 space-y-2">
            <h3 className="text-xs font-bold text-red-400 uppercase tracking-wider flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4" />
              Known Allergies (High Priority)
            </h3>
            <div className="flex flex-wrap gap-2 pt-1">
              {card.allergies.map((item, idx) => (
                <span
                  key={idx}
                  className="px-3 py-1.5 rounded-xl bg-red-950/80 border border-red-600 text-red-200 text-xs font-bold"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Medical Conditions */}
        {card.chronic_conditions && card.chronic_conditions.length > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Chronic Conditions
            </h3>
            <div className="flex flex-wrap gap-2 pt-1">
              {card.chronic_conditions.map((item, idx) => (
                <span
                  key={idx}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Current Medications */}
        {card.current_medications && card.current_medications.length > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
            <h3 className="text-xs font-bold text-teal-400 uppercase tracking-wider flex items-center gap-1.5">
              <Pill className="h-4 w-4" />
              Current Medications
            </h3>
            <ul className="space-y-1.5 pt-1 text-xs text-slate-300">
              {card.current_medications.map((item, idx) => (
                <li key={idx} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-teal-400 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Organ donor badge */}
        {card.organ_donor && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-red-950/60 flex items-center justify-center shrink-0">
              <Heart className="h-5 w-5 text-red-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">Registered Organ Donor</p>
              <p className="text-xs text-slate-400">Patient has indicated donor preference</p>
            </div>
          </div>
        )}

        {/* Medical notes */}
        {card.medical_notes && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1.5">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Special Notes / Implants
            </h3>
            <p className="text-xs text-slate-200 leading-relaxed bg-slate-950/50 p-3 rounded-xl border border-slate-800">
              {card.medical_notes}
            </p>
          </div>
        )}

        {/* Disclaimer footer */}
        <div className="text-center pt-4 pb-8 space-y-2">
          <p className="text-[11px] text-slate-500 leading-relaxed max-w-sm mx-auto">
            This card contains patient-reported health details intended for emergency situations. HealthPredict does not verify clinical accuracy.
          </p>
          <div className="flex items-center justify-center gap-1 text-[11px] text-teal-500 font-medium">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>HealthPredict Emergency Care Network</span>
          </div>
        </div>
      </div>
    </div>
  )
}
