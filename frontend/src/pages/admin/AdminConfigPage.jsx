import React, { useState, useEffect } from 'react';
import { Settings, Sliders, Users, FileText, Shield, Save, Copy, Check, ExternalLink, RefreshCw, Map, Layers, Sparkles } from 'lucide-react';
import { adminService, authorityService } from '../../services/api';
import BbmpWardManager from './BbmpWardManager';
import DuplicateClusterManager from './DuplicateClusterManager';
import { formatDateTime } from '../../utils/dateUtils';

export default function AdminConfigPage() {
  const [activeSubTab, setActiveSubTab] = useState('thresholds');
  const [settingsList, setSettingsList] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [selectedIncidentId, setSelectedIncidentId] = useState('');
  const [handoffData, setHandoffData] = useState(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  // Form values for thresholds
  const [confThreshold, setConfThreshold] = useState('0.50');
  const [dupRadius, setDupRadius] = useState('50.0');
  const [dupConfirmedThreshold, setDupConfirmedThreshold] = useState('0.85');
  const [dupPossibleThreshold, setDupPossibleThreshold] = useState('0.70');
  const [blurThreshold, setBlurThreshold] = useState('100.0');

  const loadData = async () => {
    setLoading(true);
    try {
      const [s, u, logs, incs] = await Promise.all([
        adminService.getSettings(),
        adminService.getUsers(),
        adminService.getAuditLogs(),
        authorityService.getIncidents()
      ]);
      setSettingsList(s);
      setUsersList(u);
      setAuditLogs(logs);
      setIncidents(incs);
      if (incs.length > 0) setSelectedIncidentId(incs[0].id);

      // Populate local form fields
      s.forEach((item) => {
        if (item.key === 'CONFIDENCE_THRESHOLD') setConfThreshold(item.value);
        if (item.key === 'DUPLICATE_RADIUS_METERS') setDupRadius(item.value);
        if (item.key === 'DUPLICATE_CONFIRMED_THRESHOLD') setDupConfirmedThreshold(item.value);
        if (item.key === 'DUPLICATE_POSSIBLE_THRESHOLD' || item.key === 'DUPLICATE_SCORE_THRESHOLD') setDupPossibleThreshold(item.value);
        if (item.key === 'BLUR_THRESHOLD') setBlurThreshold(item.value);
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSaveThresholds = async (e) => {
    e.preventDefault();
    try {
      await Promise.all([
        adminService.updateSetting('CONFIDENCE_THRESHOLD', confThreshold, 'AI Confidence Cutoff'),
        adminService.updateSetting('DUPLICATE_RADIUS_METERS', dupRadius, 'Spatial Duplicate Search Radius'),
        adminService.updateSetting('DUPLICATE_CONFIRMED_THRESHOLD', dupConfirmedThreshold, 'Confirmed Duplicate Cutoff (>=)'),
        adminService.updateSetting('DUPLICATE_POSSIBLE_THRESHOLD', dupPossibleThreshold, 'Possible Duplicate Cutoff (70-84%)'),
        adminService.updateSetting('BLUR_THRESHOLD', blurThreshold, 'Laplacian Image Blur Variance Threshold')
      ]);
      alert('Thresholds and hyperparameters updated successfully in system memory!');
      loadData();
    } catch (err) {
      alert('Failed to save settings: ' + err.message);
    }
  };

  const handleGenerateHandoff = async () => {
    if (!selectedIncidentId) return;
    try {
      const res = await adminService.getHandoffPackage(selectedIncidentId);
      setHandoffData(res);
    } catch (err) {
      alert('Error generating dossier: ' + err.message);
    }
  };

  const handleCopyDossier = () => {
    if (handoffData?.formatted_dossier) {
      navigator.clipboard.writeText(handoffData.formatted_dossier);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="glass-card sheen-card rounded-3xl p-6 sm:p-8 flex flex-wrap items-center justify-between gap-4 animate-in-up">
        <div>
          <span className="eyebrow mb-2" style={{ color: 'rgba(192,132,252,0.9)' }}>BBMP Central Governance & AI Ops</span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <span>Central Administration & <span className="text-aurora">AI Control</span></span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 mt-1">
            Configure RT-DETR CV thresholds, manage officer permissions, inspect audit logs, and audit BBMP 198 ward GIS boundaries.
          </p>
        </div>
        <button
          onClick={loadData}
          className="btn-ghost p-3 rounded-2xl text-slate-300 hover:scale-105 active:scale-95"
          title="Refresh Settings"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-purple-400' : ''}`} />
        </button>
      </div>

      {/* Sub Tabs Segmented Control */}
      <div className="flex items-center gap-1.5 p-1 bg-slate-950/80 rounded-2xl border border-white/[0.08] overflow-x-auto shadow-inner">
        <button
          onClick={() => setActiveSubTab('thresholds')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeSubTab === 'thresholds'
              ? 'bg-gradient-to-r from-purple-500 to-indigo-600 text-white shadow-md shadow-purple-500/25'
              : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>AI & Duplicate Thresholds</span>
        </button>
        <button
          onClick={() => setActiveSubTab('duplicates')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeSubTab === 'duplicates'
              ? 'bg-gradient-to-r from-purple-500 to-indigo-600 text-white shadow-md shadow-purple-500/25'
              : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
          }`}
        >
          <Layers className="w-3.5 h-3.5 text-purple-400" />
          <span>Duplicate Clusters</span>
        </button>
        <button
          onClick={() => setActiveSubTab('users')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeSubTab === 'users'
              ? 'bg-gradient-to-r from-purple-500 to-indigo-600 text-white shadow-md shadow-purple-500/25'
              : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Officer Roles</span>
        </button>
        <button
          onClick={() => setActiveSubTab('audit')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeSubTab === 'audit'
              ? 'bg-gradient-to-r from-purple-500 to-indigo-600 text-white shadow-md shadow-purple-500/25'
              : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
          }`}
        >
          <Shield className="w-3.5 h-3.5" />
          <span>Audit Logs</span>
        </button>
        <button
          onClick={() => setActiveSubTab('govt')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeSubTab === 'govt'
              ? 'bg-gradient-to-r from-purple-500 to-indigo-600 text-white shadow-md shadow-purple-500/25'
              : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>BBMP Sahaya Dossier</span>
        </button>
        <button
          onClick={() => setActiveSubTab('wards')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeSubTab === 'wards'
              ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-md shadow-emerald-500/25'
              : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
          }`}
        >
          <Map className="w-3.5 h-3.5 text-emerald-400" />
          <span>GIS, Wards & Representatives</span>
        </button>
      </div>

      {/* Tab 1: Tunable Hyperparameters (Section 13) */}
      {activeSubTab === 'thresholds' && (
        <form onSubmit={handleSaveThresholds} className="glass-card rounded-3xl p-6 sm:p-8 space-y-6 border border-white/[0.09] shadow-2xl">
          <div className="space-y-1">
            <h3 className="font-extrabold text-white text-base">Tunable System Hyperparameters</h3>
            <p className="text-xs text-slate-300">
              Changes take effect in runtime memory without restarting the server or redeploying models.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* AI Confidence */}
            <div className="bg-slate-950/70 p-5 rounded-2xl border border-white/[0.08] space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-slate-200">RT-DETR Confidence Minimum Cutoff</label>
                <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/25">
                  {confThreshold}
                </span>
              </div>
              <input
                type="range"
                min="0.20"
                max="0.95"
                step="0.05"
                value={confThreshold}
                onChange={(e) => setConfThreshold(e.target.value)}
                className="slider-custom w-full cursor-pointer"
              />
              <p className="text-[11px] text-slate-400 leading-tight">
                Camera defect detections below this probability score are suppressed to eliminate false alarms.
              </p>
            </div>

            {/* Duplicate Radius */}
            <div className="bg-slate-950/70 p-5 rounded-2xl border border-white/[0.08] space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-slate-200">Spatial Duplicate Search Radius</label>
                <span className="text-xs font-mono font-bold text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/25">
                  {dupRadius} m
                </span>
              </div>
              <input
                type="range"
                min="10"
                max="100"
                step="5"
                value={dupRadius}
                onChange={(e) => setDupRadius(e.target.value)}
                className="slider-custom w-full cursor-pointer"
              />
              <p className="text-[11px] text-slate-400 leading-tight">
                Maximum geographic radius (Haversine formula) to correlate consecutive reports into 1 single incident.
              </p>
            </div>

            {/* Confirmed Duplicate Cutoff */}
            <div className="bg-slate-950/70 p-5 rounded-2xl border border-white/[0.08] space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-slate-200">Confirmed Duplicate Cutoff (Auto-Merge)</label>
                <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/25">
                  ≥{Math.round(parseFloat(dupConfirmedThreshold || 0.85) * 100)}% ({dupConfirmedThreshold})
                </span>
              </div>
              <input
                type="range"
                min="0.75"
                max="0.95"
                step="0.01"
                value={dupConfirmedThreshold}
                onChange={(e) => setDupConfirmedThreshold(e.target.value)}
                className="slider-custom accent-emerald w-full cursor-pointer"
              />
              <p className="text-[11px] text-slate-400 leading-tight">
                Reports scoring at or above this threshold are automatically merged with the existing primary incident.
              </p>
            </div>

            {/* Possible Duplicate Cutoff */}
            <div className="bg-slate-950/70 p-5 rounded-2xl border border-white/[0.08] space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-slate-200">Possible Duplicate Cutoff (Citizen Modal)</label>
                <span className="text-xs font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/25">
                  {Math.round(parseFloat(dupPossibleThreshold || 0.70) * 100)}% ({dupPossibleThreshold})
                </span>
              </div>
              <input
                type="range"
                min="0.50"
                max="0.84"
                step="0.01"
                value={dupPossibleThreshold}
                onChange={(e) => setDupPossibleThreshold(e.target.value)}
                className="slider-custom accent-amber w-full cursor-pointer"
              />
              <p className="text-[11px] text-slate-400 leading-tight">
                Reports scoring between {Math.round(parseFloat(dupPossibleThreshold || 0.70) * 100)}% and {Math.round(parseFloat(dupConfirmedThreshold || 0.85) * 100)}% prompt citizen confirmation modal.
              </p>
            </div>

            {/* Blur Threshold */}
            <div className="bg-slate-950/70 p-5 rounded-2xl border border-white/[0.08] space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-slate-200">Laplacian Blur Cutoff Variance</label>
                <span className="text-xs font-mono font-bold text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/25">
                  {blurThreshold}
                </span>
              </div>
              <input
                type="range"
                min="50"
                max="300"
                step="10"
                value={blurThreshold}
                onChange={(e) => setBlurThreshold(e.target.value)}
                className="slider-custom accent-purple w-full cursor-pointer"
              />
              <p className="text-[11px] text-slate-400 leading-tight">
                Laplacian second derivative variance threshold. Blurry vehicle frames are held for review.
              </p>
            </div>
          </div>

          <button
            type="submit"
            className="px-6 py-3 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 text-white font-extrabold rounded-xl text-xs shadow-[0_8px_24px_-6px_rgba(168,85,247,0.5),inset_0_1px_0_rgba(255,255,255,0.25)] transition-all flex items-center gap-2 hover:scale-[1.01] hover:brightness-110"
          >
            <Save className="w-4 h-4 stroke-[2.5]" />
            <span>Save & Apply Hyperparameters to Runtime</span>
          </button>
        </form>
      )}

      {/* Tab: Duplicate Clusters */}
      {activeSubTab === 'duplicates' && (
        <DuplicateClusterManager />
      )}

      {/* Tab 2: Users & Officers */}
      {activeSubTab === 'users' && (
        <div className="glass-card rounded-3xl p-6 sm:p-8 space-y-5 border border-white/[0.09] shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
            <div>
              <h3 className="font-extrabold text-white text-base">User Accounts & Access Control</h3>
              <p className="text-xs text-slate-400">Authenticated officers, citizens, and municipal engineers</p>
            </div>
            <span className="text-xs font-mono text-slate-400 bg-slate-950 px-2.5 py-1 rounded-lg border border-white/[0.06]">
              {usersList.length} Active Accounts
            </span>
          </div>

          <div className="divide-y divide-white/[0.04]">
            {usersList.map((u) => (
              <div key={u.id} className="py-3 flex items-center justify-between text-xs hover:bg-white/[0.02] px-2 rounded-xl transition-colors">
                <div>
                  <span className="font-bold text-white text-sm">{u.name}</span>
                  <span className="text-slate-400 text-xs block font-mono mt-0.5">{u.email}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1 rounded-full font-mono text-[10px] font-bold uppercase ${
                    u.role === 'admin' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' :
                    u.role === 'authority' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' :
                    'bg-slate-800 text-slate-300 border border-white/[0.08]'
                  }`}>
                    {u.role}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: Audit Trail */}
      {activeSubTab === 'audit' && (
        <div className="glass-card rounded-3xl p-6 sm:p-8 space-y-5 border border-white/[0.09] shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
            <div>
              <h3 className="font-extrabold text-white text-base">System Regulatory Audit Logs</h3>
              <p className="text-xs text-slate-400">Tamper-evident logs of administrative actions & status overrides</p>
            </div>
            <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/25">
              Immutable Trail
            </span>
          </div>

          <div className="max-h-96 overflow-y-auto divide-y divide-white/[0.04] text-xs font-mono pr-1">
            {auditLogs.map((log) => (
              <div key={log.id} className="py-3 space-y-1 hover:bg-white/[0.02] px-2 rounded-xl transition-colors">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="font-bold text-emerald-400">{log.action}</span>
                  <span className="text-[10px] text-slate-400 font-mono">{formatDateTime(log.created_at)}</span>
                </div>
                <div className="text-[11px] text-slate-300">
                  Entity: <span className="text-cyan-400 font-bold">{log.entity_type} #{log.entity_id}</span> • User: <span className="text-white">{log.user_name}</span>
                </div>
                {log.details_json && (
                  <p className="text-[10px] text-slate-400 truncate bg-slate-950/70 p-1.5 rounded-lg border border-white/[0.04]">{log.details_json}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 4: BBMP Handoff Dossier (Section 30) */}
      {activeSubTab === 'govt' && (
        <div className="glass-card rounded-3xl p-6 sm:p-8 space-y-6 border border-white/[0.09] shadow-2xl">
          <div className="space-y-1">
            <h3 className="font-extrabold text-white text-base">Citizen-Assisted Government Handoff Dossier</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              When an authorized BBMP API is offline or unconfigured, compile a verified technical handoff dossier formatted for submission to BBMP Sahaya or the 1533 helpline. (Section 30 Ethical Architecture).
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
            <select
              value={selectedIncidentId}
              onChange={(e) => setSelectedIncidentId(e.target.value)}
              className="input-premium rounded-xl px-3.5 py-2.5 text-xs text-white flex-1"
            >
              {incidents.map((inc) => (
                <option key={inc.id} value={inc.id}>
                  {inc.incident_code} • {inc.category} ({inc.ward_name})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleGenerateHandoff}
              className="px-5 py-2.5 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 text-white font-extrabold rounded-xl text-xs shadow-lg shadow-purple-500/25 transition-all"
            >
              Generate Dossier
            </button>
          </div>

          {handoffData && (
            <div className="bg-slate-950/80 border border-purple-500/30 rounded-2xl p-5 space-y-4 shadow-xl">
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                <span className="text-xs font-bold text-purple-400 font-mono">Official BBMP Sahaya Dossier Export</span>
                <button
                  onClick={handleCopyDossier}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-bold border border-white/[0.08] transition-all hover:scale-105"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied to Clipboard!' : 'Copy Technical Dossier'}</span>
                </button>
              </div>

              <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap bg-slate-900/90 p-4 rounded-xl border border-white/[0.08] leading-relaxed shadow-inner overflow-x-auto">
                {handoffData.formatted_dossier}
              </pre>

              <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                <span>BBMP Grievance Helpline: <strong className="text-white font-mono">1533</strong></span>
                <a
                  href={handoffData.official_portal_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-purple-400 hover:text-purple-300 hover:underline flex items-center gap-1 font-semibold"
                >
                  <span>BBMP Sahaya 2.0 Gateway</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 5: Authoritative BBMP Ward Data Management (Requirement 10 & 8) */}
      {activeSubTab === 'wards' && <BbmpWardManager />}
    </div>
  );
}

