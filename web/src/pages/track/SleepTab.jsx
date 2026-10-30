import { Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { trackingService } from '../../services/trackingService'
import { getErrorMessage } from '../../services/api'
import { Alert, Field, SubmitButton, inputClass } from '../../components/common/Feedback'

const empty = { bedtime: '23:00', wake_time: '07:00', sleep_quality: '7' }

export default function SleepTab() {
  const [entries, setEntries] = useState(null)
  const [weekly, setWeekly] = useState(null)
  const [form, setForm] = useState(empty)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function load() {
    Promise.all([trackingService.sleep.list(14), trackingService.sleep.weekly()])
      .then(([list, w]) => { setEntries(list); setWeekly(w) })
  }
  useEffect(load, [])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function onSubmit(e) {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const payload = {}
      if (form.bedtime && form.wake_time) { payload.bedtime = form.bedtime; payload.wake_time = form.wake_time }
      if (form.sleep_quality) payload.sleep_quality = Number(form.sleep_quality)
      await trackingService.sleep.create(payload)
      load()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  async function remove(id) {
    await trackingService.sleep.remove(id)
    load()
  }

  return (
    <div className="space-y-6">
      {weekly?.average_duration_hours != null && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">This week's average</p>
          <p className="text-xl font-bold text-slate-900">{weekly.average_duration_hours}h</p>
          {weekly.average_quality != null && <p className="text-sm text-slate-500">Quality: {weekly.average_quality}/10</p>}
        </div>
      )}
      <form onSubmit={onSubmit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        {error && <Alert>{error}</Alert>}
        <div className="grid grid-cols-2 gap-3">
          <Field id="bedtime" label="Bedtime">
            <input id="bedtime" type="time" value={form.bedtime} onChange={set('bedtime')} className={inputClass(false)} />
          </Field>
          <Field id="wake_time" label="Wake time">
            <input id="wake_time" type="time" value={form.wake_time} onChange={set('wake_time')} className={inputClass(false)} />
          </Field>
        </div>
        <Field id="sleep_quality" label="Sleep quality (1-10)">
          <input id="sleep_quality" type="number" min="1" max="10" value={form.sleep_quality} onChange={set('sleep_quality')} className={inputClass(false)} />
        </Field>
        <SubmitButton loading={loading} loadingText="Saving…">Log sleep</SubmitButton>
      </form>

      <div className="space-y-2">
        {entries?.map((e) => (
          <div key={e.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm">
            <span>
              <span className="font-medium text-slate-800">{e.sleep_date}</span>
              <span className="ml-2 text-slate-500">
                {e.sleep_duration_hours != null ? `${e.sleep_duration_hours}h` : 'no times'}
                {e.sleep_quality != null && ` · quality ${e.sleep_quality}/10`}
              </span>
            </span>
            <button onClick={() => remove(e.id)} className="text-slate-400 hover:text-red-500" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
        {entries?.length === 0 && <p className="text-center text-sm text-slate-500">No sleep logged yet.</p>}
      </div>
    </div>
  )
}
