import React, { useState, useEffect, useCallback } from 'react'
import {
  Activity,
  Heart,
  Moon,
  Droplets,
  Utensils,
  AlertCircle,
  Pill,
  Calendar,
  Sparkles,
  CheckCircle,
  Clock,
  Info
} from 'lucide-react'
import { timelineService } from '../../services/timelineService'

const CATEGORY_TABS = [
  { id: 'ALL', label: 'All Events', icon: Activity },
  { id: 'ASSESSMENT', label: 'Vitals & Risk', icon: Heart },
  { id: 'EXERCISE', label: 'Exercise', icon: Activity },
  { id: 'SLEEP', label: 'Sleep', icon: Moon },
  { id: 'HYDRATION', label: 'Hydration', icon: Droplets },
  { id: 'NUTRITION', label: 'Nutrition', icon: Utensils },
  { id: 'SYMPTOM', label: 'Symptoms', icon: AlertCircle },
  { id: 'MEDICATION', label: 'Medications', icon: Pill },
  { id: 'DIABETES_SCREENING', label: 'Diabetes', icon: Activity },
  { id: 'MENSTRUAL_CYCLE', label: 'Cycle', icon: Calendar },
]

export default function HealthTimeline() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedCategory, setSelectedCategory] = useState('ALL')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const fetchTimeline = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = {}
      if (selectedCategory !== 'ALL') {
        params.categories = selectedCategory
      }
      if (startDate) params.start_date = startDate
      if (endDate) params.end_date = endDate

      const data = await timelineService.getTimeline(params)
      setEvents(data.events || [])
    } catch (err) {
      console.error('Failed to load health timeline:', err)
      setError('Unable to load health timeline. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [selectedCategory, startDate, endDate])

  useEffect(() => {
    fetchTimeline()
  }, [fetchTimeline])

  const getSourceBadge = (source) => {
    switch (source) {
      case 'MEASURED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle className="w-3 h-3" /> Measured
          </span>
        )
      case 'MODEL_ESTIMATE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200">
            <Sparkles className="w-3 h-3" /> AI Estimate
          </span>
        )
      case 'CALCULATED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
            <Clock className="w-3 h-3" /> Calculated
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-slate-50 text-slate-700 border border-slate-200">
            Self-Reported
          </span>
        )
    }
  }

  const getEventIcon = (category) => {
    switch (category) {
      case 'ASSESSMENT':
        return <Heart className="w-5 h-5 text-rose-500" />
      case 'EXERCISE':
        return <Activity className="w-5 h-5 text-indigo-500" />
      case 'SLEEP':
        return <Moon className="w-5 h-5 text-indigo-600" />
      case 'HYDRATION':
        return <Droplets className="w-5 h-5 text-cyan-500" />
      case 'NUTRITION':
        return <Utensils className="w-5 h-5 text-amber-500" />
      case 'SYMPTOM':
        return <AlertCircle className="w-5 h-5 text-amber-600" />
      case 'MEDICATION':
        return <Pill className="w-5 h-5 text-teal-600" />
      default:
        return <Activity className="w-5 h-5 text-slate-500" />
    }
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Personal Health Timeline</h1>
          <p className="text-sm text-slate-600 mt-1">
            Chronological aggregation of clinical measurements, wearable metrics, symptoms, and daily logs.
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-4">
        {/* Category Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
          {CATEGORY_TABS.map((tab) => {
            const Icon = tab.icon
            const active = selectedCategory === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setSelectedCategory(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-teal-600 text-white shadow-sm'
                    : 'bg-slate-50 text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Date Filters */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <Calendar className="w-4 h-4" /> Date Range:
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="text-xs border border-slate-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
            <span className="text-xs text-slate-400">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="text-xs border border-slate-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>
          {(startDate || endDate) && (
            <button
              onClick={() => {
                setStartDate('')
                setEndDate('')
              }}
              className="text-xs text-teal-600 hover:text-teal-700 font-medium ml-auto"
            >
              Clear dates
            </button>
          )}
        </div>
      </div>

      {/* Educational Banner */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex items-start gap-3">
        <Info className="w-4 h-4 text-teal-600 mt-0.5 shrink-0" />
        <p className="text-xs text-slate-600 leading-relaxed">
          <strong>Data Provenance Notice:</strong> The timeline explicitly labels measured clinical values, self-reported patient inputs, and statistical AI predictions. Predictive factors represent educational risk probabilities and are not clinical diagnoses.
        </p>
      </div>

      {/* Timeline Stream */}
      {loading ? (
        <div className="py-16 text-center text-slate-500">
          <div className="inline-block w-6 h-6 border-2 border-teal-600 border-t-transparent rounded-full animate-spin mb-2" />
          <p className="text-sm">Loading health timeline...</p>
        </div>
      ) : error ? (
        <div className="py-12 text-center text-rose-600 bg-rose-50 rounded-xl border border-rose-200 p-4">
          <AlertCircle className="w-8 h-8 mx-auto mb-2 text-rose-500" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      ) : events.length === 0 ? (
        <div className="py-16 text-center bg-white rounded-xl border border-slate-200 p-8 shadow-sm">
          <Activity className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-800">No health records found</h3>
          <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
            No events logged for the selected category and date window. Complete an assessment or log tracking activities to populate your timeline.
          </p>
        </div>
      ) : (
        <div className="relative pl-6 sm:pl-8 space-y-4 before:absolute before:left-3 sm:before:left-4 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-200">
          {events.map((event) => {
            const dt = new Date(event.timestamp)
            const dateStr = dt.toLocaleDateString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })
            const timeStr = dt.toLocaleTimeString(undefined, {
              hour: '2-digit',
              minute: '2-digit',
            })

            return (
              <div key={event.id} className="relative group">
                {/* Node icon on timeline spine */}
                <div className="absolute -left-6 sm:-left-8 top-3 w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-white border-2 border-slate-200 flex items-center justify-center shadow-xs group-hover:border-teal-500 transition-colors">
                  {getEventIcon(event.category)}
                </div>

                {/* Event Card */}
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs hover:shadow-sm transition-shadow">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-teal-700 uppercase tracking-wider">
                          {event.event_type.replace(/_/g, ' ')}
                        </span>
                        {getSourceBadge(event.data_source)}
                      </div>
                      <h4 className="text-base font-semibold text-slate-900 mt-1">{event.title}</h4>
                    </div>
                    <div className="text-right text-xs text-slate-500 shrink-0">
                      <div>{dateStr}</div>
                      <div>{timeStr}</div>
                    </div>
                  </div>

                  {/* Values & Metrics Grid */}
                  {event.values && Object.keys(event.values).length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {Object.entries(event.values).map(([k, v]) => {
                        if (k === 'top_factors' && Array.isArray(v)) {
                          return (
                            <div key={k} className="col-span-full bg-slate-50 rounded-lg p-2.5">
                              <span className="text-xs font-medium text-slate-600 block mb-1">Key Contributing Factors:</span>
                              <div className="flex flex-wrap gap-1.5">
                                {v.slice(0, 3).map((f, i) => (
                                  <span key={i} className="inline-flex px-2 py-0.5 rounded text-xs bg-white border border-slate-200 text-slate-700">
                                    {typeof f === 'string' ? f : `${f.feature || f.name}: ${(f.importance ? (f.importance * 100).toFixed(0) + '%' : '')}`}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )
                        }
                        return (
                          <div key={k} className="bg-slate-50/70 rounded-lg px-2.5 py-1.5 border border-slate-100">
                            <span className="text-2xs uppercase tracking-wider font-semibold text-slate-400 block">
                              {k.replace(/_/g, ' ')}
                            </span>
                            <span className="text-xs font-medium text-slate-800 truncate block">
                              {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Notes / Narrative */}
                  {event.notes && (
                    <p className="mt-2.5 text-xs text-slate-600 italic">
                      "{event.notes}"
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
