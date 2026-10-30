// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('recharts', () => {
  const Box = ({ children }) => <div data-testid="chart">{children}</div>
  const Nothing = () => null
  return { ResponsiveContainer: Box, LineChart: Box, BarChart: Box, Line: Nothing, Bar: Box, Cell: Nothing, XAxis: Nothing, YAxis: Nothing, CartesianGrid: Nothing, Tooltip: Nothing, Legend: Nothing }
})
vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('../../services/adminService', () => ({
  adminService: { overview: vi.fn(), risk: vi.fn(), trends: vi.fn(), usage: vi.fn(), mlModel: vi.fn(), users: vi.fn(), setUserStatus: vi.fn(), auditLogs: vi.fn() },
}))
const authState = { user: { id: 1, role: 'ADMIN', full_name: 'Ada Admin' }, loading: false, isAdmin: true, logout: vi.fn() }
vi.mock('../../services/notificationService', () => ({ notificationService: { list: vi.fn().mockResolvedValue({ items: [], total: 0, unread: 0, page: 1, page_size: 20 }), unreadCount: vi.fn().mockResolvedValue({ unread: 0 }), refresh: vi.fn().mockResolvedValue({ created: 0 }), markRead: vi.fn(), markAllRead: vi.fn() } }))
vi.mock('../../context/AuthContext', () => ({ useAuth: () => authState }))

import { toast } from 'react-toastify'
import ProtectedRoute from '../../components/common/ProtectedRoute'
import AppLayout from '../../layouts/AppLayout'
import { adminService as svc } from '../../services/adminService'
import AdminLayout from './AdminLayout'
import AuditLog from './AuditLog'
import MlModel from './MlModel'
import Overview from './Overview'
import Users from './Users'

const OVERVIEW = {
  users: { total: 12, active: 10, inactive: 2, admins: 1, new_last_7_days: 3, new_last_30_days: 8, signed_in_last_7_days: 5, signed_in_last_30_days: 9, never_signed_in: 2 },
  assessments: { total: 40, last_7_days: 6, last_30_days: 21, predictions_total: 15 }, generated_at: '2026-10-07T10:00:00',
}
const RISK = { members_with_assessment: 9, members_without_assessment: 2, rule_based: { LOW: 5, MODERATE: 3, HIGH: 1 }, average_health_score: 71.4, ml: { LOW: 4, MODERATE: 2, HIGH: 1 }, members_with_ml_prediction: 7, average_ml_probability: 0.41 }
const TRENDS = { days: 30, points: [{ date: '2026-10-07', new_users: 1, assessments: 2, predictions: 1 }] }
const USAGE = {
  days: 30, features: [{ feature: 'Exercise logs', records: 14, users: 4 }, { feature: 'Sleep logs', records: 0, users: 0 }],
  medication_scheduled: 20, medication_taken: 15, medication_skipped: 2, medication_missed: 3, medication_adherence_percent: 75,
}
const MODEL = {
  available: true, serving_model_loaded: true, model_name: 'gradient_boosting', trained_at_utc: '2026-10-01T09:00:00Z',
  hyperparameters: { model__n_estimators: 200 }, feature_columns: ['age', 'bmi'], dataset_counts: { rows_after_cleaning: 68000 },
  train_rows: 54000, test_rows: 13714, training_duration_seconds: 80.5,
  test_metrics: { accuracy: 0.7346, precision: 0.75, recall: 0.68, f1_score: 0.718, roc_auc: 0.8011 },
  confusion_matrix: { true_negative: 5200, false_positive: 1700, false_negative: 2100, true_positive: 4714 },
  comparison: [{ name: 'gradient_boosting', metrics: { roc_auc: { mean: 0.8, std: 0.004 }, accuracy: { mean: 0.73, std: 0.003 } } }, { name: 'logistic_regression', metrics: { roc_auc: { mean: 0.78, std: 0.005 } } }],
  usage: { predictions_total: 15, average_probability: 0.42, by_risk_level: { LOW: 8, MODERATE: 4, HIGH: 3 }, by_model_version: { 'gb-v1': 15 } }, note: null,
}
const USERS = {
  items: [
    { id: 1, full_name: 'Ada Admin', email: 'ada@x.com', role: 'ADMIN', is_active: true, email_verified: true, last_login: '2026-10-07T08:00:00', created_at: '2026-01-01T00:00:00' },
    { id: 2, full_name: 'Maya Member', email: 'maya@x.com', role: 'USER', is_active: true, email_verified: false, last_login: null, created_at: '2026-02-01T00:00:00' },
    { id: 3, full_name: 'Idle Ian', email: 'ian@x.com', role: 'USER', is_active: false, email_verified: true, last_login: '2026-03-01T00:00:00', created_at: '2026-02-02T00:00:00' },
  ], total: 3, page: 1, page_size: 20,
}
const AUDIT = {
  items: [
    { id: 9, admin_id: 1, admin_email: 'ada@x.com', admin_name: 'Ada Admin', action_type: 'USER_DEACTIVATED', target_entity_type: 'USER', target_entity_id: 3, old_values: { is_active: true }, new_values: { is_active: false }, details: 'Spam reports', ip_address: '10.0.0.1', status: 'SUCCESS', created_at: '2026-10-07T09:00:00' },
    { id: 8, admin_id: 1, admin_email: 'ada@x.com', admin_name: 'Ada Admin', action_type: 'USER_DEACTIVATED', target_entity_type: 'USER', target_entity_id: 1, old_values: null, new_values: null, details: 'Blocked: own account', ip_address: '10.0.0.1', status: 'FAILED', created_at: '2026-10-07T08:00:00' },
  ], total: 2, page: 1, page_size: 20,
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(authState, { user: { id: 1, role: 'ADMIN', full_name: 'Ada Admin' }, loading: false, isAdmin: true })
  svc.overview.mockResolvedValue(OVERVIEW); svc.risk.mockResolvedValue(RISK); svc.trends.mockResolvedValue(TRENDS); svc.usage.mockResolvedValue(USAGE)
  svc.mlModel.mockResolvedValue(MODEL); svc.users.mockResolvedValue(USERS); svc.auditLogs.mockResolvedValue(AUDIT)
})
afterEach(cleanup)

