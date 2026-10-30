import React, { useState, useEffect, useCallback } from 'react'
import { ShoppingBag, Sparkles, AlertCircle, RefreshCw, Check, Info } from 'lucide-react'
import { nutritionPlanService } from '../../services/nutritionPlanService'

const ALLERGIES_LIST = ['PEANUTS', 'DAIRY', 'GLUTEN', 'EGGS', 'FISH', 'SOY', 'SESAME']

export default function MealPlannerSection() {
  const [dietType, setDietType] = useState('VEGETARIAN')
  const [selectedAllergies, setSelectedAllergies] = useState([])
  const [calorieTarget, setCalorieTarget] = useState(1800)
  const [plan, setPlan] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [activeDayIdx, setActiveDayIdx] = useState(0)

  const toggleAllergy = (allergy) => {
    setSelectedAllergies((prev) =>
      prev.includes(allergy) ? prev.filter((a) => a !== allergy) : [...prev, allergy]
    )
  }

  const handleGeneratePlan = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await nutritionPlanService.generateMealPlan({
        diet_type: dietType,
        allergies: selectedAllergies,
        calorie_target: Number(calorieTarget),
        target_days: 7,
      })
      setPlan(data)
      setActiveDayIdx(0)
    } catch (err) {
      console.error('Failed to generate meal plan:', err)
      setError('Unable to generate meal plan. Please check your network.')
    } finally {
      setLoading(false)
    }
  }, [dietType, selectedAllergies, calorieTarget])

  useEffect(() => {
    handleGeneratePlan()
  }, [handleGeneratePlan])

  return (
    <div className="space-y-6 pt-6 border-t border-slate-200">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-teal-600" /> Personalized Meal Planner & Groceries
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Balanced weekly meal ideas tailored to dietary preferences and allergies.
          </p>
        </div>
      </div>

      {/* Preferences Form */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1.5">Diet Preference</label>
            <div className="flex gap-2">
              {['VEGETARIAN', 'NON_VEGETARIAN', 'VEGAN'].map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setDietType(type)}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium border transition-colors ${
                    dietType === type
                      ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {type === 'NON_VEGETARIAN' ? 'Non-Veg' : type.charAt(0) + type.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1.5">
              Daily Target Calories ({calorieTarget} kcal)
            </label>
            <input
              type="range"
              min="1200"
              max="3000"
              step="50"
              value={calorieTarget}
              onChange={(e) => setCalorieTarget(e.target.value)}
              className="w-full accent-teal-600"
            />
          </div>
        </div>

        {/* Allergy Exclusions */}
        <div>
          <label className="text-xs font-semibold text-slate-700 block mb-1.5">Allergy Exclusions</label>
          <div className="flex flex-wrap gap-1.5">
            {ALLERGIES_LIST.map((allergy) => {
              const active = selectedAllergies.includes(allergy)
              return (
                <button
                  key={allergy}
                  type="button"
                  onClick={() => toggleAllergy(allergy)}
                  className={`text-2xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                    active
                      ? 'bg-rose-50 text-rose-700 border-rose-300 font-semibold'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {active ? `✕ Exclude ${allergy}` : `+ ${allergy}`}
                </button>
              )
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={handleGeneratePlan}
          disabled={loading}
          className="w-full sm:w-auto px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors shadow-xs ml-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Generating...' : 'Refresh Meal Plan'}
        </button>
      </div>

      {error && (
        <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-3 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {plan && plan.days && (
        <div className="space-y-4">
          {/* Day Selector */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
            {plan.days.map((d, idx) => (
              <button
                key={d.day}
                onClick={() => setActiveDayIdx(idx)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap border transition-colors ${
                  activeDayIdx === idx
                    ? 'bg-slate-800 text-white border-slate-800 shadow-xs'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {d.day}
              </button>
            ))}
          </div>

          {/* Active Day Meals */}
          {plan.days[activeDayIdx] && (
            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4 shadow-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="font-bold text-sm text-slate-900">
                  {plan.days[activeDayIdx].day}'s Recommended Meals
                </span>
                <span className="text-xs font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-100">
                  Total: {plan.days[activeDayIdx].totals.calories} kcal ({plan.days[activeDayIdx].totals.protein_g}g P / {plan.days[activeDayIdx].totals.carbs_g}g C / {plan.days[activeDayIdx].totals.fat_g}g F)
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { label: 'Breakfast', meal: plan.days[activeDayIdx].breakfast },
                  { label: 'Lunch', meal: plan.days[activeDayIdx].lunch },
                  { label: 'Snack', meal: plan.days[activeDayIdx].snack },
                  { label: 'Dinner', meal: plan.days[activeDayIdx].dinner },
                ].map(({ label, meal }) => (
                  <div key={label} className="bg-slate-50/70 border border-slate-100 rounded-lg p-3 space-y-1">
                    <span className="text-2xs uppercase tracking-wider font-bold text-slate-400 block">
                      {label}
                    </span>
                    {meal ? (
                      <div>
                        <h4 className="text-xs font-semibold text-slate-900 leading-tight">{meal.name}</h4>
                        <p className="text-2xs text-slate-500 mt-0.5">{meal.portion}</p>
                        <div className="flex items-center gap-2 mt-1.5 text-2xs font-medium text-slate-600">
                          <span className="bg-white px-1.5 py-0.5 rounded border border-slate-200">{meal.calories} kcal</span>
                          <span>{meal.protein_g}g P</span>
                          <span>{meal.carbs_g}g C</span>
                          <span>{meal.fat_g}g F</span>
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400 italic">No meal suggestion</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Grocery List */}
          {plan.grocery_list && plan.grocery_list.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2 shadow-xs">
              <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <ShoppingBag className="w-4 h-4 text-teal-600" /> Compiled Weekly Grocery Checklist ({plan.grocery_list.length} items)
              </h3>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {plan.grocery_list.map((ing) => (
                  <span
                    key={ing}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs bg-slate-50 border border-slate-200 text-slate-700"
                  >
                    <Check className="w-3 h-3 text-teal-600" /> {ing}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Educational Disclaimer */}
          <div className="bg-slate-50 rounded-lg p-3 flex items-start gap-2 border border-slate-200 text-2xs text-slate-500">
            <Info className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
            <span>{plan.disclaimer}</span>
          </div>
        </div>
      )}
    </div>
  )
}
