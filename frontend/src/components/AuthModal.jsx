import React, { useState, useEffect } from 'react';
import { X, Shield, Lock, Mail, User as UserIcon, Eye, EyeOff, Loader2 } from 'lucide-react';
import { authService } from '../services/api';

const roleOptions = [
  {
    id: 'citizen',
    label: 'Citizen',
    name: 'Ananya Sharma',
    sub: 'Public Portal',
    email: 'citizen.ananya@gmail.com',
    pass: 'Citizen@123',
    role: 'citizen',
    borderActive: 'border-emerald-500/80 bg-emerald-950/50 text-emerald-300 shadow-[0_0_16px_rgba(16,185,129,0.25)]',
    dot: 'bg-emerald-400',
  },
  {
    id: 'authority',
    label: 'BBMP Officer',
    name: 'Er. Ramesh Kumar',
    sub: 'Authority Terminal',
    email: 'officer.roads@bbmp.gov.in',
    pass: 'Officer@123',
    role: 'authority',
    borderActive: 'border-cyan-500/80 bg-cyan-950/50 text-cyan-300 shadow-[0_0_16px_rgba(6,182,212,0.25)]',
    dot: 'bg-cyan-400',
  },
  {
    id: 'admin',
    label: 'City Admin',
    name: 'Central Admin',
    sub: 'Governance & AI',
    email: 'admin@bengaluru.gov.in',
    pass: 'Admin@123',
    role: 'admin',
    borderActive: 'border-purple-500/80 bg-purple-950/50 text-purple-300 shadow-[0_0_16px_rgba(168,85,247,0.25)]',
    dot: 'bg-purple-400',
  },
];

export default function AuthModal({ isOpen, onClose, onAuthSuccess }) {
  const [selectedRoleId, setSelectedRoleId] = useState('citizen');
  const [isRegister, setIsRegister] = useState(false);

  const [email, setEmail] = useState('citizen.ananya@gmail.com');
  const [password, setPassword] = useState('Citizen@123');
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const currentRole = roleOptions.find((r) => r.id === selectedRoleId) || roleOptions[0];

  // When changing role, pre-fill credentials for that role
  const handleSelectRole = (roleItem) => {
    setSelectedRoleId(roleItem.id);
    setError(null);
    if (!isRegister) {
      setEmail(roleItem.email);
      setPassword(roleItem.pass);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setLoading(false);
      if (!isRegister) {
        setEmail(currentRole.email);
        setPassword(currentRole.pass);
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Submit Email & Password login or register
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (isRegister) {
        const res = await authService.register({
          name: name.trim() || 'Citizen',
          email: email.trim(),
          password,
          phone,
          role: currentRole.role
        });
        onAuthSuccess(res.user);
      } else {
        const res = await authService.login(email.trim(), password);
        onAuthSuccess(res.user);
      }
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || 'Authentication failed. Please verify email and password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-3xl premium-border overflow-hidden bg-slate-950/95 border border-white/[0.12] shadow-[0_20px_60px_rgba(0,0,0,0.85)] animate-in zoom-in-95 duration-200">
        {/* Ambient glow inside modal */}
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="relative p-5 sm:p-6 border-b border-white/[0.08] flex items-center justify-between bg-slate-950/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-500 to-cyan-500 flex items-center justify-center text-slate-950 shadow-lg shadow-emerald-500/30">
              <Shield className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h3 className="font-extrabold text-white text-base tracking-tight">
                {isRegister ? 'Register Citizen Account' : 'Sign In to CivicAI'}
              </h3>
              <p className="text-xs text-slate-400">Bengaluru Municipal Intelligence Terminal</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-white/[0.08] transition-colors cursor-pointer"
            title="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Role Selector Tabs (Citizen, BBMP Officer, City Admin) */}
        {!isRegister && (
          <div className="relative px-5 pt-4 pb-2 bg-slate-900/40 border-b border-white/[0.06]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                Select Sign-In Role
              </span>
              <span className="text-[10px] text-slate-400 font-medium">
                Choose portal to authenticate
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {roleOptions.map((r) => {
                const isActive = selectedRoleId === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => handleSelectRole(r)}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer relative ${
                      isActive
                        ? r.borderActive
                        : 'border-white/[0.08] bg-slate-950/60 hover:bg-slate-900 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="font-bold text-xs">{r.label}</span>
                      {isActive && (
                        <span className={`w-1.5 h-1.5 rounded-full ${r.dot} animate-pulse`} />
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400 truncate font-mono">{r.sub}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Authentication Form */}
        <form onSubmit={handleSubmit} className="relative p-5 sm:p-6 space-y-4">
          {error && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-medium animate-in fade-in">
              {error}
            </div>
          )}

          {isRegister && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Full Name</label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Ramesh Gowda"
                  className="input-premium w-full rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-white placeholder-slate-500"
                />
              </div>
            </div>
          )}

          {/* Email Address */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-300">Email Address</label>
              {!isRegister && (
                <button
                  type="button"
                  onClick={() => {
                    setEmail(currentRole.email);
                    setPassword(currentRole.pass);
                  }}
                  className="text-[10px] text-emerald-400 hover:text-emerald-300 font-mono transition-colors cursor-pointer"
                  title="Fill default credentials for this role"
                >
                  Use default
                </button>
              )}
            </div>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@bengaluru.in"
                className="input-premium w-full rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-white placeholder-slate-500"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="input-premium w-full rounded-xl pl-10 pr-10 py-2.5 text-xs text-white placeholder-slate-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200 transition-colors p-0.5 cursor-pointer"
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="btn-premium w-full py-3 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer shadow-lg active:scale-[0.99] disabled:opacity-60"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Authenticating...</span>
              </>
            ) : isRegister ? (
              'Create Citizen Account'
            ) : (
              `Sign In as ${currentRole.label}`
            )}
          </button>

          {/* Toggle Sign in / Register */}
          <div className="text-center pt-1">
            <button
              type="button"
              onClick={() => {
                setIsRegister(!isRegister);
                setError(null);
                if (!isRegister) {
                  setEmail('');
                  setPassword('');
                } else {
                  setEmail(currentRole.email);
                  setPassword(currentRole.pass);
                }
              }}
              className="text-xs text-slate-400 hover:text-emerald-400 font-medium transition-colors cursor-pointer"
            >
              {isRegister ? 'Already have an account? Sign in' : "Don't have an account? Register as Citizen"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
