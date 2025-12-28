
import React, { useState } from 'react';
import { User } from './types';
import Sidebar from './components/Sidebar';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import LeavePage from './pages/LeavePage';
import StaffPage from './pages/StaffPage';
import SettingsPage from './pages/SettingsPage';
import StatisticsPage from './pages/StatisticsPage';
import { db } from './services/store';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentPage, setCurrentPage] = useState('dashboard');

  const handleLogin = (user: User) => {
    setCurrentUser(user);
    setCurrentPage('dashboard');
  };

  const handleLogout = () => {
    db.logout();
    setCurrentUser(null);
  };

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
      />
      
      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden relative">
        {renderPage()}
      </main>
    </div>
  );
};

export default App;
