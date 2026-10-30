import { api } from './api'

export const dashboardService = {
  get: () => api.get('/dashboard').then((r) => r.data),
}

export const reportService = {
  weekly: (weekStart) => api.get('/reports/weekly', { params: weekStart ? { week_start: weekStart } : {} }).then((r) => r.data),
  history: () => api.get('/reports/weekly/history').then((r) => r.data),
  // The PDF endpoint requires auth, so a plain <a href> won't carry the token - fetch as a
  // blob with the normal authenticated client and trigger the browser download ourselves.
  async downloadPdf(reportId, filename) {
    const res = await api.get(`/reports/weekly/${reportId}/pdf`, { responseType: 'blob' })
    const url = window.URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = url
    a.download = filename || `healthpredict-report-${reportId}.pdf`
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(url)
  },
  async downloadFhir() {
    const res = await api.get('/reports/fhir/download', { responseType: 'blob' })
    const url = window.URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = url
    a.download = 'healthpredict-fhir-record.json'
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(url)
  },
}
