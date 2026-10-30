import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  History,
  ShieldAlert,
  Save,
  Sparkles
} from 'lucide-react';
import { diabetesService } from '../../services/diabetesService';

export default function DiabetesScreening() {
  const [formData, setFormData] = useState({
    age: 40,
    gender: 'MALE',
    bmi: 24.5,
    waist_circumference_cm: 85,
    physical_activity_daily_30m: true,
    daily_fruits_vegetables: true,
    hypertension_meds: false,
    history_high_blood_glucose: false,
    family_history_diabetes: 'NONE',
    fasting_glucose_mg_dl: '',
    hba1c_percent: '',
  });

  const [preview, setPreview] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Fetch history on mount
  useEffect(() => {
    loadHistory();
  }, []);

  const buildPayload = useCallback(() => {
    return {
      age: Number(formData.age),
      gender: formData.gender,
      bmi: Number(formData.bmi),
      waist_circumference_cm: Number(formData.waist_circumference_cm),
      physical_activity_daily_30m: Boolean(formData.physical_activity_daily_30m),
      daily_fruits_vegetables: Boolean(formData.daily_fruits_vegetables),
      hypertension_meds: Boolean(formData.hypertension_meds),
      history_high_blood_glucose: Boolean(formData.history_high_blood_glucose),
      family_history_diabetes: formData.family_history_diabetes,
      fasting_glucose_mg_dl: formData.fasting_glucose_mg_dl ? Number(formData.fasting_glucose_mg_dl) : null,
      hba1c_percent: formData.hba1c_percent ? Number(formData.hba1c_percent) : null,
    };
  }, [formData]);

  // Update preview whenever formData changes
  useEffect(() => {
    let active = true;
    const computePreview = async () => {
      try {
        const payload = buildPayload();
        const res = await diabetesService.calculateRisk(payload);
        if (active) setPreview(res);
      } catch (err) {
        // Silently ignore incomplete preview calculations
      }
    };
    computePreview();
    return () => { active = false; };
  }, [buildPayload]);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const data = await diabetesService.getHistory(10);
      setHistory(data);
    } catch (err) {
      console.error('Failed to load diabetes history:', err);
    } finally {
      setLoading(false);
    }
  };



  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const payload = buildPayload();
      const result = await diabetesService.submitScreening(payload);
      setSuccessMsg(`Screening recorded! Score: ${result.total_score} points (${result.risk_level.replace('_', ' ')})`);
      await loadHistory();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setErrorMsg(err.response?.data?.detail || 'Failed to submit diabetes screening.');
    } finally {
      setSubmitting(false);
    }
  };

  const getRiskBadge = (level) => {
    switch (level) {
      case 'LOW':
        return { bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Low Risk' };
      case 'SLIGHTLY_ELEVATED':
        return { bg: 'bg-blue-50 text-blue-700 border-blue-200', label: 'Slightly Elevated' };
      case 'MODERATE':
        return { bg: 'bg-amber-50 text-amber-700 border-amber-200', label: 'Moderate Risk' };
      case 'HIGH':
        return { bg: 'bg-orange-50 text-orange-700 border-orange-200', label: 'High Risk' };
      case 'VERY_HIGH':
        return { bg: 'bg-rose-50 text-rose-700 border-rose-200', label: 'Very High Risk' };
      default:
        return { bg: 'bg-slate-50 text-slate-700 border-slate-200', label: level };
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      {/* Header & Clinical Notice */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2.5 bg-teal-50 text-teal-600 rounded-xl">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Type 2 Diabetes Risk Screening</h1>
            <p className="text-sm text-slate-500">
              Non-invasive assessment tool based on the Finnish Diabetes Risk Score (FINDRISC) and ADA recommendations.
            </p>
          </div>
        </div>

        {/* Medical disclaimer alert */}
        <div className="mt-4 p-4 rounded-xl bg-amber-50/80 border border-amber-200 flex items-start gap-3 text-amber-900 text-sm">
          <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Educational Tool Only: </span>
            This screening estimates the 10-year statistical probability of developing type 2 diabetes based on lifestyle and biometric factors. It is <span className="underline">not a clinical diagnosis</span>. If you have concerns, consult a physician for lab testing (HbA1c or fasting glucose).
          </div>
        </div>

        {successMsg && (
          <div className="mt-4 p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-3 text-emerald-800 text-sm">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="mt-4 p-4 rounded-xl bg-rose-50 border border-rose-200 flex items-center gap-3 text-rose-800 text-sm">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Form Column */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-6 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-teal-600" />
            Screening Questions
          </h2>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Age */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Age (years)
                </label>
                <input
                  type="number"
                  min="18"
                  max="120"
                  value={formData.age}
                  onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-teal-500 text-slate-900"
                  required
                />
              </div>

              {/* Gender */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Gender
                </label>
                <select
                  value={formData.gender}
                  onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-teal-500 text-slate-900"
                >
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              {/* BMI */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Body Mass Index (BMI kg/m²)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="10"
                  max="70"
                  value={formData.bmi}
                  onChange={(e) => setFormData({ ...formData, bmi: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-teal-500 text-slate-900"
                  required
                />
                <span className="text-[11px] text-slate-500">Normal: &lt;25 | Overweight: 25-29.9 | Obese: ≥30</span>
              </div>

              {/* Waist */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Waist Circumference (cm)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="40"
                  max="200"
                  value={formData.waist_circumference_cm}
                  onChange={(e) => setFormData({ ...formData, waist_circumference_cm: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-teal-500 text-slate-900"
                  required
                />
                <span className="text-[11px] text-slate-500">Measured at navel level without clothing</span>
              </div>
            </div>

            {/* Checkbox lifestyle questions */}
            <div className="space-y-3 pt-2">
              <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.physical_activity_daily_30m}
                  onChange={(e) => setFormData({ ...formData, physical_activity_daily_30m: e.target.checked })}
                  className="mt-1 h-4 w-4 text-teal-600 rounded border-slate-300 focus:ring-teal-500"
                />
                <div>
                  <div className="text-sm font-medium text-slate-900">Regular physical activity</div>
                  <div className="text-xs text-slate-500">Do you exercise for at least 30 minutes daily (including brisk walking)?</div>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.daily_fruits_vegetables}
                  onChange={(e) => setFormData({ ...formData, daily_fruits_vegetables: e.target.checked })}
                  className="mt-1 h-4 w-4 text-teal-600 rounded border-slate-300 focus:ring-teal-500"
                />
                <div>
                  <div className="text-sm font-medium text-slate-900">Daily vegetables and fruits</div>
                  <div className="text-xs text-slate-500">Do you consume fresh vegetables, fruits, or berries every day?</div>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.hypertension_meds}
                  onChange={(e) => setFormData({ ...formData, hypertension_meds: e.target.checked })}
                  className="mt-1 h-4 w-4 text-teal-600 rounded border-slate-300 focus:ring-teal-500"
                />
                <div>
                  <div className="text-sm font-medium text-slate-900">High blood pressure medication</div>
                  <div className="text-xs text-slate-500">Do you regularly take medication prescribed for high blood pressure?</div>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.history_high_blood_glucose}
                  onChange={(e) => setFormData({ ...formData, history_high_blood_glucose: e.target.checked })}
                  className="mt-1 h-4 w-4 text-teal-600 rounded border-slate-300 focus:ring-teal-500"
                />
                <div>
                  <div className="text-sm font-medium text-slate-900">History of elevated blood glucose</div>
                  <div className="text-xs text-slate-500">Have you ever been found to have high blood sugar (e.g. checkup, pregnancy)?</div>
                </div>
              </label>
            </div>

            {/* Family history */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                Family History of Diabetes
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[
                  { value: 'NONE', label: 'No family history' },
                  { value: 'SECOND_DEGREE', label: 'Grandparent, Aunt, Uncle, Cousin' },
                  { value: 'FIRST_DEGREE', label: 'Parent, Sibling, or Child' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, family_history_diabetes: opt.value })}
                    className={`p-3 text-left rounded-xl border text-xs font-medium transition ${
                      formData.family_history_diabetes === opt.value
                        ? 'border-teal-600 bg-teal-50 text-teal-900 ring-2 ring-teal-500'
                        : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Optional Lab Values */}
            <div className="pt-2 border-t border-slate-200">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">
                Optional Laboratory Data (If recently tested)
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Fasting Glucose (mg/dL)</label>
                  <input
                    type="number"
                    step="1"
                    placeholder="e.g. 95"
                    value={formData.fasting_glucose_mg_dl}
                    onChange={(e) => setFormData({ ...formData, fasting_glucose_mg_dl: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">HbA1c (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="e.g. 5.6"
                    value={formData.hba1c_percent}
                    onChange={(e) => setFormData({ ...formData, hba1c_percent: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold transition disabled:opacity-50 shadow-md shadow-teal-500/10"
            >
              <Save className="w-5 h-5" />
              {submitting ? 'Saving Screening...' : 'Save Screening to Health Record'}
            </button>
          </form>
        </div>

        {/* Live Score Preview Column */}
        <div className="space-y-6">
          {preview && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-4">
                Live FINDRISC Score
              </h3>

              <div className="text-center p-6 rounded-2xl bg-slate-50 border border-slate-100 mb-6">
                <div className="text-5xl font-black text-slate-900 tracking-tight">
                  {preview.total_score}
                </div>
                <div className="text-xs uppercase tracking-widest text-slate-500 mt-1">Total Points</div>
                
                <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border">
                  {(() => {
                    const badge = getRiskBadge(preview.risk_level);
                    return (
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${badge.bg}`}>
                        {badge.label}
                      </span>
                    );
                  })()}
                </div>

                <div className="mt-3 text-xs text-slate-600 max-w-xs mx-auto">
                  {preview.risk_probability_text}
                </div>
              </div>

              {/* Point Breakdown */}
              <div className="space-y-2 text-xs">
                <div className="font-semibold text-slate-700 uppercase tracking-wider mb-2">Points Breakdown</div>
                {preview.score_breakdown && Object.entries(preview.score_breakdown).map(([k, v]) => (
                  <div key={k} className="flex justify-between items-center py-1 border-b border-slate-100 last:border-0">
                    <span className="capitalize text-slate-600">{k.replace(/_/g, ' ')}</span>
                    <span className="font-medium text-slate-900">+{v.points} pts</span>
                  </div>
                ))}
              </div>

              {/* Guidance Preview */}
              <div className="mt-6 pt-4 border-t border-slate-100 text-xs text-slate-600 whitespace-pre-line leading-relaxed">
                {preview.clinical_guidance}
              </div>
            </div>
          )}

          {/* Historical Screenings */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-4 flex items-center gap-2">
              <History className="w-4 h-4 text-teal-600" />
              Past Screenings
            </h3>

            {loading ? (
              <div className="text-xs text-slate-400 text-center py-4">Loading history...</div>
            ) : history.length === 0 ? (
              <div className="text-xs text-slate-400 text-center py-4">No past screenings recorded.</div>
            ) : (
              <div className="space-y-3">
                {history.map((item) => {
                  const badge = getRiskBadge(item.risk_level);
                  return (
                    <div key={item.id} className="p-3 rounded-xl border border-slate-100 bg-slate-50/50 text-xs">
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-semibold text-slate-800">{item.screening_date}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${badge.bg}`}>
                          {item.risk_level.replace('_', ' ')}
                        </span>
                      </div>
                      <div className="text-slate-500">Score: {item.total_score} points ({item.method})</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
