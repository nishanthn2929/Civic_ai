import React from 'react';
import { Shield, Car, Mic, PlusCircle, LayoutDashboard, BarChart3, Settings, LogIn, LogOut, User, Sparkles, Radio } from 'lucide-react';

export default function Navbar({ activeTab, setActiveTab, currentUser, onOpenAuth, onLogout }) {
  return (
    <header className="sticky top-0 z-50 w-full transition-all duration-300">
      <nav 
        aria-label="Primary navigation" 
        className="premium-navbar relative w-full px-4 sm:px-6 lg:px-8 py-2.5 flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.12] backdrop-blur-2xl bg-slate-950/80 shadow-[0_8px_32px_rgba(0,0,0,0.6)]"
      >
        {/* Top Specular Horizon Light Beam */}
        <div className="navbar-specular-beam pointer-events-none absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-white/40 to-transparent" />

        {/* Ambient Subtle Underglow along bottom border */}
        <div className="navbar-ambient-glow pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-emerald-500/20 via-cyan-500/20 to-amber-500/20 blur-sm opacity-80" />

        {/* Brand Emblem & City Seal */}
        <div 
          className="flex items-center gap-3 cursor-pointer select-none group" 
          onClick={() => setActiveTab('public')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setActiveTab('public')}
        >
          {/* 3D Realistic Emblem Badge */}
          <div className="relative w-10 h-10 rounded-xl bg-gradient-to-b from-emerald-400 via-teal-500 to-emerald-700 flex items-center justify-center p-[1px] shadow-[0_4px_16px_rgba(16,185,129,0.4),inset_0_1px_1px_rgba(255,255,255,0.7)] transition-all duration-300 group-hover:scale-105 group-active:scale-95 group-hover:shadow-[0_6px_22px_rgba(16,185,129,0.6)]">
            <div className="w-full h-full rounded-[11px] bg-gradient-to-b from-slate-900/60 to-slate-950/90 flex items-center justify-center backdrop-blur-sm border border-white/20">
              <Shield className="w-5 h-5 text-emerald-300 stroke-[2.4] drop-shadow-[0_2px_8px_rgba(52,211,153,0.8)] transition-transform duration-300 group-hover:rotate-[-6deg]" />
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-slate-950 shadow-[0_0_8px_#34d399] flex items-center justify-center">
              <span className="w-1 h-1 rounded-full bg-white animate-ping" />
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-[1.05rem] tracking-tight text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)] font-display flex items-center gap-1">
                Civic<span className="text-emerald-400 font-black">AI</span>
              </span>
              <span className="text-[10px] font-bold bg-gradient-to-r from-emerald-950/90 to-teal-950/90 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-full flex items-center gap-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_2px_8px_rgba(16,185,129,0.2)]">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,1)] animate-pulse" />
                BBMP Official
              </span>
            </div>
            <p className="text-[11px] text-slate-300/85 font-medium flex items-center gap-1.5">
              <span>Bengaluru Municipal AI</span>
              <span className="text-slate-600">•</span>
              <span className="text-emerald-400/90 font-mono text-[10px]">v2.6 Live</span>
            </p>
          </div>
        </div>

        {/* Navigation Tabs Dock (Tactile Recessed Control Bar) */}
        <div className="nav-dock flex items-center gap-1 p-1 rounded-xl overflow-x-auto max-w-full">
          {/* 1. Public Transparency (Arctic Sky / Cyan) */}
          <button
            onClick={() => setActiveTab('public')}
            className={`nav-btn nav-btn-sky ${
              activeTab === 'public' ? 'nav-btn-sky-active' : ''
            }`}
            title="Public Civic Intelligence Portal"
          >
            <BarChart3 className="w-4 h-4 stroke-[2.2]" />
            <span>Public Portal</span>
          </button>

          {/* 2. Citizen Manual Report (Civic Emerald) */}
          <button
            onClick={() => setActiveTab('report')}
            className={`nav-btn nav-btn-emerald ${
              activeTab === 'report' ? 'nav-btn-emerald-active' : ''
            }`}
            title="Report Civic Hazard / Infrastructure Pothole"
          >
            <PlusCircle className="w-4 h-4 stroke-[2.2]" />
            <span>Report Issue</span>
          </button>

          {/* 3. Voice Report (Aurora Violet) */}
          <button
            onClick={() => setActiveTab('voice')}
            className={`nav-btn nav-btn-violet ${
              activeTab === 'voice' ? 'nav-btn-violet-active' : ''
            }`}
            title="Kannada & English Voice Grievance"
          >
            <Mic className="w-4 h-4 stroke-[2.2]" />
            <span>Voice</span>
          </button>

          {/* 4. AI Video Drive Mode (Aviation Amber) */}
          <button
            onClick={() => setActiveTab('drive')}
            className={`nav-btn nav-btn-amber ${
              activeTab === 'drive' ? 'nav-btn-amber-active' : ''
            }`}
            title="Autonomous Dashcam Road Surface Scanner"
          >
            <Car className="w-4 h-4 stroke-[2.2]" />
            <span>Drive Mode</span>
            <span
              className={`w-1.5 h-1.5 rounded-full ml-0.5 transition-all ${
                activeTab === 'drive'
                  ? 'bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,1)] animate-ping'
                  : 'bg-amber-400/60'
              }`}
            />
          </button>

          {/* 5. My Reports (Citizen Mint / Teal) */}
          <button
            onClick={() => setActiveTab('my_reports')}
            className={`nav-btn nav-btn-teal ${
              activeTab === 'my_reports' ? 'nav-btn-teal-active' : ''
            }`}
            title="View Your Submitted Grievances & Tracking"
          >
            <User className="w-4 h-4 stroke-[2.2]" />
            <span>My Reports</span>
          </button>

          {/* 6. Authority Dashboard (Electric Cobalt) */}
          {(!currentUser || currentUser.role === 'authority' || currentUser.role === 'admin') && (
            <button
              onClick={() => setActiveTab('authority')}
              className={`nav-btn nav-btn-blue ${
                activeTab === 'authority' ? 'nav-btn-blue-active' : ''
              }`}
              title="Official Ward Engineer & BBMP Telemetry"
            >
              <LayoutDashboard className="w-4 h-4 stroke-[2.2]" />
              <span>Authority</span>
            </button>
          )}

          {/* 7. Admin Configuration (Imperial Fuchsia / Rose) */}
          {currentUser?.role === 'admin' && (
            <button
              onClick={() => setActiveTab('admin')}
              className={`nav-btn nav-btn-fuchsia ${
                activeTab === 'admin' ? 'nav-btn-fuchsia-active' : ''
              }`}
              title="Platform Engine Configuration & Ward Mapping"
            >
              <Settings className="w-4 h-4 stroke-[2.2]" />
              <span>Admin</span>
            </button>
          )}
        </div>

        {/* User Account / Role status & Realistic Jewel Action Button */}
        <div className="flex items-center gap-3">
          {currentUser ? (
            <div className="flex items-center gap-2.5 bg-gradient-to-b from-slate-900/90 to-slate-950/95 border border-white/[0.14] rounded-xl px-3 py-1.5 backdrop-blur-md shadow-[0_4px_16px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.12)]">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-b from-emerald-400 to-teal-600 p-[1px] shadow-[0_2px_8px_rgba(16,185,129,0.35)] flex items-center justify-center">
                <div className="w-full h-full rounded-[7px] bg-slate-950/80 flex items-center justify-center text-emerald-300 font-extrabold text-xs">
                  {currentUser.name?.[0]?.toUpperCase() || 'U'}
                </div>
              </div>
              <div className="text-right hidden sm:block">
                <div className="text-xs font-bold text-white tracking-tight leading-tight">{currentUser.name}</div>
                <div className="text-[9px] font-mono font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1 justify-end">
                  <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
                  {currentUser.role}
                </div>
              </div>
              <button
                onClick={onLogout}
                title="Sign out of current account"
                className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-white/[0.08] hover:border-rose-500/40 transition-all duration-200 ml-1 cursor-pointer active:scale-95 shadow-sm"
              >
                <LogOut className="w-3.5 h-3.5 stroke-[2.2]" />
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenAuth}
              className="nav-auth-btn group"
              title="Switch roles or login to authority terminal"
            >
              <LogIn className="w-4 h-4 stroke-[2.5] transition-transform duration-200 group-hover:translate-x-0.5" />
              <span>Login / Roles</span>
            </button>
          )}
        </div>
      </nav>
    </header>
  );
}
