
import React, { useState, useMemo, useEffect } from 'react';
import { User, Shift, UserRole, SYSTEM_OFF, SPECIAL_ROLES, LeaveRequest, LeaveStatus, LeaveType, StationDefault, DateEventType } from '../types';
import { db } from '../services/store';
import { ChevronLeft, ChevronRight, Briefcase, Moon, Sun, Monitor, Activity, Calendar as CalendarIcon, Filter, Wand2, Users, LayoutList, Star, AlertCircle, Plus, X, Download, BarChart2, Sparkles, ChevronDown, ChevronUp, GripVertical, BookOpen, Lock, Unlock, CheckCircle, Loader2 } from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import ConfirmModal from '../components/ConfirmModal';

interface DashboardPageProps {
    currentUser: User;
}

type ViewMode = 'user' | 'station';

const DashboardPage: React.FC<DashboardPageProps> = ({ currentUser }) => {
    const [currentDate, setCurrentDate] = useState(new Date());

    // --- Cycle Selection Logic ---
    const cycles = db.getCycles();
    // Determine default cycle: If today falls within a cycle, select it. Otherwise 'rolling'.
    const [selectedCycleId, setSelectedCycleId] = useState<string>(() => {
        const todayStr = new Date().toISOString().split('T')[0];
        const activeCycle = cycles.find(c => todayStr >= c.startDate && todayStr <= c.endDate);
        return activeCycle ? activeCycle.id : 'rolling';
    });

    const [viewMode, setViewMode] = useState<ViewMode>('user'); // Toggle state

    // Auto Schedule Modal State (Stations)
    const [isAutoScheduleOpen, setIsAutoScheduleOpen] = useState(false);
    // Auto Schedule Modal State (Special Roles)
    const [isSpecialRoleModalOpen, setIsSpecialRoleModalOpen] = useState(false);

    // Confirmation Modal State
    const [isConfirmCycleOpen, setIsConfirmCycleOpen] = useState(false);

    // Unified Range State for schedulers
    const [scheduleRange, setScheduleRange] = useState({ start: '', end: '' });

    // Filter out SYSTEM_ADMIN from the roster view
    const [users, setUsers] = useState<User[]>(() => db.getUsers().filter(u => u.role !== UserRole.SYSTEM_ADMIN));
    const holidays = db.getHolidays();

    const pendingLeaves = db.getLeaves().filter(l => l.status === LeaveStatus.PENDING);
    const [shifts, setShifts] = useState<Shift[]>(db.getShifts('', ''));
    const [isEditMode, setIsEditMode] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    // Local state for reordering to trigger re-renders
    const [displayOrder, setDisplayOrder] = useState<string[]>(db.getStationDisplayOrder());

    // Get current selected cycle object
    const currentCycle = useMemo(() => {
        return cycles.find(c => c.id === selectedCycleId);
    }, [selectedCycleId, cycles]);

    const isCycleConfirmed = currentCycle?.isConfirmed || false;

    // Determine the Date Range
    const dateRange = useMemo(() => {
        if (selectedCycleId !== 'rolling' && currentCycle) {
            const dates = [];
            const start = new Date(currentCycle.startDate);
            const end = new Date(currentCycle.endDate);
            if (start <= end) {
                for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                    dates.push(d.toISOString().split('T')[0]);
                }
                return dates;
            }
        }

        const dates = [];
        const start = new Date(currentDate);
        // Align view to start 2 days before current
        const viewStart = new Date(start);
        viewStart.setDate(viewStart.getDate() - 2);

        for (let i = 0; i < 21; i++) {
            const d = new Date(viewStart);
            d.setDate(viewStart.getDate() + i);
            dates.push(d.toISOString().split('T')[0]);
        }
        return dates;
    }, [currentDate, selectedCycleId, currentCycle]);

    // Update schedule range when cycle changes OR when view changes
    useEffect(() => {
        if (selectedCycleId !== 'rolling' && currentCycle) {
            setScheduleRange({ start: currentCycle.startDate, end: currentCycle.endDate });
        } else {
            // If rolling, default to visible range
            if (dateRange.length > 0) {
                setScheduleRange({ start: dateRange[0], end: dateRange[dateRange.length - 1] });
            }
        }
    }, [selectedCycleId, currentCycle, dateRange]);


    const getCycleTitle = () => {
        if (selectedCycleId === 'rolling') return '連續排班視圖';
        if (!currentCycle) return '未知週期';
        const match = currentCycle.name.match(/^(\d{4})\/(\d{1,2})$/);
        if (match) return `${match[1]}年第${match[2]}週期`;
        return currentCycle.name;
    };

    // Export Title Logic
    const getExportHeader = () => {
        const title = getCycleTitle();
        const start = dateRange[0];
        const end = dateRange[dateRange.length - 1];
        const days = dateRange.length;
        return `${title} (${start} ~ ${end} / 共${days}天)`;
    };

    const formatName = (name: string) => {
        if (!name) return '';
        return name.length > 2 ? name.slice(-2) : name;
    };

    // --- PDF Export Logic ---
    const handleMoveUser = (index: number, direction: 'up' | 'down') => {
        if (direction === 'up' && index === 0) return;
        if (direction === 'down' && index === users.length - 1) return;

        const newUsers = [...users];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;

        // Swap
        [newUsers[index], newUsers[targetIndex]] = [newUsers[targetIndex], newUsers[index]];

        // Setup new Order Ids
        const newOrderIds = newUsers.map(u => u.id);

        // Optimistic UI Update
        setUsers(newUsers);

        db.updateUserDisplayOrder(newOrderIds).then(() => {
            setUsers(db.getUsers().filter(u => u.role !== UserRole.SYSTEM_ADMIN));
        });
    };

    const handleExportPDF = async () => {
        setIsExporting(true);
        const tableElement = document.getElementById('print-container');
        if (!tableElement) {
            setIsExporting(false);
            return;
        }
        try {
            // Temporarily reveal to capture
            tableElement.style.display = 'block';

            // Wait for render
            await new Promise(resolve => setTimeout(resolve, 100));

            const canvas = await html2canvas(tableElement, {
                scale: 3, // High resolution for crisp text
                useCORS: true,
                backgroundColor: '#ffffff',
                logging: false
            });

            // A4 Landscape dimensions in mm
            const a4Width = 297;

            // Minimize margin to 3mm to maximize content size
            const margin = 3;
            const printableWidth = a4Width - (margin * 2);

            // Calculate aspect ratio to fit width
            const imgHeight = (canvas.height * printableWidth) / canvas.width;

            let pdf = new jsPDF('l', 'mm', 'a4');
            const imgData = canvas.toDataURL('image/png');

            pdf.addImage(imgData, 'PNG', margin, margin, printableWidth, imgHeight);

            const fileName = `${getExportHeader().replace(/[/\\?%*:|"<>]/g, '-')}_${viewMode === 'user' ? '人員表' : '崗位表'}.pdf`;
            pdf.save(fileName);
        } catch (err) {
            console.error("Export failed", err);
            alert("匯出失敗，請稍後再試");
        } finally {
            tableElement.style.display = 'none'; // Hide again
            setIsExporting(false);
        }
    };

    // --- Data Access Helpers ---
    const getDayShift = (userId: string, dateStr: string) => {
        const override = shifts.find(s => s.userId === userId && s.date === dateStr);
        if (override) {
            return {
                station: override.station === SYSTEM_OFF ? null : override.station,
                specialRoles: override.specialRoles || [],
                isOff: override.station === SYSTEM_OFF
            };
        }
        const event = holidays.find(h => h.date === dateStr);
        if (event && event.type === DateEventType.CLOSED) return { station: null, specialRoles: [], isOff: true };
        const user = users.find(u => u.id === userId);
        if (!user) return { station: null, specialRoles: [], isOff: false };
        const autoStation = db.calculateBaseStatus(dateStr, user.groupId);
        if (autoStation === SYSTEM_OFF) return { station: null, specialRoles: [], isOff: true };
        return { station: null, specialRoles: [], isOff: false };
    };

    const getPendingRequest = (userId: string, dateStr: string) => {
        return pendingLeaves.find(l => {
            const isDateInRange = dateStr >= l.startDate && dateStr <= l.endDate;
            if (!isDateInRange) return false;
            if (l.type === LeaveType.DUTY_SWAP) return l.userId === userId;
            if (l.type === LeaveType.SWAP_SHIFT) return l.userId === userId || l.targetUserId === userId;
            return l.userId === userId;
        });
    };

    const handleUpdateShift = (userId: string, dateStr: string, station: string, specialRoles: string[]) => {
        const newShift: Shift = {
            id: `${userId}-${dateStr}`,
            userId,
            date: dateStr,
            station,
            specialRoles,
            isAutoGenerated: false
        };
        db.upsertShift(newShift);
        setShifts([...db.shifts]);
    };

    const onAutoScheduleClick = () => setIsAutoScheduleOpen(true);
    const onSpecialRoleClick = () => setIsSpecialRoleModalOpen(true);

    // Fix: Async/Await to ensure DB calculation finishes before UI update
    const handleAutoScheduleConfirm = async () => {
        setIsProcessing(true);
        // Await the heavy calculation and DB updates
        await db.autoSchedule(scheduleRange.start, scheduleRange.end);
        // Force update local state from the store
        setShifts([...db.getShifts('', '')]);
        setIsProcessing(false);
        setIsAutoScheduleOpen(false); // Close modal
    };

    // Fix: Async/Await for Special Roles too
    const handleSpecialRoleConfirm = async () => {
        setIsProcessing(true);
        await db.autoAssignSpecialRoles(scheduleRange.start, scheduleRange.end);
        setShifts([...db.getShifts('', '')]);
        setIsProcessing(false);
        setIsSpecialRoleModalOpen(false); // Close modal
    };

    const handleToggleCycleConfirm = async () => {
        if (selectedCycleId === 'rolling') return;

        const newStatus = !isCycleConfirmed;
        await db.toggleCycleConfirmation(selectedCycleId, newStatus);
        setShifts([...db.shifts]);
    };

    const handleSpecialRoleToggle = (userId: string, dateStr: string, role: string, currentStation: string, currentRoles: string[]) => {
        let newRoles = [...currentRoles];
        if (newRoles.includes(role)) {
            newRoles = newRoles.filter(r => r !== role);
        } else {
            newRoles.push(role);
        }
        if (newRoles.includes(role)) {
            if (role === SPECIAL_ROLES.LATE) newRoles = newRoles.filter(r => r !== SPECIAL_ROLES.ASSIST && r !== SPECIAL_ROLES.OPENING);
            if (role === SPECIAL_ROLES.ASSIST) newRoles = newRoles.filter(r => r !== SPECIAL_ROLES.LATE);
            if (role === SPECIAL_ROLES.OPENING) newRoles = newRoles.filter(r => r !== SPECIAL_ROLES.LATE);
        }
        handleUpdateShift(userId, dateStr, currentStation || StationDefault.UNASSIGNED, newRoles);
    };

    const getStationStaff = (stationName: string, dateStr: string) => {
        return shifts
            .filter(s => s.date === dateStr && s.station === stationName)
            .map(s => ({ user: users.find(u => u.id === s.userId), shift: s }))
            .filter(item => item.user !== undefined);
    };

    const getUnassignedStaff = (dateStr: string) => {
        const event = holidays.find(h => h.date === dateStr);
        if (event && event.type === DateEventType.CLOSED) return [];
        const unassigned = users.filter(user => {
            const status = db.getUserStatusOnDate(user.id, dateStr);
            if (status === 'OFF') return false;
            const shift = shifts.find(s => s.userId === user.id && s.date === dateStr);
            if (shift) return shift.station === StationDefault.UNASSIGNED || shift.station === '未分配';
            return true;
        });
        return unassigned.map(u => {
            const s = shifts.find(shift => shift.userId === u.id && shift.date === dateStr);
            return {
                user: u,
                shift: s || {
                    id: 'temp', userId: u.id, date: dateStr,
                    station: StationDefault.UNASSIGNED, specialRoles: [], isAutoGenerated: true
                }
            };
        });
    };

    const getOffStaff = (dateStr: string) => {
        const offUsers = users.filter(user => db.getUserStatusOnDate(user.id, dateStr) === 'OFF');
        return offUsers.map(u => {
            const s = shifts.find(shift => shift.userId === u.id && shift.date === dateStr);
            return {
                user: u,
                shift: s || {
                    id: 'temp', userId: u.id, date: dateStr,
                    station: SYSTEM_OFF, specialRoles: [], isAutoGenerated: true
                }
            };
        });
    };

    const getSpecialRoleStaff = (roleName: string, dateStr: string) => {
        return shifts
            .filter(s => s.date === dateStr && s.specialRoles && s.specialRoles.includes(roleName))
            .map(s => ({ user: users.find(u => u.id === s.userId), shift: s }))
            .filter(item => item.user !== undefined);
    };

    const getAssignableCandidates = (station: string, dateStr: string) => {
        return users.filter(user => {
            const isCertified = user.capabilities?.includes(station);
            const isLearning = user.learningCapabilities?.includes(station);
            if (!isCertified && !isLearning) return false;
            const status = db.getUserStatusOnDate(user.id, dateStr);
            if (status === 'OFF') return false;
            const shift = shifts.find(s => s.userId === user.id && s.date === dateStr);
            if (shift && shift.station !== StationDefault.UNASSIGNED && shift.station !== '未分配' && shift.station !== station) return false;
            if (shift && shift.station === station) return false;
            return true;
        });
    };

    const handleAddUserToRole = (userId: string, dateStr: string, role: string) => {
        const existingShift = shifts.find(s => s.userId === userId && s.date === dateStr);
        const station = existingShift ? existingShift.station : StationDefault.UNASSIGNED;
        const currentRoles = existingShift ? existingShift.specialRoles : [];
        if (!currentRoles.includes(role)) {
            handleUpdateShift(userId, dateStr, station, [...currentRoles, role]);
        }
    };

    const handleRemoveUserFromRole = (userId: string, dateStr: string, role: string) => {
        const existingShift = shifts.find(s => s.userId === userId && s.date === dateStr);
        if (existingShift) {
            const newRoles = existingShift.specialRoles.filter(r => r !== role);
            handleUpdateShift(userId, dateStr, existingShift.station, newRoles);
        }
    };

    const getCandidatesForRole = (role: string, dateStr: string) => {
        return users.filter(user => {
            const isCertified = user.capabilities?.includes(role);
            const isLearning = user.learningCapabilities?.includes(role);
            if (!isCertified && !isLearning) return false;
            const status = db.getUserStatusOnDate(user.id, dateStr);
            if (status === 'OFF') return false;
            const shift = shifts.find(s => s.userId === user.id && s.date === dateStr);
            if (shift && shift.specialRoles.includes(role)) return false;
            return true;
        });
    };

    const handleAddUserToStation = (userId: string, dateStr: string, station: string) => {
        const existingShift = shifts.find(s => s.userId === userId && s.date === dateStr);
        const roles = existingShift ? existingShift.specialRoles : [];
        handleUpdateShift(userId, dateStr, station, roles);
    };

    const handleRemoveUserFromStation = (userId: string, dateStr: string) => {
        const existingShift = shifts.find(s => s.userId === userId && s.date === dateStr);
        const roles = existingShift ? existingShift.specialRoles : [];
        handleUpdateShift(userId, dateStr, StationDefault.UNASSIGNED, roles);
    };

    const handleNavigate = (direction: 'prev' | 'next') => {
        const newDate = new Date(currentDate);
        newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
        setCurrentDate(newDate);
    };

    const handleDateJump = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.value) {
            setCurrentDate(new Date(e.target.value));
        }
    };

    // --- Reordering Logic ---
    const handleMoveRow = (index: number, direction: 'up' | 'down') => {
        const newOrder = [...displayOrder];
        if (direction === 'up') {
            if (index === 0) return;
            [newOrder[index], newOrder[index - 1]] = [newOrder[index - 1], newOrder[index]];
        } else {
            if (index === newOrder.length - 1) return;
            [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
        }
        setDisplayOrder(newOrder);
        db.updateStationDisplayOrder(newOrder);
    };

    // --- Styles ---
    const getStationStyle = (station: string) => {
        if (station.includes('MR')) return 'bg-orange-50 text-orange-800 border-orange-300';
        if (station.includes('US')) return 'bg-emerald-50 text-emerald-800 border-emerald-300';
        if (station.includes('CT')) return 'bg-sky-50 text-sky-800 border-sky-300';
        if (station.includes('場控')) return 'bg-red-50 text-red-700 border-red-300';
        if (station.includes('遠班') || station.includes('遠距')) return 'bg-fuchsia-50 text-fuchsia-800 border-fuchsia-300';
        if (station.includes('BMD') || station.includes('DX')) return 'bg-violet-50 text-violet-800 border-violet-300';
        if (station.includes('大直')) return 'bg-blue-50 text-blue-800 border-blue-300';
        if (station.includes('技術支援')) return 'bg-lime-50 text-lime-800 border-lime-300';
        if (station.includes('行政')) return 'bg-slate-100 text-slate-700 border-slate-300';
        if (station.includes('未分配')) return 'bg-white text-gray-400 border-dashed border-gray-300';
        if (station.includes('休假')) return 'bg-slate-100 text-slate-400 border-slate-200';
        return 'bg-teal-50 text-teal-800 border-teal-200';
    };

    // For Screen View only
    const getStationChipStyle = (name: string) => {
        if (Object.values(SPECIAL_ROLES).includes(name)) {
            if (name === SPECIAL_ROLES.OPENING) return 'bg-blue-100 text-blue-900 border-blue-200';
            if (name === SPECIAL_ROLES.LATE) return 'bg-amber-100 text-amber-900 border-amber-200';
            if (name === SPECIAL_ROLES.ASSIST) return 'bg-emerald-100 text-emerald-900 border-emerald-200';
            if (name === SPECIAL_ROLES.SCHEDULER) return 'bg-red-100 text-red-900 border-red-200';
            return 'bg-gray-100 text-gray-800 border-gray-200';
        }

        if (name === SYSTEM_OFF) return 'bg-slate-100 text-slate-400 border-slate-200';
        if (name === StationDefault.UNASSIGNED) return 'bg-white text-gray-400 border-dashed border-gray-300';

        if (name.includes('MR')) return 'bg-orange-100 text-orange-900 border-orange-200';
        if (name.includes('US')) return 'bg-emerald-100 text-emerald-900 border-emerald-200';
        if (name.includes('CT')) return 'bg-sky-100 text-sky-900 border-sky-200';
        if (name.includes('場控')) return 'bg-red-100 text-red-900 border-red-200';
        if (name.includes('遠')) return 'bg-fuchsia-100 text-fuchsia-900 border-fuchsia-200';
        if (name.includes('BMD')) return 'bg-violet-100 text-violet-900 border-violet-200';
        if (name.includes('大直')) return 'bg-blue-100 text-blue-900 border-blue-200';
        if (name.includes('技術支援')) return 'bg-lime-100 text-lime-900 border-lime-200';
        if (name.includes('行政')) return 'bg-slate-200 text-slate-800 border-slate-300';

        return 'bg-teal-100 text-teal-900 border-teal-200'; // Default
    };

    const getLeaveBadge = (type: LeaveType) => {
        let color = 'bg-gray-400';
        let label = '申';
        switch (type) {
            case LeaveType.PRE_SCHEDULED: color = 'bg-blue-500'; label = '預'; break;
            case LeaveType.CANCEL_LEAVE: color = 'bg-pink-500'; label = '銷'; break;
            case LeaveType.SWAP_SHIFT: color = 'bg-purple-500'; label = '換'; break;
            case LeaveType.DUTY_SWAP: color = 'bg-indigo-500'; label = '任'; break;
            case LeaveType.LONG_LEAVE: color = 'bg-orange-500'; label = '長'; break;
        }
        return (
            <div className={`absolute top-0 right-0 w-3 h-3 ${color} rounded-bl text-[8px] flex items-center justify-center text-white font-bold z-10 leading-none`} title={`${type}申請中`}>
                {label}
            </div>
        );
    };

    const specialRolesList = [
        SPECIAL_ROLES.OPENING,
        SPECIAL_ROLES.LATE,
        SPECIAL_ROLES.ASSIST,
        SPECIAL_ROLES.SCHEDULER
    ];

    const allStationsSorted = useMemo(() => {
        const rawStations = db.getStations().filter(s => s !== SYSTEM_OFF && s !== StationDefault.UNASSIGNED);
        const priorities = [
            '遠距', '遠班',
            '場控',
            'MR3T', 'MR1.5T',
            'US', 'CT', 'BMD',
            '技術支援', '行政', '大直'
        ];
        return [...rawStations].sort((a, b) => {
            const idxA = priorities.findIndex(p => a.includes(p));
            const idxB = priorities.findIndex(p => b.includes(p));
            const valA = idxA === -1 ? 999 : idxA;
            const valB = idxB === -1 ? 999 : idxB;
            if (valA !== valB) return valA - valB;
            return a.localeCompare(b);
        });
    }, []);

    const rowConfigs = useMemo(() => {
        return displayOrder.map(item => {
            if (Object.values(SPECIAL_ROLES).includes(item)) {
                let colorClass = 'bg-gray-50 border-gray-200 text-gray-700';
                if (item === SPECIAL_ROLES.OPENING) colorClass = 'bg-blue-50 border-blue-200 text-blue-700';
                if (item === SPECIAL_ROLES.LATE) colorClass = 'bg-amber-50 border-amber-200 text-amber-800';
                if (item === SPECIAL_ROLES.ASSIST) colorClass = 'bg-emerald-50 border-emerald-200 text-emerald-700';
                if (item === SPECIAL_ROLES.SCHEDULER) colorClass = 'bg-red-50 border-red-200 text-red-800';

                return {
                    id: item,
                    type: 'ROLE',
                    label: item,
                    colorClass: colorClass,
                    getData: (date: string) => getSpecialRoleStaff(item, date)
                };
            } else if (item === SYSTEM_OFF) {
                return {
                    id: item,
                    type: 'STATION',
                    label: item,
                    colorClass: 'bg-slate-100 border-slate-200 text-slate-500',
                    getData: (date: string) => getOffStaff(date)
                };
            } else if (item === StationDefault.UNASSIGNED) {
                return {
                    id: item,
                    type: 'STATION',
                    label: item,
                    colorClass: 'bg-white border-dashed border-gray-300 text-gray-400',
                    getData: (date: string) => getUnassignedStaff(date)
                };
            } else {
                let colorClass = 'bg-teal-50 text-teal-800 border-teal-200';
                if (item.includes('MR')) colorClass = 'bg-orange-50 text-orange-800 border-orange-300';
                else if (item.includes('US')) colorClass = 'bg-emerald-50 text-emerald-800 border-emerald-300';
                else if (item.includes('CT')) colorClass = 'bg-sky-50 text-sky-800 border-sky-300';
                else if (item.includes('場控')) colorClass = 'bg-red-50 text-red-700 border-red-300';
                else if (item.includes('遠')) colorClass = 'bg-fuchsia-50 text-fuchsia-800 border-fuchsia-300';
                else if (item.includes('大直')) colorClass = 'bg-blue-50 text-blue-800 border-blue-300';

                return {
                    id: item,
                    type: 'STATION',
                    label: item,
                    colorClass: colorClass,
                    getData: (date: string) => getStationStaff(item, date)
                };
            }
        });
    }, [displayOrder, shifts]);

    return (
        <div className="h-full flex flex-col bg-slate-50 relative">
            <ConfirmModal
                isOpen={isConfirmCycleOpen}
                onClose={() => setIsConfirmCycleOpen(false)}
                onConfirm={handleToggleCycleConfirm}
                title={isCycleConfirmed ? "解鎖排班週期" : "確認並鎖定排班"}
                message={isCycleConfirmed
                    ? "解鎖後將可以重新使用自動排班功能。確定要解鎖此週期嗎？"
                    : "鎖定後，此週期的「自動排崗位」與「自動排任務」功能將失效，以防止意外覆蓋已確認的班表。後續調整需手動進行。確定要鎖定嗎？"
                }
                confirmText={isCycleConfirmed ? "解鎖" : "確認鎖定"}
                confirmColor={isCycleConfirmed ? "purple" : "teal"}
            />

            <ConfirmModal
                isOpen={isAutoScheduleOpen}
                onClose={() => setIsAutoScheduleOpen(false)}
                onConfirm={handleAutoScheduleConfirm}
                title="自動排班 (一般崗位)"
                message={
                    <div className="space-y-4">
                        <p className="font-medium text-gray-800">請設定排班日期範圍</p>
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="text-xs text-gray-500 font-bold block mb-1">開始日期</label>
                                <input
                                    type="date"
                                    className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:ring-2 focus:ring-teal-500 outline-none"
                                    value={scheduleRange.start}
                                    onChange={(e) => setScheduleRange({ ...scheduleRange, start: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 font-bold block mb-1">結束日期</label>
                                <input
                                    type="date"
                                    className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:ring-2 focus:ring-teal-500 outline-none"
                                    value={scheduleRange.end}
                                    onChange={(e) => setScheduleRange({ ...scheduleRange, end: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="bg-purple-50 p-3 rounded text-xs text-purple-800 space-y-1 border border-purple-100">
                            <div className="font-bold mb-1 flex items-center gap-1"><Wand2 size={12} /> 說明：</div>
                            <p>• 此功能僅會自動分配<span className="font-bold">工作崗位</span> (如 CT, MRI)。</p>
                            <p>• 將<span className="font-bold">重新隨機洗牌</span>選定範圍內的自動排班。</p>
                            <p>• <span className="font-bold text-red-600">不會</span>更動或分配開機/晚班等特殊任務。</p>
                            <p>• 優先填補空缺，不覆蓋手動鎖定。</p>
                        </div>
                        {isProcessing && (
                            <div className="flex items-center justify-center gap-2 text-purple-600 font-bold text-sm">
                                <Loader2 className="animate-spin" size={16} /> 計算中...
                            </div>
                        )}
                    </div>
                }
                confirmText={isProcessing ? "處理中..." : "執行崗位排班"}
                confirmColor="purple"
            />

            <ConfirmModal
                isOpen={isSpecialRoleModalOpen}
                onClose={() => setIsSpecialRoleModalOpen(false)}
                onConfirm={handleSpecialRoleConfirm}
                title="自動排班 (開機/晚班)"
                message={
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded font-bold">開機</span>
                            <span className="bg-amber-100 text-amber-800 text-xs px-2 py-0.5 rounded font-bold">晚班</span>
                        </div>
                        <p className="font-medium text-gray-800">請選擇要分配任務的日期範圍</p>
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="text-xs text-gray-500 font-bold block mb-1">開始日期</label>
                                <input
                                    type="date"
                                    className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:ring-2 focus:ring-teal-500 outline-none"
                                    value={scheduleRange.start}
                                    onChange={(e) => setScheduleRange({ ...scheduleRange, start: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 font-bold block mb-1">結束日期</label>
                                <input
                                    type="date"
                                    className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:ring-2 focus:ring-teal-500 outline-none"
                                    value={scheduleRange.end}
                                    onChange={(e) => setScheduleRange({ ...scheduleRange, end: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="bg-indigo-50 p-3 rounded text-xs text-indigo-800 space-y-1 border border-indigo-100">
                            <div className="font-bold mb-1 flex items-center gap-1"><Sparkles size={12} /> 分配邏輯：</div>
                            <p>1. 僅針對「開機」與「晚班」空缺進行填補。</p>
                            <p>2. 依據人員歷史次數平均分配。</p>
                            <p>3. 遇休假或已排定任務自動跳過。</p>
                            <p>4. 已排定者無法更改。</p>
                        </div>
                        {isProcessing && (
                            <div className="flex items-center justify-center gap-2 text-indigo-600 font-bold text-sm">
                                <Loader2 className="animate-spin" size={16} /> 計算中...
                            </div>
                        )}
                    </div>
                }
                confirmText={isProcessing ? "處理中..." : "執行任務分配"}
                confirmColor="teal"
            />

            {/* --- Optimized A4 Landscape Print Container --- */}
            {/* Width set to 1600px to allow larger text size relative to A4 page when scaled down */}
            <div id="print-container" className="fixed top-0 left-[-9999px] bg-white hidden" style={{ width: '1600px', fontFamily: '"Noto Sans TC", sans-serif' }}>
                <div className="flex flex-col items-center mb-4 mt-2">
                    <h1 className="text-3xl font-bold text-gray-900 tracking-wide mb-1">影像醫學部 - {viewMode === 'user' ? '人員排班表' : '崗位分配表'}</h1>
                    <div className="text-xl font-medium text-gray-600 border-b-2 border-gray-800 pb-2 px-8">
                        {getExportHeader()}
                    </div>
                </div>

                <table className="w-full border-collapse table-fixed text-xs shadow-sm">
                    <thead>
                        <tr className="bg-gray-100 text-gray-700 h-10">
                            {/* Thinner border color: border-gray-400 (which will look like 0.5px when scaled) */}
                            <th className="border-[0.5px] border-gray-400 p-1 w-20 font-bold bg-gray-200 text-sm">
                                {viewMode === 'user' ? '姓名' : '崗位'}
                            </th>
                            {dateRange.map(date => {
                                const d = new Date(date);
                                const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
                                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                                const todayStr = new Date().toISOString().split('T')[0];
                                const isPrintToday = date === todayStr;

                                return (
                                    <th key={date} className={`border-[0.5px] border-gray-400 p-1 min-w-[40px] ${isWeekend ? 'bg-red-50 text-gray-900' : 'text-gray-800'} ${isPrintToday ? 'bg-yellow-200 border-b-2 border-red-500' : ''}`}>
                                        <div className="text-[10px] font-medium">{weekDays[d.getDay()]}</div>
                                        <div className={`text-base ${isPrintToday ? 'font-bold text-red-600' : 'font-medium'}`}>{d.getDate()}</div>
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {viewMode === 'user' ? (
                            users.map((user, idx) => (
                                <tr key={user.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                                    <td className="border-[0.5px] border-gray-400 p-1 font-bold text-left pl-2 text-gray-900 bg-gray-50 text-sm whitespace-nowrap overflow-hidden">
                                        {user.name}
                                    </td>
                                    {dateRange.map(date => {
                                        const { station, specialRoles, isOff } = getDayShift(user.id, date);
                                        const event = holidays.find(h => h.date === date);
                                        const isClosed = event?.type === DateEventType.CLOSED;

                                        let content: React.ReactNode = '';
                                        let cellClass = '';

                                        if (isOff || isClosed) {
                                            content = (
                                                <div className="flex items-center justify-center h-full">
                                                    <span className="text-gray-300 font-bold text-lg">休</span>
                                                </div>
                                            );
                                            cellClass = 'text-gray-400 bg-gray-100';
                                        } else {
                                            // Force layout: Station at Top (Full Bg), Special Roles at Bottom (Text Only)
                                            content = (
                                                <div className="flex flex-col h-full w-full">
                                                    {/* Top: Station (Fill remaining space) */}
                                                    <div className="flex-1 w-full flex items-center justify-center">
                                                        {station && station !== StationDefault.UNASSIGNED ? (
                                                            // Removed rounded, added w-full h-full to fill
                                                            <div className={`w-full h-full flex items-center justify-center ${getStationStyle(station).replace('border-teal-200', 'border-gray-300').replace('shadow-sm', '').replace('rounded-md', '')}`}>
                                                                <span className="font-bold text-sm leading-none text-center">{station}</span>
                                                            </div>
                                                        ) : (
                                                            <span className="text-gray-200 text-xs">-</span>
                                                        )}
                                                    </div>

                                                    {/* Bottom: Special Roles (Text only, 12px, regular weight) */}
                                                    {specialRoles.length > 0 && (
                                                        <div className="w-full flex justify-center items-end bg-white/50 border-t-[0.5px] border-gray-100">
                                                            <div className="flex gap-0.5 text-[12px] text-black leading-tight py-0.5">
                                                                {specialRoles.map(r => r[0]).join('')}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        }

                                        return (
                                            <td key={date} className={`border-[0.5px] border-gray-400 p-0 text-center align-top h-16 ${cellClass}`}>
                                                {content}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))
                        ) : (
                            <>
                                {rowConfigs.map((row, idx) => (
                                    <tr key={row.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                                        <td className={`border-[0.5px] border-gray-400 p-1 font-bold text-gray-800`}>
                                            <div className={`px-1 py-1 rounded border ${row.colorClass} text-center text-xs whitespace-nowrap`}>
                                                {row.label}
                                            </div>
                                        </td>
                                        {dateRange.map(date => {
                                            const staff = row.getData(date);

                                            return (
                                                <td key={date} className={`border-[0.5px] border-gray-400 p-0 align-middle h-16`}>
                                                    <div className="flex flex-col justify-center h-full w-full">
                                                        {staff.map((s, i) => {
                                                            let name = formatName(s.user?.name || '');
                                                            const isOpening = s.shift.specialRoles.includes(SPECIAL_ROLES.OPENING);
                                                            const isLate = s.shift.specialRoles.includes(SPECIAL_ROLES.LATE);

                                                            // Determine highlight for special roles inside station view: Text suffix
                                                            let roleSuffix = '';
                                                            if (isOpening) roleSuffix = '(開)';
                                                            if (isLate) roleSuffix = '(晚)';

                                                            // Use minimal styling for export list
                                                            return (
                                                                <div key={i} className={`text-sm text-center leading-tight font-bold text-gray-800`}>
                                                                    {name}
                                                                    <span className="text-[10px] font-normal ml-0.5">{roleSuffix}</span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </>
                        )}
                    </tbody>
                </table>
                <div className="mt-2 flex gap-6 text-[10px] text-gray-500 font-medium justify-end">
                    <span>* 匯出時間: {new Date().toLocaleString('zh-TW')}</span>
                    <div className="flex items-center gap-2"><span className="w-3 h-3 bg-gray-100 border border-gray-400"></span> <span>休假</span></div>
                    <div className="flex items-center gap-2"><span className="w-3 h-3 bg-yellow-200 border border-red-500"></span> <span>今日</span></div>
                </div>
            </div>

            {/* Header Area */}
            <div className="flex-none px-6 py-4 bg-white border-b border-slate-200 shadow-sm z-10">
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
                            {getCycleTitle()}
                            {isCycleConfirmed && (
                                <span className="bg-red-50 text-red-600 text-xs px-2 py-0.5 rounded border border-red-100 flex items-center gap-1">
                                    <Lock size={10} /> 已鎖定
                                </span>
                            )}
                        </h2>

                        <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                            <button
                                onClick={() => setViewMode('user')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${viewMode === 'user' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                                    }`}
                            >
                                <Users size={14} /> 人員視角
                            </button>
                            <button
                                onClick={() => setViewMode('station')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${viewMode === 'station' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                                    }`}
                            >
                                <LayoutList size={14} /> 崗位視角
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="flex items-center bg-slate-50 hover:bg-slate-100 rounded-lg px-2 py-1.5 transition-colors border border-slate-200">
                            <Filter size={14} className="text-slate-500 mr-2" />
                            <select
                                value={selectedCycleId}
                                onChange={(e) => setSelectedCycleId(e.target.value)}
                                className="text-sm bg-transparent border-none focus:ring-0 text-slate-700 font-medium cursor-pointer py-0 pl-0 pr-8"
                            >
                                <option value="rolling">連續排班視圖</option>
                                {cycles.map(c => (
                                    <option key={c.id} value={c.id}>
                                        {c.name} {c.isConfirmed ? '(🔒)' : ''}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {selectedCycleId === 'rolling' ? (
                            <div className="flex items-center bg-white rounded-lg border border-slate-200 p-0.5 shadow-sm gap-1">
                                <button onClick={() => handleNavigate('prev')} className="p-1.5 hover:bg-slate-50 rounded text-slate-500" title="上一週">
                                    <ChevronLeft size={16} />
                                </button>

                                {/* Enhanced Date Picker Navigation */}
                                <div className="relative group">
                                    <div className="flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-slate-50 rounded text-sm font-bold text-slate-700">
                                        {currentDate.toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })} 起
                                        <ChevronDown size={12} className="text-slate-400" />
                                    </div>
                                    <input
                                        type="date"
                                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                                        onChange={handleDateJump}
                                        title="跳轉至指定日期"
                                    />
                                </div>

                                <button onClick={() => handleNavigate('next')} className="p-1.5 hover:bg-slate-50 rounded text-slate-500" title="下一週">
                                    <ChevronRight size={16} />
                                </button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-bold border border-indigo-100">
                                <CalendarIcon size={14} />
                                {cycles.find(c => c.id === selectedCycleId)?.startDate} ~ {cycles.find(c => c.id === selectedCycleId)?.endDate}
                            </div>
                        )}

                        {(currentUser.role === UserRole.SUPERVISOR || currentUser.role === UserRole.SYSTEM_ADMIN) && selectedCycleId !== 'rolling' && (
                            <button
                                onClick={() => setIsConfirmCycleOpen(true)}
                                className={`px-3 py-1.5 rounded-lg text-sm font-medium border flex items-center gap-1.5 shadow-sm transition-all ${isCycleConfirmed
                                    ? 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
                                    : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                    }`}
                                title={isCycleConfirmed ? "解鎖排班" : "確認並鎖定排班"}
                            >
                                {isCycleConfirmed ? <Lock size={14} /> : <CheckCircle size={14} />}
                                {isCycleConfirmed ? '已鎖定' : '確認排班'}
                            </button>
                        )}

                        <div className="h-6 w-px bg-slate-200 mx-1"></div>

                        <button
                            onClick={handleExportPDF}
                            disabled={isExporting}
                            className="px-3 py-1.5 rounded-lg text-sm font-medium border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 shadow-sm transition-all"
                            title="匯出 PDF"
                        >
                            <Download size={14} />
                            {isExporting ? '處理中...' : '匯出'}
                        </button>

                        {(currentUser.role === UserRole.SUPERVISOR || currentUser.role === UserRole.SYSTEM_ADMIN) && (
                            <>
                                {/* Action Buttons: Only show when viewing Users and usually in custom or rolling range */}
                                {viewMode === 'user' && (
                                    <>
                                        {/* Auto Station Button */}
                                        <button
                                            onClick={onAutoScheduleClick}
                                            disabled={isProcessing || isCycleConfirmed}
                                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 shadow-sm ${(isProcessing || isCycleConfirmed)
                                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
                                                : 'bg-gradient-to-r from-purple-600 to-purple-500 text-white hover:from-purple-700 hover:to-purple-600 shadow-purple-200'
                                                }`}
                                            title={isCycleConfirmed ? "排班已鎖定，無法自動排程" : "自動分配一般工作崗位 (CT/MR/US...)"}
                                        >
                                            <Wand2 size={14} />
                                            <span className="hidden xl:inline">排崗位</span>
                                        </button>

                                        {/* Special Role Button */}
                                        <button
                                            onClick={onSpecialRoleClick}
                                            disabled={isProcessing || isCycleConfirmed}
                                            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all flex items-center gap-1.5 shadow-sm ${(isProcessing || isCycleConfirmed)
                                                ? 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed'
                                                : 'bg-white text-indigo-600 border-indigo-200 hover:bg-indigo-50 hover:border-indigo-300'
                                                }`}
                                            title={isCycleConfirmed ? "排班已鎖定，無法自動分配" : "自動分配 開機/晚班 任務"}
                                        >
                                            <Sparkles size={14} className={isCycleConfirmed ? "text-gray-400" : "fill-indigo-100"} />
                                            <span className="hidden xl:inline">排任務</span>
                                        </button>
                                    </>
                                )}

                                <button
                                    onClick={() => setIsEditMode(!isEditMode)}
                                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${isEditMode
                                        ? 'bg-teal-600 text-white border-teal-600 shadow-sm shadow-teal-200'
                                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                                        }`}
                                >
                                    {isEditMode ? '完成' : '編輯'}
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* ... (Rest of the table UI) ... */}
            <div id="roster-table" className="flex-1 overflow-auto bg-white p-2">
                {/* ... Table Content ... */}
                <table className="w-full border-collapse bg-white table-fixed">
                    {/* ... Table Header ... */}
                    <thead className="sticky top-0 z-20 shadow-sm">
                        <tr>
                            <th className="sticky left-0 z-30 bg-slate-50/95 backdrop-blur border-b border-r border-slate-200 p-0 w-[120px] shadow-[4px_0_8px_rgba(0,0,0,0.02)]">
                                <div className="p-2 text-left text-xs font-extrabold text-slate-600 uppercase tracking-wider">
                                    {viewMode === 'user' ? '放射師' : '工作崗位'}
                                </div>
                            </th>
                            {viewMode === 'user' && (
                                <th className="sticky left-[120px] z-30 bg-slate-50/95 backdrop-blur border-b border-r border-slate-200 p-0 w-[50px] shadow-[4px_0_8px_rgba(0,0,0,0.02)]">
                                    <div className="p-2 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider flex flex-col items-center">
                                        <BarChart2 size={12} className="mb-0.5 text-teal-600" />
                                        統計
                                    </div>
                                </th>
                            )}
                            {dateRange.map(date => {
                                const d = new Date(date);
                                const isToday = new Date().toISOString().split('T')[0] === date;
                                const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
                                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                                const holiday = holidays.find(h => h.date === date);
                                const isClosed = holiday?.type === DateEventType.CLOSED;
                                return (
                                    <th key={date} className={`border-b border-slate-200 py-1.5 min-w-[52px] text-center ${isToday ? 'bg-teal-50/50' : (isClosed ? 'bg-slate-100' : 'bg-white')}`}>
                                        <div className="flex flex-col items-center gap-0.5">
                                            <span className={`text-[10px] font-bold ${isToday ? 'text-teal-700' : (isWeekend ? 'text-red-500' : 'text-slate-400')}`}>
                                                {weekDays[d.getDay()]}
                                            </span>
                                            <span className={`text-sm font-bold leading-none ${holiday ? 'text-red-600' : (isToday ? 'text-teal-800' : 'text-slate-800')}`}>
                                                {d.getDate()}
                                            </span>
                                            {holiday && (
                                                <span className="text-[9px] px-1 rounded-sm leading-tight mt-0.5 bg-red-100 text-red-700 border border-red-200">
                                                    {holiday.name}
                                                </span>
                                            )}
                                        </div>
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {viewMode === 'user' ? (
                            // --- User View ---
                            users.map((user, idx) => {
                                const isFirst = idx === 0;
                                const isLast = idx === users.length - 1;
                                const workDaysCount = dateRange.filter(date => {
                                    const status = getDayShift(user.id, date);
                                    return !status.isOff;
                                }).length;
                                const userCapableStations = allStationsSorted.filter(s =>
                                    user.capabilities?.includes(s) ||
                                    user.learningCapabilities?.includes(s) ||
                                    s === StationDefault.UNASSIGNED ||
                                    s === '未分配'
                                );
                                return (
                                    <tr key={user.id} className="group hover:bg-slate-50/50 transition-colors">
                                        <td className="sticky left-0 z-10 bg-white group-hover:bg-slate-50 border-r border-slate-200 p-2 shadow-[4px_0_8px_rgba(0,0,0,0.02)]">
                                            <div className="flex items-center gap-2">
                                                {isEditMode && (
                                                    <div className="flex flex-col gap-0.5">
                                                        <button
                                                            disabled={isFirst}
                                                            onClick={() => handleMoveUser(idx, 'up')}
                                                            className={`p-0.5 rounded ${isFirst ? 'text-gray-200' : 'text-gray-400 hover:text-teal-600 hover:bg-gray-100'}`}
                                                        >
                                                            <ChevronUp size={12} />
                                                        </button>
                                                        <button
                                                            disabled={isLast}
                                                            onClick={() => handleMoveUser(idx, 'down')}
                                                            className={`p-0.5 rounded ${isLast ? 'text-gray-200' : 'text-gray-400 hover:text-teal-600 hover:bg-gray-100'}`}
                                                        >
                                                            <ChevronDown size={12} />
                                                        </button>
                                                    </div>
                                                )}
                                                <div className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-sm flex-shrink-0 ring-2 ring-white" style={{ backgroundColor: user.color || '#9CA3AF' }}>
                                                    {user.alias || user.name.charAt(0)}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="text-xs font-bold text-slate-800 truncate leading-tight">{user.name}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="sticky left-[120px] z-10 bg-white group-hover:bg-slate-50 border-r border-slate-200 p-0 text-center shadow-[4px_0_8px_rgba(0,0,0,0.02)]">
                                            <div className="text-[10px] font-bold text-slate-600 bg-slate-100 mx-1.5 py-0.5 rounded border border-slate-200">
                                                {workDaysCount}
                                            </div>
                                        </td>
                                        {dateRange.map(date => {
                                            const { station, specialRoles, isOff } = getDayShift(user.id, date);
                                            const isToday = new Date().toISOString().split('T')[0] === date;
                                            const pendingReq = getPendingRequest(user.id, date);
                                            const event = holidays.find(h => h.date === date);
                                            const isClosed = event?.type === DateEventType.CLOSED;
                                            const isLearning = station && user.learningCapabilities?.includes(station);

                                            return (
                                                <td key={date} className={`p-0.5 border-r border-slate-100 align-top h-16 ${isToday ? 'bg-teal-50/10' : ''} ${isOff ? 'bg-slate-100/60' : (isClosed ? 'bg-slate-100/30' : '')} relative`}>
                                                    {pendingReq && getLeaveBadge(pendingReq.type)}
                                                    {isOff ? (
                                                        <div className="h-full w-full flex flex-col items-center justify-center gap-1">
                                                            <span className="text-slate-300 font-bold select-none text-[12px]">休</span>
                                                            {isEditMode && (
                                                                <button onClick={() => handleUpdateShift(user.id, date, '未分配', [])} className="text-[10px] text-teal-600 hover:text-white hover:bg-teal-500 bg-white border border-teal-200 px-1.5 rounded shadow-sm transition-all">+</button>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <div className="flex flex-col gap-1 h-full justify-start pt-1 items-center">
                                                            {isEditMode ? (
                                                                <select value={station || ''} onChange={(e) => handleUpdateShift(user.id, date, e.target.value || SYSTEM_OFF, specialRoles)} className="w-full text-[10px] py-1 px-0.5 border border-slate-300 rounded bg-white focus:ring-2 focus:ring-teal-500 outline-none font-medium text-slate-800">
                                                                    <option value="">...</option>
                                                                    {userCapableStations.map(s => <option key={s} value={s}>{s}</option>)}
                                                                    <option value={SYSTEM_OFF}>休假</option>
                                                                </select>
                                                            ) : (
                                                                station ? (
                                                                    <div className={`flex items-center justify-center px-1 py-1 rounded-md shadow-sm border w-full max-w-[50px] ${getStationStyle(station)}`}>
                                                                        <span className="text-[10px] font-bold truncate tracking-tight">{station}</span>
                                                                        {isLearning && (
                                                                            <span className="text-[9px] bg-white/50 text-slate-900 font-extrabold px-0.5 rounded ml-0.5 leading-none">學</span>
                                                                        )}
                                                                    </div>
                                                                ) : (
                                                                    <div className="flex-1 flex items-center justify-center">
                                                                        <div className="text-[10px] text-slate-300 font-light">-</div>
                                                                    </div>
                                                                )
                                                            )}
                                                            {isEditMode ? (
                                                                <div className="flex flex-wrap gap-0.5 justify-center">
                                                                    {specialRolesList.map(role => {
                                                                        const isSelected = specialRoles.includes(role);
                                                                        return (
                                                                            <button key={role} onClick={() => handleSpecialRoleToggle(user.id, date, role, station || StationDefault.UNASSIGNED, specialRoles)} className={`px-1 py-0.5 text-[9px] rounded border transition-all font-bold ${isSelected ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-slate-400 border-slate-200 hover:border-purple-300 hover:text-purple-500'}`}>{role[0]}</button>
                                                                        );
                                                                    })}
                                                                </div>
                                                            ) : (
                                                                specialRoles.length > 0 && (
                                                                    <div className="flex flex-wrap gap-0.5 justify-center w-full">
                                                                        {specialRoles.map(role => (
                                                                            <span key={role} className={`w-full text-center px-0.5 rounded-[2px] text-[10px] leading-tight font-extrabold border mb-0.5 ${role === SPECIAL_ROLES.OPENING ? 'bg-blue-100/80 text-blue-900 border-blue-200/50' :
                                                                                role === SPECIAL_ROLES.LATE ? 'bg-amber-100/80 text-amber-900 border-amber-200/50' :
                                                                                    role === SPECIAL_ROLES.ASSIST ? 'bg-emerald-100/80 text-emerald-900 border-emerald-200/50' :
                                                                                        role === SPECIAL_ROLES.SCHEDULER ? 'bg-red-100/80 text-red-900 border-red-200/50' :
                                                                                            'bg-purple-100 text-purple-700 border-purple-200'
                                                                                }`}>
                                                                                {role}
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                )
                                                            )}
                                                        </div>
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                )
                            })
                        ) : (
                            // --- Station View (Unified & Reorderable) ---
                            <>
                                {rowConfigs.map((row, idx) => {
                                    const isFirst = idx === 0;
                                    const isLast = idx === rowConfigs.length - 1;
                                    return (
                                        <tr key={row.id} className="group hover:bg-slate-50/50 transition-colors relative">
                                            <td className="sticky left-0 z-10 bg-white group-hover:bg-slate-50 border-r border-slate-200 p-2 shadow-[4px_0_8px_rgba(0,0,0,0.02)]">
                                                <div className="flex items-center justify-between">
                                                    <div className={`flex items-center gap-1.5 font-bold text-xs px-2 py-1.5 rounded-md border ${row.colorClass} flex-1 mr-1`}>
                                                        <div className="truncate">{row.label}</div>
                                                    </div>
                                                    {isEditMode && (
                                                        <div className="flex flex-col gap-0.5">
                                                            <button
                                                                disabled={isFirst}
                                                                onClick={() => handleMoveRow(idx, 'up')}
                                                                className={`p-0.5 rounded ${isFirst ? 'text-gray-200' : 'text-gray-400 hover:text-teal-600 hover:bg-gray-100'}`}
                                                            >
                                                                <ChevronUp size={12} />
                                                            </button>
                                                            <button
                                                                disabled={isLast}
                                                                onClick={() => handleMoveRow(idx, 'down')}
                                                                className={`p-0.5 rounded ${isLast ? 'text-gray-200' : 'text-gray-400 hover:text-teal-600 hover:bg-gray-100'}`}
                                                            >
                                                                <ChevronDown size={12} />
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            {dateRange.map(date => {
                                                const staff = row.getData(date);
                                                // Sort staff: Certified First, Learners Last
                                                const sortedStaff = [...staff].sort((a, b) => {
                                                    if (!a.user || !b.user) return 0;
                                                    const isALearner = a.user.learningCapabilities?.includes(row.label);
                                                    const isBLearner = b.user.learningCapabilities?.includes(row.label);

                                                    if (isALearner && !isBLearner) return 1; // A is learner, goes after
                                                    if (!isALearner && isBLearner) return -1; // B is learner, goes after
                                                    return 0;
                                                });

                                                const isToday = new Date().toISOString().split('T')[0] === date;
                                                // Unified Cell Content Logic for both Roles and Stations (Chips)
                                                return (
                                                    <td key={date} className={`p-0.5 border-r border-slate-100 align-top h-16 ${isToday ? 'bg-teal-50/10' : ''}`}>
                                                        <div className="h-full flex flex-col items-center justify-start pt-1 relative group/cell">
                                                            <div className="flex flex-wrap gap-1 justify-center w-full px-0.5">
                                                                {sortedStaff.map((item, i) => {
                                                                    const isOpening = item.shift.specialRoles.includes(SPECIAL_ROLES.OPENING);
                                                                    const isLate = item.shift.specialRoles.includes(SPECIAL_ROLES.LATE);
                                                                    const isAssist = item.shift.specialRoles.includes(SPECIAL_ROLES.ASSIST);
                                                                    const isScheduler = item.shift.specialRoles.includes(SPECIAL_ROLES.SCHEDULER);

                                                                    // Only show suffix if the row itself isn't that role
                                                                    const showSuffix = row.type === 'STATION';

                                                                    // Use Station Theme Color instead of User Color
                                                                    let chipClass = getStationChipStyle(row.label);

                                                                    // Check if this user is a Learner for this specific station
                                                                    const isLearner = item.user?.learningCapabilities?.includes(row.label);
                                                                    // Revert: White override logic for learners in Station View
                                                                    if (isLearner) {
                                                                        chipClass = 'bg-white text-slate-500 border-slate-200 border-dashed';
                                                                    }

                                                                    return (
                                                                        <div
                                                                            key={i}
                                                                            className={`px-1 py-1 rounded text-sm font-bold shadow-sm flex flex-col items-center w-full max-w-[60px] relative group/chip border ${chipClass}`}
                                                                        >
                                                                            <span className="truncate text-xs leading-tight mb-0.5">
                                                                                {item.user?.name ? formatName(item.user.name) : ''}
                                                                                {isLearner && <span className="text-[9px] ml-0.5">(學)</span>}
                                                                            </span>

                                                                            {showSuffix && (isOpening || isLate || isAssist || isScheduler) && (
                                                                                <div className="flex flex-col gap-0.5 mt-0.5 w-full items-center">
                                                                                    {isOpening && <span className="w-full text-center bg-blue-100/80 px-0.5 rounded-[2px] text-[10px] leading-tight text-blue-900 font-extrabold border border-blue-200/50">開機</span>}
                                                                                    {isLate && <span className="w-full text-center bg-amber-100/80 px-0.5 rounded-[2px] text-[10px] leading-tight text-amber-900 font-extrabold border border-amber-200/50">晚班</span>}
                                                                                    {isAssist && <span className="w-full text-center bg-emerald-100/80 px-0.5 rounded-[2px] text-[10px] leading-tight text-emerald-900 font-extrabold border border-emerald-200/50">輔班</span>}
                                                                                    {isScheduler && <span className="w-full text-center bg-red-100/80 px-0.5 rounded-[2px] text-[10px] leading-tight text-red-900 font-extrabold border border-red-200/50">排班</span>}
                                                                                </div>
                                                                            )}

                                                                            {isEditMode && (
                                                                                <button
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        if (row.type === 'STATION') handleRemoveUserFromStation(item.user!.id, date);
                                                                                        else handleRemoveUserFromRole(item.user!.id, date, row.label);
                                                                                    }}
                                                                                    className="absolute -top-1 -right-1 bg-white text-red-500 rounded-full p-0.5 opacity-0 group-hover/chip:opacity-100 transition-opacity shadow-sm border border-red-100 z-10"
                                                                                >
                                                                                    <X size={8} />
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                            {isEditMode && (
                                                                <div className="mt-1 w-full flex justify-center opacity-0 group-hover/cell:opacity-100 transition-opacity">
                                                                    <div className="relative w-full max-w-[40px]">
                                                                        <button className="w-full flex justify-center bg-slate-100 hover:bg-slate-200 rounded text-slate-400 text-[10px] border border-slate-200"><Plus size={10} /></button>
                                                                        <select className="absolute inset-0 opacity-0 cursor-pointer" value="" onChange={(e) => { if (e.target.value) { if (row.type === 'STATION') { handleAddUserToStation(e.target.value, date, row.label); } else { handleAddUserToRole(e.target.value, date, row.label); } } }}>
                                                                            <option value="">選擇人員</option>
                                                                            {row.type === 'STATION'
                                                                                ? getAssignableCandidates(row.label, date).map(u => (<option key={u.id} value={u.id}>{u.name} ({u.alias || u.name[0]})</option>))
                                                                                : getCandidatesForRole(row.label, date).map(u => (<option key={u.id} value={u.id}>{u.name} ({u.alias || u.name[0]})</option>))
                                                                            }
                                                                        </select>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    );
                                })}
                            </>
                        )}
                    </tbody>
                </table>
                {/* ... (Footer legend) ... */}
                <div className="p-4 border-t border-slate-200 bg-white sticky bottom-0 z-20 flex gap-6 text-xs text-slate-500 font-medium">
                    {viewMode === 'user' ? (
                        <>
                            <div className="flex items-center gap-2"><span className="w-3 h-3 bg-slate-200 rounded-sm"></span> <span>休假 / 非工作日</span></div>
                            <div className="flex items-center gap-2"><span className="w-3 h-3 bg-orange-100 border border-orange-200 rounded-sm"></span> <span>MR</span></div>
                            <div className="flex items-center gap-2"><span className="w-3 h-3 bg-emerald-100 border border-emerald-200 rounded-sm"></span> <span>US</span></div>
                            <div className="flex items-center gap-2"><span className="w-3 h-3 bg-sky-100 border border-sky-200 rounded-sm"></span> <span>CT</span></div>
                            <div className="flex items-center gap-2"><span className="w-3 h-3 bg-teal-100 border border-teal-200 rounded-sm flex items-center justify-center text-[8px] text-teal-800">學</span> <span>學習崗位</span></div>
                        </>
                    ) : (
                        <>
                            <div className="flex items-center gap-2"><LayoutList size={14} /><span>崗位視角說明：</span></div>
                            <div className="flex items-center gap-2"><span className="w-3 h-3 bg-teal-100 border border-teal-200 rounded-sm"></span> <span>正式人員</span></div>
                            <div className="flex items-center gap-2"><span className="w-3 h-3 bg-white border border-slate-200 border-dashed rounded-sm flex items-center justify-center text-[8px] text-slate-500">學</span> <span>學習人員 (排序於後)</span></div>
                            {isEditMode && <div className="flex items-center gap-2 text-teal-600 font-bold ml-auto">可使用左側箭頭調整顯示順序</div>}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DashboardPage;
