// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Login from './Login'

const loginMock = vi.fn()
let authState = { isAuthenticated: false }

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ login: (...a) => loginMock(...a), isAuthenticated: authState.isAuthenticated }),
}))

function httpError(status, data, code) {
  const err = new Error('request failed')
  err.response = { status, data }
  if (code) err.code = code
  return err
}

function Where() {
  const loc = useLocation()
  return <div data-testid="where">{loc.pathname}</div>
}

function renderLogin(entry = '/login') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>
  )
}

const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

beforeEach(() => {
  loginMock.mockReset()
  authState = { isAuthenticated: false }
})
afterEach(cleanup)

describe('Login page', () => {
  it('validates the email and password before calling the API', async () => {
    renderLogin()
    type('Email', 'not-an-email')
    submit()
    expect(await screen.findByText('Enter a valid email address')).toBeTruthy()
    expect(screen.getByText('Enter your password')).toBeTruthy()
    expect(loginMock).not.toHaveBeenCalled()
  })

  it('signs in with a trimmed email and goes to the dashboard', async () => {
    loginMock.mockResolvedValue({})
    renderLogin()
    type('Email', '  asha@example.com ')
    type('Password', 'Str0ng!Passw0rd')
    submit()
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/dashboard'))
    expect(loginMock).toHaveBeenCalledWith('asha@example.com', 'Str0ng!Passw0rd')
  })

  it('returns the user to the page they were trying to open', async () => {
    loginMock.mockResolvedValue({})
    render(
      <MemoryRouter initialEntries={[{ pathname: '/login', state: { from: '/medicines' } }]}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    )
    type('Email', 'asha@example.com')
    type('Password', 'Str0ng!Passw0rd')
    submit()
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/medicines'))
  })

  it('shows the server message for wrong credentials, with no retry button', async () => {
    loginMock.mockRejectedValue(httpError(401, { detail: 'Invalid email or password' }))
    renderLogin()
    type('Email', 'asha@example.com')
    type('Password', 'wrong')
    submit()
    expect(await screen.findByText('Invalid email or password')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Retry/ })).toBeNull()
    expect(screen.queryByTestId('where')).toBeNull()
  })

  it('shows a friendly message for a server error (HTTP 500), with no retry button', async () => {
    loginMock.mockRejectedValue(httpError(500, { detail: 'Internal Server Error' }))
    renderLogin()
    type('Email', 'asha@example.com')
    type('Password', 'Str0ng!Passw0rd')
    submit()
    expect(await screen.findByText('Something went wrong on our side. Please try again shortly.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Retry/ })).toBeNull()
  })

  it('shows a rate-limit message for HTTP 429', async () => {
    loginMock.mockRejectedValue(httpError(429, { detail: 'slow down' }))
    renderLogin()
    type('Email', 'asha@example.com')
    type('Password', 'Str0ng!Passw0rd')
    submit()
    expect(await screen.findByText('Too many attempts. Please wait a moment and try again.')).toBeTruthy()
  })

  it('offers Retry when the server cannot be reached, and Retry tries again', async () => {
    // no .response -> treated as a network failure
    const netErr = new Error('Network Error'); netErr.code = 'ERR_NETWORK'
    loginMock.mockRejectedValueOnce(netErr).mockResolvedValueOnce({})
    renderLogin()
    type('Email', 'asha@example.com')
    type('Password', 'Str0ng!Passw0rd')
    submit()
    expect(await screen.findByText("We can't reach the server right now. Please try again in a moment.")).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Retry/ }))
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/dashboard'))
    expect(loginMock).toHaveBeenCalledTimes(2)
  })

  it('redirects an already signed-in user to the dashboard', () => {
    authState = { isAuthenticated: true }
    renderLogin()
    expect(screen.getByTestId('where').textContent).toBe('/dashboard')
  })

  it('shows the "account created" notice passed from registration', () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/login', state: { notice: 'Account created. Please sign in.' } }]}>
        <Routes><Route path="/login" element={<Login />} /></Routes>
      </MemoryRouter>
    )
    expect(screen.getByText('Account created. Please sign in.')).toBeTruthy()
  })

  it('links to registration and password reset', () => {
    renderLogin()
    expect(screen.getByRole('link', { name: 'Create an account' }).getAttribute('href')).toBe('/register')
    expect(screen.getByRole('link', { name: 'Forgot password?' }).getAttribute('href')).toBe('/forgot-password')
  })
})

describe('Login page demo button', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('is hidden in a production build unless explicitly enabled', async () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_ENABLE_DEMO', 'false')
    vi.resetModules()
    const { default: ProdLogin } = await import('./Login')
    render(<MemoryRouter><ProdLogin /></MemoryRouter>)
    expect(screen.queryByRole('button', { name: /Try demo account/ })).toBeNull()
  })

  it('is shown when VITE_ENABLE_DEMO is true', async () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_ENABLE_DEMO', 'true')
    vi.resetModules()
    const { default: DemoLogin } = await import('./Login')
    render(<MemoryRouter><DemoLogin /></MemoryRouter>)
    expect(screen.getByRole('button', { name: /Try demo account/ })).toBeTruthy()
  })
})