const ui = (node) => render(<MemoryRouter>{node}</MemoryRouter>)

describe('Overview', () => {
  it('shows the real counts it was given', async () => {
    ui(<Overview />)
    expect(await screen.findByText('Total accounts')).toBeTruthy()
    expect(screen.getByText('12')).toBeTruthy()
    expect(screen.getByText('2 deactivated')).toBeTruthy()
    expect(screen.getByText('Assessments (30 days)')).toBeTruthy()
    expect(screen.getByText('40 in total')).toBeTruthy()
    expect(await screen.findByText('75.0%')).toBeTruthy()
    expect(screen.getByText(/15 taken of 20 scheduled/)).toBeTruthy()
    expect(screen.getByText('71.4')).toBeTruthy()
  })

  it('says "No data" instead of 0% when no doses were scheduled, and explains an empty risk chart', async () => {
    svc.usage.mockResolvedValue({ ...USAGE, medication_scheduled: 0, medication_taken: 0, medication_skipped: 0, medication_missed: 0, medication_adherence_percent: null })
    svc.risk.mockResolvedValue({ ...RISK, members_with_assessment: 0, members_with_ml_prediction: 0, average_health_score: null })
    ui(<Overview />)
    expect(await screen.findByText('No data')).toBeTruthy()
    expect(screen.getByText('No doses were scheduled in this period.')).toBeTruthy()
    expect(await screen.findByText('No assessments have been recorded yet.')).toBeTruthy()
  })

  it('re-requests trends when the range changes', async () => {
    ui(<Overview />)
    await screen.findByText('Total accounts')
    expect(svc.trends).toHaveBeenCalledWith(30)
    fireEvent.click(screen.getByRole('button', { name: '90 days' }))
    await waitFor(() => expect(svc.trends).toHaveBeenCalledWith(90))
  })

  it('shows an error with a working retry when a section fails', async () => {
    svc.overview.mockRejectedValueOnce({ response: { status: 500, data: {} } })
    ui(<Overview />)
    expect(await screen.findByText(/Something went wrong on our side/)).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: 'Try again' })[0])
    expect(await screen.findByText('Total accounts')).toBeTruthy()
  })
})

