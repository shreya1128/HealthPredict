// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import EmergencyCard from './emergency/EmergencyCard'
import Appointments from './appointments/Appointments'
import Goals from './goals/Goals'
import AccountSettings from './AccountSettings'
import MealPlannerSection from '../components/nutrition/MealPlannerSection'
import VoiceEntryModal from '../components/voice/VoiceEntryModal'

import { emergencyService } from '../services/emergencyService'
import { goalService } from '../services/goalService'
import { careProfileService } from '../services/careProfileService'
import { profileService } from '../services/healthService'
import { authService } from '../services/authService'
import { nutritionPlanService } from '../services/nutritionPlanService'
import { voiceService } from '../services/voiceService'

// Mock context
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, full_name: 'Jane Doe', email: 'jane@example.com', timezone: 'UTC' },
    logout: vi.fn(),
  }),
}))

// Mock emergencyService
vi.mock('../services/emergencyService', () => ({
  emergencyService: {
    getCard: vi.fn(),
    getCardQrSvg: vi.fn(),
    updateCard: vi.fn(),
    setVisibility: vi.fn(),
    regenerateToken: vi.fn(),
    listAppointments: vi.fn(),
    createAppointment: vi.fn(),
    deleteAppointment: vi.fn(),
    getPreVisitPrep: vi.fn(),
  },
}))

// Mock goalService
vi.mock('../services/goalService', () => ({
  goalService: {
    list: vi.fn(),
    recommendations: vi.fn().mockResolvedValue({ recommendations: [] }),
    create: vi.fn(),
    delete: vi.fn(),
    logProgress: vi.fn(),
  },
}))

// Mock careProfileService
vi.mock('../services/careProfileService', () => ({
  careProfileService: {
    list: vi.fn().mockResolvedValue([]),
    listCaregivers: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    inviteCaregiver: vi.fn(),
    delete: vi.fn(),
    revokeCaregiver: vi.fn(),
  },
}))

// Mock profileService
vi.mock('../services/healthService', () => ({
  profileService: {
    get: vi.fn(),
    update: vi.fn(),
    getActiveSessions: vi.fn().mockResolvedValue([]),
    revokeSession: vi.fn(),
    revokeAllOtherSessions: vi.fn(),
  },
}))

// Mock authService
vi.mock('../services/authService', () => ({
  authService: {
    listSessions: vi.fn().mockResolvedValue([]),
    changePassword: vi.fn(),
    changeEmail: vi.fn(),
    setupTotp: vi.fn(),
    verifyTotp: vi.fn(),
    disableTotp: vi.fn(),
    deleteAccount: vi.fn(),
  },
}))

// Mock nutritionPlanService
vi.mock('../services/nutritionPlanService', () => ({
  nutritionPlanService: {
    generateMealPlan: vi.fn(),
  },
}))

// Mock voiceService
vi.mock('../services/voiceService', () => ({
  voiceService: {
    parseTranscript: vi.fn(),
    confirmSave: vi.fn(),
  },
}))

afterEach(cleanup)

describe('EmergencyCard Screen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    emergencyService.getCard.mockResolvedValue({
      blood_type: 'O+',
      allergies: ['Penicillin', 'Peanuts'],
      chronic_conditions: ['Asthma'],
      current_medications: ['Albuterol'],
      emergency_contact_name: 'John Doe',
      emergency_contact_phone: '+15551234567',
      emergency_contact_relationship: 'Spouse',
      organ_donor: true,
      medical_notes: 'Wears medical alert bracelet',
      is_public: true,
      public_token: 'tok-12345',
      expires_at: '2026-11-25T10:00:00Z',
    })
    emergencyService.getCardQrSvg.mockResolvedValue('<svg>mock qr</svg>')
  })

  it('renders emergency details and public sharing status', async () => {
    render(<EmergencyCard />)
    await waitFor(() => {
      expect(screen.getByText(/Emergency ID Card/i)).toBeTruthy()
      expect(screen.getAllByText(/Public Sharing Active/i).length).toBeGreaterThan(0)
    })
    expect(screen.getByDisplayValue('John Doe')).toBeTruthy()
    expect(screen.getByDisplayValue('Penicillin, Peanuts')).toBeTruthy()
  })

  it('submits updated medical info', async () => {
    emergencyService.updateCard.mockResolvedValue({
      blood_type: 'A+',
      allergies: ['Latex'],
      chronic_conditions: [],
      current_medications: [],
      is_public: true,
    })

    render(<EmergencyCard />)
    await waitFor(() => expect(screen.getByText(/Emergency ID Card/i)).toBeTruthy())

    const saveBtn = screen.getByRole('button', { name: /Save Emergency Card/i })
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(emergencyService.updateCard).toHaveBeenCalled()
    })
  })
})

