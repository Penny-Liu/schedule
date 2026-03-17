
import React, { useState } from 'react';
import { User, UserRole, StaffGroup, SYSTEM_OFF, StationDefault, SPECIAL_ROLES, PERMISSIONS, PERMISSION_LABELS } from '../types';
import { db, getPermissionsByRole } from '../services/store';
import { Mail, Shield, Users, Trash2, Plus, Check, CheckSquare, Square, Pencil, X, Save, Palette, AlertCircle, Star, BookOpen, Key } from 'lucide-react';
import ConfirmModal from '../components/ConfirmModal';
import { generateUUID } from '../services/utils';

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
    return () => unsubscribe();
  }, []);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const allStations = db.getStations().filter(s => s !== SYSTEM_OFF && s !== StationDefault.UNASSIGNED);

  // Combine Stations + Special Roles for Capability Selection
  const allCapabilities = [
    ...Object.values(SPECIAL_ROLES), // Add '開機', '晚班', '輔班', '排班'
    ...allStations
  ];

  // State to track editing mode
  const [editingId, setEditingId] = useState<string | null>(null);

  // Delete Modal State
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  // Predefined palette for users
  const COLOR_PALETTE = [
    '#EF4444', // Red 500
    '#F97316', // Orange 500
    '#F59E0B', // Amber 500
    '#10B981', // Emerald 500
    '#06B6D4', // Cyan 500
    '#3B82F6', // Blue 500
    '#6366F1', // Indigo 500
    '#8B5CF6', // Violet 500
    '#EC4899', // Pink 500
    '#64748B', // Slate 500
    '#84CC16', // Lime 500 
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
    excludedCapabilities: string[]; // New
    isRadiographer: boolean; // New
    isPartTime: boolean; // New
    isHealthMgmt: boolean; // New
    isActive: boolean; // New
    resignationDate: string; // New
    groupIndex: number; // For Group D rotation order
    permissions: string[];
  }>({
    name: '',
    alias: '',
    username: '',
    role: UserRole.RADIOGRAPHER_STAFF,
    groupId: StaffGroup.GROUP_A,
    color: COLOR_PALETTE[5], // Default Blue
    capabilities: [],
    learningCapabilities: [],
    excludedCapabilities: [], // New
    isRadiographer: false, // New
    isPartTime: false, // New
    isHealthMgmt: false, // New
    isActive: true, // New
    resignationDate: '', // New
    groupIndex: 0,
    permissions: [PERMISSIONS.VIEW_PHYSICIAN]
  });

  const resetForm = () => {
    setFormData({
      name: '',
      alias: '',
      username: '',
      role: UserRole.RADIOGRAPHER_STAFF,
      groupId: StaffGroup.GROUP_A,
      color: COLOR_PALETTE[5],
      capabilities: [],
      learningCapabilities: [],
      excludedCapabilities: [],
      isRadiographer: false,
      isActive: true,
      isPartTime: false,
      isHealthMgmt: false,
      resignationDate: '',
      groupIndex: 0,
      permissions: [PERMISSIONS.VIEW_PHYSICIAN]
    });
    setEditingId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSaving(true);

    // Auto-generate alias if empty (take first char)
    const finalAlias = formData.alias || formData.name.charAt(0);

    try {
      if (editingId) {
        // Update existing user
        await db.updateUser(editingId, {
          name: formData.name,
          alias: finalAlias,
          username: formData.username,
          role: formData.role,
          groupId: formData.groupId,
          color: formData.color,
          capabilities: formData.capabilities,
          learningCapabilities: formData.learningCapabilities,
          excludedCapabilities: formData.excludedCapabilities,
          isRadiographer: formData.isRadiographer,
          isPartTime: formData.isPartTime,
          isHealthMgmt: formData.isHealthMgmt,
          isActive: formData.isActive,
          resignationDate: formData.resignationDate,
          groupIndex: formData.groupId === StaffGroup.GROUP_D ? formData.groupIndex : undefined,
          permissions: formData.permissions
        });
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
          excludedCapabilities: formData.excludedCapabilities,
          isRadiographer: formData.isRadiographer,
          isPartTime: formData.isPartTime,
          isHealthMgmt: formData.isHealthMgmt,
          isActive: formData.isActive,
          resignationDate: formData.resignationDate,
          groupIndex: formData.groupId === StaffGroup.GROUP_D ? formData.groupIndex : undefined,
          password: '1234',
          mustChangePassword: true,
          permissions: formData.permissions
        };
        await db.addUser(u);
      }

      setUsers([...db.getUsers()]); // Refresh list
      resetForm();
    } catch (err: any) {
      console.error("Save failed:", err);
      setError(typeof err === 'object' ? (err.message || JSON.stringify(err)) : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditClick = (e: React.MouseEvent, user: User) => {
    e.stopPropagation(); // Prevent triggering parent clicks
    setEditingId(user.id);
    setFormData({
      name: user.name,
      alias: user.alias || user.name.charAt(0),
      username: user.username,
      role: user.role,
      groupId: user.groupId,
      color: user.color || COLOR_PALETTE[5],
      capabilities: user.capabilities || [],
      learningCapabilities: user.learningCapabilities || [],
      excludedCapabilities: user.excludedCapabilities || [],
      isRadiographer: user.isRadiographer || false,
      isPartTime: user.isPartTime || false,
      isHealthMgmt: user.isHealthMgmt || false,
      isActive: user.isActive !== undefined ? user.isActive : true,
      resignationDate: user.resignationDate || '',
      groupIndex: user.groupIndex ?? 0,
      permissions: user.permissions || []
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

  const handleResetPasswordClick = () => {
    if (editingId) setResetTargetId(editingId);
  };

  const confirmResetPassword = () => {
    if (resetTargetId) {
      db.resetPassword(resetTargetId);
      // alert('密碼已重置為 1234。'); // 用 custom toast 或直接靜默處理，這裡先依靠 UI 刷新
      setResetTargetId(null);
    }
  };

  // 4-State Toggle: None -> Certified -> Learning -> Excluded (不排) -> None
  const toggleCapability = (cap: string) => {
    setFormData(prev => {
      const isCertified = prev.capabilities.includes(cap);
      const isLearning = prev.learningCapabilities.includes(cap);
      const isExcluded = prev.excludedCapabilities.includes(cap);

      if (isCertified) {
        // Certified -> Learning
        return {
          ...prev,
          capabilities: prev.capabilities.filter(c => c !== cap),
          learningCapabilities: [...prev.learningCapabilities, cap]
        };
      } else if (isLearning) {
        // Learning -> Excluded (Independent but No Auto-Schedule)
        return {
          ...prev,
          learningCapabilities: prev.learningCapabilities.filter(c => c !== cap),
          excludedCapabilities: [...prev.excludedCapabilities, cap]
        };
      } else if (isExcluded) {
        // Excluded -> None
        return {
          ...prev,
          excludedCapabilities: prev.excludedCapabilities.filter(c => c !== cap)
        };
      } else {
        // None -> Certified (Independent)
        return {
          ...prev,
          capabilities: [...prev.capabilities, cap]
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
        const updatedUser = db.getUsers().find(u => u.id === deleteTargetId);
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
  if (!currentUser.permissions?.includes(PERMISSIONS.VIEW_STAFF) && currentUser.role !== UserRole.SYSTEM_ADMIN) {
    return <div className="p-8 text-center text-gray-500">權限不足。</div>;
  }

  // Helper to check if a capability is a special role
  const isSpecialRole = (cap: string) => Object.values(SPECIAL_ROLES).includes(cap);
  const radiographersCount = users.filter(u => u.role === UserRole.RADIOGRAPHER_STAFF || u.role === UserRole.SUPERVISOR).length;

  return (
    <div className="p-6 max-w-7xl mx-auto h-screen overflow-y-auto">
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
        message="確定要將此使用者的密碼重置為預設值 (1234) 嗎？"
        confirmText="確認重置"
        confirmColor="red"
      />

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-800">人員管理</h2>
          <p className="text-sm text-gray-500">管理使用者帳號、權限、分組與技能</p>
        </div>
        <div className="flex gap-2">
          <div className="text-xs text-gray-500 flex items-center gap-1 bg-white border border-gray-200 px-3 py-1.5 rounded-full shadow-sm">
            <Users size={14} />
            部門人數: {users.filter(user => {
              if (currentUser.role === UserRole.SYSTEM_ADMIN) return true;
              if (currentUser.role === UserRole.SUPERVISOR) return user.isRadiographer;
              if (currentUser.role === UserRole.HM_SUPERVISOR) return user.isHealthMgmt;
              return false;
            }).length}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Form Section (Sticky) - Only show if has EDIT_STAFF permission */}
        {currentUser.permissions?.includes(PERMISSIONS.EDIT_STAFF) && (
          <div className="xl:col-span-1">
            <div className={`bg-white p-5 rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border sticky top-4 transition-all duration-300 max-h-[calc(100vh-2rem)] overflow-y-auto custom-scrollbar ${editingId ? 'border-teal-400 ring-1 ring-teal-100' : 'border-gray-100'}`}>
            <div className="flex justify-between items-center mb-4">
              <h3 className={`text-sm font-bold flex items-center gap-2 ${editingId ? 'text-teal-700' : 'text-gray-800'}`}>
                <span className={`w-1 h-4 rounded-full ${editingId ? 'bg-teal-600' : 'bg-gray-400'}`}></span>
                {editingId ? '編輯人員資料' : '新增人員'}
              </h3>
              {editingId && (
                <button
                  onClick={handleCancelEdit}
                  className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-colors"
                  title="取消編輯"
                >
                  <X size={16} />
                </button>
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
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">姓名</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none text-sm shadow-sm transition-all bg-white"
                    placeholder="王小明"
                  />
                </div>
                <div className="w-24">
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">代號 (1字)</label>
                  <input
                    type="text"
                    maxLength={1}
                    value={formData.alias}
                    onChange={e => setFormData({ ...formData, alias: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none text-sm shadow-sm transition-all bg-white text-center font-bold"
                    placeholder={formData.name ? formData.name.charAt(0) : "王"}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">帳號 (Username)</label>
                <input
                  type="text"
                  required
                  value={formData.username}
                  onChange={e => setFormData({ ...formData, username: e.target.value })}
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
                        onChange={e => setFormData({ ...formData, isRadiographer: e.target.checked })}
                        disabled={currentUser.role === UserRole.HM_SUPERVISOR}
                        className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                     />
                     <label htmlFor="isRadiographer" className={`text-xs font-bold cursor-pointer ${currentUser.role === UserRole.HM_SUPERVISOR ? 'text-gray-400' : 'text-gray-700'}`}>
                        是否為放射師 (顯示於排班總覽)
                     </label>
                  </div>
                  
                  {/* Part-time option - Indented to show relationship but separate click target */}
                  <div className="flex items-center gap-2 ml-6">
                     <input
                        type="checkbox"
                        id="isPartTime"
                        checked={formData.isPartTime}
                        onChange={e => setFormData({ ...formData, isPartTime: e.target.checked })}
                        disabled={!formData.isRadiographer || currentUser.role === UserRole.HM_SUPERVISOR}
                        className={`w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500 ${(!formData.isRadiographer || currentUser.role === UserRole.HM_SUPERVISOR) ? 'opacity-50 cursor-not-allowed' : ''}`}
                     />
                      <label htmlFor="isPartTime" className={`text-xs font-bold cursor-pointer ${(!formData.isRadiographer || currentUser.role === UserRole.HM_SUPERVISOR) ? 'text-gray-400' : 'text-gray-700'}`}>
                        兼職放射師 (總覽隱藏，崗位顯示)
                      </label>
                  </div>

                  <div className="flex items-center gap-2">
                     <input
                        type="checkbox"
                        id="isHealthMgmt"
                        checked={formData.isHealthMgmt}
                        onChange={e => setFormData({ ...formData, isHealthMgmt: e.target.checked })}
                        disabled={currentUser.role === UserRole.SUPERVISOR}
                        className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                     />
                     <label htmlFor="isHealthMgmt" className={`text-xs font-bold cursor-pointer ${currentUser.role === UserRole.SUPERVISOR ? 'text-gray-400' : 'text-gray-700'}`}>
                        是否為健管人員 (健管排班)
                     </label>
                  </div>
              </div>

              <div className="flex items-center gap-2 mb-2 bg-gray-50 p-2 rounded border border-gray-100">
                 <input
                    type="checkbox"
                    id="isActive"
                    checked={formData.isActive}
                    onChange={e => setFormData({ ...formData, isActive: e.target.checked })}
                    className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                 />
                 <label htmlFor="isActive" className={`text-xs font-bold cursor-pointer flex items-center gap-2 ${formData.isActive ? 'text-teal-700' : 'text-gray-500'}`}>
                    {formData.isActive ? <Check size={14} /> : <X size={14} />}
                    {formData.isActive ? '在職中 (Active)' : '已離職 (Resigned)'}
                 </label>
              </div>

              {!formData.isActive && (
                <div className="bg-red-50 p-3 rounded-lg border border-red-100 mb-2">
                  <label className="text-xs font-bold text-red-700 mb-1 block">離職日期 (此日期後不排班)</label>
                  <input
                    type="date"
                    value={formData.resignationDate}
                    onChange={e => setFormData({ ...formData, resignationDate: e.target.value })}
                    className="w-full px-3 py-2 border border-red-200 rounded-lg text-sm focus:ring-2 focus:ring-red-500 outline-none"
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">身份</label>
                  <select
                    value={formData.role}
                    onChange={e => {
                        const newRole = e.target.value as UserRole;
                        const isHM = newRole === UserRole.HM_SUPERVISOR || newRole === UserRole.HM_STAFF;
                        const isRadio = newRole === UserRole.SUPERVISOR || newRole === UserRole.RADIOGRAPHER_STAFF;
                        
                        setFormData({ 
                            ...formData, 
                            role: newRole,
                            permissions: getPermissionsByRole(newRole),
                            isHealthMgmt: isHM || formData.isHealthMgmt,
                            isRadiographer: isRadio || formData.isRadiographer
                        });
                    }}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none text-sm shadow-sm bg-white cursor-pointer"
                  >
                    <option value={UserRole.RADIOGRAPHER_STAFF}>放射師同仁</option>
                    <option value={UserRole.SUPERVISOR}>放射師主管</option>
                    <option value={UserRole.HM_STAFF}>健管同仁</option>
                    <option value={UserRole.HM_SUPERVISOR}>健管主管</option>
                    <option value={UserRole.PHYSICIAN_ADMIN}>醫師/行政管理</option>
                    <option value={UserRole.VIEWER}>瀏覽者 (Viewer)</option>
                    <option value={UserRole.FINANCE}>財會</option>
                    {currentUser.role === UserRole.SYSTEM_ADMIN && (
                      <option value={UserRole.SYSTEM_ADMIN}>系統管理員</option>
                    )}
                  </select>
                </div>
                {(formData.isRadiographer || formData.role === UserRole.SYSTEM_ADMIN) && (
                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">組別</label>
                    <select
                      value={formData.groupId}
                      onChange={e => setFormData({ ...formData, groupId: e.target.value as StaffGroup })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none text-sm shadow-sm bg-white cursor-pointer"
                    >
                      <option value={StaffGroup.GROUP_A}>A 組 (6天循環)</option>
                      <option value={StaffGroup.GROUP_B}>B 組 (6天循環)</option>
                      <option value={StaffGroup.GROUP_C}>C 組 (6天循環)</option>
                      <option value={StaffGroup.GROUP_D}>D 組 (週日固定休，週一至六滾動輪休)</option>
                    </select>
                  </div>
                )}
                {/* Group D index selector */}
                {formData.groupId === StaffGroup.GROUP_D && (formData.isRadiographer || formData.role === UserRole.SYSTEM_ADMIN) && (
                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">
                      D組輪休順序 (Index 0–3)
                    </label>
                    <select
                      value={formData.groupIndex}
                      onChange={e => setFormData({ ...formData, groupIndex: Number(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none text-sm shadow-sm bg-white cursor-pointer"
                    >
                      <option value={0}>0（第1位休）</option>
                      <option value={1}>1（第2位休）</option>
                      <option value={2}>2（第3位休）</option>
                      <option value={3}>3（第4位休）</option>
                    </select>
                    <p className="text-[10px] text-gray-400 mt-1">每4天中的第幾天輪到這個人休息，4人各設不同數字 (0-3)</p>
                  </div>
                )}
              </div>

              {/* Color Selection */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs font-semibold text-gray-500 block">代表顏色</label>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-sm"
                      style={{ backgroundColor: formData.color }}
                    >
                      {formData.alias || (formData.name ? formData.name.charAt(0) : '?')}
                    </div>
                    <span className="text-[10px] text-gray-400">預覽</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {COLOR_PALETTE.map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setFormData({ ...formData, color })}
                      className={`w-6 h-6 rounded-full border-2 transition-all ${formData.color === color ? 'border-gray-600 scale-110' : 'border-transparent hover:scale-110'
                        }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              {/* Capabilities Selection (Only for Radiographers) */}
              {(formData.isRadiographer || formData.role === UserRole.SYSTEM_ADMIN) && (
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-xs font-semibold text-gray-500 block">技能與特殊任務資格</label>
                    <span className="text-[10px] text-gray-400 bg-gray-50 px-2 py-0.5 rounded">點擊切換：無 → 獨立 → 學習 → 不排</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1 custom-scrollbar">
                    {allCapabilities.map(cap => {
                      const isCertified = formData.capabilities.includes(cap);
                      const isLearning = formData.learningCapabilities.includes(cap);
                      const isExcluded = formData.excludedCapabilities.includes(cap);
                      const isSpecial = isSpecialRole(cap);

                      let btnClass = 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100 opacity-80 hover:opacity-100';
                      let icon = <Square size={14} className="text-gray-400" />;

                      if (isCertified) {
                        btnClass = isSpecial
                          ? 'bg-purple-50 border-purple-200 text-purple-700 font-bold'
                          : 'bg-teal-50 border-teal-200 text-teal-700 font-bold';
                        icon = <CheckSquare size={14} className={isSpecial ? "text-purple-600" : "text-teal-600"} />;
                      } else if (isLearning) {
                        btnClass = 'bg-yellow-50 border-yellow-200 text-yellow-700 font-bold';
                        icon = <BookOpen size={14} className="text-yellow-600" />;
                      } else if (isExcluded) {
                        btnClass = 'bg-gray-200 border-gray-300 text-gray-700 font-bold';
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
                </div>
              )}

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-xs font-semibold text-gray-500 block">功能權限控管</label>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 border border-gray-100 space-y-4 max-h-[500px] overflow-y-auto custom-scrollbar">
                    {[
                      {
                        title: '放射師業務',
                        perms: [PERMISSIONS.VIEW_STATS]
                      },
                      {
                        title: '醫師業務',
                        perms: [
                          PERMISSIONS.VIEW_PHYSICIAN,
                          PERMISSIONS.EDIT_PHYSICIAN,
                          PERMISSIONS.VIEW_DOCTOR_STATS,
                          PERMISSIONS.EDIT_DOCTOR_STATS,
                          PERMISSIONS.MANAGE_DOCTORS
                        ]
                      },
                       {
                        title: '健管業務',
                        perms: [PERMISSIONS.VIEW_HEALTH_MGMT, PERMISSIONS.EDIT_HEALTH_MGMT]
                      },
                      {
                        title: '麻護業務',
                        perms: [PERMISSIONS.VIEW_ANESTHESIA, PERMISSIONS.EDIT_ANESTHESIA]
                      },
                      {
                        title: '影像雲',
                        perms: [PERMISSIONS.VIEW_CLOUD_SCHEDULE, PERMISSIONS.EDIT_CLOUD_SCHEDULE]
                      },
                      {
                        title: '系統管理',
                        perms: [PERMISSIONS.VIEW_STAFF, PERMISSIONS.EDIT_STAFF, PERMISSIONS.EDIT_SETTINGS]
                      }
                    ].map(group => (
                      <div key={group.title} className="space-y-1.5">
                        <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                          <span className="w-1 h-2.5 bg-gray-300 rounded-full"></span>
                          {group.title}
                        </h4>
                        <div className="grid grid-cols-1 gap-1 pl-2">
                          {group.perms.map(value => (
                            <div key={value} className="flex items-center gap-2">
                              <input 
                                type="checkbox" 
                                id={`perm_${value}`}
                                checked={formData.permissions.includes(value)}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setFormData(prev => ({
                                      ...prev,
                                      permissions: checked 
                                        ? [...prev.permissions, value]
                                        : prev.permissions.filter(p => p !== value)
                                  }));
                                }}
                                className="w-3.5 h-3.5 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                              />
                              <label htmlFor={`perm_${value}`} className="text-xs text-gray-700 cursor-pointer hover:text-teal-700 transition-colors">
                                {PERMISSION_LABELS[value] || value}
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
                        isSaving ? 'opacity-50 cursor-not-allowed' : ''
                      } ${editingId
                        ? 'bg-teal-600 hover:bg-teal-700 text-white shadow-teal-200'
                        : 'bg-gray-800 hover:bg-gray-900 text-white shadow-gray-300'
                        }`}
                    >
                      {isSaving ? <Check className="animate-spin" size={16} /> : (editingId ? <Save size={16} /> : <Plus size={16} />)}
                      {isSaving ? '處理中...' : (editingId ? '儲存變更' : '建立帳號')}
                    </button>
                </div>

                {editingId && currentUser.role === UserRole.SYSTEM_ADMIN && (
                  <button
                    type="button"
                    onClick={handleResetPasswordClick}
                    className="w-full border border-gray-300 hover:bg-gray-50 text-gray-600 font-medium py-2 rounded-lg transition-colors text-xs flex items-center justify-center gap-1"
                  >
                    <Key size={12} /> 重置密碼 (預設1234)
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
        )}

        {/* User List */}
        <div className={`${currentUser.permissions?.includes(PERMISSIONS.EDIT_STAFF) ? 'xl:col-span-2' : 'xl:col-span-3'} grid grid-cols-1 md:grid-cols-2 gap-4 auto-rows-min pb-20`}>
          {users.filter(user => {
            // Department isolation for supervisors
            if (currentUser.role === UserRole.SUPERVISOR && !user.isRadiographer) return false;
            if (currentUser.role === UserRole.HM_SUPERVISOR && !user.isHealthMgmt) return false;

            // Hide resigned users once their resignation date is effective
            if (user.isActive === false) {
              if (!user.resignationDate) return false;
              return new Date().toISOString().slice(0, 10) <= user.resignationDate;
            }
            return true;
          }).map(user => {
            const isEditingThisUser = editingId === user.id;

            return (
              <div
                key={user.id}
                className={`bg-white p-4 rounded-xl border shadow-sm transition-all group flex flex-col gap-3 h-fit relative ${isEditingThisUser
                  ? 'border-teal-400 ring-2 ring-teal-100 shadow-md transform scale-[1.01]'
                  : 'border-gray-100 hover:shadow-md'
                  } ${user.isActive === false ? 'opacity-60 bg-gray-50 grayscale-[0.5]' : ''}`}
              >
                {/* Action Buttons - Only show if has EDIT_STAFF permission */}
                {currentUser.permissions?.includes(PERMISSIONS.EDIT_STAFF) && (
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

                <div className="flex items-start gap-4">
                  {/* Colored Avatar */}
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-sm"
                    style={{ backgroundColor: user.color || '#9CA3AF' }}
                  >
                    {user.alias || user.name.charAt(0)}
                  </div>

                  <div className="flex-1 min-w-0 pr-16">
                    <h4 className="font-bold text-gray-900 truncate text-base">{user.name}</h4>
                    <div className="text-xs text-gray-500 flex items-center gap-1 mb-2 truncate font-medium">
                      <Key size={12} /> {user.username}
                    </div>
                    <div className="flex gap-2">
                      <div className="flex gap-2 flex-wrap">
                       <span className={`text-[10px] px-2 py-0.5 rounded font-bold border flex items-center gap-1 ${
                          user.role === UserRole.SUPERVISOR || user.role === UserRole.HM_SUPERVISOR
                          ? 'bg-purple-50 text-purple-700 border-purple-100'
                          : (user.role === UserRole.SYSTEM_ADMIN
                            ? 'bg-gray-800 text-white border-gray-900'
                            : (user.role === UserRole.PHYSICIAN_ADMIN || user.role === UserRole.SCHEDULER
                                ? 'bg-amber-50 text-amber-700 border-amber-100'
                                : (user.role === UserRole.VIEWER || user.role === UserRole.FINANCE
                                    ? 'bg-gray-50 text-gray-500 border-gray-200'
                                    : (user.role === UserRole.HM_STAFF 
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                        : 'bg-blue-50 text-blue-700 border-blue-100'))))
                        }`}>
                        {user.role === UserRole.SUPERVISOR ? '放射師主管' 
                          : (user.role === UserRole.HM_SUPERVISOR ? '健管主管'
                          : (user.role === UserRole.SYSTEM_ADMIN ? '系統管理員' 
                          : (user.role === UserRole.PHYSICIAN_ADMIN || user.role === UserRole.SCHEDULER ? '醫師/行政管理' 
                          : (user.role === UserRole.VIEWER ? '瀏覽者'
                          : (user.role === UserRole.FINANCE ? '財會' 
                          : (user.role === UserRole.HM_STAFF ? '健管同仁' : '放射師同仁'))))))}
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
                      </div>
                    </div>
                  </div>
                </div>

                {/* Skills Display */}
                <div className="border-t border-gray-50 pt-3 mt-1">
                  <h5 className="text-[10px] text-gray-400 font-bold uppercase mb-1.5 tracking-wider flex items-center gap-2">
                    技能與特殊任務
                  </h5>
                  <div className="flex flex-wrap gap-1">
                    {/* Certified Skills */}
                    {user.capabilities && user.capabilities.length > 0 && (
                      user.capabilities.map(cap => {
                        const isSpecial = isSpecialRole(cap);
                        return (
                          <span key={cap} className={`px-2 py-0.5 rounded text-[10px] font-bold border flex items-center gap-1 ${isSpecial ? 'bg-purple-50 text-purple-600 border-purple-100' : 'bg-gray-100 text-gray-600 border-gray-200'
                            }`}>
                            {isSpecial && <Star size={8} className="fill-purple-500 text-purple-500" />}
                            {cap}
                          </span>
                        );
                      })
                    )}

                    {/* Learning Skills */}
                    {user.learningCapabilities && user.learningCapabilities.length > 0 && (
                      user.learningCapabilities.map(cap => (
                        <span key={cap} className="px-2 py-0.5 rounded text-[10px] font-bold border flex items-center gap-1 bg-yellow-50 text-yellow-700 border-yellow-200">
                          <BookOpen size={8} className="text-yellow-600" />
                          {cap}(學)
                        </span>
                      ))
                    )}

                    {/* Excluded Skills - New */}
                    {user.excludedCapabilities && user.excludedCapabilities.length > 0 && (
                      user.excludedCapabilities.map(cap => (
                        <span key={cap} className="px-2 py-0.5 rounded text-[10px] font-bold border flex items-center gap-1 bg-gray-200 text-gray-700 border-gray-300">
                          <Shield size={8} className="text-gray-600" />
                          {cap}(不排)
                        </span>
                      ))
                    )}

                    {(!user.capabilities?.length && !user.learningCapabilities?.length && !user.excludedCapabilities?.length) && (
                      <span className="text-[10px] text-gray-300 italic px-1">未設定技能</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default StaffPage;
