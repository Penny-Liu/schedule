
import React, { useState, useEffect, useRef } from 'react';
import { User, UserRole, LeaveRequest, LeaveType, LeaveStatus, SPECIAL_ROLES } from '../types';
import { db } from '../services/store';
import {
  Calendar,
  Clock,
  User as UserIcon,
  FileText,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  AlertCircle,
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle,
  XCircle,
  CalendarDays,
  Briefcase,
  ThumbsUp,
  ThumbsDown,
  UserCheck
} from 'lucide-react';

interface LeavePageProps {
  currentUser: User;
}

// Helper to get weekday
const getWeekday = (dateStr: string) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
  return `(${weekDays[d.getDay()]})`;
};

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
          {value ? `${value} ${getWeekday(value)}` : '點擊選擇日期'}
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
    returnDate: '', // For Two-Way Swap
    type: LeaveType.PRE_SCHEDULED,
    reason: '',
    targetUserId: '',
    roleToSwap: '' // For specific role selection
  });

  const [validationMsg, setValidationMsg] = useState('');
  const [swapCandidates, setSwapCandidates] = useState<User[]>([]);
  const [mySwappableRoles, setMySwappableRoles] = useState<string[]>([]);

  // Reset form when modal opens
  useEffect(() => {
    if (isModalOpen) {
      setFormData({
        startDate: '',
        endDate: '',
        returnDate: '',
        type: LeaveType.PRE_SCHEDULED,
        reason: '',
        targetUserId: '',
        roleToSwap: ''
      });
      setValidationMsg('');
      setSwapCandidates([]);
      setMySwappableRoles([]);
    }
  }, [isModalOpen]);

  // Validation & Candidates Logic
  useEffect(() => {
    setValidationMsg('');
    setSwapCandidates([]);
    setMySwappableRoles([]);

    if (!formData.startDate) return;

    // Logic per type
    if (formData.type === LeaveType.PRE_SCHEDULED) {
      const status = db.getUserStatusOnDate(currentUser.id, formData.startDate);
      if (status === 'OFF') {
        setValidationMsg('該日期您原本就是「休假」，無需申請預假。');
      } else {
        const shifts = db.getShifts(formData.startDate, formData.startDate);
        const myShift = shifts.find(s => s.userId === currentUser.id);
        if (myShift) {
          const hasRoles = myShift.specialRoles && myShift.specialRoles.length > 0;
          if (hasRoles) {
            setValidationMsg('您在該日期已有排定特殊任務（如開機、晚班），無法申請預假。');
          }
        }
      }
    } else if (formData.type === LeaveType.CANCEL_LEAVE) {
      const status = db.getUserStatusOnDate(currentUser.id, formData.startDate);
      if (status === 'WORK') {
        setValidationMsg('該日期您目前為「上班」狀態，無需申請銷假。');
      }
    } else if (formData.type === LeaveType.ASK_LEAVE) {
      // One-Way Substitution (Classic "Swap" logic)
      // I am working -> want to be OFF.
      // Candidate must be OFF -> to work.
      const status = db.getUserStatusOnDate(currentUser.id, formData.startDate);
      if (status === 'OFF') {
        setValidationMsg('您該日期為「休假」，無需請人代班 (請使用銷假)。');
      } else {
        const shifts = db.getShifts(formData.startDate, formData.startDate);
        const myShift = shifts.find(s => s.userId === currentUser.id);
        if (myShift && myShift.specialRoles.length > 0) {
          setValidationMsg('您在該日期已有排定特殊任務，無法申請一般代班 (請使用「任務換班」)。');
        } else {
          // Find candidates OFF
          const candidates = db.getUsersOffOnDate(formData.startDate).filter(u => u.id !== currentUser.id);
          setSwapCandidates(candidates);
          if (candidates.length === 0) setValidationMsg('該日期無人休假可供代班。');
        }
      }

    } else if (formData.type === LeaveType.SWAP_SHIFT) {
      // Two-Way Swap Logic
      // Date 1: I am WORK (want OFF)
      // Date 2: I am OFF (want WORK)

      // 1. Check Date 1 Status
      const status1 = db.getUserStatusOnDate(currentUser.id, formData.startDate);
      if (status1 === 'OFF') {
        setValidationMsg('您在換假日期(1)為「休假」，不需要換休。');
        return;
      }

      const shifts = db.getShifts(formData.startDate, formData.startDate);
      const myShift = shifts.find(s => s.userId === currentUser.id);
      if (myShift && myShift.specialRoles.length > 0) {
        setValidationMsg('您在換假日期(1)已有特殊任務，請使用「任務換班」。');
        return;
      }

      // 2. Identify Candidates for Date 1 (Must be OFF)
      const candidatesD1 = db.getUsersOffOnDate(formData.startDate).filter(u => u.id !== currentUser.id);

      // 3. If Date 2 is selected, filter candidates further
      if (formData.returnDate) {
        if (formData.returnDate === formData.startDate) {
          setValidationMsg('換假日期不能相同。');
          return;
        }
        const status2 = db.getUserStatusOnDate(currentUser.id, formData.returnDate);
        if (status2 === 'WORK') {
          setValidationMsg('您在還假日期(2)為「上班」，無法換假來上班。');
          return;
        }

        // Candidates for D2 MUST be WORK (to go OFF)
        // Actually, if I want to work on D2, the person swapping with me must currently be working D2?
        // Yes, A exchanges with B.
        // D1: A(Work) -> Off, B(Off) -> Work
        // D2: A(Off) -> Work, B(Work) -> Off

        // Filter candidates who are working on D2
        const candidatesD2 = db.getUsersWorkingOnDate(formData.returnDate).filter(u => u.id !== currentUser.id);

        // Intersection: Users present in BOTH lists
        const validCandidates = candidatesD1.filter(c1 => candidatesD2.some(c2 => c2.id === c1.id));

        if (validCandidates.length === 0) {
          setValidationMsg('找不到符合條件的對象：該員需在日期(1)休假且在日期(2)上班。');
        }
        setSwapCandidates(validCandidates);
      } else {
        // If D2 not picked yet, just show D1 candidates (or maybe force pick D2 first?)
        // Let's allow picking candidate from likely pool (D1 OFF) but warn they need to match D2
        setSwapCandidates(candidatesD1);
      }

    } else if (formData.type === LeaveType.DUTY_SWAP) {
      // Special Logic for Duty Swap (Opening/Late/Assist/Scheduler)
      const shifts = db.getShifts(formData.startDate, formData.startDate);
      const myShift = shifts.find(s => s.userId === currentUser.id);

      // 1. Get my special roles (Allow ALL special roles: Opening, Late, Assist, Scheduler)
      const validSpecialRoles = Object.values(SPECIAL_ROLES);
      const myRoles = myShift?.specialRoles?.filter(r => validSpecialRoles.includes(r)) || [];

      if (myRoles.length === 0) {
        setValidationMsg('您在該日期沒有被分配特殊任務（如開機、晚班、輔班、排班），無法申請任務換班。');
      } else {
        setMySwappableRoles(myRoles);

        // If user only has one role, auto select it. If multiple, they must choose (handled in form render)
        if (myRoles.length === 1 && !formData.roleToSwap) {
          setFormData(prev => ({ ...prev, roleToSwap: myRoles[0] }));
        }

        // 2. Find eligible candidates (Must be WORKING that day + Have Capability + NOT have conflicting role)
        const workers = db.getUsersWorkingOnDate(formData.startDate).filter(u => u.id !== currentUser.id);
        const roleToCheck = formData.roleToSwap || myRoles[0]; // Use selected or first for initial filtering

        const validCandidates = workers.filter(u => {
          // Must have the skill for myRole
          if (!u.capabilities?.includes(roleToCheck)) return false;

          // Must not already have a special role (to keep it simple, or check specific conflicts)
          const theirShift = shifts.find(s => s.userId === u.id);
          if (theirShift && theirShift.specialRoles.length > 0) return false;

          return true;
        });

        if (validCandidates.length === 0) {
          setValidationMsg(`該日期沒有其他具備「${roleToCheck}」資格且無任務的同事可供交換。`);
        } else {
          setSwapCandidates(validCandidates);
        }
      }
    } else if (formData.type === LeaveType.LONG_LEAVE) {
      // Enforce 60-Day Advance Rule
      const start = new Date(formData.startDate);
      const today = new Date();
      const diffTime = start.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays < 60) {
        setValidationMsg(`長假依照規定必需於 60 天前提出申請 (目前距今僅 ${diffDays} 天)。`);
      }
    }
  }, [formData.startDate, formData.returnDate, formData.type, formData.roleToSwap, currentUser.id]);


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
    if ((formData.type === LeaveType.SWAP_SHIFT || formData.type === LeaveType.DUTY_SWAP || formData.type === LeaveType.ASK_LEAVE)) {
      if (!formData.targetUserId) {
        setValidationMsg('請選擇對象。');
        return;
      }
      if (formData.type === LeaveType.DUTY_SWAP && !formData.roleToSwap) {
        setValidationMsg('請選擇要交換的任務類型。');
        return;
      }
      if (formData.type === LeaveType.SWAP_SHIFT && !formData.returnDate) {
        setValidationMsg('雙向換假必須選擇「換假日期」。');
        return;
      }
    }

    const newLeave: LeaveRequest = {
      id: Math.random().toString(36).substr(2, 9),
      userId: currentUser.id,
      startDate: formData.startDate,
      endDate: finalEndDate,
      returnDate: (formData.type === LeaveType.SWAP_SHIFT) ? formData.returnDate : undefined,
      type: formData.type,
      status: LeaveStatus.PENDING,
      reason: formData.reason,
      targetUserId: formData.targetUserId || undefined,
      roleToSwap: formData.roleToSwap || undefined,
      targetApproval: (formData.type === LeaveType.SWAP_SHIFT || formData.type === LeaveType.DUTY_SWAP || formData.type === LeaveType.ASK_LEAVE) ? 'PENDING' : undefined,
      createdAt: new Date().toISOString()
    };


    db.addLeave(newLeave);
    setLeaves([...db.getLeaves()]); // Fix: Force new array for re-render
    setIsModalOpen(false);
  };


  // Helper: Analyze Conflict Resolution (Day-by-Day)
  const analyzeConflictResolution = (startDate: Date, endDate: Date, userAId: string, userBId: string) => {
    const resolved: string[] = [];
    const unresolved: string[] = [];

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toLocaleDateString('en-CA');
      
      // MODIFIED LOGIC: Check if users are already in 'OFF' status (Coordinated/Approved)
      // Was: Checked for CANCEL_LEAVE (Meaning valid manpower).
      // Now: Check for Status = 'OFF' (Meaning leave is finalized/coordinated).
      
      const statusA = db.getUserStatusOnDate(userAId, dateStr);
      const statusB = db.getUserStatusOnDate(userBId, dateStr);

      // If either user is already OFF on this day, we consider the conflict "Coordinated/Resolved" for that day.
      // (As per user request: "如果1/1已呈a、b休假...則此衝突條件就可以修改為已協調")
      if (statusA === 'OFF' || statusB === 'OFF') {
        resolved.push(dateStr);
      } else {
        unresolved.push(dateStr);
      }
    }
    return { resolved, unresolved };
  };

