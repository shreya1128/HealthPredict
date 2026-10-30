import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Alert, Spinner } from '../../components/common/Feedback'
import StatCard from '../../components/admin/StatCard'
import { useAdminData } from '../../components/admin/useAdminData'
import { adminService } from '../../services/adminService'
import { METRIC_LABELS, confusionTotal, formatDateTime, formatNumber, metricPercent, toComparisonChartData } from '../../utils/adminFormat'

function Panel({ title, note, children }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="font-display font-semibold text-slate-900">{title}</h2>
      {note ? <p className="mt-1 text-xs text-slate-500">{note}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  )
}

function ConfusionMatrix({ cm }) {
  const cell = (label, value, tone) => (
    <div className={`rounded-lg p-3 text-center ${tone}`}>
      <p className="text-xl font-bold">{formatNumber(value)}</p>
      <p className="text-xs">{label}</p>
    </div>
  )
  return (
    <div>
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Confusion matrix on the held-out test set">
        {cell('Correctly cleared (true negative)', cm.true_negative, 'bg-emerald-50 text-emerald-900')}
        {cell('Wrongly flagged (false positive)', cm.false_positive, 'bg-amber-50 text-amber-900')}
        {cell('Missed (false negative)', cm.false_negative, 'bg-red-50 text-red-900')}
        {cell('Correctly flagged (true positive)', cm.true_positive, 'bg-emerald-50 text-emerald-900')}
      </div>
      <p className="mt-2 text-xs text-slate-500">{formatNumber(confusionTotal(cm))} test cases the model never saw during training.</p>
    </div>
  )
}

export default function MlModel() {
  const { data: m, error, loading, reload } = useAdminData(() => adminService.mlModel())

  if (loading) return <div className="flex justify-center py-12"><Spinner label="Loading model details" /></div>
  if (error) {
    return <div className="space-y-2"><Alert>{error}</Alert><button type="button" onClick={reload} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50">Try again</button></div>
  }

  const chart = toComparisonChartData(m.comparison, m.model_name)
  const ready = m.available && m.serving_model_loaded

  return (
    <div className="space-y-6">
      <div role="status" className={`rounded-lg border p-3 text-sm ${ready ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
        {ready ? 'The trained model is loaded and serving predictions.' : m.available ? 'Model artifacts exist, but the API could not load the model, so no new AI predictions are being made.' : m.note}
      </div>

      {m.available ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Selected model" value={(m.model_name || '').replace(/_/g, ' ')} hint="Best of 4 candidates" />
            <StatCard label="Trained" value={formatDateTime(m.trained_at_utc)} />
            <StatCard label="Training rows" value={formatNumber(m.train_rows)} hint={`${formatNumber(m.test_rows)} held out for testing`} />
            <StatCard label="Input features" value={formatNumber(m.feature_columns.length)} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Test-set performance" note="Measured once on rows held out from training. These are the model's real results, read from the training output.">
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {Object.entries(METRIC_LABELS).map(([k, label]) => (
                  <div key={k} className="rounded-lg bg-slate-50 p-3"><dt className="text-xs text-slate-500">{label}</dt><dd className="text-xl font-bold text-slate-900">{k === 'roc_auc' && m.test_metrics?.[k] != null ? m.test_metrics[k].toFixed(3) : metricPercent(m.test_metrics?.[k])}</dd></div>
                ))}
              </dl>
            </Panel>
            {m.confusion_matrix ? <Panel title="Confusion matrix" note="Predicted vs actual on the test set."><ConfusionMatrix cm={m.confusion_matrix} /></Panel> : null}
          </div>

          {chart.length > 0 ? (
            <Panel title="Model comparison" note="Cross-validated scores (mean ± standard deviation across folds) from the selection step. These differ from the test-set figures above because they come from a different procedure.">
              <div className="h-64" role="img" aria-label="Bar chart of cross-validated ROC-AUC for each candidate model">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chart} margin={{ top: 5, right: 16, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis domain={[0.5, 1]} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(v) => (v === null ? 'No data' : v.toFixed(3))} />
                    <Bar dataKey="rocAuc" name="ROC-AUC" radius={[4, 4, 0, 0]}>
                      {chart.map((c) => <Cell key={c.key} fill={c.selected ? '#0d9488' : '#94a3b8'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <table className="mt-4 w-full text-sm">
                <caption className="sr-only">Cross-validated metrics per candidate model</caption>
                <thead><tr className="text-left text-xs uppercase text-slate-500"><th scope="col" className="pb-2">Model</th>{Object.values(METRIC_LABELS).map((l) => <th key={l} scope="col" className="pb-2 text-right">{l}</th>)}</tr></thead>
                <tbody>
                  {m.comparison.map((c) => (
                    <tr key={c.name} className={`border-t border-slate-100 ${c.name === m.model_name ? 'bg-teal-50 font-semibold' : ''}`}>
                      <th scope="row" className="py-2 text-left font-normal capitalize">{c.name.replace(/_/g, ' ')}{c.name === m.model_name ? ' (selected)' : ''}</th>
                      {['accuracy', 'precision', 'recall', 'f1', 'roc_auc'].map((k) => (
                        <td key={k} className="py-2 text-right">{c.metrics[k] ? `${(c.metrics[k].mean * 100).toFixed(1)} ± ${(c.metrics[k].std * 100).toFixed(1)}` : '—'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          ) : m.note ? <Alert>{m.note}</Alert> : null}

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Training data and settings">
              <dl className="space-y-2 text-sm">
                {Object.entries(m.dataset_counts).map(([k, v]) => <div key={k} className="flex justify-between"><dt className="capitalize text-slate-500">{k.replace(/_/g, ' ')}</dt><dd className="font-medium">{formatNumber(v)}</dd></div>)}
                {Object.entries(m.hyperparameters).map(([k, v]) => <div key={k} className="flex justify-between"><dt className="text-slate-500">{k.replace(/^model__/, '')}</dt><dd className="font-medium">{String(v)}</dd></div>)}
                {m.training_duration_seconds != null ? <div className="flex justify-between"><dt className="text-slate-500">Training time</dt><dd className="font-medium">{m.training_duration_seconds}s</dd></div> : null}
              </dl>
              <p className="mt-3 text-xs text-slate-500">Features: {m.feature_columns.join(', ')}</p>
            </Panel>
          </div>
        </>
      ) : null}

      <Panel title="Live usage" note="Predictions saved by the system so far.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard label="Predictions made" value={formatNumber(m.usage.predictions_total)} />
          <StatCard label="Average probability" value={m.usage.average_probability == null ? 'No data' : `${(m.usage.average_probability * 100).toFixed(1)}%`} />
          <StatCard label="Low / Moderate / High" value={`${m.usage.by_risk_level.LOW} / ${m.usage.by_risk_level.MODERATE} / ${m.usage.by_risk_level.HIGH}`} />
        </div>
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Predictions by model version</p>
          {Object.keys(m.usage.by_model_version).length === 0 ? <p className="mt-1 text-sm text-slate-500">None yet</p> : (
            <ul className="mt-1 space-y-1 text-sm">
              {Object.entries(m.usage.by_model_version).map(([v, n]) => <li key={v} className="flex justify-between gap-3"><span className="break-all text-slate-700">{v}</span><span className="font-semibold">{formatNumber(n)}</span></li>)}
            </ul>
          )}
        </div>
      </Panel>
      <p className="text-xs text-slate-500">This is an educational model trained on a public dataset. Its output is not a medical diagnosis.</p>
    </div>
  )
}
