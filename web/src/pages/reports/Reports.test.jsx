// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Reports from './Reports'
import { reportService } from '../../services/dashboardService'

vi.mock('../../services/dashboardService', () => ({
  reportService: {
    weekly: vi.fn(),
    history: vi.fn(),
    downloadPdf: vi.fn(),
  },
}))

afterEach(cleanup)

const mockCurrentReport = {
  id: 101,
  week_start_date: '2026-10-05',
  week_end_date: '2026-10-11',
  average_health_score: 84,
  weight_change_kg: -0.5,
  total_exercise_minutes: 180,
  average_sleep_duration: 7.5,
  average_hydration_ml: 2200,
  medicine_adherence_percent: 95,
  goals_progress_percent: 80,
  significant_changes: [
    { metric: 'exercise', message: 'Exercise increased by 30 mins' },
  ],
  recommendations: [
    'Maintain your hydration routine',
  ],
}

const mockPastReport = {
  id: 99,
  week_start_date: '2026-09-28',
  week_end_date: '2026-10-04',
  average_health_score: 78,
  weight_change_kg: 0.2,
  total_exercise_minutes: 120,
  average_sleep_duration: 6.8,
  average_hydration_ml: 1900,
  medicine_adherence_percent: 88,
  goals_progress_percent: 60,
  significant_changes: [],
  recommendations: ['Aim for 7+ hours of sleep nightly'],
}

const mockHistory = [
  {
    id: 99,
    week_start_date: '2026-09-28',
    week_end_date: '2026-10-04',
    average_health_score: 78,
  },
]

describe('Reports page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    reportService.weekly.mockResolvedValue(mockCurrentReport)
    reportService.history.mockResolvedValue(mockHistory)
    reportService.downloadPdf.mockResolvedValue(undefined)
  })

  it('renders weekly health reports and metrics', async () => {
    render(<Reports />)

    expect(screen.getByLabelText(/loading/i)).toBeTruthy()

    await waitFor(() => {
      expect(screen.getByText('Weekly Health Reports')).toBeTruthy()
    })

    expect(screen.getByText(/Summary for 2026-10-05 – 2026-10-11/)).toBeTruthy()
    expect(screen.getAllByText('84/100').length).toBeGreaterThan(0)
    expect(screen.getByText('180 min')).toBeTruthy()
    expect(screen.getByText('7.5 h/night')).toBeTruthy()
    expect(screen.getByText('95%')).toBeTruthy()
    expect(screen.getByText('Exercise increased by 30 mins')).toBeTruthy()
    expect(screen.getByText('Maintain your hydration routine')).toBeTruthy()
  })

  it('allows downloading PDF from the main report card', async () => {
    render(<Reports />)

    await waitFor(() => {
      expect(screen.getByText('Download PDF Report')).toBeTruthy()
    })

    const downloadBtn = screen.getByText('Download PDF Report')
    fireEvent.click(downloadBtn)

    expect(reportService.downloadPdf).toHaveBeenCalledWith(101, 'healthpredict-report-2026-10-05.pdf')
  })

  it('switches between current and historical reports', async () => {
    reportService.weekly.mockImplementation((weekStart) => {
      if (weekStart === '2026-09-28') return Promise.resolve(mockPastReport)
      return Promise.resolve(mockCurrentReport)
    })

    render(<Reports />)

    await waitFor(() => {
      expect(screen.getByText('View Report')).toBeTruthy()
    })

    const viewPastBtn = screen.getByText('View Report')
    fireEvent.click(viewPastBtn)

    await waitFor(() => {
      expect(screen.getByText(/Viewing Past Week \(2026-09-28\)/)).toBeTruthy()
    })
    expect(screen.getByText(/Summary for 2026-09-28 – 2026-10-04/)).toBeTruthy()
    expect(screen.getAllByText('78/100').length).toBeGreaterThan(0)

    const returnBtn = screen.getByText('Return to Current Week')
    fireEvent.click(returnBtn)

    await waitFor(() => {
      expect(screen.getByText(/Summary for 2026-10-05 – 2026-10-11/)).toBeTruthy()
    })
  })

  it('renders empty history state when no past reports exist', async () => {
    reportService.history.mockResolvedValue([])
    render(<Reports />)

    await waitFor(() => {
      expect(screen.getByText(/No historical reports archived yet/)).toBeTruthy()
    })
  })
})
