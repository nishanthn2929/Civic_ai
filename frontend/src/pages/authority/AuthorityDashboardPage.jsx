import React, { useState, useEffect, useRef } from 'react';
import { LayoutDashboard, Filter, CheckCircle2, AlertTriangle, Clock, MapPin, UserPlus, Upload, RefreshCw, Eye, Users, UserCheck, Sparkles, Layers, Search } from 'lucide-react';
import { authorityService, publicService } from '../../services/api';
import IncidentMap from '../../components/IncidentMap';
import { formatDateTime, formatTimeAgo } from '../../utils/dateUtils';

export default function AuthorityDashboardPage({ currentUser }) {
  const [metrics, setMetrics] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [wardGeoJson, setWardGeoJson] = useState(null);
  const [loading, setLoading] = useState(true);

  // Filters & Sorting
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('newest'); // 'newest' | 'priority' | 'reports'

  // Resolution modal state
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [workNotes, setWorkNotes] = useState('');
  const [repairCost, setRepairCost] = useState('');
  const [resolutionFile, setResolutionFile] = useState(null);
  const [submittingResolution, setSubmittingResolution] = useState(false);

  const resolveFileInputRef = useRef(null);

  const loadDashboardData = async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    try {
      const [m, incList, geo] = await Promise.all([
        authorityService.getMetrics(),
        authorityService.getIncidents({
          category: categoryFilter || undefined,
          status: statusFilter || undefined,
          severity: severityFilter || undefined,
          search: searchQuery || undefined,
          sort_by: sortBy || 'newest'
        }),
        publicService.getWardGeoJson()
      ]);
      setMetrics(m);
      setIncidents(incList);
      setWardGeoJson(geo);
      if (incList.length > 0) {
        if (!selectedIncident) {
          setSelectedIncident(incList[0]);
        } else {
          const fresh = incList.find((i) => i.id === selectedIncident.id);
          if (fresh) setSelectedIncident(fresh);
        }
      }
    } catch (err) {
      console.error('Error loading authority dashboard:', err);
    } finally {
      if (!isBackground) setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, [categoryFilter, statusFilter, severityFilter, searchQuery, sortBy]);

  // Periodic live auto-sync every 8s so newly submitted citizen complaints appear automatically
  useEffect(() => {
    const timer = setInterval(() => {
      loadDashboardData(true);
    }, 8000);
    return () => clearInterval(timer);
  }, [categoryFilter, statusFilter, severityFilter, searchQuery, sortBy, selectedIncident?.id]);

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
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="glass-card sheen-card rounded-3xl p-6 sm:p-8 flex flex-wrap items-center justify-between gap-4 animate-in-up">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="chip text-cyan-300 font-mono">{currentUser?.department?.name || 'BBMP Central Operations'}</span>
            <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-mono font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.9)]"></span>
              <span>Live Triage Engine</span>
            </div>
          </div>
          <span className="eyebrow mb-2">Authority Command Center</span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Municipal <span className="text-aurora">Authority Command Hub</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 mt-1">
            Real-time incident dispatch, GIS verification, priority triage, and repair evidence auditing.
          </p>
        </div>
        <button
          onClick={loadDashboardData}
          className="btn-ghost flex items-center gap-2 px-4 py-2.5 text-slate-200 rounded-xl text-xs font-bold hover:scale-105 active:scale-95"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
          <span>Refresh Live Queue</span>
        </button>
      </div>

      {/* Metric Scorecards */}
      {metrics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-center">
          <div className="glass-card sheen-card p-4 rounded-2xl animate-in-up delay-1">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block font-mono">Total</span>
            <span className="stat-value text-2xl text-white font-mono">{metrics.total_incidents}</span>
          </div>
          <div className="glass-card sheen-card p-4 rounded-2xl border-amber-500/25 animate-in-up delay-1">
            <span className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider block font-mono">Pending</span>
            <span className="stat-value text-2xl text-amber-400 font-mono">{metrics.pending}</span>
          </div>
          <div className="glass-card sheen-card p-4 rounded-2xl border-blue-500/25 animate-in-up delay-2">
            <span className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider block font-mono">Verified</span>
            <span className="stat-value text-2xl text-blue-400 font-mono">{metrics.verified}</span>
          </div>
          <div className="glass-card sheen-card p-4 rounded-2xl border-cyan-500/25 animate-in-up delay-2">
            <span className="text-[10px] font-semibold text-cyan-400 uppercase tracking-wider block font-mono">In Progress</span>
            <span className="stat-value text-2xl text-cyan-400 font-mono">{metrics.in_progress}</span>
          </div>
          <div className="glass-card sheen-card p-4 rounded-2xl border-emerald-500/25 animate-in-up delay-3">
            <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider block font-mono">Resolved</span>
            <span className="stat-value text-2xl text-emerald-400 font-mono">{metrics.resolved}</span>
          </div>
          <div className="glass-card sheen-card p-4 rounded-2xl border-red-500/25 animate-in-up delay-3">
            <span className="text-[10px] font-semibold text-red-400 uppercase tracking-wider block font-mono">Critical</span>
            <span className="stat-value text-2xl text-red-400 font-mono">{metrics.critical}</span>
          </div>
          <div className="glass-card sheen-card p-4 rounded-2xl border-emerald-500/25 col-span-2 sm:col-span-1 animate-in-up delay-4">
            <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider block font-mono">Compliance</span>
            <span className="stat-value text-2xl text-emerald-400 font-mono">{metrics.resolution_rate_percentage}%</span>
          </div>
        </div>
      )}

      {/* Main Content: Map & Filterable Triage Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Interactive GIS Map & Filters */}
        <div className="lg:col-span-7 space-y-4">
          {/* Map */}
          <div className="relative rounded-2xl premium-border p-1">
            <div className="h-[380px] rounded-xl overflow-hidden">
              <IncidentMap
                incidents={incidents}
                wardGeoJson={wardGeoJson}
                onSelectIncident={(inc) => setSelectedIncident(inc)}
                selectedIncident={selectedIncident}
              />
            </div>
          </div>

          {/* Filters Bar */}
          <div className="glass-card rounded-2xl p-3.5 flex flex-wrap items-center gap-2.5 text-xs border border-white/[0.08]">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search code, ward, title..."
                className="input-premium w-full pl-8 pr-3 py-1.5 rounded-xl text-white text-xs"
              />
            </div>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="input-premium rounded-xl px-2.5 py-1.5 text-cyan-300 font-bold text-xs bg-slate-900 border-cyan-500/30"
              title="Queue Sorting"
            >
              <option value="newest">⚡ Newest / Updated</option>
              <option value="priority">🔥 Highest Priority</option>
              <option value="reports">👥 Most Citizens (Unified)</option>
            </select>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="input-premium rounded-xl px-2.5 py-1.5 text-white text-xs"
            >
              <option value="">All Categories</option>
              <option value="Pothole">Pothole</option>
              <option value="Road Damage">Road Damage</option>
              <option value="Road Crack">Road Crack</option>
              <option value="Broken Streetlight">Streetlight</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="input-premium rounded-xl px-2.5 py-1.5 text-white text-xs"
            >
              <option value="">All Statuses</option>
              <option value="VERIFIED">VERIFIED</option>
              <option value="NEEDS_VERIFICATION">NEEDS VERIFICATION</option>
              <option value="DETECTED">DETECTED</option>
              <option value="ASSIGNED">ASSIGNED</option>
              <option value="IN_PROGRESS">IN PROGRESS</option>
              <option value="RESOLVED">RESOLVED</option>
              <option value="CITIZEN_VERIFICATION">CITIZEN VERIFICATION</option>
              <option value="CLOSED">CLOSED</option>
            </select>

            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="input-premium rounded-xl px-2.5 py-1.5 text-white text-xs"
            >
              <option value="">All Severities</option>
              <option value="CRITICAL">CRITICAL</option>
              <option value="HIGH">HIGH</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="LOW">LOW</option>
            </select>
          </div>

          {/* Incident Queue Table */}
          <div className="glass-card rounded-2xl overflow-hidden shadow-2xl border border-white/[0.08]">
            <div className="p-3.5 bg-slate-950/70 border-b border-white/[0.06] text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between font-mono">
              <div className="flex items-center gap-2">
                <span>Active Queue ({incidents.length})</span>
                <span className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 normal-case font-mono font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  live auto-sync (8s)
                </span>
              </div>
              <span className="text-[10px] text-cyan-400 font-mono">
                {sortBy === 'newest' ? '⚡ Newest First' : sortBy === 'reports' ? '👥 Multi-Citizen First' : '🔥 Priority Ranked'}
              </span>
            </div>
            <div className="max-h-[520px] overflow-y-auto divide-y divide-white/[0.04]">
              {incidents.map((inc) => (
                <div
                  key={inc.id}
                  onClick={() => setSelectedIncident(inc)}
                  className={`p-3.5 text-xs flex items-center justify-between cursor-pointer transition-all ${
                    selectedIncident?.id === inc.id 
                      ? 'bg-slate-800/90 border-l-4 border-emerald-400 pl-3' 
                      : 'hover:bg-white/[0.02]'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-white">{inc.incident_code}</span>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                        inc.severity === 'CRITICAL' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                        inc.severity === 'HIGH' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' :
                        'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                      }`}>
                        {inc.severity}
                      </span>
                      {(inc.reports_count > 1 || inc.has_duplicates) && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold flex items-center gap-1" title="Same issue reported by multiple citizens at this location">
                          <Users className="w-3 h-3 text-cyan-400" />
                          <span>{inc.reports_count} Citizens (Unified)</span>
                        </span>
                      )}
                    </div>
                    <p className="text-slate-200 font-medium line-clamp-1">{inc.title}</p>
                    <div className="text-[10px] text-slate-400 flex flex-wrap items-center gap-2 font-mono">
                      <span>Ward: {inc.ward_name}</span>
                      <span>•</span>
                      <span className={inc.reports_count > 1 ? "text-cyan-400 font-bold" : ""}>
                        {inc.reports_count > 1 ? `👥 ${inc.reports_count} Citizen Reports (Unified Ticket)` : '1 Citizen Report'}
                      </span>
                      <span>•</span>
                      <span className="text-slate-400 flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5 text-slate-500" />
                        {formatTimeAgo(inc.updated_at || inc.created_at)}
                      </span>
                    </div>
                  </div>
                  <div className="text-right space-y-1">
                    <div className="font-mono font-extrabold text-emerald-400">{inc.priority_score.toFixed(0)} pts</div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-950 text-slate-400 border border-white/[0.08] block">
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
            <div className="glass-card rounded-2xl p-6 space-y-5 border border-white/[0.09] shadow-2xl">
              {/* Top Banner */}
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
                <div>
                  <span className="font-mono text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/25">
                    {selectedIncident.incident_code}
                  </span>
                  <h3 className="font-extrabold text-white text-base mt-1.5">{selectedIncident.category}</h3>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-mono text-slate-400 uppercase block">Priority Score</span>
                  <span className="text-xl font-black text-amber-400 font-mono">{selectedIncident.priority_score.toFixed(1)} / 100</span>
                </div>
              </div>

              {/* Photo Evidence */}
              {selectedIncident.primary_media_url && (
                <div className="relative rounded-xl overflow-hidden border border-white/[0.08] h-48 bg-slate-950 shadow-md">
                  <img
                    src={selectedIncident.primary_media_url}
                    alt={selectedIncident.category}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-2 left-2 bg-slate-950/85 backdrop-blur px-2.5 py-1 rounded-lg text-[10px] text-white font-mono border border-white/[0.1]">
                    {selectedIncident.reports_count} Confirming Citizen Reports
                  </div>
                </div>
              )}

              {/* Key Metadata */}
              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <div className="bg-slate-950/70 p-3 rounded-xl border border-white/[0.06]">
                  <span className="text-slate-500 text-[10px] font-mono uppercase block">BBMP Ward</span>
                  <span className="font-bold text-white truncate block">{selectedIncident.ward_name}</span>
                </div>
                <div className="bg-slate-950/70 p-3 rounded-xl border border-white/[0.06]">
                  <span className="text-slate-500 text-[10px] font-mono uppercase block">Assigned Dept</span>
                  <span className="font-bold text-cyan-400 truncate block">{selectedIncident.department_name}</span>
                </div>
                <div className="bg-slate-950/70 p-3 rounded-xl border border-white/[0.06]">
                  <span className="text-slate-500 text-[10px] font-mono uppercase block">Reported At (IST)</span>
                  <span className="font-bold text-slate-200 font-mono text-[11px] block">{formatDateTime(selectedIncident.created_at)}</span>
                </div>
                <div className="bg-slate-950/70 p-3 rounded-xl border border-white/[0.06]">
                  <span className="text-slate-500 text-[10px] font-mono uppercase block">Last Activity</span>
                  <span className="font-bold text-emerald-400 font-mono text-[11px] block">{formatTimeAgo(selectedIncident.updated_at || selectedIncident.created_at)}</span>
                </div>
              </div>

              {/* Unified Incident Callout (Multiple Citizens at Same Location) */}
              {(selectedIncident.reports_count > 1 || selectedIncident.has_duplicates) && (
                <div className="p-4 rounded-xl bg-cyan-950/40 border border-cyan-500/40 text-xs space-y-2.5 shadow-lg">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-cyan-300 flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-cyan-400" />
                      Unified Incident Condition (Same Location)
                    </span>
                    <span className="font-mono text-[10px] px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold">
                      {selectedIncident.reports_count} Citizens Reported
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    <strong>{selectedIncident.reports_count} citizens</strong> have reported this identical condition in the same location (within 50m). The AI engine automatically considered this as <strong>one consolidated work order</strong> for municipal triage, avoiding duplicate dispatches while escalating repair urgency.
                  </p>
                  {selectedIncident.duplicate_group_id && (
                    <div className="text-[10px] font-mono text-slate-400 flex items-center gap-2">
                      <span>Group ID:</span>
                      <span className="text-cyan-300 font-bold px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20">
                        {selectedIncident.duplicate_group_id}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Confirming Citizen Reports on Record */}
              {selectedIncident.linked_reports && selectedIncident.linked_reports.length > 0 && (
                <div className="space-y-2 bg-slate-950/70 p-3.5 rounded-xl border border-white/[0.08]">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider font-mono flex items-center gap-1.5">
                      <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                      Citizen Submissions on Record ({selectedIncident.linked_reports.length})
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">Unified Evidence</span>
                  </div>
                  <div className="max-h-52 overflow-y-auto space-y-2 divide-y divide-white/[0.04]">
                    {selectedIncident.linked_reports.map((rep) => (
                      <div key={rep.id} className="pt-2 first:pt-0 space-y-1 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-slate-200">
                            Report #{rep.id} {rep.reporter_name ? `• ${rep.reporter_name}` : ''}
                          </span>
                          <span className="text-[10px] font-mono text-cyan-300 font-semibold">
                            {rep.created_at ? formatDateTime(rep.created_at) : ''}
                          </span>
                        </div>
                        {rep.raw_text && (
                          <p className="text-[11px] text-slate-300 italic bg-black/30 p-2 rounded-lg border border-white/[0.03]">
                            "{rep.raw_text}"
                          </p>
                        )}
                        <div className="flex items-center justify-between text-[10px] pt-0.5">
                          {rep.is_duplicate ? (
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono">
                              Merged Duplicate {rep.duplicate_score ? `(${Math.round(rep.duplicate_score * 100)}% match)` : ''}
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-mono">
                              Initial Primary Complaint
                            </span>
                          )}
                          {rep.media_url && (
                            <a
                              href={rep.media_url.startsWith('http') ? rep.media_url : `/api${rep.media_url}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-mono hover:underline"
                            >
                              <Eye className="w-3 h-3" /> View Citizen Photo
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Status Transition Protocol */}
              <div className="bg-slate-950/70 p-4 rounded-xl border border-white/[0.08] space-y-3">
                <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block font-mono">
                  Municipal Action Workflow
                </span>

                <div className="flex flex-wrap gap-2">
                  {(selectedIncident.status === 'NEEDS_VERIFICATION' || selectedIncident.status === 'DETECTED') && (
                    <button
                      onClick={() => handleStatusTransition('VERIFIED', 'Authority officer verified citizen evidence and approved ticket for dispatch.')}
                      className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white text-xs font-bold transition-all shadow-md shadow-emerald-500/20 flex items-center justify-center gap-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Verify & Accept Incident into Queue</span>
                    </button>
                  )}

                  {selectedIncident.status === 'VERIFIED' && (
                    <button
                      onClick={() => handleStatusTransition('IN_PROGRESS', 'Field repair team dispatched to location.')}
                      className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-bold transition-all shadow-md shadow-cyan-500/20"
                    >
                      Dispatch Repair Team (In Progress)
                    </button>
                  )}

                  {selectedIncident.status === 'IN_PROGRESS' && (
                    <button
                      onClick={() => setShowResolveModal(true)}
                      className="btn-premium w-full py-3 rounded-xl text-xs flex items-center justify-center gap-2"
                    >
                      <Upload className="w-4 h-4 stroke-[2.5]" />
                      <span>Upload Repair Proof & Complete Work</span>
                    </button>
                  )}

                  {selectedIncident.status === 'REOPENED' && (
                    <button
                      onClick={() => handleStatusTransition('IN_PROGRESS', 'Reopened issue reinspected. Work restarted.')}
                      className="w-full py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold transition-all"
                    >
                      Restart Repair Work
                    </button>
                  )}
                </div>
              </div>

              {/* Status History */}
              <div className="space-y-2 pt-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                  Operational Audit Trail
                </span>
                <div className="max-h-36 overflow-y-auto space-y-2 border-l-2 border-slate-800 ml-1 pl-3 text-[11px]">
                  {selectedIncident.status_history
                    ?.filter((h) => {
                      const comment = (h.comment || '').toLowerCase();
                      return !(
                        comment.includes('confirming report') ||
                        comment.includes('confirmed physical incident') ||
                        comment.includes('attached (duplicate score')
                      );
                    })
                    .map((h) => (
                      <div key={h.id} className="text-slate-400 space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-white font-mono">{h.new_status}</span>
                          <span className="text-slate-500 text-[10px]">by {h.changed_by_name}</span>
                        </div>
                        <p className="text-[10px] text-slate-400 leading-tight">{h.comment}</p>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="glass-card rounded-3xl border border-white/[0.08] p-12 text-center text-xs text-slate-400">
              Select an incident from queue or map to inspect details and upload resolution proof.
            </div>
          )}
        </div>
      </div>

      {/* Resolution Proof Upload Modal */}
      {showResolveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg rounded-3xl premium-border p-6 sm:p-8 space-y-5 animate-in zoom-in-95">
            {/* Ambient glow */}
            <div className="absolute -top-20 -right-20 w-56 h-56 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none"></div>
            <div>
              <span className="eyebrow mb-1.5">Resolution Evidence</span>
              <h3 className="font-extrabold text-white text-lg tracking-tight">Submit Official Repair Completion Proof</h3>
              <p className="text-xs text-slate-300 mt-1">
                Upload the post-repair evidence photograph for automated citizen feedback and BBMP audit.
              </p>
            </div>

            <form onSubmit={handleResolveSubmit} className="space-y-4">
              {/* Photo Input Dropzone */}
              <div
                onClick={() => resolveFileInputRef.current?.click()}
                className="border-2 border-dashed border-white/[0.15] hover:border-emerald-400/80 rounded-2xl p-6 text-center cursor-pointer bg-slate-950/70 hover:bg-slate-950 transition-all group"
              >
                <input
                  type="file"
                  ref={resolveFileInputRef}
                  onChange={(e) => setResolutionFile(e.target.files?.[0] || null)}
                  accept="image/*"
                  className="hidden"
                />
                {resolutionFile ? (
                  <div className="space-y-1">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-2 border border-emerald-500/30">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <div className="text-xs font-bold text-emerald-400 font-mono">
                      {resolutionFile.name}
                    </div>
                    <div className="text-[10px] text-slate-400">Click to replace photo</div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="w-10 h-10 rounded-full bg-white/[0.04] text-slate-400 group-hover:text-emerald-400 group-hover:bg-emerald-500/10 flex items-center justify-center mx-auto transition-colors">
                      <Upload className="w-5 h-5" />
                    </div>
                    <div className="text-xs font-bold text-white group-hover:text-emerald-400 transition-colors">
                      Click to upload "After-Repair" Evidence Photo
                    </div>
                    <div className="text-[11px] text-slate-500">Supports JPG, PNG, or camera capture</div>
                  </div>
                )}
              </div>

              {/* Work Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 font-mono uppercase">
                  Work Completion Notes
                </label>
                <textarea
                  rows={3}
                  required
                  value={workNotes}
                  onChange={(e) => setWorkNotes(e.target.value)}
                  placeholder="e.g. Cavity excavated, cold-mix asphalt laid and leveled with roller. Traffic open."
                  className="input-premium w-full rounded-xl p-3 text-xs text-white"
                />
              </div>

              {/* Cost */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 font-mono uppercase">
                  Estimated Repair Cost (₹ INR)
                </label>
                <input
                  type="number"
                  value={repairCost}
                  onChange={(e) => setRepairCost(e.target.value)}
                  placeholder="4500"
                  className="input-premium w-full rounded-xl p-3 text-xs text-white font-mono"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowResolveModal(false)}
                  className="btn-ghost flex-1 py-3 text-slate-300 rounded-xl text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingResolution}
                  className="btn-premium flex-1 py-3 rounded-xl text-xs flex items-center justify-center gap-2"
                >
                  {submittingResolution ? 'Submitting Proof...' : 'Mark Resolved & Notify Citizen'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
