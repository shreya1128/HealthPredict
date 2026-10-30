import { Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { trackingService } from '../../services/trackingService'
import { getErrorMessage } from '../../services/api'
import { Alert, Field, SubmitButton, inputClass } from '../../components/common/Feedback'

const INTENSITIES = ['LOW', 'MODERATE', 'HIGH']
const empty = { exercise_type: '', duration_minutes: '', intensity: 'MODERATE', calories_burned: '' }

export default function ExerciseTab() {
  const [entries, setEntries] = useState(null)
  const [weekly, setWeekly] = useState(null)
  const [form, setForm] = useState(empty)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function load() {
    Promise.all([trackingService.exercise.list(14), trackingService.exercise.weekly()])
      .then(([list, w]) => { setEntries(list); setWeekly(w) })
  }
  useEffect(load, [])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function onSubmit(e) {
    e.preventDefault()
    if (!form.exercise_type.trim()) return setError('Enter an exercise type')
    setError(''); setLoading(true)
    try {
      const payload = { exercise_type: form.exercise_type.trim(), intensity: form.intensity }
      if (form.duration_minutes) payload.duration_minutes = Number(form.duration_minutes)
      if (form.calories_burned) payload.calories_burned = Number(form.calories_burned)
      await trackingService.exercise.create(payload)
      setForm(empty)
      load()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  async function remove(id) {
    await trackingService.exercise.remove(id)
    load()
  }

  return (
    <div className="space-y-6">
      {weekly && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">This week</p>
          <p className="text-xl font-bold text-slate-900">{weekly.total_minutes} minutes</p>
          {weekly.total_calories > 0 && <p className="text-sm text-slate-500">{weekly.total_calories} calories burned</p>}
        </div>
      )}
      <form onSubmit={onSubmit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        {error && <Alert>{error}</Alert>}
        <div className="grid grid-cols-2 gap-3">
          <Field id="exercise_type" label="Activity">
            <input id="exercise_type" value={form.exercise_type} onChange={set('exercise_type')} className={inputClass(false)} placeholder="Running" />
          </Field>
          <Field id="duration_minutes" label="Minutes">
            <input id="duration_minutes" type="number" value={form.duration_minutes} onChange={set('duration_minutes')} className={inputClass(false)} placeholder="30" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field id="intensity" label="Intensity">
            <select id="intensity" value={form.intensity} onChange={set('intensity')} className={inputClass(false)}>
              {INTENSITIES.map((i) => <option key={i} value={i}>{i.charAt(0) + i.slice(1).toLowerCase()}</option>)}
            </select>
          </Field>
          <Field id="calories_burned" label="Calories (optional)">
            <input id="calories_burned" type="number" value={form.calories_burned} onChange={set('calories_burned')} className={inputClass(false)} />
          </Field>
        </div>
        <SubmitButton loading={loading} loadingText="Saving…">Log exercise</SubmitButton>
      </form>

      <div className="space-y-2">
        {entries?.map((e) => (
          <div key={e.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm">
            <span>
              <span className="font-medium text-slate-800">{e.exercise_type}</span>
              <span className="ml-2 text-slate-500">{e.duration_minutes ? `${e.duration_minutes} min · ` : ''}{e.intensity.toLowerCase()} · {e.exercise_date}</span>
            </span>
            <button onClick={() => remove(e.id)} className="text-slate-400 hover:text-red-500" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
        {entries?.length === 0 && <p className="text-center text-sm text-slate-500">No exercise logged yet.</p>}
      </div>
    </div>
  )
}