describe('Users', () => {
  it('lists accounts with status, and never offers to change your own', async () => {
    ui(<Users />)
    expect(await screen.findByRole('cell', { name: 'Maya Member' })).toBeTruthy()
    expect(screen.getByText('Never')).toBeTruthy() // Maya has never signed in
    expect(screen.getByText('(you)')).toBeTruthy()
    const own = screen.getByRole('button', { name: /Deactivate Ada Admin/ })
    expect(own.disabled).toBe(true)
    expect(screen.getByRole('button', { name: /Deactivate Maya Member/ }).disabled).toBe(false)
    expect(screen.getByRole('button', { name: /Reactivate Idle Ian/ })).toBeTruthy()
  })

  it('deactivates only after confirmation, sends the reason, then refreshes the list', async () => {
    svc.setUserStatus.mockResolvedValue({})
    ui(<Users />)
    fireEvent.click(await screen.findByRole('button', { name: /Deactivate Maya Member/ }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Deactivate Maya Member?')).toBeTruthy()
    expect(svc.setUserStatus).not.toHaveBeenCalled()
    fireEvent.change(within(dialog).getByLabelText(/Reason/), { target: { value: 'Abuse report' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Deactivate account' }))
    await waitFor(() => expect(svc.setUserStatus).toHaveBeenCalledWith(2, false, 'Abuse report'))
    await waitFor(() => expect(toast.success).toHaveBeenCalled())
    await waitFor(() => expect(svc.users.mock.calls.length).toBeGreaterThan(1))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('Escape or Cancel closes the dialog without changing anything', async () => {
    ui(<Users />)
    fireEvent.click(await screen.findByRole('button', { name: /Deactivate Maya Member/ }))
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(svc.setUserStatus).not.toHaveBeenCalled()
  })

  it('reactivates an inactive account', async () => {
    svc.setUserStatus.mockResolvedValue({})
    ui(<Users />)
    fireEvent.click(await screen.findByRole('button', { name: /Reactivate Idle Ian/ }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Reactivate account' }))
    await waitFor(() => expect(svc.setUserStatus).toHaveBeenCalledWith(3, true, ''))
  })

  it('shows the server message when the change is refused, and keeps the dialog open', async () => {
    svc.setUserStatus.mockRejectedValue({ response: { status: 400, data: { detail: "You can't change the status of your own account." } } })
    ui(<Users />)
    fireEvent.click(await screen.findByRole('button', { name: /Deactivate Maya Member/ }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Deactivate account' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("You can't change the status of your own account."))
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('passes filters and the debounced search to the API and resets to page 1', async () => {
    ui(<Users />)
    await screen.findByRole('cell', { name: 'Maya Member' })
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'inactive' } })
    await waitFor(() => expect(svc.users).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'inactive', page: 1 })))
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'ADMIN' } })
    await waitFor(() => expect(svc.users).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'inactive', role: 'ADMIN' })))
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'maya' } })
    await waitFor(() => expect(svc.users).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'maya' })), { timeout: 2000 })
  })

  it('has an empty state and an error state', async () => {
    svc.users.mockResolvedValueOnce({ items: [], total: 0, page: 1, page_size: 20 })
    const { unmount } = ui(<Users />)
    expect(await screen.findByText('No accounts match these filters.')).toBeTruthy()
    unmount()
    svc.users.mockRejectedValueOnce({ response: { status: 403, data: { detail: 'Admin access required' } } })
    ui(<Users />)
    expect(await screen.findByText('Admin access required')).toBeTruthy()
  })
})

