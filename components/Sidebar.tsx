
import React from 'react';
import { Users, FileText, LogOut, LayoutDashboard, Settings, Menu, BarChart3, Stethoscope, CalendarClock, Sliders, Cloud } from 'lucide-react';
import { User, UserRole, PERMISSIONS } from '../types';

interface SidebarProps {
  currentUser: User;
  onNavigate: (page: string) => void;
  currentPage: string;
  onLogout: () => void;
  hasPendingLeaves?: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({ currentUser, onNavigate, currentPage, onLogout, hasPendingLeaves }) => {
  // Define permissions based on requirements:
  // Supervisor & System Admin: Full Access (Dashboard, Stats, Leave, Staff, Settings(Admin only/Shared))
  // Employee: Dashboard, Stats, Leave
  const navItems = [
    {
      id: 'dashboard',
      label: '排班總覽',
      icon: LayoutDashboard,
      permission: null,
      isRadiographerOnly: true
    },
    {
      id: 'statistics',
      label: '工作統計',
      icon: BarChart3,
      permission: PERMISSIONS.VIEW_STATS,
      isRadiographerOnly: true
    },
    {
      id: 'leave',
      label: '請假管理',
      icon: FileText,
      permission: null,
      isRadiographerOnly: true
    },
    {
      id: 'cloud_schedule',
      label: '影像雲班表',
      icon: Cloud,
      permission: PERMISSIONS.VIEW_CLOUD_SCHEDULE
    },
    {
      id: 'staff',
      label: '人員管理',
      icon: Users,
      permission: PERMISSIONS.VIEW_STAFF
    },
    {
      id: 'physician_schedule',
      label: '醫師排班',
      icon: CalendarClock,
      permission: PERMISSIONS.VIEW_PHYSICIAN
    },
    {
      id: 'doctors',
      label: '醫師管理',
      icon: Stethoscope,
      permission: PERMISSIONS.MANAGE_DOCTORS
    },
    {
      id: 'doctor_statistics',
      label: '醫師工作統計',
      icon: BarChart3,
      permission: PERMISSIONS.VIEW_DOCTOR_STATS
    },
    {
      id: 'physician_settings',
      label: '醫師排班設定',
      icon: Sliders,
      permission: PERMISSIONS.EDIT_PHYSICIAN
    },
    {
      id: 'settings',
      label: '系統與個人設定',
      icon: Settings,
      permission: null,
      hideForRoles: [UserRole.VIEWER] // Public accounts cannot change settings
    },
  ];

  const getRoleLabel = (role: UserRole) => {
    switch (role) {
      case UserRole.SUPERVISOR: return '部門主管';
      case UserRole.SYSTEM_ADMIN: return '系統管理員';
      case UserRole.SCHEDULER: return '排班管理員';
      case UserRole.VIEWER: return '瀏覽者';
      case UserRole.FINANCE: return '財會';
      default: return '放射師';
    }
  };

  return (
    <div className="w-full bg-white border-b border-gray-200 min-h-16 flex items-center justify-between px-4 sticky top-0 z-50 shadow-sm pt-[env(safe-area-inset-top)]">
      {/* Left: Logo & Brand */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="w-8 h-8 bg-gradient-to-br from-teal-400 to-teal-600 rounded-lg flex items-center justify-center text-white font-bold text-lg shadow-sm shadow-teal-200">
          影
        </div>
        <h1 className="text-sm font-bold text-gray-800 tracking-wide hidden lg:block">
            影像醫學部 <span className="text-[10px] text-gray-400 font-normal">v1.4</span>
        </h1>
      </div>

      <div className="flex items-center gap-1 md:gap-2 flex-1 overflow-x-auto no-scrollbar mx-2">
        {navItems.filter(item => {
           // 1. Check if it's a radiographer-only feature
           if ('isRadiographerOnly' in item && item.isRadiographerOnly && !currentUser.isRadiographer) return false;
           
           // 2. Check Role-based exclusion (e.g., Viewer hide settings)
           if ('hideForRoles' in item && item.hideForRoles && (item.hideForRoles as UserRole[]).includes(currentUser.role)) return false;

           // 3. Check permissions
           if (!item.permission) return true;
           return currentUser.permissions?.includes(item.permission);
        }).map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${isActive
                ? 'bg-teal-50 text-teal-700 shadow-sm ring-1 ring-teal-100'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
            >
              <Icon size={15} className={`transition-colors ${isActive ? 'text-teal-600' : 'text-gray-400'}`} />
              <span className="hidden lg:inline">{item.label}</span>
              {item.id === 'leave' && hasPendingLeaves && (
                <span className="w-2 h-2 bg-red-500 rounded-full ml-1 animate-pulse" />
              )}
            </button>
          );
        })}
      </div>

      {/* Right: User Profile & Logout */}
      <div className="flex items-center gap-2 md:gap-4 shrink-0">
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
          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors shrink-0"
          title="登出"
        >
          <LogOut size={18} />
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
