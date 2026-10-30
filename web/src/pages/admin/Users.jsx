import { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { Alert, Spinner } from '../../components/common/Feedback'
import ConfirmDialog from '../../components/admin/ConfirmDialog'
import Pagination from '../../components/admin/Pagination'
import { useAuth } from '../../context/AuthContext'
import { getErrorMessage } from '../../services/api'
import { adminService } from '../../services/adminService'
import { formatDateTime } from '../../utils/adminFormat'

const PAGE_SIZE = 20
const selectClass = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm'

export default function Users() {
  const { user: me } = useAuth()
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [status, setStatus] = useState('')
  const [role, setRole] = useState('')
  const [page, setPage] = useState(1)
  const [version, setVersion] = useState(0)
  const [result, setResult] = useState({ items: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [pending, setPending] = useState(null) // { user, activate }
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search.trim()); setPage(1) }, 350)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    let cancelled = false
    adminService.users({ page, page_size: PAGE_SIZE, ...(debounced && { search: debounced }), ...(status && { status }), ...(role && { role }) })
      .then((r) => { if (!cancelled) { setResult(r); setError(null); setLoading(false) } })
      .catch((e) => { if (!cancelled) { setError(getErrorMessage(e)); setLoading(false) } })
    return () => { cancelled = true }
  }, [page, debounced, status, role, version])

  const closeDialog = useCallback(() => { setPending(null); setReason('') }, [])

  async function confirm() {
    setBusy(true)
    try {
      await adminService.setUserStatus(pending.user.id, pending.activate, reason.trim())
      toast.success(`${pending.user.full_name} was ${pending.activate ? 'reactivated' : 'deactivated'}.`)
      closeDialog()
      setVersion((v) => v + 1)
    } catch (e) {
      toast.error(getErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const resetFilter = (setter) => (e) => { setter(e.target.value); setPage(1) }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="user-search" className="block text-xs font-semibold uppercase text-slate-500">Search</label>
          <input id="user-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or email"
            className="mt-1 w-64 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label htmlFor="user-status" className="block text-xs font-semibold uppercase text-slate-500">Status</label>
          <select id="user-status" value={status} onChange={resetFilter(setStatus)} className={`mt-1 ${selectClass}`}>
            <option value="">All</option><option value="active">Active</option><option value="inactive">Deactivated</option>
          </select>
        </div>
        <div>
          <label htmlFor="user-role" className="block text-xs font-semibold uppercase text-slate-500">Role</label>
          <select id="user-role" value={role} onChange={resetFilter(setRole)} className={`mt-1 ${selectClass}`}>
            <option value="">All</option><option value="USER">Member</option><option value="ADMIN">Admin</option>
          </select>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        {loading ? <div className="flex justify-center py-12"><Spinner label="Loading users" /></div> : null}
        {error ? <div className="p-4"><Alert>{error}</Alert></div> : null}
        {!loading && !error ? (
          result.items.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-500">No accounts match these filters.</p>
          ) : (
            <table className="w-full min-w-[720px] text-sm">
              <caption className="sr-only">User accounts</caption>
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>{['Name', 'Email', 'Role', 'Status', 'Last sign-in', 'Joined', ''].map((h) => <th key={h || 'actions'} scope="col" className="px-4 py-3">{h || <span className="sr-only">Actions</span>}</th>)}</tr>
              </thead>
              <tbody>
                {result.items.map((u) => {
                  const isMe = me?.id === u.id
                  return (
                    <tr key={u.id} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-medium text-slate-900">{u.full_name}{isMe ? <span className="ml-2 text-xs text-slate-500">(you)</span> : null}</td>
                      <td className="px-4 py-3 text-slate-600">{u.email}</td>
                      <td className="px-4 py-3">{u.role === 'ADMIN' ? 'Admin' : 'Member'}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${u.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}>{u.is_active ? 'Active' : 'Deactivated'}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{u.last_login ? formatDateTime(u.last_login) : 'Never'}</td>
                      <td className="px-4 py-3 text-slate-600">{formatDateTime(u.created_at)}</td>
                      <td className="px-4 py-3 text-right">
                        <button type="button" disabled={isMe} title={isMe ? "You can't change your own account status" : undefined}
                          onClick={() => setPending({ user: u, activate: !u.is_active })}
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">
                          {u.is_active ? 'Deactivate' : 'Reactivate'}<span className="sr-only"> {u.full_name}</span>
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )
        ) : null}
      </div>
      {!error ? <Pagination page={page} pageSize={PAGE_SIZE} total={result.total} onChange={setPage} /> : null}

      {pending ? (
        <ConfirmDialog
          title={pending.activate ? `Reactivate ${pending.user.full_name}?` : `Deactivate ${pending.user.full_name}?`}
          confirmLabel={pending.activate ? 'Reactivate account' : 'Deactivate account'} danger={!pending.activate} busy={busy}
          onConfirm={confirm} onCancel={closeDialog}>
          <p>{pending.activate ? 'They will be able to sign in again.' : 'They will be signed out on their next request and cannot sign in until reactivated. Their data is kept.'} This action is recorded in the audit log.</p>
          <label htmlFor="status-reason" className="mt-3 block text-xs font-semibold uppercase text-slate-500">Reason (optional)</label>
          <textarea id="status-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={2}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </ConfirmDialog>
      ) : null}
    </div>
  )
}
