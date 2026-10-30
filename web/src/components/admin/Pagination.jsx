export default function Pagination({ page, pageSize, total, onChange }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  return (
    <div className="flex items-center justify-between gap-3 pt-3 text-sm text-slate-600">
      <p aria-live="polite">{total === 0 ? 'No results' : `Showing ${from}–${to} of ${total}`}</p>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => onChange(page - 1)} disabled={page <= 1}
          className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium hover:bg-slate-50 disabled:opacity-40">Previous</button>
        <span>Page {page} of {pages}</span>
        <button type="button" onClick={() => onChange(page + 1)} disabled={page >= pages}
          className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium hover:bg-slate-50 disabled:opacity-40">Next</button>
      </div>
    </div>
  )
}
