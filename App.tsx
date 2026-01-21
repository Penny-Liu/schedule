
import React, { useState, useEffect } from 'react';
import { User, LeaveStatus } from './types';
import Sidebar from './components/Sidebar';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import LeavePage from './pages/LeavePage';
import StaffPage from './pages/StaffPage';
import SettingsPage from './pages/SettingsPage';
import StatisticsPage from './pages/StatisticsPage';
import DoctorManagerPage from './pages/DoctorManagerPage';
import { db } from './services/store';
import { Loader2 } from 'lucide-react';
import ChangePasswordPage from './pages/ChangePasswordPage';



// Error Boundary Component
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 bg-red-50 text-red-900 h-screen flex flex-col items-center justify-center">
          <h1 className="text-2xl font-bold mb-4">Something went wrong</h1>
          <div className="bg-white p-4 rounded shadow border border-red-200 max-w-lg overflow-auto">
            <code className="text-sm font-mono text-red-600">
              {this.state.error?.message || 'Unknown Error'}
            </code>
          </div>
          <button 
            className="mt-6 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            onClick={() => window.location.reload()}
          >
            Reload App
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [isLoading, setIsLoading] = useState(true);

  // Init Data from Supabase & Auto-Refresh Setup
  useEffect(() => {
    const init = async () => {
      await db.initializeData();
      setIsLoading(false);
    };
    init();

    // Auto-refresh on resume
    import('@capacitor/app').then(({ App: CapApp }) => {
       CapApp.addListener('appStateChange', ({ isActive }) => {
          if (isActive) {
             console.log('App resumed, refreshing data...');
             db.initializeData(true);
          }
       });
    });
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

  // FORCE PASSWORD CHANGE CHECK
  if (currentUser.mustChangePassword || currentUser.password === '1234') {
    return (
      <ChangePasswordPage
        currentUser={currentUser}
        onPasswordChanged={(updatedUser) => setCurrentUser(updatedUser)}
        onLogout={handleLogout}
      />
    );
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
      case 'doctors':
        return <DoctorManagerPage currentUser={currentUser} />;
      default:
        return <DashboardPage currentUser={currentUser} />;
    }
  };

  return (
    <ErrorBoundary>
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

        {/* Debug Banner - Temporary for diagnosing connection issues */}
        <div className="fixed bottom-0 left-0 right-0 bg-gray-900 text-white p-1 text-xs flex justify-between items-center z-[100] opacity-90 font-mono">
          <div className="flex items-center gap-2 px-2">
             <div className={`w-2 h-2 rounded-full ${db?.connectionStatus?.type === 'Supabase' ? 'bg-green-500' : 'bg-red-500'}`}></div>
             <span className="font-bold">Database:</span>
             <span className={`${db?.connectionStatus?.type === 'Supabase' ? 'text-green-400' : 'text-red-400'}`}>
               {db?.connectionStatus?.type || 'Unknown'}
             </span>
             <span className="text-gray-400 mx-1">|</span>
             <span className="text-gray-300 truncate max-w-[300px]" title={db?.connectionStatus?.details}>
               {db?.connectionStatus?.details || 'No details'}
             </span>
          </div>
          <div className="px-2 text-gray-500">
             Debug Mode
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default App;
