import { describe, expect, it } from 'vitest'
import { enumLabel } from './enumLabel'

describe('enumLabel', () => {
  it('handles single-word values', () => expect(enumLabel('NORMAL')).toBe('Normal'))
  it('handles one underscore', () => expect(enumLabel('VERY_ACTIVE')).toBe('Very active'))
  it('handles two underscores (the bug this guards against)', () =>
    expect(enumLabel('WELL_ABOVE_NORMAL')).toBe('Well above normal'))
  it('handles every profile enum value used in the app', () => {
    const values = ['SEDENTARY', 'LIGHT', 'MODERATE', 'ACTIVE', 'VERY_ACTIVE', 'NEVER', 'FORMER',
                    'CURRENT', 'OCCASIONALLY', 'REGULARLY', 'HEAVILY', 'NORMAL', 'ABOVE_NORMAL',
                    'WELL_ABOVE_NORMAL', 'FEMALE', 'MALE', 'OTHER']
    for (const v of values) {
      expect(enumLabel(v)).not.toContain('_')
      expect(enumLabel(v)[0]).toBe(enumLabel(v)[0].toUpperCase())
    }
  })
})