describe('AI model', () => {
  it('shows the real metrics, confusion matrix and which candidate was selected', async () => {
    ui(<MlModel />)
    expect(await screen.findByText('The trained model is loaded and serving predictions.')).toBeTruthy()
    expect(screen.getByText('73.5%')).toBeTruthy() // accuracy
    expect(screen.getByText('0.801')).toBeTruthy() // roc-auc
    expect(screen.getByText('5,200')).toBeTruthy() // true negatives
    expect(screen.getByText(/13,714 test cases the model never saw/)).toBeTruthy()
    expect(screen.getByText(/gradient boosting \(selected\)/i)).toBeTruthy()
    expect(screen.getByText(/differ from the test-set figures/)).toBeTruthy()
    expect(screen.getByText('gb-v1')).toBeTruthy()
  })

  it('warns when artifacts exist but the API could not load the model', async () => {
    svc.mlModel.mockResolvedValue({ ...MODEL, serving_model_loaded: false })
    ui(<MlModel />)
    expect(await screen.findByText(/could not load the model, so no new AI predictions/)).toBeTruthy()
  })

  it('reports missing artifacts honestly and shows no metrics', async () => {
    svc.mlModel.mockResolvedValue({ available: false, serving_model_loaded: false, usage: MODEL.usage, note: 'No model_info.json found. Run ml/training/train.py to create the model artifacts.' })
    ui(<MlModel />)
    expect(await screen.findByText(/No model_info.json found/)).toBeTruthy()
    expect(screen.queryByText('Test-set performance')).toBeNull()
    expect(screen.getByText('Live usage')).toBeTruthy()
  })
})

describe('Audit log', () => {
  it('renders each entry with who, what changed, and whether it succeeded or was blocked', async () => {
    ui(<AuditLog />)
    expect(await screen.findByText('Spam reports')).toBeTruthy()
    expect(within(screen.getByRole('table')).getAllByText('Account deactivated')).toHaveLength(2)
    expect(screen.getByText('Active → Inactive')).toBeTruthy()
    const table = within(screen.getByRole('table'))
    expect(table.getByText('Succeeded')).toBeTruthy()
    expect(table.getByText('Blocked')).toBeTruthy()
    expect(screen.getAllByText('ada@x.com')).toHaveLength(2)
    expect(screen.getByText('user #3')).toBeTruthy()
  })

  it('filters by action and result through the API', async () => {
    ui(<AuditLog />)
    await screen.findByText('Spam reports')
    fireEvent.change(screen.getByLabelText('Result'), { target: { value: 'FAILED' } })
    await waitFor(() => expect(svc.auditLogs).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'FAILED', page: 1 })))
    fireEvent.change(screen.getByLabelText('Action'), { target: { value: 'USER_REACTIVATED' } })
    await waitFor(() => expect(svc.auditLogs).toHaveBeenLastCalledWith(expect.objectContaining({ action_type: 'USER_REACTIVATED', status: 'FAILED' })))
  })

  it('has an empty state', async () => {
    svc.auditLogs.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20 })
    ui(<AuditLog />)
    expect(await screen.findByText('No audit entries match these filters.')).toBeTruthy()
  })
})

describe('Routing and access', () => {
  const app = (path) => (
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/dashboard" element={<p>Member dashboard</p>} />
        <Route path="/login" element={<p>Login page</p>} />
        <Route element={<ProtectedRoute role="ADMIN" />}>
          <Route element={<AppLayout />}>
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<p>Admin overview page</p>} />
              <Route path="users" element={<p>Admin users page</p>} />
            </Route>
          </Route>
        </Route>
      </Routes>
    </MemoryRouter>
  )

  it('lets an admin in and shows the Admin nav link plus section tabs', async () => {
    render(app('/admin'))
    expect(await screen.findByText('Admin overview page')).toBeTruthy()
    expect(screen.getAllByRole('link', { name: 'Admin' }).length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: 'Audit log' })).toBeTruthy()
  })

  it('sends a normal member to their dashboard, never showing admin content', async () => {
    Object.assign(authState, { user: { id: 2, role: 'USER', full_name: 'Maya' }, isAdmin: false })
    render(app('/admin/users'))
    expect(await screen.findByText('Member dashboard')).toBeTruthy()
    expect(screen.queryByText('Admin users page')).toBeNull()
  })

  it('sends a signed-out visitor to login', async () => {
    Object.assign(authState, { user: null, isAdmin: false })
    render(app('/admin'))
    expect(await screen.findByText('Login page')).toBeTruthy()
  })

  it('does not show the Admin link to members', async () => {
    Object.assign(authState, { user: { id: 2, role: 'USER', full_name: 'Maya' }, isAdmin: false })
    render(<MemoryRouter><Routes><Route element={<AppLayout />}><Route index element={<p>x</p>} /></Route></Routes></MemoryRouter>)
    expect(screen.queryByRole('link', { name: 'Admin' })).toBeNull()
    expect(screen.getAllByRole('link').length).toBeGreaterThan(3) // the normal nav is there
  })
})
