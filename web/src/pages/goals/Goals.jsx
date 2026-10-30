import { ChevronDown, ChevronUp, History, Plus, Target, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { goalService } from '../../services/goalService'
import { getErrorMessage } from '../../services/api'
import { enumLabel } from '../../utils/enumLabel'
import { Alert, Field, SubmitButton, inputClass } from '../../components/common/Feedback'

const GOAL_TYPES = ['EXERCISE', 'SLEEP', 'HYDRATION', 'WEIGHT', 'MEDICINE_ADHERENCE', 'OTHER']
const UNIT_HINTS = {
  EXERCISE: 'minutes/week', SLEEP: 'hours/night', HYDRATION: 'ml/day',
  WEIGHT: 'kg', MEDICINE_ADHERENCE: '%', OTHER: '',
}
const emptyForm = { goal_type: 'EXERCISE', target_value: '', baseline_value: '', unit: UNIT_HINTS.EXERCISE, goal_description: '' }

function ProgressBar({ percent }) {
  const color = percent >= 100 ? 'bg-emerald-500' : percent >= 50 ? 'bg-teal-500' : 'bg-amber-500'
  return (
    <div className="h-2.5 w-full rounded-full bg-slate-100">
      <div className={`h-2.5 rounded-full ${color}`} style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
    </div>
  )
}

function GoalForm({ onSaved, onCancel }) {
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  function setType(e) {
    const goal_type = e.target.value
    setForm((f) => ({ ...f, goal_type, unit: UNIT_HINTS[goal_type] }))
  }

  async function onSubmit(e) {
    e.preventDefault()
    if (!form.target_value || Number(form.target_value) <= 0) return setError('Enter a positive target value')
    setError(''); setLoading(true)
    try {
      const saved = await goalService.create({
        goal_type: form.goal_type,
        target_value: Number(form.target_value),
        baseline_value: form.baseline_value ? Number(form.baseline_value) : undefined,
        unit: form.unit || undefined,
        goal_description: form.goal_description || undefined,
      })
      onSaved(saved)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="font-display font-semibold text-slate-900">New goal</h2>
        <button type="button" onClick={onCancel} className="text-slate-400 hover:text-slate-600" aria-label="Cancel"><X className="h-5 w-5" /></button>
      </div>
      {error && <Alert>{error}</Alert>}
      <Field id="goal_type" label="Goal type">
        <select id="goal_type" value={form.goal_type} onChange={setType} className={inputClass(false)}>
          {GOAL_TYPES.map((t) => <option key={t} value={t}>{enumLabel(t)}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field id="target_value" label="Target">
          <input id="target_value" type="number" step="0.1" value={form.target_value} onChange={set('target_value')} className={inputClass(false)} />
        </Field>
        <Field id="unit" label="Unit">
          <input id="unit" value={form.unit} onChange={set('unit')} className={inputClass(false)} />
        </Field>
      </div>
      {form.goal_type === 'WEIGHT' && (
        <Field id="baseline_value" label="Starting weight (kg, optional)">
          <input
            id="baseline_value"
            type="number"
            step="0.1"
            value={form.baseline_value}
            onChange={set('baseline_value')}
            className={inputClass(false)}
            placeholder="Leave empty to use profile weight"
          />
        </Field>
      )}
      <Field id="goal_description" label="Description (optional)">
        <input id="goal_description" value={form.goal_description} onChange={set('goal_description')} className={inputClass(false)} placeholder="e.g. Reach target weight before summer" />
      </Field>
      <SubmitButton loading={loading} loadingText="Saving…">Create goal</SubmitButton>
    </form>
  )
}

function GoalCard({ goal, onChanged }) {
  const [showHistory, setShowHistory] = useState(false)
  const [historyList, setHistoryList] = useState(null)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [manualPct, setManualPct] = useState(goal.manual_percentage != null ? String(goal.manual_percentage) : '')
  const [savingManual, setSavingManual] = useState(false)
  const [manualError, setManualError] = useState('')

  async function remove() {
    if (!window.confirm('Delete this goal?')) return
    await goalService.remove(goal.id)
    onChanged(null, goal.id)
  }

  async function toggleHistory() {
    if (!showHistory && historyList === null) {
      setLoadingHistory(true)
      try {
        const rows = await goalService.history(goal.id)
        setHistoryList(rows)
      } catch {
        setHistoryList([])
      } finally {
        setLoadingHistory(false)
      }
    }
    setShowHistory((prev) => !prev)
  }

  async function handleSaveManual(e) {
    e.preventDefault()
    const pct = parseFloat(manualPct)
    if (isNaN(pct) || pct < 0 || pct > 100) {
      return setManualError('Enter a percentage between 0 and 100')
    }
    setManualError('')
    setSavingManual(true)
    try {
      await goalService.logProgress(goal.id, { percentage_complete: pct })
      onChanged({ ...goal, percentage_complete: pct, manual_percentage: pct }, null)
    } catch (err) {
      setManualError(getErrorMessage(err))
    } finally {
      setSavingManual(false)
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="flex items-center gap-1.5 font-semibold text-slate-900">
            <Target className="h-4 w-4 text-teal-600" aria-hidden="true" /> {enumLabel(goal.goal_type)}
          </p>
          {goal.goal_description && <p className="text-sm text-slate-500">{goal.goal_description}</p>}
          {goal.goal_type === 'WEIGHT' && goal.baseline_value != null && (
            <p className="text-xs text-slate-400 mt-0.5">
              Start: {goal.baseline_value} kg → Target: {Number(goal.target_value)} kg
            </p>
          )}
        </div>
        <button onClick={remove} className="rounded-lg p-1.5 text-red-500 hover:bg-red-50" aria-label="Delete goal"><Trash2 className="h-4 w-4" /></button>
      </div>

      <div className="mt-4">
        {goal.percentage_complete != null ? (
          <>
            <div className="flex justify-between text-sm text-slate-600">
              <span>
                {goal.current_value != null ? goal.current_value : 'Progress'} / {Number(goal.target_value)} {goal.unit}
              </span>
              <span className="font-semibold text-slate-900">{goal.percentage_complete}%</span>
            </div>
            <div className="mt-1.5"><ProgressBar percent={goal.percentage_complete} /></div>
          </>
        ) : (
          <p className="text-sm text-slate-500">{goal.progress_note}</p>
        )}

        {goal.progress_note && goal.percentage_complete != null && (
          <p className="mt-1.5 text-xs text-slate-400 leading-relaxed">{goal.progress_note}</p>
        )}

        {/* Custom Goal Manual Progress Logger */}
        {goal.goal_type === 'OTHER' && (
          <form onSubmit={handleSaveManual} className="mt-3.5 flex items-center gap-2 pt-2 border-t border-slate-100">
            <span className="text-xs text-slate-500">Log progress:</span>
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              value={manualPct}
              onChange={(e) => setManualPct(e.target.value)}
              placeholder="%"
              className="w-16 rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-900 focus:border-teal-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={savingManual}
              className="rounded-lg bg-teal-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {savingManual ? 'Saving…' : 'Save'}
            </button>
            {manualError && <span className="text-xs text-red-500">{manualError}</span>}
          </form>
        )}

        {/* Historical Progress Accordion */}
        <div className="mt-3 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={toggleHistory}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-700 hover:text-teal-800"
          >
            <History className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Progress history</span>
            {showHistory ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>

          {showHistory && (
            <div className="mt-2.5 space-y-1.5 text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100">
              {loadingHistory ? (
                <p className="text-slate-400">Loading history…</p>
              ) : historyList && historyList.length > 0 ? (
                historyList.map((h) => (
                  <div key={h.id} className="flex items-center justify-between py-1 border-b border-slate-100 last:border-b-0">
                    <span className="text-slate-500">{h.progress_date}</span>
                    <span className="font-semibold text-slate-800">
                      {h.progress_value != null ? `${h.progress_value} (${h.percentage_complete}%)` : `${h.percentage_complete}%`}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-slate-400">No progress snapshots logged yet.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Goals() {
  const [goals, setGoals] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [recommendations, setRecommendations] = useState([])
  const [adoptingIndex, setAdoptingIndex] = useState(null)

  useEffect(() => {
    goalService.list().then(setGoals)
    goalService.recommendations().then((res) => {
      setRecommendations(res.recommendations || [])
    }).catch(() => {})
  }, [])

  function handleSaved(saved) {
    setGoals((list) => [saved, ...list])
    setShowForm(false)
  }

  function handleChanged(updated, deletedId) {
    if (deletedId) {
      setGoals((list) => list.filter((g) => g.id !== deletedId))
    } else if (updated) {
      setGoals((list) => list.map((g) => (g.id === updated.id ? updated : g)))
    }
  }

  async function handleAdoptRecommendation(rec, index) {
    setAdoptingIndex(index)
    try {
      const created = await goalService.create({
        goal_type: rec.goal_type,
        target_value: Number(rec.target_value),
        unit: rec.unit,
        goal_description: rec.goal_description,
      })
      setGoals((prev) => [created, ...(prev || [])])
      // Filter out adopted recommendation
      setRecommendations((prev) => prev.filter((_, i) => i !== index))
    } catch (err) {
      alert(getErrorMessage(err))
    } finally {
      setAdoptingIndex(null)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900">Your Goals</h1>
          <p className="text-xs text-slate-500 mt-0.5">Track and sustain measurable lifestyle progress</p>
        </div>
        {!showForm && (
          <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 font-semibold text-white hover:bg-teal-700 shadow-sm transition text-sm">
            <Plus className="h-4 w-4" aria-hidden="true" /> New goal
          </button>
        )}
      </div>

      {/* Dynamic Personalized Goal Recommendations (Group 9: W2) */}
      {recommendations.length > 0 && (
        <div className="bg-gradient-to-r from-teal-50 via-emerald-50 to-slate-50 rounded-2xl border border-teal-100 p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-teal-900 flex items-center gap-1.5">
                <Target className="h-4 w-4 text-teal-600" />
                Personalized Goal Recommendations
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                Clinically backed targets based on your activity baseline, active prescriptions, and risk profile.
              </p>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-teal-200/80 text-teal-900">
              {recommendations.length} Suggestions
            </span>
          </div>

          <div className="grid gap-2.5 pt-1">
            {recommendations.slice(0, 3).map((rec, idx) => (
              <div key={idx} className="bg-white/90 p-3.5 rounded-xl border border-teal-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-xs text-slate-900">{rec.goal_description}</span>
                    <span className="px-2 py-0.2 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-600">
                      {rec.difficulty}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 max-w-lg">{rec.rationale}</p>
                </div>
                <button
                  type="button"
                  disabled={adoptingIndex === idx}
                  onClick={() => handleAdoptRecommendation(rec, idx)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 transition shrink-0 self-start sm:self-center disabled:opacity-50"
                >
                  {adoptingIndex === idx ? 'Adding…' : '+ Add Goal'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {showForm && <div><GoalForm onSaved={handleSaved} onCancel={() => setShowForm(false)} /></div>}

      <div className="space-y-3">
        {goals === null ? <p className="text-slate-500">Loading…</p>
          : goals.length === 0 && !showForm ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center">
              <p className="text-slate-600">No goals yet.</p>
              <button onClick={() => setShowForm(true)} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 font-semibold text-white hover:bg-teal-700 shadow-sm transition text-sm">
                <Plus className="h-4 w-4" aria-hidden="true" /> Create a goal
              </button>
            </div>
          ) : goals.map((g) => <GoalCard key={g.id} goal={g} onChanged={handleChanged} />)}
      </div>
    </div>
  )
}

