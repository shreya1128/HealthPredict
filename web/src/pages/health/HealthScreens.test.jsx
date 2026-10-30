// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DiabetesScreening from './DiabetesScreening'
import MenstrualTracking from './MenstrualTracking'
import FattyLiverScreening from './FattyLiverScreening'
import HealthTimeline from './HealthTimeline'

import { diabetesService } from '../../services/diabetesService'
import { menstrualService } from '../../services/menstrualService'
import { fattyLiverService } from '../../services/fattyLiverService'
import { timelineService } from '../../services/timelineService'

vi.mock('../../services/diabetesService', () => ({
  diabetesService: {
    getHistory: vi.fn(),
    calculateRisk: vi.fn(),
    submitScreening: vi.fn(),
  },
}))

vi.mock('../../services/menstrualService', () => ({
  menstrualService: {
    getLogs: vi.fn(),
    getAnalytics: vi.fn(),
    createLog: vi.fn(),
    deleteLog: vi.fn(),
    evaluatePcos: vi.fn(),
    submitPcosScreening: vi.fn(),
  },
}))

vi.mock('../../services/fattyLiverService', () => ({
  fattyLiverService: {
    getHistory: vi.fn(),
    evaluate: vi.fn(),
    screen: vi.fn(),
  },
}))

vi.mock('../../services/timelineService', () => ({
  timelineService: {
    getTimeline: vi.fn(),
  },
}))

afterEach(cleanup)

describe('DiabetesScreening Screen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    diabetesService.getHistory.mockResolvedValue([])
    diabetesService.calculateRisk.mockResolvedValue({
      ada_score: 4,
      risk_category: 'LOW',
      interpretation: 'Low risk of type 2 diabetes based on ADA criteria.',
      recommendations: ['Stay physically active', 'Maintain balanced diet'],
    })
  })

  it('renders screening questionnaire and disclaimer', async () => {
    render(<DiabetesScreening />)
    expect(screen.getByText(/Type 2 Diabetes Risk Screening/i)).toBeTruthy()
    expect(screen.getByText(/not a clinical diagnosis/i)).toBeTruthy()
    await waitFor(() => expect(diabetesService.getHistory).toHaveBeenCalled())
  })

  it('updates form and submits assessment', async () => {
    diabetesService.submitScreening.mockResolvedValue({
      id: 1,
      ada_score: 5,
      risk_category: 'INCREASED',
      interpretation: 'Elevated risk detected.',
      recommendations: ['Consult your physician for fasting glucose test'],
    })
    render(<DiabetesScreening />)
    const submitBtn = screen.getByRole('button', { name: /Save Screening to Health Record/i })
    fireEvent.click(submitBtn)
    await waitFor(() => {
      expect(diabetesService.submitScreening).toHaveBeenCalled()
    })
  })
})

describe('MenstrualTracking & PCOS Screen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    menstrualService.getLogs.mockResolvedValue([
      {
        id: 1,
        start_date: '2026-10-01',
        end_date: '2026-10-05',
        flow_intensity: 'MEDIUM',
        symptoms: ['Cramps', 'Headache'],
        notes: 'Normal cycle',
      },
    ])
    menstrualService.getAnalytics.mockResolvedValue({
      average_cycle_length_days: 28,
      average_period_duration_days: 5,
      is_regular: true,
      cycle_regularity: 'REGULAR',
      next_estimated_period_start: '2026-10-29',
      estimated_fertile_window_start: '2026-10-12',
      estimated_fertile_window_end: '2026-10-17',
    })
  })

  it('renders cycle tracking log and analytics', async () => {
    render(<MenstrualTracking />)
    await waitFor(() => {
      expect(screen.getByText(/28 days/i)).toBeTruthy()
      expect(screen.getAllByText(/REGULAR/i).length).toBeGreaterThan(0)
    })
  })

  it('switches to PCOS screening tab and renders Rotterdam criteria checklist', async () => {
    render(<MenstrualTracking />)
    const pcosTab = screen.getByRole('button', { name: /PCOS Educational Screening/i })
    fireEvent.click(pcosTab)
    expect(screen.getByText(/Clinical Rotterdam Criteria Reference/i)).toBeTruthy()
  })
})

describe('FattyLiverScreening Screen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fattyLiverService.getHistory.mockResolvedValue([])
    fattyLiverService.evaluate.mockResolvedValue({
      fib4_score: 1.15,
      fib4_category: 'LOW',
      interpretation: 'FIB-4 score suggests low probability of advanced fibrosis.',
      recommendations: ['Maintain regular exercise', 'Limit alcohol intake'],
    })
  })

  it('renders fatty liver screening inputs and guidance', async () => {
    render(<FattyLiverScreening />)
    expect(screen.getByText(/Fatty Liver \(MASLD\) Risk Awareness/i)).toBeTruthy()
    expect(screen.getByText(/Metabolic & Lifestyle Risk Factors/i)).toBeTruthy()
    await waitFor(() => expect(fattyLiverService.getHistory).toHaveBeenCalled())
  })
})

describe('HealthTimeline Screen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    timelineService.getTimeline.mockResolvedValue({
      events: [
        {
          id: 'ev-1',
          category: 'ASSESSMENT',
          event_type: 'ASSESSMENT',
          data_source: 'MEASURED',
          timestamp: '2026-10-24T10:00:00Z',
          title: 'Health Assessment Completed',
          values: { health_score: 88, risk_category: 'LOW' },
        },
        {
          id: 'ev-2',
          category: 'MEDICATION',
          event_type: 'MEDICATION',
          data_source: 'MEASURED',
          timestamp: '2026-10-24T08:00:00Z',
          title: 'Medication Dose Logged',
          values: { medicine: 'Metformin', status: 'TAKEN' },
        },
      ],
      total_count: 2,
    })
  })

  it('renders chronological event feed and category filter tabs', async () => {
    render(<HealthTimeline />)
    await waitFor(() => {
      expect(screen.getByText(/Health Assessment Completed/i)).toBeTruthy()
      expect(screen.getByText(/Medication Dose Logged/i)).toBeTruthy()
    })
    expect(screen.getByText(/All Events/i)).toBeTruthy()
    expect(screen.getByText(/Vitals & Risk/i)).toBeTruthy()
  })
})
