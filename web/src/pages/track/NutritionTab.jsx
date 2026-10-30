import { Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { trackingService } from '../../services/trackingService'
import { getErrorMessage } from '../../services/api'
import { Alert, Field, SubmitButton, inputClass } from '../../components/common/Feedback'
import MealPlannerSection from '../../components/nutrition/MealPlannerSection'

const MEALS = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK']
const empty = { meal_type: 'BREAKFAST', food_item: '', calories: '' }

export default function NutritionTab() {
  const [daily, setDaily] = useState(null)
  const [form, setForm] = useState(empty)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function load() {
    trackingService.nutrition.daily().then(setDaily)
  }
  useEffect(load, [])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function onSubmit(e) {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const payload = { meal_type: form.meal_type }
      if (form.food_item) payload.food_item = form.food_item
      if (form.calories) payload.calories = Number(form.calories)
      await trackingService.nutrition.create(payload)
      setForm(empty)
      load()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  async function remove(id) {
    await trackingService.nutrition.remove(id)
    load()
  }

  return (
    <div className="space-y-6">
      {daily && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Today</p>
          <p className="text-xl font-bold text-slate-900">{daily.total_calories} calories</p>
          <div className="mt-2 flex gap-2">
            {MEALS.map((m) => (
              <span key={m} className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                daily.meals_logged.includes(m) ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'
              }`}>
                {m.charAt(0) + m.slice(1).toLowerCase()}
              </span>
            ))}
          </div>
        </div>
      )}
      <form onSubmit={onSubmit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        {error && <Alert>{error}</Alert>}
        <div className="grid grid-cols-2 gap-3">
          <Field id="meal_type" label="Meal">
            <select id="meal_type" value={form.meal_type} onChange={set('meal_type')} className={inputClass(false)}>
              {MEALS.map((m) => <option key={m} value={m}>{m.charAt(0) + m.slice(1).toLowerCase()}</option>)}
            </select>
          </Field>
          <Field id="calories" label="Calories (optional)">
            <input id="calories" type="number" value={form.calories} onChange={set('calories')} className={inputClass(false)} />
          </Field>
        </div>
        <Field id="food_item" label="Food (optional)">
          <input id="food_item" value={form.food_item} onChange={set('food_item')} className={inputClass(false)} placeholder="Grilled chicken salad" />
        </Field>
        <SubmitButton loading={loading} loadingText="Saving…">Log meal</SubmitButton>
      </form>

      <div className="space-y-2">
        {daily?.entries.map((e) => (
          <div key={e.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm">
            <span>
              <span className="font-medium text-slate-800">{e.meal_type.charAt(0) + e.meal_type.slice(1).toLowerCase()}</span>
              {e.food_item && <span className="ml-2 text-slate-600">{e.food_item}</span>}
              {e.calories != null && <span className="ml-2 text-slate-500">{e.calories} cal</span>}
            </span>
            <button onClick={() => remove(e.id)} className="text-slate-400 hover:text-red-500" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
        {daily?.entries.length === 0 && <p className="text-center text-sm text-slate-500">No meals logged today.</p>}
      </div>

      <MealPlannerSection />
    </div>
  )
}
