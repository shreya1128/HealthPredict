import { useState } from 'react'
import { Alert, Spinner } from '../../components/common/Feedback'
import Pagination from '../../components/admin/Pagination'
import { useAdminData } from '../../components/admin/useAdminData'
import { adminService } from '../../services/adminService'
import { ACTION_LABELS, actionLabel, describeChange, formatDateTime } from '../../utils/adminFormat'

const PAGE_SIZE = 20
const selectClass = 'mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm'

export default function AuditLog() {
  const [page, setPage] = useState(1)
  const [action, setAction] = useState('')
  const [outcome, setOutcome] = useState('')
  const key = `${page}|${action}|${outcome}`
  const { data, error, loading, reload } = useAdminData(
    () => adminService.auditLogs({ page, page_size: PAGE_SIZE, ...(action && { action_type: action }), ...(outcome && { status: outcome }) }),
    key,
  )

  return (
    <div>
      <p className="text-sm text-slate-600">Every administrator action is recorded here, including attempts that were blocked.</p>
      <div className="mt-3 flex flex-wrap gap-3">
        <div>
          <label htmlFor="audit-action" className="block text-xs font-semibold uppercase text-slate-500">Action</label>
          <select id="audit-action" value={action} onChange={(e) => { setAction(e.target.value); setPage(1) }} className={selectClass}>
            <option value="">All actions</option>
            {Object.entries(ACTION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="audit-status" className="block text-xs font-semibold uppercase text-slate-500">Result</label>
          <select id="audit-status" value={outcome} onChange={(e) => { setOutcome(e.target.value); setPage(1) }} className={selectClass}>
            <option value="">All results</option><option value="SUCCESS">Succeeded</option><option value="FAILED">Blocked</option>
          </select>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        {loading ? <div className="flex justify-center py-12"><Spinner label="Loading audit log" /></div> : null}
        {error ? (
          <div className="space-y-2 p-4"><Alert>{error}</Alert><button type="button" onClick={reload} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50">Try again</button></div>
        ) : null}
        {data ? (
          data.items.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-500">No audit entries match these filters.</p>
          ) : (
            <table className="w-full min-w-[820px] text-sm">
              <caption className="sr-only">Administrator audit log</caption>
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>{['When', 'Administrator', 'Action', 'Target', 'Change', 'Details', 'Result', 'IP'].map((h) => <th key={h} scope="col" className="px-4 py-3">{h}</th>)}</tr>
              </thead>
              <tbody>
                {data.items.map((l) => (
                  <tr key={l.id} className="border-t border-slate-100 align-top">
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDateTime(l.created_at)}</td>
                    <td className="px-4 py-3"><p className="font-medium text-slate-900">{l.admin_name}</p><p className="text-xs text-slate-500">{l.admin_email}</p></td>
                    <td className="px-4 py-3">{actionLabel(l.action_type)}</td>
                    <td className="px-4 py-3 text-slate-600">{l.target_entity_type ? `${l.target_entity_type.toLowerCase()} #${l.target_entity_id}` : '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{describeChange(l.old_values, l.new_values) || '—'}</td>
                    <td className="max-w-[240px] px-4 py-3 text-slate-600">{l.details || '—'}</td>
                    <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${l.status === 'SUCCESS' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>{l.status === 'SUCCESS' ? 'Succeeded' : 'Blocked'}</span></td>
                    <td className="px-4 py-3 text-slate-500">{l.ip_address || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : null}
      </div>
      {data ? <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onChange={setPage} /> : null}
    </div>
  )
}
