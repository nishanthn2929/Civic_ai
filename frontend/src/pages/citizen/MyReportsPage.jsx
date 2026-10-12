import React, { useState, useEffect } from 'react';
import {
  Clock, CheckCircle2, AlertCircle, MapPin, Check, X, RefreshCw,
  Search, ShieldAlert, Sparkles, User, ExternalLink, ArrowRight,
  Filter, Tag, Eye, AlertTriangle, Layers, Building2, Phone, Camera,
  Trash2, RotateCcw
} from 'lucide-react';
import { citizenService, authorityService } from '../../services/api';

export default function MyReportsPage({ currentUser, onOpenAuth, onNavigate, initialReportId }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState(null);
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [incidentLoading, setIncidentLoading] = useState(false);
  const [verificationFeedback, setVerificationFeedback] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Direct Ticket / Code Lookup
  const [lookupCode, setLookupCode] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState(null);

  const fetchReports = async (preferredReportId = null) => {
    setLoading(true);
    setError(null);
    try {
      let fetchedReports = [];

      // 1. If user is logged in, fetch from /api/reports/my
      if (currentUser) {
        try {
          const userReports = await citizenService.getMyReports();
          fetchedReports = Array.isArray(userReports) ? userReports : [];
        } catch (e) {
          console.warn('Error fetching user reports:', e);
        }
      }

      // 2. Fetch any guest reports tracked in this browser
      let guestIds = [];
      try {
        const stored = JSON.parse(localStorage.getItem('civic_guest_reports') || '[]');
        if (Array.isArray(stored) && stored.length > 0) {
          guestIds = stored.filter(id => !fetchedReports.some(r => r.id === id));
        }
      } catch (e) {
        console.warn('Local storage error:', e);
      }

      if (guestIds.length > 0) {
        try {
          const guestReports = await citizenService.getBatchReports(guestIds);
          if (Array.isArray(guestReports)) {
            // Mark source as guest/local if user not logged in
            fetchedReports = [...guestReports, ...fetchedReports];
          }
        } catch (e) {
          console.warn('Error fetching guest batch reports:', e);
        }
      }

      setReports(fetchedReports);

      // Select initial or first report
      const targetId = preferredReportId || initialReportId;
      let targetReport = null;
      if (targetId) {
        targetReport = fetchedReports.find(r => r.id === Number(targetId));
      }
      if (!targetReport && fetchedReports.length > 0) {
        targetReport = fetchedReports[0];
      }

      if (targetReport) {
        handleSelectReport(targetReport);
      } else {
        setSelectedReport(null);
        setSelectedIncident(null);
      }
    } catch (err) {
      console.error('Fetch reports error:', err);
      setError('Unable to load civic reports. Please check your connection and retry.');
    } finally {
      setLoading(false);
    }
  };

  const loadIncident = async (incId) => {
    if (!incId) {
      setSelectedIncident(null);
      return;
    }
    setIncidentLoading(true);
    try {
      const inc = await authorityService.getIncidentDetail(incId);
      setSelectedIncident(inc);
    } catch (err) {
      console.warn('Could not load incident details:', err);
      // Keep selectedReport visible even if incident endpoint returns 404
      setSelectedIncident(null);
    } finally {
      setIncidentLoading(false);
    }
  };

  const handleSelectReport = (rep) => {
    setSelectedReport(rep);
    setVerificationFeedback('');
    if (rep?.incident_id) {
      loadIncident(rep.incident_id);
    } else {
      setSelectedIncident(null);
    }
  };

  const handleDirectLookup = async (e) => {
    if (e) e.preventDefault();
    const query = lookupCode.trim();
    if (!query) return;

    setLookupLoading(true);
    setLookupError(null);

    try {
      // If starts with BLR- or contains non-digit, search by incident code
      if (query.toUpperCase().startsWith('BLR-') || /[A-Za-z]/.test(query)) {
        const inc = await citizenService.getIncidentByCode(query.toUpperCase());
        setSelectedIncident(inc);
        setSelectedReport({
          id: query,
          category: inc.category,
          source: 'Lookup',
          address: inc.address,
          ward_name: inc.ward_name,
          ward_number: inc.ward_number,
          incident_id: inc.id,
          status: inc.status,
          raw_text: inc.description,
          media: inc.primary_media_url ? [{ id: 0, media_url: inc.primary_media_url }] : []
        });
      } else {
        // Numeric -> search by report ID
        const rep = await citizenService.getReportById(parseInt(query, 10));
        setSelectedReport(rep);
        if (rep.incident_id) {
          await loadIncident(rep.incident_id);
        } else {
          setSelectedIncident(null);
        }
      }
      setLookupCode('');
    } catch (err) {
      setLookupError(`Ticket '${query}' not found. Verify the code and try again.`);
    } finally {
      setLookupLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [currentUser]);

  const handleCitizenVerify = async (verified) => {
    if (!selectedIncident) return;
    setVerifying(true);
    try {
      const updated = await citizenService.verifyResolution(
        selectedIncident.id,
        verified,
        verificationFeedback
      );
      setSelectedIncident(updated);
      // Refresh current report list
      fetchReports(selectedReport?.id);
    } catch (err) {
      alert('Verification error: ' + (err.response?.data?.detail || err.message));
    } finally {
      setVerifying(false);
    }
  };

  // Clear submitted report history (both backend user reports and local guest records)
  const handleClearHistory = async () => {
    const count = reports.length;
    if (count === 0) return;

    const confirmMsg = currentUser
      ? `Are you sure you want to clear all ${count} submitted reports for ${currentUser.name || 'this account'}? This will permanently delete them.`
      : `Are you sure you want to clear all ${count} reports from this device?`;

    if (!window.confirm(confirmMsg)) return;

    setLoading(true);
    try {
      // 1. If logged in, call backend to clear all user reports
      if (currentUser) {
        await citizenService.clearMyReports();
      }

      // 2. Clear any guest IDs or displayed report IDs from database
      let guestIds = [];
      try {
        const stored = JSON.parse(localStorage.getItem('civic_guest_reports') || '[]');
        if (Array.isArray(stored)) {
          guestIds = stored;
        }
      } catch (e) {
        console.warn('Error reading stored guest reports:', e);
      }

      const allIds = Array.from(new Set([
        ...guestIds,
        ...reports.map(r => r.id).filter(id => typeof id === 'number')
      ]));

      if (allIds.length > 0) {
        try {
          await citizenService.clearStoredReports(allIds);
        } catch (e) {
          console.warn('Error clearing stored reports:', e);
        }
      }

      // 3. Clear localStorage tracking
      try {
        localStorage.removeItem('civic_guest_reports');
      } catch (e) {
        console.warn(e);
      }

      // 4. Reset component state immediately
      setReports([]);
      setSelectedReport(null);
      setSelectedIncident(null);
    } catch (err) {
      console.error('Failed to clear reports:', err);
      // Fallback: try clearing by IDs directly
      try {
        const ids = reports.map(r => r.id).filter(id => typeof id === 'number');
        if (ids.length > 0) {
          await citizenService.clearStoredReports(ids);
        }
        try { localStorage.removeItem('civic_guest_reports'); } catch (_) {}
        setReports([]);
        setSelectedReport(null);
        setSelectedIncident(null);
      } catch (fallbackErr) {
        alert('Could not clear reports: ' + (err.response?.data?.detail || err.message));
      }
    } finally {
      setLoading(false);
    }
  };

  // Delete an individual report
  const handleDeleteReport = async (reportId, e) => {
    if (e) e.stopPropagation();
    if (!window.confirm(`Delete report #${reportId}?`)) return;

    try {
      await citizenService.deleteReport(reportId);
      try {
        const stored = JSON.parse(localStorage.getItem('civic_guest_reports') || '[]');
        const updated = stored.filter(id => id !== reportId);
        localStorage.setItem('civic_guest_reports', JSON.stringify(updated));
      } catch (_) {}

      setReports(prev => prev.filter(r => r.id !== reportId));
      if (selectedReport?.id === reportId) {
        const remaining = reports.filter(r => r.id !== reportId);
        if (remaining.length > 0) {
          handleSelectReport(remaining[0]);
        } else {
          setSelectedReport(null);
          setSelectedIncident(null);
        }
      }
    } catch (err) {
      alert('Failed to delete report: ' + (err.response?.data?.detail || err.message));
    }
  };

  // Clear current active search query and status filters
  const handleClearFilters = () => {
    setSearchQuery('');
    setStatusFilter('ALL');
  };

  // Filtered reports list
  const filteredReports = reports.filter((rep) => {
    const matchesSearch = !searchQuery ||
      rep.category?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rep.address?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rep.ward_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      String(rep.id).includes(searchQuery) ||
      String(rep.incident_id).includes(searchQuery);

    if (!matchesSearch) return false;
    if (statusFilter === 'ALL') return true;
    if (statusFilter === 'VERIFICATION_NEEDED') {
      return rep.status?.toUpperCase() === 'CITIZEN_VERIFICATION' || selectedIncident?.status === 'CITIZEN_VERIFICATION';
    }
    if (statusFilter === 'CLOSED') {
      return rep.status?.toUpperCase() === 'CLOSED' || selectedIncident?.status === 'CLOSED';
    }
    if (statusFilter === 'IN_PROGRESS') {
      return ['IN_PROGRESS', 'ASSIGNED', 'VERIFIED'].includes(rep.status?.toUpperCase());
    }
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="glass-card sheen-card rounded-3xl p-6 sm:p-8 flex flex-wrap items-center justify-between gap-4 animate-in-up">
        <div>
          <div className="flex items-center gap-2">
            <span className="eyebrow mb-2">Citizen Grievance & SLA Portal</span>
            {!currentUser && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                Guest Mode
              </span>
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            My Civic <span className="text-aurora">Reports & Approvals</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl">
            Track real-time municipal triage progress, view BBMP road repair proof photos, and submit citizen sign-offs for SLA closure.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchReports(selectedReport?.id)}
            className="btn-ghost p-3 rounded-2xl text-slate-300 hover:scale-105 active:scale-95 flex items-center gap-2"
            title="Refresh Reports"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
            <span className="text-xs font-semibold hidden sm:inline">Refresh</span>
          </button>
          {!currentUser && onOpenAuth && (
            <button
              onClick={onOpenAuth}
              className="btn-premium px-4 py-2.5 rounded-2xl text-xs flex items-center gap-2"
            >
              <User className="w-3.5 h-3.5" />
              <span>Sign In to Sync</span>
            </button>
          )}
        </div>
      </div>

      {/* Guest Mode Callout Banner */}
      {!currentUser && (
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-amber-500/25 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3 text-slate-300">
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <span className="font-bold text-white block">Viewing Local Device Submissions</span>
              <span className="text-[11px] text-slate-400">
                Sign in or register to link reports permanently to your phone number and receive official BBMP SMS notifications.
              </span>
            </div>
          </div>
          {onOpenAuth && (
            <button
              onClick={onOpenAuth}
              className="px-3.5 py-1.5 rounded-xl bg-amber-400 text-slate-950 font-bold text-xs hover:bg-amber-300 transition-transform active:scale-95 shadow-md shadow-amber-400/20"
            >
              Sign In / Register
            </button>
          )}
        </div>
      )}

      {/* Quick Ticket Lookup Bar */}
      <div className="glass-card rounded-2xl p-3.5 sm:p-4 border border-white/[0.08] shadow-lg">
        <form onSubmit={handleDirectLookup} className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={lookupCode}
              onChange={(e) => setLookupCode(e.target.value)}
              placeholder="Track ticket by Incident Code (e.g. BLR-PTH-2026-0038) or Report ID..."
              className="w-full bg-slate-950/70 border border-white/[0.1] rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>
          <button
            type="submit"
            disabled={lookupLoading || !lookupCode.trim()}
            className="btn-premium px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 disabled:opacity-50"
          >
            {lookupLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
            <span>Track Ticket</span>
          </button>
          {/* Quick Demo Shortcuts */}
          <div className="hidden md:flex items-center gap-1.5 text-[11px] text-slate-400 font-mono ml-auto">
            <span>Demo Tickets:</span>
            <button
              type="button"
              onClick={() => { setLookupCode('BLR-PTH-2026-0038'); }}
              className="px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 border border-amber-500/20 transition-colors"
            >
              BLR-PTH-2026-0038 (Sign-off)
            </button>
            <button
              type="button"
              onClick={() => { setLookupCode('BLR-PTH-2026-0042'); }}
              className="px-2 py-0.5 rounded-lg bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 border border-cyan-500/20 transition-colors"
            >
              BLR-PTH-2026-0042
            </button>
          </div>
        </form>
        {lookupError && (
          <p className="text-xs text-rose-400 mt-2 font-mono flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>{lookupError}</span>
          </p>
        )}
      </div>

      {/* Main Grid: Left List (1 col) + Right Detail (2 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Reports List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
            <span>Submitted Reports</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                {reports.length} Total
              </span>
              {reports.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearHistory}
                  title="Clear locally tracked report history on this device"
                  className="px-2 py-0.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/20 text-[10px] font-mono flex items-center gap-1 transition-all cursor-pointer active:scale-95"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear All</span>
                </button>
              )}
            </div>
          </div>

          {/* Search & Filter pills */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by ward, category..."
                className="w-full bg-slate-950/60 border border-white/[0.08] rounded-xl pl-9 pr-8 py-1.5 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-emerald-500/50"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  title="Clear search query"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5 rounded-full hover:bg-white/10 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[10px] font-semibold">
              <button
                onClick={() => setStatusFilter('ALL')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  statusFilter === 'ALL' ? 'bg-slate-800 text-white font-bold' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setStatusFilter('VERIFICATION_NEEDED')}
                className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${
                  statusFilter === 'VERIFICATION_NEEDED'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold'
                    : 'text-slate-500 hover:text-amber-400'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                Sign-off Required
              </button>
              <button
                onClick={() => setStatusFilter('IN_PROGRESS')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  statusFilter === 'IN_PROGRESS' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-bold' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                Active
              </button>
              <button
                onClick={() => setStatusFilter('CLOSED')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  statusFilter === 'CLOSED' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                Resolved
              </button>
              {(searchQuery || statusFilter !== 'ALL') && (
                <button
                  type="button"
                  onClick={handleClearFilters}
                  title="Clear active filter and search"
                  className="ml-auto px-2 py-0.5 rounded-lg bg-white/10 hover:bg-white/15 text-slate-300 text-[10px] font-mono flex items-center gap-1 transition-all cursor-pointer active:scale-95"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Clear Filters</span>
                </button>
              )}
            </div>
          </div>

          {/* List Content */}
          {loading ? (
            <div className="glass-card rounded-2xl p-10 text-center text-slate-500 text-xs animate-pulse">
              Loading citizen observations...
            </div>
          ) : error ? (
            <div className="glass-card rounded-2xl p-6 text-center text-xs text-rose-400 space-y-3 border border-rose-500/20">
              <AlertCircle className="w-6 h-6 mx-auto text-rose-400" />
              <p>{error}</p>
              <button
                onClick={() => fetchReports()}
                className="btn-ghost px-3 py-1.5 rounded-xl text-xs mx-auto text-white"
              >
                Try Again
              </button>
            </div>
          ) : filteredReports.length === 0 ? (
            <div className="glass-card rounded-2xl p-8 text-center text-xs text-slate-400 space-y-3 border border-white/[0.08]">
              <div className="w-10 h-10 rounded-2xl bg-slate-900 mx-auto flex items-center justify-center border border-white/[0.08]">
                <Camera className="w-5 h-5 text-slate-500" />
              </div>
              <p className="font-semibold text-slate-300">No civic reports found.</p>
              <p className="text-[11px] text-slate-500">
                {reports.length === 0
                  ? 'Submit your first road defect report via Report Issue, Voice Grievance, or Drive Mode.'
                  : 'No reports match your search query.'}
              </p>
              {onNavigate && (
                <div className="flex gap-2 justify-center pt-2">
                  <button
                    onClick={() => onNavigate('report')}
                    className="px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 font-bold text-[11px]"
                  >
                    + Report Defect
                  </button>
                  <button
                    onClick={() => onNavigate('voice')}
                    className="px-3 py-1.5 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/30 font-bold text-[11px]"
                  >
                    Voice Grievance
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[640px] overflow-y-auto pr-1">
              {filteredReports.map((rep) => {
                const isSelected = selectedReport?.id === rep.id;
                const repThumb = rep.media?.[0]?.media_url;
                return (
                  <div
                    key={rep.id}
                    onClick={() => handleSelectReport(rep)}
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-slate-900/95 border-emerald-500/60 shadow-xl shadow-emerald-500/10 scale-[1.01]'
                        : 'glass-card border-white/[0.06] hover:border-white/[0.14] hover:bg-slate-900/60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-xs text-white">{rep.category}</span>
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase font-mono ${
                          rep.status === 'closed' || rep.status === 'CLOSED'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : rep.status === 'CITIZEN_VERIFICATION'
                              ? 'bg-amber-400/20 text-amber-300 border border-amber-400/30 animate-pulse'
                              : 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/25'
                        }`}>
                          {rep.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-mono px-2 py-0.5 rounded-full font-semibold bg-slate-950 text-slate-400 border border-white/[0.08] uppercase">
                          {rep.source}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteReport(rep.id, e)}
                          title={`Delete report #${rep.id}`}
                          className="p-1 rounded-md text-slate-500 hover:text-rose-400 hover:bg-rose-500/15 transition-all cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    <div className="flex gap-2.5 items-center my-2">
                      {repThumb && (
                        <img
                          src={repThumb}
                          alt="Thumbnail"
                          className="w-12 h-12 rounded-xl object-cover border border-white/[0.1] shrink-0"
                        />
                      )}
                      <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed flex-1">
                        {rep.raw_text || rep.address || 'Civil defect logged.'}
                      </p>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono border-t border-white/[0.04] pt-2">
                      <span className="truncate max-w-[140px] text-slate-400">
                        {rep.ward_name ? `Ward: ${rep.ward_name}` : 'Bengaluru'}
                      </span>
                      <span className="font-bold text-emerald-400">
                        {rep.incident_id ? `INC #${rep.incident_id}` : `Report #${rep.id}`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Incident Lifecycle & Citizen Verification */}
        <div className="lg:col-span-2 space-y-6">
          {incidentLoading ? (
            <div className="glass-card rounded-3xl p-16 text-center space-y-3">
              <RefreshCw className="w-8 h-8 mx-auto text-emerald-400 animate-spin" />
              <p className="text-xs text-slate-400">Loading BBMP incident lifecycle & repair proofs...</p>
            </div>
          ) : selectedIncident ? (
            <div className="glass-card rounded-3xl p-6 sm:p-8 space-y-6 border border-white/[0.09] shadow-2xl animate-in-up">
              {/* Incident Header */}
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/[0.08] pb-5">
                <div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="font-mono text-xs font-extrabold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/25">
                      {selectedIncident.incident_code}
                    </span>
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider font-mono ${
                      selectedIncident.status === 'CLOSED' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                      selectedIncident.status === 'CITIZEN_VERIFICATION' ? 'bg-amber-400/20 text-amber-300 border border-amber-400/30 animate-pulse' :
                      selectedIncident.status === 'IN_PROGRESS' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' :
                      'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                    }`}>
                      {selectedIncident.status}
                    </span>
                    {selectedIncident.severity && (
                      <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-md uppercase font-mono ${
                        selectedIncident.severity === 'CRITICAL' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' :
                        selectedIncident.severity === 'HIGH' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                        'bg-slate-800 text-slate-300 border border-white/[0.08]'
                      }`}>
                        {selectedIncident.severity} Severity
                      </span>
                    )}
                    {selectedIncident.priority_score && (
                      <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-white/[0.06]">
                        Priority: {selectedIncident.priority_score.toFixed(1)}
                      </span>
                    )}
                  </div>

                  <h2 className="font-black text-white text-xl mt-3">{selectedIncident.title}</h2>

                  <div className="flex flex-wrap items-center gap-y-1 gap-x-3 text-xs text-slate-300 mt-2">
                    <span className="flex items-center gap-1 text-emerald-400">
                      <MapPin className="w-3.5 h-3.5 shrink-0" />
                      <span>{selectedIncident.address}</span>
                    </span>
                    {(selectedIncident.ward_number || selectedIncident.ward_name) && (
                      <span className="text-slate-400 font-mono">
                        • Ward {selectedIncident.ward_number ? `#${selectedIncident.ward_number}` : ''} ({selectedIncident.ward_name})
                      </span>
                    )}
                    {selectedIncident.assembly_constituency_name && (
                      <span className="text-slate-400 font-mono">
                        • MLA: {selectedIncident.mla_name || 'BBMP'} ({selectedIncident.assembly_constituency_name})
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* 5-Stage Incident Resolution Lifecycle Stepper */}
              <div className="bg-slate-950/70 border border-white/[0.08] rounded-2xl p-4 sm:p-5 space-y-3 shadow-inner">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                    Official BBMP SLA Lifecycle
                  </span>
                  <span className="text-[10px] text-emerald-400 font-mono font-semibold">
                    Step {
                      selectedIncident.status === 'CLOSED' ? '5 of 5' :
                      selectedIncident.status === 'CITIZEN_VERIFICATION' ? '4 of 5' :
                      selectedIncident.status === 'IN_PROGRESS' ? '3 of 5' :
                      selectedIncident.status === 'VERIFIED' ? '2 of 5' : '1 of 5'
                    }
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[10px] font-mono">
                  {/* Step 1 */}
                  <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 flex flex-col items-center gap-1 font-bold">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
                    <span>1. SUBMITTED</span>
                  </div>

                  {/* Step 2 */}
                  <div className={`p-2.5 rounded-xl border flex flex-col items-center gap-1 font-bold ${
                    ['VERIFIED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CITIZEN_VERIFICATION', 'CLOSED'].includes(selectedIncident.status)
                      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                      : 'bg-slate-900/60 border-white/[0.06] text-slate-500'
                  }`}>
                    <span className={`w-2 h-2 rounded-full ${
                      ['VERIFIED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CITIZEN_VERIFICATION', 'CLOSED'].includes(selectedIncident.status)
                        ? 'bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.8)]'
                        : 'bg-slate-700'
                    }`} />
                    <span>2. AI TRIAGED</span>
                  </div>

                  {/* Step 3 */}
                  <div className={`p-2.5 rounded-xl border flex flex-col items-center gap-1 font-bold ${
                    ['IN_PROGRESS', 'RESOLVED', 'CITIZEN_VERIFICATION', 'CLOSED'].includes(selectedIncident.status)
                      ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300'
                      : 'bg-slate-900/60 border-white/[0.06] text-slate-500'
                  }`}>
                    <span className={`w-2 h-2 rounded-full ${
                      ['IN_PROGRESS', 'RESOLVED', 'CITIZEN_VERIFICATION', 'CLOSED'].includes(selectedIncident.status)
                        ? 'bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.8)]'
                        : 'bg-slate-700'
                    }`} />
                    <span>3. CREW REPAIR</span>
                  </div>

                  {/* Step 4 */}
                  <div className={`p-2.5 rounded-xl border flex flex-col items-center gap-1 font-bold ${
                    ['CITIZEN_VERIFICATION', 'CLOSED'].includes(selectedIncident.status)
                      ? 'bg-amber-400/20 border-amber-400/40 text-amber-300'
                      : 'bg-slate-900/60 border-white/[0.06] text-slate-500'
                  }`}>
                    <span className={`w-2 h-2 rounded-full ${
                      selectedIncident.status === 'CITIZEN_VERIFICATION'
                        ? 'bg-amber-400 animate-ping shadow-[0_0_8px_rgba(251,191,36,0.9)]'
                        : selectedIncident.status === 'CLOSED'
                          ? 'bg-emerald-400'
                          : 'bg-slate-700'
                    }`} />
                    <span>4. CITIZEN SIGN-OFF</span>
                  </div>

                  {/* Step 5 */}
                  <div className={`p-2.5 rounded-xl border flex flex-col items-center gap-1 font-bold col-span-2 sm:col-span-1 ${
                    selectedIncident.status === 'CLOSED'
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                      : 'bg-slate-900/60 border-white/[0.06] text-slate-500'
                  }`}>
                    <span className={`w-2 h-2 rounded-full ${
                      selectedIncident.status === 'CLOSED'
                        ? 'bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.8)]'
                        : 'bg-slate-700'
                    }`} />
                    <span>5. SLA CLOSED</span>
                  </div>
                </div>
              </div>

              {/* Defect Observation & Department Details */}
              <div className="bg-slate-950/70 border border-white/[0.08] rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-white/[0.06] pb-2.5">
                  <span className="text-xs font-bold text-white flex items-center gap-2">
                    <Camera className="w-4 h-4 text-emerald-400" />
                    <span>Citizen Defect Evidence & Observation Dossier</span>
                  </span>
                  <span className="text-[11px] font-mono text-slate-400 bg-slate-900 px-2.5 py-0.5 rounded-lg border border-white/[0.06]">
                    Dept: {selectedIncident.department_name || 'BBMP Road Infrastructure'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5 font-mono">
                      Reported Photo Evidence
                    </span>
                    {selectedIncident.primary_media_url || selectedReport?.media?.[0]?.media_url ? (
                      <img
                        src={selectedIncident.primary_media_url || selectedReport?.media?.[0]?.media_url}
                        alt="Initial defect photo"
                        className="w-full h-48 object-cover rounded-xl border border-white/[0.08] shadow-md"
                      />
                    ) : (
                      <div className="h-48 bg-slate-900/60 rounded-xl flex items-center justify-center text-xs text-slate-500 border border-white/[0.06]">
                        No photo attached with report
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1 font-mono">
                      Complaint Details
                    </span>
                    <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/60 p-3 rounded-xl border border-white/[0.04]">
                      {selectedIncident.description || selectedReport?.raw_text || 'Civic road defect logged with geo-location.'}
                    </p>

                    <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                      <div className="p-2.5 rounded-xl bg-slate-900 border border-white/[0.06]">
                        <span className="text-slate-500 block">Total Reports:</span>
                        <span className="font-bold text-emerald-400 text-sm">{selectedIncident.reports_count} Citizen Submissions</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-900 border border-white/[0.06]">
                        <span className="text-slate-500 block">Assigned Crew:</span>
                        <span className="font-bold text-white text-xs truncate block">
                          {selectedIncident.assigned_to_name || 'BBMP Rapid Response'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Resolution Evidence Viewer (Before vs After) */}
              {selectedIncident.resolution ? (
                <div className="bg-slate-950/70 border border-white/[0.08] rounded-2xl p-5 space-y-4 shadow-lg">
                  <div className="flex items-center justify-between border-b border-white/[0.06] pb-2.5">
                    <span className="text-xs font-bold text-white flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>Repair Evidence Submitted by BBMP Field Division</span>
                    </span>
                    <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-lg border border-emerald-500/20">
                      Repair Cost: ₹{selectedIncident.resolution.repair_cost || 0}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5 font-mono">
                        Before Repair (Report Evidence)
                      </span>
                      {selectedIncident.resolution.before_media_url ? (
                        <img
                          src={selectedIncident.resolution.before_media_url}
                          alt="Before Repair"
                          className="w-full h-48 object-cover rounded-xl border border-white/[0.08] shadow-md"
                        />
                      ) : (
                        <div className="h-48 bg-slate-900/60 rounded-xl flex items-center justify-center text-xs text-slate-500 border border-white/[0.06]">
                          Initial Evidence Photo
                        </div>
                      )}
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block mb-1.5 font-mono">
                        After Repair (Official Completion Proof)
                      </span>
                      <img
                        src={selectedIncident.resolution.after_media_url}
                        alt="After Repair"
                        className="w-full h-48 object-cover rounded-xl border border-emerald-500/40 shadow-lg shadow-emerald-500/10"
                      />
                    </div>
                  </div>

                  {selectedIncident.resolution.work_notes && (
                    <div className="text-xs bg-slate-900/80 p-3.5 rounded-xl text-slate-300 border border-white/[0.06]">
                      <span className="text-[10px] font-bold text-slate-400 block mb-1 font-mono uppercase">Officer Work Notes:</span>
                      <p className="leading-relaxed">{selectedIncident.resolution.work_notes}</p>
                    </div>
                  )}

                  {/* Citizen Verification Actions */}
                  {selectedIncident.status === 'CITIZEN_VERIFICATION' && (
                    <div className="border-t border-white/[0.08] pt-4 space-y-3">
                      <div className="text-xs font-bold text-amber-300 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                        <span>Citizen Verification Required: Has this road defect been satisfactorily repaired?</span>
                      </div>
                      <input
                        type="text"
                        value={verificationFeedback}
                        onChange={(e) => setVerificationFeedback(e.target.value)}
                        placeholder="Optional feedback (e.g. Surface level smooth, asphalt cured well, no sharp rim)"
                        className="input-premium w-full rounded-xl p-3 text-xs text-white"
                      />
                      <div className="flex gap-3 pt-1">
                        <button
                          onClick={() => handleCitizenVerify(true)}
                          disabled={verifying}
                          className="btn-premium flex-1 py-3 rounded-xl text-xs flex items-center justify-center gap-2 font-bold"
                        >
                          <Check className="w-4 h-4 stroke-[2.5]" />
                          <span>Approve & Verify Resolution</span>
                        </button>
                        <button
                          onClick={() => handleCitizenVerify(false)}
                          disabled={verifying}
                          className="flex-1 py-3 bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/40 font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all hover:scale-[1.01]"
                        >
                          <X className="w-4 h-4 stroke-[2.5]" />
                          <span>Reject & Reopen Defect</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {selectedIncident.status === 'CLOSED' && (
                    <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3.5 text-xs text-emerald-400 font-semibold flex items-center gap-2.5">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>Issue officially verified and closed by citizen. Service Level Agreement satisfied.</span>
                    </div>
                  )}
                </div>
              ) : selectedIncident.status === 'IN_PROGRESS' ? (
                <div className="bg-cyan-500/10 border border-cyan-500/25 rounded-2xl p-4 text-xs text-cyan-300 flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
                  <span>BBMP road maintenance division is actively conducting on-site repairs. After-repair proof photos will be posted here upon completion.</span>
                </div>
              ) : (
                <div className="bg-slate-900/60 border border-white/[0.06] rounded-2xl p-4 text-xs text-slate-400 flex items-center gap-3">
                  <Clock className="w-4 h-4 text-slate-500 shrink-0" />
                  <span>Incident is queued with BBMP Road Division. As repairs progress, field updates and evidence photos will appear automatically.</span>
                </div>
              )}

              {/* Status Audit History */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono">Incident Audit Trail</h3>
                <div className="space-y-3 border-l-2 border-slate-800 ml-2 pl-4">
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
                      <div key={h.id} className="text-xs space-y-1 relative">
                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-slate-950 absolute -left-[22px] top-1"></div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white font-mono">{h.new_status}</span>
                          <span className="text-[10px] text-slate-400">by {h.changed_by_name}</span>
                        </div>
                        <p className="text-slate-300 text-[11px] leading-relaxed">{h.comment}</p>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          ) : selectedReport ? (
            /* Selected Report without Incident Attached */
            <div className="glass-card rounded-3xl p-6 sm:p-8 space-y-6 border border-white/[0.09] shadow-2xl animate-in-up">
              <div className="flex items-start justify-between gap-3 border-b border-white/[0.08] pb-5">
                <div>
                  <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/25">
                    Report #{selectedReport.id}
                  </span>
                  <h2 className="font-black text-white text-xl mt-3">{selectedReport.category} Observation</h2>
                  <p className="text-xs text-slate-300 mt-1">{selectedReport.address}</p>
                </div>
                <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-full uppercase bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  {selectedReport.status}
                </span>
              </div>

              {selectedReport.media?.[0]?.media_url && (
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5 font-mono">
                    Captured Observation Media
                  </span>
                  <img
                    src={selectedReport.media[0].media_url}
                    alt="Observation"
                    className="w-full h-64 object-cover rounded-2xl border border-white/[0.08]"
                  />
                </div>
              )}

              <div className="bg-slate-950/70 border border-white/[0.08] rounded-2xl p-4 text-xs space-y-2 text-slate-300">
                <span className="text-[10px] font-bold text-slate-400 font-mono uppercase block">Description</span>
                <p>{selectedReport.raw_text || 'No description provided.'}</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 text-[10px] font-mono text-slate-400 border-t border-white/[0.06]">
                  <div>Ward: {selectedReport.ward_name || 'BBMP Urban'}</div>
                  <div>Source: {selectedReport.source}</div>
                  <div>Confidence: {selectedReport.ai_confidence ? `${Math.round(selectedReport.ai_confidence * 100)}%` : 'N/A'}</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="glass-card rounded-3xl border border-white/[0.08] p-12 text-center text-xs text-slate-400 space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-white/[0.08] mx-auto flex items-center justify-center">
                <Eye className="w-6 h-6 text-slate-500" />
              </div>
              <h3 className="text-sm font-bold text-white">Select a Civic Report to Inspect</h3>
              <p className="max-w-md mx-auto text-slate-500 leading-relaxed">
                Choose an observation from the left or search by ticket code above to view the complete official BBMP resolution lifecycle, repair before/after photos, and SLA audit trail.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
