import React, { useState } from "react";
import {
  User,
  UserRole,
  StaffGroup,
  SYSTEM_OFF,
  StationDefault,
  SPECIAL_ROLES,
  PERMISSIONS,
  PERMISSION_LABELS,
} from "../types";
import { db, getPermissionsByRole } from "../services/store";
import {
  Mail,
  Shield,
  Users,
  Trash2,
  Plus,
  Check,
  CheckSquare,
  Square,
  Pencil,
  X,
  Save,
  Palette,
  AlertCircle,
  Star,
  BookOpen,
  Key,
  GraduationCap,
  Trophy,
  Gamepad2,
  Medal,
  Target,
} from "lucide-react";

import { RADIOGRAPHER_SKILLS, SKILL_CATEGORIES, getSkillById } from "../services/skills";
import ConfirmModal from "../components/ConfirmModal";
import { getDefaultPasswordForRole } from "../services/passwordPolicy.mjs";
import {
  EMPLOYMENT_PAUSE_KEY,
  generateUUID,
  getEmploymentPause,
  toLocalISOString,
} from "../services/utils";
import {
  fetchRadiographerBirthDate,
  saveRadiographerBirthDate,
} from "../services/radiographerPrivateProfile";

interface StaffPageProps {
  currentUser: User;
}