describe('Appointments Screen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    emergencyService.listAppointments.mockResolvedValue([
      {
        id: 1,
        doctor_name: 'Dr. Gregory House',
        specialty: 'Diagnostic Medicine',
        location: 'Princeton-Plainsboro',
        appointment_date: '2026-11-10T14:00:00Z',
        reason_for_visit: 'Chronic leg pain checkup',
        status: 'UPCOMING',
        questions: ['Should I adjust dosage?'],
      },
    ])
  })

  it('renders existing appointments list', async () => {
    render(
      <MemoryRouter>
        <Appointments />
      </MemoryRouter>
    )
    await waitFor(() => {
      expect(screen.getByText(/Doctor Visits & Appointments/i)).toBeTruthy()
      expect(screen.getByText(/Dr. Gregory House/i)).toBeTruthy()
      expect(screen.getByText(/Diagnostic Medicine/i)).toBeTruthy()
    })
  })

  it('toggles new appointment form', async () => {
    render(
      <MemoryRouter>
        <Appointments />
      </MemoryRouter>
    )
    await waitFor(() => expect(screen.getByText(/Dr. Gregory House/i)).toBeTruthy())

    const addBtn = screen.getByRole('button', { name: /Add Visit/i })
    fireEvent.click(addBtn)

    expect(screen.getByPlaceholderText(/e\.g\., Dr\. Robert Chen/i)).toBeTruthy()
  })
})

describe('Goals Screen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    goalService.list.mockResolvedValue([
      {
        id: 1,
        goal_type: 'EXERCISE',
        target_value: 150,
        current_value: 75,
        percentage_complete: 50,
        baseline_value: 0,
        unit: 'minutes/week',
        goal_description: 'Cardio workouts',
        status: 'ACTIVE',
      },
    ])
    goalService.recommendations.mockResolvedValue({ recommendations: [] })
  })

  it('renders goals and calculates progress percentage', async () => {
    render(<Goals />)
    await waitFor(() => {
      expect(screen.getByText(/Your Goals/i)).toBeTruthy()
      expect(screen.getByText(/Cardio workouts/i)).toBeTruthy()
      expect(screen.getByText(/75 \/ 150/i)).toBeTruthy()
    })
  })

  it('opens new goal modal and creates a goal', async () => {
    goalService.create.mockResolvedValue({
      id: 2,
      goal_type: 'SLEEP',
      target_value: 8,
      unit: 'hours/night',
      status: 'ACTIVE',
    })

    render(<Goals />)
    await waitFor(() => expect(screen.getByText(/Your Goals/i)).toBeTruthy())

    const newGoalBtn = screen.getByRole('button', { name: /New goal/i })
    fireEvent.click(newGoalBtn)

    expect(screen.getByRole('button', { name: /Create goal/i })).toBeTruthy()
  })
})

