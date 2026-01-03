
import React, { useState, useMemo, useEffect } from 'react';
import type { User, Shift } from '../types';
import { UserRole, SYSTEM_OFF, SPECIAL_ROLES, LeaveRequest, LeaveStatus, LeaveType, StationDefault, DateEventType } from '../types';
import { db } from '../services/store';
import { ChevronLeft, ChevronRight, Briefcase, Moon, Sun, Monitor, Activity, Calendar as CalendarIcon, Filter, Wand2, Users, LayoutList, Star, AlertCircle, Plus, X, Download, BarChart2, Sparkles, ChevronDown, ChevronUp, GripVertical, BookOpen, Lock, Unlock, CheckCircle, Loader2, User as UserIcon, Key } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import ConfirmModal from '../components/ConfirmModal';

interface DashboardPageProps {
    currentUser: User;
}

type ViewMode = 'user' | 'station' | 'daily';

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

    // Confirmation Modal State
    const [isConfirmCycleOpen, setIsConfirmCycleOpen] = useState(false);

    // Unified Range State for schedulers
    const [scheduleRange, setScheduleRange] = useState({ start: '', end: '' });

    // Include all users including SYSTEM_ADMIN as requested
    const [users, setUsers] = useState<User[]>(() => db.getUsers());
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
        if (forcePwdData.new !== forcePwdData.confirm) {
            alert('新密碼與確認密碼不符');
            return;
        }
        if (forcePwdData.new.length < 4) {
            alert('密碼長度至少需 4 碼');
            return;
        }
        await db.changePassword(currentUser.id, forcePwdData.new);
        alert('密碼修改成功！請繼續使用。');
        setShowForcePwdModal(false);
        // Force page reload or state update might be needed if user object isn't reactive enough, 
        // but store update should propagate via db.subscribe potentially if we subscribed, 
        // or just local state is enough since we hide modal.
    };

    // Subscribe to Store updates to ensure UI reflects data changes
    useEffect(() => {
        const unsubscribe = db.subscribe(() => {
            setUsers([...db.getUsers()]);
            setShifts([...db.getShifts('', '')]);
            setDisplayOrder([...db.getStationDisplayOrder()]);
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Determine the Date Range
    const dateRange = useMemo(() => {
        // Mobile: Always force 7-day Rolling View starting from Today + Offset
        if (isMobile) {
            const dates = [];
            const start = new Date(currentDate);
            // Apply offset: 7 days * offset
            start.setDate(start.getDate() + (mobileOffset * 7));

            for (let i = 0; i < 7; i++) {
                const d = new Date(start);
                d.setDate(start.getDate() + i);
                dates.push(d.toISOString().split('T')[0]);
            }
            return dates;
        }

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

        // Mobile: Show Today + 7 days
        if (isMobile) {
            for (let i = 0; i < 7; i++) {
                const d = new Date(start);
                d.setDate(start.getDate() + i);
                dates.push(d.toISOString().split('T')[0]);
            }
        } else {
            // Desktop: Show -2 days + 21 days (3 weeks)
            // Align view to start 2 days before current
            const viewStart = new Date(start);
            viewStart.setDate(viewStart.getDate() - 2);

            for (let i = 0; i < 21; i++) {
                const d = new Date(viewStart);
                d.setDate(viewStart.getDate() + i);
                dates.push(d.toISOString().split('T')[0]);
            }
        }
        return dates;
    }, [currentDate, selectedCycleId, currentCycle, isMobile, mobileOffset]);

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

            const title = `影像醫學部 - ${viewMode === 'user' ? '人員排班表' : '崗位分配表'}`;
            const subtitle = getExportHeader();
            const fullTitle = `${title}   ${subtitle}`;
            const exportDate = `匯出日期: ${new Date().toLocaleDateString('zh-TW')}`;

            doc.setFontSize(14);
            doc.text(fullTitle, 14, 15);

            doc.setFontSize(9);
            const pageWidth = doc.internal.pageSize.width;
            doc.text(exportDate, pageWidth - 14, 15, { align: 'right' });

            const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

            // Prepare Headers
            const dateHeaders = dateRange.map(date => {
                const d = new Date(date);
                return `${d.getDate()}\n${weekDays[d.getDay()]}`;
            });

            const headRow = [[viewMode === 'user' ? '姓名' : '崗位', ...dateHeaders]];

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

                    dateRange.forEach(date => {
                        const { station, specialRoles, isOff } = getDayShift(user.id, date);
                        const event = holidays.find(h => h.date === date);
                        const isClosed = event?.type === DateEventType.CLOSED;

                        if (isOff || isClosed) {
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
                        }
                    });
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
            const availableWidth = pageWidth - margins - nameColWidth;
            const dateColWidth = availableWidth / dateRange.length;

            const dynamicColumnStyles: Record<string, any> = {
                0: { cellWidth: nameColWidth, fontSize: 11, fontStyle: 'bold' }
            };

            // Apply calculated width to all date columns (index 1 to N)
            for (let i = 0; i < dateRange.length; i++) {
                dynamicColumnStyles[i + 1] = { cellWidth: dateColWidth };
            }

            autoTable(doc, {
                startY: 18,
                head: headRow,
                body: bodyRows,
                theme: 'grid',
                styles: {
                    fontSize: 8, // Base font size
                    cellPadding: 0.1,
                    halign: 'center',
                    valign: 'middle',
                    minCellHeight: 9, // Standard height
                    font: fontName,
                    lineColor: [0, 0, 0],
                    lineWidth: 0.1,
                    textColor: [0, 0, 0],
                },
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
                            data.cell.styles.fillColor = [240, 240, 240]; // Light Gray
                        }
                        else if (raw && typeof raw === 'object' && 'station' in raw) {
                            const station = raw.station;
                            if (station) {
                                if (station.includes('場控')) {
                                    data.cell.styles.fillColor = [252, 252, 190]; // #fcfcbe
                                } else if (station.includes('遠')) {
                                    data.cell.styles.fillColor = [255, 225, 225]; // #ffe1e1
                                } else if (station === SYSTEM_OFF) {
                                    data.cell.styles.fillColor = [240, 240, 240]; // Light Gray
                                }
                            }
                        }
                    }

                    // Row-Specific Styling (Station View)
                    if (viewMode === 'station' && data.section === 'body') {
                        const rawRow = data.row.raw as any[];
                        const rowLabel = rawRow[0]?.content; // First column is label

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
                                    // Stack safely. 3.5mm per person block.
                                    // Base spacing is minCellHeight 9.
                                    const requiredHeight = (staff.length * 3.5) + 4; // 4mm padding buffer
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
                                doc.setTextColor(0, 0, 0);

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
                        const raw = data.cell.raw;
                        if (raw && typeof raw === 'object' && 'staff' in raw) {
                            const staff = raw.staff as { name: string, roles: string[], isLearner: boolean }[];

                            // Note: We only pass 'staff' object for Standard Rows now.
                            // Compact rows and Off rows use string content, so this block won't run for them.

                            if (staff.length > 0) {
                                const baseFontSize = 8;
                                const roleFontSize = 6;

                                // Standard Rows: Stacked Content logic

                                // Calculate center start based on count
                                // Height per person block ~ 3.5mm
                                // autoTable has already centered the invisible filler text block.
                                // We can map our custom draw to the same positions?
                                // No, easier to just calculate absolute position relative to cell.

                                const lineHeight = 3.5;
                                const totalBlockHeight = staff.length * lineHeight;
                                let startY = (data.cell.y + data.cell.height / 2) - (totalBlockHeight / 2) + 1.2; // +1.2 adjustment for visual centering

                                staff.forEach((s, idx) => {
                                    const blockY = startY + (idx * lineHeight);

                                    // 1. Name 
                                    doc.setFontSize(baseFontSize);

                                    // Learner Name Color: #dc6262
                                    if (s.isLearner) {
                                        doc.setTextColor(220, 98, 98);
                                    } else {
                                        doc.setTextColor(0, 0, 0);
                                    }

                                    doc.text(s.name, data.cell.x + data.cell.width / 2, blockY - 1, { align: 'center', baseline: 'middle' });

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

                                        doc.text(roleLabel, data.cell.x + data.cell.width / 2, blockY + 1.5, { align: 'center', baseline: 'middle' });
                                    }
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
            alert(`PDF 匯出發生錯誤: ${msg}`);
        } finally {
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
            isAutoGenerated: false,
            isRoleAutoGenerated: false
        };
        db.upsertShift(newShift);
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



    const handleToggleCycleConfirm = async () => {
        if (selectedCycleId === 'rolling') return;

        const newStatus = !isCycleConfirmed;
        await db.toggleCycleConfirmation(selectedCycleId, newStatus);
        setShifts([...db.shifts]);
    };

    const handleSpecialRoleToggle = (userId: string, dateStr: string, role: string, currentStation: string, currentRoles: string[]) => {
        let newRoles = [...currentRoles];
        
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
            if (!isCertified && !isLearning && !isExcluded) return false;
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

            {/* Special Role Auto Schedule Modal */}
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
                                ].map(role => (
                                    <label key={role.id} className={`flex items-center gap-2 p-2 rounded border cursor-pointer hover:opacity-80 transition-all ${specialRolesToSchedule.includes(role.id) ? role.color + ' ring-1 ring-offset-1' : 'bg-white border-gray-200 text-gray-500'}`}>
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
                            {/* Hide Cycle Title on Mobile */}
                            {!isMobile && getCycleTitle()}
                            {isCycleConfirmed && (
                                <span className="bg-red-50 text-red-600 text-xs px-2 py-0.5 rounded border border-red-100 flex items-center gap-1">
                                    <Lock size={10} /> 已鎖定
                                </span>
                            )}
                        </h2>

                        <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                            <button
                                onClick={() => {
                                    setViewMode('user');
                                    db.initializeData(true);
                                }}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${viewMode === 'user' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                                    }`}
                            >
                                {!isMobile && <Users size={14} />} <span>人員視角</span>
                            </button>
                            <button
                                onClick={() => {
                                    setViewMode('station');
                                    db.initializeData(true);
                                }}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${viewMode === 'station' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                                    }`}
                            >
                                {!isMobile && <LayoutList size={14} />} <span>崗位視角</span>
                            </button>
                            <button
                                onClick={() => {
                                    setViewMode('daily');
                                    setDailyDate(new Date()); // Reset to today when clicking tab
                                    if (isMobile) {
                                        console.log("Mobile Daily View Selected: Forcing refresh...");
                                        db.initializeData(true);
                                    }
                                }}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${viewMode === 'daily' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                                    }`}
                            >
                                {!isMobile && <Activity size={14} />} <span>今日崗位</span>
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">

                        {isMobile ? (
                            // Mobile Header: Simple Nav + Date Range Only
                            <div className="flex items-center gap-2 bg-slate-100 rounded-lg p-1">
                                <button
                                    onClick={() => setMobileOffset(prev => prev - 1)}
                                    className="p-2 bg-white rounded shadow-sm text-slate-600 active:scale-95 transition-transform"
                                >
                                    <ChevronLeft size={16} />
                                </button>
                                <span className="text-xs font-bold text-slate-700 min-w-[80px] text-center">
                                    {dateRange[0].substring(5)} ~ {dateRange[dateRange.length - 1].substring(5)}
                                </span>
                                <button
                                    onClick={() => setMobileOffset(prev => prev + 1)}
                                    className="p-2 bg-white rounded shadow-sm text-slate-600 active:scale-95 transition-transform"
                                >
                                    <ChevronRight size={16} />
                                </button>
                            </div>
                        ) : (
                            // Desktop: Full Controls
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
                        )}

                        {!isMobile && selectedCycleId === 'rolling' && (
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
                        )}

                        {!isMobile && selectedCycleId !== 'rolling' && (
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-bold border border-indigo-100">
                                <CalendarIcon size={14} />
                                {cycles.find(c => c.id === selectedCycleId)?.startDate} ~ {cycles.find(c => c.id === selectedCycleId)?.endDate}
                            </div>
                        )}

                        {!isMobile && (currentUser.role === UserRole.SUPERVISOR || currentUser.role === UserRole.SYSTEM_ADMIN) && selectedCycleId !== 'rolling' && (
                            <button
                                onClick={() => setIsConfirmCycleOpen(true)}
                                disabled={isCycleConfirmed && currentUser.role !== UserRole.SYSTEM_ADMIN}
                                className={`px-3 py-1.5 rounded-lg text-sm font-medium border flex items-center gap-1.5 shadow-sm transition-all ${isCycleConfirmed
                                    ? (currentUser.role === UserRole.SYSTEM_ADMIN ? 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200' : 'bg-gray-50 text-gray-400 border-gray-100 cursor-not-allowed')
                                    : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                    }`}
                                title={isCycleConfirmed
                                    ? (currentUser.role === UserRole.SYSTEM_ADMIN ? "解鎖排班" : "排班已鎖定 (僅系統管理員可解鎖)")
                                    : "確認並鎖定排班"}
                            >
                                {isCycleConfirmed ? <Lock size={14} /> : <CheckCircle size={14} />}
                                {isCycleConfirmed ? '已鎖定' : '確認排班'}
                            </button>
                        )}

                        <div className="h-6 w-px bg-slate-200 mx-1"></div>

                        {!isMobile && (
                            <button
                                type="button"
                                onClick={(e) => handleExportPDF(e)}
                                disabled={isExporting}
                                className="px-3 py-1.5 rounded-lg text-sm font-medium border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 shadow-sm transition-all"
                                title="匯出 PDF"
                            >
                                <Download size={14} />
                                {isExporting ? '處理中...' : '匯出'}
                            </button>
                        )}

                        {(currentUser.role === UserRole.SUPERVISOR || currentUser.role === UserRole.SYSTEM_ADMIN) && (
                            <>
                                {/* Action Buttons: Only show when viewing Users and usually in custom or rolling range */}
                                {!isMobile && (
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
            <div className="flex-1 overflow-auto bg-slate-50 p-4">
                {viewMode === 'daily' ? (
                    // --- Daily View Implementation ---
                    <div className="max-w-4xl mx-auto space-y-6">
                        {/* Daily Controls */}
                        <div className="sticky top-0 z-30 bg-white rounded-xl shadow-md border border-slate-200 p-4 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <button
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
                                const dateStr = dailyDate.toISOString().split('T')[0];
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

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
                                {(() => {
                                    // Station-based grouping logic
                                    const dateStr = dailyDate.toISOString().split('T')[0];

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
                                                                <div key={u.id} className={`flex items-center gap-2 bg-white px-2 py-1.5 rounded border shadow-sm ${isSelf ? 'border-teal-200 bg-teal-50' : 'border-slate-100'}`}>
                                                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${u.color || 'bg-slate-400'}`}>
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

                            {/* Off Staff Summary */}
                            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 flex flex-wrap gap-2 items-center">
                                <span className="font-bold">今日休假:</span>
                                {users.filter(u => getDayShift(u.id, dailyDate.toISOString().split('T')[0]).isOff).map(u => (
                                    <span key={u.id} className="bg-white border border-slate-200 px-1.5 py-0.5 rounded text-slate-400">
                                        {u.name}
                                    </span>
                                ))}
                            </div>
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
                                    <th className={`sticky left-0 z-30 bg-slate-50/95 backdrop-blur border-b border-r border-slate-200 shadow-[4px_0_8px_rgba(0,0,0,0.02)] ${isMobile ? (viewMode === 'user' ? 'p-1 w-[50px] min-w-[50px]' : 'p-1 w-[85px] min-w-[85px]') : 'p-2 w-[120px] text-left'}`}>
                                        <div className={`flex items-center font-bold text-xs text-slate-600 ${isMobile ? 'justify-center' : 'gap-2'}`}>
                                            <UserIcon size={14} className="text-teal-600" />
                                            {!isMobile && (viewMode === 'user' ? '放射師' : '工作崗位')}
                                        </div>
                                    </th>
                                    {viewMode === 'user' && (
                                        <th className={`sticky z-30 bg-slate-50/95 backdrop-blur border-b border-r border-slate-200 p-0 w-[50px] shadow-[4px_0_8px_rgba(0,0,0,0.02)] ${isMobile ? 'left-[50px]' : 'left-[120px]'}`}>
                                            <div className="p-2 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider flex flex-col items-center">
                                                <BarChart2 size={12} className="mb-0.5 text-teal-600" />
                                                {!isMobile && '統計'}
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
                                            user.excludedCapabilities?.includes(s) ||
                                            s === StationDefault.UNASSIGNED ||
                                            s === StationDefault.UNASSIGNED ||
                                            s === '未分配'
                                        );
                                        return (
                                            <tr key={user.id} className="group hover:bg-slate-50/50 transition-colors">
                                                <td className={`sticky left-0 z-10 bg-white group-hover:bg-slate-50 border-r border-slate-200 shadow-[4px_0_8px_rgba(0,0,0,0.02)] ${isMobile ? 'p-1 w-[50px] min-w-[50px]' : 'p-2'}`}>
                                                    <div className={`flex items-center ${isMobile ? 'justify-center' : 'gap-2'}`}>
                                                        {/* Edit Buttons (Up/Down) */}
                                                        {isEditMode && !isMobile && (
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

                                                        {/* Avatar - Hide on Mobile */}
                                                        {!isMobile && (
                                                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-sm flex-shrink-0 ring-2 ring-white" style={{ backgroundColor: user.color || '#9CA3AF' }}>
                                                                {user.alias || user.name.charAt(0)}
                                                            </div>
                                                        )}

                                                        {/* Name / Alias Display */}
                                                        <div className="min-w-0">
                                                            <div
                                                                className={`font-bold truncate leading-tight ${isMobile ? 'text-center text-sm' : 'text-xs text-slate-800'}`}
                                                                style={isMobile && user.color ? { color: user.color } : {}}
                                                            >
                                                                {isMobile ? (user.alias || user.name.charAt(0)) : user.name}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                {/* Sticky Count Column - Adjust Offset for Mobile */}
                                                <td className={`sticky z-10 bg-white group-hover:bg-slate-50 border-r border-slate-200 p-0 text-center shadow-[4px_0_8px_rgba(0,0,0,0.02)] ${isMobile ? 'left-[50px]' : 'left-[120px]'}`}>
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
                                                    <td className={`sticky left-0 z-10 bg-white group-hover:bg-slate-50 border-r border-slate-200 shadow-[4px_0_8px_rgba(0,0,0,0.02)] ${isMobile ? 'p-1 w-[85px] min-w-[85px]' : 'p-2'}`}>
                                                        <div className="flex items-center justify-between">
                                                            <div className={`flex items-center gap-1.5 font-bold ${isMobile ? 'text-sm' : 'text-xs'} px-2 py-1.5 rounded-md border ${row.colorClass} flex-1 mr-1`}>
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
                                                                                            className={`absolute -top-1 -right-1 bg-white text-red-500 rounded-full p-0.5 transition-opacity shadow-sm border border-red-100 z-10 ${(isMobile && isEditMode) ? 'opacity-100' : 'opacity-0 group-hover/chip:opacity-100'}`}
                                                                                        >
                                                                                            <X size={8} />
                                                                                        </button>
                                                                                    )}
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                    {isEditMode && (
                                                                        <div className={`mt-1 w-full flex justify-center transition-opacity ${(isMobile && isEditMode) ? 'opacity-100' : 'opacity-0 group-hover/cell:opacity-100'}`}>
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
        </div>
    );
};

export default DashboardPage;
