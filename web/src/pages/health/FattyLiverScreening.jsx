import React, { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  History,
  ShieldAlert,
  Save,
  Sparkles,
  Flame
} from 'lucide-react';
import { fattyLiverService } from '../../services/fattyLiverService';

export default function FattyLiverScreening() {
  const [formData, setFormData] = useState({
    bmi: 24.5,
    waist_circumference_cm: 84,
    has_hypertension: false,
    has_type2_diabetes_or_prediabetes: false,
    high_triglycerides: false,
    low_hdl: false,
    alcohol_units_weekly: 0,
    alt_u_l: '',
    ast_u_l: '',
    prior_imaging_steatosis: 'UNKNOWN',
  });

  const [preview, setPreview] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    loadHistory();
  }, []);

  const buildPayload = useCallback(() => {
    return {
      bmi: Number(formData.bmi),
      waist_circumference_cm: Number(formData.waist_circumference_cm),
      has_hypertension: Boolean(formData.has_hypertension),
      has_type2_diabetes_or_prediabetes: Boolean(formData.has_type2_diabetes_or_prediabetes),
      high_triglycerides: Boolean(formData.high_triglycerides),
      low_hdl: Boolean(formData.low_hdl),
      alcohol_units_weekly: Number(formData.alcohol_units_weekly || 0),
      alt_u_l: formData.alt_u_l ? Number(formData.alt_u_l) : null,
      ast_u_l: formData.ast_u_l ? Number(formData.ast_u_l) : null,
      prior_imaging_steatosis: formData.prior_imaging_steatosis,
    };
  }, [formData]);

  useEffect(() => {
    let active = true;
    const computePreview = async () => {
      try {
        const payload = buildPayload();
        const res = await fattyLiverService.evaluate(payload);
        if (active) setPreview(res);
      } catch (err) {
        // Silently ignore incomplete inputs
      }
    };
    computePreview();
    return () => { active = false; };
  }, [buildPayload]);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const data = await fattyLiverService.getHistory(10);
      setHistory(data);
    } catch (err) {
      console.error('Failed to load fatty liver history:', err);
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
      const res = await fattyLiverService.screen(payload);
      setSuccessMsg(`Screening saved: ${res.risk_level.replace('_', ' ')} (${res.metabolic_factors_count} metabolic factors)`);
      await loadHistory();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setErrorMsg(err.response?.data?.detail || 'Failed to save fatty liver screening.');
    } finally {
      setSubmitting(false);
    }
  };

  const getRiskBadge = (level) => {
    switch (level) {
      case 'LOW_AWARENESS':
        return { bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Low Awareness' };
      case 'MODERATE_AWARENESS':
        return { bg: 'bg-amber-50 text-amber-700 border-amber-200', label: 'Moderate Awareness' };
      case 'HIGH_AWARENESS':
        return { bg: 'bg-rose-50 text-rose-700 border-rose-200', label: 'High Awareness' };
      default:
        return { bg: 'bg-slate-50 text-slate-700 border-slate-200', label: level };
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      {/* Header & Clinical Notice */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl">
            <Flame className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Fatty Liver (MASLD) Risk Awareness</h1>
            <p className="text-sm text-slate-500">
              Metabolic dysfunction-associated steatotic liver disease risk checklist and clinical guidance.
            </p>
          </div>
        </div>

        {/* Medical disclaimer alert */}
        <div className="mt-4 p-4 rounded-xl bg-amber-50/80 border border-amber-200 flex items-start gap-3 text-amber-900 text-sm">
          <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Educational Awareness Only: </span>
            This module evaluates evidence-based cardiometabolic risk factors associated with liver fat accumulation. It does <span className="underline">not diagnose or rule out</span> steatotic liver disease or fibrosis. Clinical tests (ultrasound, FibroScan, AST/ALT panels) are required for definitive diagnosis.
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
            <Sparkles className="w-5 h-5 text-amber-600" />
            Metabolic & Lifestyle Risk Factors
          </h2>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-amber-500 text-slate-900"
                  required
                />
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
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-amber-500 text-slate-900"
                  required
                />
              </div>
            </div>

            {/* Cardiometabolic Checkboxes */}
            <div className="space-y-3 pt-2">
              <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.has_type2_diabetes_or_prediabetes}
                  onChange={(e) => setFormData({ ...formData, has_type2_diabetes_or_prediabetes: e.target.checked })}
                  className="mt-1 h-4 w-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500"
                />
                <div>
                  <div className="text-sm font-medium text-slate-900">Type 2 Diabetes or Prediabetes</div>
                  <div className="text-xs text-slate-500">Diagnosed diabetes, elevated fasting glucose (≥100 mg/dL), or taking glucose medication.</div>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.has_hypertension}
                  onChange={(e) => setFormData({ ...formData, has_hypertension: e.target.checked })}
                  className="mt-1 h-4 w-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500"
                />
                <div>
                  <div className="text-sm font-medium text-slate-900">High Blood Pressure (Hypertension)</div>
                  <div className="text-xs text-slate-500">Blood pressure ≥ 130/85 mmHg or currently taking antihypertensive medication.</div>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.high_triglycerides}
                  onChange={(e) => setFormData({ ...formData, high_triglycerides: e.target.checked })}
                  className="mt-1 h-4 w-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500"
                />
                <div>
                  <div className="text-sm font-medium text-slate-900">Elevated Triglycerides</div>
                  <div className="text-xs text-slate-500">Plasma triglycerides ≥ 150 mg/dL or lipid-lowering treatment.</div>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.low_hdl}
                  onChange={(e) => setFormData({ ...formData, low_hdl: e.target.checked })}
                  className="mt-1 h-4 w-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500"
                />
                <div>
                  <div className="text-sm font-medium text-slate-900">Low HDL Cholesterol</div>
                  <div className="text-xs text-slate-500">HDL &lt; 40 mg/dL (men) or &lt; 50 mg/dL (women).</div>
                </div>
              </label>
            </div>

            {/* Alcohol Intake */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Weekly Alcohol Intake (Standard Drinks)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={formData.alcohol_units_weekly}
                onChange={(e) => setFormData({ ...formData, alcohol_units_weekly: e.target.value })}
                className="w-full sm:w-60 px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
              <span className="text-[11px] text-slate-500 block mt-1">1 standard drink = 12 oz beer, 5 oz wine, or 1.5 oz spirit</span>
            </div>

            {/* Optional Liver Panel & Imaging */}
            <div className="pt-2 border-t border-slate-200">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">
                Optional Liver Panel / Imaging (If tested)
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-slate-600 mb-1">ALT (U/L)</label>
                  <input
                    type="number"
                    step="1"
                    placeholder="e.g. 28"
                    value={formData.alt_u_l}
                    onChange={(e) => setFormData({ ...formData, alt_u_l: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">AST (U/L)</label>
                  <input
                    type="number"
                    step="1"
                    placeholder="e.g. 24"
                    value={formData.ast_u_l}
                    onChange={(e) => setFormData({ ...formData, ast_u_l: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Prior Liver Ultrasound / FibroScan</label>
                  <select
                    value={formData.prior_imaging_steatosis}
                    onChange={(e) => setFormData({ ...formData, prior_imaging_steatosis: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  >
                    <option value="UNKNOWN">Not performed / Unknown</option>
                    <option value="NONE">Normal / No steatosis</option>
                    <option value="DETECTED_ULTRASOUND">Fatty liver noted on ultrasound</option>
                    <option value="DETECTED_FIBROSCAN">Steatosis detected by FibroScan (CAP)</option>
                  </select>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold transition disabled:opacity-50"
            >
              <Save className="w-5 h-5" />
              {submitting ? 'Saving Screening...' : 'Save Fatty Liver Assessment'}
            </button>
          </form>
        </div>

        {/* Live Preview Column */}
        <div className="space-y-6">
          {preview && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-4">
                Cardiometabolic Risk Status
              </h3>

              <div className="text-center p-6 rounded-2xl bg-slate-50 border border-slate-100 mb-4">
                <div className="text-4xl font-black text-slate-900 tracking-tight">
                  {preview.metabolic_factors_count}
                </div>
                <div className="text-xs uppercase tracking-widest text-slate-500 mt-1">Metabolic Factors</div>

                <div className="mt-4">
                  {(() => {
                    const badge = getRiskBadge(preview.risk_level);
                    return (
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${badge.bg}`}>
                        {badge.label}
                      </span>
                    );
                  })()}
                </div>
              </div>

              {preview.metabolic_factors && preview.metabolic_factors.length > 0 && (
                <div className="space-y-1.5 text-xs text-slate-700 mb-4">
                  <span className="font-semibold text-slate-800">Identified Factors:</span>
                  {preview.metabolic_factors.map((f, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-slate-600">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                      {f}
                    </div>
                  ))}
                </div>
              )}

              <div className="pt-4 border-t border-slate-100 text-xs text-slate-600 whitespace-pre-line leading-relaxed">
                {preview.clinical_guidance}
              </div>
            </div>
          )}

          {/* Historical Assessments */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-4 flex items-center gap-2">
              <History className="w-4 h-4 text-amber-600" />
              Past Assessments
            </h3>

            {loading ? (
              <div className="text-xs text-slate-400 text-center py-4">Loading history...</div>
            ) : history.length === 0 ? (
              <div className="text-xs text-slate-400 text-center py-4">No past assessments recorded.</div>
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
                      <div className="text-slate-500">{item.metabolic_factors_count} metabolic risk factors</div>
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
