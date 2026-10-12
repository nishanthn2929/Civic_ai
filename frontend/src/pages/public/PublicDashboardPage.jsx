import React, { useState, useEffect } from 'react';
import { 
  BarChart3, ShieldCheck, CheckCircle2, Clock, MapPin, Layers, 
  Award, TrendingUp, RefreshCw, Search, Filter, ArrowUpRight, 
  Sparkles, Check, AlertCircle, ExternalLink, Activity
} from 'lucide-react';
import { publicService } from '../../services/api';
import IncidentMap from '../../components/IncidentMap';

export default function PublicDashboardPage({ onNavigate }) {
  const [stats, setStats] = useState(null);
  const [mapIncidents, setMapIncidents] = useState([]);
  const [wardGeoJson, setWardGeoJson] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Interactive filters
  const [wardSearch, setWardSearch] = useState('');
  const [selectedZone, setSelectedZone] = useState('ALL');

  const fetchPublicData = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [statsResult, incidentsResult, geoResult] = await Promise.allSettled([
        publicService.getStats(),
        publicService.getMapIncidents(),
        publicService.getWardGeoJson()
      ]);
      if (statsResult.status === 'fulfilled' && statsResult.value) {
        setStats(statsResult.value);
      }
      if (incidentsResult.status === 'fulfilled' && Array.isArray(incidentsResult.value) && incidentsResult.value.length > 0) {
        setMapIncidents(incidentsResult.value);
      }
      if (geoResult.status === 'fulfilled' && geoResult.value) {
        setWardGeoJson(geoResult.value);
      }
    } catch (err) {
      console.error('Error fetching public stats:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchPublicData();
  }, []);

  // Filter wards
  const filteredWards = (wardGeoJson?.features || []).filter((f) => {
    const p = f.properties || {};
    const matchesSearch = 
      !wardSearch || 
      p.ward_name?.toLowerCase().includes(wardSearch.toLowerCase()) ||
      String(p.ward_number).includes(wardSearch);
    const matchesZone = selectedZone === 'ALL' || p.zone_name?.toUpperCase() === selectedZone.toUpperCase();
    return matchesSearch && matchesZone;
  });

  // Extract unique zones
  const uniqueZones = Array.from(
    new Set(
      (wardGeoJson?.features || [])
        .map((f) => f.properties?.zone_name)
        .filter(Boolean)
    )
  );

  const resolutionRate = stats?.resolution_rate_percentage ?? 88;

  return (
    <div className="w-full space-y-10">
      {/* Reference-style image hero: seamless with full-page backdrop */}
      <section className="public-hero relative w-full min-h-[calc(100vh-4.5rem)] flex items-center justify-center overflow-hidden animate-in-up">
        <div className="relative z-10 flex min-h-[calc(100vh-4.5rem)] flex-col items-center justify-center px-5 py-16 text-center sm:px-12 max-w-5xl mx-auto">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-200/30 bg-emerald-950/50 px-4 py-2 text-xs font-bold text-emerald-100 backdrop-blur-md shadow-lg shadow-emerald-950/40">
            <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,.9)]" />
            AI-Powered Civic Intelligence Platform
          </div>
          <h1 className="max-w-5xl text-4xl font-extrabold leading-[1.02] text-white sm:text-6xl lg:text-7xl drop-shadow-xl">
            AI-Powered Civic Intelligence<br />
            for <span className="text-emerald-300">Bengaluru</span>
          </h1>
          <p className="mt-7 max-w-2xl text-sm leading-7 text-white/80 sm:text-lg drop-shadow">
            Report city issues instantly using AI. Help authorities fix potholes and infrastructure problems faster.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <button onClick={() => onNavigate?.('report')} className="rounded-xl bg-emerald-400 px-7 py-3.5 text-sm font-extrabold text-emerald-950 shadow-xl shadow-emerald-950/30 transition hover:bg-emerald-300 active:scale-95 cursor-pointer">
              Report Issue <ArrowUpRight className="ml-2 inline h-4 w-4" />
            </button>
            <button onClick={() => document.getElementById('city-dashboard')?.scrollIntoView({ behavior: 'smooth' })} className="rounded-xl bg-white/95 px-7 py-3.5 text-sm font-extrabold text-emerald-950 shadow-xl transition hover:bg-white active:scale-95 cursor-pointer">
              View City Dashboard
            </button>
          </div>
        </div>
      </section>

      {/* Main Dashboard Analytics & GIS Layer */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8 pb-16">
        {/* Primary KPI Scorecards with Micro-Trends */}
        {stats && (
          <div id="city-dashboard" className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-6">
          {/* Total Logged */}
          <div className="glass-card sheen-card p-4 rounded-2xl space-y-1.5 animate-in-up delay-1 hover:border-slate-500/40">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block font-mono">Total Logged</span>
              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-white/[0.06] text-slate-300">All Time</span>
            </div>
            <div className="stat-value text-3xl text-white font-mono">{stats.total_incidents}</div>
            <div className="flex items-center gap-1 text-[10px] text-slate-400">
              <Sparkles className="w-3 h-3 text-emerald-400" />
              <span>Citizen & Video</span>
            </div>
          </div>

          {/* Repairs Completed */}
          <div className="glass-card sheen-card p-4 rounded-2xl space-y-1.5 border-emerald-500/30 animate-in-up delay-1 hover:border-emerald-400/60 shadow-lg shadow-emerald-500/5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block font-mono">Repairs Fixed</span>
              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-bold">Done</span>
            </div>
            <div className="stat-value text-3xl text-emerald-400 font-mono">{stats.resolved_incidents}</div>
            <div className="flex items-center gap-1 text-[10px] text-emerald-400/90 font-medium">
              <CheckCircle2 className="w-3 h-3" />
              <span>Verified On-Ground</span>
            </div>
          </div>

          {/* Active Crews */}
          <div className="glass-card sheen-card p-4 rounded-2xl space-y-1.5 border-cyan-500/30 animate-in-up delay-2 hover:border-cyan-400/60 shadow-lg shadow-cyan-500/5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider block font-mono">In Progress</span>
              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 font-bold">Active</span>
            </div>
            <div className="stat-value text-3xl text-cyan-400 font-mono">{stats.in_progress_incidents}</div>
            <div className="flex items-center gap-1 text-[10px] text-cyan-400/90 font-medium">
              <Activity className="w-3 h-3" />
              <span>Active BBMP Crews</span>
            </div>
          </div>

          {/* Under Triage */}
          <div className="glass-card sheen-card p-4 rounded-2xl space-y-1.5 border-amber-500/30 animate-in-up delay-2 hover:border-amber-400/60 shadow-lg shadow-amber-500/5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block font-mono">Under Triage</span>
              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold">Queue</span>
            </div>
            <div className="stat-value text-3xl text-amber-400 font-mono">{stats.pending_incidents}</div>
            <div className="flex items-center gap-1 text-[10px] text-amber-400/90 font-medium">
              <Clock className="w-3 h-3" />
              <span>Awaiting Dispatch</span>
            </div>
          </div>

          {/* Resolution Rate */}
          <div className="glass-card sheen-card p-4 rounded-2xl space-y-1.5 border-emerald-500/30 animate-in-up delay-3 hover:border-emerald-400/60 shadow-lg shadow-emerald-500/5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block font-mono">Resolution Rate</span>
              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-bold">SLA</span>
            </div>
            <div className="stat-value text-3xl text-emerald-400 font-mono">{stats.resolution_rate_percentage}%</div>
            <div className="flex items-center gap-1 text-[10px] text-emerald-400/90 font-medium">
              <ShieldCheck className="w-3 h-3" />
              <span>SLA Compliance</span>
            </div>
          </div>

          {/* Avg Fix Time */}
          <div className="glass-card sheen-card p-4 rounded-2xl space-y-1.5 border-purple-500/30 animate-in-up delay-3 hover:border-purple-400/60 shadow-lg shadow-purple-500/5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider block font-mono">Avg Fix Time</span>
              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 font-bold">Hours</span>
            </div>
            <div className="stat-value text-3xl text-purple-300 font-mono">{stats.avg_resolution_time_hours}h</div>
            <div className="flex items-center gap-1 text-[10px] text-purple-400/90 font-medium">
              <Clock className="w-3 h-3" />
              <span>Median Turnaround</span>
            </div>
          </div>
        </div>
      )}

      {/* Public Interactive Map */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <span className="eyebrow mb-1.5">Spatial Intelligence</span>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <MapPin className="w-5 h-5 text-emerald-400" />
              <span>Open Civic Incident Map</span>
            </h2>
            <p className="text-xs text-slate-400">
              High-resolution spatial GIS layer displaying live verified incidents across BBMP Wards
            </p>
          </div>
          <span className="chip text-slate-300 font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.9)]"></span>
            {mapIncidents.length} Visible Incidents
          </span>
        </div>

        <div className="relative rounded-2xl premium-border p-1 animate-in-up delay-2">
          <div className="h-[480px] rounded-xl overflow-hidden">
            <IncidentMap incidents={mapIncidents} wardGeoJson={wardGeoJson} />
          </div>
        </div>
      </div>

      {/* Ward Leaderboards & Category Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bengaluru Ward Scorecard */}
        <div className="glass-card rounded-2xl p-6 space-y-5 shadow-2xl flex flex-col animate-in-up delay-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="eyebrow mb-1.5">Ward Analytics</span>
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-400" />
                <span>BBMP Ward Performance Index</span>
              </h3>
              <p className="text-xs text-slate-400">Resolution rates across 198 administrative wards</p>
            </div>

            {/* Search Input */}
            <div className="relative min-w-[200px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={wardSearch}
                onChange={(e) => setWardSearch(e.target.value)}
                placeholder="Search ward or #..."
                className="input-premium w-full rounded-xl pl-8 pr-3 py-1.5 text-xs text-white"
              />
            </div>
          </div>

          {/* Zone Quick Filters */}
          {uniqueZones.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px]">
              <button
                onClick={() => setSelectedZone('ALL')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all whitespace-nowrap ${
                  selectedZone === 'ALL'
                    ? 'bg-emerald-500 text-slate-950 font-bold'
                    : 'bg-slate-950/50 text-slate-400 hover:text-white border border-white/[0.06]'
                }`}
              >
                All Zones
              </button>
              {uniqueZones.map((zone) => (
                <button
                  key={zone}
                  onClick={() => setSelectedZone(zone)}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-all whitespace-nowrap ${
                    selectedZone === zone
                      ? 'bg-emerald-500 text-slate-950 font-bold'
                      : 'bg-slate-950/50 text-slate-400 hover:text-white border border-white/[0.06]'
                  }`}
                >
                  {zone}
                </button>
              ))}
            </div>
          )}

          {/* Scrollable Ward List */}
          <div className="divide-y divide-white/[0.06] overflow-y-auto max-h-[380px] pr-1 flex-1">
            {filteredWards.length === 0 ? (
              <div className="text-center py-10 text-xs text-slate-500">
                No matching BBMP wards found for "{wardSearch}".
              </div>
            ) : (
              filteredWards.map((f, idx) => {
                const p = f.properties || {};
                const rate = p.resolution_rate || 100;
                return (
                  <div key={p.ward_number} className="py-3 flex items-center justify-between gap-3 text-xs group hover:bg-white/[0.02] px-2 rounded-xl transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-[11px] font-bold text-slate-500 w-5 text-right">
                        #{p.ward_number}
                      </span>
                      <div>
                        <div className="font-bold text-white group-hover:text-emerald-400 transition-colors">
                          {p.ward_name}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Zone: {p.zone_name || 'BBMP Central'}
                        </div>
                      </div>
                    </div>

                    <div className="text-right flex items-center gap-4">
                      <div className="text-right">
                        <span className="font-mono font-bold text-white">{p.total_incidents || 0}</span>
                        <span className="text-[10px] text-slate-500 ml-1">issues</span>
                      </div>
                      <div className="w-24 hidden sm:block">
                        <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-white/[0.08]">
                          <div
                            className={`h-full rounded-full ${
                              rate >= 80 ? 'bg-emerald-400' : rate >= 50 ? 'bg-amber-400' : 'bg-red-400'
                            }`}
                            style={{ width: `${rate}%` }}
                          />
                        </div>
                      </div>
                      <span className={`font-mono font-bold text-xs ${
                        rate >= 80 ? 'text-emerald-400' : rate >= 50 ? 'text-amber-400' : 'text-red-400'
                      }`}>
                        {rate}%
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Issue Category Distribution */}
        <div className="glass-card rounded-2xl p-6 space-y-5 shadow-2xl flex flex-col animate-in-up delay-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="eyebrow mb-1.5">Hazard Analytics</span>
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-cyan-400" />
                <span>Issue Category Breakdown</span>
              </h3>
              <p className="text-xs text-slate-400">Distribution of road & civic hazards</p>
            </div>
            <span className="chip text-slate-300 font-mono">{stats?.total_incidents || 0} Total</span>
          </div>

          <div className="space-y-4 pt-1 flex-1">
            {stats && Object.entries(stats.category_breakdown || {}).map(([cat, count], index) => {
              const total = stats.total_incidents || 1;
              const pct = Math.round((count / total) * 100);
              
              // Color schemes for different categories
              const colorGradients = [
                'from-emerald-500 to-teal-400',
                'from-cyan-500 to-blue-500',
                'from-amber-400 to-orange-500',
                'from-purple-500 to-indigo-500',
                'from-rose-500 to-pink-500'
              ];
              const gradient = colorGradients[index % colorGradients.length];

              return (
                <div key={cat} className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-200">{cat}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-slate-400">{count} reports</span>
                      <span className="font-mono font-bold text-white bg-slate-950 px-2 py-0.5 rounded border border-white/[0.06]">
                        {pct}%
                      </span>
                    </div>
                  </div>
                  <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden border border-white/[0.08]">
                    <div
                      className={`bg-gradient-to-r ${gradient} h-full rounded-full transition-all duration-700 ease-out`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Citizen Verification Transparency Banner */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-white/[0.08] flex items-center gap-3 mt-auto">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div className="text-[11px] text-slate-400 leading-snug">
              <span className="font-bold text-slate-200">Zero PII Policy:</span> No citizen identities, phone numbers, or user metadata are ever exposed publicly. All telemetry is aggregated at the authoritative BBMP ward level.
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);
}

