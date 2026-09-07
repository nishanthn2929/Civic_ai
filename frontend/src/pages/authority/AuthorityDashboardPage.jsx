import React, { useState, useEffect, useRef } from 'react';
import { LayoutDashboard, Filter, CheckCircle2, AlertTriangle, Clock, MapPin, UserPlus, Upload, RefreshCw, Eye } from 'lucide-react';
import { authorityService, publicService } from '../../services/api';
import IncidentMap from '../../components/IncidentMap';

export default function AuthorityDashboardPage({ currentUser }) {
  const [metrics, setMetrics] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [wardGeoJson, setWardGeoJson] = useState(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');

  // Resolution modal state
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [workNotes, setWorkNotes] = useState('');
  const [repairCost, setRepairCost] = useState('');
  const [resolutionFile, setResolutionFile] = useState(null);
  const [submittingResolution, setSubmittingResolution] = useState(false);

  const resolveFileInputRef = useRef(null);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const [m, incList, geo] = await Promise.all([
        authorityService.getMetrics(),
        authorityService.getIncidents({
          category: categoryFilter || undefined,
          status: statusFilter || undefined,
          severity: severityFilter || undefined
        }),
        publicService.getWardGeoJson()
      ]);
      setMetrics(m);
      setIncidents(incList);
      setWardGeoJson(geo);
      if (incList.length > 0 && !selectedIncident) {
        setSelectedIncident(incList[0]);
      }
    } catch (err) {
      console.error('Error loading authority dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, [categoryFilter, statusFilter, severityFilter]);

  const handleStatusTransition = async (newStatus, comment) => {
    if (!selectedIncident) return;
    try {
      const updated = await authorityService.updateStatus(selectedIncident.id, newStatus, comment);
      setSelectedIncident(updated);
      loadDashboardData();
    } catch (err) {
      alert('Error updating status: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleResolveSubmit = async (e) => {
    e.preventDefault();
    if (!selectedIncident || !resolutionFile) {
      alert('After-repair evidence image is required.');
      return;
    }
    setSubmittingResolution(true);
    try {
      const formData = new FormData();
      formData.append('work_notes', workNotes);
      if (repairCost) formData.append('repair_cost', repairCost);
      formData.append('file', resolutionFile);

      const updated = await authorityService.resolveIncident(selectedIncident.id, formData);
      setSelectedIncident(updated);
      setShowResolveModal(false);
      setWorkNotes('');
      setRepairCost('');
      setResolutionFile(null);
      loadDashboardData();
    } catch (err) {
      alert('Failed to submit resolution: ' + (err.response?.data?.detail || err.message));
    } finally {
      setSubmittingResolution(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">Municipal Authority Triage</h1>
            <span className="text-xs bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 px-2.5 py-0.5 rounded-full font-bold">
              {currentUser?.department?.name || 'BBMP Operations'}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Real-time incident dispatch, GIS verification, and resolution evidence audit.
          </p>
        </div>
        <button
          onClick={loadDashboardData}
          className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs border border-slate-700 font-semibold transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Refresh Data</span>
        </button>
      </div>

      {/* Metric Cards (Section 20) */}
      {metrics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-center">
          <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Total Incidents</span>
            <span className="text-2xl font-black text-white">{metrics.total_incidents}</span>
          </div>
          <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800">
            <span className="text-[10px] text-yellow-400 uppercase tracking-wider block">Pending Review</span>
            <span className="text-2xl font-black text-yellow-400">{metrics.pending}</span>
          </div>
          <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800">
            <span className="text-[10px] text-blue-400 uppercase tracking-wider block">Verified</span>
            <span className="text-2xl font-black text-blue-400">{metrics.verified}</span>
          </div>
          <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800">
            <span className="text-[10px] text-cyan-400 uppercase tracking-wider block">In Progress</span>
            <span className="text-2xl font-black text-cyan-400">{metrics.in_progress}</span>
          </div>
          <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800">
            <span className="text-[10px] text-emerald-400 uppercase tracking-wider block">Resolved</span>
            <span className="text-2xl font-black text-emerald-400">{metrics.resolved}</span>
          </div>
          <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800">
            <span className="text-[10px] text-red-400 uppercase tracking-wider block">Critical</span>
            <span className="text-2xl font-black text-red-400">{metrics.critical}</span>
          </div>
          <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800 col-span-2 sm:col-span-1">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Resolution Rate</span>
            <span className="text-2xl font-black text-emerald-400">{metrics.resolution_rate_percentage}%</span>
          </div>
        </div>
      )}

      {/* Main Content: Map & Filterable Triage Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Interactive GIS Map & Filters */}
        <div className="lg:col-span-7 space-y-4">
          {/* Map */}
          <div className="h-[360px]">
            <IncidentMap
              incidents={incidents}
              wardGeoJson={wardGeoJson}
              onSelectIncident={(inc) => setSelectedIncident(inc)}
              selectedIncident={selectedIncident}
            />
          </div>

          {/* Filters Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-slate-300">
              <Filter className="w-4 h-4 text-emerald-400" />
              <span>Filters:</span>
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white"
            >
              <option value="">All Categories</option>
              <option value="Pothole">Pothole</option>
              <option value="Road Damage">Road Damage</option>
              <option value="Road Crack">Road Crack</option>
              <option value="Garbage Overflow">Garbage Overflow</option>
              <option value="Water Leakage">Water Leakage</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white"
            >
              <option value="">All Statuses</option>
              <option value="VERIFIED">VERIFIED</option>
              <option value="ASSIGNED">ASSIGNED</option>
              <option value="IN_PROGRESS">IN PROGRESS</option>
              <option value="RESOLVED">RESOLVED</option>
              <option value="CITIZEN_VERIFICATION">CITIZEN VERIFICATION</option>
              <option value="CLOSED">CLOSED</option>
            </select>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white"
            >
              <option value="">All Severities</option>
              <option value="CRITICAL">CRITICAL</option>
              <option value="HIGH">HIGH</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="LOW">LOW</option>
            </select>
          </div>

          {/* Incident Queue Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
            <div className="p-3 bg-slate-950/60 border-b border-slate-800 text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
              <span>Active Incident Queue ({incidents.length})</span>
              <span className="text-[10px] text-emerald-400">Ranked by Priority Score</span>
            </div>
            <div className="max-h-72 overflow-y-auto divide-y divide-slate-800">
              {incidents.map((inc) => (
                <div
                  key={inc.id}
                  onClick={() => setSelectedIncident(inc)}
                  className={`p-3 text-xs flex items-center justify-between cursor-pointer transition-colors ${
                    selectedIncident?.id === inc.id ? 'bg-slate-800/90' : 'hover:bg-slate-800/40'
                  }`}
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-white">{inc.incident_code}</span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                        inc.severity === 'CRITICAL' ? 'bg-red-500/20 text-red-400' :
                        inc.severity === 'HIGH' ? 'bg-orange-500/20 text-orange-400' :
                        'bg-yellow-500/20 text-yellow-400'
                      }`}>
                        {inc.severity}
                      </span>
                    </div>
                    <p className="text-slate-300 font-medium line-clamp-1">{inc.title}</p>
                    <div className="text-[10px] text-slate-500 flex items-center gap-2">
                      <span>Ward: {inc.ward_name}</span>
                      <span>•</span>
                      <span>Reports: {inc.reports_count}</span>
                    </div>
                  </div>
                  <div className="text-right space-y-1">
                    <div className="font-mono font-bold text-emerald-400">{inc.priority_score.toFixed(0)} pts</div>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-800 block">
                      {inc.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Incident Detailed Triage & Resolution Actions */}
        <div className="lg:col-span-5 space-y-4">
          {selectedIncident ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
              {/* Top Banner */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <span className="font-mono text-xs font-bold text-emerald-400">{selectedIncident.incident_code}</span>
                  <h3 className="font-bold text-white text-sm">{selectedIncident.category}</h3>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-500 uppercase block">Dispatch Priority</span>
                  <span className="text-lg font-black text-amber-400">{selectedIncident.priority_score.toFixed(1)} / 100</span>
                </div>
              </div>

              {/* Photo Evidence */}
              {selectedIncident.primary_media_url && (
                <div className="relative rounded-xl overflow-hidden border border-slate-800 h-44 bg-slate-950">
                  <img
                    src={selectedIncident.primary_media_url}
                    alt={selectedIncident.category}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-2 left-2 bg-black/80 px-2 py-1 rounded text-[10px] text-white font-mono">
                    {selectedIncident.reports_count} Confirming Reports Attached
                  </div>
                </div>
              )}

              {/* Key Metadata */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-slate-500 text-[10px] block">BBMP Ward</span>
                  <span className="font-semibold text-white truncate block">{selectedIncident.ward_name}</span>
                </div>
                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-slate-500 text-[10px] block">Assigned Dept</span>
                  <span className="font-semibold text-cyan-400 truncate block">{selectedIncident.department_name}</span>
                </div>
              </div>

              {/* Status Transition Protocol */}
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2.5">
                <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">
                  Workflow State Controls
                </span>

                <div className="flex flex-wrap gap-2">
                  {selectedIncident.status === 'VERIFIED' && (
                    <button
                      onClick={() => handleStatusTransition('IN_PROGRESS', 'Field repair team dispatched to location.')}
                      className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition-colors"
                    >
                      Start Repair (In Progress)
                    </button>
                  )}

                  {selectedIncident.status === 'IN_PROGRESS' && (
                    <button
                      onClick={() => setShowResolveModal(true)}
                      className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-colors flex items-center gap-1.5"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Upload Repair Proof & Mark Resolved</span>
                    </button>
                  )}

                  {selectedIncident.status === 'REOPENED' && (
                    <button
                      onClick={() => handleStatusTransition('IN_PROGRESS', 'Reopened issue reinspected. Work restarted.')}
                      className="px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold transition-colors"
                    >
                      Restart Repair
                    </button>
                  )}
                </div>
              </div>

              {/* Status History */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Audit History
                </span>
                <div className="max-h-36 overflow-y-auto space-y-1.5 border-l border-slate-800 pl-3 text-[11px]">
                  {selectedIncident.status_history?.map((h) => (
                    <div key={h.id} className="text-slate-400">
                      <span className="font-semibold text-white">{h.new_status}</span>
                      <span className="text-slate-500 ml-1">({h.changed_by_name})</span>
                      <p className="text-[10px] text-slate-500">{h.comment}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-xs text-slate-500">
              Select an incident from queue or map to inspect details and upload resolution proof.
            </div>
          )}
        </div>
      </div>

      {/* Resolution Proof Upload Modal */}
      {showResolveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl animate-in zoom-in-95">
            <h3 className="font-bold text-white text-base">Submit Repair Completion Proof</h3>
            <p className="text-xs text-slate-400">
              Upload the post-repair evidence photograph for citizen and municipal verification.
            </p>

            <form onSubmit={handleResolveSubmit} className="space-y-4">
              {/* Photo Input */}
              <div
                onClick={() => resolveFileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-700 hover:border-emerald-500 rounded-xl p-4 text-center cursor-pointer bg-slate-950"
              >
                <input
                  type="file"
                  ref={resolveFileInputRef}
                  onChange={(e) => setResolutionFile(e.target.files?.[0] || null)}
                  accept="image/*"
                  className="hidden"
                />
                {resolutionFile ? (
                  <div className="text-xs font-bold text-emerald-400">
                    Selected: {resolutionFile.name}
                  </div>
                ) : (
                  <div className="text-xs text-slate-400">
                    Click to select "After-Repair" photo
                  </div>
                )}
              </div>

              {/* Work Notes */}
              <div>
                <label className="block text-xs text-slate-400 mb-1">Work Completion Notes</label>
                <textarea
                  rows={3}
                  required
                  value={workNotes}
                  onChange={(e) => setWorkNotes(e.target.value)}
                  placeholder="e.g. Cavity excavated, cold-mix asphalt laid and leveled with roller. Traffic open."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-white placeholder-slate-500"
                />
              </div>

              {/* Cost */}
              <div>
                <label className="block text-xs text-slate-400 mb-1">Estimated Repair Cost (₹)</label>
                <input
                  type="number"
                  value={repairCost}
                  onChange={(e) => setRepairCost(e.target.value)}
                  placeholder="4500"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-white"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowResolveModal(false)}
                  className="flex-1 py-2.5 bg-slate-800 text-slate-300 rounded-xl text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingResolution}
                  className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs shadow-lg shadow-emerald-500/20"
                >
                  {submittingResolution ? 'Submitting...' : 'Mark Resolved & Notify Citizen'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
