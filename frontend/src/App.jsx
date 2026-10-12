import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import AuthModal from './components/AuthModal';
import CivicAssistant from './components/CivicAssistant';
import CustomCursor from './components/CustomCursor';
import PublicDashboardPage from './pages/public/PublicDashboardPage';
import ManualReportPage from './pages/citizen/ManualReportPage';
import VoiceReportPage from './pages/citizen/VoiceReportPage';
import DriveModePage from './pages/citizen/DriveModePage';
import MyReportsPage from './pages/citizen/MyReportsPage';
import AuthorityDashboardPage from './pages/authority/AuthorityDashboardPage';
import AdminConfigPage from './pages/admin/AdminConfigPage';
import ErrorBoundary from './components/ErrorBoundary';
import { authService } from './services/api';

export default function App() {
  const [activeTab, setActiveTab] = useState('public');
  const [currentUser, setCurrentUser] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

  useEffect(() => {
    const user = authService.getCurrentUser();
    if (user) {
      setCurrentUser(user);
    }

    const handleExpired = () => {
      setCurrentUser(null);
    };

    window.addEventListener('civic:auth-expired', handleExpired);
    return () => window.removeEventListener('civic:auth-expired', handleExpired);
  }, []);

  const handleAuthSuccess = (user) => {
    setCurrentUser(user);
    if (user.role === 'authority') {
      setActiveTab('authority');
    } else if (user.role === 'admin') {
      setActiveTab('admin');
    } else {
      setActiveTab('report');
    }
  };

  const handleLogout = () => {
    authService.logout();
    setCurrentUser(null);
    setActiveTab('public');
  };

  const [initialReportId, setInitialReportId] = useState(null);

  const handleReportCreated = (created) => {
    if (created?.id) {
      setInitialReportId(created.id);
      try {
        const stored = JSON.parse(localStorage.getItem('civic_guest_reports') || '[]');
        if (!stored.includes(created.id)) {
          stored.unshift(created.id);
          localStorage.setItem('civic_guest_reports', JSON.stringify(stored.slice(0, 30)));
        }
      } catch (e) {
        console.warn(e);
      }
    }
    setActiveTab('my_reports');
  };

  return (
    <div className="civic-app relative min-h-screen text-slate-100 flex flex-col selection:bg-emerald-500 selection:text-slate-950">
      {/* Premium Interactive Luminous Cursor */}
      <CustomCursor />

      {/* Full-Page Fixed Ambient Background Image */}
      <div className="full-page-bg" aria-hidden="true">
        <img
          src="/bengaluru-hero.jpg"
          alt="Bengaluru City Platform Backdrop"
        />
        <div className="full-page-bg-overlay" />
      </div>

      {/* Primary Application Layout */}
      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Top Navigation */}
        <Navbar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          currentUser={currentUser}
          onOpenAuth={() => setShowAuthModal(true)}
          onLogout={handleLogout}
        />

        {/* Main Role-Based Content Area */}
        <main className="flex-1">
          {activeTab === 'public' && <PublicDashboardPage onNavigate={setActiveTab} />}
          {activeTab === 'report' && (
            <div className="py-6 px-4">
              <ManualReportPage
                currentUser={currentUser}
                onReportSuccess={handleReportCreated}
              />
            </div>
          )}
          {activeTab === 'voice' && (
            <div className="py-6 px-4">
              <VoiceReportPage
                currentUser={currentUser}
                onReportSuccess={handleReportCreated}
              />
            </div>
          )}
          {activeTab === 'drive' && (
            <div className="py-4 px-4">
              <ErrorBoundary>
                <DriveModePage
                  currentUser={currentUser}
                  onOpenAuth={() => setShowAuthModal(true)}
                />
              </ErrorBoundary>
            </div>
          )}
          {activeTab === 'my_reports' && (
            <div className="py-6 px-4">
              <MyReportsPage
                currentUser={currentUser}
                onOpenAuth={() => setShowAuthModal(true)}
                onNavigate={setActiveTab}
                initialReportId={initialReportId}
              />
            </div>
          )}
          {activeTab === 'authority' && (
            <div className="py-6 px-4">
              <AuthorityDashboardPage currentUser={currentUser} />
            </div>
          )}
          {activeTab === 'admin' && (
            <div className="py-6 px-4">
              <AdminConfigPage />
            </div>
          )}
        </main>

        {/* Footer */}
        <footer className="bg-slate-950/75 backdrop-blur-md border-t border-slate-800/80 py-4 px-6 text-center text-xs text-slate-400 mt-auto">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
            <span>AI-Powered Smart Civic Issue Reporting & Video Intelligence Platform • Bengaluru</span>
            <span>BBMP Administrative Ward Mapping • Section 30 Ethical Architecture</span>
          </div>
        </footer>

        {/* AI Concierge */}
        <CivicAssistant setActiveTab={setActiveTab} currentUser={currentUser} activeTab={activeTab} />

        {/* Login & Role Switcher Modal */}
        <AuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          onAuthSuccess={handleAuthSuccess}
        />
      </div>
    </div>
  );
}
