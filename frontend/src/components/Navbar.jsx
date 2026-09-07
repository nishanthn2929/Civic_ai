import React from 'react';
import { Shield, Car, Mic, PlusCircle, LayoutDashboard, BarChart3, Settings, LogIn, LogOut, User, MapPin } from 'lucide-react';

export default function Navbar({ activeTab, setActiveTab, currentUser, onOpenAuth, onLogout }) {
  return (
    <nav className="bg-slate-900 border-b border-slate-800 sticky top-0 z-50 px-4 py-3">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
        {/* Logo and City Badge */}
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setActiveTab('public')}>
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Shield className="w-6 h-6 text-slate-950 stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg text-white tracking-tight">CivicAI</span>
              <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-medium">Bengaluru BBMP</span>
            </div>
            <p className="text-xs text-slate-400">Smart Civic Reporting & AI Dashcam</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 bg-slate-950/70 p-1.5 rounded-xl border border-slate-800 overflow-x-auto">
          {/* Public Transparency */}
          <button
            onClick={() => setActiveTab('public')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'public'
                ? 'bg-emerald-500 text-slate-950 font-semibold shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Public Portal</span>
          </button>

          {/* Citizen Manual Report */}
          <button
            onClick={() => setActiveTab('report')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'report'
                ? 'bg-emerald-500 text-slate-950 font-semibold shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <PlusCircle className="w-4 h-4" />
            <span>Report Issue</span>
          </button>

          {/* Voice Report */}
          <button
            onClick={() => setActiveTab('voice')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'voice'
                ? 'bg-emerald-500 text-slate-950 font-semibold shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Mic className="w-4 h-4" />
            <span>Voice</span>
          </button>

          {/* AI Dashcam Drive Mode */}
          <button
            onClick={() => setActiveTab('drive')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'drive'
                ? 'bg-amber-400 text-slate-950 font-bold shadow-sm animate-pulse'
                : 'text-amber-400 hover:bg-amber-400/10'
            }`}
          >
            <Car className="w-4 h-4" />
            <span>Drive Mode</span>
          </button>

          {/* My Reports */}
          {currentUser && currentUser.role === 'citizen' && (
            <button
              onClick={() => setActiveTab('my_reports')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'my_reports'
                  ? 'bg-emerald-500 text-slate-950 font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <User className="w-4 h-4" />
              <span>My Reports</span>
            </button>
          )}

          {/* Authority Dashboard */}
          {(!currentUser || currentUser.role === 'authority' || currentUser.role === 'admin') && (
            <button
              onClick={() => setActiveTab('authority')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'authority'
                  ? 'bg-cyan-500 text-slate-950 font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Authority Dashboard</span>
            </button>
          )}

          {/* Admin Configuration */}
          {(!currentUser || currentUser.role === 'admin') && (
            <button
              onClick={() => setActiveTab('admin')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'admin'
                  ? 'bg-purple-500 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Settings className="w-4 h-4" />
              <span>Admin</span>
            </button>
          )}
        </div>

        {/* User Account / Role status */}
        <div className="flex items-center gap-3">
          {currentUser ? (
            <div className="flex items-center gap-2">
              <div className="text-right hidden sm:block">
                <div className="text-xs font-semibold text-white">{currentUser.name}</div>
                <div className="text-[10px] text-emerald-400 uppercase tracking-wider">{currentUser.role}</div>
              </div>
              <button
                onClick={onLogout}
                title="Logout"
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenAuth}
              className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-semibold px-3.5 py-1.5 rounded-lg text-xs shadow-md shadow-emerald-500/20 transition-all"
            >
              <LogIn className="w-4 h-4" />
              <span>Login / Roles</span>
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
