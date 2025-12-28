
import React, { useState } from 'react';
import { User, UserRole, StaffGroup, SYSTEM_OFF, StationDefault, SPECIAL_ROLES } from '../types';
import { db } from '../services/store';
import { Mail, Shield, Users, Trash2, Plus, Check, CheckSquare, Square, Pencil, X, Save, Palette, AlertCircle, Star, BookOpen, Key } from 'lucide-react';
import ConfirmModal from '../components/ConfirmModal';

interface StaffPageProps {
  currentUser: User;
}

const StaffPage: React.FC<StaffPageProps> = ({ currentUser }) => {
  const [users, setUsers] = useState<User[]>(db.getUsers());
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
    email: string;
    role: UserRole;
    groupId: StaffGroup;
    color: string;
    capabilities: string[];
    learningCapabilities: string[];
  }>({ 
    name: '', 
    alias: '',
    email: '', 
    role: UserRole.EMPLOYEE, 
    groupId: StaffGroup.GROUP_A,
    color: COLOR_PALETTE[5], // Default Blue
    capabilities: [],
    learningCapabilities: []
  });

  const resetForm = () => {
    setFormData({ 
        name: '', 
        alias: '',
        email: '', 
        role: UserRole.EMPLOYEE, 
        groupId: StaffGroup.GROUP_A, 
        color: COLOR_PALETTE[5],
        capabilities: [],
        learningCapabilities: []
    });
    setEditingId(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Auto-generate alias if empty (take first char)
    const finalAlias = formData.alias || formData.name.charAt(0);

    if (editingId) {
      // Update existing user
      db.updateUser(editingId, {
        name: formData.name,
        alias: finalAlias,
        email: formData.email,
        role: formData.role,
        groupId: formData.groupId,
        color: formData.color,
        capabilities: formData.capabilities,
        learningCapabilities: formData.learningCapabilities
      });
    } else {
      // Create new user
      const u: User = {
        id: Math.random().toString(36).substr(2, 9),
        name: formData.name,
        alias: finalAlias,
        email: formData.email,
        role: formData.role,
        groupId: formData.groupId,
        color: formData.color,
        capabilities: formData.capabilities,
        learningCapabilities: formData.learningCapabilities
      };
      db.addUser(u);
    }

    setUsers([...db.getUsers()]); // Refresh list
    resetForm();
  };

  const handleEditClick = (e: React.MouseEvent, user: User) => {
    e.stopPropagation(); // Prevent triggering parent clicks
    setEditingId(user.id);
    setFormData({
      name: user.name,
      alias: user.alias || user.name.charAt(0),
      email: user.email,
      role: user.role,
      groupId: user.groupId,
      color: user.color || COLOR_PALETTE[5],
      capabilities: user.capabilities || [],
      learningCapabilities: user.learningCapabilities || []
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

  const handleResetPassword = () => {
      if (editingId) {
          if (window.confirm('確定要將此使用者的密碼重置為預設值 (1234) 嗎？')) {
              db.resetPassword(editingId);
              alert('密碼已重置為 1234。');
          }
      }
  };

  // 3-State Toggle: None -> Certified -> Learning -> None
  const toggleCapability = (cap: string) => {
    setFormData(prev => {
      const isCertified = prev.capabilities.includes(cap);
      const isLearning = prev.learningCapabilities.includes(cap);

      if (isCertified) {
          // Certified -> Learning
          return {
              ...prev,
              capabilities: prev.capabilities.filter(c => c !== cap),
              learningCapabilities: [...prev.learningCapabilities, cap]
          };
      } else if (isLearning) {
          // Learning -> None
          return {
              ...prev,
              learningCapabilities: prev.learningCapabilities.filter(c => c !== cap)
          };
      } else {
          // None -> Certified
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

  const handleConfirmDelete = () => {
      if (deleteTargetId) {
          db.deleteUser(deleteTargetId);
          setUsers(db.getUsers());
          if (editingId === deleteTargetId) {
              resetForm();
          }
          setDeleteTargetId(null);
      }
  };

  // Only Supervisor and Admin can access
  if (currentUser.role !== UserRole.SUPERVISOR && currentUser.role !== UserRole.SYSTEM_ADMIN) {
    return <div className="p-8 text-center text-gray-500">權限不足。</div>;
  }

  // Helper to check if a capability is a special role
  const isSpecialRole = (cap: string) => Object.values(SPECIAL_ROLES).includes(cap);
  const radiographersCount = users.filter(u => u.role === UserRole.EMPLOYEE || u.role === UserRole.SUPERVISOR).length;

  return (
    <div className="p-6 max-w-7xl mx-auto h-screen overflow-y-auto">
      <ConfirmModal 
        isOpen={!!deleteTargetId}
        onClose={() => setDeleteTargetId(null)}
        onConfirm={handleConfirmDelete}
        title="刪除人員確認"
        message="確定要移除此人員嗎？此動作無法復原，該人員的相關排班紀錄可能會遺失。"
        confirmText="確認刪除"
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
                全體人數: {users.length}
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Form Section (Sticky) */}
        <div className="xl:col-span-1">
          <div className={`bg-white p-5 rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border sticky top-4 transition-all duration-300 ${editingId ? 'border-teal-400 ring-1 ring-teal-100' : 'border-gray-100'}`}>
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
              <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">姓名</label>
                    <input 
                      type="text" 
                      required
                      value={formData.name}
                      onChange={e => setFormData({...formData, name: e.target.value})}
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
                      onChange={e => setFormData({...formData, alias: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none text-sm shadow-sm transition-all bg-white text-center font-bold"
                      placeholder={formData.name ? formData.name.charAt(0) : "王"}
                    />
                  </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">Email</label>
                <input 
                  type="email" 
                  required
                  value={formData.email}
                  onChange={e => setFormData({...formData, email: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none text-sm shadow-sm transition-all bg-white"
                  placeholder="wang@med.com"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">身份</label>
                  <select 
                    value={formData.role}
                    onChange={e => setFormData({...formData, role: e.target.value as UserRole})}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none text-sm shadow-sm bg-white cursor-pointer"
                  >
                    <option value={UserRole.EMPLOYEE}>放射師</option>
                    <option value={UserRole.SUPERVISOR}>部門主管</option>
                    {currentUser.role === UserRole.SYSTEM_ADMIN && (
                        <option value={UserRole.SYSTEM_ADMIN}>系統管理員</option>
                    )}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">組別</label>
                  <select 
                    value={formData.groupId}
                    onChange={e => setFormData({...formData, groupId: e.target.value as StaffGroup})}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none text-sm shadow-sm bg-white cursor-pointer"
                  >
                    <option value={StaffGroup.GROUP_A}>A 組</option>
                    <option value={StaffGroup.GROUP_B}>B 組</option>
                    <option value={StaffGroup.GROUP_C}>C 組</option>
                  </select>
                </div>
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
                            onClick={() => setFormData({...formData, color})}
                            className={`w-6 h-6 rounded-full border-2 transition-all ${
                                formData.color === color ? 'border-gray-600 scale-110' : 'border-transparent hover:scale-110'
                            }`}
                            style={{ backgroundColor: color }}
                          />
                      ))}
                  </div>
              </div>

              {/* Capabilities Selection */}
              <div>
                <div className="flex justify-between items-center mb-2">
                     <label className="text-xs font-semibold text-gray-500 block">技能與特殊任務資格</label>
                     <span className="text-[10px] text-gray-400 bg-gray-50 px-2 py-0.5 rounded">點擊切換：無 → 獨立 → 學習</span>
                </div>
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1 custom-scrollbar">
                    {allCapabilities.map(cap => {
                        const isCertified = formData.capabilities.includes(cap);
                        const isLearning = formData.learningCapabilities.includes(cap);
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
                        }

                        return (
                            <button
                                key={cap}
                                type="button"
                                onClick={() => toggleCapability(cap)}
                                className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs border transition-all text-left ${btnClass}`}
                            >
                                {icon}
                                {isSpecial && <Star size={10} className={isCertified ? "text-yellow-500 fill-yellow-500" : "text-gray-400"} />}
                                <span className="truncate">{cap} {isLearning && '(學習中)'}</span>
                            </button>
                        );
                    })}
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
                        className={`flex-1 font-bold py-2.5 rounded-lg transition-colors text-sm flex items-center justify-center gap-2 shadow-sm ${
                            editingId 
                            ? 'bg-teal-600 hover:bg-teal-700 text-white shadow-teal-200' 
                            : 'bg-gray-800 hover:bg-gray-900 text-white shadow-gray-300'
                        }`}
                    >
                        {editingId ? <Save size={16} /> : <Plus size={16} />} 
                        {editingId ? '儲存變更' : '建立帳號'}
                    </button>
                 </div>
                 
                 {editingId && (
                     <button 
                        type="button"
                        onClick={handleResetPassword}
                        className="w-full border border-gray-300 hover:bg-gray-50 text-gray-600 font-medium py-2 rounded-lg transition-colors text-xs flex items-center justify-center gap-1"
                     >
                         <Key size={12} /> 重置密碼 (預設1234)
                     </button>
                 )}
              </div>
            </form>
          </div>
        </div>

        {/* User List */}
        <div className="xl:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4 auto-rows-min pb-20">
          {users.map(user => {
            const isEditingThisUser = editingId === user.id;
            
            return (
                <div 
                    key={user.id} 
                    className={`bg-white p-4 rounded-xl border shadow-sm transition-all group flex flex-col gap-3 h-fit relative ${
                        isEditingThisUser 
                        ? 'border-teal-400 ring-2 ring-teal-100 shadow-md transform scale-[1.01]' 
                        : 'border-gray-100 hover:shadow-md'
                    }`}
                >
                   {/* Action Buttons */}
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
                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title="移除人員"
                        >
                            <Trash2 size={16} />
                        </button>
                   </div>

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
                                <Mail size={12} /> {user.email}
                            </div>
                            <div className="flex gap-2">
                                <span className={`text-[10px] px-2 py-0.5 rounded font-bold border flex items-center gap-1 ${
                                    user.role === UserRole.SUPERVISOR 
                                        ? 'bg-purple-50 text-purple-700 border-purple-100' 
                                        : (user.role === UserRole.SYSTEM_ADMIN 
                                            ? 'bg-gray-800 text-white border-gray-900' 
                                            : 'bg-blue-50 text-blue-700 border-blue-100')
                                }`}>
                                    {user.role === UserRole.SUPERVISOR ? '主管' : (user.role === UserRole.SYSTEM_ADMIN ? '系統管理員' : '放射師')}
                                </span>
                                {user.role !== UserRole.SYSTEM_ADMIN && (
                                    <span className="text-[10px] px-2 py-0.5 rounded font-bold border bg-orange-50 text-orange-700 border-orange-100 flex items-center gap-1">
                                        {user.groupId} 組
                                    </span>
                                )}
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
                                       <span key={cap} className={`px-2 py-0.5 rounded text-[10px] font-bold border flex items-center gap-1 ${
                                           isSpecial ? 'bg-purple-50 text-purple-600 border-purple-100' : 'bg-gray-100 text-gray-600 border-gray-200'
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

                           {(!user.capabilities?.length && !user.learningCapabilities?.length) && (
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
