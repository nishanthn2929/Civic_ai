import React, { useState, useEffect } from 'react';
import {
  Layers, AlertTriangle, CheckCircle2, Split, MapPin, Tag,
  ImageIcon, FileText, RefreshCw, Search, Sparkles, ShieldAlert,
  ChevronDown, ChevronUp, ExternalLink, Filter, ArrowUpRight
} from 'lucide-react';
import { adminService } from '../../services/api';
import { formatDateTime } from '../../utils/dateUtils';

export default function DuplicateClusterManager() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedGroups, setExpandedGroups] = useState({});
  const [unlinkingId, setUnlinkingId] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);

  const fetchClusters = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminService.getDuplicateGroups();
      setData(res);
      // Auto expand all groups initially
      const expanded = {};
      (res.groups || []).forEach((g) => {
        expanded[g.group_id] = true;
      });
      setExpandedGroups(expanded);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.detail || 'Failed to load duplicate clusters.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClusters();
  }, []);

  const toggleGroup = (groupId) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId]
    }));
  };

  const handleUnlink = async (reportId, groupId) => {
    if (!window.confirm(`Are you sure you want to unlink Report #${reportId}? It will be converted into its own independent municipal incident.`)) {
      return;
    }
    setUnlinkingId(reportId);
    setActionSuccess(null);
    try {
      const res = await adminService.unlinkDuplicate(reportId);
      setActionSuccess(`Report #${reportId} successfully unlinked! New incident: ${res.new_incident_code}`);
      await fetchClusters();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to unlink report.');
    } finally {
      setUnlinkingId(null);
    }
  };

  const summary = data?.summary || {};
  const groups = data?.groups || [];

  const filteredGroups = groups.filter((g) => {
    const inc = g.primary_incident || {};
    const q = searchQuery.toLowerCase();
    return (
      (inc.incident_code || '').toLowerCase().includes(q) ||
      (inc.category || '').toLowerCase().includes(q) ||
      (inc.ward_name || '').toLowerCase().includes(q) ||
      (inc.title || '').toLowerCase().includes(q) ||
      (g.group_id || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* KPI Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1 */}
        <div className="glass-card p-5 rounded-2xl border border-purple-500/20 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-slate-400 font-bold">
            <span>Duplicate Clusters</span>
            <Layers className="w-4 h-4 text-purple-400" />
          </div>
          <div className="mt-2 text-2xl font-black text-white font-mono">
            {summary.duplicate_clusters_count ?? 0}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Active multi-report groupings
          </p>
        </div>

        {/* KPI 2 */}
        <div className="glass-card p-5 rounded-2xl border border-emerald-500/20 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-slate-400 font-bold">
            <span>Merged Citizen Reports</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-black text-white font-mono">
            {summary.total_duplicate_reports_merged ?? 0}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Redundant tickets avoided
          </p>
        </div>

        {/* KPI 3 */}
        <div className="glass-card p-5 rounded-2xl border border-cyan-500/20 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-slate-400 font-bold">
            <span>Workload Reduction</span>
            <Sparkles className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="mt-2 text-2xl font-black text-white font-mono">
            {summary.estimated_duplicate_prevention_rate ?? 0}%
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Prevention rate across system
          </p>
        </div>

        {/* KPI 4: Multi-Signal Engine Rules */}
        <div className="glass-card p-5 rounded-2xl border border-amber-500/20 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-slate-400 font-bold">
            <span>Classification Rules</span>
            <ShieldAlert className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2 text-xs font-mono space-y-0.5">
            <div className="flex justify-between text-emerald-400">
              <span>Auto-Merge:</span>
              <span>≥85%</span>
            </div>
            <div className="flex justify-between text-amber-400">
              <span>Confirm Modal:</span>
              <span>70%–84%</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Search Radius:</span>
              <span>50m</span>
            </div>
          </div>
        </div>
      </div>

      {/* Signal Weights Architecture Bar */}
      <div className="glass-card rounded-2xl p-4 border border-white/[0.08] space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-bold text-slate-200 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            Duplicate Multi-Signal Evaluation Weights (50m Search Radius)
          </span>
          <span className="text-[11px] text-slate-400">Normalized dynamic weight distribution</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <div className="p-2.5 rounded-xl bg-slate-950/60 border border-emerald-500/20 flex items-center justify-between">
            <span className="flex items-center gap-1 text-slate-300">
              <MapPin className="w-3 h-3 text-emerald-400" /> Location (GPS)
            </span>
            <span className="font-mono font-bold text-emerald-400">30%</span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-950/60 border border-cyan-500/20 flex items-center justify-between">
            <span className="flex items-center gap-1 text-slate-300">
              <Tag className="w-3 h-3 text-cyan-400" /> Issue Type
            </span>
            <span className="font-mono font-bold text-cyan-400">25%</span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-950/60 border border-purple-500/20 flex items-center justify-between">
            <span className="flex items-center gap-1 text-slate-300">
              <ImageIcon className="w-3 h-3 text-purple-400" /> Visual Embeddings
            </span>
            <span className="font-mono font-bold text-purple-400">25%</span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-950/60 border border-amber-500/20 flex items-center justify-between">
            <span className="flex items-center gap-1 text-slate-300">
              <FileText className="w-3 h-3 text-amber-400" /> Semantic Text
            </span>
            <span className="font-mono font-bold text-amber-400">20%</span>
          </div>
        </div>
      </div>

      {/* Action Success Alert */}
      {actionSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs flex items-center justify-between animate-in fade-in">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            {actionSuccess}
          </span>
          <button onClick={() => setActionSuccess(null)} className="text-emerald-400 hover:text-white text-xs">
            Dismiss
          </button>
        </div>
      )}

      {/* Search and Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by incident code, category, ward, or group ID..."
            className="input-premium w-full pl-9 pr-4 py-2 rounded-xl text-xs text-white"
          />
        </div>
        <button
          onClick={fetchClusters}
          disabled={loading}
          className="btn-ghost flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-slate-300 hover:text-white"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-purple-400' : ''}`} />
          <span>Refresh Clusters</span>
        </button>
      </div>

      {/* Clusters List */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 space-y-3">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto text-purple-400" />
          <p className="text-xs">Analyzing duplicate groups and multi-modal signals...</p>
        </div>
      ) : error ? (
        <div className="p-6 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
          {error}
        </div>
      ) : filteredGroups.length === 0 ? (
        <div className="glass-card p-12 rounded-3xl text-center space-y-3 border border-white/[0.08]">
          <Layers className="w-12 h-12 text-slate-600 mx-auto" />
          <h4 className="text-base font-bold text-white">No Duplicate Clusters Found</h4>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            {searchQuery
              ? 'No clusters match your search query. Try searching by another keyword.'
              : 'When citizens submit similar civic complaints within 50m of active incidents, they will automatically be grouped and listed here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredGroups.map((group) => {
            const primary = group.primary_incident || {};
            const isExpanded = !!expandedGroups[group.group_id];
            const avgScorePercent = Math.round((group.avg_duplicate_score || 0.85) * 100);

            return (
              <div
                key={group.group_id}
                className="glass-card rounded-2xl border border-white/[0.08] overflow-hidden shadow-lg transition-all"
              >
                {/* Cluster Header */}
                <div
                  onClick={() => toggleGroup(group.group_id)}
                  className="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3 cursor-pointer hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-300 flex items-center justify-center shrink-0">
                      <Layers className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-purple-300">
                          {group.group_id}
                        </span>
                        <span className="font-mono text-xs px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                          #{primary.incident_code || `INC-${primary.id}`}
                        </span>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                          {primary.category}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 mt-1 font-medium">
                        {primary.title || 'Civic Issue'}
                      </p>
                      <p className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                        <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                        {primary.ward_name || 'Bengaluru Urban'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span className="text-xs font-mono font-bold text-amber-400 bg-amber-500/15 px-2.5 py-1 rounded-lg border border-amber-500/30">
                        {avgScorePercent}% Avg Similarity
                      </span>
                      <p className="text-[10px] text-slate-400 mt-1">
                        {group.duplicates_count} merged ({group.reports_count} total reports)
                      </p>
                    </div>
                    <button className="text-slate-400 p-1 rounded hover:bg-white/[0.05]">
                      {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                {/* Expanded Reports Table */}
                {isExpanded && (
                  <div className="border-t border-white/[0.08] bg-slate-950/60 p-4 space-y-3">
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Reports Linked in this Duplicate Group ({group.reports.length})
                    </div>

                    <div className="space-y-2.5">
                      {group.reports.map((rep) => {
                        const scoreP = rep.duplicate_score ? Math.round(rep.duplicate_score * 100) : 85;
                        const sigs = rep.duplicate_signals || {};
                        const locSig = sigs.location || {};
                        const catSig = sigs.category || {};
                        const visSig = sigs.visual || {};
                        const txtSig = sigs.text || {};

                        return (
                          <div
                            key={rep.id}
                            className={`p-3.5 rounded-xl border transition-all ${
                              rep.is_primary
                                ? 'bg-purple-950/20 border-purple-500/40'
                                : 'bg-slate-900/80 border-white/[0.06] hover:border-white/[0.12]'
                            }`}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="space-y-1.5 flex-1 min-w-[200px]">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-xs font-bold text-white">
                                    Report #{rep.id}
                                  </span>
                                  {rep.is_primary ? (
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40">
                                      PRIMARY INCIDENT ROOT
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                      {rep.duplicate_status || 'CONFIRMED_DUPLICATE'}
                                    </span>
                                  )}
                                  <span className="text-[11px] text-slate-400">
                                    {rep.created_at ? formatDateTime(rep.created_at) : 'Recently'}
                                  </span>
                                </div>

                                <p className="text-xs text-slate-300 italic">
                                  "{rep.raw_text || 'No text description'}"
                                </p>
                                <p className="text-[11px] text-slate-400 truncate">
                                  📍 {rep.address || 'Bengaluru location'}
                                </p>

                                {/* Multi-signal breakdown chips for non-primary reports */}
                                {!rep.is_primary && (
                                  <div className="flex flex-wrap gap-2 pt-1">
                                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-white/[0.05]">
                                      📍 GPS: {locSig.distance_meters !== undefined ? `${Math.round(locSig.distance_meters)}m away` : 'Within 50m'}
                                    </span>
                                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-white/[0.05]">
                                      🏷️ Type: {Math.round((catSig.score || 1) * 100)}%
                                    </span>
                                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-white/[0.05]">
                                      📷 Visual: {Math.round((visSig.score || 0.8) * 100)}%
                                    </span>
                                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-white/[0.05]">
                                      📝 Text: {Math.round((txtSig.score || 0.7) * 100)}%
                                    </span>
                                  </div>
                                )}
                              </div>

                              {/* Right side: Score & Unlink Button */}
                              <div className="flex flex-col items-end gap-2 shrink-0">
                                {!rep.is_primary && (
                                  <span className="text-xs font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/25">
                                    {scoreP}% Match
                                  </span>
                                )}

                                {!rep.is_primary && (
                                  <button
                                    onClick={() => handleUnlink(rep.id, group.group_id)}
                                    disabled={unlinkingId === rep.id}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-bold transition-all disabled:opacity-50 active:scale-95"
                                    title="Decouple this report into its own independent ticket"
                                  >
                                    {unlinkingId === rep.id ? (
                                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <Split className="w-3.5 h-3.5" />
                                    )}
                                    <span>Unlink Report</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
