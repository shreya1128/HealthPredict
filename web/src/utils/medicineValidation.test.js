import { describe, expect, it } from 'vitest'
import { toMedicinePayload, validateMedicineForm } from './medicineValidation'

const empty = { medicine_name: '', form: 'TABLET', frequency_unit: 'DAILY', time_of_day: '',
                start_date: '', end_date: '', dosage: '' }

describe('validateMedicineForm', () => {
  it('requires a name and start date', () => {
    const e = validateMedicineForm(empty)
    expect(e.medicine_name).toBeTruthy()
    expect(e.start_date).toBeTruthy()
  })

  it('requires time_of_day for DAILY', () => {
    const e = validateMedicineForm({ ...empty, medicine_name: 'X', start_date: '2026-01-01' })
    expect(e.time_of_day).toBeTruthy()
  })

  it('accepts valid daily times', () => {
    const e = validateMedicineForm({ ...empty, medicine_name: 'X', start_date: '2026-01-01', time_of_day: '08:00, 20:00' })
    expect(e.time_of_day).toBeUndefined()
  })

  it('rejects bad time format', () => {
    const e = validateMedicineForm({ ...empty, medicine_name: 'X', start_date: '2026-01-01', time_of_day: '8am' })
    expect(e.time_of_day).toBeTruthy()
  })

  it('rejects duplicate times', () => {
    const e = validateMedicineForm({ ...empty, medicine_name: 'X', start_date: '2026-01-01', time_of_day: '08:00, 08:00' })
    expect(e.time_of_day).toBeTruthy()
  })

  it('rejects time_of_day for AS_NEEDED', () => {
    const e = validateMedicineForm({ ...empty, medicine_name: 'X', start_date: '2026-01-01',
      frequency_unit: 'AS_NEEDED', time_of_day: '08:00' })
    expect(e.time_of_day).toBeTruthy()
  })

  it('accepts AS_NEEDED with no times', () => {
    const e = validateMedicineForm({ ...empty, medicine_name: 'X', start_date: '2026-01-01', frequency_unit: 'AS_NEEDED' })
    expect(e.time_of_day).toBeUndefined()
  })

  it('rejects end date before start date', () => {
    const e = validateMedicineForm({ ...empty, medicine_name: 'X', start_date: '2026-01-10',
      end_date: '2026-01-01', time_of_day: '08:00' })
    expect(e.end_date).toBeTruthy()
  })

  it('rejects non-positive dosage', () => {
    const e = validateMedicineForm({ ...empty, medicine_name: 'X', start_date: '2026-01-01',
      time_of_day: '08:00', dosage: '-5' })
    expect(e.dosage).toBeTruthy()
  })
})

describe('toMedicinePayload', () => {
  it('parses comma-separated times and omits blank optional fields', () => {
    const payload = toMedicinePayload({ ...empty, medicine_name: 'Metformin', start_date: '2026-01-01',
      time_of_day: '08:00, 20:00', dosage: '500' })
    expect(payload).toEqual({
      medicine_name: 'Metformin', form: 'TABLET', frequency_unit: 'DAILY',
      time_of_day: ['08:00', '20:00'], start_date: '2026-01-01', dosage: 500,
    })
  })

  it('includes optional fields when present', () => {
    const payload = toMedicinePayload({ ...empty, medicine_name: 'X', start_date: '2026-01-01',
      time_of_day: '08:00', end_date: '2026-02-01', instructions: 'with food', notes: 'n' })
    expect(payload.end_date).toBe('2026-02-01')
    expect(payload.instructions).toBe('with food')
    expect(payload.notes).toBe('n')
  })
})
