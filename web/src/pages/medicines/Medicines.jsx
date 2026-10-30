import { AlertTriangle, CheckCircle2, Pause, Pill, Play, Plus, RefreshCw, ShieldAlert, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { medicineService } from '../../services/medicineService'
import { getErrorMessage } from '../../services/api'
import { toMedicinePayload, validateMedicineForm } from '../../utils/medicineValidation'
import { Alert, Field, SubmitButton, inputClass } from '../../components/common/Feedback'

const FORMS = ['TABLET', 'CAPSULE', 'LIQUID', 'INJECTION', 'PATCH', 'OTHER']
const FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY', 'AS_NEEDED']
const emptyForm = {
  medicine_name: '', dosage: '', dosage_unit: 'mg', form: 'TABLET',
  frequency_unit: 'DAILY', time_of_day: '08:00', start_date: new Date().toISOString().slice(0, 10),
  end_date: '', instructions: '', reason_for_use: '', notes: '',
  rxcui: '', quantity_on_hand: '', pills_per_dose: '1', refill_threshold_days: '7', pharmacy_note: '',
}

function MedicineForm({ onSaved, onCancel, existingMedicines = [] }) {
  const [form, setForm] = useState(emptyForm)
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState('')
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const [searching, setSearching] = useState(false)
  const [warnings, setWarnings] = useState([])
  const [checkingInteractions, setCheckingInteractions] = useState(false)

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function handleNameChange(e) {
    const val = e.target.value
    setForm((f) => ({ ...f, medicine_name: val }))
    if (val.trim().length >= 2) {
      setSearching(true)
      try {
        const results = await medicineService.searchNames(val.trim())
        setSuggestions(results || [])
      } catch {
        setSuggestions([])
      } finally {
        setSearching(false)
      }
    } else {
      setSuggestions([])
    }
  }

  function selectSuggestion(item) {
    setForm((f) => ({
      ...f,
      medicine_name: item.name,
      rxcui: item.rxcui || '',
    }))
    setSuggestions([])
    checkNewMedicineInteractions(item.name)
  }

  async function checkNewMedicineInteractions(drugName) {
    if (!existingMedicines.length || !drugName) return
    setCheckingInteractions(true)
    try {
      const activeNames = existingMedicines
        .filter((m) => m.is_active)
        .map((m) => m.medicine_name)
      const namesToCheck = [...activeNames, drugName]
      const res = await medicineService.checkInteractions(namesToCheck)
      if (res?.interactions?.length) {
        setWarnings(res.interactions)
      } else {
        setWarnings([])
      }
    } catch {
      setWarnings([])
    } finally {
      setCheckingInteractions(false)
    }
  }

  async function onSubmit(e) {
    e.preventDefault()
    const found = validateMedicineForm(form)
    setErrors(found)
    setServerError('')
    if (Object.keys(found).length) return
    setLoading(true)
    try {
      const saved = await medicineService.create(toMedicinePayload(form))
      onSaved(saved)
    } catch (err) {
      setServerError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4 rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display font-semibold text-slate-900">Add medicine</h2>
        <button type="button" onClick={onCancel} className="text-slate-400 hover:text-slate-600" aria-label="Cancel">
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {serverError && <Alert>{serverError}</Alert>}

      {/* Autocomplete Name Field */}
      <div className="relative">
        <Field id="medicine_name" label="Medicine name" error={errors.medicine_name}>
          <input
            id="medicine_name"
            value={form.medicine_name}
            onChange={handleNameChange}
            onBlur={() => {
              if (form.medicine_name && !warnings.length) {
                checkNewMedicineInteractions(form.medicine_name)
              }
            }}
            className={inputClass(errors.medicine_name)}
            placeholder="e.g. Warfarin, Aspirin, Lisinopril"
            autoComplete="off"
          />
        </Field>
        {searching && <span className="absolute right-3 top-9 text-xs text-slate-400">Searching…</span>}
        {checkingInteractions && <span className="absolute right-3 top-9 text-xs text-teal-600">Checking interactions…</span>}
        {suggestions.length > 0 && (
          <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg text-sm">
            {suggestions.map((item, idx) => (
              <li
                key={`${item.name}-${idx}`}
                onMouseDown={() => selectSuggestion(item)}
                className="cursor-pointer px-4 py-2 hover:bg-teal-50 hover:text-teal-900 flex justify-between items-center"
              >
                <span className="font-medium text-slate-800">{item.name}</span>
                {item.rxcui && <span className="text-xs text-slate-400">RxCUI: {item.rxcui}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Warnings Banner */}
      {warnings.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-900 text-sm">Potential Drug Interaction Warning</p>
              <ul className="mt-2 space-y-1 text-xs text-amber-800">
                {warnings.map((w, i) => (
                  <li key={i} className="list-disc ml-4">
                    <strong>{w.drug_a} + {w.drug_b}:</strong> {w.description}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Field id="dosage" label="Dosage (optional)" error={errors.dosage}>
          <input id="dosage" type="number" step="0.01" value={form.dosage} onChange={set('dosage')} className={inputClass(errors.dosage)} placeholder="500" />
        </Field>
        <Field id="dosage_unit" label="Unit">
          <input id="dosage_unit" value={form.dosage_unit} onChange={set('dosage_unit')} className={inputClass(false)} placeholder="mg" />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field id="form" label="Form">
          <select id="form" value={form.form} onChange={set('form')} className={inputClass(false)}>
            {FORMS.map((f) => <option key={f} value={f}>{f.charAt(0) + f.slice(1).toLowerCase()}</option>)}
          </select>
        </Field>
        <Field id="frequency_unit" label="Frequency">
          <select id="frequency_unit" value={form.frequency_unit} onChange={set('frequency_unit')} className={inputClass(false)}>
            {FREQUENCIES.map((f) => <option key={f} value={f}>{f.charAt(0) + f.slice(1).toLowerCase().replace('_', '-')}</option>)}
          </select>
        </Field>
      </div>

      {form.frequency_unit !== 'AS_NEEDED' && (
        <Field id="time_of_day" label="Times (comma-separated, 24h HH:MM)" error={errors.time_of_day}>
          <input id="time_of_day" value={form.time_of_day} onChange={set('time_of_day')} className={inputClass(errors.time_of_day)} placeholder="08:00, 20:00" />
        </Field>
      )}

      {/* Refill tracking supply fields */}
      <div className="rounded-lg bg-slate-50 p-4 border border-slate-200/80 space-y-3">
        <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Supply & Refill Tracking</p>
        <div className="grid grid-cols-3 gap-3">
          <Field id="quantity_on_hand" label="Pills on hand">
            <input id="quantity_on_hand" type="number" min="0" value={form.quantity_on_hand} onChange={set('quantity_on_hand')} className={inputClass(false)} placeholder="30" />
          </Field>
          <Field id="pills_per_dose" label="Pills per dose">
            <input id="pills_per_dose" type="number" min="1" value={form.pills_per_dose} onChange={set('pills_per_dose')} className={inputClass(false)} placeholder="1" />
          </Field>
          <Field id="refill_threshold_days" label="Alert days left">
            <input id="refill_threshold_days" type="number" min="1" value={form.refill_threshold_days} onChange={set('refill_threshold_days')} className={inputClass(false)} placeholder="7" />
          </Field>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field id="start_date" label="Start date" error={errors.start_date}>
          <input id="start_date" type="date" value={form.start_date} onChange={set('start_date')} className={inputClass(errors.start_date)} />
        </Field>
        <Field id="end_date" label="End date (optional)" error={errors.end_date}>
          <input id="end_date" type="date" value={form.end_date} onChange={set('end_date')} className={inputClass(errors.end_date)} />
        </Field>
      </div>

      <Field id="instructions" label="Instructions (optional)">
        <input id="instructions" value={form.instructions} onChange={set('instructions')} className={inputClass(false)} placeholder="Take with food" />
      </Field>

      <SubmitButton loading={loading} loadingText="Saving…">Add medicine</SubmitButton>
    </form>
  )
}

function MedicineCard({ medicine, onChanged }) {
  const [busy, setBusy] = useState(false)
  const [refillOpen, setRefillOpen] = useState(false)
  const [refillQty, setRefillQty] = useState('30')

  async function toggleActive() {
    setBusy(true)
    try {
      const updated = await medicineService.update(medicine.id, { is_active: !medicine.is_active })
      onChanged(updated)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!window.confirm(`Delete ${medicine.medicine_name}? This removes its full schedule and history.`)) return
    setBusy(true)
    try {
      await medicineService.remove(medicine.id)
      onChanged(null, medicine.id)
    } finally {
      setBusy(false)
    }
  }

  async function handleRefill(e) {
    e.preventDefault()
    const qty = parseInt(refillQty, 10)
    if (!qty || qty <= 0) return
    setBusy(true)
    try {
      const updated = await medicineService.refill(medicine.id, qty)
      onChanged(updated)
      setRefillOpen(false)
    } finally {
      setBusy(false)
    }
  }

  const isLowSupply = medicine.days_left != null && medicine.days_left <= (medicine.refill_threshold_days || 7)

  return (
    <div className={`rounded-xl border bg-white p-5 ${medicine.is_active ? 'border-slate-200' : 'border-slate-200 opacity-60'}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-teal-50 text-teal-600">
            <Pill className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <Link to={`/medicines/${medicine.id}`} className="font-semibold text-slate-900 hover:underline">
              {medicine.medicine_name}
            </Link>
            <p className="text-sm text-slate-500">
              {medicine.dosage ? `${medicine.dosage}${medicine.dosage_unit || ''} · ` : ''}
              {medicine.frequency_unit === 'AS_NEEDED' ? 'As needed' : `${medicine.frequency_unit.toLowerCase()} at ${medicine.time_of_day.join(', ')}`}
            </p>

            {/* Refill supply info */}
            {medicine.quantity_on_hand != null && (
              <div className="mt-2 flex items-center gap-2">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                  isLowSupply ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'
                }`}>
                  {medicine.days_left != null ? `${medicine.days_left} days left` : `${medicine.quantity_on_hand} left`}
                </span>
                <button
                  type="button"
                  onClick={() => setRefillOpen((o) => !o)}
                  className="text-xs text-teal-700 hover:underline font-medium"
                >
                  I refilled
                </button>
              </div>
            )}

            {!medicine.is_active && <p className="mt-1 text-xs font-medium text-amber-600">Paused</p>}
          </div>
        </div>
        <div className="flex gap-1">
          <button onClick={toggleActive} disabled={busy} title={medicine.is_active ? 'Pause' : 'Resume'}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50">
            {medicine.is_active ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
          </button>
          <button onClick={remove} disabled={busy} title="Delete" className="rounded-lg p-2 text-red-500 hover:bg-red-50 disabled:opacity-50">
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Refill mini-form */}
      {refillOpen && (
        <form onSubmit={handleRefill} className="mt-3 flex items-center gap-2 rounded-lg bg-teal-50/60 p-2.5 text-sm">
          <span className="text-xs font-medium text-teal-900">Add pills:</span>
          <input
            type="number"
            min="1"
            value={refillQty}
            onChange={(e) => setRefillQty(e.target.value)}
            className="w-20 rounded border border-teal-200 px-2 py-1 text-xs"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded bg-teal-700 px-3 py-1 text-xs font-semibold text-white hover:bg-teal-800"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setRefillOpen(false)}
            className="text-xs text-slate-500 hover:underline"
          >
            Cancel
          </button>
        </form>
      )}
    </div>
  )
}

export default function Medicines() {
  const [medicines, setMedicines] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')
  const [checkingAll, setCheckingAll] = useState(false)
  const [overallInteractions, setOverallInteractions] = useState(null)

  useEffect(() => {
    medicineService.list().then(setMedicines).catch((err) => setError(getErrorMessage(err)))
  }, [])

  function handleSaved(saved) {
    setMedicines((list) => [saved, ...(list || [])])
    setShowForm(false)
  }

  function handleChanged(updated, deletedId) {
    setMedicines((list) => deletedId
      ? list.filter((m) => m.id !== deletedId)
      : list.map((m) => (m.id === updated.id ? updated : m)))
  }

  async function checkAllMedicines() {
    if (!medicines || medicines.length < 2) return
    setCheckingAll(true)
    setError('')
    try {
      const activeNames = medicines.filter((m) => m.is_active).map((m) => m.medicine_name)
      const res = await medicineService.checkInteractions(activeNames)
      setOverallInteractions(res)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setCheckingAll(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900">Your medicines</h1>
          <p className="text-sm text-slate-500">Track doses, check clinical interactions, and manage refills.</p>
        </div>
        <div className="flex gap-2">
          {medicines && medicines.filter((m) => m.is_active).length >= 2 && (
            <button
              onClick={checkAllMedicines}
              disabled={checkingAll}
              className="inline-flex items-center gap-1.5 rounded-lg border border-teal-300 bg-white px-3 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-50"
            >
              <RefreshCw className={`h-4 w-4 ${checkingAll ? 'animate-spin' : ''}`} />
              Check my medicines
            </button>
          )}
          {!showForm && (
            <button onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 font-semibold text-white hover:bg-teal-700">
              <Plus className="h-4 w-4" aria-hidden="true" /> Add medicine
            </button>
          )}
        </div>
      </div>

      {overallInteractions && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-2.5">
              {overallInteractions.status === 'found' ? (
                <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              )}
              <div>
                <p className="font-semibold text-slate-900 text-sm">
                  {overallInteractions.status === 'found'
                    ? 'Known Interactions Detected'
                    : overallInteractions.status === 'none_found_in_source'
                    ? 'No interactions reported in FDA labels for your current medicines'
                    : 'Interaction check could not be completed right now'}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">Source: {overallInteractions.source}</p>
                {overallInteractions.interactions?.length > 0 && (
                  <ul className="mt-3 space-y-2 text-xs text-slate-700">
                    {overallInteractions.interactions.map((ix, idx) => (
                      <li key={idx} className="rounded bg-slate-50 p-2.5 border border-slate-100">
                        <span className="font-semibold text-slate-900">{ix.drug_a} + {ix.drug_b}:</span> {ix.description}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <button
              onClick={() => setOverallInteractions(null)}
              className="text-slate-400 hover:text-slate-600"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {error && <div className="mt-4"><Alert>{error}</Alert></div>}
      {showForm && (
        <div className="mt-6">
          <MedicineForm
            existingMedicines={medicines || []}
            onSaved={handleSaved}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      <div className="mt-6 space-y-3">
        {medicines === null ? (
          <p className="text-slate-500">Loading…</p>
        ) : medicines.length === 0 && !showForm ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-slate-300" aria-hidden="true" />
            <p className="mt-3 text-slate-600">No medicines added yet.</p>
            <button onClick={() => setShowForm(true)} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 font-semibold text-white hover:bg-teal-700">
              <Plus className="h-4 w-4" aria-hidden="true" /> Add medicine
            </button>
          </div>
        ) : (
          medicines.map((m) => <MedicineCard key={m.id} medicine={m} onChanged={handleChanged} />)
        )}
      </div>
    </div>
  )
}
