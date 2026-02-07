import React, { useState, useMemo, useEffect } from 'react';
import type { User, Shift } from '../types';
import { UserRole, SYSTEM_OFF, SPECIAL_ROLES, LeaveRequest, LeaveStatus, LeaveType, StationDefault, DateEventType } from '../types';
import { db } from '../services/store';
import { ChevronLeft, ChevronRight, Briefcase, Moon, Sun, Monitor, Activity, Calendar as CalendarIcon, Filter, Wand2, Users, LayoutList, Star, AlertCircle, Plus, X, Download, BarChart2, Sparkles, ChevronDown, ChevronUp, GripVertical, BookOpen, Lock, Unlock, CheckCircle, Loader2, User as UserIcon, Key, Settings, Trash2, Check, AlertTriangle, Copy, FileSpreadsheet } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import ExcelJS from 'exceljs';
import ConfirmModal from '../components/ConfirmModal';

interface DashboardPageProps {
    currentUser: User;
}

type ViewMode = 'user' | 'station' | 'daily' | 'personal';


// Helper: Get Local ISO String YYYY-MM-DD
const toLocalISOString = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const DashboardPage: React.FC<DashboardPageProps> = ({ currentUser }) => {
    const [currentDate, setCurrentDate] = useState(new Date());

    // --- Cycle Selection Logic ---
    const cycles = db.getCycles();
    // Determine default cycle: If today falls within a cycle, select it. Otherwise 'rolling'.
    // Determine default cycle: If today falls within a cycle, select it. Otherwise 'rolling'.
    const [selectedCycleId, setSelectedCycleId] = useState<string>(() => {
        const todayStr = toLocalISOString(new Date());
        const activeCycle = cycles.find(c => todayStr >= c.startDate && todayStr <= c.endDate);
        return activeCycle ? activeCycle.id : 'rolling';
    });

    const [viewMode, setViewMode] = useState<ViewMode>(() => {
        // Default to 'daily' for mobile (Today's Stations), 'user' for desktop
        return window.innerWidth < 768 ? 'daily' : 'user';
    });
    // Daily View Date State
    const [dailyDate, setDailyDate] = useState(new Date());

    // Auto Schedule Modal State (Stations)
    const [isAutoScheduleOpen, setIsAutoScheduleOpen] = useState(false);
    // Auto Schedule Modal State (Special Roles)
    const [isSpecialRoleModalOpen, setIsSpecialRoleModalOpen] = useState(false);

    // Toast Notification State
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    const showToast = (message: string, type: 'success' | 'error' = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000); // Auto-dismiss after 3s
    };

    // Confirmation Modal State
    const [isConfirmCycleOpen, setIsConfirmCycleOpen] = useState(false);

    // Daily Memo Modal State
    const [memoModal, setMemoModal] = useState<{ date: string; content: string } | null>(null);

    // Hover Tooltip State
    const [hoveredDate, setHoveredDate] = useState<string | null>(null);


    // Unified Range State for schedulers
    const [scheduleRange, setScheduleRange] = useState({ start: '', end: '' });

    // Include all users including SYSTEM_ADMIN as requested
    const [allRadiographers, setAllRadiographers] = useState<User[]>(db.getUsers().filter(u => u.isRadiographer));
    const holidays = db.getHolidays();

    const pendingLeaves = db.getLeaves().filter(l => l.status === LeaveStatus.PENDING);
    const [shifts, setShifts] = useState<Shift[]>(db.getShifts('', ''));
    
    
    const [stationRequirements, setStationRequirements] = useState(db.getStationRequirements());
    const [displayOrder, setDisplayOrder] = useState<string[]>(db.getStationDisplayOrder());
    const [isEditMode, setIsEditMode] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    // Get current selected cycle object
    const currentCycle = useMemo(() => {
        return cycles.find(c => c.id === selectedCycleId);
    }, [selectedCycleId, cycles]);

    const isCycleConfirmed = currentCycle?.isConfirmed || false;

    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    // Track 7-day offset for mobile view
    const [mobileOffset, setMobileOffset] = useState(0);

    // Force Password Change State
    const [showForcePwdModal, setShowForcePwdModal] = useState(false);
    const [forcePwdData, setForcePwdData] = useState({ new: '', confirm: '' });

    // Initial check for password change requirement
    useEffect(() => {
        if (currentUser.mustChangePassword) {
            setShowForcePwdModal(true);
        }
    }, [currentUser]);

    // Mobile: Auto refresh data on mount to ensure latest schedule
    useEffect(() => {
        if (window.innerWidth < 768) {
            const refresh = async () => {
                console.log("Mobile detected: Forcing data refresh...");
                await db.initializeData(true);
            };
            refresh();
        }
    }, []);

    const handleForcePasswordSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (forcePwdData.new !== forcePwdData.confirm) {
                alert('新密碼與確認密碼不符');
                return;
            }
            if (forcePwdData.new.length < 4) {
                alert('密碼長度至少需 4 碼');
                return;
            }
            await db.changePassword(currentUser!.id, forcePwdData.new);
            setShowForcePwdModal(false);
            setForcePwdData({ new: '', confirm: '' });
            alert('密碼修改成功！請繼續使用。');
        } catch (err) {
            alert('密碼更新失敗');
        }
    };

    // Subscribe to Store updates to ensure UI reflects data changes
    useEffect(() => {
        const unsubscribe = db.subscribe(() => {
            setAllRadiographers(db.getUsers().filter(u => u.isRadiographer));
            setShifts([...db.getShifts('', '')]);
            setDisplayOrder([...db.getStationDisplayOrder()]);
        });
        return () => unsubscribe();
    }, []);

    const handleSaveMemo = async (date: string, content: string) => {
        try {
            // First, remove any existing radiographer note for this date to avoid duplicates
            await db.removeHolidaysByDateAndType(date, DateEventType.RADIOGRAPHER_NOTE);

            // If content is not empty, add the new note
            if (content.trim()) {
                await db.addHoliday({
                    date,
                    name: content.trim(),
                    type: DateEventType.RADIOGRAPHER_NOTE
                });
            }

            setMemoModal(null);
            showToast('備忘錄已更新', 'success');
        } catch (error) {
            console.error('Save memo error:', error);
            showToast('更新失敗', 'error');
        }
    };

    const handleDeleteMemo = async (date: string) => {
        if (!confirm('確定要刪除此備忘錄嗎？')) return;
        try {
            await db.removeHolidaysByDateAndType(date, DateEventType.RADIOGRAPHER_NOTE);
            setMemoModal(null);
            showToast('備忘錄已刪除', 'success');
        } catch (error) {
            console.error('Delete memo error:', error);
            showToast('刪除失敗', 'error');
        }
    };

    // --- Effects ---
    // Auto-scroll to today in Personal View
    useEffect(() => {
        if (isMobile && viewMode === 'personal') {
            setTimeout(() => {
                const todayEl = document.getElementById('personal-view-today');
                if (todayEl) {
                    todayEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 300); // Slight delay for rendering
        }
    }, [viewMode, isMobile, selectedCycleId]);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 1024);
        window.addEventListener('resize', handleResize);
        window.addEventListener('orientationchange', () => {
             // Delay slightly to let browser update innerWidth
             setTimeout(handleResize, 100);
        });
        handleResize(); // Initial check
        return () => {
             window.removeEventListener('resize', handleResize);
             window.removeEventListener('orientationchange', handleResize);
        };
    }, []);


    // Determine the Date Range
    const dateRange = useMemo(() => {
        // Mobile Personal View: Force Full Cycle (28 Days)
        if (isMobile && viewMode === 'personal') {
            const todayStr = toLocalISOString(new Date());
            // Find cycle covering today if in rolling mode, or use selected
            let targetCycle = currentCycle;
            if (!targetCycle || selectedCycleId === 'rolling') {
                targetCycle = cycles.find(c => todayStr >= c.startDate && todayStr <= c.endDate);
            }

            if (targetCycle) {
                const dates = [];
                const start = new Date(targetCycle.startDate);
                const end = new Date(targetCycle.endDate);
                if (start <= end) {
                    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                        dates.push(toLocalISOString(d));
                    }
                    return dates;
                }
            }
             // Fallback if no cycle found: show +/- 14 days? Or just 28 days from today?
             // Let's fallback to Today + 28 days if no cycle
             const dates = [];
             const start = new Date(currentDate);
             for (let i = 0; i < 28; i++) {
                 const d = new Date(start);
                 d.setDate(start.getDate() + i);
                 dates.push(toLocalISOString(d));
             }
             return dates;
        }

        // Mobile: Force 7-day Rolling View for USER and STATION views
        // Also apply to small tablets/landscape mobile (e.g. up to 1024px)
        const isSmallScreen = window.innerWidth < 1024; 
        if ((isMobile || isSmallScreen) && (viewMode === 'user' || viewMode === 'station' || selectedCycleId === 'rolling')) {
            const dates = [];
            const start = new Date(currentDate);
            // Apply offset: 7 days * offset
            start.setDate(start.getDate() + (mobileOffset * 7));

            for (let i = 0; i < 7; i++) {
                const d = new Date(start);
                d.setDate(start.getDate() + i);
                dates.push(toLocalISOString(d));
            }
            return dates;
        }

        // Desktop Behavior (unchanged)
        if (selectedCycleId !== 'rolling' && currentCycle) {
            const dates = [];
            const start = new Date(currentCycle.startDate);
            const end = new Date(currentCycle.endDate);
            if (start <= end) {
                for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                    dates.push(toLocalISOString(d));
                }
                return dates;
            }
        }

        const dates = [];
        const start = new Date(currentDate);

        // Fallback for Desktop Rolling
        // Align view to start 2 days before current
        const viewStart = new Date(start);
        viewStart.setDate(viewStart.getDate() - 2);

        for (let i = 0; i < 21; i++) {
            const d = new Date(viewStart);
            d.setDate(viewStart.getDate() + i);
            dates.push(toLocalISOString(d));
        }
        return dates;
    }, [currentDate, selectedCycleId, currentCycle, isMobile, mobileOffset, viewMode]);

    // Filter users: Active OR (Inactive but has shift in current view)
    // Also Filter: Part-Time users (Hidden by default, unless they have a shift)
    const users = useMemo(() => {
        return allRadiographers.filter(u => {
             // Check if user has shift in current view
             const hasShift = shifts.some(s => 
                 s.userId === u.id && 
                 dateRange.includes(s.date) &&
                 (
                    (s.station !== StationDefault.UNASSIGNED && s.station !== SYSTEM_OFF) ||
                    (s.specialRoles && s.specialRoles.length > 0)
                 )
             );

             // 1. If Part-Time, only show if has shift
             if (u.isPartTime) return hasShift;

             // 2. If Active (default), always show
             if (u.isActive !== false) return true;
             
             // 3. If Inactive, only show if has shift
             return hasShift;
        });
    }, [allRadiographers, shifts, dateRange]);

    // Auto-assign Remote Doctors logic
    useEffect(() => {
        const shifts = db.getDoctorShifts();
        
        // Check current week shifts
        dateRange.forEach(date => {
            const daysShifts = shifts.filter(s => s.date === date);
            daysShifts.forEach(s => {
                // If scheduled for Remote but currently Unassigned, auto-move to Remote station
                // User requirement: "如果上班醫師裡有崗位在遠班的，直接拉到下面遠班那欄"
                if (s.scheduled_station?.includes('遠') && s.station === '未分配') {
                    // Using setTimeout to prevent state update loops during render phase
                    setTimeout(() => {
                        db.assignDoctor(s.doctorId, s.date, '遠'); // Auto-set to '遠'
                    }, 0);
                }
            });
        });
    }, [db.doctorShifts, dateRange]);

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
        if (match) return match[1] + '年第' + match[2] + ' 週期';
        return currentCycle.name;
    };

    // Export Title Logic
    const getExportHeader = () => {
        const title = getCycleTitle();
        const start = dateRange[0];
        const end = dateRange[dateRange.length - 1];
        const days = dateRange.length;
        return title + ' (' + start + ' ~' + end + ' / 共' + days + '天)';
    };

    const formatName = (name: string) => {
        if (!name) return '';
        return name.length > 2 ? name.slice(-2) : name;
    };

    // --- PDF Export Logic ---
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
        setAllRadiographers(newUsers);

        db.updateUserDisplayOrder(newOrderIds).then(() => {
            setAllRadiographers(db.getUsers().filter(u => u.isRadiographer));
        });
    };

    const handleComplete = async () => {
        if (!isEditMode) return;

        try {
            setIsProcessing(true);
            const start = scheduleRange.start;
            const end = scheduleRange.end;

            // Call the nuclear sync
            // Pass current 'shifts' state to ensure we save exactly what is visible
            const { error } = await db.commitShiftsForRange(start, end, shifts);

            if (error) {
                showToast('儲存失敗，請重試', 'error');
                console.error(error);
            } else {
                showToast('排班已成功儲存！', 'success');
                setIsEditMode(false);
            }
        } catch (e) {
            console.error(e);
            showToast('儲存發生錯誤', 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleExportExcel = async () => {
        setIsExporting(true);
        try {
            const workbook = new ExcelJS.Workbook();
            const today = new Date();
            // const exportDate = today.toLocaleDateString('zh-TW');

            // --- Sheet 1: User View (人員視角) ---
            const userSheet = workbook.addWorksheet('人員視角');

            // Headers
            const userHeaders = ['姓名', ...dateRange.map(d => {
                const date = new Date(d);
                const weekArr = ['日', '一', '二', '三', '四', '五', '六'];
                return `${date.getDate()} (${weekArr[date.getDay()]})`;
            }), '上班天數'];
            
            const userHeaderRow = userSheet.addRow(userHeaders);
            userHeaderRow.eachCell((cell) => {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
                cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
                cell.font = { bold: true };
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
            });

            // Data Rows (User View)
            users.forEach((user, idx) => {
                const rowData: any[] = [user.name];
                let workDaysCount = 0;

                dateRange.forEach(date => {
                    const { station, specialRoles, isOff } = getDayShift(user.id, date);
                    const event = holidays.find(h => h.date === date);
                    const isClosed = event?.type === DateEventType.CLOSED;
                    
                    // Logic from handleExportPDF
                    const hasAssignedStation = station && station !== StationDefault.UNASSIGNED && station !== SYSTEM_OFF && !station.includes('休假');
                    
                    if ((isOff || isClosed) && !hasAssignedStation) {
                         rowData.push('休');
                    } else {
                         // Build content: Station + Roles
                         let cellText = '';
                         if (station && station !== StationDefault.UNASSIGNED) cellText += station;
                         if (specialRoles.length > 0) {
                             const roleMap: Record<string, string> = {
                                 [SPECIAL_ROLES.OPENING]: '開',
                                 [SPECIAL_ROLES.LATE]: '晚',
                                 [SPECIAL_ROLES.ASSIST]: '輔',
                                 [SPECIAL_ROLES.SCHEDULER]: '排',
                                 [SPECIAL_ROLES.DAZHI_SUPPORT]: '支'
                             };
                             const rolesShort = specialRoles.map(r => roleMap[r] || r[0]).join('');
                             // Use Newline for separation
                             cellText += (cellText ? '\n' : '') + rolesShort;
                         }
                         rowData.push(cellText);

                         if (station && station !== StationDefault.UNASSIGNED && station !== SYSTEM_OFF && !station.includes('休假')) {
                             workDaysCount++;
                         }
                    }
                });
                rowData.push(workDaysCount);

                const row = userSheet.addRow(rowData);
                row.eachCell((cell, colNumber) => {
                     cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
                     cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
                     
                     // Styling Logic
                     if (colNumber > 1 && colNumber < userHeaders.length + 1) { // Date Columns
                         const cellValue = cell.value?.toString() || '';
                         
                         if (cellValue === '休') {
                             // White
                         } else {
                            if (cellValue.includes('MR')) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEDD5' } }; 
                            else if (cellValue.includes('US')) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCEFFCE' } };
                            else if (cellValue.includes('CT')) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F9FF' } }; 
                            else if (cellValue.includes('場控')) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF' } }; 
                            else if (cellValue.includes('遠')) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAE8FF' } }; 
                            else if (cellValue.includes('BMD') || cellValue.includes('DX')) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } }; 
                            else if (cellValue.includes('大直')) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDD6FF' } }; 
                            else if (cellValue.includes('技術支援')) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFED97' } };
                            else if (cellValue.includes('行政')) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDF4' } };
                            else if (cellValue.includes('閱片')) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFEFF' } };
                            else if (cellValue.includes('放腫')) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDF2F8' } };
                            else if (cellValue.includes('體檢')) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7ED' } };
                         }
                     }
                });
            });

            // Set Column Widths
            userSheet.columns = [
                { width: 15 }, // Name
                ...dateRange.map(() => ({ width: 10 })), // Dates (Previously auto or standard, now fixed wider for visibility)
                { width: 10 } // Count
            ];

            // --- Sheet 2: Station View (崗位視角) ---
            const stationSheet = workbook.addWorksheet('崗位視角');
            
            // Header
            const stationHeaders = ['崗位', ...dateRange.map(d => {
                const date = new Date(d);
                const weekArr = ['日', '一', '二', '三', '四', '五', '六'];
                return `${date.getDate()} (${weekArr[date.getDay()]})`;
            })];

            const stationHeaderRow = stationSheet.addRow(stationHeaders);
            stationHeaderRow.eachCell((cell) => {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
                cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
                cell.font = { bold: true };
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
            });

            // Data Rows (Station View)
            const stationsToExport = rowConfigs.filter(row =>
                row.label !== StationDefault.UNASSIGNED &&
                row.label !== '未分配' &&
                row.label !== SPECIAL_ROLES.OPENING &&
                row.label !== SPECIAL_ROLES.LATE
            );

            stationsToExport.forEach(rowConfig => {
                const rowData: any[] = [rowConfig.label];
                
                dateRange.forEach(date => {
                    const staff = rowConfig.getData(date);
                    // Sort (Learners last)
                    staff.sort((a, b) => {
                         const isALearner = a.user?.learningCapabilities?.includes(rowConfig.label) || false;
                         const isBLearner = b.user?.learningCapabilities?.includes(rowConfig.label) || false;
                         if (isALearner === isBLearner) return 0;
                         return isALearner ? 1 : -1;
                    });

                    // Build Content: Name + Roles
                    const contentParts = staff.map(s => {
                        let text = formatName(s.user?.name || '');
                        if (s.shift.specialRoles.length > 0) {
                            const roleMap: Record<string, string> = {
                                 [SPECIAL_ROLES.OPENING]: '開機',
                                 [SPECIAL_ROLES.LATE]: '晚班',
                                 [SPECIAL_ROLES.ASSIST]: '輔班',
                                 [SPECIAL_ROLES.SCHEDULER]: '排班',
                            };
                            let roleLabels = s.shift.specialRoles.map(r => roleMap[r] || r);
                            text += `\n(${roleLabels.join(',')})`;
                        }
                        return text;
                    });
                    
                    const cellContent = contentParts.join('\n'); // Stack multiple people
                    rowData.push(cellContent);
                });

                const row = stationSheet.addRow(rowData);
                row.height = 40; 
                row.eachCell((cell, colNumber) => {
                     cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
                     cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

                     if (colNumber === 1) {
                         const label = cell.value?.toString() || '';
                         if (label.includes('MR')) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEDD5' } };
                         else if (label.includes('US')) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCEFFCE' } };
                         else if (label.includes('CT')) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F9FF' } };
                         else if (label.includes('場控')) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF' } };
                         else if (label.includes('遠')) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAE8FF' } };
                         else if (label.includes('BMD') || label.includes('DX')) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
                         else if (label.includes('大直')) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDD6FF' } };
                     }
                });
            });

             // Adjust Column Widths
            stationSheet.columns.forEach((col, index) => {
                if (index === 0) col.width = 15;
                else col.width = 15; 
            });

            // Generate & Download
            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            const cycleTitle = getCycleTitle().replace(/[/\\?%*:|"<>\s]/g, '_');
            link.download = `${cycleTitle}_排班表.xlsx`;
            link.click();
            URL.revokeObjectURL(link.href);

        } catch (error) {
            console.error('Excel Export Error:', error);
            showToast('Excel 匯出失敗', 'error');
        } finally {
            setIsExporting(false);
        }
    };

    const handleExportPDF = async (e?: React.MouseEvent) => {
        if (e) e.preventDefault();
        setIsExporting(true);
        try {
            const doc = new jsPDF('l', 'mm', 'a4');
            let fontName = 'helvetica'; // Default fallback

            // Load Open Huninn font for Chinese support (Lightweight ~4.8MB)
            try {
                // Determine base path explicitly or try potential paths
                const pathsToTry = [
                    '/schedule/fonts/jf-openhuninn-2.1.ttf',
                    '/fonts/jf-openhuninn-2.1.ttf'
                ];

                let response: Response | null = null;

                // Helper to check if response is valid font (not HTML)
                const isValidFontResponse = (res: Response) => {
                    const type = res.headers.get('content-type');
                    // Must be OK and NOT text/html
                    return res.ok && (!type || !type.includes('text/html'));
                };

                for (const path of pathsToTry) {
                    try {
                        const res = await fetch(path);
                        if (isValidFontResponse(res)) {
                            response = res;
                            console.log('Font found at:', path);
                            break;
                        }
                    } catch (e) { /* continue */ }
                }

                if (!response) {
                    throw new Error('Font file not found at any known path');
                }

                const blob = await response.blob();
                const reader = new FileReader();

                await new Promise((resolve, reject) => {
                    reader.onloadend = () => {
                        const base64data = reader.result as string;
                        if (base64data && base64data.includes('base64,')) {
                            const content = base64data.split('base64,')[1];
                            if (content) {
                                doc.addFileToVFS('jf-openhuninn-2.1.ttf', content);
                                doc.addFont('jf-openhuninn-2.1.ttf', 'OpenHuninn', 'normal');
                                doc.addFont('jf-openhuninn-2.1.ttf', 'OpenHuninn', 'bold');
                                doc.addFont('jf-openhuninn-2.1.ttf', 'OpenHuninn', 'italic');
                                doc.setFont('OpenHuninn');
                                fontName = 'OpenHuninn';
                                resolve(true);
                            } else {
                                reject('Invalid font content');
                            }
                        } else {
                            reject('Invalid base64 data');
                        }
                    };
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                });
            } catch (error) {
                console.error('Failed to load font:', error);
                alert('字體載入失敗，將使用預設字體（中文可能會顯示為亂碼）。請確認網路連線或聯繫管理員。');
            }

            const title = `影像醫學部-${viewMode === 'user' ? '人員排班表' : '崗位分配表'} `;
            const subtitle = getExportHeader();
            const fullTitle = `${title}   ${subtitle} `;
            const exportDate = `匯出日期: ${new Date().toLocaleDateString('zh-TW')} `;

            doc.setFontSize(14);
            doc.text(fullTitle, 14, 15);

            doc.setFontSize(9);
            const pageWidth = doc.internal.pageSize.width;
            doc.text(exportDate, pageWidth - 14, 15, { align: 'right' });

            const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

            // Prepare Headers
            const dateHeaders = dateRange.map(date => {
                const d = new Date(date);
                return `${d.getDate()} \n${weekDays[d.getDay()]} `;
            });

            // Add '上班天數' to header for User View
            const headRow = [[viewMode === 'user' ? '姓名' : '崗位', ...dateHeaders]];
            if (viewMode === 'user') {
                headRow[0].push('上班天數');
            }

            // Prepare Body
            let bodyRows: any[] = [];

            const roleColors: Record<string, [number, number, number]> = {
                [SPECIAL_ROLES.OPENING]: [0, 0, 255],    // Blue
                [SPECIAL_ROLES.LATE]: [165, 42, 42],     // Brown
                [SPECIAL_ROLES.ASSIST]: [0, 128, 0],     // Green
                [SPECIAL_ROLES.SCHEDULER]: [255, 20, 147], // Deep Pink (User requested Pink)
            };

            if (viewMode === 'user') {
                bodyRows = users.map(user => {
                    // Column 0: Name (Size 11 handled by columnStyles)
                    const rowData: any[] = [{ content: user.name, styles: { fontStyle: 'bold' } }];
                    let workDaysCount = 0;

                    dateRange.forEach(date => {
                        const { station, specialRoles, isOff } = getDayShift(user.id, date);
                        const event = holidays.find(h => h.date === date);
                        const isClosed = event?.type === DateEventType.CLOSED;

                        // Fix: Check if specific station is assigned. If so, prioritize showing it even if it's a Closed day.
                        const hasAssignedStation = station && station !== StationDefault.UNASSIGNED && station !== SYSTEM_OFF && !station.includes('休假');

                        if ((isOff || isClosed) && !hasAssignedStation) {
                            // Fix: Use simple string content for 'Off' so custom drawer doesn't duplicate it
                            rowData.push('休');
                        } else {
                            let stationText = station && station !== StationDefault.UNASSIGNED ? station : '';
                            // Pass structured data for custom rendering
                            rowData.push({
                                content: '', // Empty content so we can draw manually without overlap
                                station: stationText,
                                roles: specialRoles,
                            });

                            // Calculate Work Days (Not Off, Not Closed, Has Station, Station != SystemOff/Unassigned/Leave)
                            if (station && station !== StationDefault.UNASSIGNED && station !== SYSTEM_OFF && !station.includes('休假')) {
                                workDaysCount++;
                            }
                        }
                    });

                    // Add Work Days Count Column
                    rowData.push({ content: workDaysCount.toString(), styles: { halign: 'center' } });

                    return rowData;
                });
            } else {
                // Station View
                bodyRows = rowConfigs
                    .filter(row =>
                        row.label !== StationDefault.UNASSIGNED &&
                        row.label !== '未分配' &&
                        row.label !== SPECIAL_ROLES.OPENING &&
                        row.label !== SPECIAL_ROLES.LATE
                    )
                    .map(row => {
                        const rowData: any[] = [{ content: row.label, styles: { fontStyle: 'bold' } }];
                        dateRange.forEach(date => {
                            const staff = row.getData(date);

                            // Sort: Learners (user.learningCapabilities includes row.label) go to bottom
                            staff.sort((a, b) => {
                                const isALearner = a.user?.learningCapabilities?.includes(row.label) || false;
                                const isBLearner = b.user?.learningCapabilities?.includes(row.label) || false;

                                if (isALearner === isBLearner) return 0; // Keep existing order if both same status
                                return isALearner ? 1 : -1; // Learner (true) > Non-learner (false) -> Learner goes last
                            });

                            // Construct content
                            const names = staff.map(s => formatName(s.user?.name || '')).filter(n => n).join(' ');

                            // Check for compact rows
                            const isCompactRow = row.label === SPECIAL_ROLES.ASSIST ||
                                row.label === SPECIAL_ROLES.SCHEDULER ||
                                row.label === '輔班' ||
                                row.label === '排班';

                            if (row.label === SYSTEM_OFF || isCompactRow) {
                                // Off rows & Compact rows: Use standard text rendering
                                rowData.push({ content: names });
                            } else {
                                // Standard Rows: Custom Rendering (Name + Role Stacked)
                                // content is empty to suppress default drawing.
                                // We calculate height in didParseCell.
                                rowData.push({
                                    content: '',
                                    staff: staff.map(s => ({
                                        name: formatName(s.user?.name || ''),
                                        roles: s.shift.specialRoles,
                                        isLearner: s.user?.learningCapabilities?.includes(row.label) || false
                                    }))
                                });
                            }
                        });
                        return rowData;
                    });
            }

            console.log('Generating PDF with font:', fontName);


            // Calculate equal column widths for date columns
            // pageWidth is already defined in scope (line 226)
            const margins = 2; // 1mm left + 1mm right
            const nameColWidth = 20;
            const workDaysColWidth = 12; // Width for "上班天數"

            // Adjust available width depending on view mode
            let availableWidth = pageWidth - margins - nameColWidth;
            if (viewMode === 'user') {
                availableWidth -= workDaysColWidth;
            }

            const dateColWidth = availableWidth / dateRange.length;

            // Color Mapping (RGB Tuples)
            const stationPDFStyles: Record<string, { fillColor: [number, number, number], textColor: [number, number, number] }> = {
                'MR': { fillColor: [255, 237, 213], textColor: [124, 45, 18] },         // bg-orange-100 text-orange-900
                'US': { fillColor: [206, 255, 206], textColor: [0, 0, 0] },             // bg-[#CEFFCE] text-black
                'CT': { fillColor: [240, 249, 255], textColor: [7, 89, 133] },         // bg-sky-50 text-sky-800
                '場控': { fillColor: [255, 255, 170], textColor: [127, 29, 29] },      // bg-[#FFFFAA] text-red-900
                '遠班': { fillColor: [250, 232, 255], textColor: [112, 26, 117] },      // bg-fuchsia-100 text-fuchsia-900
                '遠距': { fillColor: [250, 232, 255], textColor: [112, 26, 117] },      // Same as 遠班
                'BMD': { fillColor: [239, 246, 255], textColor: [30, 64, 175] },       // bg-blue-50 text-blue-800
                'DX': { fillColor: [239, 246, 255], textColor: [30, 64, 175] },        // Same as BMD
                '大直': { fillColor: [221, 214, 255], textColor: [91, 33, 182] },       // bg-violet-50 text-violet-800
                '技術支援': { fillColor: [255, 237, 151], textColor: [132, 66, 0] },    // bg-[#FFED97] text-[#844200]
                '行政': { fillColor: [226, 232, 240], textColor: [30, 41, 59] },        // bg-slate-200 text-slate-800
                'SystemOff': { fillColor: [255, 255, 255], textColor: [150, 150, 150] } // White (User Requested)
            };

            // Helper to match station name to style
            const getPDFStyle = (stationName: string) => {
                const key = Object.keys(stationPDFStyles).find(k => stationName.includes(k));
                return key ? stationPDFStyles[key] : null;
            };

            const dynamicColumnStyles: Record<string, any> = {
                0: { cellWidth: nameColWidth, fontSize: 11, fontStyle: 'bold' }
            };

            // Apply calculated width to all date columns (index 1 to N)
            for (let i = 0; i < dateRange.length; i++) {
                dynamicColumnStyles[i + 1] = { cellWidth: dateColWidth };
            }

            // Apply width for Work Days column (Index: dateRange.length + 1) if in user view
            if (viewMode === 'user') {
                dynamicColumnStyles[dateRange.length + 1] = { cellWidth: workDaysColWidth, fontSize: 9, fontStyle: 'bold' };
            }

            // Conditional Styles based on View Mode
            const tableStyles: any = {
                fontSize: 8,
                font: fontName,
                lineColor: [0, 0, 0],
                lineWidth: 0.1,
                textColor: [0, 0, 0],
                valign: 'middle',
            };

            if (viewMode === 'user') {
                // User View: Spacing 1 (Requested)
                tableStyles.cellPadding = 1;
                tableStyles.minCellHeight = 9;
                tableStyles.halign = 'center';
            } else {
                // Station View: Compact, Centered
                tableStyles.minCellHeight = 8;
                tableStyles.halign = 'center'; // User requested: "每個欄位文字都置中"
                tableStyles.cellPadding = 1;
            }

            autoTable(doc, {
                startY: 18,
                head: headRow,
                body: bodyRows,
                theme: 'grid',
                styles: tableStyles,
                headStyles: {
                    fillColor: [240, 240, 240],
                    textColor: [0, 0, 0],
                    fontStyle: 'bold',
                    lineWidth: 0.1,
                    lineColor: [0, 0, 0],
                },
                margin: 1,
                tableLineWidth: 0.1,
                tableLineColor: [0, 0, 0],

                columnStyles: dynamicColumnStyles,
                didParseCell: function (data: any) {
                    // Header Logic (Weekends & Holidays)
                    if (data.section === 'head' && data.column.index > 0) {
                        const dayIndex = (data.column.index - 1);
                        const dateStr = dateRange[dayIndex];
                        const d = new Date(dateStr);
                        const dayOfWeek = d.getDay();

                        // Check for Holiday/Event
                        const event = holidays.find(h => h.date === dateStr);

                        // Default Black
                        data.cell.styles.textColor = [0, 0, 0];

                        // Priority: Meeting (Blue) > Holiday/Sun (Red) > Sat (Green)

                        if (event?.type === DateEventType.MEETING || event?.name.includes('科會')) {
                            data.cell.styles.textColor = [0, 0, 255]; // Blue
                        } else if (dayOfWeek === 0 || event?.type === DateEventType.NATIONAL || event?.type === DateEventType.CLOSED) {
                            data.cell.styles.textColor = [255, 0, 0]; // Red
                        } else if (dayOfWeek === 6) {
                            data.cell.styles.textColor = [0, 128, 0]; // Green
                        }
                    }

                    // User View: Cell Backgrounds
                    if (viewMode === 'user' && data.section === 'body' && data.column.index > 0) {
                        const raw = data.cell.raw;

                        // Handle Off/Closed explicitly (pushed as string '休')
                        if (raw === '休') {
                            data.cell.styles.fillColor = [255, 255, 255]; // White (User Requested)
                        }
                        else if (raw && typeof raw === 'object' && 'station' in raw) {
                            const station = raw.station;
                            if (station) {
                                if (station === SYSTEM_OFF) {
                                    data.cell.styles.fillColor = [255, 255, 255]; // White (User Requested)
                                } else {
                                    const style = getPDFStyle(station);
                                    if (style) {
                                        data.cell.styles.fillColor = style.fillColor;
                                    }
                                }
                            }
                        }
                    }

                    // Row-Specific Styling (Station View)
                    if (viewMode === 'station' && data.section === 'body') {
                        const rawRow = data.row.raw as any[];
                        const rowLabel = rawRow[0]?.content; // First column is label

                        // Apply Row Background Color
                        if (rowLabel) {
                            if (rowLabel === SYSTEM_OFF) {
                                data.cell.styles.fillColor = [255, 255, 255];
                            } else {
                                const style = getPDFStyle(rowLabel);
                                if (style) {
                                    data.cell.styles.fillColor = style.fillColor;
                                }
                            }
                        }

                        // Check for specific rows to shrink
                        const isCompactRow = rowLabel === SPECIAL_ROLES.ASSIST ||
                            rowLabel === SPECIAL_ROLES.SCHEDULER ||
                            rowLabel === '輔班' ||
                            rowLabel === '排班';

                        if (isCompactRow) {
                            data.cell.styles.minCellHeight = 7; // Request: Height 7
                            data.cell.styles.fontSize = 7;      // Request: Font 7
                            // Also ensure column 0 (label) gets this size
                            if (data.column.index === 0) {
                                data.cell.styles.fontSize = 7;
                            }
                        } else if (data.column.index > 0) {
                            // Standard Rows: Custom Height Calculation
                            const cellRaw = data.cell.raw;
                            if (cellRaw && typeof cellRaw === 'object' && 'staff' in cellRaw) {
                                const staff = cellRaw.staff;
                                if (staff && staff.length > 0) {
                                    // Calculate required height based on staff count
                                    // Dynamic: 5.5mm (Name + Role) vs 3.5mm (Name only)
                                    let totalH = 0;
                                    staff.forEach(s => {
                                        totalH += (s.roles.length > 0) ? 5.5 : 3.5;
                                    });

                                    const requiredHeight = totalH + 2; // +2 for padding
                                    if (requiredHeight > data.cell.styles.minCellHeight) {
                                        data.cell.styles.minCellHeight = requiredHeight;
                                    }
                                }
                            }
                        }
                    }
                },
                didDrawCell: function (data: any) {
                    // User View Logic
                    if (data.section === 'body' && data.column.index > 0 && viewMode === 'user') {
                        const raw = data.cell.raw;
                        // Determine if it's our custom object with station/roles
                        if (raw && typeof raw === 'object' && 'station' in raw) {
                            const { station, roles } = raw;

                            // 1. Draw Station (+ Auto-Scale)
                            if (station) {
                                let fontSize = 8;
                                doc.setFontSize(fontSize);

                                // Set specific Text Color
                                let textColor: [number, number, number] = [0, 0, 0];
                                const style = getPDFStyle(station);
                                if (style) {
                                    textColor = style.textColor;
                                }
                                doc.setTextColor(textColor[0], textColor[1], textColor[2]);

                                const cellWidth = data.cell.width;
                                const padding = 1;
                                const availableWidth = cellWidth - padding;
                                let textWidth = doc.getTextWidth(station);

                                while (textWidth > availableWidth && fontSize > 4) {
                                    fontSize -= 0.5;
                                    doc.setFontSize(fontSize);
                                    textWidth = doc.getTextWidth(station);
                                }

                                doc.text(station, data.cell.x + data.cell.width / 2, data.cell.y + data.cell.height / 2 - 1.5, { align: 'center', baseline: 'middle' });
                            }

                            // 2. Draw Roles
                            if (roles && roles.length > 0) {
                                doc.setFontSize(6);
                                let roleText = roles.join(' ');
                                let color: [number, number, number] = [0, 0, 0];
                                if (roles.includes(SPECIAL_ROLES.OPENING)) color = roleColors[SPECIAL_ROLES.OPENING];
                                else if (roles.includes(SPECIAL_ROLES.LATE)) color = roleColors[SPECIAL_ROLES.LATE];
                                else if (roles.includes(SPECIAL_ROLES.ASSIST)) color = roleColors[SPECIAL_ROLES.ASSIST];
                                else if (roles.includes(SPECIAL_ROLES.SCHEDULER)) color = roleColors[SPECIAL_ROLES.SCHEDULER];

                                doc.setTextColor(color[0], color[1], color[2]);
                                doc.text(roleText, data.cell.x + data.cell.width / 2, data.cell.y + data.cell.height / 2 + 2.5, { align: 'center', baseline: 'middle' });
                            }
                        }
                    }

                    // Station View Logic
                    if (data.section === 'body' && data.column.index > 0 && viewMode === 'station') {
                        const rawRow = data.row.raw as any[];
                        const rowLabel = rawRow[0]?.content; // Row Label to identify '大直'

                        const raw = data.cell.raw;
                        if (raw && typeof raw === 'object' && 'staff' in raw) {
                            const staff = raw.staff as { name: string, roles: string[], isLearner: boolean }[];

                            // Note: We only pass 'staff' object for Standard Rows now.
                            // Compact rows and Off rows use string content, so this block won't run for them.

                            if (staff.length > 0) {
                                const baseFontSize = 8;
                                const roleFontSize = 6;
                                const isDazhi = rowLabel === '大直';

                                // Standard Rows: Stacked Content logic

                                // Standard Rows: Stacked Content logic

                                // 1. Calculate Total Height Dynamically
                                let totalBlockHeight = 0;
                                const staffHeights = staff.map(s => {
                                    // If '大直' or no roles, use compact height
                                    const h = (s.roles.length === 0) ? 3.5 : 5.5;
                                    totalBlockHeight += h;
                                    return h;
                                });

                                // 2. Center the Block Vertically
                                let currentY = (data.cell.y + data.cell.height / 2) - (totalBlockHeight / 2);

                                staff.forEach((s, idx) => {
                                    const itemHeight = staffHeights[idx];
                                    const contentCenterY = currentY + (itemHeight / 2);

                                    // 1. Name 
                                    doc.setFontSize(baseFontSize);

                                    // Learner Name Color: #dc6262
                                    if (s.isLearner) {
                                        doc.setTextColor(220, 98, 98);
                                    } else {
                                        doc.setTextColor(0, 0, 0);
                                    }

                                    // If no roles (height 3.5), center name. Else (height 5.5), shift up.
                                    const nameOffset = (s.roles.length === 0) ? 0 : -1;
                                    doc.text(s.name, data.cell.x + data.cell.width / 2, contentCenterY + nameOffset, { align: 'center', baseline: 'middle' });

                                    // 2. Role (Colored)
                                    if (s.roles.length > 0) {
                                        doc.setFontSize(roleFontSize);
                                        // Priority Coloring
                                        let color: [number, number, number] = [0, 0, 0];
                                        if (s.roles.includes(SPECIAL_ROLES.OPENING)) color = roleColors[SPECIAL_ROLES.OPENING];
                                        else if (s.roles.includes(SPECIAL_ROLES.LATE)) color = roleColors[SPECIAL_ROLES.LATE];
                                        else if (s.roles.includes(SPECIAL_ROLES.ASSIST)) color = roleColors[SPECIAL_ROLES.ASSIST];
                                        else if (s.roles.includes(SPECIAL_ROLES.SCHEDULER)) color = roleColors[SPECIAL_ROLES.SCHEDULER];

                                        doc.setTextColor(color[0], color[1], color[2]);

                                        let roleLabel = '';
                                        if (s.roles.includes(SPECIAL_ROLES.OPENING)) roleLabel = '開機';
                                        else if (s.roles.includes(SPECIAL_ROLES.LATE)) roleLabel = '晚班';
                                        else if (s.roles.includes(SPECIAL_ROLES.ASSIST)) roleLabel = '輔班';
                                        else if (s.roles.includes(SPECIAL_ROLES.SCHEDULER)) roleLabel = '排班';

                                        if (!roleLabel) roleLabel = s.roles[0]; // Fallback

                                        doc.text(roleLabel, data.cell.x + data.cell.width / 2, contentCenterY + 1.5, { align: 'center', baseline: 'middle' });
                                    }

                                    // Advance Y
                                    currentY += itemHeight;
                                });
                            }
                        }
                    }
                },
            });

            // Explicit Blob Download to ensure correct filename handling
            const cleanTitle = getCycleTitle().replace(/[/\\?%*:|"<>\s]/g, '_');
            const fileName = `${cleanTitle}_${viewMode === 'user' ? '人員表' : '崗位表'}.pdf`;

            const blob = doc.output('blob');

            if (blob.size === 0) {
                throw new Error('Generated PDF is empty (0 bytes).');
            }

            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error('PDF Generation Error:', e);
            const msg = e instanceof Error ? e.message : String(e);
            alert(`PDF 匯出發生錯誤: ${msg} `);
        } finally {
            setIsExporting(false);
        }
    };

    // --- Performance Optimization: Shift Lookup Map ---
    const shiftMap = useMemo(() => {
        const map = new Map<string, Shift>();
        shifts.forEach(s => {
            map.set(`${s.userId}-${s.date}`, s);
        });
        return map;
    }, [shifts]);

    // --- Data Access Helpers ---
    const getDayShift = (userId: string, dateStr: string) => {
        // Optimized Lookup O(1)
        const override = shiftMap.get(`${userId}-${dateStr}`);

        // If there is an override shift record, TRUST IT.
        // Even if it is Unassigned, it means the user was explicitly set to be here (e.g. Leave Cancelled).
        if (override) {
            return {
                station: override.station === SYSTEM_OFF ? null : override.station,
                specialRoles: override.specialRoles || [],
                isOff: override.station === SYSTEM_OFF
            };
        }

        // No override record: Fallback to calculated status
        const autoStation = db.calculateBaseStatus(dateStr, users.find(u => u.id === userId)?.groupId || '');
        const event = holidays.find(h => h.date === dateStr);
        const isClosed = event?.type === DateEventType.CLOSED;

        if (isClosed) return { station: null, specialRoles: [], isOff: true };
        const user = users.find(u => u.id === userId);
        if (!user) return { station: null, specialRoles: [], isOff: false };
        if (autoStation === SYSTEM_OFF) return { station: null, specialRoles: [], isOff: true };

        // Default: Unassigned work day
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

    const handleUpdateShift = async (userId: string, dateStr: string, station: string, specialRoles: string[]) => {
        // [FIX] Try to find existing shift to preserve ID (UUID)
        // This prevents creating duplicate rows with 'userId-date' IDs if a record already exists
        const key = `${userId}-${dateStr}`;
        const existingShift = shiftMap.get(key);
        const realId = existingShift ? existingShift.id : key;

        const newShift: Shift = {
            id: realId,
            userId,
            date: dateStr,
            station,
            specialRoles,
            isAutoGenerated: false,
            isRoleAutoGenerated: false
        };
        const { error } = await db.upsertShift(newShift);
        if (error) {
            showToast(`儲存失敗: ${error.message}`, 'error');
        } else {
            showToast('已儲存', 'success');
        }
        setShifts([...db.shifts]);
    };

    const onAutoScheduleClick = () => setIsAutoScheduleOpen(true);
    // Special Roles Selection State
    const [specialRolesToSchedule, setSpecialRolesToSchedule] = useState<string[]>([]);

    const onSpecialRoleClick = () => setIsSpecialRoleModalOpen(true);

    const handleSpecialRoleConfirm = async () => {
        console.log('Starting Special Role Auto Schedule...', { range: scheduleRange, roles: specialRolesToSchedule });
        setIsProcessing(true);
        // Wait briefly for UI to update
        await new Promise(r => setTimeout(r, 100));

        try {
            await db.autoAssignSpecialRoles(scheduleRange.start, scheduleRange.end, specialRolesToSchedule);
            setShifts([...db.getShifts('', '')]); // Refresh
            alert('特殊班分配完成！');
        } catch (error) {
            console.error(error);
            alert('分配失敗');
        } finally {
            setIsProcessing(false);
            setIsSpecialRoleModalOpen(false);
        }
    };

    const handleAutoScheduleConfirm = async () => {
        setIsProcessing(true);
        // Await the heavy calculation and DB updates
        await db.autoSchedule(scheduleRange.start, scheduleRange.end);
        // Force update local state from the store
        setShifts([...db.getShifts('', '')]);
        setIsProcessing(false);
        setIsAutoScheduleOpen(false); // Close modal
    };



    const handleToggleCycleConfirm = async () => {
        if (selectedCycleId === 'rolling') return;

        const newStatus = !isCycleConfirmed;
        await db.toggleCycleConfirmation(selectedCycleId, newStatus);
        setShifts([...db.shifts]);
    };

    const handleSpecialRoleToggle = (userId: string, dateStr: string, role: string, currentStation: string, currentRoles: string[]) => {
        let newRoles = [...currentRoles];

        // 0. Validation Constraints
        // Constraint A: Dazhi Support only for Remote
        if (role === SPECIAL_ROLES.DAZHI_SUPPORT) {
            if (!currentStation.includes('遠距') && !currentStation.includes('遠班')) {
                alert('只有遠距班才能選擇「大直支援」');
                return;
            }
        }
        // Constraint B: Dazhi / Floor Control cannot take roles
        if ((currentStation.includes('大直') || currentStation.includes('場控')) && !currentRoles.includes(role)) {
            alert('此崗位(大直/場控)不需選擇特殊任務');
            return;
        }

        // 1. Toggle Selection
        if (newRoles.includes(role)) {
            newRoles = newRoles.filter(r => r !== role);
        } else {
            newRoles.push(role);
        }

        // 2. Enforce Conflicts
        if (newRoles.includes(role)) {
            // New Rule: Opening (開機) and Assist (輔班) CAN Coexist.
            // All other roles are strictly mutually exclusive.

            if (role === SPECIAL_ROLES.OPENING) {
                // Opening allows Assist
                newRoles = newRoles.filter(r => r === SPECIAL_ROLES.OPENING || r === SPECIAL_ROLES.ASSIST);
            } else if (role === SPECIAL_ROLES.ASSIST) {
                // Assist allows Opening
                newRoles = newRoles.filter(r => r === SPECIAL_ROLES.ASSIST || r === SPECIAL_ROLES.OPENING);
            } else {
                // Any other role (Late, Scheduler, etc) -> Clears ALL others
                newRoles = [role];
            }
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
            const isExcluded = user.excludedCapabilities?.includes(station);
            if (station !== SYSTEM_OFF && !isCertified && !isLearning && !isExcluded) return false;
            const status = db.getUserStatusOnDate(user.id, dateStr);
            if (status === 'OFF') return false;
            const shift = shifts.find(s => s.userId === user.id && s.date === dateStr);
            if (shift && shift.station !== StationDefault.UNASSIGNED && shift.station !== '未分配' && shift.station !== station) return false;
            if (shift && shift.station === station) return false;
            return true;
        });
    };



    const getCandidatesForRole = (role: string, dateStr: string) => {
        return users.filter(user => {
            const isCertified = user.capabilities?.includes(role);
            const isLearning = user.learningCapabilities?.includes(role);
            const isExcluded = user.excludedCapabilities?.includes(role);
            if (!isCertified && !isLearning && !isExcluded) return false;
            const status = db.getUserStatusOnDate(user.id, dateStr);
            if (status === 'OFF') return false;
            const shift = shifts.find(s => s.userId === user.id && s.date === dateStr);
            if (shift && shift.specialRoles.includes(role)) return false;
            return true;
        });
    };

    const handleAddUserToStation = (userId: string, dateStr: string, station: string) => {
        // Use db.shifts (Sync State) instead of React state to avoid staleness
        const existingShift = db.shifts.find(s => s.userId === userId && s.date === dateStr);
        let roles = existingShift ? existingShift.specialRoles : [];

        // Clear roles if moving to Dazhi or Floor Control (Strict exclusion)
        if (station.includes('大直') || station.includes('場控')) {
            roles = [];
        }

        handleUpdateShift(userId, dateStr, station, roles);
    };

    const handleRemoveUserFromStation = (userId: string, dateStr: string) => {
        const existingShift = db.shifts.find(s => s.userId === userId && s.date === dateStr);
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
        if (station.includes('US')) return 'bg-[#CEFFCE] text-black border-[#62e062]';
        if (station.includes('CT')) return 'bg-sky-50 text-sky-800 border-sky-300';
        if (station.includes('場控')) return 'bg-[#FFFFAA] text-red-700 border-red-300';
        if (station.includes('遠班') || station.includes('遠距')) return 'bg-fuchsia-50 text-fuchsia-800 border-fuchsia-300';
        if (station.includes('BMD') || station.includes('DX')) return 'bg-blue-50 text-blue-800 border-blue-300';
        if (station.includes('大直')) return 'bg-violet-50 text-violet-800 border-violet-300';
        if (station.includes('技術支援')) return 'bg-[#FFED97] text-[#844200] border-[#EAC100]	';
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
        if (name.includes('US')) return 'bg-[#CEFFCE] text-black border-[#62e062]';
        if (name.includes('CT')) return 'bg-sky-50 text-sky-800 border-sky-300';
        if (name.includes('場控')) return 'bg-[#FFFFAA] text-red-900 border-red-200';
        if (name.includes('遠')) return 'bg-fuchsia-100 text-fuchsia-900 border-fuchsia-200';
        if (name.includes('BMD')) return 'bg-blue-50 text-blue-800 border-blue-300';
        if (name.includes('大直')) return 'bg-violet-50 text-violet-800 border-violet-300';
        if (name.includes('技術支援')) return 'bg-[#FFED97] text-[#844200] border-[#EAC100]';
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
            <div className={`absolute top-0 right-0 w-3 h-3 ${color} rounded-bl text-[8px] flex items-center justify-center text-white font-bold z-10 leading-none`} title={`${type} 申請中`}>
                {label}
            </div>
        );
    };

    const specialRolesList = [
        SPECIAL_ROLES.OPENING,
        SPECIAL_ROLES.LATE,
        SPECIAL_ROLES.ASSIST,
        SPECIAL_ROLES.SCHEDULER,
        SPECIAL_ROLES.DAZHI_SUPPORT
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
            } else if (item.includes('遠距') || item.includes('遠班')) {
                return {
                    id: item,
                    type: 'STATION',
                    label: item,
                    colorClass: 'bg-fuchsia-50 text-fuchsia-800 border-fuchsia-300',
                    getData: (date: string) => getStationStaff(item, date)
                };
            } else {
                let colorClass = 'bg-teal-50 text-teal-800 border-teal-200';
                if (item.includes('MR')) colorClass = 'bg-orange-50 text-orange-800 border-orange-300';
                else if (item.includes('US')) colorClass = 'bg-emerald-50 text-emerald-800 border-emerald-300';
                else if (item.includes('CT')) colorClass = 'bg-sky-50 text-sky-800 border-sky-800';
                else if (item.includes('場控')) colorClass = 'bg-red-50 text-red-700 border-red-300';
                else if (item.includes('遠')) colorClass = 'bg-fuchsia-50 text-fuchsia-800 border-fuchsia-300';
                else if (item.includes('大直')) colorClass = 'bg-violet-50 text-violet-800 border-violet-300';

                return {
                    id: item,
                    type: 'STATION',
                    label: item,
                    colorClass: colorClass,
                    getData: (date: string) => {
                        // Standard Station Staff
                        const staff = getStationStaff(item, date);
                        // If Station is Dazhi, ALSO get Dazhi Support Role staff
                        if (item.includes('大直')) {
                            // Find shifts that have DAZHI_SUPPORT role
                            const supports = shifts
                                .filter(s => s.date === date && s.specialRoles && s.specialRoles.includes(SPECIAL_ROLES.DAZHI_SUPPORT))
                                .map(s => ({ user: users.find(u => u.id === s.userId), shift: s }))
                                .filter(i => i.user !== undefined);

                            // Merge
                            const existingIds = staff.map(s => s.user!.id);
                            supports.forEach(sup => {
                                if (!existingIds.includes(sup.user!.id)) {
                                    staff.push(sup);
                                }
                            });
                        }
                        return staff;
                    }
                };
            }
        });
    }, [displayOrder, shifts]);

    // Optimize role updates as well
    const handleAddUserToRole = (userId: string, dateStr: string, role: string) => {
        // Use db.shifts (Sync)
        const existingShift = db.shifts.find(s => s.userId === userId && s.date === dateStr);
        const station = existingShift ? existingShift.station : StationDefault.UNASSIGNED;
        const currentRoles = existingShift ? existingShift.specialRoles : [];

        // Validation
        if (role === SPECIAL_ROLES.DAZHI_SUPPORT && (!station.includes('遠距') && !station.includes('遠班'))) {
            alert('只有遠距班才能選擇「大直支援」');
            return;
        }
        if ((station.includes('大直') || station.includes('場控'))) {
            alert('此崗位(大直/場控)不需選擇特殊任務');
            return;
        }

        if (!currentRoles.includes(role)) {
            handleUpdateShift(userId, dateStr, station, [...currentRoles, role]);
        }
    };

    const handleRemoveUserFromRole = (userId: string, dateStr: string, role: string) => {
        // Use db.shifts (Sync)
        const existingShift = db.shifts.find(s => s.userId === userId && s.date === dateStr);
        if (existingShift) {
            const newRoles = existingShift.specialRoles.filter(r => r !== role);
            handleUpdateShift(userId, dateStr, existingShift.station, newRoles);
        }
    };
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

            {/* Mobile Floating Action Button (FAB) for Edit/Save */}
            {isMobile && (currentUser.role === UserRole.SUPERVISOR || currentUser.role === UserRole.SYSTEM_ADMIN) && (
                <button
                    onClick={isEditMode ? handleComplete : () => setIsEditMode(true)}
                    disabled={isProcessing}
                    className={`fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all active:scale-95 ${
                        isEditMode 
                        ? 'bg-teal-600 text-white shadow-teal-300' 
                        : 'bg-white text-slate-700 border border-slate-200'
                    } ${isProcessing ? 'opacity-80 cursor-not-allowed' : ''}`}
                >
                     {isProcessing ? (
                        <Loader2 size={24} className="animate-spin" />
                    ) : isEditMode ? (
                        <Check size={28} />
                    ) : (
                        <div className="relative">
                           <Wand2 size={24} />
                           <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-teal-500 rounded-full border-2 border-white"></div>
                        </div>
                    )}
                </button>
            )}

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
                title="自動排班 (特殊任務)"
                message={
                    <div className="space-y-4 text-left">
                        <p className="font-medium text-gray-800">請設定排班條件</p>

                        {/* Date Range Selection (Shared State) */}
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="text-xs text-gray-500 font-bold block mb-1">開始日期</label>
                                <input
                                    type="date"
                                    className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:ring-2 focus:ring-indigo-500 outline-none"
                                    value={scheduleRange.start}
                                    onChange={(e) => setScheduleRange({ ...scheduleRange, start: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 font-bold block mb-1">結束日期</label>
                                <input
                                    type="date"
                                    className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:ring-2 focus:ring-indigo-500 outline-none"
                                    value={scheduleRange.end}
                                    onChange={(e) => setScheduleRange({ ...scheduleRange, end: e.target.value })}
                                />
                            </div>
                        </div>

                        {/* Role Selection */}
                        <div>
                            <label className="text-xs text-gray-500 font-bold block mb-2">選擇要自動分配的任務</label>
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    { id: SPECIAL_ROLES.OPENING, label: '開機', color: 'text-blue-700 bg-blue-50 border-blue-200' },
                                    { id: SPECIAL_ROLES.LATE, label: '晚班', color: 'text-amber-700 bg-amber-50 border-amber-200' },
                                    { id: SPECIAL_ROLES.ASSIST, label: '輔班', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
                                    { id: SPECIAL_ROLES.SCHEDULER, label: '排班', color: 'text-red-700 bg-red-50 border-red-200' },
                                    { id: SPECIAL_ROLES.DAZHI_SUPPORT, label: '大直支援', color: 'text-violet-700 bg-violet-50 border-violet-200' },
                                ].map(role => (
                                    <label key={role.id} className={`flex items-center gap-2 p-2 rounded border cursor-pointer hover: opacity-80 transition-all ${specialRolesToSchedule.includes(role.id) ? role.color + ' ring-1 ring-offset-1' : 'bg-white border-gray-200 text-gray-500'} `}>
                                        <input
                                            type="checkbox"
                                            checked={specialRolesToSchedule.includes(role.id)}
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    setSpecialRolesToSchedule([...specialRolesToSchedule, role.id]);
                                                } else {
                                                    setSpecialRolesToSchedule(specialRolesToSchedule.filter(r => r !== role.id));
                                                }
                                            }}
                                            className="rounded text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <span className="text-sm font-bold">{role.label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div className="bg-purple-50 p-3 rounded text-xs text-purple-800 space-y-1 border border-purple-100">
                            <div className="font-bold mb-1 flex items-center gap-1"><Sparkles size={12} /> 分配原則：</div>
                            <p>1. 優先分配給負責次數較少的人員 (平均分配)。</p>
                            <p>2. 次數相同時，隨機選取 (避免固定順序)。</p>
                            <p>3. 若當日已排其他任務或休假則跳過。</p>
                        </div>

                        {isProcessing && (
                            <div className="flex items-center justify-center gap-2 text-indigo-600 font-bold text-sm">
                                <Loader2 className="animate-spin" size={16} /> 計算中...
                            </div>
                        )}
                    </div>
                }
                confirmText={isProcessing ? "處理中..." : "開始分配"}
                confirmColor="purple"
            />



            {/* --- Optimized A4 Landscape Print Container --- */}
            {/* Width set to 1600px to allow larger text size relative to A4 page when scaled down */}
            <div id="print-container" className="fixed top-0 left-[-9999px] bg-white hidden" style={{ width: '1600px', fontFamily: '"Open Huninn", "Noto Sans TC", sans-serif' }}>
                <div className="flex flex-col items-center mb-4 mt-2">
                    <h1 className="text-3xl font-bold text-gray-900 tracking-wide mb-1">影像醫學部-{viewMode === 'user' ? '人員排班表' : '崗位分配表'}</h1>
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
                                const todayStr = toLocalISOString(new Date());
                                const isPrintToday = date === todayStr;

                                return (
                                    <th key={date} className={`border-[0.5px] border-gray-400 p-1 min-w-[40px] ${isWeekend ? 'bg-red-50 text-gray-900' : 'text-gray-800'} ${isPrintToday ? 'bg-yellow-200 border-b-2 border-red-500' : ''} `}>
                                        <div className="text-[10px] font-medium">{weekDays[d.getDay()]}</div>
                                        <div className={`text-base ${isPrintToday ? 'font-bold text-red-600' : 'font-medium'} `}>{d.getDate()}</div>
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
                                                            <div className={`w-full h-full flex items-center justify-center ${getStationStyle(station).replace('border-teal-200', 'border-gray-300').replace('shadow-sm', '').replace('rounded-md', '')} `}>
                                                            <span className="font-bold text-[10px] sm:text-sm leading-tight text-center whitespace-normal break-words px-0.5">{station}</span>
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
                                            <td key={date} className={`border-[0.5px] border-gray-400 p-0 text-center align-top h-16 ${cellClass} `}>
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
                                                            // Check for Remote Assistance at Dazhi
                                                            const isRemoteAtDazhi = row.label.includes('遠') && s.shift.station === '大直';

                                                            // Determine highlight for special roles inside station view: Text suffix
                                                            let roleSuffix = '';
                                                            if (isOpening) roleSuffix = '(開)';
                                                            if (isLate) roleSuffix = '(晚)';
                                                            if (isRemoteAtDazhi) roleSuffix = '(支援)'; // or (大直)

                                                            // Use minimal styling for export list
                                                            return (
                                                                <div key={i} className={`text-sm text-center leading-tight font-bold text-gray-800 ${isRemoteAtDazhi ? 'text-violet-700' : ''}`}>
                                                                    {name}
                                                                    <span className={`text-[10px] font-normal ml-0.5 ${isRemoteAtDazhi ? 'text-violet-600' : ''}`}>{roleSuffix}</span>
                                                                </div>
                                                            );
                                                        })}
                                                        </div>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))
                                }
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

            {/* Header Area - Compact Redesign */}
            <div className="flex-none bg-white border-b border-slate-200 shadow-sm z-10">
                <div className="flex flex-col xl:flex-row items-center justify-between px-4 py-2 gap-y-2 gap-x-4">
                    
                    {/* LEFT GROUP: Title + View Toggles */}
                    <div className="flex items-center gap-4 w-full xl:w-auto justify-between xl:justify-start">
                        
                        {/* Title (Moved to Far Left) */}
                        <h2 className="text-lg font-bold text-slate-800 tracking-tight flex items-center gap-2 whitespace-nowrap">
                            {!isMobile && getCycleTitle()}
                            {isCycleConfirmed && (
                                <span className="bg-red-50 text-red-600 text-[10px] px-1.5 py-0.5 rounded border border-red-100 flex items-center gap-1">
                                    <Lock size={10} /> {!isMobile && '已鎖定'}
                                </span>
                            )}
                        </h2>

                        {/* View Toggles (Restored here) */}
                        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                            <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 shrink-0">
                                    <button
                                    type="button"
                                    onClick={() => setViewMode('user')}
                                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold transition-all ${viewMode === 'user' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    {!isMobile && <Users size={14} />} <span>{isMobile ? '人員' : '人員視角'}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setViewMode('station')}
                                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold transition-all ${viewMode === 'station' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    {!isMobile && <LayoutList size={14} />} <span>{isMobile ? '崗位' : '崗位視角'}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setViewMode('daily');
                                        setDailyDate(new Date());
                                        if (isMobile) db.initializeData(true);
                                    }}
                                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold transition-all ${viewMode === 'daily' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    {!isMobile && <Activity size={14} />} <span>{isMobile ? '今日' : '今日崗位'}</span>
                                </button>
                                {isMobile && (
                                    <button
                                        type="button"
                                        onClick={() => setViewMode('personal')}
                                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold transition-all ${viewMode === 'personal' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                    >
                                        <span>個人</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>


                    {/* RIGHT GROUP: Date Navigation + Action Buttons */}
                    <div className="flex items-center gap-4 w-full xl:w-auto justify-between xl:justify-end">
                        
                        {/* Date Navigation */}
                            <div className="flex items-center gap-2">
                            {/* Mobile Nav */}
                            {isMobile && (selectedCycleId === 'rolling' || viewMode === 'user' || viewMode === 'station') && (
                                <button type="button" onClick={() => setMobileOffset(prev => prev - 1)} className="p-1 bg-white rounded shadow-sm text-slate-600 border border-slate-200 active:scale-95">
                                    <ChevronLeft size={16} />
                                </button>
                            )}

                                {/* Cycle Selector */}
                            {(!isMobile || viewMode === 'personal') && (
                                <div className={`flex items-center bg-slate-50 hover:bg-slate-100 rounded-md px-2 py-1 transition-colors border border-slate-200 ${isMobile ? 'max-w-[140px]' : ''}`}>
                                    <select
                                        value={selectedCycleId}
                                        onChange={(e) => setSelectedCycleId(e.target.value)}
                                        className={`text-xs bg-transparent border-none focus:ring-0 text-slate-700 font-bold cursor-pointer py-0 pl-0 ${isMobile ? 'pr-6 w-full' : 'pr-6'}`}
                                    >
                                        <option value="rolling">連續排班</option>
                                        {cycles.map(c => (
                                            <option key={c.id} value={c.id}>{c.name} {c.isConfirmed ? '(🔒)' : ''}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* Mobile Title View */}
                            {isMobile && (viewMode === 'user' || viewMode === 'station') && (
                                <span className="text-xs font-bold text-slate-700 min-w-[80px] text-center">
                                    {dateRange[0].substring(5)} ~ {dateRange[dateRange.length - 1].substring(5)}
                                </span>
                            )}

                                {/* Mobile Right Nav */}
                            {isMobile && (selectedCycleId === 'rolling' || viewMode === 'user' || viewMode === 'station') && (
                                <button type="button" onClick={() => setMobileOffset(prev => prev + 1)} className="p-1 bg-white rounded shadow-sm text-slate-600 border border-slate-200 active:scale-95">
                                    <ChevronRight size={16} />
                                </button>
                            )}

                            {/* Desktop Rolling Nav */}
                            {!isMobile && selectedCycleId === 'rolling' && (
                                <div className="flex items-center bg-white rounded-md border border-slate-200 p-0.5 shadow-sm gap-1">
                                    <button type="button" onClick={() => handleNavigate('prev')} className="p-1 hover:bg-slate-50 rounded text-slate-500">
                                        <ChevronLeft size={14} />
                                    </button>
                                    <div className="relative group px-2 text-xs font-bold text-slate-700 cursor-pointer hover:text-slate-900 flex items-center gap-1">
                                        {currentDate.toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })} 起
                                            <ChevronDown size={10} className="text-slate-400" />
                                        <input type="date" className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10" onChange={handleDateJump} />
                                    </div>
                                    <button type="button" onClick={() => handleNavigate('next')} className="p-1 hover:bg-slate-50 rounded text-slate-500">
                                        <ChevronRight size={14} />
                                    </button>
                                </div>
                            )}
                                
                                {/* Desktop Date Range Display */}
                            {!isMobile && selectedCycleId !== 'rolling' && (
                                <div className="flex items-center gap-1.5 px-2 py-1 bg-indigo-50 text-indigo-700 rounded-md text-xs font-bold border border-indigo-100">
                                    <CalendarIcon size={12} />
                                    {cycles.find(c => c.id === selectedCycleId)?.startDate} ~ {cycles.find(c => c.id === selectedCycleId)?.endDate}
                                </div>
                            )}
                        </div>

                            {/* Action Buttons (Moved Here) */}
                        <div className="flex items-center gap-2 shrink-0">
                            {/* Lock Button */}
                                {!isMobile && (currentUser.role === UserRole.SUPERVISOR || currentUser.role === UserRole.SYSTEM_ADMIN) && selectedCycleId !== 'rolling' && (
                                <button
                                    type="button"
                                    onClick={() => setIsConfirmCycleOpen(true)}
                                    disabled={isCycleConfirmed && currentUser.role !== UserRole.SYSTEM_ADMIN}
                                    className={`px-2.5 py-1 rounded-md text-xs font-bold border flex items-center gap-1.5 shadow-sm transition-all ${isCycleConfirmed
                                        ? (currentUser.role === UserRole.SYSTEM_ADMIN ? 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200' : 'bg-gray-50 text-gray-400 border-gray-100 cursor-not-allowed')
                                        : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                        } `}
                                    title={isCycleConfirmed ? "排班已鎖定" : "確認並鎖定排班"}
                                >
                                    {isCycleConfirmed ? <Lock size={12} /> : <CheckCircle size={12} />}
                                    <span className="hidden lg:inline">{isCycleConfirmed ? '已鎖定' : '確認'}</span>
                                </button>
                            )}

                                {/* Exports */}
                                {!isMobile && (
                                <button onClick={handleExportExcel} disabled={isExporting} className="px-2.5 py-1 rounded-md text-xs font-bold border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50">
                                        {isExporting ? <Loader2 size={12} className="animate-spin" /> : <FileSpreadsheet size={12} />}
                                    <span className="hidden xl:inline">Excel</span>
                                </button>
                            )}
                            {!isMobile && (
                                <button onClick={handleExportPDF} disabled={isExporting} className="px-2.5 py-1 rounded-md text-xs font-bold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 shadow-sm transition-all">
                                    <Download size={12} />
                                    <span className="hidden xl:inline">PDF</span>
                                </button>
                            )}
                            
                            {/* Auto Schedule Buttons */}
                            {(currentUser.role === UserRole.SUPERVISOR || currentUser.role === UserRole.SYSTEM_ADMIN) && !isMobile && (
                                <>
                                        <button
                                        type="button"
                                        onClick={onAutoScheduleClick}
                                        disabled={isProcessing || isCycleConfirmed}
                                        className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm ${(isProcessing || isCycleConfirmed)
                                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
                                            : 'bg-gradient-to-r from-purple-600 to-purple-500 text-white hover:from-purple-700 hover:to-purple-600 shadow-purple-200'
                                            } `}
                                    >
                                        <Wand2 size={12} /> <span className="hidden lg:inline">自動</span>
                                    </button>
                                        <button
                                        onClick={onSpecialRoleClick}
                                        disabled={isProcessing || isCycleConfirmed}
                                        className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm ${(isProcessing || isCycleConfirmed)
                                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
                                            : 'bg-white text-purple-700 border border-purple-200 hover:bg-purple-50'
                                            } `}
                                    >
                                        <Sparkles size={12} /> <span className="hidden lg:inline">特殊</span>
                                    </button>
                                </>
                            )}

                                {/* Edit Button */}
                            {!isMobile && (
                                <button
                                    type="button"
                                    onClick={isEditMode ? handleComplete : () => setIsEditMode(true)}
                                    disabled={isProcessing}
                                    className={`px-2.5 py-1 rounded-md text-xs font-bold border transition-all ${isEditMode
                                        ? 'bg-teal-600 text-white border-teal-600 shadow-sm shadow-teal-200 hover:bg-teal-700'
                                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                                        } ${(isProcessing) ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                    {isProcessing ? (
                                        <Loader2 size={12} className="animate-spin" />
                                    ) : (
                                        isEditMode ? '完成' : '編輯'
                                    )}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* ... (Rest of the table UI) ... */}
            <div className="flex-1 overflow-auto bg-slate-50 p-4">
                {viewMode === 'daily' ? (
                    // --- Daily View Implementation ---
                    <div className="max-w-4xl mx-auto space-y-6">
                        {/* Daily Controls */}
                        <div className="sticky top-0 z-30 bg-white rounded-xl shadow-md border border-slate-200 p-4 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <button
                                    type="button"
                                    onClick={() => {
                                        const d = new Date(dailyDate);
                                        d.setDate(d.getDate() - 1);
                                        setDailyDate(d);
                                    }}
                                    className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors"
                                >
                                    <ChevronLeft size={20} />
                                </button>
                                <div className="text-center">
                                    <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 justify-center">
                                        <CalendarIcon size={18} className="text-teal-600" />
                                        {dailyDate.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' })}
                                        <span className="text-sm font-normal text-slate-500">
                                            ({['日', '一', '二', '三', '四', '五', '六'][dailyDate.getDay()]})
                                        </span>
                                    </h2>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const d = new Date(dailyDate);
                                        d.setDate(d.getDate() + 1);
                                        setDailyDate(d);
                                    }}
                                    className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors"
                                >
                                    <ChevronRight size={20} />
                                </button>
                            </div>

                            <button
                                type="button"
                                onClick={() => setDailyDate(new Date())}
                                className="px-3 py-1.5 text-sm bg-teal-50 text-teal-700 font-bold rounded-lg border border-teal-100 hover:bg-teal-100 transition-colors"
                            >
                                回到今天
                            </button>
                        </div>

                        {/* My Assignment Card */}
                        <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg p-6 text-white relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl"></div>
                            <h3 className="text-indigo-100 font-medium text-sm mb-4 flex items-center gap-2">
                                <Activity size={16} /> 我的今日任務
                            </h3>


                            {(() => {
                                const dateStr = toLocalISOString(dailyDate);
                                const myShift = getDayShift(currentUser.id, dateStr);
                                const event = holidays.find(h => h.date === dateStr);
                                const isClosed = event?.type === DateEventType.CLOSED;

                                if (myShift.isOff || isClosed) {
                                    return (
                                        <div className="flex flex-col items-center py-6">
                                            <div className="text-4xl font-bold mb-2">休假</div>
                                            <p className="text-indigo-100 opacity-80">好好休息，充電再出發！</p>
                                        </div>
                                    );
                                }

                                return (
                                    <div className="flex items-center justify-between">
                                        <div>
                                            {myShift.station ? (
                                                <div className="text-5xl font-bold mb-2 tracking-tight">{myShift.station}</div>
                                            ) : (
                                                <div className="text-3xl font-bold mb-2 opacity-50">未分配崗位</div>
                                            )}

                                            <div className="flex gap-2 mt-3">
                                                {myShift.specialRoles.map(role => (
                                                    <span key={role} className="px-2 py-1 bg-white/20 backdrop-blur-sm rounded-lg text-sm font-bold border border-white/10">
                                                        {role}
                                                    </span>
                                                ))}
                                                {(!myShift.station && myShift.specialRoles.length === 0) && (
                                                    <span className="text-indigo-200 text-sm">暫無特殊任務</span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="bg-white/10 p-4 rounded-full backdrop-blur-sm">
                                            <Briefcase size={40} className="text-indigo-100" />
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>

                        {/* All Staff Status Grid */}
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                    <Users size={18} className="text-slate-500" /> 全員崗位概況
                                </h3>
                            </div>

                            {/* Main/Assistant Shift Display */}


                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
                                {(() => {
                                    // Station-based grouping logic
                                    const dateStr = toLocalISOString(dailyDate);

                                    // Define requested order
                                    const stationOrder = [
                                        '遠距', '場控', '輔班', '排班',
                                        StationDefault.MR3T, StationDefault.MR1_5T,
                                        StationDefault.US1, StationDefault.US2, StationDefault.US3, StationDefault.US4,
                                        StationDefault.CT, StationDefault.BMD_DX,
                                        '技術支援', '行政', '大直'
                                    ];

                                    // Helper function to get assignments
                                    const getAssignmentsForStation = (stationName: string) => {
                                        return users.filter(u => {
                                            const s = getDayShift(u.id, dateStr);
                                            // Check Roles First (since they are treated like stations in the request)
                                            if (stationName === '遠距' && s.station?.includes('遠')) return true;
                                            if (stationName === '場控' && s.station?.includes('場控')) return true;
                                            if (stationName === '輔班' && s.specialRoles.includes(SPECIAL_ROLES.ASSIST)) return true;
                                            if (stationName === '排班' && s.specialRoles.includes(SPECIAL_ROLES.SCHEDULER)) return true;

                                            // [Dual Display] If looking for '大直', include 'Remote + Dazhi Support'
                                            if (stationName === '大直') {
                                                const isRemote = s.station?.includes('遠');
                                                const hasSupport = s.specialRoles.includes(SPECIAL_ROLES.DAZHI_SUPPORT);
                                                if (isRemote && hasSupport) return true;
                                            }

                                            // Then Check Exact Station Match
                                            return s.station === stationName;
                                        });
                                    };

                                    const processedStations = new Set<string>();
                                    const cards: React.ReactNode[] = [];

                                    stationOrder.forEach(st => {
                                        processedStations.add(st);
                                        const assignedUsers = getAssignmentsForStation(st);

                                        if (assignedUsers.length > 0) {
                                            cards.push(
                                                <div key={st} className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                                                    <div className={`text-sm font-bold mb-2 flex items-center justify-between ${getStationChipStyle(st)} px-2 py-1 rounded`}>
                                                        {st}
                                                        <span className="text-xs opacity-70 bg-white/30 px-1.5 rounded-full">{assignedUsers.length}</span>
                                                    </div>
                                                    <div className="flex flex-wrap gap-2">
                                                        {assignedUsers.map(u => {
                                                            const s = getDayShift(u.id, dateStr);
                                                            const isSelf = u.id === currentUser.id;
                                                            return (
                                                                <div key={u.id} className={`flex items-center gap-2 bg-white px-2 py-1.5 rounded border shadow-sm ${isSelf ? 'border-teal-200 bg-teal-50' : 'border-slate-100'} `}>
                                                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${u.color || 'bg-slate-400'} `}>
                                                                        {u.alias || u.name[0]}
                                                                    </div>
                                                                    <div className="text-base font-medium text-slate-700">
                                                                        {u.name} {s.specialRoles.filter(r => r !== '輔班' && r !== '排班').map(r => <span key={r} className="text-[10px] text-teal-600 ml-1">({r})</span>)}
                                                                    </div>
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        }
                                    });

                                    // Handle Unassigned / Others if needed? Or just focus on the Station list.
                                    // User mainly asked for "All Staff Status... arranged by station". 
                                    // Usually it's good to show unassigned too, but let's stick to the requested structure first.

                                    return cards;
                                })()}
                            </div>

                            {/* Daily Manpower Summary (Admin/Supervisor Only) */}
                            <DailyManpowerSummary
                                date={toLocalISOString(dailyDate)}
                                users={users}
                                shifts={shifts}
                                currentUser={currentUser}
                            />

                            {/* Off Staff Summary */}
                            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 flex flex-wrap gap-2 items-center">
                                <span className="font-bold">今日休假:</span>
                                {users.filter(u => getDayShift(u.id, toLocalISOString(dailyDate)).isOff).map(u => (
                                    <span key={u.id} className="bg-white border border-slate-200 px-1.5 py-0.5 rounded text-slate-400">
                                        {u.name}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : viewMode === 'personal' ? (
                    <div className="max-w-md mx-auto space-y-3 pb-8">
                        {/* Summary Card */}
                        <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm flex items-center justify-between mb-2">
                            <div>
                                <div className="text-xs text-slate-500 font-bold mb-1">本週期工作天數</div>
                                <div className="text-2xl font-bold text-slate-800">
                                    {dateRange.filter(date => !getDayShift(currentUser.id, date).isOff).length}
                                    <span className="text-sm font-normal text-slate-400 ml-1">天</span>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-[10px] text-slate-400 font-medium bg-slate-50 px-2 py-1 rounded border border-slate-100">
                                    {dateRange.length > 7 ? '完整週期' : '連續週檢視'}
                                </div>
                            </div>
                        </div>

                        {dateRange.map(date => {
                            const d = new Date(date);
                            const isToday = toLocalISOString(new Date()) === date;
                            const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
                            const weekDay = weekDays[d.getDay()];
                            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                            const event = holidays.find(h => h.date === date);

                            const { station, specialRoles, isOff } = getDayShift(currentUser.id, date);
                            const pendingReq = getPendingRequest(currentUser.id, date);

                            const isPast = date < toLocalISOString(new Date());

                            return (
                                <div
                                    key={date}
                                    id={isToday ? 'personal-view-today' : undefined}
                                    className={`bg-white rounded-lg shadow-sm border p-3 flex items-center gap-4 ${isToday ? 'border-teal-500 ring-1 ring-teal-500' : 'border-slate-200'} ${isOff ? 'bg-slate-50' : ''} ${isPast && !isToday ? 'opacity-50 grayscale-[0.5]' : ''}`}
                                >
                                    {/* Date Column */}
                                    <div className="flex flex-col items-center min-w-[3.5rem] border-r border-slate-100 pr-4">
                                        <span className={`text-xs font-bold ${isWeekend || event ? 'text-red-500' : 'text-slate-500'}`}>
                                            {weekDay}
                                        </span>
                                        <span className={`text-2xl font-bold leading-none ${isToday ? 'text-teal-600' : 'text-slate-800'}`}>
                                            {d.getDate()}
                                        </span>
                                        {event && (
                                            <span className="text-[9px] mt-1 bg-red-50 text-red-600 px-1 rounded border border-red-100 whitespace-nowrap overflow-hidden max-w-[3rem] text-ellipsis">
                                                {event.name}
                                            </span>
                                        )}
                                    </div>

                                    {/* Content Column */}
                                    <div className="flex-1 flex flex-col justify-center">
                                        {pendingReq && <div className="mb-2">{getLeaveBadge(pendingReq.type)}</div>}

                                        {isOff ? (
                                            <div className="text-slate-400 font-bold text-lg flex items-center gap-2">
                                                <div className="w-2.5 h-2.5 rounded-full bg-slate-300"></div> 休假
                                            </div>
                                        ) : (
                                            <div className="flex flex-col gap-1.5">
                                                {station && station !== StationDefault.UNASSIGNED ? (
                                                    <div className={`text-lg font-bold text-slate-800 flex items-center gap-2`}>
                                                        <div className={`w-2.5 h-2.5 rounded-full ${station === '行政' ? 'bg-slate-400' : 'bg-teal-500'}`}></div>
                                                        {station}
                                                        {station && currentUser.learningCapabilities?.includes(station) && (
                                                            <span className="text-[10px] bg-sky-100 text-sky-700 font-bold px-1 rounded">學</span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="text-slate-400 italic text-sm">未分配崗位</div>
                                                )}

                                                {specialRoles.length > 0 && (
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {specialRoles.map(role => (
                                                            <span key={role} className={`px-2 py-0.5 rounded text-xs font-bold border flex items-center gap-1 ${role === SPECIAL_ROLES.OPENING ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                                                role === SPECIAL_ROLES.LATE ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                                    role === SPECIAL_ROLES.ASSIST ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                                                        'bg-purple-50 text-purple-700 border-purple-200'
                                                                }`}>
                                                                {role}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}

                        <div className="text-center pt-4 text-xs text-slate-400 pb-12">
                            - 僅顯示當前範圍 -
                        </div>
                    </div>
                ) : (
                    <div id="roster-table" className="h-full bg-white overflow-auto p-2">
                        {/* ... Table Content ... */}
                        <table className="w-full border-collapse bg-white table-fixed">
                            {/* ... Table Header ... */}
                            <thead className="sticky top-0 z-20 shadow-sm">
                                <tr>
                                    {/* Left Sticky Header */}
                                    <th className={`sticky left-0 z-30 bg-slate-50 / 95 backdrop-blur border-b border-r border-slate-200 shadow-[4px_0_8px_rgba(0, 0, 0, 0.02)] ${isMobile ? (viewMode === 'user' ? 'p-1 w-[50px] min-w-[50px]' : 'p-1 w-[85px] min-w-[85px]') : 'p-2 w-[120px] text-left'} `}>
                                        <div className={`flex items-center font-bold text-xs text-slate-600 ${isMobile ? 'justify-center' : 'gap-2'} `}>
                                            <UserIcon size={14} className="text-teal-600" />
                                            {!isMobile && (viewMode === 'user' ? '放射師' : '工作崗位')}
                                        </div>
                                    </th>
                                    {viewMode === 'user' && (
                                        <th className={`sticky z-30 bg-slate-50 / 95 backdrop-blur border-b border-r border-slate-200 p-0 w-[50px] shadow-[4px_0_8px_rgba(0, 0, 0, 0.02)] ${isMobile ? 'left-[50px]' : 'left-[120px]'} `}>
                                            <div className="p-2 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider flex flex-col items-center">
                                                <BarChart2 size={12} className="mb-0.5 text-teal-600" />
                                                {!isMobile && '統計'}
                                            </div>
                                        </th>
                                    )}
                                    {dateRange.map(date => {
                                        const d = new Date(date);
                                        const isToday = toLocalISOString(new Date()) === date;
                                        const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
                                        const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                                        const dailyEvents = holidays.filter(h => h.date === date);
                                        const systemEvents = dailyEvents.filter(e => e.type !== DateEventType.RADIOGRAPHER_NOTE);
                                        const radioMemo = dailyEvents.find(e => e.type === DateEventType.RADIOGRAPHER_NOTE);
                                        const isClosed = systemEvents.some(e => e.type === DateEventType.CLOSED);

                                        return (
                                            <th 
                                                key={date} 
                                                className={`border-b border-slate-200 py-1.5 min-w-[52px] text-center cursor-pointer hover:bg-slate-50 transition-colors relative ${isToday ? 'bg-teal-50/50' : (isClosed ? 'bg-slate-100' : 'bg-white')} `}
                                                onMouseEnter={() => setHoveredDate(date)}
                                                onMouseLeave={() => setHoveredDate(null)}
                                                onClick={() => {
                                                    if (currentUser.role === UserRole.SYSTEM_ADMIN || currentUser.role === UserRole.SUPERVISOR || currentUser.role === UserRole.SCHEDULER) {
                                                        setMemoModal({ date, content: radioMemo?.name || '' });
                                                    }
                                                }}
                                            >
                                                {/* Tooltip */}
                                                {(systemEvents.length > 0 || radioMemo) && hoveredDate === date && (
                                                    <div className="absolute top-[80%] left-1/2 -translate-x-1/2 mt-1 w-56 bg-white rounded-xl shadow-2xl border border-slate-200 p-3 z-[100] animate-in fade-in zoom-in duration-150 pointer-events-none">
                                                        <div className="flex flex-col gap-2 text-left">
                                                            {systemEvents.map((event, idx) => (
                                                                <div key={idx} className="flex items-start gap-2.5">
                                                                    <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                                                                        <span className="text-[10px]">🚩</span>
                                                                    </div>
                                                                    <div className="flex flex-col">
                                                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">全院事件</span>
                                                                        <span className="text-xs font-bold text-slate-700">{event.name}</span>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                            {radioMemo && (
                                                                <div className={`flex items-start gap-2.5 ${systemEvents.length > 0 ? 'pt-2 border-t border-slate-100' : ''}`}>
                                                                    <div className="w-5 h-5 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
                                                                        <span className="text-[10px]">📝</span>
                                                                    </div>
                                                                    <div className="flex flex-col">
                                                                        <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider">放射師備忘</span>
                                                                        <span className="text-xs font-bold text-slate-700">{radioMemo.name}</span>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                        {/* Arrow */}
                                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 -mb-1 border-8 border-transparent border-b-white"></div>
                                                    </div>
                                                )}

                                                <div className="flex flex-col items-center gap-0.5">
                                                    <span className={`text-[10px] font-bold ${isToday ? 'text-teal-700' : (isWeekend ? 'text-red-500' : 'text-slate-400')} `}>
                                                        {weekDays[d.getDay()]}
                                                    </span>
                                                    <span className={`text-sm font-bold leading-none ${systemEvents.length > 0 ? (systemEvents[0].type === DateEventType.NOTE ? 'text-blue-600' : 'text-red-600') : (isToday ? 'text-teal-800' : 'text-slate-800')} `}>
                                                        {d.getDate()}
                                                    </span>
                                                    
                                                    {/* Event Display Container */}
                                                    <div className="flex flex-col gap-0.5 mt-0.5 w-full items-center px-1">
                                                        {systemEvents.map((event, idx) => (
                                                            <span key={idx} className={`text-[9px] px-1 rounded-sm leading-tight w-full truncate border ${event.type === DateEventType.NOTE ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-red-100 text-red-700 border-red-200'}`}>
                                                                {event.name}
                                                            </span>
                                                        ))}
                                                        {radioMemo && (
                                                            <span className="text-[9px] px-1 rounded-sm leading-tight w-full truncate bg-purple-100 text-purple-700 border border-purple-200">
                                                                📝 {radioMemo.name}
                                                            </span>
                                                        )}
                                                        {radioMemo === undefined && systemEvents.length === 0 && (
                                                            <div className="h-[12px]"></div>
                                                        )}
                                                    </div>
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
                                            user.excludedCapabilities?.includes(s) ||
                                            s === StationDefault.UNASSIGNED ||
                                            s === StationDefault.UNASSIGNED ||
                                            s === '未分配'
                                        );
                                        return (
                                            <tr key={user.id} className="group hover:bg-slate-50/50 transition-colors">
                                                <td className={`sticky left-0 z-10 bg-white group-hover: bg-slate-50 border-r border-slate-200 shadow-[4px_0_8px_rgba(0, 0, 0, 0.02)] ${isMobile ? 'p-1 w-[50px] min-w-[50px]' : 'p-2'} `}>
                                                    <div className={`flex items-center ${isMobile ? 'justify-center' : 'gap-2'} `}>
                                                        {/* Edit Buttons (Up/Down) */}
                                                        {isEditMode && !isMobile && (
                                                            <div className="flex flex-col gap-0.5">
                                                                <button
                                                                    type="button"
                                                                    disabled={isFirst}
                                                                    onClick={() => handleMoveUser(idx, 'up')}
                                                                    className={`p-0.5 rounded ${isFirst ? 'text-gray-200' : 'text-gray-400 hover:text-teal-600 hover:bg-gray-100'} `}
                                                                >
                                                                    <ChevronUp size={12} />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    disabled={isLast}
                                                                    onClick={() => handleMoveUser(idx, 'down')}
                                                                    className={`p-0.5 rounded ${isLast ? 'text-gray-200' : 'text-gray-400 hover:text-teal-600 hover:bg-gray-100'} `}
                                                                >
                                                                    <ChevronDown size={12} />
                                                                </button>
                                                            </div>
                                                        )}

                                                        {/* Avatar-Hide on Mobile */}
                                                        {!isMobile && (
                                                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-sm flex-shrink-0 ring-2 ring-white" style={{ backgroundColor: user.color || '#9CA3AF' }}>
                                                                {user.alias || user.name.charAt(0)}
                                                            </div>
                                                        )}

                                                        {/* Name / Alias Display */}
                                                        <div className="min-w-0">
                                                            <div
                                                                className={`font-bold truncate leading-tight ${isMobile ? 'text-center text-sm' : 'text-xs text-slate-800'} `}
                                                                style={isMobile && user.color ? { color: user.color } : {}}
                                                            >
                                                                {isMobile ? (user.alias || user.name.charAt(0)) : user.name}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                {/* Sticky Count Column-Adjust Offset for Mobile */}
                                                <td className={`sticky z-10 bg-white group-hover: bg-slate-50 border-r border-slate-200 p-0 text-center shadow-[4px_0_8px_rgba(0, 0, 0, 0.02)] ${isMobile ? 'left-[50px]' : 'left-[120px]'} `}>
                                                    <div className="text-[10px] font-bold text-slate-600 bg-slate-100 mx-1.5 py-0.5 rounded border border-slate-200">
                                                        {workDaysCount}
                                                    </div>
                                                </td>
                                                {dateRange.map(date => {
                                                    const { station, specialRoles, isOff } = getDayShift(user.id, date);
                                                    const isToday = toLocalISOString(new Date()) === date;
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
                                                                        <button type="button" onClick={() => handleUpdateShift(user.id, date, '未分配', [])} className="text-[10px] text-teal-600 hover:text-white hover:bg-teal-500 bg-white border border-teal-200 px-1.5 rounded shadow-sm transition-all">+</button>
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
                                                                            <div className={`flex items-center justify-center px-1 py-1 rounded-md shadow-sm border w-full max-w-[50px] ${getStationStyle(station)} `}>
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
                                                                                    <button key={role} type="button" onClick={() => handleSpecialRoleToggle(user.id, date, role, station || StationDefault.UNASSIGNED, specialRoles)} className={`px-1 py-0.5 text-[9px] rounded border transition-all font-bold ${isSelected ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-slate-400 border-slate-200 hover:border-purple-300 hover:text-purple-500'} `}>{role[0]}</button>
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
                                                                                        } `}>
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
                                                    <td className={`sticky left-0 z-10 bg-white group-hover: bg-slate-50 border-r border-slate-200 shadow-[4px_0_8px_rgba(0, 0, 0, 0.02)] ${isMobile ? 'p-1 w-[85px] min-w-[85px]' : 'p-2'} `}>
                                                        <div className="flex items-center justify-between">
                                                            <div className={`flex items-center gap-1.5 font-bold ${isMobile ? 'text-sm' : 'text-xs'} px-2 py-1.5 rounded-md border ${row.colorClass} flex-1 mr-1`}>
                                                                <div className="truncate">{row.label}</div>
                                                            </div>
                                                            {isEditMode && (
                                                                <div className="flex flex-col gap-0.5">
                                                                    <button
                                                                        disabled={isFirst}
                                                                        onClick={() => handleMoveRow(idx, 'up')}
                                                                        className={`p-0.5 rounded ${isFirst ? 'text-gray-200' : 'text-gray-400 hover:text-teal-600 hover:bg-gray-100'} `}
                                                                    >
                                                                        <ChevronUp size={12} />
                                                                    </button>
                                                                    <button
                                                                        disabled={isLast}
                                                                        onClick={() => handleMoveRow(idx, 'down')}
                                                                        className={`p-0.5 rounded ${isLast ? 'text-gray-200' : 'text-gray-400 hover:text-teal-600 hover:bg-gray-100'} `}
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

                                                            // Primary Sort: Learners go to bottom
                                                            if (isALearner && !isBLearner) return 1;
                                                            if (!isALearner && isBLearner) return -1;

                                                            // Secondary Sort: Alphabetical Name
                                                            return (a.user.name || '').localeCompare(b.user.name || '');
                                                        });

                                                        const isToday = toLocalISOString(new Date()) === date;
                                                        // Unified Cell Content Logic for both Roles and Stations (Chips)
                                                        return (
                                                            <td key={date} className={`p-0.5 border-r border-slate-100 align-top h-16 ${isToday ? 'bg-teal-50/10' : ''} `}>
                                                                <div className="h-full flex flex-col items-center justify-start pt-1 relative group/cell">
                                                                    <div className="flex flex-wrap gap-1 justify-center w-full px-0.5">
                                                                        {sortedStaff.map((item, i) => {
                                                                            const isOpening = item.shift.specialRoles.includes(SPECIAL_ROLES.OPENING);
                                                                            const isLate = item.shift.specialRoles.includes(SPECIAL_ROLES.LATE);
                                                                            const isAssist = item.shift.specialRoles.includes(SPECIAL_ROLES.ASSIST);
                                                                            const isScheduler = item.shift.specialRoles.includes(SPECIAL_ROLES.SCHEDULER);

                                                                            // LEAVE STATUS CHECK
                                                                            const activeLeave = db.getLeaves().find(l =>
                                                                                l.userId === item.user!.id &&
                                                                                (l.status === LeaveStatus.APPROVED || l.status === LeaveStatus.PENDING) &&
                                                                                date >= l.startDate &&
                                                                                date <= l.endDate
                                                                            );

                                                                            const isPreLeave = activeLeave?.type === LeaveType.PRE_SCHEDULED;
                                                                            const isLongLeave = activeLeave?.type === LeaveType.LONG_LEAVE;
                                                                            const isCancelLeave = activeLeave?.type === LeaveType.CANCEL_LEAVE;
                                                                            const isSwapShift = activeLeave?.type === LeaveType.SWAP_SHIFT;
                                                                            const isPending = activeLeave?.status === LeaveStatus.PENDING;
                                                                            // Wait, if they are in Station View, they are WORKING.
                                                                            // Why would they have a leave record?
                                                                            // 1. Cancel Leave -> We show they are working. User wants to see "Cancel Leave" badge.
                                                                            // 2. Swap Shift -> If they are the one working (Target), we might track that via a DIFFERENT record?
                                                                            //    Or if the Requestor is working? No, Requestor is OFF.
                                                                            //    So if item.user is here, they are working.
                                                                            //    Visual Request: "Show if this person has Pre/Cancel/Long/Swap".

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
                                                                                    className={`px-1 py-1 rounded text-sm font-bold shadow-sm flex flex-col items-center w-full max-w-[60px] relative group / chip border ${chipClass} `}
                                                                                >
                                                                                    <span className="truncate text-xs leading-tight mb-0.5 whitespace-nowrap flex items-center gap-0.5">
                                                                                        {item.user?.name ? formatName(item.user.name) : ''}
                                                                                        {isLearner && <span className="text-[9px]">(學)</span>}
                                                                                    </span>

                                                                                    {/* Leave / Status Indicators */}
                                                                                    {activeLeave && (
                                                                                        <div className="flex gap-0.5 mb-0.5">
                                                                                            {isPreLeave && <span className={`text-[8px] ${isPending ? 'bg-blue-300' : 'bg-blue-500'} text-white px-0.5 rounded leading-none scale-90`}>預</span>}
                                                                                            {isCancelLeave && <span className={`text-[8px] ${isPending ? 'bg-emerald-300' : 'bg-emerald-500'} text-white px-0.5 rounded leading-none scale-90`}>銷</span>}
                                                                                            {isLongLeave && <span className={`text-[8px] ${isPending ? 'bg-purple-300' : 'bg-purple-500'} text-white px-0.5 rounded leading-none scale-90`}>長</span>}
                                                                                            {isSwapShift && <span className={`text-[8px] ${isPending ? 'bg-amber-300' : 'bg-amber-500'} text-white px-0.5 rounded leading-none scale-90`}>換</span>}
                                                                                        </div>
                                                                                    )}

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
                                                                                            className={`absolute-top-1-right-1 bg-white text-red-500 rounded-full p-0.5 transition-opacity shadow-sm border border-red-100 z-10 ${(isMobile && isEditMode) ? 'opacity-100' : 'opacity-0 group-hover/chip:opacity-100'} `}
                                                                                        >
                                                                                            <X size={8} />
                                                                                        </button>
                                                                                    )}
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                    {isEditMode && (
                                                                        <div className={`mt-1 w-full flex justify-center transition-opacity ${(isMobile && isEditMode) ? 'opacity-100' : 'opacity-0 group-hover/cell:opacity-100'} `}>
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

                                {/* --- Doctor Schedule Rows (Admin/Supervisor Only) or All? User said "崗位視角" --- */}
                                
                                <tr className="bg-slate-100 border-t-4 border-slate-300">
                                    <td colSpan={dateRange.length + 1} className="p-1 px-3 font-bold text-slate-700">
                                        醫師人力配置
                                    </td>
                                </tr>
                                
                                {['上班醫師', '影像', '遠班', '支援'].map(rowLabel => {
                                    return (
                                    <tr key={`doc-${rowLabel}`} className="bg-white border-t border-slate-200">
                                        <td className={`sticky left-0 z-10 bg-slate-50/95 backdrop-blur border-r border-slate-200 shadow-[4px_0_8px_rgba(0,0,0,0.02)] ${isMobile ? 'p-1 w-[85px] min-w-[85px]' : 'p-2'}`}>
                                            <div className="flex flex-col items-end pr-2">
                                                <div className="text-xs font-bold text-slate-600">{rowLabel}</div>
                                            </div>
                                        </td>
                                        {dateRange.map(date => {
                                            // 1. Get all shifts for this date
                                            const allShifts = db.getDoctorShifts().filter(s => s.date === date);
                                            
                                            // 2. Filter & Group by station field
                                            const shiftsHere = allShifts.filter(s => {
                                                const doc = db.getDoctors().find(d => d.id === s.doctorId);
                                                // Filter: Must be Radiology
                                                if (!doc?.specialty?.includes('放射')) return false;
                                                
                                                // Simple station-based grouping
                                                const st = s.station;
                                                
                                                if (rowLabel === '上班醫師') {
                                                    // Show doctors with station = '未分配'
                                                    if (st !== '未分配') return false;
                                                    
                                                    // Exclude doctors who are OFF, on leave, or have no scheduled station
                                                    if (!s.scheduled_station || s.scheduled_station === 'X' || s.scheduled_station === 'OFF') return false;

                                                    // Exclude Taichung doctors (As requested)
                                                    if (s.location === '台中') return false;
                                                    
                                                    // Strict Location Filter:
                                                    // Only show if Location is '北投' (or empty) OR scheduled_station includes '遠'
                                                    const isBeitou = s.location === '北投' || !s.location;
                                                    const isRemote = s.scheduled_station?.includes('遠');
                                                    
                                                    return isBeitou || isRemote;
                                                } else if (rowLabel === '影像') {
                                                    return st === '影像';
                                                } else if (rowLabel === '遠班') {
                                                    return st.includes('遠');
                                                } else if (rowLabel === '支援') {
                                                    return st === '支援';
                                                }
                                                return false;
                                            });

                                            const isToday = date === new Date().toISOString().split('T')[0];
                                            const isReadOnlyRow = rowLabel === '上班醫師';

                                            // Sort shifts by doctor display order
                                            shiftsHere.sort((a, b) => {
                                                const docA = db.getDoctors().find(d => d.id === a.doctorId);
                                                const docB = db.getDoctors().find(d => d.id === b.doctorId);
                                                return (docA?.displayOrder || 0) - (docB?.displayOrder || 0);
                                            });

                                            // Highlight 'Today' only for '上班醫師' row as pale yellow
                                            const cellBg = (isReadOnlyRow && isToday) ? 'bg-amber-100 ring-2 ring-amber-200 ring-inset' : '';

                                            return (
                                                <td key={date} className={`p-1 border-r border-gray-100 align-top min-w-[120px] ${cellBg}`}>
                                                     <div className="flex flex-col gap-1">
                                                        {shiftsHere.map(s => {
                                                            const doc = db.getDoctors().find(d => d.id === s.doctorId);
                                                            // Display Logic: 
                                                            // For '上班醫師' (Summary Row), prefer scheduled_station (CT, MR...) if available
                                                            // For others, show nothing specific (just Name) as row implies station
                                                            const displayStation = (rowLabel === '上班醫師' && s.scheduled_station) 
                                                                ? s.scheduled_station 
                                                                : (rowLabel === '上班醫師' ? s.station : '');

                                                            const isSupervisor = currentUser.role === UserRole.SYSTEM_ADMIN || currentUser.role === UserRole.SUPERVISOR;
                                                            
                                                            // Style: Minimalist text-only (no cards)
                                                            const itemStyle = isReadOnlyRow
                                                                ? 'text-gray-700'
                                                                : 'text-teal-700 font-medium';

                                                            return (
                                                                <div 
                                                                    key={s.id} 
                                                                    className={`flex items-center justify-center relative px-1 py-0.5 rounded text-xs hover:bg-gray-100 transition-colors ${itemStyle}`}
                                                                    style={{
                                                                        cursor: isSupervisor ? 'pointer' : 'default'
                                                                    }}
                                                                    draggable={isSupervisor && isEditMode}
                                                                    onDragStart={(e) => {
                                                                        e.dataTransfer.setData('text/plain', JSON.stringify({
                                                                            doctorId: doc.id,
                                                                            fromDate: date,
                                                                            fromStation: s.station
                                                                        }));
                                                                    }}
                                                                    title={s.scheduled_station}
                                                                >
                                                                    {s.scheduled_station === '支援' && <span className="text-[10px] mr-0.5">🟡</span>}
                                                                    {s.scheduled_station === '解說' && <span className="text-[10px] mr-0.5">🔴</span>}
                                                                    <span className="whitespace-nowrap">
                                                                        {doc?.alias || doc?.name}
                                                                    </span>
                                                                    {displayStation && (
                                                                        <span className={`${isReadOnlyRow ? 'text-slate-500' : 'text-teal-600'} text-[9px] scale-90 font-medium ml-1`}>
                                                                            ({displayStation})
                                                                        </span>
                                                                    )}

                                                                    {isSupervisor && isEditMode && (
                                                                         <button 
                                                                            type="button"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                db.assignDoctor(doc?.id || '', date, '未分配');
                                                                                showToast('已移回上班醫師', 'success');
                                                                            }}
                                                                            className={`${isReadOnlyRow ? 'text-slate-400 hover:text-red-400' : 'text-teal-600 hover:text-red-500'} absolute right-0.5`}
                                                                         >
                                                                            &times;
                                                                         </button>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                        
                                                        {(currentUser.role === UserRole.SYSTEM_ADMIN || currentUser.role === UserRole.SUPERVISOR) && isEditMode && (
                                                            <div className="relative w-4 h-4 bg-slate-100 hover:bg-slate-200 rounded text-slate-400 text-[10px] border border-slate-200 flex items-center justify-center">
                                                                +
                                                                <select
                                                                    className="w-full h-full opacity-0 absolute inset-0 cursor-pointer"
                                                                    onChange={(e) => {
                                                                        if (e.target.value) {
                                                                            // Determine target station based on row
                                                                            let targetStation = '未分配';
                                                                            if (rowLabel === '影像') targetStation = '影像';
                                                                            if (rowLabel === '遠班') targetStation = '遠'; 
                                                                            if (rowLabel === '支援') targetStation = '支援';
                                                                            
                                                                            db.assignDoctor(e.target.value, date, targetStation);
                                                                            showToast('已指派醫師', 'success');
                                                                            e.target.value = ''; // Reset
                                                                        }
                                                                    }}
                                                                    value=""
                                                                >
                                                                    <option value="">+</option>
                                                                    {db.getDoctors()
                                                                        .filter(d => {
                                                                            // 1. Filter logic based on row
                                                                            const shift = db.getDoctorShift(d.id, date);
                                                                            
                                                                            if (rowLabel === '上班醫師') {
                                                                                // For "Working Doctors": Show doctors with NO shift (to add them)
                                                                                if (shift) return false;
                                                                            } else {
                                                                                // For Assignment Rows: Show ONLY available doctors (from "Working Doctors" pool)
                                                                                // Must have shift AND station must be '未分配'
                                                                                if (!shift) return false; 
                                                                                if (shift.station !== '未分配') return false;
                                                                            }

                                                                            // 2. Must be Radiology
                                                                            if (!d.specialty?.includes('放射')) return false;
                                                                            return true;
                                                                        })
                                                                        .map(d => (
                                                                        <option key={d.id} value={d.id}>{d.name}</option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                    );
                                })}
                                {/* --- Daily Stats Rows (Admin/Supervisor Only) --- */}
                                {(currentUser.role === UserRole.SYSTEM_ADMIN || currentUser.role === UserRole.SUPERVISOR) && (
                                    <>
                                        <tr className="bg-slate-50 border-t-2 border-slate-200">
                                            <td className={`sticky left-0 z-10 bg-slate-50/95 backdrop-blur border-r border-slate-200 shadow-[4px_0_8px_rgba(0,0,0,0.02)] ${isMobile ? 'p-1 w-[85px] min-w-[85px]' : 'p-2'}`}>
                                                <div className="text-xs font-bold text-slate-600 flex items-center justify-end pr-2">北投客戶數</div>
                                            </td>
                                            {dateRange.map(date => {
                                                const stats = db.getDailyStats(date);
                                                return (
                                                    <td key={date} className="p-0.5 border-r border-slate-200 text-center align-middle">
                                                        <input
                                                            type="number"
                                                            value={stats?.beitou_clients || 0}
                                                            onChange={(e) => db.updateDailyStats(date, { beitou_clients: Number(e.target.value) })}
                                                            className="w-full text-center text-xs bg-transparent outline-none focus:bg-white focus:ring-1 focus:ring-teal-500 rounded py-1"
                                                            placeholder="0"
                                                        />
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                        <tr className="bg-slate-50">
                                            <td className={`sticky left-0 z-10 bg-slate-50/95 backdrop-blur border-r border-slate-200 shadow-[4px_0_8px_rgba(0,0,0,0.02)] ${isMobile ? 'p-1 w-[85px] min-w-[85px]' : 'p-2'}`}>
                                                <div className="text-xs font-bold text-slate-600 flex items-center justify-end pr-2">CTA</div>
                                            </td>
                                            {dateRange.map(date => {
                                                const stats = db.getDailyStats(date);
                                                return (
                                                    <td key={date} className="p-0.5 border-r border-slate-200 text-center align-middle">
                                                        <input
                                                            type="number"
                                                            value={stats?.beitou_cta || 0}
                                                            onChange={(e) => db.updateDailyStats(date, { beitou_cta: Number(e.target.value) })}
                                                            className="w-full text-center text-xs bg-transparent outline-none focus:bg-white focus:ring-1 focus:ring-teal-500 rounded py-1"
                                                            placeholder="0"
                                                        />
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                        <tr className="bg-slate-50">
                                            <td className={`sticky left-0 z-10 bg-slate-50/95 backdrop-blur border-r border-slate-200 shadow-[4px_0_8px_rgba(0,0,0,0.02)] ${isMobile ? 'p-1 w-[85px] min-w-[85px]' : 'p-2'}`}>
                                                <div className="text-xs font-bold text-slate-600 flex items-center justify-end pr-2">大直客戶數</div>
                                            </td>
                                            {dateRange.map(date => {
                                                const stats = db.getDailyStats(date);
                                                return (
                                                    <td key={date} className="p-0.5 border-r border-slate-200 text-center align-middle">
                                                        <input
                                                            type="number"
                                                            value={stats?.dazhi_clients || 0}
                                                            onChange={(e) => db.updateDailyStats(date, { dazhi_clients: Number(e.target.value) })}
                                                            className="w-full text-center text-xs bg-transparent outline-none focus:bg-white focus:ring-1 focus:ring-teal-500 rounded py-1"
                                                            placeholder="0"
                                                        />
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    </>
                                )}
                                    </>
                                )}

                            </tbody>
                        </table>
                        {/* ... (Footer legend) ... */}
                        <div className="hidden lg:flex p-4 border-t border-slate-200 bg-white sticky bottom-0 z-20 gap-6 text-xs text-slate-500 font-medium">
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
                                    <div className="flex items-center gap-2"><span className="text-yellow-500 text-xs">🟡</span> <span>兼解說 (點擊切換)</span></div>
                                    <div className="flex items-center gap-2"><span className="text-red-500 text-xs">🔴</span> <span>單純解說 (點擊切換)</span></div>
                                    {isEditMode && <div className="flex items-center gap-2 text-teal-600 font-bold ml-auto">可使用左側箭頭調整顯示順序</div>}
                                </>
                            )}
                        </div>

                    </div>
                )}
            </div>
            {/* Force Password Change Modal */}
            {showForcePwdModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 border-2 border-red-100 animate-in fade-in zoom-in-95">
                        <div className="flex flex-col items-center gap-3 text-center mb-6">
                            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center text-red-600">
                                <Key size={24} />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-gray-800">請修改您的密碼</h3>
                                <p className="text-sm text-gray-500 mt-1">為了確保帳戶安全，首次登入或密碼重置後必須修改密碼。</p>
                            </div>
                        </div>

                        <form onSubmit={handleForcePasswordSubmit} className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-gray-600 mb-1 block">新密碼</label>
                                <input
                                    type="password"
                                    value={forcePwdData.new}
                                    onChange={(e) => setForcePwdData({ ...forcePwdData, new: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-red-500"
                                    placeholder="請輸入新密碼"
                                    required
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-600 mb-1 block">確認新密碼</label>
                                <input
                                    type="password"
                                    value={forcePwdData.confirm}
                                    onChange={(e) => setForcePwdData({ ...forcePwdData, confirm: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-red-500"
                                    placeholder="請再次輸入新密碼"
                                    required
                                />
                            </div>
                            <button
                                type="submit"
                                className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-red-200 transition-all mt-2"
                            >
                                確認修改並登入
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Daily Memo Modal */}
            {memoModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-4 flex justify-between items-center">
                            <h3 className="text-white font-bold text-lg flex items-center gap-2">
                                <CalendarIcon size={20} />
                                每日重要事件備忘 ({memoModal.date.split('-').slice(1).join('/')})
                            </h3>
                            <button 
                                onClick={() => setMemoModal(null)}
                                className="text-white/80 hover:text-white transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        
                        <div className="p-6">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                備忘內容 (僅顯示於放射師排班表)
                            </label>
                            <textarea
                                autoFocus
                                className="w-full h-32 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-800 resize-none transition-all"
                                placeholder="例如：下午有大型健檢、備妥某某耗材..."
                                value={memoModal.content}
                                onChange={(e) => setMemoModal({ ...memoModal, content: e.target.value })}
                            />
                            <p className="mt-2 text-[11px] text-gray-500 italic">
                                * 此備忘將在「放師排班表」日期下方顯示 📝 圖示。
                            </p>
                        </div>

                        <div className="bg-gray-50 px-6 py-4 flex justify-between items-center gap-3">
                            <button
                                onClick={() => handleDeleteMemo(memoModal.date)}
                                className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm font-medium transition-colors flex items-center gap-1"
                            >
                                <Trash2 size={16} /> 刪除
                            </button>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setMemoModal(null)}
                                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors"
                                >
                                    取消
                                </button>
                                <button
                                    onClick={() => handleSaveMemo(memoModal.date, memoModal.content)}
                                    className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-bold shadow-md shadow-purple-200 transition-all flex items-center gap-2"
                                >
                                    <Check size={18} /> 儲存備忘
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Toast Notification */}
            {toast && (
                <div className={`fixed bottom-6 right-6 px-4 py-3 rounded-xl shadow-lg border flex items-center gap-3 animate-in slide-in-from-bottom-5 z-[9999] ${toast.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
                    {toast.type === 'success' ? <CheckCircle size={20} className="text-emerald-600" /> : <AlertTriangle size={20} className="text-red-600" />}
                    <span className="font-bold text-sm">{toast.message}</span>
                </div>
            )}
        </div>
    );
};

// --- New Component: Daily Manpower Summary (Admin Only) ---
const DailyManpowerSummary: React.FC<{
    date: string;
    users: User[];
    shifts: Shift[];
    currentUser: User;
}> = ({ date, users, shifts, currentUser }) => {
    // Permission Check: Admin or Supervisor only
    const canAccess = currentUser.role === UserRole.SYSTEM_ADMIN || currentUser.role === UserRole.SUPERVISOR;
    if (!canAccess) return null;

    // Fetch Stats directly from Store (Read-Only here)
    const stats = db.getDailyStats(date) || {
        beitou_clients: 0,
        beitou_cta: 0,
        dazhi_clients: 0
    };

    // Get daily events (holidays, memos, etc.)
    const dailyEvents = useMemo(() => {
        return db.getHolidays().filter(h => h.date === date);
    }, [date]);

    // Calculate Manpower
    const manpower = useMemo(() => {
        const shiftsOnDate = shifts.filter(s => s.date === date);

        // Helper to get formatted name
        const getName = (userId: string) => {
            const u = users.find(user => user.id === userId);
            if (!u) return '';
            // If alias is purely English (e.g., "K"), use last 2 chars of name instead
            if (u.alias && /^[A-Za-z]+$/.test(u.alias)) {
                 return u.name.slice(-2);
            }
            return u.alias || u.name.slice(-2);
        };
        
        // Helper to get full name with alias fallback
         const getFullName = (userId: string) => {
            const u = users.find(user => user.id === userId);
            return u ? u.name : '';
        };

        // Categorize Staff
        const mr: string[] = [];
        const us: string[] = [];
        const ct: string[] = [];
        const bmd: string[] = [];  // Includes DX
        const remote: string[] = [];
        const floorControl: string[] = []; // 場控  
        
        const learning: string[] = []; // 學習
        
        const support: string[] = []; // 支援
        const dazhi: string[] = []; // 大直 assigned

        let remoteCount = 0;
        let beitouCount = 0;
        let dazhiCount = 0;

        shiftsOnDate.forEach(s => {
            if (s.station === SYSTEM_OFF || s.station === StationDefault.UNASSIGNED) return;

            const name = getName(s.userId);
            if (!name) return;

            // Check for Learning status (Station Match or Capability Match)
            const u = users.find(user => user.id === s.userId);
            const isLearning = s.station.includes('學習') || (u?.learningCapabilities?.some(cap => s.station.includes(cap)));

            // Modality Detection (regardless of Learning status, useful for tagging)
            let modality = '';
            if (s.station.includes('MR')) modality = 'MR';
            else if (s.station.includes('US')) modality = 'US';
            else if (s.station.includes('CT')) modality = 'CT';
            else if (s.station.includes('BMD') || s.station.includes('DX')) modality = 'BMD';

            // Counts
            if (s.station.includes('大直')) {
                dazhiCount++;
                dazhi.push(name);
            } else if (s.station.includes('遠距') || s.station.includes('遠班')) {
                remoteCount++;
                remote.push(name);
            } else if (isLearning) {
                // Learning doesn't count towards Beitou manpower
                learning.push(`${name}(${modality})`);
            } else if (s.station === '行政') {
                // Admin doesn't count towards Beitou manpower
            } else {
                beitouCount++; // Default to Beitou for others
            }

            // Categories (Exclude Learning from main lists)
            if (s.station.includes('MR') && !isLearning) mr.push(name);
            if (s.station.includes('US') && !isLearning) us.push(name);
            if (s.station.includes('CT') && !isLearning) ct.push(name);
            if ((s.station.includes('BMD') || s.station.includes('DX')) && !isLearning) bmd.push(name);
            if (s.station.includes('場控')) floorControl.push(name);
            if (s.station.includes('支援')) support.push(name);
        });

        return {
            beitouCount,
            mr,
            us,
            ct,
            bmd,
            floorControl,
            support,
            learning,
            remote,
            remoteCount,
            dazhi,
            dazhiCount
        };
    }, [shifts, date, users]);

    // Generate Copy Text (Memoized for Live Preview)
    const copyText = useMemo(() => {
        const d = new Date(date);
        const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
        const dateStr = `${d.getMonth() + 1}/${d.getDate()}(${dayNames[d.getDay()]})`;

        // --- Fetch Doctor Info ---
        const docShifts = db.getDoctorShifts().filter(s => s.date === date);
        const doctors = db.getDoctors();
        const getDocAlias = (id: string) => {
            const doc = doctors.find(d => d.id === id);
            return doc ? (doc.alias || doc.name) : '';
        };

        // Helper to format doctor name with explanation suffix based on the specific shift
        const formatShiftWithSuffix = (shift: any, alias: string) => {
            if (shift?.scheduled_station === '解說') {
                return `${alias}(解說)`;
            } else if (shift?.scheduled_station === '支援') {
                return `${alias}+解說`;
            }
            return alias;
        };

        const imagingDocs = docShifts
            .filter(s => {
                if (s.station !== '影像') return false;
                const doc = doctors.find(d => d.id === s.doctorId);
                // Exclude doctors who work in Taichung (per user request)
                if (doc?.locations.includes('台中')) return false;
                return true;
            })
            .map(s => getDocAlias(s.doctorId));
        
        // For Remote Header and Third Line Support, we need the suffix included
        // Pass the shift 's' directly to ensure we use the correct explanationTaskType for THAT shift
        const remoteDocsWithSuffix = docShifts.filter(s => s.station === '遠').map(s => formatShiftWithSuffix(s, getDocAlias(s.doctorId)));
        const supportDocsWithSuffix = docShifts.filter(s => s.station === '支援').map(s => formatShiftWithSuffix(s, getDocAlias(s.doctorId)));

        // Raw aliases for detail mapping (we'll re-apply suffix logic there or just use the helper if cleaner)
        const remoteDocsRaw = docShifts.filter(s => s.station === '遠').map(s => getDocAlias(s.doctorId));

        // --- Radiographer Data: "Third Line" Detection ---
        // Block 3: Only Doctors (supportDocs)
        const thirdLineSupportList = [...supportDocsWithSuffix]; 

        // Block 1: Support Section
        // Technical Support: manpower.support (assigned to '支援')
        // Admin ('行政') is EXCLUDED per user request.
        const allSupportRads = [...manpower.support];
        const uniqueSupportRads = Array.from(new Set(allSupportRads));
        const supportText = uniqueSupportRads.length > 0 ? `技術支援：${uniqueSupportRads.join('/')}` : '';
        
        // Learning Section: Simple list format
        // Format: 學習：Name(Modality)/Name2(Modality)
        const learningText = manpower.learning.length > 0 ? `\n\n學習：${manpower.learning.join('/')}` : '';
        
        // Result of filtering for falsy values to avoid "undefined" or empty strings in output
        // Remote Group Header: Combine Remote Docs + Remote Radiographers with spacing
        // Result of filtering for falsy values to avoid "undefined" or empty strings in output
        // Remote Group Header: Combine Remote Docs + Remote Radiographers with spacing
        const joinedRemoteDocs = remoteDocsWithSuffix.filter(Boolean).join('/');
        const joinedRemoteRads = manpower.remote.filter(Boolean).join('/');
        let remoteGroupHeader = joinedRemoteDocs;
        if (joinedRemoteRads) {
             remoteGroupHeader += (joinedRemoteDocs ? '  ' : '') + joinedRemoteRads;
        }

        // --- Prepare Template & Variables ---
        let template = db.settings.lineCopyTemplate;
        // Updated Default Template to match new requirements
        if (!template) {
            template = `{{date}}
{{events_section}}{{imaging_doctors}}

放射師人力
北投：{{beitou_count}} (客戶：{{beitou_clients}}  CTA  {{beitou_cta}})
BU領頭 場控：{{floor_control}}
MR : {{mr}}
US：{{us}}
CT: {{ct}}
BMD :{{bmd}}
{{support_section}}{{learning_section}}

遠群（{{remote_group_header}}）
{{remote_doctors_detail}}
遠：{{remote_radiographers}}

大直：{{dazhi_count}} （客戶 {{dazhi_clients}} ）
{{dazhi_radiographers}}

三線支援：{{third_line_support}}`;
        }

        const replacements: Record<string, string> = {
            '{{date}}': dateStr,
            '{{beitou_count}}': manpower.beitouCount.toString(),
            '{{beitou_clients}}': stats.beitou_clients.toString(),
            '{{beitou_cta}}': stats.beitou_cta.toString(),
            '{{dazhi_clients}}': stats.dazhi_clients.toString(),
            '{{dazhi_count}}': manpower.dazhiCount.toString(),
            '{{floor_control}}': manpower.floorControl.join('/') || '',
            '{{mr}}': manpower.mr.join('/'),
            '{{us}}': manpower.us.join('/'),
            '{{ct}}': manpower.ct.join('/'),
            '{{bmd}}': manpower.bmd.join('/'),
            '{{support}}': manpower.support.join('/'),
            '{{support_section}}': supportText,
            '{{learning_section}}': learningText,
            '{{remote_radiographers}}': manpower.remote.join('/') || '無',
            '{{dazhi_radiographers}}': manpower.dazhi.join('/') || '無',
            '{{third_line_support}}': thirdLineSupportList.join('/'),
            '{{remote_group_header}}': remoteGroupHeader,
            '{{remote_group}}': remoteGroupHeader,
            '{{events_section}}': dailyEvents.length > 0 ? dailyEvents.map(e => `【${e.name}】`).join(' ') + '\n' : '',
        };

        // Doctor Lists formatting
        let imgDocStr = '';
        if (imagingDocs.length > 0) {
            imgDocStr = imagingDocs.map(docAlias => {
                // Find doctor shift to check for explanation suffix
                const docShift = docShifts.find(s => {
                    const doc = doctors.find(d => d.id === s.doctorId);
                    return s.station === '影像' && (doc?.alias || doc?.name) === docAlias;
                });
                
                // Format based on scheduled_station
                if (docShift?.scheduled_station === '解說') {
                    return `${docAlias}  N(N大 N小 N無 ) →N 單位 (解說)`;
                } else if (docShift?.scheduled_station === '支援') {
                    return `${docAlias}  N(N大 N小 N無 ) →N 單位 +解說`;
                } else {
                    return `${docAlias}  N(N大 N小 N無 ) →N 單位`;
                }
            }).join('\n');
        } else {
            imgDocStr = `(無影像醫師)  N(N大 N小 N無 ) →N 單位`;
        }
        replacements['{{imaging_doctors}}'] = imgDocStr;

        let remDocStr = '';
        if (remoteDocsRaw.length > 0) {
            // New Format: Name X (...) +大直 {{dazhi_clients}} →N 單位
            remDocStr = remoteDocsRaw.map(docAlias => {
                // Find doctor shift to check for explanation suffix
                const docShift = docShifts.find(s => {
                    const doc = doctors.find(d => d.id === s.doctorId);
                    return s.station === '遠' && (doc?.alias || doc?.name) === docAlias;
                });
                
                // Format based on scheduled_station
                if (docShift?.scheduled_station === '解說') {
                    return `${docAlias}  X (X大 X小 X無) +大直 ${stats.dazhi_clients} →N 單位 (解說)`;
                } else if (docShift?.scheduled_station === '支援') {
                    return `${docAlias}  X (X大 X小 X無) +大直 ${stats.dazhi_clients} →N 單位 +解說`;
                } else {
                    return `${docAlias}  X (X大 X小 X無) +大直 ${stats.dazhi_clients} →N 單位`;
                }
            }).join('\n');
        }
        replacements['{{remote_doctors_detail}}'] = remDocStr;

        let finalText = template;

        // Custom Logic: Replace legacy "支援：{{support}}" with new {{support_section}}
        // This ensures label update ("支援" -> "技術支援") and content merge (Support + Admin/Tech)
        // works even for users with old saved templates.
        // Custom Logic: Replace legacy "支援：{{support}}" with new {{support_section}}
        // This ensures label update ("支援" -> "技術支援") and content merge (Support + Admin/Tech)
        // works even for users with old saved templates.
        if (finalText.match(/(支援|技術支援)\s*[:：]\s*{{support}}/)) {
             finalText = finalText.replace(/(支援|技術支援)\s*[:：]\s*{{support}}\n?/, '{{support_section}}\n');
             // Trim extra newline if support_section is empty to avoid gaps
             if (!supportText) {
                 finalText = finalText.replace('{{support_section}}\n', '');
             }
        }
        
        // Custom Logic: Auto-Inject {{support_section}} if missing entirely
        // This handles cases where user deleted string or it's just gone
        if (!finalText.includes('{{support_section}}') && !finalText.includes('技術支援：')) {
             // Try to find BMD line to append after
             if (finalText.includes('{{bmd}}')) {
                  finalText = finalText.replace(/{{bmd}}(\n?)/, '{{bmd}}\n{{support_section}}$1');
             } else if (finalText.match(/BMD\s*[:：]/)) {
                  // Fallback anchor
                  finalText = finalText.replace(/(BMD\s*[:：].*)(\n?)/, '$1\n{{support_section}}$2');
             }
        }

        // Custom Logic: Check if "北投：" header is missing the count variable (legacy template issue)
        // Look for pattern like "北投：" followed immediately by "(客戶" or space, without the count
        // We want to force inject it: "北投：{{beitou_count}} (客戶..."
        if (finalText.includes('北投：') && !finalText.includes('{{beitou_count}}')) {
             finalText = finalText.replace(/北投：\s*(\(客戶|（客戶)/, '北投：{{beitou_count}} $1');
        }

        // Custom Logic: Ensure "大直" has a colon if missing
        if (finalText.includes('大直 ') && finalText.includes('{{dazhi_count}}')) {
             finalText = finalText.replace(/大直\s+{{dazhi_count}}/, '大直：{{dazhi_count}}');
        }

        Object.keys(replacements).forEach(key => {
            const val = replacements[key];
            // Safe replace all
            finalText = finalText.split(key).join(val); 
        });

        // Split into sections for UI
        // Block 1: Before "遠群"
        // Block 2: From "遠群" to before "三線支援"
        // Block 3: From "三線支援" to end
        const split1 = finalText.split('遠群');
        const section1 = split1[0] || '';
        
        let section2 = '';
        let section3 = '';

        if (split1.length > 1) {
            // Rejoin the rest in case "遠群" appears multiple times (unlikely but safe)
            const rest = '遠群' + split1.slice(1).join('遠群');
            const split2 = rest.split('三線支援');
            section2 = split2[0] || '';
            if (split2.length > 1) {
                section3 = '三線支援' + split2.slice(1).join('三線支援');
            }
        }

        return { full: finalText, section1, section2, section3 };
    }, [date, shifts, manpower, users, stats]);

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text).catch(err => {
            console.error('Failed to copy: ', err);
            alert('複製失敗');
        });
    };

    return (
        <div className="bg-white p-4 rounded-lg shadow mt-8 border border-gray-200">
             <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold flex items-center gap-2">
                    <Briefcase className="w-5 h-5 text-blue-600" />
                    今日崗位總覽 (管理員專用)
                </h3>
             </div>

             {/* Daily Events & Memos */}
             {dailyEvents.length > 0 && (
                 <div className="mb-6 flex flex-wrap gap-2">
                      {dailyEvents.map((event, idx) => (
                          <div 
                              key={idx} 
                              className={`px-3 py-1.5 rounded-lg border flex items-center gap-2 shadow-sm ${
                                  event.type === DateEventType.RADIOGRAPHER_NOTE ? 'bg-purple-50 text-purple-700 border-purple-100' :
                                  event.type === DateEventType.DOCTOR_NOTE ? 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-100' :
                                  event.type === DateEventType.NOTE ? 'bg-blue-50 text-blue-700 border-blue-100' :
                                  'bg-red-50 text-red-700 border-red-100'
                              }`}
                          >
                              <span className="text-base">
                                  {event.type === DateEventType.RADIOGRAPHER_NOTE ? '📝' : 
                                   event.type === DateEventType.DOCTOR_NOTE ? '👨‍⚕️' : '🚩'}
                              </span>
                              <span className="font-bold text-sm">{event.name}</span>
                          </div>
                      ))}
                 </div>
             )}

             {/* Live Preview Box - Sections */}
             <div className="grid grid-cols-1 gap-4 mb-4">
                {/* Section 1: Imaging Doctors */}
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <div className="flex justify-between items-center mb-2">
                         <div className="text-xs text-gray-500 font-medium">區塊 1：北投崗位</div>
                         <button type="button" onClick={() => handleCopy(copyText.section1)} className="text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 px-2 py-1 rounded flex items-center gap-1">
                            <Copy size={12} /> 複製
                         </button>
                    </div>
                    <textarea 
                        className="w-full h-64 text-sm font-mono text-gray-700 bg-transparent outline-none resize-none"
                        readOnly
                        value={copyText.section1}
                     />
                </div>

                {/* Section 2: Beitou Staff */}
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <div className="flex justify-between items-center mb-2">
                         <div className="text-xs text-gray-500 font-medium">區塊 2：遠群</div>
                         <button type="button" onClick={() => handleCopy(copyText.section2)} className="text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 px-2 py-1 rounded flex items-center gap-1">
                            <Copy size={12} /> 複製
                         </button>
                    </div>
                    <textarea 
                        className="w-full h-40 text-sm font-mono text-gray-700 bg-transparent outline-none resize-none"
                        readOnly
                        value={copyText.section2}
                     />
                </div>

                 {/* Section 3: Remote & Support */}
                 <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <div className="flex justify-between items-center mb-2">
                         <div className="text-xs text-gray-500 font-medium">區塊 3：其它</div>
                         <button type="button" onClick={() => handleCopy(copyText.section3)} className="text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 px-2 py-1 rounded flex items-center gap-1">
                            <Copy size={12} /> 複製
                         </button>
                    </div>
                     <textarea 
                        className="w-full h-16 text-sm font-mono text-gray-700 bg-transparent outline-none resize-none"
                        readOnly
                        value={copyText.section3}
                     />
                </div>
             </div>

        </div>
    );
};

export default DashboardPage;
