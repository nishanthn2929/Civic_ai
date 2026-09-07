import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import AuthModal from './components/AuthModal';
import PublicDashboardPage from './pages/public/PublicDashboardPage';
import ManualReportPage from './pages/citizen/ManualReportPage';
import VoiceReportPage from './pages/citizen/VoiceReportPage';
import DriveModePage from './pages/citizen/DriveModePage';
import MyReportsPage from './pages/citizen/MyReportsPage';
import AuthorityDashboardPage from './pages/authority/AuthorityDashboardPage';
import AdminConfigPage from './pages/admin/AdminConfigPage';
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-emerald-500 selection:text-slate-950">
      {/* Top Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        currentUser={currentUser}
        onOpenAuth={() => setShowAuthModal(true)}
        onLogout={handleLogout}
      />

      {/* Main Role-Based Content Area */}
      <main className="flex-1 py-6">
        {activeTab === 'public' && <PublicDashboardPage />}
        {activeTab === 'report' && (
          <ManualReportPage
            currentUser={currentUser}
            onReportSuccess={() => setActiveTab('my_reports')}
          />
        )}
        {activeTab === 'voice' && (
          <VoiceReportPage
            currentUser={currentUser}
            onReportSuccess={() => setActiveTab('my_reports')}
          />
        )}
        {activeTab === 'drive' && <DriveModePage currentUser={currentUser} />}
        {activeTab === 'my_reports' && <MyReportsPage currentUser={currentUser} />}
        {activeTab === 'authority' && <AuthorityDashboardPage currentUser={currentUser} />}
        {activeTab === 'admin' && <AdminConfigPage />}
      </main>

      {/* Footer */}
      <footer className="bg-slate-900/60 border-t border-slate-800/80 py-4 px-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <span>AI-Powered Smart Civic Issue Reporting & AI Dashcam Platform • Bengaluru</span>
          <span>BBMP Administrative Ward Mapping • Section 30 Ethical Architecture</span>
        </div>
      </footer>

      {/* Login & Role Switcher Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onAuthSuccess={handleAuthSuccess}
      />
    </div>
  );
}
