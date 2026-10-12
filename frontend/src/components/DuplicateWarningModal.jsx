import React from 'react';
import {
  AlertTriangle, CheckCircle2, PlusCircle, X, MapPin, Tag,
  ImageIcon, FileText, ArrowRight, ShieldAlert, Sparkles
} from 'lucide-react';

export default function DuplicateWarningModal({
  isOpen,
  onClose,
  candidate,
  newReport,
  onConfirmDuplicate,
  onForceNew,
  isSubmitting = false
}) {
  if (!isOpen || !candidate) return null;

  const matched = candidate.matched_incident || {};
  const signals = candidate.signals || {};
  const scorePercent = Math.round(candidate.percentage || (candidate.score ? candidate.score * 100 : 75));

  const locSignal = signals.location || {};
  const catSignal = signals.category || {};
  const visSignal = signals.visual || {};
  const txtSignal = signals.text || {};

  const distanceM = locSignal.distance_meters !== undefined && locSignal.distance_meters !== null
    ? Math.round(locSignal.distance_meters)
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl my-auto rounded-3xl bg-slate-900/95 border border-amber-500/40 p-5 sm:p-7 shadow-[0_0_50px_rgba(245,158,11,0.15)] text-left space-y-5 overflow-hidden">
        {/* Glow ambient background */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-white/[0.08] pb-4 relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0 shadow-lg shadow-amber-500/10">
              <AlertTriangle className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-white tracking-tight">
                  Possible Duplicate Issue Detected
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  {scorePercent}% Match
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                A similar civic complaint was reported {distanceM !== null ? `within ${distanceM}m` : 'nearby'}. Please verify if this matches your issue.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/[0.05] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Signals Breakdown Gauges */}
        <div className="relative z-10 bg-slate-950/60 rounded-2xl border border-white/[0.08] p-4 space-y-3">
          <div className="flex items-center justify-between text-xs font-bold text-slate-300">
            <span className="flex items-center gap-1.5 text-amber-300">
              <Sparkles className="w-3.5 h-3.5" />
              Multi-Signal Similarity Score
            </span>
            <span className="font-mono text-amber-400">{scorePercent}% (Threshold: 70%–84%)</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {/* Location */}
            <div className="p-2.5 rounded-xl bg-slate-900/80 border border-white/[0.05] space-y-1">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-emerald-400" /> Location
                </span>
                <span className="font-mono font-bold text-slate-200">
                  {Math.round((locSignal.score || 0) * 100)}%
                </span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-emerald-400 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.round((locSignal.score || 0) * 100))}%` }}
                />
              </div>
              <p className="text-[10px] text-slate-500 truncate">
                {distanceM !== null ? `${distanceM}m away` : 'GPS radius'}
              </p>
            </div>

            {/* Category */}
            <div className="p-2.5 rounded-xl bg-slate-900/80 border border-white/[0.05] space-y-1">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span className="flex items-center gap-1">
                  <Tag className="w-3 h-3 text-cyan-400" /> Category
                </span>
                <span className="font-mono font-bold text-slate-200">
                  {Math.round((catSignal.score || 0) * 100)}%
                </span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-cyan-400 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.round((catSignal.score || 0) * 100))}%` }}
                />
              </div>
              <p className="text-[10px] text-slate-500 truncate">
                {catSignal.reported_category || 'Same type'}
              </p>
            </div>

            {/* Visual */}
            <div className="p-2.5 rounded-xl bg-slate-900/80 border border-white/[0.05] space-y-1">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span className="flex items-center gap-1">
                  <ImageIcon className="w-3 h-3 text-purple-400" /> Visual
                </span>
                <span className="font-mono font-bold text-slate-200">
                  {Math.round((visSignal.score || 0) * 100)}%
                </span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-purple-400 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.round((visSignal.score || 0) * 100))}%` }}
                />
              </div>
              <p className="text-[10px] text-slate-500 truncate">Image embedding</p>
            </div>

            {/* Text */}
            <div className="p-2.5 rounded-xl bg-slate-900/80 border border-white/[0.05] space-y-1">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span className="flex items-center gap-1">
                  <FileText className="w-3 h-3 text-amber-400" /> Text
                </span>
                <span className="font-mono font-bold text-slate-200">
                  {Math.round((txtSignal.score || 0) * 100)}%
                </span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-amber-400 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.round((txtSignal.score || 0) * 100))}%` }}
                />
              </div>
              <p className="text-[10px] text-slate-500 truncate">Semantic match</p>
            </div>
          </div>
        </div>

        {/* Side-by-side comparison */}
        <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Left: Citizen's new report */}
          <div className="p-4 rounded-2xl bg-slate-950/40 border border-white/[0.08] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                Your New Report
              </span>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                {newReport?.category || 'REPORT'}
              </span>
            </div>

            <div className="w-full h-36 rounded-xl bg-slate-900 border border-white/[0.08] overflow-hidden flex items-center justify-center">
              {newReport?.previewUrl ? (
                <img
                  src={newReport.previewUrl}
                  alt="New Evidence"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="text-center text-slate-500 text-xs flex flex-col items-center gap-1">
                  <ImageIcon className="w-6 h-6 text-slate-600" />
                  <span>No photo attached</span>
                </div>
              )}
            </div>

            <div className="space-y-1 text-xs">
              <p className="text-slate-400 text-[11px] truncate flex items-center gap-1">
                <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                {newReport?.address || 'Current coordinates'}
              </p>
              <p className="text-slate-300 line-clamp-2 italic bg-slate-900/50 p-2 rounded-lg border border-white/[0.04]">
                "{newReport?.description || 'No description provided'}"
              </p>
            </div>
          </div>

          {/* Right: Existing nearby incident */}
          <div className="p-4 rounded-2xl bg-amber-950/20 border border-amber-500/30 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                Existing Incident
                <span className="text-[11px] font-mono text-amber-300">
                  #{matched.incident_code || `INC-${matched.id}`}
                </span>
              </span>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                {matched.status || 'OPEN'}
              </span>
            </div>

            <div className="w-full h-36 rounded-xl bg-slate-900 border border-amber-500/20 overflow-hidden flex items-center justify-center">
              {matched.primary_media_url ? (
                <img
                  src={matched.primary_media_url.startsWith('http') ? matched.primary_media_url : `/api${matched.primary_media_url}`}
                  alt="Existing Evidence"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    e.currentTarget.parentElement.innerHTML = '<div class="text-center text-slate-500 text-xs flex flex-col items-center gap-1"><span class="text-slate-400">Photo on record</span></div>';
                  }}
                />
              ) : (
                <div className="text-center text-slate-500 text-xs flex flex-col items-center gap-1">
                  <ImageIcon className="w-6 h-6 text-slate-600" />
                  <span>Existing photo on record</span>
                </div>
              )}
            </div>

            <div className="space-y-1 text-xs">
              <p className="text-slate-400 text-[11px] truncate flex items-center gap-1">
                <MapPin className="w-3 h-3 text-amber-400 shrink-0" />
                {matched.address || 'Bengaluru'}
              </p>
              <p className="text-slate-300 line-clamp-2 italic bg-slate-900/50 p-2 rounded-lg border border-amber-500/20">
                "{matched.description || matched.title || 'Existing civic report'}"
              </p>
              {matched.reports_count && matched.reports_count > 1 && (
                <p className="text-[10px] text-amber-400/90 font-medium">
                  👥 Reported by {matched.reports_count} citizens so far
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Explanatory callout */}
        <div className="relative z-10 p-3 rounded-xl bg-slate-950/70 border border-white/[0.08] text-[11px] text-slate-400 flex items-start gap-2.5">
          <ShieldAlert className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <span>
            <strong className="text-slate-200">Municipal Duplicate Prevention:</strong> Linking to the existing issue combines citizen votes and raises repair priority without causing multiple dispatch tickets. If this is a completely different defect, select "Submit as New Issue".
          </span>
        </div>

        {/* Action Buttons */}
        <div className="relative z-10 flex flex-col sm:flex-row items-center justify-end gap-3 pt-2 border-t border-white/[0.08]">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/[0.05] transition-all disabled:opacity-50"
          >
            Cancel & Edit Report
          </button>

          <button
            type="button"
            onClick={onForceNew}
            disabled={isSubmitting}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 border border-white/[0.1] transition-all active:scale-95 disabled:opacity-50 shadow-md"
          >
            <PlusCircle className="w-4 h-4 text-cyan-400" />
            <span>No, Submit as New Issue</span>
          </button>

          <button
            type="button"
            onClick={onConfirmDuplicate}
            disabled={isSubmitting}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-xs font-bold text-white shadow-lg shadow-emerald-500/25 transition-all active:scale-95 disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Yes, Link to Existing Issue</span>
          </button>
        </div>
      </div>
    </div>
  );
}
