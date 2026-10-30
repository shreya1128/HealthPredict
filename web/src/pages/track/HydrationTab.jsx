import { Droplet, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { trackingService } from '../../services/trackingService'

const QUICK_AMOUNTS = [100, 250, 500]

export default function HydrationTab() {
  const [daily, setDaily] = useState(null)
  const [entries, setEntries] = useState(null)
  const [busy, setBusy] = useState(false)

  function load() {
    Promise.all([trackingService.hydration.daily(), trackingService.hydration.list(7)])
      .then(([d, list]) => { setDaily(d); setEntries(list) })
  }
  useEffect(load, [])

  async function add(ml) {
    setBusy(true)
    try {
      await trackingService.hydration.create({ water_intake_ml: ml })
      load()
    } finally {
      setBusy(false)
    }
  }

  async function remove(id) {
    await trackingService.hydration.remove(id)
    load()
  }

  const pct = daily?.percent_of_goal != null ? Math.min(100, daily.percent_of_goal) : null

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
        <Droplet className="mx-auto h-8 w-8 text-sky-500" aria-hidden="true" />
        <p className="mt-2 text-2xl font-bold text-slate-900">
          {daily ? `${(daily.total_ml / 1000).toFixed(2)} L` : '…'}
          {daily?.goal_ml && <span className="text-base font-normal text-slate-500"> / {(daily.goal_ml / 1000).toFixed(1)} L</span>}
        </p>
        {pct != null && (
          <div className="mx-auto mt-3 h-2 max-w-xs rounded-full bg-slate-100">
            <div className="h-2 rounded-full bg-sky-500" style={{ width: `${pct}%` }} />
          </div>
        )}
        <div className="mt-5 flex justify-center gap-2">
          {QUICK_AMOUNTS.map((ml) => (
            <button key={ml} onClick={() => add(ml)} disabled={busy}
              className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 font-semibold text-sky-700 hover:bg-sky-100 disabled:opacity-50">
              +{ml}ml
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {entries?.map((e) => (
          <div key={e.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm">
            <span className="font-medium text-slate-800">{e.water_intake_ml}ml <span className="font-normal text-slate-500">· {e.hydration_date}</span></span>
            <button onClick={() => remove(e.id)} className="text-slate-400 hover:text-red-500" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
        {entries?.length === 0 && <p className="text-center text-sm text-slate-500">No water logged yet.</p>}
      </div>
    </div>
  )
}
