import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Shield,
  Info,
  Clock,
  Plus
} from 'lucide-react';
import { menstrualService } from '../../services/menstrualService';

const SYMPTOM_OPTIONS = [
  'Cramps', 'Headache', 'Bloating', 'Mood Swings', 'Fatigue', 'Acne', 'Breast Tenderness', 'Lower Back Pain'
];

export default function MenstrualTracking() {
  const [activeTab, setActiveTab] = useState('cycle'); // 'cycle' or 'pcos'
  
  // Cycle logs & analytics state
  const [logs, setLogs] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Cycle form state
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState('');
  const [flow, setFlow] = useState('MEDIUM');
  const [painLevel, setPainLevel] = useState(3);
  const [selectedSymptoms, setSelectedSymptoms] = useState([]);
  const [notes, setNotes] = useState('');

  // PCOS questionnaire state
  const [pcosRegularity, setPcosRegularity] = useState('REGULAR');
  const [pcosAndrogens, setPcosAndrogens] = useState([]);
  const [pcosMetabolic, setPcosMetabolic] = useState([]);
  const [pcosUltrasound, setPcosUltrasound] = useState('NOT_DONE');
  const [pcosResult, setPcosResult] = useState(null);
  const [pcosSubmitting, setPcosSubmitting] = useState(false);

  useEffect(() => {
    loadCycleData();
  }, []);

  const loadCycleData = async () => {
    setLoading(true);
    try {
      const [logsData, analyticsData] = await Promise.all([
        menstrualService.getLogs(20),
        menstrualService.getAnalytics(),
      ]);
      setLogs(logsData);
      setAnalytics(analyticsData);
    } catch (err) {
      console.error('Failed to load menstrual data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSymptom = (sym) => {
    setSelectedSymptoms((prev) =>
      prev.includes(sym) ? prev.filter((s) => s !== sym) : [...prev, sym]
    );
  };

  const handleCycleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await menstrualService.createLog({
        period_start_date: startDate,
        period_end_date: endDate || null,
        flow_intensity: flow,
        pain_level: Number(painLevel),
        symptoms: selectedSymptoms,
        notes: notes || null,
      });
      setSuccessMsg('Period log recorded successfully.');
      setEndDate('');
      setSelectedSymptoms([]);
      setNotes('');
      await loadCycleData();
    } catch (err) {
      setErrorMsg(err.response?.data?.detail || 'Failed to record period log.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteLog = async (id) => {
    if (!window.confirm('Delete this period log? This action is permanent.')) return;
    try {
      await menstrualService.deleteLog(id);
      await loadCycleData();
    } catch (err) {
      alert('Failed to delete log.');
    }
  };

  const handlePcosSubmit = async (e) => {
    e.preventDefault();
    setPcosSubmitting(true);
    try {
      const payload = {
        cycle_regularity: pcosRegularity,
        excess_androgen_symptoms: pcosAndrogens,
        metabolic_indicators: pcosMetabolic,
        ultrasound_findings: pcosUltrasound,
      };
      const result = await menstrualService.submitPcosScreening(payload);
      setPcosResult(result);
    } catch (err) {
      alert('Failed to submit PCOS screening.');
    } finally {
      setPcosSubmitting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      {/* Title & Privacy Badge */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-rose-50 text-rose-600 rounded-xl">
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Menstrual Cycle Tracking & PCOS Support</h1>
              <p className="text-sm text-slate-500">
                Private, user-controlled cycle duration analytics and educational Rotterdam-aligned PCOS screening.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-200 text-xs text-slate-600">
            <Shield className="w-4 h-4 text-teal-600" />
            <span>Private & Encrypted Health Record</span>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="mt-6 flex gap-2 border-b border-slate-200">
          <button
            onClick={() => setActiveTab('cycle')}
            className={`pb-3 px-4 text-sm font-semibold transition border-b-2 ${
              activeTab === 'cycle'
                ? 'border-rose-600 text-rose-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Cycle & Period Log
          </button>
          <button
            onClick={() => setActiveTab('pcos')}
            className={`pb-3 px-4 text-sm font-semibold transition border-b-2 ${
              activeTab === 'pcos'
                ? 'border-rose-600 text-rose-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            PCOS Educational Screening
          </button>
        </div>
      </div>

      {activeTab === 'cycle' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Cycle Stats Card & Log Form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Analytics Summary */}
            {analytics && (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-4 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-rose-500" />
                  Cycle Analytics & Regularity
                </h3>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                    <div className="text-xs text-slate-500">Average Cycle</div>
                    <div className="text-2xl font-bold text-slate-900 mt-1">
                      {analytics.average_cycle_length_days ? `${analytics.average_cycle_length_days} days` : '—'}
                    </div>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                    <div className="text-xs text-slate-500">Average Period</div>
                    <div className="text-2xl font-bold text-slate-900 mt-1">
                      {analytics.average_period_duration_days ? `${analytics.average_period_duration_days} days` : '—'}
                    </div>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 col-span-2 sm:col-span-1">
                    <div className="text-xs text-slate-500">Regularity Status</div>
                    <div className="text-sm font-bold text-slate-900 mt-1">
                      {(analytics.cycle_regularity || 'REGULAR').replace('_', ' ')}
                    </div>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-rose-50/50 border border-rose-100 text-xs text-rose-900">
                  <p>{analytics.regularity_notes}</p>
                  <p className="mt-1 text-[11px] text-rose-600/80 italic">{analytics.disclaimer}</p>
                </div>
              </div>
            )}

            {/* Log Entry Form */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <Plus className="w-5 h-5 text-rose-500" />
                Record Period
              </h3>

              {successMsg && (
                <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  {successMsg}
                </div>
              )}

              {errorMsg && (
                <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600" />
                  {errorMsg}
                </div>
              )}

              <form onSubmit={handleCycleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Period Start Date *</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Period End Date (Optional)</label>
                    <input
                      type="date"
                      value={endDate}
                      min={startDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Flow Intensity</label>
                    <select
                      value={flow}
                      onChange={(e) => setFlow(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                    >
                      <option value="SPOTTING">Spotting</option>
                      <option value="LIGHT">Light</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HEAVY">Heavy</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Cramps / Pain Level (0 to 10): {painLevel}
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="10"
                      value={painLevel}
                      onChange={(e) => setPainLevel(e.target.value)}
                      className="w-full accent-rose-600 mt-2"
                    />
                  </div>
                </div>

                {/* Symptoms Tags */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-2">Symptoms</label>
                  <div className="flex flex-wrap gap-2">
                    {SYMPTOM_OPTIONS.map((sym) => {
                      const active = selectedSymptoms.includes(sym);
                      return (
                        <button
                          key={sym}
                          type="button"
                          onClick={() => handleToggleSymptom(sym)}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                            active
                              ? 'bg-rose-100 text-rose-800 border border-rose-300'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-transparent'
                          }`}
                        >
                          {sym}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Notes (Optional)</label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. Started during travel, mild fatigue"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-sm transition disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Save Period Log'}
                </button>
              </form>
            </div>
          </div>

          {/* Period History List */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-4">
              Recorded Periods
            </h3>

            {loading ? (
              <div className="text-xs text-slate-400 text-center py-6">Loading period history...</div>
            ) : logs.length === 0 ? (
              <div className="text-xs text-slate-400 text-center py-6">No periods recorded yet.</div>
            ) : (
              <div className="space-y-3">
                {logs.map((log) => (
                  <div key={log.id} className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/50 text-xs space-y-1 relative">
                    <div className="flex justify-between items-start">
                      <span className="font-semibold text-slate-900">{log.period_start_date}</span>
                      <button
                        onClick={() => handleDeleteLog(log.id)}
                        title="Delete log"
                        className="text-slate-400 hover:text-rose-600 transition p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="text-slate-600">
                      Duration: {log.period_duration_days ? `${log.period_duration_days} days` : 'Ongoing'}
                      {log.cycle_length_days && ` • Cycle: ${log.cycle_length_days} days`}
                    </div>
                    {log.flow_intensity && (
                      <div className="text-slate-500">Flow: {log.flow_intensity.toLowerCase()}</div>
                    )}
                    {log.symptoms && log.symptoms.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {log.symptoms.map((s) => (
                          <span key={s} className="px-2 py-0.5 rounded bg-rose-50 text-[10px] text-rose-700">
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* PCOS Tab */}
      {activeTab === 'pcos' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8 space-y-6">
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-3">
            <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Clinical Rotterdam Criteria Reference: </span>
              This questionnaire helps identify patterns associated with Polycystic Ovary Syndrome (PCOS). Diagnosis requires at least 2 of 3 Rotterdam criteria (ovulatory dysfunction, androgen excess, polycystic ovaries) and clinical exclusion of thyroid and adrenal disorders. This screening is informational only.
            </div>
          </div>

          <form onSubmit={handlePcosSubmit} className="space-y-6">
            {/* Cycle regularity */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                1. Menstrual Cycle Pattern
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { value: 'REGULAR', label: 'Regular (21 - 35 days)' },
                  { value: 'IRREGULAR', label: 'Irregular (Unpredictable or variable dates)' },
                  { value: 'INFREQUENT', label: 'Infrequent / Absent (>35 days or <8 periods/year)' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPcosRegularity(opt.value)}
                    className={`p-3.5 text-left rounded-xl border text-xs font-medium transition ${
                      pcosRegularity === opt.value
                        ? 'border-rose-600 bg-rose-50 text-rose-900 ring-2 ring-rose-500'
                        : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Androgen symptoms */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                2. Androgenic Symptoms (Select all that apply)
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                {[
                  { id: 'HIRSUTISM', label: 'Excess facial or body hair growth' },
                  { id: 'ACNE', label: 'Persistent adult cystic acne' },
                  { id: 'ALOPECIA', label: 'Hair thinning on scalp / crown' },
                ].map((item) => (
                  <label key={item.id} className="flex items-center gap-2 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={pcosAndrogens.includes(item.id)}
                      onChange={(e) => {
                        setPcosAndrogens(
                          e.target.checked ? [...pcosAndrogens, item.id] : pcosAndrogens.filter((x) => x !== item.id)
                        );
                      }}
                      className="rounded text-rose-600 focus:ring-rose-500"
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Metabolic indicators */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                3. Metabolic / Weight Observations
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {[
                  { id: 'WEIGHT_GAIN', label: 'Difficulty losing weight or rapid unexplained weight gain' },
                  { id: 'ACANTHOSIS', label: 'Darkened skin patches on neck/creases (Acanthosis Nigricans)' },
                ].map((item) => (
                  <label key={item.id} className="flex items-center gap-2 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={pcosMetabolic.includes(item.id)}
                      onChange={(e) => {
                        setPcosMetabolic(
                          e.target.checked ? [...pcosMetabolic, item.id] : pcosMetabolic.filter((x) => x !== item.id)
                        );
                      }}
                      className="rounded text-rose-600 focus:ring-rose-500"
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Ultrasound */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                4. Prior Pelvic Ultrasound Findings (If previously conducted)
              </label>
              <select
                value={pcosUltrasound}
                onChange={(e) => setPcosUltrasound(e.target.value)}
                className="w-full sm:w-80 px-3 py-2 rounded-lg border border-slate-300 text-sm"
              >
                <option value="NOT_DONE">Not performed / Unknown</option>
                <option value="NORMAL">Normal ovaries</option>
                <option value="POLYCYSTIC_MORPHOLOGY">Polycystic ovarian morphology noted by sonographer</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={pcosSubmitting}
              className="py-3 px-6 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-sm transition disabled:opacity-50"
            >
              {pcosSubmitting ? 'Evaluating...' : 'Evaluate PCOS Questionnaire'}
            </button>
          </form>

          {/* Results Display */}
          {pcosResult && (
            <div className="mt-6 p-6 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
              <h4 className="text-base font-bold text-slate-900">
                Educational Evaluation Summary
              </h4>
              <div className="p-3 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-rose-900">
                {pcosResult.risk_assessment_text}
              </div>
              <div className="text-xs text-slate-700 whitespace-pre-line leading-relaxed">
                {pcosResult.educational_guidance}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
