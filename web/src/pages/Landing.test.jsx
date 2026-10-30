// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Landing from './Landing'

let authValue = { isAuthenticated: false, user: null }
vi.mock('../context/AuthContext', () => ({
  useAuth: () => authValue,
}))

afterEach(cleanup)
beforeEach(() => {
  authValue = { isAuthenticated: false, user: null }
})

function renderLanding() {
  return render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>
  )
}

describe('Landing page', () => {
  it('renders brand name and primary value proposition when unauthenticated', () => {
    authValue = { isAuthenticated: false, user: null }
    renderLanding()

    expect(screen.getAllByText('HealthPredict').length).toBeGreaterThan(0)
    // Hero headline
    expect(screen.getByText(/your medicines, numbers/i)).toBeTruthy()
    // Primary CTA buttons
    expect(screen.getAllByText(/get started/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/sign in/i).length).toBeGreaterThan(0)
  })

  it('renders all three benefit cards with plain-language headings', () => {
    authValue = { isAuthenticated: false, user: null }
    renderLanding()

    expect(screen.getByText('Never miss a medicine')).toBeTruthy()
    expect(screen.getByText('Understand your readings')).toBeTruthy()
    expect(screen.getByText('Walk into your appointment prepared')).toBeTruthy()
  })

  it('renders how-it-works section with three numbered steps', () => {
    authValue = { isAuthenticated: false, user: null }
    renderLanding()

    expect(screen.getByText('Add your medicines')).toBeTruthy()
    expect(screen.getByText('Log daily')).toBeTruthy()
    expect(screen.getByText('See your patterns')).toBeTruthy()
  })

  it('renders FAQ with accordion items', async () => {
    authValue = { isAuthenticated: false, user: null }
    renderLanding()

    expect(screen.getByText('Is this a medical app?')).toBeTruthy()
    expect(screen.getByText('Is my data private?')).toBeTruthy()

    // Click FAQ item to expand
    fireEvent.click(screen.getByText('Is this a medical app?'))
    expect(screen.getByText(/HealthPredict is a personal wellness tracker/i)).toBeTruthy()
  })

  it('renders medical disclaimer in footer', () => {
    authValue = { isAuthenticated: false, user: null }
    renderLanding()

    expect(screen.getByText(/Medical disclaimer/i)).toBeTruthy()
    expect(screen.getByText(/personal wellness tracking only/i)).toBeTruthy()
  })

  it('shows "Go to app" when user is authenticated, hides header sign-in link', () => {
    authValue = { isAuthenticated: true, user: { full_name: 'Jane Doe', role: 'USER' } }
    renderLanding()

    expect(screen.getByText('Go to app')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /sign in/i })).toBeNull()
  })

  it('renders privacy trust signals', () => {
    authValue = { isAuthenticated: false, user: null }
    renderLanding()

    expect(screen.getByText(/Protected accounts and private records/i)).toBeTruthy()
    expect(screen.getAllByText(/No adverts, no data selling/i).length).toBeGreaterThanOrEqual(1)
  })
})
