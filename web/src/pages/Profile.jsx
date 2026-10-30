import { useEffect, useState } from 'react'
import { profileService } from '../services/healthService'
import { getErrorMessage } from '../services/api'
import { enumLabel } from '../utils/enumLabel'
import { Alert, Field, SubmitButton, inputClass } from '../components/common/Feedback'
import AccountSettings from './AccountSettings'

const EXERCISE = ['SEDENTARY', 'LIGHT', 'MODERATE', 'ACTIVE', 'VERY_ACTIVE']
const SMOKING = ['NEVER', 'FORMER', 'CURRENT']
const ALCOHOL = ['NEVER', 'OCCASIONALLY', 'REGULARLY', 'HEAVILY']
const CHOLESTEROL = ['NORMAL', 'ABOVE_NORMAL', 'WELL_ABOVE_NORMAL']
const GENDER = ['FEMALE', 'MALE', 'OTHER']

function toFormValue(v) {
  return v === null || v === undefined ? '' : String(v)
}

export default function Profile() {
  const [activeTab, setActiveTab] = useState('profile')
  const [data, setData] = useState(null)
  const [form, setForm] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [deviceTzNotice, setDeviceTzNotice] = useState(null)

  useEffect(() => {
    profileService.get()
      .then((d) => {
        setData(d)
        const savedTz = d.user?.timezone || 'UTC'
        let devTz = 'UTC'
        try {
          devTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
        } catch {
          devTz = 'UTC'
        }
        if (devTz && savedTz && devTz !== savedTz) {
          setDeviceTzNotice(devTz)
        }
        setForm({
          full_name: d.user.full_name, phone: d.user.phone || '', date_of_birth: d.user.date_of_birth || '',
          gender: d.user.gender || 'OTHER', timezone: savedTz, height_cm: toFormValue(d.height_cm), weight_kg: toFormValue(d.weight_kg),
          waist_circumference_cm: toFormValue(d.waist_circumference_cm), exercise_frequency: d.exercise_frequency || '',
          sleep_duration_hours: toFormValue(d.sleep_duration_hours), smoking_status: d.smoking_status || '',
          alcohol_consumption: d.alcohol_consumption || '', cholesterol_level: d.cholesterol_level || '',
          diet_type: d.diet_type || '',
          water_intake_goal_ml: toFormValue(d.water_intake_goal_ml),
          allergies: (d.allergies || []).join(', '), existing_conditions: (d.existing_conditions || []).join(', '),
          family_history: (d.family_history || []).join(', '),
          emergency_contact_name: d.emergency_contact_name || '', emergency_contact_phone: d.emergency_contact_phone || '',
        })
      })
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p className="text-slate-500">Loading profile…</p>
  if (error && !form) return <Alert>{error}</Alert>
  if (!form) return null

  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setSaved(false) }
  const toList = (s) => s.split(',').map((x) => x.trim()).filter(Boolean)

  async function onSubmit(e) {
    e.preventDefault()
    setError(''); setSaved(false); setSaving(true)
    const payload = {
      full_name: form.full_name, gender: form.gender,
      allergies: toList(form.allergies), existing_conditions: toList(form.existing_conditions),
      family_history: toList(form.family_history),
    }
    if (form.phone) payload.phone = form.phone
    if (form.date_of_birth) payload.date_of_birth = form.date_of_birth
    if (form.timezone) payload.timezone = form.timezone
    if (form.diet_type) payload.diet_type = form.diet_type
    if (form.exercise_frequency) payload.exercise_frequency = form.exercise_frequency
    if (form.smoking_status) payload.smoking_status = form.smoking_status
    if (form.alcohol_consumption) payload.alcohol_consumption = form.alcohol_consumption
    if (form.cholesterol_level) payload.cholesterol_level = form.cholesterol_level
    if (form.emergency_contact_name) payload.emergency_contact_name = form.emergency_contact_name
    if (form.emergency_contact_phone) payload.emergency_contact_phone = form.emergency_contact_phone
    for (const [key, val] of [['height_cm', form.height_cm], ['weight_kg', form.weight_kg],
                              ['waist_circumference_cm', form.waist_circumference_cm],
                              ['sleep_duration_hours', form.sleep_duration_hours],
                              ['water_intake_goal_ml', form.water_intake_goal_ml]]) {
      if (val !== '') payload[key] = Number(val)
    }
    try {
      const updated = await profileService.update(payload)
      setData(updated)
      setSaved(true)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const bind = (id, lbl, type = 'text', extra = {}) => (
    <Field id={id} label={lbl}>
      <input id={id} type={type} value={form[id]} onChange={set(id)} className={inputClass(false)} {...extra} />
    </Field>
  )
  const select = (id, lbl, options) => (
    <Field id={id} label={lbl}>
      <select id={id} value={form[id]} onChange={set(id)} className={inputClass(false)}>
        <option value="">Not set</option>
        {options.map((o) => <option key={o} value={o}>{enumLabel(o)}</option>)}
      </select>
    </Field>
  )

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900">
            {activeTab === 'profile' ? 'Health profile' : 'Family & Settings'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {activeTab === 'profile'
              ? `Personal details and metrics${data?.bmi != null ? ` — current BMI: ${Number(data.bmi).toFixed(1)}` : ''}`
              : 'Manage family care profiles, caregiver access, and data ownership'}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-6 flex border-b border-slate-200 gap-6 text-sm font-semibold">
        <button
          type="button"
          onClick={() => setActiveTab('profile')}
          className={`pb-3 border-b-2 transition ${
            activeTab === 'profile' ? 'border-teal-700 text-teal-800' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          My Health Details
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('settings')}
          className={`pb-3 border-b-2 transition ${
            activeTab === 'settings' ? 'border-teal-700 text-teal-800' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Family & Settings
        </button>
      </div>

      {activeTab === 'settings' ? (
        <div className="mt-6">
          <AccountSettings />
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 space-y-8">
          {error && <Alert>{error}</Alert>}
          {saved && <Alert kind="success">Profile updated.</Alert>}

          {deviceTzNotice && (
            <div className="rounded-lg border border-teal-200 bg-teal-50 p-4 text-sm text-teal-900 flex items-center justify-between">
              <div>
                <span className="font-semibold">Detected device timezone:</span> {deviceTzNotice} (currently saved: {form.timezone || 'UTC'})
              </div>
              <button
                type="button"
                onClick={() => {
                  setForm((f) => ({ ...f, timezone: deviceTzNotice }))
                  setDeviceTzNotice(null)
                  setSaved(false)
                }}
                className="ml-4 rounded-md bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800"
              >
                Use {deviceTzNotice}
              </button>
            </div>
          )}

        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="font-display font-semibold text-slate-900">Basic information</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {bind('full_name', 'Full name')}
            {bind('phone', 'Phone', 'tel')}
            {bind('date_of_birth', 'Date of birth', 'date')}
            {select('gender', 'Gender', GENDER)}
            <Field id="timezone" label="Timezone">
              <div className="flex gap-2">
                <input
                  id="timezone"
                  type="text"
                  value={form.timezone || ''}
                  onChange={set('timezone')}
                  placeholder="e.g. UTC, Asia/Kolkata, America/New_York"
                  className={inputClass(false)}
                />
                <button
                  type="button"
                  onClick={() => {
                    try {
                      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
                      setForm((f) => ({ ...f, timezone: detected }))
                      setDeviceTzNotice(null)
                      setSaved(false)
                    } catch {
                      // fallback
                    }
                  }}
                  className="whitespace-nowrap rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
                  title="Detect device timezone"
                >
                  Detect
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-500">Controls scheduled dose alerts and appointment reminders.</p>
            </Field>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="font-display font-semibold text-slate-900">Physical measurements</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {bind('height_cm', 'Height (cm)', 'number', { min: 50, max: 250, step: '0.1' })}
            {bind('weight_kg', 'Weight (kg)', 'number', { min: 20, max: 400, step: '0.1' })}
            {bind('waist_circumference_cm', 'Waist (cm)', 'number', { min: 30, max: 250, step: '0.1' })}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="font-display font-semibold text-slate-900">Lifestyle</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {select('exercise_frequency', 'Exercise frequency', EXERCISE)}
            {bind('sleep_duration_hours', 'Average sleep (hours/night)', 'number', { min: 0, max: 24, step: '0.5' })}
            {select('smoking_status', 'Smoking status', SMOKING)}
            {select('alcohol_consumption', 'Alcohol consumption', ALCOHOL)}
            {select('cholesterol_level', 'Cholesterol level', CHOLESTEROL)}
            {bind('diet_type', 'Diet type')}
            {bind('water_intake_goal_ml', 'Daily water goal (ml)', 'number', { min: 500, max: 10000, step: '50' })}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="font-display font-semibold text-slate-900">Health background</h2>
          <p className="mt-1 text-xs text-slate-500">Separate multiple entries with commas.</p>
          <div className="mt-4 space-y-4">
            {bind('allergies', 'Allergies')}
            {bind('existing_conditions', 'Existing conditions')}
            {bind('family_history', 'Family history')}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="font-display font-semibold text-slate-900">Emergency contact</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {bind('emergency_contact_name', 'Name')}
            {bind('emergency_contact_phone', 'Phone', 'tel')}
          </div>
        </section>

        <SubmitButton loading={saving} loadingText="Saving…">Save profile</SubmitButton>
        </form>
      )}
    </div>
  )
}