// Helper: Simple Date Format (M/D)
  const formatDateSimple = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  const handleStatusChange = (id: string, status: LeaveStatus) => {
    // Validation for Approval: Check if user has tasks/roles
    if (status === LeaveStatus.APPROVED) {
      const leave = leaves.find(l => l.id === id);
      if (leave) {
        // --- Conflict Detection for Long Leaves ---
        if (leave.type === LeaveType.LONG_LEAVE) {
          const start = new Date(leave.startDate);
          const end = new Date(leave.endDate);

          // Find other Long Leaves (Approved or Pending) that overlap
          const conflicts = leaves.filter(other =>
            other.id !== leave.id &&
            other.type === LeaveType.LONG_LEAVE &&
            other.status !== LeaveStatus.REJECTED && // Check Approved & Pending
            ((new Date(other.startDate) <= end && new Date(other.endDate) >= start))
          );

          if (conflicts.length > 0) {
            const conflictMessages: string[] = [];
            let hasUnresolved = false;
            
            const requestorName = users.find(u => u.id === leave.userId)?.name || '申請人';

            conflicts.forEach(c => {
              const c_start = new Date(c.startDate);
              const c_end = new Date(c.endDate);
              const overlapStart = c_start > start ? c_start : start;
              const overlapEnd = c_end < end ? c_end : end;

              const { resolved, unresolved } = analyzeConflictResolution(overlapStart, overlapEnd, leave.userId, c.userId);
              const conflictUser = users.find(u => u.id === c.userId);
              const conflictUserName = conflictUser?.name || '未知同仁';

              if (unresolved.length > 0) {
                hasUnresolved = true;
                const dateList = unresolved.map(d => formatDateSimple(d)).join(', ');
                conflictMessages.push(`\n- 🔴 需由 ${requestorName} 與 ${conflictUserName} 協調日期: ${dateList}`);
              } else {
                const dateList = resolved.map(d => formatDateSimple(d)).join(', ');
                 conflictMessages.push(`\n- 🟢 與 ${conflictUserName} 重疊但已協調 (雙方皆休假): ${dateList}`);
              }
            });

            const confirmMsg = `⚠️ 警告：檢測到長假時段衝突！\n${conflictMessages.join('')}\n\n若顯示「需協調」，代表該日期其中一方仍為上班狀態。\n是否仍要繼續核准？`;

            if (!window.confirm(confirmMsg)) {
              return; // Abort approval
            }
          }
        }


        // Check everyday in range
        const start = new Date(leave.startDate);
        const end = new Date(leave.endDate);
        const shiftMap = new Map(db.getShifts(leave.startDate, leave.endDate).map(s => [`${s.userId}-${s.date}`, s]));

        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          const dateStr = d.toLocaleDateString('en-CA'); // YYYY-MM-DD
          const shift = shiftMap.get(`${leave.userId}-${dateStr}`);

          if (shift) {
            // 1. Check Special Roles
            if (shift.specialRoles && shift.specialRoles.length > 0) {
              // Exception: Duty Swap is meant to swap these roles, so don't block.
              if (leave.type !== LeaveType.DUTY_SWAP) {
                window.alert(`無法核准：該員在 ${dateStr} 仍有特殊任務 (${shift.specialRoles.join(', ')})。請先要求該員完成換班/交接任務，確認無任務後再行核准。`);
                return;
              }
            }

            // 2. Check Task Stations (As defined in store logic: 場控, 遠班, 大直 etc usually imply fixed duty)
            // User mentioned "任務職". Usually refers to Roles, but sometimes Stations.
            // Conservatively check for known "Fixed/Task" stations if necessary.
            // Based on user prompt "換完任務", usually implies Special Roles.
            // But let's check strict "Station" if it's not Unassigned/SystemOff
            // Actually, regular stations (MR, CT) are fine (they just become vacancies).
            // But "Task" stations might be critical.
            // Let's stick to Special Roles first as that is the explicit "Task" (任務).
          }
        }
      }
    }

    // Alert logic handled by window.alert
    db.updateLeaveStatus(id, status, currentUser.id);
    setLeaves([...db.getLeaves()]); // Fix: Force new array for re-render

    if (status === LeaveStatus.APPROVED) {
      window.alert('已成功核准該申請，並自動更新排班表。');
    } else if (status === LeaveStatus.REJECTED) {
      window.alert('已駁回該申請。');
    }
  };

  const handleTargetApproval = (id: string, approvalStatus: 'AGREED' | 'REJECTED') => {
    db.updateLeaveTargetApproval(id, approvalStatus);
    setLeaves([...db.getLeaves()]); // Fix: Force new array for re-render
    if (approvalStatus === 'AGREED') {
      window.alert('您已同意此換班申請，該申請將送交主管審核。');
    } else {
      window.alert('您已拒絕此換班申請，該申請將被標記為駁回。');
    }
  };

  const getTypeIcon = (type: LeaveType) => {
    switch (type) {
      case LeaveType.PRE_SCHEDULED: return <Calendar size={14} />;
      case LeaveType.SWAP_SHIFT: return <ArrowRightLeft size={14} />;
      case LeaveType.DUTY_SWAP: return <UserCheck size={14} />;
      case LeaveType.CANCEL_LEAVE: return <Briefcase size={14} />; // Distinct icon for Cancel
      case LeaveType.LONG_LEAVE: return <CalendarDays size={14} />;
      default: return <Clock size={14} />;
    }
  };

  // New Helper for Distinct Badge Styles
  const getTypeStyles = (type: LeaveType) => {
    switch (type) {
      case LeaveType.PRE_SCHEDULED:
        return "bg-blue-50 text-blue-700 border-blue-200";
      case LeaveType.CANCEL_LEAVE:
        return "bg-orange-50 text-orange-700 border-orange-200"; // Orange to alert "Change of Plan"
      case LeaveType.SWAP_SHIFT:
        return "bg-indigo-50 text-indigo-700 border-indigo-200";
      case LeaveType.DUTY_SWAP:
        return "bg-purple-50 text-purple-700 border-purple-200";
      case LeaveType.LONG_LEAVE:
        return "bg-rose-50 text-rose-700 border-rose-200";
      default:
        return "bg-gray-50 text-gray-700 border-gray-200";
    }
  };

  const getStatusColor = (status: LeaveStatus) => {
    switch (status) {
      case LeaveStatus.APPROVED: return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case LeaveStatus.REJECTED: return 'bg-rose-100 text-rose-800 border-rose-200';
      case LeaveStatus.PENDING: return 'bg-amber-100 text-amber-800 border-amber-200';
      default: return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  // Filter leaves: Supervisor & Admin see ALL. Employee sees own (as requestor or target).
  const roleFilteredLeaves = (currentUser.role === UserRole.SUPERVISOR || currentUser.role === UserRole.SYSTEM_ADMIN)
    ? leaves
    : leaves.filter(l => l.userId === currentUser.id || l.targetUserId === currentUser.id);

  // Date Filter: Show only Past 3 Months + Future
  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - 3);
  cutoffDate.setHours(0, 0, 0, 0);

  // Helper to determine if a leave is a "Future Long Leave" (Policy: Review 2 months prior)
  const isFutureLongLeave = (leave: LeaveRequest) => {
    if (leave.type !== LeaveType.LONG_LEAVE) return false;
    const daysUntilStart = Math.ceil((new Date(leave.startDate).getTime() - new Date().getTime()) / (1000 * 3600 * 24));
    return daysUntilStart > 60;
  };

  const displayedLeaves = roleFilteredLeaves.filter(l => {
    // Robust date parsing
    const end = new Date(l.endDate);
    return end >= cutoffDate;
  }).sort((a, b) => {
    // 1. Primary Sort: Pending Status First
    const isAPending = a.status === LeaveStatus.PENDING;
    const isBPending = b.status === LeaveStatus.PENDING;
    if (isAPending && !isBPending) return -1;
    if (!isAPending && isBPending) return 1;

    // 2. Secondary Sort (For Pending Only): Actionable vs Future Hold
    if (isAPending) {
      const aIsFuture = isFutureLongLeave(a);
      const bIsFuture = isFutureLongLeave(b);
      if (!aIsFuture && bIsFuture) return -1; // a is actionable, b is future -> a first
      if (aIsFuture && !bIsFuture) return 1;
    }

    // 3. Tertiary Sort: Date
    // - Pending: Actionable (Ascending) -> Sooner dates first ("近期需處理")
    // - Processed: History (Descending) -> Newest records first
    if (isAPending) {
      return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
    } else {
      return new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
    }
  });

  return (
    <div className="p-6 max-w-7xl mx-auto h-screen overflow-y-auto pb-24">
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

          // Determine if target approval flow is active
          const isSwap = leave.type === LeaveType.SWAP_SHIFT || leave.type === LeaveType.DUTY_SWAP;
          const needsTargetAction = isSwap && leave.status === LeaveStatus.PENDING && leave.targetApproval === 'PENDING';
          const waitingForSupervisor = !isSwap || (isSwap && leave.targetApproval === 'AGREED');

          const isProcessed = leave.status !== LeaveStatus.PENDING;

          return (
            <div key={leave.id} className={`bg-white rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border transition-colors flex flex-col ${isProcessed ? 'p-3 border-slate-100 opacity-75 hover:opacity-100' : 'p-5 border-gray-100 hover:border-teal-100'} `}>
              <div className={`flex justify-between items-start ${isProcessed ? 'mb-2' : 'mb-4'} `}>
                <div className="flex items-center gap-3">
                  <div
                    className={`${isProcessed ? 'w-8 h-8 text-xs grayscale opacity-50' : 'w-10 h-10 text-sm shadow-sm'} rounded-full flex items-center justify-center text-white font-bold transition-all`}
                    style={{ backgroundColor: requestor?.color || '#9CA3AF' }}
                  >
                    {requestor?.alias || requestor?.name.charAt(0)}
                  </div>
                  <div>
                    <div className={`font-bold flex items-center gap-1 ${isProcessed ? 'text-gray-500 text-sm' : 'text-gray-800'} `}>
                      {requestor?.name}
                      {isSwap && <ArrowRightLeft size={12} className="text-gray-400" />}
                      {targetUser && <span className="text-blue-600">{targetUser.name}</span>}
                    </div>
                    <div className={`text-xs font-medium flex items-center gap-1 mt-0.5 px-2 py-0.5 rounded border w-fit ${getTypeStyles(leave.type)}`}>
                      {getTypeIcon(leave.type)}
                      <span>{leave.type}</span>
                      {leave.roleToSwap && <span className="text-gray-600 font-normal">({leave.roleToSwap})</span>}
                    </div>
                  </div>
                </div>
                <div className={`px-2 py-0.5 rounded text-[10px] font-bold border tracking-wide ${getStatusColor(leave.status)} ${isProcessed ? 'scale-90 origin-right' : ''} `}>
                  {leave.status}
                </div>
              </div>

              {/* Conflict Alert Section (New) */}
              {(() => {
                if (leave.type !== LeaveType.LONG_LEAVE || leave.status === LeaveStatus.REJECTED) return null;

                const start = new Date(leave.startDate);
                const end = new Date(leave.endDate);

                // Find conflicts from ALL leaves (not just visible ones)
                const conflicts = leaves.filter(other =>
                  other.id !== leave.id &&
                  other.type === LeaveType.LONG_LEAVE &&
                  other.status !== LeaveStatus.REJECTED &&
                  ((new Date(other.startDate) <= end && new Date(other.endDate) >= start))
                );

                if (conflicts.length === 0) return null;
                const requestorName = requestor?.name || '申請人';

                return (
                  <div className="mb-4 bg-red-50 border border-red-100 rounded-lg p-3 text-xs animate-in fade-in slide-in-from-top-1">
                    <div className="flex items-center gap-1.5 font-bold text-red-700 mb-1.5">
                      <AlertTriangle size={14} />
                      <span>長假時段衝突與協調狀態</span>
                    </div>
                    <div className="space-y-2 text-red-600">
                      <p className="opacity-90">此時段與 {conflicts.length} 位同仁重疊，系統已自動分析：</p>
                      <ul className="list-none space-y-2">
                        {conflicts.map(c => {
                          const u = users.find(user => user.id === c.userId);
                          const c_start = new Date(c.startDate);
                          const c_end = new Date(c.endDate);
                          const overlapStart = c_start > start ? c_start : start;
                          const overlapEnd = c_end < end ? c_end : end;

                          const { resolved, unresolved } = analyzeConflictResolution(overlapStart, overlapEnd, leave.userId, c.userId);
                          const conflictUserName = u?.name || '未知同仁';

                          return (
                            <li key={c.id} className="bg-white p-2 rounded border border-red-100 shadow-sm">
                              {/* Resolved Dates */}
                              {resolved.length > 0 && (
                                <div className="flex items-start gap-1 text-green-600 mb-1">
                                  <CheckCircle size={12} className="mt-0.5 shrink-0" />
                                  <span>
                                    <span className="font-bold">已協調</span>: {resolved.map(d => formatDateSimple(d)).join(', ')}
                                  </span>
                                </div>
                              )}

                              {/* Unresolved Dates */}
                              {unresolved.length > 0 ? (
                                <div className="flex items-start gap-1 text-red-600">
                                  <XCircle size={12} className="mt-0.5 shrink-0" />
                                  <span>
                                    <span className="font-bold text-red-700">🔴 {requestorName} 需與 {conflictUserName} 協調</span>: {unresolved.map(d => formatDateSimple(d)).join(', ')}
                                  </span>
                                </div>
                              ) : (
                                <div className="text-green-600 text-[10px] pl-4">✔️ 與 {conflictUserName} 全數協調完成</div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </div>
                );
              })()}

              {!isProcessed && (
                <div className="space-y-3 mb-6">
                  {/* Future Long Leave Notice */}
                  {isFutureLongLeave(leave) && (
                    <div className="bg-orange-50 text-orange-700 px-3 py-2 rounded-lg text-xs flex items-center gap-2 border border-orange-100">
                      <AlertTriangle size={14} className="shrink-0" />
                      <span>此為遠期長假 (距今 {Math.ceil((new Date(leave.startDate).getTime() - new Date().getTime()) / (1000 * 3600 * 24))} 天)，建議於兩個月前再行核准。</span>
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                    <div className="flex flex-col text-xs font-semibold w-full">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-1">
                          <span>{leave.startDate} <span className="text-xs text-gray-400">{getWeekday(leave.startDate)}</span></span>
                          {leave.startDate !== leave.endDate && (
                            <>
                              <span className="text-gray-400">→</span>
                              <span>{leave.endDate} <span className="text-xs text-gray-400">{getWeekday(leave.endDate)}</span></span>
                            </>
                          )}
                        </div>
                        <span className="text-teal-600 bg-white px-1.5 py-0.5 rounded border border-teal-100 shadow-sm">{days} 天</span>
                      </div>

                      {/* Show Return Date for Swap Shift */}
                      {leave.type === LeaveType.SWAP_SHIFT && leave.returnDate && (
                        <div className="mt-2 pt-2 border-t border-gray-200 flex items-center justify-between text-indigo-600">
                          <div className="flex items-center gap-1">
                            <ArrowRightLeft size={10} />
                            <span>換假: {leave.returnDate} <span className="text-xs opacity-75">{getWeekday(leave.returnDate)}</span></span>
                          </div>
                          <span className="text-[10px] bg-white px-1 py-0.5 rounded border border-indigo-100">互換</span>
                        </div>
                      )}
                    </div>
                  </div>
                  {leave.reason && (
                    <p className="text-sm text-gray-600 italic bg-white px-1">"{leave.reason}"</p>
                  )}
                </div>
              )}

              {/* Compact Date Info for Processed Cards */}
              {isProcessed && (
                <div className="mb-2 pl-11 -mt-1">
                  <div className="flex flex-col gap-1 text-xs text-gray-400">
                    <div className="flex items-center gap-2">
                      <span>{leave.startDate}</span>
                      {leave.startDate !== leave.endDate && <span>~ {leave.endDate}</span>}
                      <span className="bg-slate-100 px-1 rounded text-slate-500">{days}天</span>
                    </div>
                    {leave.returnDate && (
                      <div className="flex items-center gap-1 text-indigo-400">
                        <span className="text-[10px]">換:</span>
                        <span>{leave.returnDate}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className={`mt-auto border-t border-gray-50 flex flex-col gap-2 ${isProcessed ? 'pt-2' : 'pt-4'} `}>

                {/* 1. Target User Approval Step */}
                {needsTargetAction && currentUser.id === leave.targetUserId && (
                  <div className="flex gap-2 w-full animate-pulse">
                    <button
                      onClick={() => handleTargetApproval(leave.id, 'REJECTED')}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors border border-red-100"
                    >
                      <ThumbsDown size={14} /> 拒絕
                    </button>
                    <button
                      onClick={() => handleTargetApproval(leave.id, 'AGREED')}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors border border-blue-100"
                    >
                      <ThumbsUp size={14} /> 同意
                    </button>
                  </div>
                )}

                {/* 2. Supervisor Approval Step (Only if Target Agreed OR Not a Swap) */}
                {(currentUser.role === UserRole.SUPERVISOR || currentUser.role === UserRole.SYSTEM_ADMIN) && leave.status === LeaveStatus.PENDING && waitingForSupervisor && (
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
                      {needsTargetAction
                        ? `等待 ${targetUser?.name} 同意`
                        : (waitingForSupervisor ? '等待主管審核' : '處理中')}
                    </div>
                  ) : (
                    <div className="text-[10px] text-gray-500 font-medium flex items-center gap-1">
                      <UserCheck size={12} className="text-teal-600" />
                      {approver ? (
                        <span>
                          <span className="font-bold text-gray-700">{approver.name}</span>
                          <span className="text-gray-400 ml-1">於 {leave.processedAt ? new Date(leave.processedAt).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }) : '未記錄時間'} 審核</span>
                        </span>
                      ) : '已處理'}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <div className="text-[10px] text-gray-300">
                      {/* Only show created date if still pending, processed showed above */}
                      {leave.status === LeaveStatus.PENDING && new Date(leave.createdAt).toLocaleDateString()}
                    </div>
                    {currentUser.id === leave.userId && leave.status === LeaveStatus.PENDING && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm('確定要刪除此申請嗎？')) {
                            db.deleteLeave(leave.id);
                            setLeaves([...db.getLeaves()]);
                          }
                        }}
                        className="text-gray-400 hover:text-red-500 transition-colors p-1"
                        title="刪除申請"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
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
                      onClick={() => setFormData({ ...formData, type: t })}
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
                  label="想休日期"
                  value={formData.startDate}
                  onChange={(d) => setFormData({ ...formData, startDate: d })}
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
                    onChange={(d) => setFormData({ ...formData, endDate: d })}
                    userId={currentUser.id}
                    minDate={formData.startDate}
                  />
                )}

                {/* Return Date (Two-Way Swap Only) */}
                {formData.type === LeaveType.SWAP_SHIFT && (
                  <CalendarPicker
                    label="對換日期"
                    value={formData.returnDate}
                    onChange={(d) => setFormData({ ...formData, returnDate: d })}
                    userId={currentUser.id}
                    validStatus="OFF" // I must be OFF on return date
                    minDate={formData.startDate}
                  />
                )}
              </div>

              {/* Duty Swap: Select specific role if needed */}
              {formData.type === LeaveType.DUTY_SWAP && mySwappableRoles.length > 0 && (
                <div className="animate-in fade-in duration-300">
                  <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">選擇要交換的任務</label>
                  <div className="flex gap-2">
                    {mySwappableRoles.map(role => (
                      <button
                        key={role}
                        type="button"
                        onClick={() => setFormData({ ...formData, roleToSwap: role })}
                        className={`flex-1 py-2 text-xs rounded-lg border font-bold transition-all ${formData.roleToSwap === role ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-gray-500 border-gray-200'}`}
                      >
                        {role}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Swap Shift / Ask Leave Target Selection */}
              {(formData.type === LeaveType.SWAP_SHIFT || formData.type === LeaveType.DUTY_SWAP || formData.type === LeaveType.ASK_LEAVE) && (
                <div className="animate-in fade-in duration-300">
                  <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">
                    {formData.type === LeaveType.ASK_LEAVE ? '選擇要假對象' : '選擇換假對象'}
                  </label>
                  <select
                    value={formData.targetUserId}
                    onChange={e => setFormData({ ...formData, targetUserId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none text-sm bg-white cursor-pointer"
                    disabled={swapCandidates.length === 0}
                  >
                    <option value="">請選擇...</option>
                    {swapCandidates.map(u => (
                      <option key={u.id} value={u.id}>{u.name} ({u.groupId}組)</option>
                    ))}
                  </select>
                  {formData.startDate && (
                    <div className="mt-1">
                      {swapCandidates.length > 0 ? (
                        <p className="text-[10px] text-teal-600 font-medium">✨ 已列出 {swapCandidates.length} 位可選人員</p>
                      ) : (
                        <p className="text-[10px] text-red-400">⚠️ 無符合資格人員 (需符合所有日期條件)</p>
                      )}
                    </div>
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
                  onChange={e => setFormData({ ...formData, reason: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none text-sm resize-none bg-gray-50 focus:bg-white transition-colors"
                  placeholder="請輸入原因..."
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={!!validationMsg || !formData.startDate || ((formData.type === LeaveType.SWAP_SHIFT || formData.type === LeaveType.DUTY_SWAP || formData.type === LeaveType.ASK_LEAVE) && !formData.targetUserId)}
                  className={`w-full font-bold py-3 rounded-lg transition-colors shadow-sm ${(!!validationMsg || !formData.startDate)
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-teal-600 hover:bg-teal-700 text-white shadow-teal-200'
                    }`}
                >
                  送出申請
                </button>
              </div>
            </form>
          </div>
        </div >
      )}
    </div >
  );
};

export default LeavePage;
