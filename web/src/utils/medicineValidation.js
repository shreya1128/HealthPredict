// Mirrors backend/app/schemas/medicine.py for instant client-side feedback.
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

export function validateMedicineForm(form) {
  const errors = {}
  if (!form.medicine_name || !form.medicine_name.trim()) errors.medicine_name = 'Enter a medicine name'
  if (!form.start_date) errors.start_date = 'Enter a start date'
  if (form.end_date && form.start_date && form.end_date < form.start_date) {
    errors.end_date = 'End date cannot be before the start date'
  }

  const times = (form.time_of_day || '').split(',').map((t) => t.trim()).filter(Boolean)
  if (form.frequency_unit === 'AS_NEEDED') {
    if (times.length > 0) errors.time_of_day = 'As-needed medicines should not have scheduled times'
  } else {
    if (times.length === 0) errors.time_of_day = 'Enter at least one time (e.g. 08:00)'
    else if (times.some((t) => !TIME_RE.test(t))) errors.time_of_day = 'Use 24-hour HH:MM format, e.g. 08:00'
    else if (new Set(times).size !== times.length) errors.time_of_day = 'Remove duplicate times'
  }

  if (form.dosage && (Number.isNaN(Number(form.dosage)) || Number(form.dosage) <= 0)) {
    errors.dosage = 'Enter a positive number'
  }

  return errors
}

export function toMedicinePayload(form) {
  const times = (form.time_of_day || '').split(',').map((t) => t.trim()).filter(Boolean)
  const payload = {
    medicine_name: form.medicine_name.trim(), form: form.form, frequency_unit: form.frequency_unit,
    time_of_day: times, start_date: form.start_date,
  }
  if (form.dosage) payload.dosage = Number(form.dosage)
  if (form.dosage_unit) payload.dosage_unit = form.dosage_unit
  if (form.end_date) payload.end_date = form.end_date
  if (form.instructions) payload.instructions = form.instructions
  if (form.reason_for_use) payload.reason_for_use = form.reason_for_use
  if (form.notes) payload.notes = form.notes
  if (form.rxcui) payload.rxcui = form.rxcui
  if (form.quantity_on_hand) payload.quantity_on_hand = parseInt(form.quantity_on_hand, 10)
  if (form.pills_per_dose) payload.pills_per_dose = parseInt(form.pills_per_dose, 10)
  if (form.refill_threshold_days) payload.refill_threshold_days = parseInt(form.refill_threshold_days, 10)
  if (form.pharmacy_note) payload.pharmacy_note = form.pharmacy_note
  return payload

}
