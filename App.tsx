
import React, { useState, useEffect } from 'react';
import { User, LeaveStatus } from './types';
import Sidebar from './components/Sidebar';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import LeavePage from './pages/LeavePage';
import StaffPage from './pages/StaffPage';
import SettingsPage from './pages/SettingsPage';
import StatisticsPage from './pages/StatisticsPage';
import { db } from './services/store';
import { Loader2 } from 'lucide-react';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [isLoading, setIsLoading] = useState(true);

  // Init Data from Supabase
  useEffect(() => {
    const init = async () => {
      await db.initializeData();
      setIsLoading(false);
    };
    init();
  }, []);

  const handleLogin = (user: User) => {
    setCurrentUser(user);
    setCurrentPage('dashboard');
  };

  const handleLogout = () => {
    db.logout();
    setCurrentUser(null);
  };

  // --- Notification Logic ---
  const [hasPendingLeaves, setHasPendingLeaves] = useState(false);

  useEffect(() => {
    if (!currentUser) return;

    const checkNotifications = () => {
      const leaves = db.getLeaves();
      let hasPending = false;

      if (currentUser.role === 'SUPERVISOR' || currentUser.role === 'SYSTEM_ADMIN') {
        // Supervisor: Check for any PENDING leaves
        hasPending = leaves.some(l => l.status === LeaveStatus.PENDING);
      }

      if (!hasPending) {
        // All Users: Check for Swap requests needing their agreement
        hasPending = leaves.some(l =>
          l.targetUserId === currentUser.id &&
          l.targetApproval === 'PENDING'
        );
      }

      setHasPendingLeaves(hasPending);
    };

    // Initial check
    checkNotifications();

    // Subscribe to store updates
    const unsubscribe = db.subscribe(checkNotifications);
    return () => unsubscribe();
  }, [currentUser]);

  if (isLoading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-gray-50 text-gray-500">
        <Loader2 size={48} className="animate-spin text-teal-600 mb-4" />
        <p className="text-lg font-medium">系統載入中...</p>
        <p className="text-sm">正在從資料庫同步最新排班資訊</p>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginPage onLogin={handleLogin} />;
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <DashboardPage currentUser={currentUser} />;
      case 'statistics':
        return <StatisticsPage currentUser={currentUser} />;
      case 'leave':
        return <LeavePage currentUser={currentUser} />;
      case 'staff':
        return <StaffPage currentUser={currentUser} />;
      case 'settings':
        return <SettingsPage currentUser={currentUser} />;
      default:
        return <DashboardPage currentUser={currentUser} />;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 text-gray-900 font-sans overflow-hidden">
      {/* Top Navigation */}
      <Sidebar
        currentUser={currentUser}
        onNavigate={setCurrentPage}
        currentPage={currentPage}
        onLogout={handleLogout}
        hasPendingLeaves={hasPendingLeaves}
      />

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden relative">
        {renderPage()}
      </main>
    </div>
  );
};

export default App;
