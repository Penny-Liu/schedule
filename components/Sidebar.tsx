import React from "react";
import {
  Users,
  FileText,
  LogOut,
  LayoutDashboard,
  Settings,
  Menu,
  BarChart3,
  Stethoscope,
  CalendarClock,
  Sliders,
  Cloud,
  Calendar,
  Activity,
  Building2,
} from "lucide-react";
import { User, UserRole, PERMISSIONS } from "../types";
import { getRoleLabel } from "../services/utils";

interface SidebarProps {
  currentUser: User;
  onNavigate: (page: string) => void;
  currentPage: string;
  onLogout: () => void;
  hasPendingLeaves?: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({
  currentUser,
  onNavigate,
  currentPage,
  onLogout,
  hasPendingLeaves,
}) => {
  // Define permissions based on requirements:
  // Supervisor & System Admin: Full Access (Dashboard, Stats, Leave, Staff, Settings(Admin only/Shared))
  const categories = [
    {
      label: "放射師",
      icon: Activity,
      color: "bg-teal-50 text-teal-700",
      borderColor: "border-teal-100",
      iconColor: "text-teal-600",
      activeBg: "bg-teal-50",
      activeText: "text-teal-700",
      activeRing: "ring-teal-200",
      items: [
        {
          id: "dashboard",
          label: "總覽",
          icon: LayoutDashboard,
          permission: null,
          isRadiographerOnly: true,
        },
        {
          id: "statistics",
          label: "統計",
          icon: BarChart3,
          permission: PERMISSIONS.VIEW_STATS,
          isRadiographerOnly: true,
        },
        {
          id: "leave",
          label: "請假",
          icon: FileText,
          permission: null,
          isRadiographerOnly: true,
        },
      ],
    },
    {
      label: "醫師",
      icon: Stethoscope,
      color: "bg-blue-50 text-blue-700",
      borderColor: "border-blue-100",
      iconColor: "text-blue-600",
      activeBg: "bg-blue-50",
      activeText: "text-blue-700",
      activeRing: "ring-blue-200",
      items: [
        {
          id: "physician_schedule",
          label: "排班表",
          icon: CalendarClock,
          permission: PERMISSIONS.VIEW_PHYSICIAN,
        },
        {
          id: "doctors",
          label: "管理",
          icon: Users,
          permission: PERMISSIONS.MANAGE_DOCTORS,
        },
        {
          id: "doctor_statistics",
          label: "統計",
          icon: BarChart3,
          permission: PERMISSIONS.VIEW_DOCTOR_STATS,
        },
        {
          id: "physician_settings",
          label: "設定",
          icon: Sliders,
          permission: PERMISSIONS.EDIT_PHYSICIAN,
        },
      ],
    },
    {
      label: "健管",
      icon: Calendar,
      color: "bg-rose-50 text-rose-700",
      borderColor: "border-rose-100",
      iconColor: "text-rose-600",
      activeBg: "bg-rose-50",
      activeText: "text-rose-700",
      activeRing: "ring-rose-200",
      items: [
        {
          id: "health_mgmt",
          label: "排班表",
          icon: Calendar,
          permission: PERMISSIONS.VIEW_HEALTH_MGMT,
        },
      ],
    },
    {
      label: "行政",
      icon: FileText,
      color: "bg-indigo-50 text-indigo-700",
      borderColor: "border-indigo-100",
      iconColor: "text-indigo-600",
      activeBg: "bg-indigo-50",
      activeText: "text-indigo-700",
      activeRing: "ring-indigo-200",
      items: [
        {
          id: "administrative_schedule",
          label: "排班表",
          icon: CalendarClock,
          permission: PERMISSIONS.EDIT_ADMINISTRATIVE,
        },
        {
          id: "gene_schedule",
          label: "基因排班",
          icon: CalendarClock,
          permission: "EDIT_GENE",
        },
        {
          id: "meeting_room",
          label: "會議室",
          icon: Building2,
          permission: null, // 權限設為 null，代表開放給所有人使用
        },
      ],
    },
    {
      label: "影像雲",
      icon: Cloud,
      color: "bg-purple-50 text-purple-700",
      borderColor: "border-purple-100",
      iconColor: "text-purple-600",
      activeBg: "bg-purple-50",
      activeText: "text-purple-700",
      activeRing: "ring-purple-200",
      items: [
        {
          id: "cloud_schedule",
          label: "班表",
          icon: Cloud,
          permission: PERMISSIONS.VIEW_CLOUD_SCHEDULE,
        },
      ],
    },
    {
      label: "系統",
      icon: Settings,
      color: "bg-amber-50 text-amber-800",
      borderColor: "border-amber-200",
      iconColor: "text-amber-600",
      activeBg: "bg-amber-50",
      activeText: "text-amber-800",
      activeRing: "ring-amber-300",
      items: [
        {
          id: "staff",
          label: "人員",
          icon: Users,
          permission: PERMISSIONS.VIEW_STAFF,
        },
        {
          id: "settings",
          label: "設定",
          icon: Settings,
          permission: null,
          hideForRoles: [UserRole.VIEWER],
        },
      ],
    },
  ];

  // 切換頁面時檢查是否有未儲存的變更
  const handleNavigateWithConfirm = (pageId: string) => {
    if ((window as any).isAdministrativeDirty) {
      if (
        !window.confirm("您有未儲存的行政排班變更，確定要放棄並離開此頁面嗎？")
      ) {
        return;
      }
      (window as any).isAdministrativeDirty = false;
    }
    onNavigate(pageId);
  };

  return (
    <div className="w-full bg-white border-b border-gray-200 min-h-16 flex items-center justify-between px-4 sticky top-0 z-50 shadow-sm pt-[env(safe-area-inset-top)]">
      {/* Left: Logo & Brand */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="w-8 h-8 bg-gradient-to-br from-teal-400 to-teal-600 rounded-lg flex items-center justify-center text-white font-bold text-lg shadow-sm shadow-teal-200">
          影
        </div>
        <h1 className="text-sm font-bold text-gray-800 tracking-wide hidden lg:block">
          影像醫學部{" "}
          <span className="text-[10px] text-gray-400 font-normal">v1.4</span>
        </h1>
      </div>

      <div className="flex items-center gap-2 md:gap-4 flex-1 overflow-x-auto no-scrollbar mx-2 py-1">
        {categories.map((cat, idx) => {
          const visibleItems = cat.items.filter((item) => {
            if (
              "isRadiographerOnly" in item &&
              item.isRadiographerOnly &&
              !currentUser.isRadiographer
            )
              return false;
            if (
              "hideForRoles" in item &&
              item.hideForRoles &&
              (item.hideForRoles as UserRole[]).includes(currentUser.role)
            )
              return false;
            if (!item.permission) return true;
            return currentUser.permissions?.includes(item.permission);
          });

          if (visibleItems.length === 0) return null;

          return (
            <div
              key={cat.label}
              className={`flex items-center gap-2 ${idx !== 0 ? "pl-3 border-l border-gray-100" : ""}`}
            >
              <div
                className={`hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-widest select-none ${cat.color} border ${cat.borderColor}`}
              >
                <cat.icon size={12} className={cat.iconColor} />
                <span>{cat.label}</span>
              </div>
              <div className="flex items-center gap-1">
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = currentPage === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleNavigateWithConfirm(item.id)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 group relative ${
                        isActive
                          ? `${cat.activeBg} ${cat.activeText} shadow-sm ring-1 ring-inset ${cat.activeRing}`
                          : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                      }`}
                      title={item.label}
                    >
                      <Icon
                        size={16}
                        className={`transition-transform duration-200 ${isActive ? cat.activeText : "text-gray-400 group-hover:scale-110"}`}
                        strokeWidth={isActive ? 2.5 : 2}
                      />
                      <span className="hidden lg:inline">{item.label}</span>
                      {item.id === "leave" && hasPendingLeaves && (
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white animate-pulse" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Right: User Profile & Logout */}
      <div className="flex items-center gap-2 md:gap-4 shrink-0">
        <div className="flex items-center gap-2 pl-4 border-l border-gray-100">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-sm ring-2 ring-white"
            style={{ backgroundColor: currentUser.color || "#9CA3AF" }}
          >
            {currentUser.alias || currentUser.name.charAt(0)}
          </div>
          <div className="hidden md:block">
            <p className="text-xs font-bold text-gray-800">
              {currentUser.name}
            </p>
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
