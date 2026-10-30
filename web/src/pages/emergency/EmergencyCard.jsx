import { useState, useEffect } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  ExternalLink,
  Heart,
  Phone,
  QrCode,
  Shield,
} from 'lucide-react'
import { emergencyService } from '../../services/emergencyService'

const BLOOD_TYPES = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'Unknown']

export default function EmergencyCard() {
  const [card, setCard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [successMsg, setSuccessMsg] = useState('')
  const [copied, setCopied] = useState(false)
  const [qrSvg, setQrSvg] = useState('')
  const [showConsentModal, setShowConsentModal] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)

  // Form fields
  const [bloodType, setBloodType] = useState('Unknown')
  const [allergiesText, setAllergiesText] = useState('')
  const [conditionsText, setConditionsText] = useState('')
  const [medicationsText, setMedicationsText] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactRel, setContactRel] = useState('')
  const [organDonor, setOrganDonor] = useState(false)
  const [medicalNotes, setMedicalNotes] = useState('')
  const [consentAcknowledged, setConsentAcknowledged] = useState(false)

  useEffect(() => {
    loadCard()
  }, [])

  async function loadCard() {
    setLoading(true)
    setError(null)
    try {
      const data = await emergencyService.getCard()
      setCard(data)
      setBloodType(data.blood_type || 'Unknown')
      setAllergiesText((data.allergies || []).join(', '))
      setConditionsText((data.chronic_conditions || []).join(', '))
      setMedicationsText((data.current_medications || []).join(', '))
      setContactName(data.emergency_contact_name || '')
      setContactPhone(data.emergency_contact_phone || '')
      setContactRel(data.emergency_contact_relationship || '')
      setOrganDonor(Boolean(data.organ_donor))
      setMedicalNotes(data.medical_notes || '')

      // Also fetch vector QR SVG
      try {
        const svg = await emergencyService.getCardQrSvg()
        setQrSvg(svg)
      } catch (qrErr) {
        console.warn('Could not load vector QR SVG', qrErr)
      }
    } catch (err) {
      setError('Failed to load emergency card details.')
    } finally {
      setLoading(false)
    }
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccessMsg('')

    const allergies = allergiesText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const conditions = conditionsText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const medications = medicationsText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    try {
      const updated = await emergencyService.updateCard({
        blood_type: bloodType,
        allergies,
        chronic_conditions: conditions,
        current_medications: medications,
        emergency_contact_name: contactName.trim() || null,
        emergency_contact_phone: contactPhone.trim() || null,
        emergency_contact_relationship: contactRel.trim() || null,
        organ_donor: organDonor,
        medical_notes: medicalNotes.trim() || null,
      })
      setCard(updated)
      setSuccessMsg('Emergency card medical details updated successfully!')
      setTimeout(() => setSuccessMsg(''), 4000)
    } catch (err) {
      setError('Could not update emergency card. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function confirmEnablePublic() {
    setShowConsentModal(false)
    setActionLoading(true)
    setError(null)
    try {
      const updated = await emergencyService.setVisibility(true, true)
      setCard(updated)
      setSuccessMsg('Public emergency link enabled. Valid for 30 days.')
      setTimeout(() => setSuccessMsg(''), 4000)
      try {
        const svg = await emergencyService.getCardQrSvg()
        setQrSvg(svg)
      } catch {}
    } catch (err) {
      setError('Could not enable public sharing.')
    } finally {
      setActionLoading(false)
      setConsentAcknowledged(false)
    }
  }

  async function handleRevokePublic() {
    if (!window.confirm('Stopping sharing will immediately make this card private and invalidate any previously shared links or QR codes. Continue?')) {
      return
    }
    setActionLoading(true)
    setError(null)
    try {
      const updated = await emergencyService.setVisibility(false, false)
      setCard(updated)
      setSuccessMsg('Emergency card is now private. Old links have been permanently revoked.')
      setTimeout(() => setSuccessMsg(''), 4000)
    } catch (err) {
      setError('Could not revoke public sharing.')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleRegenerateLink() {
    if (!window.confirm('Regenerating will invalidate the current link and QR code immediately. Continue?')) {
      return
    }
    setActionLoading(true)
    setError(null)
    try {
      const updated = await emergencyService.regenerateLink()
      setCard(updated)
      setSuccessMsg('New public link and QR generated! Previous links are now invalid.')
      setTimeout(() => setSuccessMsg(''), 4000)
      try {
        const svg = await emergencyService.getCardQrSvg()
        setQrSvg(svg)
      } catch {}
    } catch (err) {
      setError('Could not regenerate link.')
    } finally {
      setActionLoading(false)
    }
  }

  const shareableUrl = card?.public_token
    ? `${window.location.origin}/e/${card.public_token}`
    : ''

  function handleCopyLink() {
    if (!shareableUrl) return
    navigator.clipboard.writeText(shareableUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 3000)
  }

  if (loading) {
    return (
      <div className="space-y-4 max-w-3xl mx-auto">
        <div className="h-10 bg-slate-100 rounded-xl animate-pulse" />
        <div className="h-64 bg-slate-100 rounded-2xl animate-pulse" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-display font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <Shield className="h-7 w-7 text-red-600" />
          Emergency ID Card
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Vital health details accessible to first responders and emergency contacts via a secure public link or QR code.
        </p>
      </div>

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          {successMsg}
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 flex items-center gap-2 text-sm">
          <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
          {error}
        </div>
      )}

      {/* Shareable Link & Vector QR Card */}
      <div className="bg-gradient-to-r from-red-50 via-teal-50 to-slate-50 rounded-2xl border border-red-100 p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-red-700 uppercase tracking-wider flex items-center gap-1.5">
                <QrCode className="h-4 w-4" />
                Emergency Link & Vector QR
              </span>
              {card?.is_public ? (
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[11px]">
                  Public Sharing Active
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-700 font-bold text-[11px]">
                  Private
                </span>
              )}
            </div>
            <p className="text-xs text-slate-600 mt-1">
              {card?.is_public
                ? `First responders can scan this QR code or open your public URL without login. Expires on: ${card.expires_at ? new Date(card.expires_at).toLocaleDateString() : 'in 30 days'}.`
                : 'Public sharing is turned off. First responders cannot view this card until you explicitly enable it.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {card?.is_public ? (
              <>
                <button
                  onClick={handleCopyLink}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 shadow-sm transition"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {copied ? 'Copied!' : 'Copy Link'}
                </button>
                <a
                  href={shareableUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-red-600 hover:bg-red-700 shadow-sm transition"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Preview Card
                </a>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={handleRegenerateLink}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition"
                  title="Rotate URL to invalidate any previously distributed links"
                >
                  Rotate Link
                </button>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={handleRevokePublic}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 transition"
                >
                  Stop Sharing
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => setShowConsentModal(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 shadow-sm transition"
              >
                <Shield className="h-3.5 w-3.5" />
                Enable Public Sharing
              </button>
            )}
          </div>
        </div>

        {/* QR Code SVG & Wallet Card Layout */}
        {card?.is_public ? (
          <div className="pt-3 border-t border-red-100/60 flex flex-col sm:flex-row items-center gap-6 bg-white/70 p-4 rounded-xl">
            <div className="w-36 h-36 bg-white border border-slate-200 rounded-xl p-2 shadow-inner flex items-center justify-center shrink-0">
              {qrSvg ? (
                <div
                  className="w-full h-full flex items-center justify-center [&>svg]:w-full [&>svg]:h-full"
                  dangerouslySetInnerHTML={{ __html: qrSvg }}
                />
              ) : (
                <div className="text-[11px] text-slate-400 text-center">Loading QR...</div>
              )}
            </div>
            <div className="flex-1 space-y-1.5 text-xs text-slate-700">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-slate-900">Printable Wallet Emergency Card</span>
                <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-extrabold text-[10px]">
                  {bloodType !== 'Unknown' ? bloodType : 'Blood Unknown'}
                </span>
              </div>
              <p className="text-slate-500">
                Keep this QR code on a lock screen wallpaper or laminated in your wallet for immediate EMT triage.
              </p>
              <div className="pt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-xs transition"
                >
                  Print Wallet Card
                </button>
                <a
                  href={`/api/health/emergency-card/qr`}
                  download="emergency_qr.svg"
                  className="text-teal-700 hover:text-teal-800 font-medium underline text-xs"
                >
                  Download SVG QR
                </a>
              </div>
            </div>
          </div>
        ) : null}
      </div>


      {/* Edit Form */}
      <form onSubmit={handleSave} className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-7 shadow-sm space-y-6">
        <h2 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-3">
          Medical Information
        </h2>

        {/* Blood type */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Blood Type
          </label>
          <div className="flex flex-wrap gap-2">
            {BLOOD_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setBloodType(type)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition ${
                  bloodType === type
                    ? 'bg-red-600 text-white border-red-600 shadow-sm'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* Allergies */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Known Drug & Food Allergies
          </label>
          <input
            type="text"
            placeholder="e.g., Penicillin, Peanuts, Latex, Aspirin (separated by commas)"
            value={allergiesText}
            onChange={(e) => setAllergiesText(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
          <p className="text-[11px] text-slate-400 mt-1">Separate multiple items with commas</p>
        </div>

        {/* Chronic conditions */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Chronic Conditions
          </label>
          <input
            type="text"
            placeholder="e.g., Type 2 Diabetes, Hypertension, Asthma"
            value={conditionsText}
            onChange={(e) => setConditionsText(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>

        {/* Medications */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Critical Daily Medications
          </label>
          <input
            type="text"
            placeholder="e.g., Lisinopril 10mg, Metformin 500mg, Albuterol Inhaler"
            value={medicationsText}
            onChange={(e) => setMedicationsText(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Medical Implants or Special Instructions
          </label>
          <textarea
            rows={2}
            placeholder="e.g., Cardiac pacemaker implanted 2024; wears medic alert bracelet on right wrist"
            value={medicalNotes}
            onChange={(e) => setMedicalNotes(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>

        {/* Organ Donor & Privacy */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-3 border-y border-slate-100">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={organDonor}
              onChange={(e) => setOrganDonor(e.target.checked)}
              className="h-4 w-4 text-teal-600 focus:ring-teal-500 rounded border-slate-300"
            />
            <span className="text-sm font-medium text-slate-800 flex items-center gap-1.5">
              <Heart className="h-4 w-4 text-red-500" />
              Registered Organ Donor
            </span>
          </label>

{/* Public sharing is managed by the explicit consent buttons above the form, not this checkbox */}
        </div>

        {/* Emergency Contact */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Phone className="h-5 w-5 text-teal-600" />
            Primary Emergency Contact
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Contact Name
              </label>
              <input
                type="text"
                placeholder="e.g., Sarah Jenkins"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Phone Number
              </label>
              <input
                type="tel"
                placeholder="e.g., +1 (555) 019-2834"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Relationship
              </label>
              <input
                type="text"
                placeholder="e.g., Spouse, Parent, Sibling"
                value={contactRel}
                onChange={(e) => setContactRel(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 rounded-xl font-semibold text-sm text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 transition shadow-sm"
          >
            {saving ? 'Saving...' : 'Save Emergency Card'}
          </button>
        </div>
      </form>

      {/* Medical disclaimer */}
      <div className="p-4 rounded-xl bg-slate-100 border border-slate-200 text-xs text-slate-600">
        <p>
          <strong>Notice:</strong> This emergency card is maintained by the user for informational reference. It is not an official medical record or legal directive. Always confirm with official medical records when providing clinical care.
        </p>
      </div>

      {/* ── Public Sharing Consent Modal ── */}
      {showConsentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-2">
              <Shield className="h-6 w-6 text-red-600" />
              <h3 className="text-lg font-bold text-slate-900">Enable Public Emergency Card?</h3>
            </div>

            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-900 space-y-2">
              <p className="font-semibold flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                Important: Read carefully before enabling
              </p>
              <p>
                Enabling public sharing will make the following information accessible to
                <strong> anyone with the link or QR code</strong>, without any login required:
              </p>
              <ul className="list-disc list-inside space-y-1 text-xs pl-2">
                <li><strong>Blood type</strong></li>
                <li><strong>Known allergies</strong> (drug &amp; food)</li>
                <li><strong>Chronic conditions</strong></li>
                <li><strong>Current critical medications</strong></li>
                <li><strong>Emergency contact</strong> (name, phone, relationship)</li>
                <li><strong>Organ donor status</strong></li>
                <li><strong>Medical implants / special instructions</strong></li>
              </ul>
            </div>

            <div className="text-sm text-slate-700 space-y-2">
              <p>
                The public link will <strong>expire automatically after 30 days</strong>.
                You can revoke access at any time, which immediately invalidates all existing links and QR codes.
              </p>
              <p className="text-xs text-slate-500">
                This data is intended for first responders and emergency triage only. It is not a substitute for official medical records.
              </p>
            </div>

            <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={consentAcknowledged}
                onChange={(e) => setConsentAcknowledged(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
              />
              <span>I have reviewed the list above and explicitly consent to making this emergency health information publicly viewable without authentication.</span>
            </label>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setShowConsentModal(false)
                  setConsentAcknowledged(false)
                }}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmEnablePublic}
                disabled={actionLoading || !consentAcknowledged}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 transition shadow-sm"
              >
                {actionLoading ? 'Enabling...' : 'I Understand — Enable Public Sharing'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
