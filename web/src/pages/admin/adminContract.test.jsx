// @vitest-environment jsdom
/**
 * Renders the REAL admin pages from responses RECORDED from a real backend run (see __fixtures__/README.md):
 * real users, real ML predictions, real admin actions. This checks the web pages against the real API shape,
 * not against hand-written mock data.
 */
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import auditJson from './__fixtures__/audit.json'
import modelJson from './__fixtures__/model.json'
import overviewJson from './__fixtures__/overview.json'
import riskJson from './__fixtures__/risk.json'
import trendsJson from './__fixtures__/trends.json'
import usageJson from './__fixtures__/usage.json'
import usersJson from './__fixtures__/users.json'

vi.mock('recharts', () => {
  const Box = ({ children }) => <div data-testid="chart">{children}</div>
  const Nothing = () => null
  return { ResponsiveContainer: Box, LineChart: Box, BarChart: Box, Line: Nothing, Bar: Box, Cell: Nothing, XAxis: Nothing, YAxis: Nothing, CartesianGrid: Nothing, Tooltip: Nothing, Legend: Nothing }
})
vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('../../services/adminService', () => ({
  adminService: { overview: vi.fn(), risk: vi.fn(), trends: vi.fn(), usage: vi.fn(), mlModel: vi.fn(), users: vi.fn(), setUserStatus: vi.fn(), auditLogs: vi.fn() },
}))
vi.mock('../../services/notificationService', () => ({ notificationService: { list: vi.fn().mockResolvedValue({ items: [], total: 0, unread: 0, page: 1, page_size: 20 }), unreadCount: vi.fn().mockResolvedValue({ unread: 0 }), refresh: vi.fn().mockResolvedValue({ created: 0 }), markRead: vi.fn(), markAllRead: vi.fn() } }))
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 999, role: 'ADMIN' }, isAdmin: true }) }))

import { adminService as svc } from '../../services/adminService'
import AuditLog from './AuditLog'
import MlModel from './MlModel'
import Overview from './Overview'
import Users from './Users'

beforeEach(() => {
  svc.overview.mockResolvedValue(overviewJson); svc.risk.mockResolvedValue(riskJson); svc.trends.mockResolvedValue(trendsJson)
  svc.usage.mockResolvedValue(usageJson); svc.mlModel.mockResolvedValue(modelJson); svc.users.mockResolvedValue(usersJson); svc.auditLogs.mockResolvedValue(auditJson)
})
afterEach(cleanup)
const ui = (n) => render(<MemoryRouter>{n}</MemoryRouter>)

describe('pages rendered from real recorded API responses', () => {
  it('Overview shows the recorded numbers', async () => {
    ui(<Overview />)
    const card = async (label) => (await screen.findByText(label)).closest('div')
    expect(within(await card('Total accounts')).getByText(String(overviewJson.users.total))).toBeTruthy()
    expect(within(await card('Active accounts')).getByText(`${overviewJson.users.inactive} deactivated`)).toBeTruthy()
    expect(within(await card('AI predictions')).getByText(String(overviewJson.assessments.predictions_total))).toBeTruthy()
    expect(await screen.findByText(`${usageJson.medication_adherence_percent.toFixed(1)}%`)).toBeTruthy()
    expect(screen.getByText(String(riskJson.average_health_score))).toBeTruthy()
    expect(screen.getAllByTestId('chart').length).toBeGreaterThan(0)
  })

  it('Users shows the recorded accounts, including the deactivated one', async () => {
    ui(<Users />)
    for (const u of usersJson.items) expect(await screen.findByRole('cell', { name: u.full_name })).toBeTruthy()
    const inactive = usersJson.items.find((u) => !u.is_active)
    expect(screen.getByRole('button', { name: new RegExp(`Reactivate ${inactive.full_name}`) })).toBeTruthy()
  })

  it('AI model page shows the recorded metrics, confusion matrix, and the long real model version without breaking', async () => {
    ui(<MlModel />)
    expect(await screen.findByText('The trained model is loaded and serving predictions.')).toBeTruthy()
    expect(screen.getByText(`${(modelJson.test_metrics.accuracy * 100).toFixed(1)}%`)).toBeTruthy()
    expect(screen.getByText(modelJson.test_metrics.roc_auc.toFixed(3))).toBeTruthy()
    expect(screen.getByText(modelJson.confusion_matrix.true_positive.toLocaleString())).toBeTruthy()
    for (const c of modelJson.comparison) expect(screen.getAllByText(new RegExp(c.name.replace(/_/g, ' '), 'i')).length).toBeGreaterThan(0)
    expect(screen.getByText(Object.keys(modelJson.usage.by_model_version)[0])).toBeTruthy()
  })

  it('Audit log shows the recorded actions, with the blocked attempt marked as blocked', async () => {
    ui(<AuditLog />)
    expect((await screen.findAllByText('Duplicate account', { selector: 'td' })).length).toBe(2)
    const table = within(screen.getByRole('table'))
    expect(table.getAllByText('Succeeded').length).toBe(auditJson.items.filter((i) => i.status === 'SUCCESS').length)
    expect(table.getAllByText('Blocked').length).toBe(auditJson.items.filter((i) => i.status === 'FAILED').length)
    expect(table.getAllByText('Active → Inactive').length).toBeGreaterThan(0)
  })
})
