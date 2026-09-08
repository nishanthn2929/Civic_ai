import React, { useState, useEffect } from 'react';
import { Settings, Sliders, Users, FileText, Shield, Save, Copy, Check, ExternalLink, RefreshCw, Map } from 'lucide-react';
import { adminService, authorityService } from '../../services/api';
import BbmpWardManager from './BbmpWardManager';

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
  const [dupRadius, setDupRadius] = useState('25.0');
  const [dupThreshold, setDupThreshold] = useState('0.70');
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
        if (item.key === 'DUPLICATE_SCORE_THRESHOLD') setDupThreshold(item.value);
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
        adminService.updateSetting('DUPLICATE_SCORE_THRESHOLD', dupThreshold, 'Multi-Signal Duplicate Score Cutoff'),
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
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <Settings className="w-6 h-6 text-purple-400" />
            <span>Central Administration & Governance</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Configure AI thresholds, manage municipal officer roles, inspect audit trails, and generate government handoffs.
          </p>
        </div>
        <button
          onClick={loadData}
          className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Sub Tabs */}
      <div className="flex gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveSubTab('thresholds')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
            activeSubTab === 'thresholds'
              ? 'bg-purple-600 text-white'
              : 'text-slate-400 hover:bg-slate-800'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>AI & Duplicate Thresholds</span>
        </button>
        <button
          onClick={() => setActiveSubTab('users')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
            activeSubTab === 'users'
              ? 'bg-purple-600 text-white'
              : 'text-slate-400 hover:bg-slate-800'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>User & Officer Roles</span>
        </button>
        <button
          onClick={() => setActiveSubTab('audit')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
            activeSubTab === 'audit'
              ? 'bg-purple-600 text-white'
              : 'text-slate-400 hover:bg-slate-800'
          }`}
        >
          <Shield className="w-4 h-4" />
          <span>System Audit Trail</span>
        </button>
        <button
          onClick={() => setActiveSubTab('govt')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
            activeSubTab === 'govt'
              ? 'bg-purple-600 text-white'
              : 'text-slate-400 hover:bg-slate-800'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>BBMP Handoff Dossier</span>
        </button>
        <button
          onClick={() => setActiveSubTab('wards')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
            activeSubTab === 'wards'
              ? 'bg-emerald-600 text-white'
              : 'text-slate-400 hover:bg-slate-800'
          }`}
        >
          <Map className="w-4 h-4 text-emerald-300" />
          <span>BBMP Ward Data</span>
        </button>
      </div>

      {/* Tab 1: Tunable Hyperparameters (Section 13) */}
      {activeSubTab === 'thresholds' && (
        <form onSubmit={handleSaveThresholds} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6 shadow-xl">
          <div className="space-y-1">
            <h3 className="font-bold text-white text-base">Tunable System Hyperparameters</h3>
            <p className="text-xs text-slate-400">
              Changes take effect in runtime without code re-deployment. Avoid hardcoded constants.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* AI Confidence */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-slate-300">YOLO Confidence Minimum</label>
                <span className="text-xs font-mono font-bold text-emerald-400">{confThreshold}</span>
              </div>
              <input
                type="range"
                min="0.20"
                max="0.95"
                step="0.05"
                value={confThreshold}
                onChange={(e) => setConfThreshold(e.target.value)}
                className="w-full accent-emerald-500"
              />
              <p className="text-[11px] text-slate-500">
                Frames below this cutoff are ignored to prevent false positives.
              </p>
            </div>

            {/* Duplicate Radius */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-slate-300">Duplicate Radius (Meters)</label>
                <span className="text-xs font-mono font-bold text-cyan-400">{dupRadius} m</span>
              </div>
              <input
                type="range"
                min="10"
                max="100"
                step="5"
                value={dupRadius}
                onChange={(e) => setDupRadius(e.target.value)}
                className="w-full accent-cyan-500"
              />
              <p className="text-[11px] text-slate-500">
                Maximum distance threshold to search for matching physical road defects.
              </p>
            </div>

            {/* Duplicate Score Threshold */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-slate-300">Duplicate Score Cutoff (0 - 1.0)</label>
                <span className="text-xs font-mono font-bold text-purple-400">{dupThreshold}</span>
              </div>
              <input
                type="range"
                min="0.40"
                max="0.95"
                step="0.02"
                value={dupThreshold}
                onChange={(e) => setDupThreshold(e.target.value)}
                className="w-full accent-purple-500"
              />
              <p className="text-[11px] text-slate-500">
                Weighted combination of Distance (40%), Category (30%), pHash (20%), and Time (10%).
              </p>
            </div>

            {/* Blur Threshold */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-slate-300">Laplacian Blur Cutoff</label>
                <span className="text-xs font-mono font-bold text-yellow-400">{blurThreshold}</span>
              </div>
              <input
                type="range"
                min="50"
                max="300"
                step="10"
                value={blurThreshold}
                onChange={(e) => setBlurThreshold(e.target.value)}
                className="w-full accent-yellow-500"
              />
              <p className="text-[11px] text-slate-500">
                Minimum image sharpness variance. Blurry frames are flagged for manual review.
              </p>
            </div>
          </div>

          <button
            type="submit"
            className="px-6 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-xs shadow-lg shadow-purple-600/20 transition-all flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            <span>Save & Apply Hyperparameters</span>
          </button>
        </form>
      )}

      {/* Tab 2: Users & Officers */}
      {activeSubTab === 'users' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
          <h3 className="font-bold text-white text-base">User Accounts & Roles</h3>
          <div className="divide-y divide-slate-800">
            {usersList.map((u) => (
              <div key={u.id} className="py-3 flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-white">{u.name}</span>
                  <span className="text-slate-400 block">{u.email}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-0.5 rounded font-bold uppercase ${
                    u.role === 'admin' ? 'bg-purple-500/20 text-purple-400' :
                    u.role === 'authority' ? 'bg-cyan-500/20 text-cyan-400' :
                    'bg-slate-800 text-slate-300'
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
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
          <h3 className="font-bold text-white text-base">System Regulatory Audit Logs</h3>
          <div className="max-h-96 overflow-y-auto divide-y divide-slate-800 text-xs font-mono">
            {auditLogs.map((log) => (
              <div key={log.id} className="py-2.5 space-y-1">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="font-bold text-emerald-400">{log.action}</span>
                  <span className="text-[10px] text-slate-500">{new Date(log.created_at).toLocaleString()}</span>
                </div>
                <div className="text-[11px] text-slate-300">
                  Entity: <span className="text-cyan-400">{log.entity_type} #{log.entity_id}</span> • User: {log.user_name}
                </div>
                {log.details_json && (
                  <p className="text-[10px] text-slate-500 truncate">{log.details_json}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 4: BBMP Handoff Dossier (Section 30) */}
      {activeSubTab === 'govt' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6 shadow-xl">
          <div className="space-y-1">
            <h3 className="font-bold text-white text-base">Citizen-Assisted Government Handoff Dossier</h3>
            <p className="text-xs text-slate-400">
              When an authorized BBMP API is unavailable, generate a verified technical dossier formatted for submission to BBMP Sahaya or the 1533 helpline. (Ethical compliance: Section 2 & 30).
            </p>
          </div>

          <div className="flex gap-3 items-center">
            <select
              value={selectedIncidentId}
              onChange={(e) => setSelectedIncidentId(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white flex-1"
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
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-xs transition-colors"
            >
              Generate Dossier
            </button>
          </div>

          {handoffData && (
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="text-xs font-bold text-purple-400">Generated Official Complaint Dossier</span>
                <button
                  onClick={handleCopyDossier}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs transition-colors"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied to Clipboard!' : 'Copy Dossier'}</span>
                </button>
              </div>

              <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap bg-slate-900 p-3 rounded-lg border border-slate-800 leading-relaxed">
                {handoffData.formatted_dossier}
              </pre>

              <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                <span>BBMP Grievance Helpline: <strong className="text-white">1533</strong></span>
                <a
                  href={handoffData.official_portal_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-purple-400 hover:underline flex items-center gap-1"
                >
                  <span>BBMP Sahaya Portal</span>
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

