
import React from 'react';
import { Users, FileText, LogOut, LayoutDashboard, Settings, Menu, BarChart3 } from 'lucide-react';
import { User, UserRole } from '../types';

interface SidebarProps {
  currentUser: User;
  onNavigate: (page: string) => void;
  currentPage: string;
  onLogout: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentUser, onNavigate, currentPage, onLogout }) => {
  // Define permissions based on requirements:
  // Supervisor & System Admin: Full Access (Dashboard, Stats, Leave, Staff, Settings(Admin only/Shared))
  // Employee: Dashboard, Stats, Leave
  const navItems = [
    { 
      id: 'dashboard', 
      label: '排班總覽', 
      icon: LayoutDashboard, 
      roles: [UserRole.SUPERVISOR, UserRole.EMPLOYEE, UserRole.SYSTEM_ADMIN] 
    },
    { 
      id: 'statistics', 
      label: '工作統計', 
      icon: BarChart3, 
      roles: [UserRole.SUPERVISOR, UserRole.EMPLOYEE, UserRole.SYSTEM_ADMIN] 
    },
    { 
      id: 'leave', 
      label: '請假管理', 
      icon: FileText, 
      roles: [UserRole.SUPERVISOR, UserRole.EMPLOYEE, UserRole.SYSTEM_ADMIN] 
    },
    { 
      id: 'staff', 
      label: '人員管理', 
      icon: Users, 
      roles: [UserRole.SUPERVISOR, UserRole.SYSTEM_ADMIN] 
    },
    { 
      id: 'settings', 
      label: '系統與個人設定', 
      icon: Settings, 
      roles: [UserRole.SUPERVISOR, UserRole.SYSTEM_ADMIN, UserRole.EMPLOYEE] 
    },
  ];

  const getRoleLabel = (role: UserRole) => {
      switch(role) {
          case UserRole.SUPERVISOR: return '部門主管';
          case UserRole.SYSTEM_ADMIN: return '系統管理員';
          default: return '放射師';
      }
  };

  return (
    <div className="w-full bg-white border-b border-gray-200 h-16 flex items-center justify-between px-4 sticky top-0 z-50 shadow-sm">
      {/* Left: Logo & Brand */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-gradient-to-br from-teal-400 to-teal-600 rounded-lg flex items-center justify-center text-white font-bold text-lg shadow-sm shadow-teal-200">
          影
        </div>
        <h1 className="text-lg font-bold text-gray-800 tracking-wide hidden md:block">影像醫學部</h1>
      </div>

      {/* Center: Navigation Items */}
      <div className="flex items-center gap-1 md:gap-2">
        {navItems.filter(item => item.roles.includes(currentUser.role)).map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                isActive 
                  ? 'bg-teal-50 text-teal-700 shadow-sm ring-1 ring-teal-100' 
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <Icon size={18} className={`transition-colors ${isActive ? 'text-teal-600' : 'text-gray-400'}`} />
              <span className="hidden sm:inline">{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Right: User Profile & Logout */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 pl-4 border-l border-gray-100">
          <div 
            className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-sm ring-2 ring-white"
            style={{ backgroundColor: currentUser.color || '#9CA3AF' }}
          >
            {currentUser.alias || currentUser.name.charAt(0)}
          </div>
          <div className="hidden md:block">
            <p className="text-xs font-bold text-gray-800">{currentUser.name}</p>
            <p className="text-[10px] uppercase font-semibold text-gray-500">
              {getRoleLabel(currentUser.role)}
            </p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          title="登出"
        >
          <LogOut size={18} />
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
