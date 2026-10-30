// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Register from './Register'

const registerMock = vi.fn()
const loginMock = vi.fn()

vi.mock('../../services/authService', () => ({
  authService: { register: (...a) => registerMock(...a) },
}))
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ login: (...a) => loginMock(...a), isAuthenticated: false }),
}))

const STRONG = 'Str0ng!Passw0rd'

function httpError(status, data) {
  const err = new Error('request failed')
  err.response = { status, data }
  return err
}

function Where() {
  const loc = useLocation()
  return <div data-testid="where">{loc.pathname}{loc.state?.notice ? ` | ${loc.state.notice}` : ''}</div>
}

function renderRegister() {
  return render(
    <MemoryRouter initialEntries={['/register']}>
      <Routes>
        <Route path="/register" element={<Register />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>
  )
}

const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } })

function fillValid({ password = STRONG, confirm = STRONG } = {}) {
  type('Full name', '  Asha Rao ')
  type('Email', ' asha@example.com ')
  type('Date of birth', '1990-05-20')
  type('Password', password)
  type('Confirm password', confirm)
}

const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Create account' }))

beforeEach(() => {
  registerMock.mockReset()
  loginMock.mockReset()
})
afterEach(cleanup)

describe('Register page', () => {
  it('keeps the password and confirm-password fields independent', () => {
    renderRegister()
    type('Password', STRONG)
    expect(screen.getByLabelText('Password').value).toBe(STRONG)
    expect(screen.getByLabelText('Confirm password').value).toBe('')
    type('Confirm password', 'different')
    expect(screen.getByLabelText('Password').value).toBe(STRONG)
  })

  it('shows field errors and does not call the API for an empty form', async () => {
    renderRegister()
    submit()
    expect(await screen.findByText('Enter your full name')).toBeTruthy()
    expect(screen.getByText('Enter a valid email address')).toBeTruthy()
    expect(screen.getByText('Password does not meet all requirements')).toBeTruthy()
    expect(registerMock).not.toHaveBeenCalled()
  })

  it('rejects mismatched passwords', async () => {
    renderRegister()
    fillValid({ confirm: 'Str0ng!Passw0rdX' })
    submit()
    expect(await screen.findByText('Passwords do not match')).toBeTruthy()
    expect(registerMock).not.toHaveBeenCalled()
  })

  it('rejects a weak password', async () => {
    renderRegister()
    fillValid({ password: 'password', confirm: 'password' })
    submit()
    expect(await screen.findByText('Password does not meet all requirements')).toBeTruthy()
    expect(registerMock).not.toHaveBeenCalled()
  })

  it('rejects a future date of birth', async () => {
    renderRegister()
    fillValid()
    type('Date of birth', '2999-01-01')
    submit()
    expect(await screen.findByText('Enter a valid date of birth')).toBeTruthy()
    expect(registerMock).not.toHaveBeenCalled()
  })

  it('registers with a trimmed payload, signs in, and goes to onboarding', async () => {
    registerMock.mockResolvedValue({})
    loginMock.mockResolvedValue({})
    renderRegister()
    fillValid()
    submit()
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/onboarding'))
    expect(registerMock).toHaveBeenCalledTimes(1)
    const payload = registerMock.mock.calls[0][0]
    expect(payload).toMatchObject({
      full_name: 'Asha Rao',
      email: 'asha@example.com',
      password: STRONG,
      confirm_password: STRONG,
      gender: 'OTHER',
      date_of_birth: '1990-05-20',
    })
    expect('phone' in payload).toBe(false) // empty optional field is omitted
    expect(loginMock).toHaveBeenCalledWith('asha@example.com', STRONG)
  })

  it('sends the user to sign-in with a notice when the account was created but auto sign-in fails', async () => {
    registerMock.mockResolvedValue({})
    loginMock.mockRejectedValue(httpError(500, {}))
    renderRegister()
    fillValid()
    submit()
    await waitFor(() =>
      expect(screen.getByTestId('where').textContent).toBe('/login | Account created. Please sign in.')
    )
  })

  it('shows the server message for a duplicate email and stays on the page', async () => {
    registerMock.mockRejectedValue(httpError(409, { detail: 'An account with this email already exists' }))
    renderRegister()
    fillValid()
    submit()
    expect(await screen.findByText('An account with this email already exists')).toBeTruthy()
    expect(loginMock).not.toHaveBeenCalled()
    expect(screen.queryByTestId('where')).toBeNull()
  })

  it('shows a friendly message for a server error (HTTP 500)', async () => {
    registerMock.mockRejectedValue(httpError(500, { detail: 'Internal Server Error' }))
    renderRegister()
    fillValid()
    submit()
    expect(await screen.findByText('Something went wrong on our side. Please try again shortly.')).toBeTruthy()
    expect(loginMock).not.toHaveBeenCalled()
  })

  it('shows a connection message when the server cannot be reached', async () => {
    registerMock.mockRejectedValue(new Error('Network Error')) // no .response
    renderRegister()
    fillValid()
    submit()
    expect(await screen.findByText("Can't reach the server. Check your connection and try again.")).toBeTruthy()
  })

  it('disables the button while the request is in flight, then re-enables it on failure', async () => {
    let reject
    registerMock.mockReturnValue(new Promise((_, rej) => { reject = rej }))
    renderRegister()
    fillValid()
    submit()
    const busy = await screen.findByRole('button', { name: /Creating account/ })
    expect(busy.disabled).toBe(true)
    reject(httpError(409, { detail: 'An account with this email already exists' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create account' }).disabled).toBe(false))
  })
})