const StaffPage: React.FC<StaffPageProps> = ({ currentUser }) => {
  const [users, setUsers] = useState<User[]>(db.getUsers());

  React.useEffect(() => {
    const loadData = () => {
      setUsers(db.getUsers());
    };
    const unsubscribe = db.subscribe(loadData);
  }, []);
  const [error, setError] = useState<string | null>(null);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const allStations = db
    .getStations()
    .filter((s) => s !== SYSTEM_OFF && s !== StationDefault.UNASSIGNED);

  // Combine Stations + Special Roles for Capability Selection
  const allCapabilities = [
    ...Object.values(SPECIAL_ROLES), // Add '開機', '晚班', '輔班', '排班'
    ...allStations,
  ];

  // State to track editing mode
  const [editingId, setEditingId] = useState<string | null>(null);

  // Delete Modal State
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  // Predefined palette for users
  const COLOR_PALETTE = [
    "#EF4444", // Red 500
    "#F97316", // Orange 500
    "#F59E0B", // Amber 500
    "#10B981", // Emerald 500
    "#06B6D4", // Cyan 500
    "#3B82F6", // Blue 500
    "#6366F1", // Indigo 500
    "#8B5CF6", // Violet 500
    "#EC4899", // Pink 500
    "#64748B", // Slate 500
    "#84CC16", // Lime 500
  ];

  // Form state (used for both Add and Edit)
  const [formData, setFormData] = useState<{
    name: string;
    alias: string;
    username: string;
    role: UserRole;
    groupId: StaffGroup;
    color: string;
    capabilities: string[];
    learningCapabilities: string[];
    learningSchedules: Record<string, string>; // New
    unlockedSkills: string[]; // Gamification
    learningSkills: string[]; // Gamification
    excludedCapabilities: string[]; // New
    isRadiographer: boolean; // New
    isPartTime: boolean; // New
    isHealthMgmt: boolean; // New
    healthMgmtLocation: "全部" | "北投" | "大直";
    isActive: boolean; // New
    resignationDate: string; // New
    hireDate: string; // New
    birthDate: string;
    personalCycles: User["personalCycles"];
    employmentPauseStartDate: string;
    employmentPauseEndDate: string;
    groupIndex: number; // For Group D rotation order
    groupHistory: { date: string; groupId: StaffGroup; groupIndex?: number }[];
    permissions: string[];
  }>({
    name: "",
    alias: "",
    username: "",
    role: UserRole.RADIOGRAPHER_STAFF,
    groupId: StaffGroup.GROUP_A,
    color: COLOR_PALETTE[5], // Default Blue
    capabilities: [],
    learningCapabilities: [],
    learningSchedules: {},
    unlockedSkills: [],
    learningSkills: [],
    excludedCapabilities: [], // New
    isRadiographer: false, // New
    isPartTime: false, // New
    isHealthMgmt: false, // New
    healthMgmtLocation: "全部",
    isActive: true, // New
    resignationDate: "", // New
    hireDate: "", // New
    birthDate: "",
    personalCycles: {},
    employmentPauseStartDate: "",
    employmentPauseEndDate: "",
    groupIndex: 0,
    groupHistory: [],
    permissions: [PERMISSIONS.VIEW_PHYSICIAN],
  });

  const resetForm = () => {
    setFormData({
      name: "",
      alias: "",
      username: "",
      role: UserRole.RADIOGRAPHER_STAFF,
      groupId: StaffGroup.GROUP_A,
      color: COLOR_PALETTE[5],
      capabilities: [],
      learningCapabilities: [],
      learningSchedules: {},
      unlockedSkills: [],
      learningSkills: [],
      excludedCapabilities: [],
      isRadiographer: false,
      isActive: true,
      isPartTime: false,
      isHealthMgmt: false,
      healthMgmtLocation: "全部",
      resignationDate: "",
      hireDate: "",
      birthDate: "",
      personalCycles: {},
      employmentPauseStartDate: "",
      employmentPauseEndDate: "",
      groupIndex: 0,
      groupHistory: [],
      permissions: [PERMISSIONS.VIEW_PHYSICIAN],
    });
    setEditingId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSaving(true);

    // Auto-generate alias if empty (take first char)
    const finalAlias = formData.alias || formData.name.charAt(0);
    if (formData.isRadiographer && !formData.birthDate) {
      setError("放射師需填寫出生年月日。");
      setIsSaving(false);
      return;
    }
    if (
      formData.birthDate &&
      formData.birthDate > toLocalISOString(new Date())
    ) {
      setError("出生年月日不可晚於今天。");
      setIsSaving(false);
      return;
    }
    if (
      (formData.employmentPauseStartDate && !formData.employmentPauseEndDate) ||
      (!formData.employmentPauseStartDate && formData.employmentPauseEndDate)
    ) {
      setError("留職停薪需同時設定開始日與結束日。");
      setIsSaving(false);
      return;
    }

    const updatedPersonalCycles = { ...(formData.personalCycles || {}) };
    if (formData.employmentPauseStartDate && formData.employmentPauseEndDate) {
      updatedPersonalCycles[EMPLOYMENT_PAUSE_KEY] = {
        startDate: formData.employmentPauseStartDate,
        endDate: formData.employmentPauseEndDate,
        memo: "留職停薪",
      };
    } else {
      delete updatedPersonalCycles[EMPLOYMENT_PAUSE_KEY];
    }

    try {
      if (editingId) {
        // Update existing user
        const result = await db.updateUser(editingId, {
          name: formData.name,
          alias: finalAlias,
          username: formData.username,
          role: formData.role,
          groupId: formData.groupId,
          color: formData.color,
          capabilities: formData.capabilities,
          learningCapabilities: formData.learningCapabilities,
          learningSchedules: formData.learningSchedules,
          unlockedSkills: formData.unlockedSkills,
          learningSkills: formData.learningSkills,
          excludedCapabilities: formData.excludedCapabilities,
          isRadiographer: formData.isRadiographer,
          isPartTime: formData.isPartTime,
          isHealthMgmt: formData.isHealthMgmt,
          healthMgmtLocation: formData.healthMgmtLocation,
          isActive: formData.isActive,
          resignationDate: formData.resignationDate,
          hireDate: formData.hireDate,
          personalCycles: updatedPersonalCycles,
          groupIndex:
            formData.groupId === StaffGroup.GROUP_D
              ? formData.groupIndex
              : undefined,
          groupHistory: formData.groupHistory,
          permissions: formData.permissions,
        });
        if (result.temporaryPassword) {
          alert(
            `人員資料與權限已儲存。\n\n此帳號原密碼不符合新規則，已改用臨時密碼：${result.temporaryPassword}\n請通知本人登入後設定個人密碼。`,
          );
        }
        await saveRadiographerBirthDate(
          editingId,
          formData.isRadiographer ? formData.birthDate : null,
        );
      } else {
        const u: User = {
          id: generateUUID(),
          name: formData.name,
          alias: finalAlias,
          username: formData.username,
          role: formData.role,
          groupId: formData.groupId,
          color: formData.color,
          capabilities: formData.capabilities,
          learningCapabilities: formData.learningCapabilities,
          learningSchedules: formData.learningSchedules,
          unlockedSkills: formData.unlockedSkills,
          learningSkills: formData.learningSkills,
          excludedCapabilities: formData.excludedCapabilities,
          isRadiographer: formData.isRadiographer,
          isPartTime: formData.isPartTime,
          isHealthMgmt: formData.isHealthMgmt,
          healthMgmtLocation: formData.healthMgmtLocation,
          isActive: formData.isActive,
          resignationDate: formData.resignationDate,
          hireDate: formData.hireDate,
          personalCycles: updatedPersonalCycles,
          groupIndex:
            formData.groupId === StaffGroup.GROUP_D
              ? formData.groupIndex
              : undefined,
          groupHistory: formData.groupHistory,
          password: getDefaultPasswordForRole(formData.role),
          mustChangePassword: true,
          permissions: formData.permissions,
        };
        await db.addUser(u);
        await saveRadiographerBirthDate(
          u.id,
          formData.isRadiographer ? formData.birthDate : null,
        );
      }

      setUsers([...db.getUsers()]); // Refresh list
      resetForm();
    } catch (err: any) {
      console.error("Save failed:", err);
      setError(
        typeof err === "object"
          ? err.message || JSON.stringify(err)
          : String(err),
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditClick = async (e: React.MouseEvent, user: User) => {
    e.stopPropagation(); // Prevent triggering parent clicks
    setEditingId(user.id);
    const employmentPause = getEmploymentPause(user);
    let birthDate = "";
    if (user.isRadiographer) {
      try {
        birthDate = await fetchRadiographerBirthDate(user.id);
      } catch (err: any) {
        console.error("Load radiographer birth date failed:", err);
        setError(`無法讀取出生年月日：${err?.message || err}`);
      }
    }
    setFormData({
      name: user.name,
      alias: user.alias || user.name.charAt(0),
      username: user.username,
      role: user.role,
      groupId: user.groupId,
      color: user.color || COLOR_PALETTE[5],
      capabilities: user.capabilities || [],
      learningCapabilities: user.learningCapabilities || [],
      learningSchedules: user.learningSchedules || {},
      unlockedSkills: user.unlockedSkills || [],
      learningSkills: user.learningSkills || [],
      excludedCapabilities: user.excludedCapabilities || [],
      isRadiographer: user.isRadiographer || false,
      isPartTime: user.isPartTime || false,
      isHealthMgmt: user.isHealthMgmt || false,
      healthMgmtLocation: user.healthMgmtLocation || "全部",
      isActive: user.isActive !== undefined ? user.isActive : true,
      resignationDate: user.resignationDate || "",
      hireDate: user.hireDate || "",
      birthDate,
      personalCycles: user.personalCycles || {},
      employmentPauseStartDate: employmentPause?.startDate || "",
      employmentPauseEndDate: employmentPause?.endDate || "",
      groupIndex: user.groupIndex || 0,
      groupHistory: user.groupHistory || [],
      permissions: user.permissions || [],
    });
  };

  const handleCancelEdit = () => {
    if (formData.name) {
      // Since we are replacing window.confirm, simple logic here is ok for edit cancel,
      // but strictly speaking a modal is better. For now keeping simple prompt or just reset.
      // Let's just reset to avoid 'disappearing' prompt issues here too if that was the case.
      resetForm();
    } else {
      resetForm();
    }
  };

  // Reset Password Modal State
  const [resetTargetId, setResetTargetId] = useState<string | null>(null);
  const resetTargetUser = users.find((user) => user.id === resetTargetId);
  const resetTargetPassword = getDefaultPasswordForRole(resetTargetUser?.role);

  const handleResetPasswordClick = () => {
    if (editingId) setResetTargetId(editingId);
  };

  const confirmResetPassword = async () => {
    if (resetTargetId) {
      try {
        const temporaryPassword = await db.resetPassword(resetTargetId);
        setResetTargetId(null);
        alert(
          `密碼已重設。\n\n臨時密碼：${temporaryPassword}\n請通知本人使用此密碼登入，並依畫面提示設定個人密碼。`,
        );
      } catch (error) {
        console.error("Password reset failed:", error);
        alert("密碼重設失敗，請檢查網路後再試。");
      }
    }
  };

  // 4-State Toggle: None -> Certified -> Learning -> Excluded (不排) -> None
  const toggleCapability = (cap: string) => {
    setFormData((prev) => {
      const isCertified = prev.capabilities.includes(cap);
      const isLearning = prev.learningCapabilities.includes(cap);
      const isExcluded = prev.excludedCapabilities.includes(cap);

      if (isCertified) {
        // Certified -> Learning
        return {
          ...prev,
          capabilities: prev.capabilities.filter((c) => c !== cap),
          learningCapabilities: [...prev.learningCapabilities, cap],
        };
      } else if (isLearning) {
        // Learning -> Excluded (Independent but No Auto-Schedule)
        // [Modification]: We DO NOT delete learningSchedules here, so history is preserved!
        return {
          ...prev,
          learningCapabilities: prev.learningCapabilities.filter(
            (c) => c !== cap,
          ),
          excludedCapabilities: [...prev.excludedCapabilities, cap],
        };
      } else if (isExcluded) {
        // Excluded -> None
        return {
          ...prev,
          excludedCapabilities: prev.excludedCapabilities.filter(
            (c) => c !== cap,
          ),
        };
      } else {
        // None -> Certified (Independent)
        return {
          ...prev,
          capabilities: [...prev.capabilities, cap],
        };
      }
    });
  };

  // 3-State Toggle for Skills: None -> Learning -> Unlocked -> None
  const toggleSkill = (skillId: string, autoStations: string[]) => {
    setFormData((prev) => {
      const isUnlocked = prev.unlockedSkills.includes(skillId);
      const isLearning = prev.learningSkills.includes(skillId);

      if (isLearning) {
        // Learning -> Unlocked
        // Auto-bind capabilities
        const newCapabilities = new Set(prev.capabilities);
        autoStations.forEach((st) => {
          if (!prev.excludedCapabilities.includes(st)) {
            newCapabilities.add(st);
          }
        });
        return {
          ...prev,
          learningSkills: prev.learningSkills.filter((s) => s !== skillId),
          unlockedSkills: [...prev.unlockedSkills, skillId],
          capabilities: Array.from(newCapabilities),
        };
      } else if (isUnlocked) {
        // Unlocked -> None
        return {
          ...prev,
          unlockedSkills: prev.unlockedSkills.filter((s) => s !== skillId),
        };
      } else {
        // None -> Learning
        return {
          ...prev,
          learningSkills: [...prev.learningSkills, skillId],
        };
      }
    });
  };

  const handleDeleteClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    e.preventDefault();

    if (id === currentUser.id) {
      alert("安全警告：您無法刪除目前正在登入的帳號。");
      return;
    }
    setDeleteTargetId(id);
  };

  const handleConfirmDelete = async () => {
    if (deleteTargetId) {
      try {
        await db.deleteUser(deleteTargetId);
        // Refresh local state
        const updatedUser = db.getUsers().find((u) => u.id === deleteTargetId);
        if (updatedUser) {
          // If we are showing only active users in a list, we need to handle that.
          // For now, let's just refresh the whole list from store.
          setUsers([...db.getUsers()]);
        }

        if (editingId === deleteTargetId) {
          resetForm();
        }
        setDeleteTargetId(null);
      } catch (err) {
        alert("停用失敗，請稍後再試。");
      }
    }
  };

  // Only those with VIEW_STAFF permission can access
  if (
    !currentUser.permissions?.includes(PERMISSIONS.VIEW_STAFF) &&
    currentUser.role !== UserRole.SYSTEM_ADMIN
  ) {
    return <div className="p-8 text-center text-gray-500">權限不足。</div>;
  }

  // Helper to check if a capability is a special role
  const isSpecialRole = (cap: string) =>
    Object.values(SPECIAL_ROLES).includes(cap);
  const radiographersCount = users.filter(
    (u) =>
      u.role === UserRole.RADIOGRAPHER_STAFF || u.role === UserRole.SUPERVISOR,
  ).length;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto h-screen overflow-y-auto overflow-x-hidden">
      <ConfirmModal
        isOpen={!!deleteTargetId}
        onClose={() => setDeleteTargetId(null)}
        onConfirm={handleConfirmDelete}
        title="確認停用帳號"
        message="注意：停用帳號後，該人員將從名單中隱藏，但「歷史排班資料」將會被完整保留以供查閱。您確定要停用此帳號嗎？"
        confirmText="確認停用"
        confirmColor="red"
      />

      <ConfirmModal
        isOpen={!!resetTargetId}
        onClose={() => setResetTargetId(null)}
        onConfirm={confirmResetPassword}
        title="重置密碼確認"
        message={`確定要將此使用者的密碼重置為臨時密碼 (${resetTargetPassword}) 嗎？重設後系統也會再次顯示實際密碼。`}
        confirmText="確認重置"
        confirmColor="red"
      />

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-800">人員管理</h2>
          <p className="text-sm text-gray-500">
            管理使用者帳號、權限、分組與技能
          </p>
        </div>
        <div className="flex gap-2">
          <div className="text-xs text-gray-500 flex items-center gap-1 bg-white border border-gray-200 px-3 py-1.5 rounded-full shadow-sm">
            <Users size={14} />
            部門人數:{" "}
            {
              users.filter((user) => {
                if (currentUser.role === UserRole.SYSTEM_ADMIN) return true;
                if (currentUser.role === UserRole.SUPERVISOR)
                  return user.isRadiographer;
                if (currentUser.role === UserRole.HM_SUPERVISOR)
                  return user.isHealthMgmt;
                return false;
              }).length
            }
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Form Section (Sticky) - Only show if has EDIT_STAFF permission */}
        {currentUser.permissions?.includes(PERMISSIONS.EDIT_STAFF) && (
          <div className="xl:col-span-1">
            <div
              className={`bg-white p-5 rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border transition-all duration-300 overflow-x-hidden ${editingId ? "border-teal-400 ring-1 ring-teal-100" : "border-gray-100"}`}
            >
              <div className="flex justify-between items-center mb-4">
                <h3
                  className={`text-sm font-bold flex items-center gap-2 ${editingId ? "text-teal-700" : "text-gray-800"}`}
                >
                  <span
                    className={`w-1 h-4 rounded-full ${editingId ? "bg-teal-600" : "bg-gray-400"}`}
                  ></span>
                  {editingId ? "編輯人員資料" : "新增人員"}
                </h3>
                {editingId && (
                  <div className="flex items-center gap-1">
                    {currentUser.role === UserRole.SYSTEM_ADMIN && (
                      <button
                        type="button"
                        onClick={handleResetPasswordClick}
                        className="text-gray-400 hover:text-amber-600 p-1 rounded-full hover:bg-amber-50 transition-colors"
                        title={`重置密碼為臨時值 (${getDefaultPasswordForRole(formData.role)})`}
                      >
                        <Key size={15} />
                      </button>
                    )}
                    <button
                      onClick={handleCancelEdit}
                      className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-colors"
                      title="取消編輯"
                    >
                      <X size={16} />
                    </button>
                  </div>
                )}
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="bg-red-50 text-red-600 p-3 rounded-lg text-xs flex items-center gap-2 border border-red-100 animate-pulse">
                    <AlertCircle size={14} className="shrink-0" />
                    <div className="flex-1 break-all font-mono">{error}</div>
                  </div>
                )}
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">
                      姓名
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none text-sm shadow-sm transition-all bg-white"
                      placeholder="王小明"
                    />
                  </div>
                  <div className="w-24">
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">
                      代號 (1字)
                    </label>
                    <input
                      type="text"
                      maxLength={1}
                      value={formData.alias}
                      onChange={(e) =>
                        setFormData({ ...formData, alias: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none text-sm shadow-sm transition-all bg-white text-center font-bold"
                      placeholder={
                        formData.name ? formData.name.charAt(0) : "王"
                      }
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">
                    帳號 (Username)
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.username}
                    onChange={(e) =>
                      setFormData({ ...formData, username: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none text-sm shadow-sm transition-all bg-white font-mono"
                    placeholder="請輸入登入帳號"
                  />
                </div>

                <div className="flex flex-col gap-2 mb-2 p-3 bg-gray-50 rounded-lg border border-gray-100">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="isRadiographer"
                      checked={formData.isRadiographer}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setFormData((prev) => {
                          let perms = [...prev.permissions];
                          if (
                            checked &&
                            !perms.includes(PERMISSIONS.VIEW_PHYSICIAN)
                          )
                            perms.push(PERMISSIONS.VIEW_PHYSICIAN);
                          return {
                            ...prev,
                            isRadiographer: checked,
                            permissions: perms,
                          };
                        });
                      }}
                      disabled={currentUser.role === UserRole.HM_SUPERVISOR}
                      className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                    />
                    <label
                      htmlFor="isRadiographer"
                      className={`text-xs font-bold cursor-pointer ${currentUser.role === UserRole.HM_SUPERVISOR ? "text-gray-400" : "text-gray-700"}`}
                    >
                      是否為放射師 (顯示於排班總覽)
                    </label>
                  </div>

                  {/* Part-time option - Indented to show relationship but separate click target */}
                  <div className="flex items-center gap-2 ml-6">
                    <input
                      type="checkbox"
                      id="isPartTime"
                      checked={formData.isPartTime}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          isPartTime: e.target.checked,
                        })
                      }
                      disabled={
                        !formData.isRadiographer ||
                        currentUser.role === UserRole.HM_SUPERVISOR
                      }
                      className={`w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500 ${!formData.isRadiographer || currentUser.role === UserRole.HM_SUPERVISOR ? "opacity-50 cursor-not-allowed" : ""}`}
                    />
                    <label
                      htmlFor="isPartTime"
                      className={`text-xs font-bold cursor-pointer ${!formData.isRadiographer || currentUser.role === UserRole.HM_SUPERVISOR ? "text-gray-400" : "text-gray-700"}`}
                    >
                      兼職放射師 (總覽隱藏，崗位顯示)
                    </label>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="isHealthMgmt"
                      checked={formData.isHealthMgmt}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setFormData((prev) => {
                          let perms = [...prev.permissions];
                          if (
                            checked &&
                            !perms.includes(PERMISSIONS.VIEW_HEALTH_MGMT)
                          )
                            perms.push(PERMISSIONS.VIEW_HEALTH_MGMT);
                          return {
                            ...prev,
                            isHealthMgmt: checked,
                            permissions: perms,
                          };
                        });
                      }}
                      disabled={currentUser.role === UserRole.SUPERVISOR}
                      className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                    />
                    <label
                      htmlFor="isHealthMgmt"
                      className={`text-xs font-bold cursor-pointer ${currentUser.role === UserRole.SUPERVISOR ? "text-gray-400" : "text-gray-700"}`}
                    >
                      是否為健管人員 (健管排班)
                    </label>
                  </div>
                  {formData.isHealthMgmt && (
                    <div className="flex items-center gap-2 ml-6 mt-1">
                      <label className="text-xs font-bold text-teal-700">
                        預設管理院區
                      </label>
                      <select
                        value={formData.healthMgmtLocation}
                        onChange={(e) => {
                          const loc = e.target.value as any;
                          setFormData({ ...formData, healthMgmtLocation: loc });
                        }}
                        className="px-2 py-1 text-xs border border-teal-200 rounded text-teal-800 focus:ring-1 focus:ring-teal-500 outline-none"
                      >
                        <option value="全部">全部管理 / 跨院</option>
                        <option value="北投">僅限北投專區</option>
                        <option value="大直">僅限大直專區</option>
                      </select>
                    </div>
                  )}
                </div>

                {formData.isRadiographer && (
                  <div className="mb-3 rounded-lg border border-cyan-200 bg-cyan-50 p-3">
                    <label
                      htmlFor="birthDate"
                      className="mb-1 block text-xs font-bold text-cyan-800"
                    >
                      出生年月日（放射師必填）
                    </label>
                    <input
                      id="birthDate"
                      type="date"
                      required
                      max={toLocalISOString(new Date())}
                      value={formData.birthDate}
                      onChange={(e) =>
                        setFormData({ ...formData, birthDate: e.target.value })
                      }
                      className="w-full rounded-lg border border-cyan-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                    <p className="mt-1.5 text-[11px] text-cyan-700">
                      此資料獨立加密傳輸並受權限控管；月報只帶入年紀，不匯出出生年月日。
                    </p>
                  </div>
                )}

                <div className="flex items-center gap-2 mb-2 bg-gray-50 p-2 rounded border border-gray-100">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={formData.isActive}
                    onChange={(e) =>
                      setFormData({ ...formData, isActive: e.target.checked })
                    }
                    className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                  />
                  <label
                    htmlFor="isActive"
                    className={`text-xs font-bold cursor-pointer flex items-center gap-2 ${formData.isActive ? "text-teal-700" : "text-gray-500"}`}
                  >
                    {formData.isActive ? <Check size={14} /> : <X size={14} />}
                    {formData.isActive
                      ? "在職中 (Active)"
                      : "已離職 (Resigned)"}
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="text-xs font-bold text-teal-700 mb-1 block">
                      到職日期 (此日期前不排班)
                    </label>
                    <input
                      type="date"
                      value={formData.hireDate}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          hireDate: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 border border-teal-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-red-700 mb-1 block">
                      離職日期 (此日期後不排班)
                    </label>
                    <input
                      type="date"
                      value={formData.resignationDate}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          resignationDate: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 border border-red-200 rounded-lg text-sm focus:ring-2 focus:ring-red-500 outline-none"
                    />
                  </div>
                </div>

                <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100 mb-2">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <label className="text-xs font-bold text-indigo-700">
                      留職停薪期間
                    </label>
                    {(formData.employmentPauseStartDate ||
                      formData.employmentPauseEndDate) && (
                      <button
                        type="button"
                        onClick={() =>
                          setFormData({
                            ...formData,
                            employmentPauseStartDate: "",
                            employmentPauseEndDate: "",
                          })
                        }
                        className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold"
                      >
                        清除
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      value={formData.employmentPauseStartDate}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          employmentPauseStartDate: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 border border-indigo-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                    <input
                      type="date"
                      value={formData.employmentPauseEndDate}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          employmentPauseEndDate: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 border border-indigo-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  <p className="text-[11px] text-indigo-600 mt-2">
                    留停期間此人員不會出現在排班表與候選名單，結束後會自動恢復顯示。
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">
                      身份
                    </label>
                    <select
                      value={formData.role}
                      onChange={(e) => {
                        const newRole = e.target.value as UserRole;
                        const isHM =
                          newRole === UserRole.HM_SUPERVISOR ||
                          newRole === UserRole.HM_STAFF;
                        const isRadio =
                          newRole === UserRole.SUPERVISOR ||
                          newRole === UserRole.RADIOGRAPHER_STAFF ||
                          newRole === UserRole.RADIOGRAPHER_ASSISTANT;

                        setFormData({
                          ...formData,
                          role: newRole,
                          permissions: getPermissionsByRole(newRole),
                          isHealthMgmt: isHM || formData.isHealthMgmt,
                          isRadiographer: isRadio || formData.isRadiographer,
                        });
                      }}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none text-sm shadow-sm bg-white cursor-pointer"
                    >
                      <option value={UserRole.RADIOGRAPHER_STAFF}>
                        放射師同仁
                      </option>
                      <option value={UserRole.RADIOGRAPHER_ASSISTANT}>
                        放射師助理
                      </option>
                      <option value={UserRole.SUPERVISOR}>放射師主管</option>
                      <option value={UserRole.HM_STAFF}>健管同仁</option>
                      <option value={UserRole.HM_SUPERVISOR}>健管主管</option>
                      <option value={UserRole.PHYSICIAN_ADMIN}>
                        醫師/行政管理
                      </option>
                      <option value={UserRole.VIEWER}>瀏覽者 (Viewer)</option>
                      <option value={UserRole.FINANCE}>財會</option>
                      {currentUser.role === UserRole.SYSTEM_ADMIN && (
                        <option value={UserRole.SYSTEM_ADMIN}>
                          系統管理員
                        </option>
                      )}
                    </select>
                  </div>
                  {(formData.isRadiographer ||
                    formData.role === UserRole.SYSTEM_ADMIN) && (
                    <div>
                      <label className="text-xs font-semibold text-gray-500 mb-1 block">
                        組別
                      </label>
                      <select
                        value={formData.groupId}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            groupId: e.target.value as StaffGroup,
                          })
                        }
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none text-sm shadow-sm bg-white cursor-pointer"
                      >
                        <option value={StaffGroup.GROUP_A}>
                          A 組 (6天循環)
                        </option>
                        <option value={StaffGroup.GROUP_B}>
                          B 組 (6天循環)
                        </option>
                        <option value={StaffGroup.GROUP_C}>
                          C 組 (6天循環)
                        </option>
                        <option value={StaffGroup.GROUP_D}>
                          D 組 (週日固定休，週一至六滾動輪休)
                        </option>
                      </select>
                    </div>
                  )}
                  {/* Group D index selector */}
                  {formData.groupId === StaffGroup.GROUP_D &&
                    (formData.isRadiographer ||
                      formData.role === UserRole.SYSTEM_ADMIN) && (
                      <div>
                        <label className="text-xs font-semibold text-gray-500 mb-1 block">
                          D組四週平衡輪休代碼 (Index 0–3)
                        </label>
                        <select
                          value={formData.groupIndex}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              groupIndex: Number(e.target.value),
                            })
                          }
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none text-sm shadow-sm bg-white cursor-pointer"
                        >
                          <option value={0}>0（第1位休）</option>
                          <option value={1}>1（第2位休）</option>
                          <option value={2}>2（第3位休）</option>
                          <option value={3}>3（第4位休）</option>
                        </select>
                        <p className="text-[10px] text-gray-400 mt-1">
                          2026/11/3 起適用；4人各設不同數字。每週含固定週日共休2–3天，四週中2週休2天、2週休3天
                        </p>
                      </div>
                    )}
                  
                  {/* Group History Section */}
                  {(formData.isRadiographer || formData.role === UserRole.SYSTEM_ADMIN) && (
                    <div className="pt-2 border-t border-gray-100">
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-semibold text-gray-500">
                          未來組別變更排程
                        </label>
                        <button
                          type="button"
                          onClick={() => setFormData({
                            ...formData,
                            groupHistory: [...formData.groupHistory, { date: "", groupId: StaffGroup.GROUP_A, groupIndex: 0 }]
                          })}
                          className="text-xs text-teal-600 hover:text-teal-700 font-bold flex items-center gap-1"
                        >
                          <Plus size={12} /> 新增變更
                        </button>
                      </div>
                      
                      {formData.groupHistory.length > 0 ? (
                        <div className="space-y-2">
                          {formData.groupHistory.map((history, idx) => (
                            <div key={idx} className="flex flex-col gap-2 p-2 bg-gray-50 rounded-lg border border-gray-100">
                              <div className="flex items-center justify-between gap-2">
                                <input
                                  type="date"
                                  value={history.date}
                                  onChange={(e) => {
                                    const newHistory = [...formData.groupHistory];
                                    newHistory[idx].date = e.target.value;
                                    setFormData({ ...formData, groupHistory: newHistory });
                                  }}
                                  className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded focus:ring-1 focus:ring-teal-500 outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newHistory = [...formData.groupHistory];
                                    newHistory.splice(idx, 1);
                                    setFormData({ ...formData, groupHistory: newHistory });
                                  }}
                                  className="p-1 text-red-500 hover:bg-red-50 rounded"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                              <div className="flex gap-2">
                                <select
                                  value={history.groupId}
                                  onChange={(e) => {
                                    const newHistory = [...formData.groupHistory];
                                    newHistory[idx].groupId = e.target.value as StaffGroup;
                                    if (e.target.value !== StaffGroup.GROUP_D) {
                                      delete newHistory[idx].groupIndex;
                                    } else {
                                      newHistory[idx].groupIndex = 0;
                                    }
                                    setFormData({ ...formData, groupHistory: newHistory });
                                  }}
                                  className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded focus:ring-1 focus:ring-teal-500 outline-none"
                                >
                                  <option value={StaffGroup.GROUP_A}>A 組</option>
                                  <option value={StaffGroup.GROUP_B}>B 組</option>
                                  <option value={StaffGroup.GROUP_C}>C 組</option>
                                  <option value={StaffGroup.GROUP_D}>D 組</option>
                                </select>
                                {history.groupId === StaffGroup.GROUP_D && (
                                  <select
                                    value={history.groupIndex || 0}
                                    onChange={(e) => {
                                      const newHistory = [...formData.groupHistory];
                                      newHistory[idx].groupIndex = Number(e.target.value);
                                      setFormData({ ...formData, groupHistory: newHistory });
                                    }}
                                    className="w-20 px-2 py-1 text-xs border border-gray-200 rounded focus:ring-1 focus:ring-teal-500 outline-none"
                                  >
                                    <option value={0}>Idx 0</option>
                                    <option value={1}>Idx 1</option>
                                    <option value={2}>Idx 2</option>
                                    <option value={3}>Idx 3</option>
                                  </select>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-[10px] text-gray-400 italic">無未來變更排程，將永遠套用上方預設組別。</div>
                      )}
                    </div>
                  )}
                </div>

                {/* Color Selection */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-xs font-semibold text-gray-500 block">
                      代表顏色
                    </label>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-sm"
                        style={{ backgroundColor: formData.color }}
                      >
                        {formData.alias ||
                          (formData.name ? formData.name.charAt(0) : "?")}
                      </div>
                      <span className="text-[10px] text-gray-400">預覽</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {COLOR_PALETTE.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setFormData({ ...formData, color })}
                        className={`w-6 h-6 rounded-full border-2 transition-all ${
                          formData.color === color
                            ? "border-gray-600 scale-110"
                            : "border-transparent hover:scale-110"
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>

                {/* Gamified Skills Selection */}
                {(formData.isRadiographer || formData.role === UserRole.SYSTEM_ADMIN) && (
                  <div className="bg-slate-800 rounded-xl p-4 mb-4 border border-slate-700 shadow-inner">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2 text-teal-400">
                        <Target size={16} />
                        <label className="text-sm font-bold text-slate-100 block tracking-wide">
                          專業技能指標
                        </label>
                      </div>
                      <span className="text-[10px] text-slate-400 bg-slate-900 px-2 py-0.5 rounded-full border border-slate-700">
                        點擊切換：無 → 學習中 → 具備
                      </span>
                    </div>

                    <div className="space-y-4">
                      {SKILL_CATEGORIES.map(category => (
                        <div key={category}>
                          <div className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-widest">{category}</div>
                          <div className="flex flex-wrap gap-2">
                            {RADIOGRAPHER_SKILLS.filter(s => s.category === category).map(skill => {
                              const isUnlocked = formData.unlockedSkills.includes(skill.id);
                              const isLearning = formData.learningSkills.includes(skill.id);
                              let btnClass = "bg-slate-700 border-slate-600 text-slate-400 hover:bg-slate-600";
                              let icon = <Square size={12} className="opacity-50" />;
                              
                              if (isUnlocked) {
                                btnClass = "bg-yellow-500/20 border-yellow-500/50 text-yellow-300 font-bold shadow-[0_0_10px_rgba(234,179,8,0.2)]";
                                icon = <Star size={12} className="text-yellow-400 fill-yellow-400" />;
                              } else if (isLearning) {
                                btnClass = "bg-blue-500/20 border-blue-500/50 text-blue-300 font-bold";
                                icon = <BookOpen size={12} className="text-blue-400" />;
                              }

                              return (
                                <button
                                  key={skill.id}
                                  type="button"
                                  onClick={() => toggleSkill(skill.id, skill.autoStations)}
                                  className={`flex items-center gap-1.5 px-2.5 py-1.5 border rounded-lg text-[11px] transition-all ${btnClass}`}
                                >
                                  {icon}
                                  <span className="font-mono font-bold opacity-70">{skill.id}</span>
                                  <span>{skill.name}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Capabilities Selection (Only for Radiographers) */}
                {(formData.isRadiographer ||
                  formData.role === UserRole.SYSTEM_ADMIN) && (
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-xs font-semibold text-gray-500 block">
                        技能與特殊任務資格
                      </label>
                      <span className="text-[10px] text-gray-400 bg-gray-50 px-2 py-0.5 rounded">
                        點擊切換：無 → 獨立 → 學習 → 不排
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto overflow-x-hidden p-1">
                      {allCapabilities.map((cap) => {
                        const isCertified = formData.capabilities.includes(cap);
                        const isLearning =
                          formData.learningCapabilities.includes(cap);
                        const isExcluded =
                          formData.excludedCapabilities.includes(cap);
                        const isSpecial = isSpecialRole(cap);

                        let btnClass =
                          "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100 opacity-80 hover:opacity-100";
                        let icon = (
                          <Square size={14} className="text-gray-400" />
                        );

                        if (isCertified) {
                          btnClass = isSpecial
                            ? "bg-purple-50 border-purple-200 text-purple-700 font-bold"
                            : "bg-teal-50 border-teal-200 text-teal-700 font-bold";
                          icon = (
                            <CheckSquare
                              size={14}
                              className={
                                isSpecial ? "text-purple-600" : "text-teal-600"
                              }
                            />
                          );
                        } else if (isLearning) {
                          btnClass =
                            "bg-yellow-50 border-yellow-200 text-yellow-700 font-bold";
                          icon = (
                            <BookOpen size={14} className="text-yellow-600" />
                          );
                        } else if (isExcluded) {
                          btnClass =
                            "bg-gray-200 border-gray-300 text-gray-700 font-bold";
                          icon = <Shield size={14} className="text-gray-600" />;
                        }

                        return (
                          <button
                            key={cap}
                            type="button"
                            onClick={() => toggleCapability(cap)}
                            className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs border transition-all text-left ${btnClass}`}
                          >
                            {icon}
                            <span className="truncate">{cap}</span>
                          </button>
                        );
                      })}
                    </div>
                    {/* Learning Schedules Editor */}
                    {formData.learningCapabilities.length > 0 && (
                      <div className="mt-4 p-3 bg-yellow-50 rounded-lg border border-yellow-100">
                        <label className="text-xs font-semibold text-yellow-700 block mb-2 flex items-center gap-1">
                          <GraduationCap size={14} />
                          學習到期日設定 (自動轉正)
                        </label>
                        <div className="space-y-2">
                          {formData.learningCapabilities.map((cap) => (
                            <div key={cap} className="flex items-center justify-between bg-white px-2 py-1.5 rounded border border-yellow-200 text-xs">
                              <span className="font-medium text-slate-700">{cap}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-gray-400">到期日:</span>
                                <input
                                  type="date"
                                  value={formData.learningSchedules[cap] || ""}
                                  onChange={(e) => setFormData(prev => ({
                                    ...prev,
                                    learningSchedules: {
                                      ...prev.learningSchedules,
                                      [cap]: e.target.value
                                    }
                                  }))}
                                  className="border-gray-200 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-yellow-400"
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-xs font-semibold text-gray-500 block">
                      功能權限控管
                    </label>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 border border-gray-100 space-y-4 max-h-[500px] overflow-y-auto overflow-x-hidden">
                    {[
                      {
                        title: "放射師業務",
                        perms: [
                          PERMISSIONS.VIEW_STATS, 
                          PERMISSIONS.VIEW_WORKLOAD_STATS,
                          PERMISSIONS.VIEW_DASHBOARD_STAFF,
                          PERMISSIONS.VIEW_DASHBOARD_STATION,
                          PERMISSIONS.VIEW_DASHBOARD_TODAY,
                        ],
                      },
                      {
                        title: "醫師業務",
                        perms: [
                          PERMISSIONS.VIEW_PHYSICIAN,
                          PERMISSIONS.EDIT_PHYSICIAN,
                          PERMISSIONS.VIEW_DOCTOR_STATS,
                          PERMISSIONS.EDIT_DOCTOR_STATS,
                          PERMISSIONS.MANAGE_DOCTORS,
                        ],
                      },
                      {
                        title: "健管業務",
                        perms: [
                          PERMISSIONS.VIEW_HEALTH_MGMT,
                          PERMISSIONS.EDIT_HEALTH_MGMT,
                        ],
                      },
                      {
                        title: "麻護業務",
                        perms: [
                          PERMISSIONS.VIEW_ANESTHESIA,
                          PERMISSIONS.EDIT_ANESTHESIA,
                        ],
                      },
                      {
                        title: "行政業務",
                        perms: [
                          PERMISSIONS.VIEW_ADMINISTRATIVE,
                          PERMISSIONS.EDIT_ADMINISTRATIVE,
                        ],
                      },
                      {
                        title: "基因業務",
                        perms: [
                          PERMISSIONS.VIEW_GENE,
                          PERMISSIONS.EDIT_GENE,
                          PERMISSIONS.VIEW_GENE_SCHEDULE,
                          PERMISSIONS.EDIT_GENE_SCHEDULE,
                        ],
                      },
                      {
                        title: "影像雲",
                        perms: [
                          PERMISSIONS.VIEW_CLOUD_SCHEDULE,
                          PERMISSIONS.EDIT_CLOUD_SCHEDULE,
                        ],
                      },
                      {
                        title: "系統管理",
                        perms: [
                          PERMISSIONS.VIEW_STAFF,
                          PERMISSIONS.EDIT_STAFF,
                          PERMISSIONS.EDIT_SETTINGS,
                          PERMISSIONS.EDIT_PASSWORD,
                        ],
                      },
                    ].map((group) => (
                      <div key={group.title} className="space-y-1.5">
                        <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                          <span className="w-1 h-2.5 bg-gray-300 rounded-full"></span>
                          {group.title}
                        </h4>
                        <div className="grid grid-cols-1 gap-1 pl-2">
                          {group.perms.map((value) => (
                            <div
                              key={value}
                              className="flex items-center gap-2"
                            >
                              <input
                                type="checkbox"
                                id={`perm_${value}`}
                                checked={formData.permissions.includes(value)}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setFormData((prev) => {
                                    let perms = checked
                                      ? [...prev.permissions, value]
                                      : prev.permissions.filter(
                                          (p) => p !== value,
                                        );

                                    // Special Linkage: If SYSTEM EDIT is checked, and they are HM, auto-add HM EDIT
                                    if (
                                      checked &&
                                      (value === PERMISSIONS.EDIT_STAFF ||
                                        value === PERMISSIONS.EDIT_SETTINGS)
                                    ) {
                                      if (
                                        prev.isHealthMgmt &&
                                        !perms.includes(
                                          PERMISSIONS.EDIT_HEALTH_MGMT,
                                        )
                                      ) {
                                        perms.push(
                                          PERMISSIONS.EDIT_HEALTH_MGMT,
                                        );
                                      }
                                      if (
                                        prev.isRadiographer &&
                                        !perms.includes(
                                          PERMISSIONS.EDIT_CLOUD_SCHEDULE,
                                        )
                                      ) {
                                        perms.push(
                                          PERMISSIONS.EDIT_CLOUD_SCHEDULE,
                                        );
                                      }
                                    }

                                    return { ...prev, permissions: perms };
                                  });
                                }}
                                className="w-3.5 h-3.5 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                              />
                              <label
                                htmlFor={`perm_${value}`}
                                className="text-xs text-gray-700 cursor-pointer hover:text-teal-700 transition-colors"
                              >
                                {PERMISSION_LABELS[value] ||
                                  (value === "VIEW_GENE"
                                    ? "檢視基因排班"
                                    : value === "EDIT_GENE"
                                      ? "編輯基因排班"
                                      : value)}
                              </label>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-2 flex flex-col gap-2">
                  <div className="flex gap-2">
                    {editingId && (
                      <button
                        type="button"
                        onClick={handleCancelEdit}
                        className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold py-2.5 rounded-lg transition-colors text-sm"
                      >
                        取消
                      </button>
                    )}
                    <button
                      type="submit"
                      disabled={isSaving}
                      className={`flex-1 font-bold py-2.5 rounded-lg transition-colors text-sm flex items-center justify-center gap-2 shadow-sm ${
                        isSaving ? "opacity-50 cursor-not-allowed" : ""
                      } ${
                        editingId
                          ? "bg-teal-600 hover:bg-teal-700 text-white shadow-teal-200"
                          : "bg-gray-800 hover:bg-gray-900 text-white shadow-gray-300"
                      }`}
                    >
                      {isSaving ? (
                        <Check className="animate-spin" size={16} />
                      ) : editingId ? (
                        <Save size={16} />
                      ) : (
                        <Plus size={16} />
                      )}
                      {isSaving
                        ? "處理中..."
                        : editingId
                          ? "儲存變更"
                          : "建立帳號"}
                    </button>
                  </div>

                  {/* Reset Password - only for System Admin in edit mode */}
                  {editingId && currentUser.role === UserRole.SYSTEM_ADMIN && (
                    <button
                      type="button"
                      onClick={handleResetPasswordClick}
                      className="w-full mt-2 border border-amber-200 hover:bg-amber-50 text-amber-700 font-medium py-2 rounded-lg transition-colors text-xs flex items-center justify-center gap-1.5"
                    >
                      <Key size={13} /> 重置密碼為臨時值 ({getDefaultPasswordForRole(formData.role)})
                    </button>
                  )}

                </div>
              </form>
            </div>
          </div>
        )}

        {/* User List */}
        <div
          className={`${currentUser.permissions?.includes(PERMISSIONS.EDIT_STAFF) ? "xl:col-span-2" : "xl:col-span-3"} grid grid-cols-1 md:grid-cols-2 gap-4 auto-rows-min pb-20`}
        >
          {users
            .filter((user) => {
              // Department isolation for supervisors
              if (
                currentUser.role === UserRole.SUPERVISOR &&
                !user.isRadiographer
              )
                return false;
              // HM Supervisor isolation with Location Awareness
              if (currentUser.role === UserRole.HM_SUPERVISOR) {
                if (!user.isHealthMgmt) return false;
                // If the supervisor is restricted to a location, only show staff in that location
                if (
                  currentUser.healthMgmtLocation &&
                  currentUser.healthMgmtLocation !== "全部"
                ) {
                  return (
                    user.healthMgmtLocation === currentUser.healthMgmtLocation
                  );
                }
              }

              // Hide resigned users once their resignation date is effective
              if (user.isActive === false) {
                if (!user.resignationDate) return false;
                return (
                  toLocalISOString(new Date()) <= user.resignationDate
                );
              }
              return true;
            })
            .map((user) => {
              const isEditingThisUser = editingId === user.id;
              const employmentPause = getEmploymentPause(user);
              const todayStr = toLocalISOString(new Date());
              const isCurrentlyPaused =
                !!employmentPause &&
                todayStr >= employmentPause.startDate &&
                todayStr <= employmentPause.endDate;

              return (
                <div
                  key={user.id}
                  className={`bg-white p-4 rounded-xl border shadow-sm transition-all group flex flex-col gap-3 h-fit relative ${
                    isEditingThisUser
                      ? "border-teal-400 ring-2 ring-teal-100 shadow-md transform scale-[1.01]"
                      : "border-gray-100 hover:shadow-md"
                  } ${user.isActive === false ? "opacity-60 bg-gray-50 grayscale-[0.5]" : ""}`}
                >
                  {/* Action Buttons - Only show if has EDIT_STAFF permission */}
                  {currentUser.permissions?.includes(
                    PERMISSIONS.EDIT_STAFF,
                  ) && (
                    <div className="absolute top-4 right-4 flex gap-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity z-10">
                      <button
                        type="button"
                        onClick={(e) => handleEditClick(e, user)}
                        className="p-1.5 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                        title="編輯"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteClick(e, user.id)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="停用帳號"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  )}

                  <div 
                    className="flex items-start gap-4 cursor-pointer"
                    onClick={() => setExpandedUserId(expandedUserId === user.id ? null : user.id)}
                  >
                    {/* Colored Avatar */}
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-sm"
                      style={{ backgroundColor: user.color || "#9CA3AF" }}
                    >
                      {user.alias || user.name.charAt(0)}
                    </div>

                    <div className="flex-1 min-w-0 pr-16">
                      <h4 className="font-bold text-gray-900 truncate text-base">
                        {user.name}
                      </h4>
                      <div className="text-xs text-gray-500 flex items-center gap-1 mb-2 truncate font-medium">
                        <Key size={12} /> {user.username}
                      </div>
                      <div className="flex gap-2">
                        <div className="flex gap-2 flex-wrap">
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded font-bold border flex items-center gap-1 ${
                              user.role === UserRole.SUPERVISOR ||
                              user.role === UserRole.HM_SUPERVISOR
                                ? "bg-purple-50 text-purple-700 border-purple-100"
                                : user.role === UserRole.SYSTEM_ADMIN
                                  ? "bg-gray-800 text-white border-gray-900"
                                  : user.role === UserRole.PHYSICIAN_ADMIN ||
                                      user.role === UserRole.SCHEDULER
                                    ? "bg-amber-50 text-amber-700 border-amber-100"
                                    : user.role === UserRole.VIEWER ||
                                        user.role === UserRole.FINANCE
                                      ? "bg-gray-50 text-gray-500 border-gray-200"
                                      : user.role === UserRole.HM_STAFF
                                        ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                                        : user.role === UserRole.RADIOGRAPHER_ASSISTANT
                                          ? "bg-teal-50 text-teal-700 border-teal-100"
                                          : "bg-blue-50 text-blue-700 border-blue-100"
                            }`}
                          >
                            {user.role === UserRole.SUPERVISOR
                              ? "放射師主管"
                              : user.role === UserRole.HM_SUPERVISOR
                                ? "健管主管"
                                : user.role === UserRole.SYSTEM_ADMIN
                                  ? "系統管理員"
                                  : user.role === UserRole.PHYSICIAN_ADMIN ||
                                      user.role === UserRole.SCHEDULER
                                    ? "醫師/行政管理"
                                    : user.role === UserRole.VIEWER
                                      ? "瀏覽者"
                                      : user.role === UserRole.FINANCE
                                        ? "財會"
                                        : user.role === UserRole.HM_STAFF
                                          ? "健管同仁"
                                          : user.role === UserRole.RADIOGRAPHER_ASSISTANT
                                            ? "放射師助理"
                                            : "放射師同仁"}
                          </span>
                          {user.role !== UserRole.SYSTEM_ADMIN && (
                            <span className="text-[10px] px-2 py-0.5 rounded font-bold border bg-orange-50 text-orange-700 border-orange-100 flex items-center gap-1">
                              {user.groupId} 組
                            </span>
                          )}

                          {user.isActive === false && (
                            <span className="text-[10px] px-2 py-0.5 rounded font-bold border bg-gray-100 text-gray-500 border-gray-200 flex items-center gap-1">
                              已離職
                            </span>
                          )}
                          {employmentPause && (
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded font-bold border ${isCurrentlyPaused ? "bg-indigo-100 text-indigo-700 border-indigo-200" : "bg-indigo-50 text-indigo-600 border-indigo-100"} flex items-center gap-1`}
                            >
                              留停 {employmentPause.startDate} ~{" "}
                              {employmentPause.endDate}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>


                  {/* Skills Display */}
                  {expandedUserId === user.id && (
                    <div className="border-t border-gray-50 pt-3 mt-1 animate-in fade-in slide-in-from-top-2 duration-200">
                      <h5 className="text-[10px] text-gray-400 font-bold uppercase mb-1.5 tracking-wider flex items-center gap-2">
                      技能與特殊任務
                    </h5>
                    <div className="flex flex-wrap gap-1">
                      {/* Certified Skills */}
                      {user.capabilities &&
                        user.capabilities.length > 0 &&
                        user.capabilities.map((cap) => {
                          const isSpecial = isSpecialRole(cap);
                          return (
                            <span
                              key={cap}
                              className={`px-2 py-0.5 rounded text-[10px] font-bold border flex items-center gap-1 ${
                                isSpecial
                                  ? "bg-purple-50 text-purple-600 border-purple-100"
                                  : "bg-gray-100 text-gray-600 border-gray-200"
                              }`}
                            >
                              {isSpecial && (
                                <Star
                                  size={8}
                                  className="fill-purple-500 text-purple-500"
                                />
                              )}
                              {cap}
                            </span>
                          );
                        })}

                      {/* Learning Skills */}
                      {user.learningCapabilities &&
                        user.learningCapabilities.length > 0 &&
                        user.learningCapabilities.map((cap) => (
                          <span
                            key={cap}
                            className="px-2 py-0.5 rounded text-[10px] font-bold border flex items-center gap-1 bg-yellow-50 text-yellow-700 border-yellow-200"
                          >
                            <BookOpen size={8} className="text-yellow-600" />
                            {cap}(學)
                          </span>
                        ))}

                      {/* Excluded Skills - New */}
                      {user.excludedCapabilities &&
                        user.excludedCapabilities.length > 0 &&
                        user.excludedCapabilities.map((cap) => (
                          <span
                            key={cap}
                            className="px-2 py-0.5 rounded text-[10px] font-bold border flex items-center gap-1 bg-gray-200 text-gray-700 border-gray-300"
                          >
                            <Shield size={8} className="text-gray-600" />
                            {cap}(不排)
                          </span>
                        ))}

                      {/* Unlocked Gamified Skills */}
                      {user.unlockedSkills &&
                        user.unlockedSkills.length > 0 &&
                        user.unlockedSkills.map((skillId) => (
                          <span
                            key={skillId}
                            className="px-2 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1 bg-gradient-to-r from-yellow-500/20 to-amber-500/20 text-yellow-600 border-yellow-300 shadow-[0_0_8px_rgba(234,179,8,0.3)]"
                            title={getSkillById(skillId)?.name}
                          >
                            <Medal size={10} className="text-yellow-500" />
                            {skillId}
                          </span>
                        ))}

                      {/* Learning Gamified Skills */}
                      {user.learningSkills &&
                        user.learningSkills.length > 0 &&
                        user.learningSkills.map((skillId) => (
                          <span
                            key={skillId}
                            className="px-2 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1 bg-blue-50 text-blue-600 border-blue-200"
                            title={getSkillById(skillId)?.name}
                          >
                            <Gamepad2 size={10} className="text-blue-500" />
                            {skillId}
                          </span>
                        ))}

                      {!user.capabilities?.length &&
                        !user.learningCapabilities?.length &&
                        !user.excludedCapabilities?.length &&
                        !user.unlockedSkills?.length &&
                        !user.learningSkills?.length && (
                          <span className="text-[10px] text-gray-300 italic px-1">
                            未設定技能
                          </span>
                        )}
                    </div>
                  </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
};

export default StaffPage;
