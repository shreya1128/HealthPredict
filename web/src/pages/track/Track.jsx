import { useState } from 'react'
import { Activity, Droplet, Mic, Moon, TrendingUp, UtensilsCrossed, Watch } from 'lucide-react'
import ExerciseTab from './ExerciseTab'
import SleepTab from './SleepTab'
import HydrationTab from './HydrationTab'
import NutritionTab from './NutritionTab'
import WearablesTab from './WearablesTab'
import CorrelationsTab from './CorrelationsTab'
import VoiceEntryModal from '../../components/voice/VoiceEntryModal'

const SHOW_DEMO = import.meta.env.VITE_ENABLE_DEMO === 'true'

const TABS = [
  { id: 'exercise', label: 'Exercise', icon: Activity, Component: ExerciseTab },
  { id: 'sleep', label: 'Sleep', icon: Moon, Component: SleepTab },
  { id: 'hydration', label: 'Hydration', icon: Droplet, Component: HydrationTab },
  { id: 'nutrition', label: 'Nutrition', icon: UtensilsCrossed, Component: NutritionTab },
  ...(SHOW_DEMO ? [{ id: 'wearables', label: 'Ingestion Simulator (Demo)', icon: Watch, Component: WearablesTab }] : []),
  { id: 'correlations', label: 'Correlations', icon: TrendingUp, Component: CorrelationsTab },
]

export default function Track() {
  const [active, setActive] = useState('exercise')
  const [isVoiceOpen, setIsVoiceOpen] = useState(false)
  const activeTabObj = TABS.find((t) => t.id === active) || TABS[0]
  const ActiveComponent = activeTabObj.Component

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-bold text-slate-900">Track your wellness</h1>
        <button
          onClick={() => setIsVoiceOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 text-xs font-semibold transition-colors"
        >
          <Mic className="w-3.5 h-3.5 text-teal-600" /> Voice Entry
        </button>
      </div>

      <div className="mt-6 flex gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-white p-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setActive(id)}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition ${
              active === id ? 'bg-teal-600 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}>
            <Icon className="h-4 w-4" aria-hidden="true" /> {label}
          </button>
        ))}
      </div>
      <div className="mt-6"><ActiveComponent /></div>

      <VoiceEntryModal
        isOpen={isVoiceOpen}
        onClose={() => setIsVoiceOpen(false)}
        onSaved={() => {
          // Re-render active tab upon voice entry confirmation
          setActive((prev) => prev)
        }}
      />
    </div>
  )
}