describe('AccountSettings Screen - Caregiver & Timezone', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    careProfileService.list.mockResolvedValue([])
    careProfileService.listCaregivers.mockResolvedValue([
      {
        id: 1,
        caregiver_email: 'caregiver.delivered@example.com',
        access_level: 'VIEW',
        status: 'ACCEPTED',
        email_delivered: true,
        email_delivery_status: 'DELIVERED',
      },
      {
        id: 2,
        caregiver_email: 'caregiver.failed@example.com',
        access_level: 'VIEW',
        status: 'PENDING',
        email_delivered: false,
        email_delivery_status: 'FAILED',
      },
    ])
    authService.listSessions.mockResolvedValue([])
    profileService.update.mockResolvedValue({ timezone: 'Asia/Kolkata' })
  })

  it('renders email delivery status pills for caregiver invitations', async () => {
    render(<AccountSettings />)
    await waitFor(() => {
      expect(screen.getByText('caregiver.delivered@example.com')).toBeTruthy()
      expect(screen.getByText('Email Delivered')).toBeTruthy()
      expect(screen.getByText('caregiver.failed@example.com')).toBeTruthy()
      expect(screen.getByText('Email Failed')).toBeTruthy()
    })
  })

  it('provides button to sync device timezone with user profile', async () => {
    render(<AccountSettings />)
    await waitFor(() => {
      expect(screen.getByText(/Account Timezone/i)).toBeTruthy()
    })

    const syncBtn = screen.getByRole('button', { name: /Sync Device Timezone/i })
    fireEvent.click(syncBtn)

    await waitFor(() => {
      expect(profileService.update).toHaveBeenCalledWith(
        expect.objectContaining({
          timezone: expect.any(String),
        })
      )
    })
  })
})

describe('MealPlannerSection Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    nutritionPlanService.generateMealPlan.mockResolvedValue({
      id: 'plan-1',
      diet_type: 'VEGETARIAN',
      target_calories_per_day: 1800,
      days: [
        {
          day: 'Monday',
          totals: { calories: 1800, protein_g: 65, carbs_g: 220, fat_g: 45 },
          breakfast: { name: 'Oatmeal with Almonds', portion: '1 bowl', calories: 400 },
          lunch: { name: 'Quinoa Vegetable Salad', portion: '1 plate', calories: 600 },
          dinner: { name: 'Lentil Curry with Rice', portion: '1 bowl', calories: 650 },
          snack: { name: 'Greek Yogurt', portion: '1 cup', calories: 150 },
        },
      ],
      grocery_list: ['Oats', 'Almonds', 'Quinoa', 'Lentils'],
    })
  })

  it('renders meal plan and allows allergy exclusion', async () => {
    render(<MealPlannerSection />)
    await waitFor(() => {
      expect(screen.getByText(/Personalized Meal Planner & Groceries/i)).toBeTruthy()
      expect(screen.getByText(/Oatmeal with Almonds/i)).toBeTruthy()
      expect(screen.getByText(/Quinoa Vegetable Salad/i)).toBeTruthy()
    })

    // Click PEANUTS allergy
    const peanutBadge = screen.getByRole('button', { name: /PEANUTS/i })
    fireEvent.click(peanutBadge)

    await waitFor(() => {
      expect(nutritionPlanService.generateMealPlan).toHaveBeenCalledWith(
        expect.objectContaining({
          allergies: ['PEANUTS'],
        })
      )
    })
  })
})

describe('VoiceEntryModal Component', () => {
  it('renders Quick Health Entry modal with vendor privacy disclaimer', () => {
    render(<VoiceEntryModal isOpen={true} onClose={vi.fn()} onSaved={vi.fn()} />)

    expect(screen.getByText(/Quick Health Entry/i)).toBeTruthy()
    expect(
      screen.getByText(/Audio is processed by your browser vendor according to their speech recognition privacy policy/i)
    ).toBeTruthy()
    expect(screen.getByPlaceholderText(/e\.g\. My weight is 70 kg\.\.\./i)).toBeTruthy()
  })

  it('parses manually entered health text', async () => {
    voiceService.parseTranscript.mockResolvedValue({
      recognized: true,
      metric_type: 'VITALS',
      structured_fields: { sleep_hours: 8, heart_rate: 72 },
    })

    render(<VoiceEntryModal isOpen={true} onClose={vi.fn()} onSaved={vi.fn()} />)

    const input = screen.getByPlaceholderText(/e\.g\. My weight is 70 kg\.\.\./i)
    fireEvent.change(input, { target: { value: 'Slept 8 hours and heart rate 72' } })

    const parseBtn = screen.getByRole('button', { name: /Parse/i })
    fireEvent.click(parseBtn)

    await waitFor(() => {
      expect(voiceService.parseTranscript).toHaveBeenCalledWith('Slept 8 hours and heart rate 72')
    })
  })
})
