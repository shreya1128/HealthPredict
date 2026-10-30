import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Alert, Spinner } from '../../components/common/Feedback'
import StatCard from '../../components/admin/StatCard'
import { useAdminData } from '../../components/admin/useAdminData'
import { adminService } from '../../services/adminService'
import { formatNumber, formatPercent, hasAnyRiskData, toRiskChartData, toTrendChartData } from '../../utils/adminFormat'

const RANGES = [14, 30, 90]

function Panel({ title, note, children }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="font-display font-semibold text-slate-900">{title}</h2>
      {note ? <p className="mt-1 text-xs text-slate-500">{note}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  )
}

function Section({ state, children }) {
  if (state.loading) return <div className="flex justify-center py-10"><Spinner label="Loading" /></div>
  if (state.error) {
    return (
      <div className="space-y-2">
        <Alert>{state.error}</Alert>
        <button type="button" onClick={state.reload} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50">Try again</button>
      </div>
    )
  }
  return children(state.data)
}

export default function Overview() {
  const [days, setDays] = useState(30)
  const overview = useAdminData(() => adminService.overview())
  const risk = useAdminData(() => adminService.risk())
  const trends = useAdminData(() => adminService.trends(days), days)
  const usage = useAdminData(() => adminService.usage(30))

  return (
    <div className="space-y-6">
      <Section state={overview}>
        {(o) => (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Total accounts" value={formatNumber(o.users.total)} hint={`${formatNumber(o.users.admins)} admin${o.users.admins === 1 ? '' : 's'}`} />
            <StatCard label="Active accounts" value={formatNumber(o.users.active)} hint={`${formatNumber(o.users.inactive)} deactivated`} />
            <StatCard label="Signed in (7 days)" value={formatNumber(o.users.signed_in_last_7_days)} hint={`${formatNumber(o.users.signed_in_last_30_days)} in 30 days`} />
            <StatCard label="New accounts (30 days)" value={formatNumber(o.users.new_last_30_days)} hint={`${formatNumber(o.users.new_last_7_days)} in 7 days`} />
            <StatCard label="Assessments (30 days)" value={formatNumber(o.assessments.last_30_days)} hint={`${formatNumber(o.assessments.total)} in total`} />
            <StatCard label="AI predictions" value={formatNumber(o.assessments.predictions_total)} hint="Saved with assessments" />
            <StatCard label="Never signed in" value={formatNumber(o.users.never_signed_in)} />
            <StatCard label="Signed in (30 days)" value={formatNumber(o.users.signed_in_last_30_days)} hint="Counts logins, not token refreshes" />
          </div>
        )}
      </Section>

      <Panel title="Activity over time" note="Counts by the day each record was created (UTC). Days with no activity show as zero.">
        <div className="mb-3 flex gap-1" role="group" aria-label="Time range">
          {RANGES.map((d) => (
            <button key={d} type="button" onClick={() => setDays(d)} aria-pressed={days === d}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${days === d ? 'bg-teal-600 text-white' : 'border border-slate-300 text-slate-600 hover:bg-slate-50'}`}>{d} days</button>
          ))}
        </div>
        <Section state={trends}>
          {(t) => (
            <div className="h-72" role="img" aria-label="Line chart of new users, assessments and AI predictions per day">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={toTrendChartData(t)} margin={{ top: 5, right: 16, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} interval="preserveStartEnd" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="New users" stroke="#0d9488" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Assessments" stroke="#2563eb" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="AI predictions" stroke="#d97706" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Section>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Risk distribution" note="Each member's latest assessment, counted once. The health score and the AI estimate are separate measures.">
          <Section state={risk}>
            {(r) => !hasAnyRiskData(r) ? (
              <p className="py-8 text-center text-sm text-slate-500">No assessments have been recorded yet.</p>
            ) : (
              <>
                <div className="h-64" role="img" aria-label="Bar chart of members by risk level, health score versus AI estimate">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={toRiskChartData(r)} margin={{ top: 5, right: 16, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="Health score" fill="#0d9488" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="AI estimate" fill="#2563eb" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div><dt className="text-slate-500">Members with an assessment</dt><dd className="font-semibold">{formatNumber(r.members_with_assessment)}</dd></div>
                  <div><dt className="text-slate-500">Without any assessment</dt><dd className="font-semibold">{formatNumber(r.members_without_assessment)}</dd></div>
                  <div><dt className="text-slate-500">Average health score</dt><dd className="font-semibold">{r.average_health_score ?? 'No data'}</dd></div>
                  <div><dt className="text-slate-500">Members with an AI estimate</dt><dd className="font-semibold">{formatNumber(r.members_with_ml_prediction)}</dd></div>
                </dl>
              </>
            )}
          </Section>
        </Panel>

        <Panel title="Feature usage (last 30 days)" note="Records created, and how many different people created them.">
          <Section state={usage}>
            {(u) => (
              <>
                <table className="w-full text-sm">
                  <caption className="sr-only">Feature usage in the last 30 days</caption>
                  <thead><tr className="text-left text-xs uppercase text-slate-500"><th scope="col" className="pb-2">Feature</th><th scope="col" className="pb-2 text-right">Records</th><th scope="col" className="pb-2 text-right">People</th></tr></thead>
                  <tbody>
                    {u.features.map((f) => (
                      <tr key={f.feature} className="border-t border-slate-100"><th scope="row" className="py-2 text-left font-normal text-slate-700">{f.feature}</th><td className="py-2 text-right">{formatNumber(f.records)}</td><td className="py-2 text-right">{formatNumber(f.users)}</td></tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm">
                  <p className="font-semibold text-slate-800">Medication adherence across active members</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">{formatPercent(u.medication_adherence_percent)}</p>
                  <p className="text-xs text-slate-500">
                    {u.medication_scheduled === 0 ? 'No doses were scheduled in this period.' : `${formatNumber(u.medication_taken)} taken of ${formatNumber(u.medication_scheduled)} scheduled · ${formatNumber(u.medication_skipped)} skipped · ${formatNumber(u.medication_missed)} missed`}
                  </p>
                </div>
              </>
            )}
          </Section>
        </Panel>
      </div>
    </div>
  )
}
