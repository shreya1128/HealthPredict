import { ArrowRight, Check, ChevronLeft, Droplets, Heart, Moon, Pill, Sparkles, User, Zap } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { profileService } from '../../services/healthService'
import { medicineService } from '../../services/medicineService'
import { inputClass } from '../../components/common/Feedback'

const COMMON_CONDITIONS = [
  'Hypertension (High BP)',
  'Type 2 Diabetes',
  'High Cholesterol',
  'Asthma',
  'Thyroid',
  'None / General Wellness',
]

export default function Onboarding() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)

  // Step 1: Basics
  const [dob, setDob] = useState('')
  const [gender, setGender] = useState('OTHER')

  // Step 2: Body Metrics
  const [heightCm, setHeightCm] = useState('')
  const [weightKg, setWeightKg] = useState('')

  // Step 3: Conditions
  const [selectedConditions, setSelectedConditions] = useState([])

  // Step 4: First Medicine (optional)
  const [hasMed, setHasMed] = useState(false)
  const [medName, setMedName] = useState('')
  const [medDosage, setMedDosage] = useState('')
  const [medUnit, setMedUnit] = useState('mg')
  const [medTime, setMedTime] = useState('08:00')

  // Step 5: Daily Goals
  const [waterGoal, setWaterGoal] = useState('2500')
  const [sleepGoal, setSleepGoal] = useState('8')

  function toggleCondition(c) {
    if (selectedConditions.includes(c)) {
      setSelectedConditions(selectedConditions.filter((x) => x !== c))
    } else {
      setSelectedConditions([...selectedConditions, c])
    }
  }

  async function handleFinish() {
    setSubmitting(true)
    try {
      // 1. Save profile fields
      const profilePayload = {}
      if (dob) profilePayload.date_of_birth = dob
      if (gender) profilePayload.gender = gender
      if (heightCm) profilePayload.height_cm = parseFloat(heightCm)
      if (weightKg) profilePayload.weight_kg = parseFloat(weightKg)
      if (selectedConditions.length) profilePayload.existing_conditions = selectedConditions
      if (waterGoal) profilePayload.water_intake_goal_ml = parseInt(waterGoal, 10)
      if (sleepGoal) profilePayload.sleep_duration_hours = parseFloat(sleepGoal)

      await profileService.update(profilePayload)

      // 2. Add first medicine if entered
      if (hasMed && medName.trim()) {
        await medicineService.create({
          medicine_name: medName.trim(),
          dosage: medDosage ? parseFloat(medDosage) : null,
          dosage_unit: medUnit,
          form: 'TABLET',
          frequency_times_per_day: 1,
          frequency_unit: 'DAILY',
          start_date: new Date().toISOString().slice(0, 10),
          time_of_day: [medTime],
          instructions: 'Take with water',
        })
      }

      // 3. Navigate to Today home screen
      navigate('/dashboard', { replace: true })
    } catch {
      // Even if one optional write fails, proceed to Today
      navigate('/dashboard', { replace: true })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full mx-auto bg-white rounded-3xl border border-slate-200/80 shadow-xl p-8 sm:p-10">
        {/* Progress bar */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-1.5">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i === step ? 'w-8 bg-teal-700' : i < step ? 'w-4 bg-teal-400' : 'w-4 bg-slate-200'
                }`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => navigate('/dashboard', { replace: true })}
            className="text-xs font-semibold text-slate-400 hover:text-slate-600 transition"
          >
            Skip for now
          </button>
        </div>

        {/* ── Step 1: Basics ── */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <div className="h-10 w-10 rounded-2xl bg-teal-50 flex items-center justify-center text-teal-700 mb-3">
                <User className="h-5 w-5" aria-hidden="true" />
              </div>
              <h2 className="text-2xl font-display font-bold text-slate-900">A few quick basics</h2>
              <p className="mt-1 text-sm text-slate-500">Helps calibrate normal ranges for vitals and heart risk.</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Date of Birth</label>
                <input
                  type="date"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  className={inputClass(false)}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Sex assigned at birth</label>
                <div className="grid grid-cols-3 gap-2">
                  {['FEMALE', 'MALE', 'OTHER'].map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setGender(g)}
                      className={`py-2.5 px-3 rounded-xl border text-xs font-semibold transition ${
                        gender === g
                          ? 'border-teal-700 bg-teal-50 text-teal-800'
                          : 'border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {g === 'FEMALE' ? 'Female' : g === 'MALE' ? 'Male' : 'Other'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 2: Body Metrics ── */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <div className="h-10 w-10 rounded-2xl bg-teal-50 flex items-center justify-center text-teal-700 mb-3">
                <Sparkles className="h-5 w-5" aria-hidden="true" />
              </div>
              <h2 className="text-2xl font-display font-bold text-slate-900">Height & weight</h2>
              <p className="mt-1 text-sm text-slate-500">Used to calculate your Body Mass Index (BMI).</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Height (cm)</label>
                <input
                  type="number"
                  placeholder="e.g. 172"
                  value={heightCm}
                  onChange={(e) => setHeightCm(e.target.value)}
                  className={inputClass(false)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Weight (kg)</label>
                <input
                  type="number"
                  placeholder="e.g. 68"
                  value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)}
                  className={inputClass(false)}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── Step 3: Conditions ── */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <div className="h-10 w-10 rounded-2xl bg-teal-50 flex items-center justify-center text-teal-700 mb-3">
                <Heart className="h-5 w-5" aria-hidden="true" />
              </div>
              <h2 className="text-2xl font-display font-bold text-slate-900">Any health conditions?</h2>
              <p className="mt-1 text-sm text-slate-500">Select any that apply to help tailor your insights.</p>
            </div>

            <div className="flex flex-wrap gap-2">
              {COMMON_CONDITIONS.map((c) => {
                const active = selectedConditions.includes(c)
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => toggleCondition(c)}
                    className={`py-2 px-3.5 rounded-xl border text-xs font-medium transition ${
                      active
                        ? 'border-teal-700 bg-teal-700 text-white font-semibold'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    {c} {active && '✓'}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Step 4: First Medicine ── */}
        {step === 4 && (
          <div className="space-y-6">
            <div>
              <div className="h-10 w-10 rounded-2xl bg-teal-50 flex items-center justify-center text-teal-700 mb-3">
                <Pill className="h-5 w-5" aria-hidden="true" />
              </div>
              <h2 className="text-2xl font-display font-bold text-slate-900">Do you take any medicines?</h2>
              <p className="mt-1 text-sm text-slate-500">We'll set up your first daily reminder.</p>
            </div>

            {!hasMed ? (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => setHasMed(true)}
                  className="w-full py-3.5 px-4 rounded-2xl border-2 border-teal-700 bg-teal-50 text-teal-800 font-semibold text-sm hover:bg-teal-100 transition"
                >
                  + Yes, add my medicine now
                </button>
                <button
                  type="button"
                  onClick={() => setStep(5)}
                  className="w-full py-3 px-4 rounded-2xl border border-slate-200 text-slate-600 font-medium text-sm hover:bg-slate-50 transition"
                >
                  I don't take any right now
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Medicine Name</label>
                  <input
                    placeholder="e.g. Metformin, Amlodipine"
                    value={medName}
                    onChange={(e) => setMedName(e.target.value)}
                    className={inputClass(false)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Dosage</label>
                    <input
                      placeholder="e.g. 500"
                      value={medDosage}
                      onChange={(e) => setMedDosage(e.target.value)}
                      className={inputClass(false)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Unit</label>
                    <input
                      value={medUnit}
                      onChange={(e) => setMedUnit(e.target.value)}
                      className={inputClass(false)}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Scheduled Time</label>
                  <input
                    type="time"
                    value={medTime}
                    onChange={(e) => setMedTime(e.target.value)}
                    className={inputClass(false)}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Step 5: Goals ── */}
        {step === 5 && (
          <div className="space-y-6">
            <div>
              <div className="h-10 w-10 rounded-2xl bg-teal-50 flex items-center justify-center text-teal-700 mb-3">
                <Zap className="h-5 w-5" aria-hidden="true" />
              </div>
              <h2 className="text-2xl font-display font-bold text-slate-900">Your daily targets</h2>
              <p className="mt-1 text-sm text-slate-500">Pick comfortable daily targets to track on your home screen.</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1 flex items-center gap-1.5">
                  <Droplets className="h-4 w-4 text-blue-500" /> Daily Water Target (ml)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {['2000', '2500', '3000'].map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => setWaterGoal(w)}
                      className={`py-2 px-3 rounded-xl border text-xs font-semibold transition ${
                        waterGoal === w
                          ? 'border-blue-600 bg-blue-50 text-blue-800'
                          : 'border-slate-200 text-slate-600'
                      }`}
                    >
                      {w} ml
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1 flex items-center gap-1.5">
                  <Moon className="h-4 w-4 text-purple-500" /> Sleep Goal (hours)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {['7', '8', '9'].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSleepGoal(s)}
                      className={`py-2 px-3 rounded-xl border text-xs font-semibold transition ${
                        sleepGoal === s
                          ? 'border-purple-600 bg-purple-50 text-purple-800'
                          : 'border-slate-200 text-slate-600'
                      }`}
                    >
                      {s} hours
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Footer Navigation ── */}
        <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-between">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="inline-flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-slate-900 transition"
            >
              <ChevronLeft className="h-4 w-4" /> Back
            </button>
          ) : (
            <div />
          )}

          {step < 5 ? (
            <button
              type="button"
              onClick={() => setStep(step + 1)}
              className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-800 transition"
            >
              Next <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              disabled={submitting}
              onClick={handleFinish}
              className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-800 transition disabled:opacity-50"
            >
              {submitting ? 'Setting up…' : 'Go to Today'} <Check className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
