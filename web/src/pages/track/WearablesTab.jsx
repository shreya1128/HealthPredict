import { useState } from 'react'
import { CheckCircle2, RefreshCw, Trash2, Watch } from 'lucide-react'
import { trackingService } from '../../services/trackingService'
import { getErrorMessage } from '../../services/api'

export default function WearablesTab() {
  const [syncing, setSyncing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [source, setSource] = useState('apple_health')
  const [syncResult, setSyncResult] = useState(null)
  const [deleteResult, setDeleteResult] = useState(null)
  const [error, setError] = useState('')

  async function handleSimulateSync() {
    setSyncing(true)
    setError('')
    setSyncResult(null)
    setDeleteResult(null)

    const today = new Date().toISOString().slice(0, 10)
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)

    const mockPayload = {
      source,
      exercises: [
        {
          exercise_date: today,
          exercise_type: 'Brisk Outdoor Walk',
          duration_minutes: 40,
          intensity: 'MODERATE',
          calories_burned: 180,
          distance_km: 3.2,
          notes: `[DEMO SIMULATED] Ingested from ${source === 'apple_health' ? 'Apple HealthKit' : source === 'google_fit' ? 'Google Health Connect' : 'Fitbit Web API'}`,
        },
        {
          exercise_date: yesterday,
          exercise_type: 'Morning Cycling',
          duration_minutes: 30,
          intensity: 'HIGH',
          calories_burned: 240,
          distance_km: 7.5,
          notes: `[DEMO SIMULATED] Ingested from ${source}`,
        },
      ],
      sleeps: [
        {
          sleep_date: today,
          bedtime: '23:15:00',
          wake_time: '07:15:00',
          duration_hours: 8.0,
          sleep_quality: 8,
          notes: '[DEMO SIMULATED] Biometric sleep stages synced seamlessly',
        },
      ],
    }

    try {
      const res = await trackingService.wearables.sync(mockPayload)
      setSyncResult(res)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSyncing(false)
    }
  }

  async function handleDeleteSimulated() {
    setDeleting(true)
    setError('')
    setSyncResult(null)
    setDeleteResult(null)
    try {
      const res = await trackingService.wearables.deleteSimulated()
      setDeleteResult(res)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Device connection card */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <div className="h-10 w-10 rounded-xl bg-teal-50 flex items-center justify-center text-teal-600">
            <Watch className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display font-semibold text-slate-900 text-base">Ingestion Simulator (Demo)</h2>
              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold tracking-wide uppercase">
                Developer Demo
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Simulates batch payload ingestion of physical tracker records. In production, real records are uploaded directly via mobile HealthKit and Health Connect.
            </p>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
          <strong>Note:</strong> Generating sample ingestion data here will inject simulated exercises and sleep records tagged with <code>[DEMO SIMULATED]</code> into your active profile. You can delete all simulated data below anytime.
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-50 text-red-700 text-xs border border-red-200">
            {error}
          </div>
        )}

        {deleteResult && (
          <div className="p-4 rounded-xl bg-slate-100 text-slate-800 text-xs border border-slate-200 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-slate-900 text-sm">
              <CheckCircle2 className="h-4 w-4 text-slate-600" />
              Simulated Records Cleaned Up
            </div>
            <p>{deleteResult.message}</p>
          </div>
        )}

        {syncResult && (
          <div className="p-4 rounded-xl bg-emerald-50 text-emerald-800 text-xs border border-emerald-200 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-emerald-900 text-sm">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Sync Completed Successfully
            </div>
            <p>{syncResult.message}</p>
            <p className="text-[11px] text-emerald-700 font-medium pt-1">
              • Exercises imported: {syncResult.exercises_synced} | Sleeps imported: {syncResult.sleeps_synced}
            </p>
          </div>
        )}

        <div className="space-y-3">
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
            Select Wearable Source
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { id: 'apple_health', label: 'Apple Health', desc: 'HealthKit / Apple Watch' },
              { id: 'google_fit', label: 'Google Fit', desc: 'Google Health Connect' },
              { id: 'fitbit', label: 'Fitbit', desc: 'Fitbit Cloud API' },
            ].map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setSource(d.id)}
                className={`p-3.5 rounded-xl border text-left transition ${
                  source === d.id
                    ? 'border-teal-600 bg-teal-50/60 shadow-xs'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="font-semibold text-slate-900 text-xs">{d.label}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">{d.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="pt-2 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={syncing || deleting}
            onClick={handleSimulateSync}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 transition shadow-sm"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Simulating Ingestion…' : 'Simulate Sample Sync (Demo)'}
          </button>

          <button
            type="button"
            disabled={syncing || deleting}
            onClick={handleDeleteSimulated}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 disabled:opacity-50 transition"
          >
            <Trash2 className={`h-4 w-4 ${deleting ? 'animate-spin' : ''}`} />
            {deleting ? 'Deleting…' : 'Delete Simulated Records'}
          </button>
        </div>
      </div>
    </div>
  )
}
