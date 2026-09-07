import React, { useState, useEffect } from 'react';
import { BarChart3, ShieldCheck, CheckCircle2, Clock, MapPin, Layers, Award, TrendingUp, RefreshCw } from 'lucide-react';
import { publicService } from '../../services/api';
import IncidentMap from '../../components/IncidentMap';

export default function PublicDashboardPage() {
  const [stats, setStats] = useState(null);
  const [mapIncidents, setMapIncidents] = useState([]);
  const [wardGeoJson, setWardGeoJson] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchPublicData = async () => {
    setLoading(true);
    try {
      const [s, incs, geo] = await Promise.all([
        publicService.getStats(),
        publicService.getMapIncidents(),
        publicService.getWardGeoJson()
      ]);
      setStats(s);
      setMapIncidents(incs);
      setWardGeoJson(geo);
    } catch (err) {
      console.error('Error fetching public stats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPublicData();
  }, []);

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      {/* City Hero Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        <div className="max-w-2xl space-y-3 relative z-10">
          <div className="flex items-center gap-2">
            <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-3 py-1 rounded-full font-bold">
              Government Open Data & Transparency
            </span>
            <span className="text-xs text-slate-400 font-mono">Bengaluru BBMP</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
            Bengaluru Civic Transparency Portal
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            Real-time public tracking of municipal road repairs, civic complaints, and BBMP administrative ward performance. Zero citizen personal information is collected or displayed.
          </p>
        </div>
      </div>

      {/* Primary KPI Scorecards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl text-center space-y-1">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">Total Issues Logged</span>
            <span className="text-3xl font-black text-white">{stats.total_incidents}</span>
            <span className="text-[10px] text-slate-500 block">Citizen & Dashcam</span>
          </div>
          <div className="bg-slate-900 border border-emerald-500/30 p-4 rounded-2xl text-center space-y-1 bg-emerald-500/5">
            <span className="text-[10px] text-emerald-400 uppercase tracking-wider block font-semibold">Repairs Completed</span>
            <span className="text-3xl font-black text-emerald-400">{stats.resolved_incidents}</span>
            <span className="text-[10px] text-emerald-500/70 block">Verified on Ground</span>
          </div>
          <div className="bg-slate-900 border border-cyan-500/30 p-4 rounded-2xl text-center space-y-1">
            <span className="text-[10px] text-cyan-400 uppercase tracking-wider block font-semibold">Work In Progress</span>
            <span className="text-3xl font-black text-cyan-400">{stats.in_progress_incidents}</span>
            <span className="text-[10px] text-slate-500 block">Active Crews</span>
          </div>
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl text-center space-y-1">
            <span className="text-[10px] text-yellow-400 uppercase tracking-wider block font-semibold">Under Triage</span>
            <span className="text-3xl font-black text-yellow-400">{stats.pending_incidents}</span>
            <span className="text-[10px] text-slate-500 block">Awaiting Dispatch</span>
          </div>
          <div className="bg-slate-900 border border-emerald-500/30 p-4 rounded-2xl text-center space-y-1">
            <span className="text-[10px] text-emerald-400 uppercase tracking-wider block font-semibold">Resolution Rate</span>
            <span className="text-3xl font-black text-emerald-400">{stats.resolution_rate_percentage}%</span>
            <span className="text-[10px] text-emerald-500/70 block">SLA Compliance</span>
          </div>
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl text-center space-y-1">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">Avg Fix Time</span>
            <span className="text-3xl font-black text-cyan-400">{stats.avg_resolution_time_hours}h</span>
            <span className="text-[10px] text-slate-500 block">Median Turnaround</span>
          </div>
        </div>
      )}

      {/* Public Interactive Map */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <MapPin className="w-5 h-5 text-emerald-400" />
            <span>Open Civic Incident Map</span>
          </h2>
          <span className="text-xs text-slate-400">
            Click pins to inspect repair status • Showing {mapIncidents.length} locations
          </span>
        </div>
        <div className="h-[440px]">
          <IncidentMap incidents={mapIncidents} wardGeoJson={wardGeoJson} />
        </div>
      </div>

      {/* Ward Leaderboards & Category Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bengaluru Ward Scorecard */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-white text-sm flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-400" />
              <span>Bengaluru Ward Scorecard</span>
            </h3>
            <span className="text-[11px] text-slate-500">BBMP Administrative Wards</span>
          </div>

          <div className="divide-y divide-slate-800">
            {wardGeoJson?.features?.map((f) => {
              const p = f.properties;
              return (
                <div key={p.ward_number} className="py-2.5 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-white">{p.ward_name}</span>
                    <span className="text-[10px] text-slate-500 ml-2">Ward #{p.ward_number} • Zone: {p.zone_name}</span>
                  </div>
                  <div className="text-right flex items-center gap-3">
                    <span className="text-slate-400">{p.total_incidents || 0} issues</span>
                    <span className="font-bold text-emerald-400 font-mono">{p.resolution_rate || 100}% fixed</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Issue Category Distribution */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-white text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-cyan-400" />
              <span>Issue Categories Distribution</span>
            </h3>
            <span className="text-[11px] text-slate-500">Breakdown by Type</span>
          </div>

          <div className="space-y-3">
            {stats && Object.entries(stats.category_breakdown || {}).map(([cat, count]) => {
              const total = stats.total_incidents || 1;
              const pct = Math.round((count / total) * 100);
              return (
                <div key={cat} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-slate-300">{cat}</span>
                    <span className="font-mono text-slate-400">{count} reports ({pct}%)</span>
                  </div>
                  <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                    <div
                      className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
