
import React, { useState, useEffect, useRef } from 'react';
import { User, UserRole, LeaveRequest, LeaveType, LeaveStatus, SPECIAL_ROLES } from '../types';
import { db } from '../services/store';
import { Plus, Check, X, Clock, CalendarDays, ArrowRightLeft, AlertTriangle, ChevronLeft, ChevronRight, Calendar, UserCheck, Briefcase, ThumbsUp } from 'lucide-react';

interface LeavePageProps {
  currentUser: User;
}

// --- Helper Component: Calendar Picker ---
interface CalendarPickerProps {
  label: string;
  value: string;
  onChange: (date: string) => void;
  userId: string;
  validStatus?: 'WORK' | 'OFF'; // If provided, strictly marks invalid days
  minDate?: string;
}

const CalendarPicker: React.FC<CalendarPickerProps> = ({ label, value, onChange, userId, validStatus, minDate }) => {
  const [showCalendar, setShowCalendar] = useState(false);
  const [viewDate, setViewDate] = useState(new Date()); // For navigation
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value) {
      setViewDate(new Date(value));
    }
  }, [value]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowCalendar(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [wrapperRef]);

  const handlePrevMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  };

  const handleDateClick = (dateStr: string, isValid: boolean) => {
    if (!isValid) return;
    onChange(dateStr);
    setShowCalendar(false);
  };

  // Generate Calendar Grid
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0 = Sun

  const days = [];
  for (let i = 0; i < firstDayOfWeek; i++) {
    days.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(new Date(year, month, i));
  }

  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

  return (
    <div className="relative" ref={wrapperRef}>
      <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">{label}</label>
      
      {/* Input Trigger */}
      <div 
        onClick={() => setShowCalendar(!showCalendar)}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg flex items-center justify-between cursor-pointer bg-white hover:border-teal-400 transition-colors group"
      >
        <span className={`text-sm ${value ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>
          {value || '點擊選擇日期'}
        </span>
        <Calendar size={16} className="text-gray-400 group-hover:text-teal-500" />
      </div>

      {/* Dropdown Calendar */}
      {showCalendar && (
        <div className="absolute top-full left-0 z-50 mt-1 w-full min-w-[280px] bg-white rounded-xl shadow-xl border border-gray-100 p-4 animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between mb-4">
            <button type="button" onClick={handlePrevMonth} className="p-1 hover:bg-gray-100 rounded-full text-gray-500">
              <ChevronLeft size={18} />
            </button>
            <span className="text-sm font-bold text-gray-800">
              {year}年 {month + 1}月
            </span>
            <button type="button" onClick={handleNextMonth} className="p-1 hover:bg-gray-100 rounded-full text-gray-500">
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-2">
            {weekDays.map((d, i) => (
              <div key={i} className={`text-center text-[10px] font-bold ${i === 0 || i === 6 ? 'text-red-400' : 'text-gray-400'}`}>
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {days.map((d, idx) => {
              if (!d) return <div key={idx} />;
              
              const dateStr = d.toLocaleDateString('en-CA'); // YYYY-MM-DD local
              const isSelected = value === dateStr;
              const status = db.getUserStatusOnDate(userId, dateStr);
              
              // Validation Logic
              let isValid = true;
              if (validStatus && status !== validStatus) isValid = false;
              if (minDate && dateStr < minDate) isValid = false;

              // Style calculation
              let bgClass = 'hover:bg-gray-100 text-gray-700';
              if (isSelected) bgClass = 'bg-teal-600 text-white hover:bg-teal-700 shadow-md shadow-teal-200';
              else if (!isValid) bgClass = 'opacity-30 cursor-not-allowed bg-gray-50 text-gray-400';
              else if (status === 'OFF') bgClass = 'bg-gray-50 text-red-400 hover:bg-red-50 font-medium'; // Visual cue for OFF days
              
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleDateClick(dateStr, isValid)}
                  className={`h-8 w-full rounded-lg text-xs flex items-center justify-center transition-all relative ${bgClass}`}
                  disabled={!isValid}
                >
                  {d.getDate()}
                  {/* Status Dot */}
                  {!isSelected && isValid && (
                     <span className={`absolute bottom-1 w-1 h-1 rounded-full ${status === 'WORK' ? 'bg-teal-400' : 'bg-red-300'}`}></span>
                  )}
                </button>
              );
            })}
          </div>
          
          <div className="mt-3 pt-2 border-t border-gray-100 flex justify-center gap-4 text-[10px] text-gray-400">
             <div className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-teal-400"></span> 上班日</div>
             <div className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-300"></span> 休假日</div>
          </div>
        </div>
      )}
    </div>
  );
};


const LeavePage: React.FC<LeavePageProps> = ({ currentUser }) => {
  const [leaves, setLeaves] = useState<LeaveRequest[]>(db.getLeaves());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const users = db.getUsers();

  // Form State
  const [formData, setFormData] = useState({
    startDate: '',
    endDate: '',
    type: LeaveType.PRE_SCHEDULED,
    reason: '',
    targetUserId: ''
  });

  const [validationMsg, setValidationMsg] = useState('');
  const [swapCandidates, setSwapCandidates] = useState<User[]>([]);

  // Reset form when modal opens
  useEffect(() => {
    if (isModalOpen) {
      setFormData({
        startDate: '',
        endDate: '',
        type: LeaveType.PRE_SCHEDULED,
        reason: '',
        targetUserId: ''
      });
      setValidationMsg('');
      setSwapCandidates([]);
    }
  }, [isModalOpen]);

  // Validation & Candidates Logic
  useEffect(() => {
    setValidationMsg('');
    setSwapCandidates([]);

    if (!formData.startDate) return;

    // Logic per type
    if (formData.type === LeaveType.PRE_SCHEDULED) {
       const status = db.getUserStatusOnDate(currentUser.id, formData.startDate);
       if (status === 'OFF') {
           setValidationMsg('該日期您原本就是「休假」，無需申請預假。');
       }
    } else if (formData.type === LeaveType.CANCEL_LEAVE) {
       const status = db.getUserStatusOnDate(currentUser.id, formData.startDate);
       if (status === 'WORK') {
           setValidationMsg('該日期您目前為「上班」狀態，無需申請銷假。');
       }
    } else if (formData.type === LeaveType.SWAP_SHIFT) {
       const status = db.getUserStatusOnDate(currentUser.id, formData.startDate);
       if (status === 'OFF') {
           setValidationMsg('您該日期為「休假」，不能申請與他人換假。');
       } else {
           const candidates = db.getUsersOffOnDate(formData.startDate).filter(u => u.id !== currentUser.id);
           setSwapCandidates(candidates);
       }
    } else if (formData.type === LeaveType.DUTY_SWAP) {
        // Special Logic for Duty Swap (Opening/Late)
        const shifts = db.getShifts(formData.startDate, formData.startDate);
        const myShift = shifts.find(s => s.userId === currentUser.id);
        
        // 1. Check if I have a special role
        const myRole = myShift?.specialRoles?.find(r => r === SPECIAL_ROLES.OPENING || r === SPECIAL_ROLES.LATE);
        
        if (!myRole) {
            setValidationMsg('您在該日期沒有被分配「開機」或「晚班」任務，無法申請任務換班。');
        } else {
            // 2. Find eligible candidates (Must be WORKING that day + Have Capability + NOT have conflicting role)
            const workers = db.getUsersWorkingOnDate(formData.startDate).filter(u => u.id !== currentUser.id);
            const validCandidates = workers.filter(u => {
                // Must have the skill for myRole
                if (!u.capabilities?.includes(myRole)) return false;
                
                // Must not already have a special role (to keep it simple, or check specific conflicts)
                const theirShift = shifts.find(s => s.userId === u.id);
                if (theirShift && theirShift.specialRoles.length > 0) return false;
                
                return true;
            });
            
            if (validCandidates.length === 0) {
                 setValidationMsg(`該日期沒有其他合格且無特殊任務的同事可供交換「${myRole}」。`);
            } else {
                 setSwapCandidates(validCandidates);
            }
        }
    }
  }, [formData.startDate, formData.type, currentUser.id]);


  const handleCreateLeave = (e: React.FormEvent) => {
    e.preventDefault();
    if (validationMsg) return;

    // Date Logic Fixes
    let finalEndDate = formData.endDate;
    if (formData.type !== LeaveType.LONG_LEAVE) {
        finalEndDate = formData.startDate; // Single day for others
    }

    // Long Leave Validation (4-12 days)
    if (formData.type === LeaveType.LONG_LEAVE) {
        if (!formData.startDate || !formData.endDate) {
             setValidationMsg('長假需選擇開始與結束日期。');
             return;
        }
        if (formData.endDate < formData.startDate) {
            setValidationMsg('結束日期不能早於開始日期。');
            return;
        }

        const start = new Date(formData.startDate);
        const end = new Date(formData.endDate);
        const diffTime = Math.abs(end.getTime() - start.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

        if (diffDays < 4 || diffDays > 12) {
             setValidationMsg(`長假天數必須介於 4 到 12 天之間 (目前: ${diffDays} 天)。`);
             return;
        }
    }

    // Swap Validation
    if ((formData.type === LeaveType.SWAP_SHIFT || formData.type === LeaveType.DUTY_SWAP) && !formData.targetUserId) {
        setValidationMsg('請選擇欲換假的對象。');
        return;
    }

    const newLeave: LeaveRequest = {
      id: Math.random().toString(36).substr(2, 9),
      userId: currentUser.id,
      startDate: formData.startDate,
      endDate: finalEndDate,
      type: formData.type,
      status: LeaveStatus.PENDING, // This will be overridden in db.addLeave for Swaps
      reason: formData.reason,
      targetUserId: formData.targetUserId || undefined,
      createdAt: new Date().toISOString()
    };
    
    db.addLeave(newLeave);
    setLeaves(db.getLeaves());
    setIsModalOpen(false);
  };

  const handleStatusChange = (id: string, status: LeaveStatus) => {
    // Pass current user ID as approver
    db.updateLeaveStatus(id, status, currentUser.id);
    setLeaves(db.getLeaves()); // Refresh
    
    // Add alert for confirmation as requested
    setTimeout(() => {
        if (status === LeaveStatus.APPROVED) {
            alert('申請已成功核准！');
        } else if (status === LeaveStatus.REJECTED) {
            alert('申請已駁回。');
        } else if (status === LeaveStatus.PENDING) {
             alert('已同意換班，申請已送出待主管審核。');
        }
    }, 100);
  };

  const getStatusColor = (status: LeaveStatus) => {
    switch (status) {
      case LeaveStatus.APPROVED: return 'bg-green-50 text-green-700 border-green-200';
      case LeaveStatus.REJECTED: return 'bg-red-50 text-red-700 border-red-200';
      case LeaveStatus.WAITING_FOR_TARGET: return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      default: return 'bg-yellow-50 text-yellow-700 border-yellow-200';
    }
  };

  const getTypeIcon = (type: LeaveType) => {
      if (type === LeaveType.SWAP_SHIFT) return <ArrowRightLeft size={14} className="text-blue-500" />;
      if (type === LeaveType.DUTY_SWAP) return <Briefcase size={14} className="text-indigo-500" />;
      return <CalendarDays size={14} className="text-teal-500" />;
  };

  // Filter leaves: Supervisor & Admin see ALL. Employee sees own.
  const displayedLeaves = (currentUser.role === UserRole.SUPERVISOR || currentUser.role === UserRole.SYSTEM_ADMIN)
    ? leaves 
    : leaves.filter(l => l.userId === currentUser.id || l.targetUserId === currentUser.id);

  return (
    <div className="p-6 max-w-7xl mx-auto h-screen overflow-y-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-800">請假管理</h2>
          <p className="text-sm text-gray-500">預假、銷假、長假與換班申請</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-bold shadow-sm shadow-teal-200 transition-all"
        >
          <Plus size={18} />
          新增申請
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {displayedLeaves.map(leave => {
          const requestor = users.find(u => u.id === leave.userId);
          const targetUser = leave.targetUserId ? users.find(u => u.id === leave.targetUserId) : null;
          const approver = leave.approverId ? users.find(u => u.id === leave.approverId) : null;
          const days = Math.ceil((new Date(leave.endDate).getTime() - new Date(leave.startDate).getTime()) / (1000 * 3600 * 24)) + 1;
          
          const isTargetUser = leave.targetUserId === currentUser.id;

          return (
            <div key={leave.id} className="bg-white rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-gray-100 p-5 flex flex-col hover:border-teal-100 transition-colors">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                   <div 
                        className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-sm"
                        style={{ backgroundColor: requestor?.color || '#9CA3AF' }}
                    >
                        {requestor?.alias || requestor?.name.charAt(0)}
                    </div>
                  <div>
                    <div className="font-bold text-gray-800 flex items-center gap-1">
                        {requestor?.name}
                        {(leave.type === LeaveType.SWAP_SHIFT || leave.type === LeaveType.DUTY_SWAP) && <ArrowRightLeft size={12} className="text-gray-400" />}
                        {targetUser && <span className="text-blue-600">{targetUser.name}</span>}
                    </div>
                    <div className="text-xs text-gray-500 font-medium flex items-center gap-1 mt-0.5">
                        {getTypeIcon(leave.type)} {leave.type}
                    </div>
                  </div>
                </div>
                <div className={`px-2.5 py-1 rounded text-[10px] font-bold border tracking-wide ${getStatusColor(leave.status)}`}>
                  {leave.status}
                </div>
              </div>

              <div className="space-y-3 mb-6">
                <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                  <div className="flex flex-col text-xs font-semibold w-full">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-1">
                            <span>{leave.startDate}</span>
                            {leave.startDate !== leave.endDate && (
                                <>
                                <span className="text-gray-400">→</span>
                                <span>{leave.endDate}</span>
                                </>
                            )}
                        </div>
                        <span className="text-teal-600 bg-white px-1.5 py-0.5 rounded border border-teal-100 shadow-sm">{days} 天</span>
                      </div>
                  </div>
                </div>
                {leave.reason && (
                  <p className="text-sm text-gray-600 italic bg-white px-1">"{leave.reason}"</p>
                )}
              </div>

              <div className="mt-auto pt-4 border-t border-gray-50 flex flex-col gap-2">
                
                {/* 1. Target User Approval Step */}
                {leave.status === LeaveStatus.WAITING_FOR_TARGET && isTargetUser && (
                    <div className="flex gap-2 w-full">
                        <button 
                          onClick={() => handleStatusChange(leave.id, LeaveStatus.REJECTED)}
                          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                        >
                          <X size={14} /> 拒絕
                        </button>
                        <button 
                          onClick={() => handleStatusChange(leave.id, LeaveStatus.PENDING)}
                          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                        >
                          <ThumbsUp size={14} /> 同意
                        </button>
                    </div>
                )}

                {/* 2. Supervisor Approval Step (Only show for PENDING) */}
                {(currentUser.role === UserRole.SUPERVISOR || currentUser.role === UserRole.SYSTEM_ADMIN) && leave.status === LeaveStatus.PENDING && (
                  <div className="flex gap-2 w-full">
                    <button 
                      onClick={() => handleStatusChange(leave.id, LeaveStatus.REJECTED)}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                    >
                      <X size={14} /> 駁回
                    </button>
                    <button 
                      onClick={() => handleStatusChange(leave.id, LeaveStatus.APPROVED)}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold text-green-600 bg-green-50 hover:bg-green-100 rounded-lg transition-colors"
                    >
                      <Check size={14} /> 核准
                    </button>
                  </div>
                )}
                
                {/* Status / Approver Info */}
                <div className="flex items-center justify-between w-full">
                    {leave.status === LeaveStatus.PENDING ? (
                        <div className="text-xs text-gray-400 flex items-center gap-1 bg-gray-50 px-2 py-1 rounded">
                            <Clock size={12} /> 
                            {leave.targetUserId === currentUser.id ? '等待主管審核' : '等待審核'}
                        </div>
                    ) : leave.status === LeaveStatus.WAITING_FOR_TARGET ? (
                         <div className="text-xs text-indigo-400 flex items-center gap-1 bg-indigo-50 px-2 py-1 rounded font-bold">
                            <Clock size={12} /> 
                            等待 {targetUser?.name} 同意
                        </div>
                    ) : (
                         <div className="text-[10px] text-gray-400 flex items-center gap-1">
                            <UserCheck size={12} />
                            {approver ? `${approver.name} 已審核` : '已處理'}
                         </div>
                    )}
                    <div className="text-[10px] text-gray-300">
                        {leave.processedAt ? new Date(leave.processedAt).toLocaleDateString() : new Date(leave.createdAt).toLocaleDateString()}
                    </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-gray-900/20 backdrop-blur-[2px] z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border border-gray-100 animate-fade-in max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-gray-800">新增申請</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleCreateLeave} className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">申請類別</label>
                <div className="grid grid-cols-2 gap-2">
                    {Object.values(LeaveType).map(t => (
                        <button
                            key={t}
                            type="button"
                            onClick={() => setFormData({...formData, type: t})}
                            className={`py-2 text-xs rounded-lg border font-bold transition-all ${formData.type === t ? 'bg-teal-50 text-teal-700 border-teal-200 ring-1 ring-teal-200' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
                        >
                            {t}
                        </button>
                    ))}
                </div>
              </div>

              {/* Dynamic Calendar Inputs */}
              <div className="space-y-4">
                  {/* Start Date */}
                  <CalendarPicker 
                    label="日期 (開始日期)"
                    value={formData.startDate}
                    onChange={(d) => setFormData({...formData, startDate: d})}
                    userId={currentUser.id}
                    validStatus={
                        formData.type === LeaveType.PRE_SCHEDULED ? 'WORK' :
                        formData.type === LeaveType.CANCEL_LEAVE ? 'OFF' :
                        (formData.type === LeaveType.SWAP_SHIFT || formData.type === LeaveType.DUTY_SWAP) ? 'WORK' : undefined
                    }
                  />

                  {/* End Date (Only for Long Leave) */}
                  {formData.type === LeaveType.LONG_LEAVE && (
                     <CalendarPicker 
                        label="結束日期"
                        value={formData.endDate}
                        onChange={(d) => setFormData({...formData, endDate: d})}
                        userId={currentUser.id}
                        minDate={formData.startDate}
                    />
                  )}
              </div>

              {/* Swap Shift Target Selection */}
              {(formData.type === LeaveType.SWAP_SHIFT || formData.type === LeaveType.DUTY_SWAP) && (
                  <div className="animate-in fade-in duration-300">
                      <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">選擇換班對象</label>
                      <select
                        value={formData.targetUserId}
                        onChange={e => setFormData({...formData, targetUserId: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none text-sm bg-white cursor-pointer"
                        disabled={swapCandidates.length === 0}
                      >
                          <option value="">請選擇...</option>
                          {swapCandidates.map(u => (
                              <option key={u.id} value={u.id}>{u.name} ({u.groupId}組)</option>
                          ))}
                      </select>
                      {formData.startDate && (
                          swapCandidates.length > 0 ? (
                              <p className="text-[10px] text-teal-600 mt-1 font-medium">✨ 已列出 {swapCandidates.length} 位可換班人員</p>
                          ) : (
                              <p className="text-[10px] text-red-400 mt-1">⚠️ 該日期無符合資格人員</p>
                          )
                      )}
                  </div>
              )}

              {/* Validation Message Display */}
              {validationMsg && (
                  <div className="flex items-start gap-2 bg-red-50 text-red-600 p-3 rounded-lg text-xs font-medium border border-red-100 animate-pulse">
                      <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                      {validationMsg}
                  </div>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">事由 (選填)</label>
                <textarea 
                  value={formData.reason}
                  onChange={e => setFormData({...formData, reason: e.target.value})}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none text-sm resize-none bg-gray-50 focus:bg-white transition-colors"
                  placeholder="請輸入原因..."
                />
              </div>

              <div className="pt-2">
                <button 
                    type="submit" 
                    disabled={!!validationMsg || !formData.startDate || ((formData.type === LeaveType.SWAP_SHIFT || formData.type === LeaveType.DUTY_SWAP) && !formData.targetUserId)}
                    className={`w-full font-bold py-3 rounded-lg transition-colors shadow-sm ${
                        (!!validationMsg || !formData.startDate) 
                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed' 
                        : 'bg-teal-600 hover:bg-teal-700 text-white shadow-teal-200'
                    }`}
                >
                  送出申請
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default LeavePage;
