import { useState, useEffect } from 'react'
import {
  Calendar,
  Clock,
  MapPin,
  User,
  Plus,
  CheckCircle,
  FileText,
  AlertCircle,
  Stethoscope,
  Trash2,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { emergencyService } from '../../services/emergencyService'

export default function Appointments() {
  const [appointments, setAppointments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Form states
  const [doctorName, setDoctorName] = useState('')
  const [specialty, setSpecialty] = useState('')
  const [location, setLocation] = useState('')
  const [appointmentDate, setAppointmentDate] = useState('')
  const [reasonForVisit, setReasonForVisit] = useState('')
  const [doctorNotes, setDoctorNotes] = useState('')
  const [followupDate, setFollowupDate] = useState('')
  const [newQuestion, setNewQuestion] = useState('')
  const [questions, setQuestions] = useState([])

  // Pre-visit Prep Sheet Modal
  const [prepModalAppt, setPrepModalAppt] = useState(null)
  const [prepData, setPrepData] = useState(null)
  const [prepLoading, setPrepLoading] = useState(false)

  useEffect(() => {
    loadAppointments()
  }, [])

  async function loadAppointments() {
    setLoading(true)
    setError(null)
    try {
      const data = await emergencyService.listAppointments()
      setAppointments(data)
    } catch (err) {
      setError('Failed to load appointments. Please check your connection.')
    } finally {
      setLoading(false)
    }
  }

  function handleAddQuestion() {
    if (newQuestion.trim()) {
      setQuestions((prev) => [...prev, newQuestion.trim()])
      setNewQuestion('')
    }
  }

  function handleRemoveQuestion(index) {
    setQuestions((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleCreateAppointment(e) {
    e.preventDefault()
    if (!doctorName.trim() || !appointmentDate) return

    setSubmitting(true)
    try {
      await emergencyService.createAppointment({
        doctor_name: doctorName.trim(),
        specialty: specialty.trim() || null,
        location: location.trim() || null,
        appointment_date: new Date(appointmentDate).toISOString(),
        reason_for_visit: reasonForVisit.trim() || null,
        questions_to_ask: questions.length > 0 ? questions : null,
        doctor_notes: doctorNotes.trim() || null,
        followup_date: followupDate || null,
      })

      // Reset form
      setDoctorName('')
      setSpecialty('')
      setLocation('')
      setAppointmentDate('')
      setReasonForVisit('')
      setDoctorNotes('')
      setFollowupDate('')
      setQuestions([])
      setShowAddForm(false)
      await loadAppointments()
    } catch (err) {
      setError('Could not schedule appointment. Please check the date and details.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleOpenPrepSheet(appt) {
    setPrepModalAppt(appt)
    setPrepLoading(true)
    try {
      const data = await emergencyService.getAppointmentPrep(appt.id)
      setPrepData(data)
    } catch (err) {
      setError('Unable to load appointment preparation checklist.')
    } finally {
      setPrepLoading(false)
    }
  }

  async function handleStatusChange(apptId, newStatus) {
    try {
      await emergencyService.updateAppointment(apptId, { status: newStatus })
      await loadAppointments()
    } catch (err) {
      setError('Unable to update appointment status.')
    }
  }

  async function handleDelete(apptId) {
    if (!window.confirm('Are you sure you want to delete this appointment?')) return
    try {
      await emergencyService.deleteAppointment(apptId)
      await loadAppointments()
    } catch (err) {
      setError('Unable to remove appointment.')
    }
  }

  const upcomingList = appointments.filter((a) => a.status === 'UPCOMING')
  const pastList = appointments.filter((a) => a.status !== 'UPCOMING')

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-slate-900 tracking-tight">
            Doctor Visits & Appointments
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Keep upcoming visits organized and prepare questions in advance.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/reports"
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white font-medium text-sm text-slate-700 hover:bg-slate-50 transition shadow-sm"
          >
            <FileText className="h-4 w-4 text-teal-600" />
            Share Visit Summary
          </Link>
          <button
            onClick={() => setShowAddForm((p) => !p)}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-semibold text-sm text-white bg-teal-700 hover:bg-teal-800 transition shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Add Visit
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 flex items-center gap-2 text-sm">
          <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
          {error}
        </div>
      )}

      {/* Add Appointment Modal / Card */}
      {showAddForm && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 mb-1 flex items-center gap-2">
            <Stethoscope className="h-5 w-5 text-teal-600" />
            Schedule New Doctor Appointment
          </h2>
          <p className="text-xs text-slate-500 mb-4">
            Enter the appointment details and note any questions you want to ask.
          </p>

          <form onSubmit={handleCreateAppointment} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Doctor or Clinic Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Dr. Robert Chen"
                  value={doctorName}
                  onChange={(e) => setDoctorName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Specialty
                </label>
                <input
                  type="text"
                  placeholder="e.g., Cardiologist, Primary Care, Neurologist"
                  value={specialty}
                  onChange={(e) => setSpecialty(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Date & Time *
                </label>
                <input
                  type="datetime-local"
                  required
                  value={appointmentDate}
                  onChange={(e) => setAppointmentDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Clinic Location or Telehealth Link
                </label>
                <input
                  type="text"
                  placeholder="e.g., 450 Medical Plaza, Suite 201"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Reason for Visit
              </label>
              <input
                type="text"
                placeholder="e.g., Review blood pressure medications and quarterly bloodwork"
                value={reasonForVisit}
                onChange={(e) => setReasonForVisit(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            {/* Questions list */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Questions for the Doctor
              </label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  placeholder="e.g., Should I take my medicine with food?"
                  value={newQuestion}
                  onChange={(e) => setNewQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAddQuestion()
                    }
                  }}
                  className="flex-1 px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <button
                  type="button"
                  onClick={handleAddQuestion}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-sm transition"
                >
                  Add
                </button>
              </div>

              {questions.length > 0 && (
                <ul className="space-y-1.5 mt-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  {questions.map((q, idx) => (
                    <li key={idx} className="flex items-center justify-between text-xs text-slate-700">
                      <span>• {q}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveQuestion(idx)}
                        className="text-red-500 hover:text-red-700 text-xs font-semibold ml-2"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 transition shadow-sm"
              >
                {submitting ? 'Saving...' : 'Save Appointment'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Upcoming Section */}
      <div className="space-y-3">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <Calendar className="h-5 w-5 text-teal-700" />
          Upcoming Visits ({upcomingList.length})
        </h2>

        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-28 bg-slate-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : upcomingList.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center max-w-md mx-auto">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-teal-50 text-teal-700 mb-3">
              <Calendar className="h-6 w-6" />
            </div>
            <h3 className="text-base font-semibold text-slate-900">No upcoming visits</h3>
            <p className="mt-1 text-sm text-slate-500 mb-4">
              Schedule your next routine checkup, specialist consultation, or lab review.
            </p>
            <button
              onClick={() => setShowAddForm(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 transition shadow-sm"
            >
              <Plus className="h-4 w-4" />
              Schedule a Visit
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {upcomingList.map((appt) => {
              const dt = new Date(appt.appointment_date)
              const formattedDate = dt.toLocaleDateString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })
              const formattedTime = dt.toLocaleTimeString(undefined, {
                hour: '2-digit',
                minute: '2-digit',
              })

              return (
                <div
                  key={appt.id}
                  className="bg-white rounded-2xl border border-teal-200/80 p-5 shadow-sm hover:shadow-md transition"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-100 text-teal-800">
                          Upcoming
                        </span>
                        {appt.specialty && (
                          <span className="text-xs font-medium text-slate-500">
                            {appt.specialty}
                          </span>
                        )}
                      </div>
                      <h3 className="text-lg font-bold text-slate-900 mt-1 flex items-center gap-2">
                        <User className="h-4 w-4 text-slate-400" />
                        {appt.doctor_name}
                      </h3>
                      {appt.reason_for_visit && (
                        <p className="text-xs text-slate-600 mt-0.5">
                          {appt.reason_for_visit}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 self-end sm:self-start">
                      <button
                        onClick={() => handleOpenPrepSheet(appt)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 transition"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        Prepare for Visit
                      </button>
                      <button
                        onClick={() => handleStatusChange(appt.id, 'COMPLETED')}
                        title="Mark as completed"
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition"
                      >
                        <CheckCircle className="h-3.5 w-3.5" />
                        Completed
                      </button>
                      <button
                        onClick={() => handleDelete(appt.id)}
                        title="Cancel or delete"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4 pt-4 border-t border-slate-100 text-xs text-slate-600">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-teal-600" />
                      <span>{formattedDate} at {formattedTime}</span>
                    </div>
                    {appt.location && (
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-teal-600" />
                        <span className="truncate">{appt.location}</span>
                      </div>
                    )}
                  </div>

                  {appt.questions_to_ask && appt.questions_to_ask.length > 0 && (
                    <div className="mt-3 p-3 bg-slate-50 rounded-xl border border-slate-200/60">
                      <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                        Questions you prepared:
                      </p>
                      <ul className="space-y-1 text-xs text-slate-600 list-disc list-inside">
                        {appt.questions_to_ask.map((q, idx) => (
                          <li key={idx}>{q}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Past Appointments */}
      {pastList.length > 0 && (
        <div className="space-y-3 pt-4">
          <h2 className="text-base font-bold text-slate-700">
            Past Visits ({pastList.length})
          </h2>
          <div className="grid gap-2">
            {pastList.map((appt) => (
              <div
                key={appt.id}
                className="bg-slate-50 rounded-xl border border-slate-200 p-4 flex items-center justify-between opacity-85 text-sm"
              >
                <div>
                  <h4 className="font-semibold text-slate-800">{appt.doctor_name}</h4>
                  <p className="text-xs text-slate-500">
                    {new Date(appt.appointment_date).toLocaleDateString()} • {appt.specialty || 'General Consultation'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                    {appt.status}
                  </span>
                  <button
                    onClick={() => handleDelete(appt.id)}
                    className="text-slate-400 hover:text-red-600 p-1 rounded"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Pre-visit Preparation Sheet Modal (Group 8: E3) */}
      {prepModalAppt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-teal-50 rounded-xl text-teal-700">
                  <Stethoscope className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-lg">Visit Preparation Sheet</h3>
                  <p className="text-xs text-slate-500">
                    {prepModalAppt.doctor_name} • {new Date(prepModalAppt.appointment_date).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setPrepModalAppt(null)
                  setPrepData(null)
                }}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            {prepLoading ? (
              <div className="py-12 text-center space-y-3">
                <div className="h-8 w-8 border-3 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs text-slate-500">Compiling active prescriptions, recent symptoms, and questions...</p>
              </div>
            ) : prepData ? (
              <div className="space-y-4 text-xs">
                {/* Active Prescriptions */}
                <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200/70">
                  <span className="font-bold uppercase tracking-wider text-teal-800 text-[10px] block mb-1">
                    Current Active Medications ({prepData.active_medications?.length || 0})
                  </span>
                  {prepData.active_medications && prepData.active_medications.length > 0 ? (
                    <ul className="space-y-1 text-slate-700">
                      {prepData.active_medications.map((m) => (
                        <li key={m.id} className="flex items-center justify-between">
                          <span className="font-medium">• {m.medicine_name} ({m.dosage || 'dosage as directed'})</span>
                          <span className="text-[11px] text-slate-400 italic">{m.instructions || m.reason_for_use || ''}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-slate-400 italic">No active prescriptions currently recorded.</p>
                  )}
                </div>

                {/* Recent Symptoms */}
                <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200/70">
                  <span className="font-bold uppercase tracking-wider text-rose-800 text-[10px] block mb-1">
                    Recent Symptoms (Past 14 Days)
                  </span>
                  {prepData.recent_symptoms && prepData.recent_symptoms.length > 0 ? (
                    <ul className="space-y-1 text-slate-700">
                      {prepData.recent_symptoms.map((s) => (
                        <li key={s.id} className="flex items-center justify-between">
                          <span>• {s.symptom_name} (Severity: {s.severity}/5)</span>
                          <span className="text-[11px] text-slate-400">{new Date(s.logged_at).toLocaleDateString()}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-slate-400 italic">No recent symptoms logged in the past 14 days.</p>
                  )}
                </div>

                {/* Health Score Summary */}
                {prepData.latest_assessment && (
                  <div className="bg-teal-50/70 rounded-xl p-3.5 border border-teal-200/60 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-teal-900 text-xs block">Latest Health Assessment</span>
                      <span className="text-[11px] text-teal-700">Evaluated on {prepData.latest_assessment.assessment_date}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold text-teal-800 block">Health Score</span>
                      <span className="text-base font-extrabold text-teal-900">{prepData.latest_assessment.health_score || '--'}</span>
                    </div>
                  </div>
                )}

                {/* Suggested Questions */}
                {prepData.appointment?.questions_to_ask && prepData.appointment.questions_to_ask.length > 0 && (
                  <div className="bg-amber-50/60 rounded-xl p-3.5 border border-amber-200/60">
                    <span className="font-bold uppercase tracking-wider text-amber-900 text-[10px] block mb-1">
                      Your Planned Questions:
                    </span>
                    <ol className="list-decimal list-inside space-y-1 text-amber-900">
                      {prepData.appointment.questions_to_ask.map((q, idx) => (
                        <li key={idx}>{q}</li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            ) : null}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition"
              >
                Print Prep Sheet
              </button>
              <button
                type="button"
                onClick={() => {
                  setPrepModalAppt(null)
                  setPrepData(null)
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
