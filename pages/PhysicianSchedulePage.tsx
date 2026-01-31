
import React, { useState, useMemo, useEffect } from 'react';
import { db } from '../services/store';
import { Doctor, UserRole, DoctorStationConfig, DateEventType, DoctorShift } from '../types';
import { ChevronLeft, ChevronRight, Download, Lock, RefreshCw, Save, Unlock, User, UserPlus, X, Calendar as CalendarIcon, Clock, Filter, Sliders, ArrowUpDown, Wand2, BarChart2, Check, AlertCircle, Plus, LayoutGrid, List as ListIcon, Trash2, Briefcase, FileText, MapPin, FileSpreadsheet } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import ConfirmModal from '../components/ConfirmModal';
import { supabase } from '../services/supabaseClient';

interface PhysicianSchedulePageProps {
    currentUser: any;
}

// Helper: Get Local ISO String YYYY-MM-DD
const toLocalISOString = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};
// Alias for internal use if needed
const propsToLocalISOString = toLocalISOString;

const LOCATIONS = ['北投', '大直', '台中'];

const LOCATION_COLORS: Record<string, string> = {
    '北投': 'bg-blue-500 border-blue-600',
    '大直': 'bg-[#A1887F] border-[#8D6E63]', // Light Brown (Material Brown 300/400 range)
    '台中': 'bg-orange-500 border-orange-600'
};

const PhysicianSchedulePage: React.FC<PhysicianSchedulePageProps> = ({ currentUser }) => {
    
    // --- Copy Text Generators ---
    const generateBeitouCopyText = (date: Date, shifts: any[], doctors: Doctor[]) => {
        const dateStr = `${propsToLocalISOString(date)} (${['日', '一', '二', '三', '四', '五', '六'][date.getDay()]})`;
        const dateKey = propsToLocalISOString(date);
        
        const getDocs = (stationName: string) => {
            return shifts
                .filter(s => s.date === dateKey && s.location === '北投' && (s.scheduled_station === stationName || s.station === stationName))
                .map(s => {
                    const d = doctors.find(doc => doc.id === s.doctorId);
                    let name = d?.alias || d?.name?.charAt(0) || '?';
                    // 如果有晚班任務標籤，加上 (晚)
                    if (s.task === '晚班') {
                        name += '(晚)';
                    }
                    return name;
                });
        };

        const mainDocs = getDocs('主');
        const assistDocs = getDocs('輔');
        const imgDocs = getDocs('影像');
        const expDocs = getDocs('解說');
        const supDocs = getDocs('支援');
        const giDocs = getDocs('GI');
        
        // 檢查崗位在行政的醫師
        const adminDocs = shifts
            .filter(s => s.date === dateKey && (s.station === '行政' || s.scheduled_station === '行政'))
            .map(s => {
                const d = doctors.find(doc => doc.id === s.doctorId);
                return d?.alias || d?.name?.charAt(0) || '?';
            });
        
        // 使用手動輸入的北投客戶數
        const manualStats = db.getDailyStats(dateKey);
        const radTotal = manualStats?.beitou_clients ?? '';

        const lines = [
            `${date.getMonth() + 1}/${date.getDate()} （${['日', '一', '二', '三', '四', '五', '六'][date.getDay()]}）`,
            `影像：${imgDocs.join('/')}`,
            `解說：${expDocs.join('/')}`,
            `支援：${supDocs.join('/')}`,
            `GI：${giDocs.join('/')}`,
            adminDocs.length > 0 ? `行政：${adminDocs.join('/')}` : '',
            `總人數 : ${radTotal}人`,
            `MR：      人`,
            `GI：     台`
        ];

        return lines.filter(l => l !== '').join('\n');
    };

    const generateDazhiCopyText = (date: Date, shifts: any[], doctors: Doctor[]) => {
        const dateKey = propsToLocalISOString(date);

        const getFullDocs = (stationName: string) => {
            return shifts
                .filter(s => s.date === dateKey && s.location === '大直' && (s.scheduled_station === stationName || s.station === stationName))
                .map(s => {
                    const d = doctors.find(doc => doc.id === s.doctorId);
                    let suffix = ' 醫師'; // Default suffix
                    if (s.scheduled_station === '腸胃' && d?.name === '梁程超') suffix = ' 院長 醫師'; // Example mimic
                    
                    // Specific logic: if "Remote" (遠距), append "(北投)"
                    if (['遠班', '遠距', '遠'].includes(s.scheduled_station || '')) return `${d?.name} 醫師 (北投)`;
                    
                    return `${d?.name}${suffix}`;
                });
        };
        
        // Special handler for imaging line: get "遠班" doctors regardless of location
        const getRemoteDocs = () => {
            return shifts
                .filter(s => {
                    if (s.date !== dateKey) return false;
                    const station = s.scheduled_station || s.station;
                    return ['遠班', '遠距', '遠'].includes(station);
                })
                .map(s => {
                    const d = doctors.find(doc => doc.id === s.doctorId);
                    // Append (北投) if location is 北投
                    if (s.location === '北投') {
                        return `${d?.name} 醫師 (北投)`;
                    }
                    return `${d?.name} 醫師`;
                });
        };
        
        // Specific Stations
        // User Request: Imaging line shows "遠班" doctors, with (北投) suffix if location is 北投
        const imgDocs = getRemoteDocs();
        const expDocs = getFullDocs('解說');
        const giDocs = [...getFullDocs('GI'), ...getFullDocs('腸胃')]; // GI or 腸胃
        const anesthDocs = [...getFullDocs('麻醫'), ...getFullDocs('麻醉')];

        // 3-Specialty
        const getSpecDocs = (station: string) => {
             return shifts
                .filter(s => s.date === dateKey && s.location === '大直' && (s.scheduled_station === station || s.station === station))
                .map(s => {
                    const d = doctors.find(doc => doc.id === s.doctorId);
                    return d?.name || '';
                }).join('、');
        };
        const gynDocs = getSpecDocs('婦科');
        const entDocs = getSpecDocs('耳鼻喉科');
        const eyeDocs = getSpecDocs('眼科');

        const lines = [
            `${date.getMonth() + 1}/${date.getDate()}(${['日', '一', '二', '三', '四', '五', '六'][date.getDay()]})`,
            `影像 : ${imgDocs.join('、')}`,
            `解說 : ${expDocs.join('、')}`,
            `腸胃：${giDocs.join('、')}`,
            `麻醫：${anesthDocs.join('、')}`,
            `3科會診醫師(09:00~12:00)`,
            `婦科：${gynDocs}`,
            `耳鼻喉科：${entDocs}`,
            `眼科：${eyeDocs}`
        ];

         return lines.filter(l => l !== '').join('\n');
    };

    const [currentDate, setCurrentDate] = useState(new Date());
    const currentYearMonth = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
    const [isLocked, setIsLocked] = useState(db.isMonthLocked(currentYearMonth));
    
    // Mobile Detection
    const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 1024 : false);
    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 1024);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);
    
    // Permission Check
    // Can edit if Admin/Scheduler AND NOT Locked
    const canEdit = (currentUser.role === UserRole.SYSTEM_ADMIN || currentUser.role === UserRole.SCHEDULER) && !isLocked;
    const canManageLock = currentUser.role === UserRole.SYSTEM_ADMIN || currentUser.role === UserRole.SCHEDULER;
    
    const [doctors, setDoctors] = useState<Doctor[]>(db.getDoctors());
    const [shifts, setShifts] = useState(db.getDoctorShifts());
    const [staffShifts, setStaffShifts] = useState(db.shifts); // New: For Radiologist Total Count

    // Define User's Preferred Order and Defaults
    const PREFERRED_STATIONS = [
        { name: '解說', location: '北投' },
        { name: '影像', location: '北投' },
        { name: '遠班', location: '大直' },
        { name: '遠班', location: '北投' },
        { name: '支援', location: '大直' },
        { name: 'GI', location: '北投' },
        { name: '麻醉', location: '北投' },
        { name: '耳鼻喉科', location: '台中' },
        { name: '眼科', location: '台中' },
        { name: '婦科', location: '台中' },
        { name: '行政', location: '北投' }
    ];

    const [stations, setStations] = useState<DoctorStationConfig[]>(() => {
        let currentList = db.settings.doctorStations || [];
        
        // Ensure defaults if empty
        if (currentList.length === 0) {
            currentList = [
             { name: '影像', location: '北投' }, { name: '遠距', location: '北投' },
             { name: '支援', location: '大直' },
             { name: '眼科', location: '台中' }, { name: '耳鼻喉科', location: '台中' }, { name: '婦科', location: '台中' }
            ];
        }

        // Normalize migration (string check)
        if (typeof currentList[0] === 'string') {
             currentList = (currentList as any[]).map(s => ({
                name: s,
                location: ['眼科', '耳鼻喉科', '婦科'].includes(s) ? '台中' : (['支援'].includes(s) ? '大直' : '北投')
            }));
        }

        return currentList;
    });

    
    // Edit Modal State
    const [selectedCell, setSelectedCell] = useState<{ doctorId: string, date: string } | null>(null);
    const [editData, setEditData] = useState<{ station: string, workTime: string, note: string, location: string, task: string }>({ station: '', workTime: '', note: '', location: '', task: '' });
    const [viewMode, setViewMode] = useState<'personnel' | 'station' | 'daily' | 'statistics'>(() => {
        return currentUser.role === UserRole.VIEWER ? 'daily' : 'personnel';
    });
    const [isQuickExcludeMode, setIsQuickExcludeMode] = useState(false);
    const [isReorderMode, setIsReorderMode] = useState(false);
    
    // Quick Assign (Paintbrush) State
    const [isQuickAssignMode, setIsQuickAssignMode] = useState(false);
    const [quickAssignData, setQuickAssignData] = useState<{ station: string, location: string, workTime: string }>({ station: '影像', location: '北投', workTime: '' });

    const [requirements, setRequirements] = useState(db.getStationRequirements());

    const dateRange = useMemo(() => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        
        // Mobile weekly view for Personnel perspective
        if (isMobile && viewMode === 'personnel') {
            const dates = [];
            for (let i = 0; i < 7; i++) {
                const d = new Date(currentDate);
                d.setDate(currentDate.getDate() + i);
                dates.push(toLocalISOString(d));
            }
            return dates;
        }

        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const dates = [];
        for (let i = 1; i <= daysInMonth; i++) {
            const d = new Date(year, month, i);
            dates.push(toLocalISOString(d));
        }
        return dates;
    }, [currentDate, isMobile, viewMode]); // Recalculate on date, mode or resize

    // Assign Doctor Modal State (for Station View)
    const [assignModal, setAssignModal] = useState<{ station: string, location: string, date: string } | null>(null);
    const [showAutoScheduleConfirm, setShowAutoScheduleConfirm] = useState(false);
    const [isAutoScheduling, setIsAutoScheduling] = useState(false);
    
    // Target Days Modal State
    const [showTargetDaysModal, setShowTargetDaysModal] = useState(false);
    const [targetDays, setTargetDays] = useState<Record<string, number>>({});
    const [batchDays, setBatchDays] = useState<number>(20); // Default batch value
    
    const [simulatedShifts, setSimulatedShifts] = useState<DoctorShift[] | null>(null);
    const [isSimulationMode, setIsSimulationMode] = useState(false);
    const [memoModal, setMemoModal] = useState<{ date: string; content: string } | null>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    // Filter shifts for display/logic depending on simulation mode
    const activeShifts = useMemo(() => {
        if (isSimulationMode) {
            // Hide existing auto-generated shifts to prevent duplicates/ghosts
            return shifts.filter(s => !s.isAutoGenerated);
        }
        return shifts;
    }, [shifts, isSimulationMode]);

    // Specialty Order Modal State
    const [showSpecialtyOrderModal, setShowSpecialtyOrderModal] = useState(false);
    const [tempSpecialties, setTempSpecialties] = useState<string[]>([]);
    const [specialtyOrder, setSpecialtyOrder] = useState<string[]>(db.settings.doctorSpecialties || []);

    const handleOpenSpecialtyOrder = () => {
        // Ensure we have the latest list from DB + any derived ones from loaded doctors
        const currentSpecs = new Set(db.settings.doctorSpecialties || []);
        // Also add any specialties found in current doctors that might be missing
        doctors.forEach(d => {
            if (d.specialty) currentSpecs.add(d.specialty);
        });
        const list = Array.from(currentSpecs);
        setTempSpecialties(list);
        setShowSpecialtyOrderModal(true);
    };

    const handleSaveSpecialtyOrder = async () => {
        db.settings.doctorSpecialties = tempSpecialties;
        await db.saveSettings();
        setSpecialtyOrder([...tempSpecialties]);
        setShowSpecialtyOrderModal(false);
    };

    // --- Memo Handlers ---
    const handleSaveMemo = async (date: string, content: string) => {
        try {
            // First, remove any existing doctor note for this date to avoid duplicates
            await db.removeHolidaysByDateAndType(date, DateEventType.DOCTOR_NOTE);

            // If content is not empty, add the new note
            if (content.trim()) {
                await db.addHoliday({
                    date,
                    name: content.trim(),
                    type: DateEventType.DOCTOR_NOTE
                });
            }

            setMemoModal(null);
        } catch (error) {
            console.error('Save doc memo error:', error);
            alert('更新失敗');
        }
    };

    const handleDeleteMemo = async (date: string) => {
        try {
            await db.removeHolidaysByDateAndType(date, DateEventType.DOCTOR_NOTE);
            setMemoModal(null);
        } catch (error) {
            console.error('Delete doc memo error:', error);
            alert('刪除失敗');
        }
    };
    
    const moveSpecialty = (index: number, direction: 'up' | 'down') => {
        const newList = [...tempSpecialties];
        if (direction === 'up' && index > 0) {
            [newList[index], newList[index - 1]] = [newList[index - 1], newList[index]];
        } else if (direction === 'down' && index < newList.length - 1) {
            [newList[index], newList[index + 1]] = [newList[index + 1], newList[index]];
        }
        setTempSpecialties(newList);
    };

    // Subscribe to database changes
    useEffect(() => {
        const handleDataChange = () => {
            setDoctors(db.getDoctors());
            setShifts(db.getDoctorShifts());
            setStaffShifts(db.shifts);
            setIsLocked(db.isMonthLocked(currentYearMonth));
        };

        const unsubscribe = db.subscribe(handleDataChange);
        
        // Ensure data is loaded
        db.initializeData().then(() => {
            setDoctors(db.getDoctors());
            setShifts(db.getDoctorShifts());
            setStaffShifts(db.shifts);
        });

        return () => unsubscribe();
    }, [currentYearMonth]);

    const handleToggleLock = async () => {
        if (!canManageLock) return;
        const newLockState = await db.toggleMonthLock(currentYearMonth);
        setIsLocked(newLockState);
    };

    const handleStationCellClick = (station: string, location: string, date: string) => {
        if (currentUser.role !== UserRole.SYSTEM_ADMIN && currentUser.role !== UserRole.SUPERVISOR && currentUser.role !== UserRole.SCHEDULER) return;
        setAssignModal({ station, location, date });
    };

    const handleAssignDoctor = async (doctorId: string) => {
        if (!assignModal) return;

        // Check if doctor already has a shift in current context
        const contextShifts = isSimulationMode ? (simulatedShifts || []) : activeShifts;
        const doc = doctors.find(d => d.id === doctorId);
        const existingShift = contextShifts.find(s => s.doctorId === doctorId && s.date === assignModal.date);
        
        const confirmMsg = `${doc?.name} 當天已有排班 (${existingShift?.scheduled_station || '未分配'})。要改派至 ${assignModal.station} (${assignModal.location}) 嗎？`;

        if (isSimulationMode) {
            if (existingShift && !confirm(confirmMsg)) {
                setAssignModal(null);
                return;
            }

            const newSimShift: DoctorShift = {
                id: existingShift?.id || crypto.randomUUID(),
                doctorId: doctorId,
                date: assignModal.date,
                station: assignModal.station === '晚班' ? (existingShift?.scheduled_station || '影像') : assignModal.station,
                scheduled_station: assignModal.station === '晚班' ? (existingShift?.scheduled_station || '影像') : assignModal.station,
                location: assignModal.location,
                task: assignModal.station === '晚班' ? '晚班' : '',
                isAutoGenerated: true
            };

            const updated = [...(simulatedShifts || [])].filter(s => !(s.doctorId === doctorId && s.date === assignModal.date));
            updated.push(newSimShift);
            setSimulatedShifts(updated);
            setAssignModal(null);
            return;
        }

        // Production Mode Logic
        if (existingShift && confirm(confirmMsg)) {
             if (assignModal.station === '晚班') {
                 await db.assignDoctorSchedule(doctorId, assignModal.date, existingShift.scheduled_station, existingShift.workTime, existingShift.note, existingShift.location, '晚班');
             } else {
                 await db.assignDoctorSchedule(doctorId, assignModal.date, assignModal.station, undefined, undefined, assignModal.location);
             }
        } else if (!existingShift) {
             if (assignModal.station === '晚班') {
                 await db.assignDoctorSchedule(doctorId, assignModal.date, assignModal.station, undefined, undefined, assignModal.location, '晚班');
             } else {
                 await db.assignDoctorSchedule(doctorId, assignModal.date, assignModal.station, undefined, undefined, assignModal.location);
             }
        }
        setAssignModal(null);
    };

    const handleCellClick = async (doctorId: string, date: string) => {
        if (currentUser.role !== UserRole.SYSTEM_ADMIN && currentUser.role !== UserRole.SUPERVISOR && currentUser.role !== UserRole.SCHEDULER) return;
        
        const contextShifts = isSimulationMode ? (simulatedShifts || []) : activeShifts;
        const shift = contextShifts.find(s => s.doctorId === doctorId && s.date === date);

        if (isQuickExcludeMode) {
             if (isSimulationMode) {
                 const updated = [...(simulatedShifts || [])].filter(s => !(s.doctorId === doctorId && s.date === date));
                 if (!(shift && shift.scheduled_station === 'X')) {
                     updated.push({
                         id: shift?.id || crypto.randomUUID(),
                         doctorId,
                         date,
                         station: 'X',
                         scheduled_station: 'X',
                         location: shift?.location || '',
                         isAutoGenerated: true
                     });
                 }
                 setSimulatedShifts(updated);
                 return;
             }

             if (shift && shift.scheduled_station === 'X') {
                 await db.assignDoctorSchedule(doctorId, date, '');
             } else {
                 await db.assignDoctorSchedule(doctorId, date, 'X'); 
             }
             setShifts([...db.getDoctorShifts()]);
             return; 
        }

        if (isQuickAssignMode) {
             if (isSimulationMode) {
                 const updated = [...(simulatedShifts || [])].filter(s => !(s.doctorId === doctorId && s.date === date));
                 updated.push({
                     id: shift?.id || crypto.randomUUID(),
                     doctorId,
                     date,
                     station: quickAssignData.station,
                     scheduled_station: quickAssignData.station,
                     location: quickAssignData.location,
                     workTime: quickAssignData.workTime,
                     isAutoGenerated: true
                 });
                 setSimulatedShifts(updated);
                 return;
             }
             await db.assignDoctorSchedule(doctorId, date, quickAssignData.station, quickAssignData.workTime, undefined, quickAssignData.location);
             setShifts(db.getDoctorShifts());
             return;
        }

        if (shift) {
            const doc = doctors.find(d => d.id === doctorId);
            const dayOfWeek = new Date(date).getDay();
            const ws = doc?.weekdaySettings?.find(w => w.dayOfWeek === dayOfWeek);
            
            setEditData({ 
                station: shift.scheduled_station || '', 
                workTime: shift.workTime || ws?.workTime || '', 
                note: shift.note || '', 
                location: shift.location || '', 
                task: shift.task || ws?.task || '' 
            });
        } else {
             const doc = doctors.find(d => d.id === doctorId);
             const dayOfWeek = new Date(date).getDay();
             const ws = doc?.weekdaySettings?.find(w => w.dayOfWeek === dayOfWeek);

             setEditData({ 
                 station: '', 
                 workTime: ws?.workTime || '', 
                 note: '', 
                 location: '', 
                 task: ws?.task || '' 
             });
        }
        setSelectedCell({ doctorId, date });
    };

    const handleSave = async () => {
        if (!selectedCell) return;

        if (isSimulationMode) {
            const updated = [...(simulatedShifts || [])].filter(s => !(s.doctorId === selectedCell.doctorId && s.date === selectedCell.date));
            if (editData.station) {
                updated.push({
                    id: crypto.randomUUID(),
                    doctorId: selectedCell.doctorId,
                    date: selectedCell.date,
                    station: editData.station,
                    scheduled_station: editData.station,
                    workTime: editData.workTime,
                    note: editData.note,
                    location: editData.location,
                    task: editData.task,
                    isAutoGenerated: true
                });
            }
            setSimulatedShifts(updated);
            setSelectedCell(null);
            return;
        }

        await db.assignDoctorSchedule(selectedCell.doctorId, selectedCell.date, editData.station, editData.workTime, editData.note, editData.location, editData.task);
        setShifts(db.getDoctorShifts());
        setSelectedCell(null);
    };

    const handleDelete = async () => {
         if (!selectedCell) return;

         if (isSimulationMode) {
             const updated = [...(simulatedShifts || [])].filter(s => !(s.doctorId === selectedCell.doctorId && s.date === selectedCell.date));
             setSimulatedShifts(updated);
             setSelectedCell(null);
             return;
         }

        await db.assignDoctorSchedule(selectedCell.doctorId, selectedCell.date, '');
        setShifts(db.getDoctorShifts());
        setSelectedCell(null);
    };

    const handleExportPDF = async (e?: React.MouseEvent) => {
        if (e) e.preventDefault();
        
        try {
            const doc = new jsPDF('l', 'mm', 'a4');
            let fontName = 'helvetica'; // Default fallback

            // Load Open Huninn font for Chinese support (matches DashboardPage logic)
            try {
                const pathsToTry = [
                    '/schedule/fonts/jf-openhuninn-2.1.ttf',
                    '/fonts/jf-openhuninn-2.1.ttf'
                ];

                let response: Response | null = null;
                
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

                if (response) {
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
                } else {
                     console.warn('Font file not found, using default font.');
                }
            } catch (error) {
                console.error('Failed to load font:', error);
                alert('字體載入失敗，將使用預設字體（中文可能會顯示為亂碼）。');
            }

            const title = '醫師排班表';
            const subtitle = `${dateRange[0]} ~ ${dateRange[dateRange.length - 1]}`;
            const exportDate = `匯出日期: ${new Date().toLocaleDateString('zh-TW')}`;

            // REMOVED Title as requested
            // doc.setFontSize(14);
            // doc.setFont(fontName); 
            // doc.text(title, 7, 10);

            // Subtitle and Date only
            doc.setFont(fontName); 
            doc.setFontSize(12); // Increased from 10
            doc.text(`${title} ${subtitle}`, 7, 6); // Moved to top, added title

            doc.setFontSize(10); // Increased from 9
            const pageWidth = doc.internal.pageSize.width;
            doc.text(exportDate, pageWidth - 7, 6, { align: 'right' }); // Moved to top

            const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
            
            // Prepare Headers
            let radiologistStartIndex = -1;
            let radiologistEndIndex = -1;
            let giStartIndex = -1;
            let giEndIndex = -1;

            const dateHeaders = dateRange.map(date => {
                const d = new Date(date);
                return `${d.getDate()} \n${weekDays[d.getDay()]}`;
            });

            // Common Table Config
            const tableConfig: any = {
                theme: 'grid',
                rowPageBreak: 'avoid',
                tableLineWidth: 0.2,
                styles: {
                    font: fontName,
                    fontSize: 7, // Default body font
                    cellPadding: 0.1, // Reduced global padding
                    valign: 'middle',
                    halign: 'center',
                    lineWidth: 0.2,
                    lineColor: [0, 0, 0]
                },
                headStyles: {
                    fillColor: [66, 66, 66],
                    textColor: [255, 255, 255],
                    font: fontName,
                    fontSize: 8,
                    minCellHeight: 5 
                },
                // ... (didParseCell logic remains same)
                didParseCell: function(data: any) {
                    // Header Styling
                    if (data.section === 'head' && data.column.index > 0) {
                        const dateStr = dateRange[data.column.index - 1];
                        const d = new Date(dateStr);
                        if (d.getDay() === 0 || d.getDay() === 6) {
                            data.cell.styles.textColor = [255, 100, 100]; 
                        }
                    }
                    // Body Styling
                    if (data.section === 'body') {
                         if (viewMode === 'station') {
                            // User requested to compare without background colors
                            /*
                            if (data.column.index === 0) {
                                const location = data.row.raw[0]?.location;
                                if (location === '北投') data.cell.styles.fillColor = [239, 246, 255]; 
                                if (location === '大直') data.cell.styles.fillColor = [250, 245, 240]; 
                                if (location === '台中') data.cell.styles.fillColor = [255, 247, 237]; 
                            }
                            if (data.column.index > 0) {
                                const stationName = data.row.raw[0]?.content || '';
                                if (stationName.includes('遠')) data.cell.styles.fillColor = [254, 242, 242];
                                else if (stationName.includes('腸胃') || stationName.toLowerCase().includes('gi')) data.cell.styles.fillColor = [239, 246, 255];
                                else if (stationName.includes('解說')) data.cell.styles.fillColor = [255, 247, 237];
                                else if (stationName.includes('支援')) data.cell.styles.fillColor = [254, 252, 232];
                                else if (stationName.includes('行政')) data.cell.styles.fillColor = [255, 255, 255];
                                else if (stationName.includes('眼') || stationName.includes('婦') || stationName.includes('耳')) data.cell.styles.fillColor = [255, 255, 255];
                                else data.cell.styles.fillColor = [240, 253, 250];
                            }
                            */
                        }
 else {
                            if (data.column.index > 0) {
                                 const raw = data.cell.raw;
                                 if (raw && raw.rawShift) {
                                      const rawText = raw.content || '';
                                      if (rawText.includes('北') || raw.rawShift.location === '北') data.cell.styles.fillColor = [220, 235, 255];
                                      if (rawText.includes('直') || raw.rawShift.location === '直') data.cell.styles.fillColor = [240, 220, 200];
                                      if (rawText.includes('中') || raw.rawShift.location === '中') data.cell.styles.fillColor = [255, 235, 235]; // Redder light shade
                                      
                                      if (raw.rawShift.task && raw.rawShift.task.includes('晚班')) {
                                          data.cell.styles.textColor = [220, 0, 0];
                                      }
                                 } else if (raw === 'X') {
                                     data.cell.styles.textColor = [200, 200, 200];
                                 }
                            }
                        }
                    }
                },
                willDrawCell: function(data: any) {
                    if (data.section === 'body' && data.column.index > 0) {
                        const raw = data.cell.raw;
                        if ((raw && raw.rawShift) || (raw && raw.rawStationShifts)) {
                            data.cell.text = []; 
                        }
                    }
                },
                didDrawCell: function(data: any) {
                     // Custom Rendering
                     if (viewMode !== 'station' && data.section === 'body') {
                         const rowIndex = data.row.index;
                         if (radiologistStartIndex !== -1 && rowIndex === radiologistStartIndex) {
                             doc.setLineWidth(0.5);
                             doc.setDrawColor(0, 0, 0);
                             doc.line(data.cell.x, data.cell.y, data.cell.x + data.cell.width, data.cell.y);
                         }
                         if (radiologistEndIndex !== -1 && rowIndex === radiologistEndIndex) {
                             doc.setLineWidth(0.5);
                             doc.setDrawColor(0, 0, 0);
                             doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
                         }

                         // GI Borders
                         if (giStartIndex !== -1 && rowIndex === giStartIndex) {
                             doc.setLineWidth(0.5);
                             doc.setDrawColor(0, 0, 0);
                             doc.line(data.cell.x, data.cell.y, data.cell.x + data.cell.width, data.cell.y);
                         }
                         if (giEndIndex !== -1 && rowIndex === giEndIndex) {
                             doc.setLineWidth(0.5);
                             doc.setDrawColor(0, 0, 0);
                             doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
                         }
                     }

                     if (viewMode !== 'station' && data.section === 'body' && data.column.index > 0 && data.cell.raw && data.cell.raw.rawShift) {
                         const { station, time, task, location } = data.cell.raw.rawShift;
                         const x = data.cell.x + data.cell.width / 2;
                         
                         let contentHeight = 2.5;
                         if (time) contentHeight += 1.8;
                         if (task) contentHeight += 1.8;
                         
                         const lineSpacing = 0.1; // Reduced spacing further
                         if (time) contentHeight += lineSpacing;
                         if (task) contentHeight += lineSpacing;

                         let y = data.cell.y + (data.cell.height - contentHeight) / 2 + 2.0;

                         doc.setTextColor(0, 0, 0); 
                         
                         doc.setFontSize(8.5); // Increased station font size
                         const stationWidth = doc.getTextWidth(station);
                         
                         if (location) {
                             doc.setFontSize(5);
                             const locationWidth = doc.getTextWidth(' ' + location);
                             doc.setFontSize(8.5); // Restore to updated size
                             
                             const totalWidth = stationWidth + locationWidth;
                             const startX = x - totalWidth / 2;
                             
                             doc.text(station, startX, y);
                             
                             doc.setFontSize(5);
                             doc.text(' ' + location, startX + stationWidth, y);
                         } else {
                             doc.text(station, x, y, { align: 'center' });
                         }
                         y += 2.5 + lineSpacing;

                         if (time) {
                             doc.setFontSize(5);
                             doc.text(time, x, y, { align: 'center' });
                             y += 1.8 + lineSpacing; 
                         }
                         
                         if (task) {
                            doc.setFontSize(5);
                            if (task.includes('晚班')) {
                                doc.setTextColor(220, 0, 0); 
                            } else {
                                doc.setTextColor(0, 0, 0);
                            }
                            doc.text(task, x, y, { align: 'center' });
                            doc.setTextColor(0, 0, 0);
                         }
                     }
                     
                     // Station View (Compressed for Single Page)
                     if (viewMode === 'station' && data.section === 'body' && data.column.index > 0 && data.cell.raw && data.cell.raw.rawStationShifts) {
                         const shifts = data.cell.raw.rawStationShifts;
                         if (shifts.length === 0) return;
                         
                         const x = data.cell.x + data.cell.width / 2;
                         
                         // Calculate Height for Centering
                         // Name: 8pt (~2.8mm line height) -> use 3.2mm spacing
                         // Details: 5pt (~1.8mm line height) -> use 2.2mm spacing
                         
                         let totalHeight = 0;
                         shifts.forEach((shift: any, idx: number) => {
                             totalHeight += 3.2; // Name (Increased for 8pt)
                             // Tighter spacing if details exist
                             const hasDetails = shift.time || (shift.task && !(shift.stationName === '晚班' && shift.task === '晚班'));
                             if (hasDetails) totalHeight -= 0.7; // Reduce gap by 0.7mm (3.2 -> 2.5) for first detail

                             if (shift.time) totalHeight += 2.2;
                             if (shift.task && !(shift.stationName === '晚班' && shift.task === '晚班')) totalHeight += 2.2; 
                             if (idx < shifts.length - 1) totalHeight += 0.8; // Spacing
                         });
                         
                         let y = data.cell.y + (data.cell.height - totalHeight) / 2 + 2.2; // Baseline adjust
                         
                         shifts.forEach((shift: any, idx: number) => {
                             // Name (8pt) - Requested
                             // Name (8pt) - Requested
                             doc.setFontSize(8);
                             doc.text(shift.name, x, y, { align: 'center' });
                             y += 2.5; // Reduced from 3.2 to tighten spacing with details 
                             
                             // Time (5pt)
                             if (shift.time) {
                                 doc.setFontSize(5);
                                 doc.text(shift.time, x, y, { align: 'center' });
                                 y += 2.2; 
                             }
                             
                             // Task (5pt)
                             if (shift.task && !(shift.stationName === '晚班' && shift.task === '晚班')) {
                                 doc.setFontSize(5);
                                 doc.text(shift.task, x, y, { align: 'center' });
                                 y += 2.2; 
                             }
                             
                             if (idx < shifts.length - 1) {
                                 y += 0.8;
                             }
                         });
                     }
                }
            };

            let headRow = [];
            let bodyRows: any[] = [];

            if (viewMode === 'station') {
                 // Single Page Logic with Sections
                headRow = [['崗位', ...dateHeaders]];
                
                LOCATIONS.forEach((loc, locIndex) => {
                    const locStations = stations.filter(s => s.location === loc);
                    if (locStations.length === 0) return;
                    
                    // Location Header Row
                    const locationHeaderRow: any[] = [
                        {
                            content: loc,
                            colSpan: dateRange.length + 1,
                            styles: {
                                fillColor: loc === '北投' ? [220, 235, 255] : loc === '大直' ? [245, 235, 230] : [255, 237, 220],
                                fontStyle: 'bold',
                                halign: 'center',
                                fontSize: 10, // Reduced to 10pt as requested
                                cellPadding: 0.5, // Further reduced padding
                                minCellHeight: 5 // Further reduced min height
                            }
                        }
                    ];
                    bodyRows.push(locationHeaderRow);
                    
                    // Add Main/Assistant Shift Row (only for Beitou)
                    if (loc === '北投') {
                        // Build Main/Assistant row with date-specific data
                        const mainAssistantRow: any[] = [
                            {
                                content: '主/輔',
                                styles: {
                                    fontStyle: 'bold',
                                    fillColor: [255, 250, 205], // Light yellow
                                    halign: 'center',
                                    fontSize: 8
                                }
                            }
                        ];
                        
                        dateRange.forEach(date => {
                            const radiographerShifts = db.shifts;
                            const mainShift = radiographerShifts.find(s => 
                                s.date === date && s.station?.includes('場控')
                            );
                            const assistantShift = radiographerShifts.find(s => 
                                s.date === date && s.specialRoles?.includes('輔班')
                            );
                            
                            const mainAlias = mainShift 
                                ? (db.getUsers().find(u => u.id === mainShift.userId)?.alias || '-')
                                : '-';
                            const assistantAlias = assistantShift 
                                ? (db.getUsers().find(u => u.id === assistantShift.userId)?.alias || '-')
                                : '-';
                            
                            mainAssistantRow.push({
                                content: `${mainAlias}/${assistantAlias}`,
                                styles: {
                                    fillColor: [255, 250, 205], // Light yellow to match header
                                    halign: 'center',
                                    fontSize: 7
                                }
                            });
                        });
                        
                        bodyRows.push(mainAssistantRow);
                    }
                    
                    locStations.forEach(st => {
                         // Filter out '晚班' for '大直' location as requested
                         if (st.location === '大直' && st.name === '晚班') return;
                         
                         const rowData: any[] = [{ content: `${st.name}`, styles: { fontStyle: 'bold' }, location: st.location }];
                         
                         dateRange.forEach(date => {
                             const assignedShifts = shifts.filter(s => {
                                 if (s.date !== date || s.location !== st.location) return false;
                                 if (st.name === '晚班') return s.task?.includes('晚班');
                                 if (s.scheduled_station === st.name) return true;
                                 if (st.name === '婦科' && s.scheduled_station === '解說') {
                                     const doc = doctors.find(d => d.id === s.doctorId);
                                     return doc?.capabilities?.includes('婦科');
                                 }
                                 return false;
                             });
                                                          const formatTimeShort = (time: string) => {
                                  if (!time) return '';
                                  return time.replace(/\s/g, '').replace(/(\d{1,2}):(\d{2})/g, (match, hour, minute) => {
                                      const h = parseInt(hour, 10);
                                      return minute === '00' ? `${h}` : `${h}'`;
                                  });
                              };
                             
                             const docInfos = assignedShifts.map(s => {
                                  const doc = doctors.find(d => d.id === s.doctorId);
                                  return doc?.name || '?';
                             }).join('\n');
                             
                             let cellStyles: any = {};
                             if (assignedShifts.length > 0) {
                                 let totalHeight = 0;
                                 assignedShifts.forEach((s, idx) => {
                                      // Adjusted Height Estimates for 8pt font (Physician name)
                                      totalHeight += 3.2; // Name (Requested 8pt ~ 3.2mm)
                                      if (s.workTime) totalHeight += 2.2; 
                                      const showTask = s.task && !(st.name === '晚班' && s.task === '晚班');
                                      if (showTask) totalHeight += 2.2;
                                      if (idx < assignedShifts.length - 1) totalHeight += 0.8;
                                 });
                                 cellStyles = { minCellHeight: Math.max(totalHeight + 1, 5) }; // Reduced minCellHeight
                             }

                             rowData.push({
                                 content: docInfos, // Dummy content for autoTable
                                 styles: cellStyles,
                                 rawStationShifts: assignedShifts.map(s => {
                                     const doc = doctors.find(d => d.id === s.doctorId);
                                     return {
                                         name: doc?.name || '?',
                                         time: formatTimeShort(s.workTime),
                                         task: s.task,
                                         stationName: st.name
                                     };
                                 })
                             });
                         });
                         bodyRows.push(rowData);
                    });
                });

            } else {
                 // Personnel View logic
                 headRow = [['醫師', ...dateHeaders]]; 
                const sortedDoctors = doctors.filter(doc => {
                    if (doc.isPartTime) return false;
                    // Check if doctor has any actual working shift (excluding 'X' or empty)
                    return shifts.some(s => 
                        s.doctorId === doc.id && 
                        dateRange.includes(s.date) && 
                        s.scheduled_station && 
                        s.scheduled_station !== 'X'
                    );
                });

                // Find Radiologist range
                const radioIndices = sortedDoctors
                    .map((d, i) => d.specialty === '放射科' ? i : -1)
                    .filter(i => i !== -1);
                
                if (radioIndices.length > 0) {
                    radiologistStartIndex = radioIndices[0];
                    radiologistEndIndex = radioIndices[radioIndices.length - 1];
                }

                // Find GI range
                const giIndices = sortedDoctors
                    .map((d, i) => d.specialty === '腸胃科' ? i : -1)
                    .filter(i => i !== -1);
                
                if (giIndices.length > 0) {
                    giStartIndex = giIndices[0];
                    giEndIndex = giIndices[giIndices.length - 1];
                }
                
                 const formatTimeShort = (time: string) => {
                     if (!time) return '';
                     return time.replace(/\s/g, '').replace(/(\d{1,2}):(\d{2})/g, (match, hour, minute) => {
                         const h = parseInt(hour, 10);
                         return minute === '00' ? `${h}` : `${h}'`;
                     });
                 };
                 const formatLocShort = (loc: string) => (loc === '北投' ? '北' : loc === '台中' ? '中' : loc === '大直' ? '直' : loc ? `(${loc})` : '');

                // Push to outer bodyRows
                bodyRows = sortedDoctors.map(doc => {
                    const rowData: any[] = [{ content: doc.name, styles: { fontStyle: 'bold', fontSize: 9, cellPadding: { top: 0.2, bottom: 0.2, left: 0, right: 0 } } }];
                    dateRange.forEach(date => {
                         const shift = shifts.find(s => s.doctorId === doc.id && s.date === date);
                         const isExcluded = doc.excludedDays?.includes(new Date(date).getDay());
                         
                         if (shift) {
                             const st = shift.scheduled_station;
                             if (st === 'X') {
                                 rowData.push('X');
                             } else if (st) {
                                 const allShiftsForDate = shifts.filter(s => s.doctorId === doc.id && s.date === date);
                                 const hasGynecology = allShiftsForDate.some(s => s.scheduled_station === '婦科');
                                 const hasExplanation = allShiftsForDate.some(s => s.scheduled_station === '解說');
                                 let displayStation = (hasGynecology && hasExplanation) ? '解+婦' : st;
                                 if (displayStation === '耳鼻喉科') displayStation = 'ENT';
                                 
                                 let h = 2.8;
                                 if(shift.workTime) h += 2.2;
                                 if(shift.task) h += 2.2;
                                 // Location is now inline, so no extra height needed

                                 rowData.push({
                                     content: displayStation, 
                                     styles: { minCellHeight: 8.1 }, // Adjusted height as requested
                                     rawShift: {
                                         station: displayStation,
                                         time: formatTimeShort(shift.workTime),
                                         task: shift.task,
                                         location: formatLocShort(shift.location)
                                     }
                                 });
                             } else {
                                 rowData.push('');
                             }
                         } else if (isExcluded) {
                             rowData.push('X');
                         } else {
                             rowData.push('');
                         }
                    });
                    return rowData;
                });
            }

            // Unified autoTable call for both views
            if (bodyRows.length > 0) {
                 autoTable(doc, {
                    ...tableConfig,
                    startY: 9, // Moved higher from 11mm
                    head: headRow,
                    body: bodyRows,
                    margin: { top: 11, right: 2, bottom: 2, left: 2 },
                 });
            }
            
            // Generate Filename: YYYY-MM with view mode suffix
            const year = currentDate.getFullYear();
            const month = String(currentDate.getMonth() + 1).padStart(2, '0');
            const viewSuffix = viewMode === 'personnel' ? '人員' : viewMode === 'station' ? '崗位' : '';
            const filename = `${year}${month} 醫師排班表-${viewSuffix}.pdf`;

            doc.save(filename);

        } catch (error: any) {
            console.error(error);
            alert(`匯出 PDF 失敗: ${error.message || error}\n\n請截圖此畫面並回報。`);
        }
    };

    const handleExportExcel = async (e?: React.MouseEvent) => {
        if (e) e.preventDefault();
        try {
            const ExcelJS = (await import('exceljs')).default;
            const workbook = new ExcelJS.Workbook();
            
            // Shared Styles & Config
            const borderStyle: any = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            const fontBase = { name: 'Arial', size: 10 };
            const alignCenter = { vertical: 'middle', horizontal: 'center', wrapText: true } as any;

            const formatTimeForExcel = (timeStr: string) => {
                if (!timeStr) return '';
                // 8:00->8, 8:30->8', 16:00->16, 16:30->16'
                return timeStr
                    .replace(/:00/g, '')
                    .replace(/:30/g, "'")
                    .replace(/\b0+(\d)/g, '$1'); 
            };

            const applyPageSetup = (ws: any) => {

                ws.pageSetup = {
                    orientation: 'landscape',
                    fitToPage: true,
                    fitToWidth: 1,
                    fitToHeight: 1,
                    margins: {
                        left: 0.25, right: 0.25, top: 0.25, bottom: 0.25,
                        header: 0.3, footer: 0.3
                    }
                };
            };

            // --- Helper: Generate Header ---
            const generateHeader = (sheet: any) => {
                // Row 1: Title
                const titleRow = sheet.getRow(1);
                titleRow.getCell(1).value = `醫師排班表 ${dateRange[0]} ~ ${dateRange[dateRange.length - 1]}`;
                sheet.mergeCells(1, 1, 1, dateRange.length + 1);
                titleRow.getCell(1).font = { ...fontBase, size: 14, bold: true };
                titleRow.getCell(1).alignment = alignCenter;
                titleRow.height = 30;

                // Row 2: Date
                const headerRow2 = sheet.getRow(2);
                headerRow2.getCell(1).value = '項目 / 日期';
                headerRow2.getCell(1).font = { ...fontBase, bold: true };
                headerRow2.getCell(1).alignment = alignCenter;
                headerRow2.getCell(1).border = borderStyle;
                sheet.getColumn(1).width = 15; // Name column width

                // Fill Dates
                const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
                dateRange.forEach((dateStr, index) => {
                    const date = new Date(dateStr);
                    const colIndex = index + 2;
                    const cell = headerRow2.getCell(colIndex);
                    const dayOfWeek = date.getDay();
                    
                    cell.value = `${date.getDate()}\n${weekDays[dayOfWeek]}`;
                    cell.alignment = alignCenter;
                    cell.border = borderStyle;
                    cell.font = { ...fontBase, bold: true, color: (dayOfWeek === 0 || dayOfWeek === 6) ? { argb: 'FFFF0000' } : undefined };
                    
                    // User requested column width 7.2
                    sheet.getColumn(colIndex).width = 7.2;
                });
                headerRow2.height = 35;
            };

            // ==========================================
            // Sheet 1: 崗位視角 (Station View)
            // ==========================================
            const sheet1 = workbook.addWorksheet('崗位視角');
            applyPageSetup(sheet1);
            generateHeader(sheet1);
            
            let currentRowIndex = 3;

            const addLocationSection = (locationName: string, colorHex: string) => {
                const locShifts = shifts.filter(s => s.location === locationName);
                const locStations = db.settings.doctorStations.filter(ds => ds.location === locationName);
                
                if (!locShifts.length && !locStations.length) return;

                // Header
                const locRow = sheet1.getRow(currentRowIndex);
                locRow.getCell(1).value = locationName;
                sheet1.mergeCells(currentRowIndex, 1, currentRowIndex, dateRange.length + 1);
                locRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colorHex } };
                // User Request: Center + Size 14
                locRow.getCell(1).font = { ...fontBase, size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
                locRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
                locRow.height = 24; // Increased height for larger font
                currentRowIndex++;

                // Beitou Special Rows: Main -> Assistant -> Late
                if (locationName === '北投') {
                    // Use Radiographer Shifts (from db.shifts)
                    const radShifts = (db as any).shifts || [];
                    const users = (db as any).users || [];

                    // 1. Main Shift (場控)
                    const rowMain = sheet1.getRow(currentRowIndex);
                    rowMain.getCell(1).value = '場控';
                    rowMain.getCell(1).border = borderStyle;
                    rowMain.getCell(1).alignment = alignCenter;

                    dateRange.forEach((dateStr, colIdx) => {
                        const mainShift = radShifts.find((s: any) => s.date === dateStr && s.station?.includes('場控'));
                        const mainUser = mainShift ? users.find((u: any) => u.id === mainShift.userId) : null;
                        
                        const cell = rowMain.getCell(colIdx + 2);
                        cell.value = mainUser?.name || '';
                        cell.border = borderStyle;
                        cell.alignment = alignCenter;
                        cell.font = { ...fontBase, bold: false }; // No Bold
                    });
                    currentRowIndex++;

                    // 2. Assistant Shift (輔班)
                    const rowAssist = sheet1.getRow(currentRowIndex);
                    rowAssist.getCell(1).value = '輔班';
                    rowAssist.getCell(1).border = borderStyle;
                    rowAssist.getCell(1).alignment = alignCenter;

                    dateRange.forEach((dateStr, colIdx) => {
                        const assistShift = radShifts.find((s: any) => s.date === dateStr && s.specialRoles?.includes('輔班'));
                        const assistUser = assistShift ? users.find((u: any) => u.id === assistShift.userId) : null;
                        
                        const cell = rowAssist.getCell(colIdx + 2);
                        cell.value = assistUser?.name ? `${assistUser.name}(輔)` : ''; // Keep (輔)? User requested split, maybe just name is fine? Keeping specific suffix if useful or just name. Let's just use name since row title is '輔班'.
                        // Actually, let's keep name only for cleaner look since row header says it.
                        cell.value = assistUser?.name || '';
                        cell.border = borderStyle;
                        cell.alignment = alignCenter;
                        cell.font = { ...fontBase, size: 9 };
                    });
                    currentRowIndex++;

                    // 3. Late Shift (晚班) - Moved here
                    const rowLate = sheet1.getRow(currentRowIndex);
                    rowLate.getCell(1).value = '晚班';
                    rowLate.getCell(1).border = borderStyle;
                    rowLate.getCell(1).alignment = alignCenter;

                    dateRange.forEach((dateStr, colIdx) => {
                         // Find shifts with task '晚班' in this location (Multiple doctors possible)
                         const lateShifts = locShifts.filter(s => s.date === dateStr && s.task?.includes('晚班'));
                         
                         const date = new Date(dateStr);
                         const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                         const cell = rowLate.getCell(colIdx + 2);
                         cell.border = borderStyle;
                         if (isWeekend) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };

                         if (lateShifts.length > 0) {
                             const contentParts = lateShifts.map(lateShift => {
                                 const doc = doctors.find(d => d.id === lateShift.doctorId);
                                 const name = doc?.name || '?';
                                 const time = formatTimeForExcel(lateShift.workTime || (lateShift as any).work_time || '');
                                 return [name, time].filter(Boolean).join('\n');
                             });

                             cell.value = contentParts.join('\n'); // Single newline
                             cell.alignment = alignCenter;
                             cell.font = { ...fontBase, bold: false }; // No Bold
                         }
                    });
                    currentRowIndex++;
                }

                // Stations
                locStations.forEach(stationConfig => {
                    const station = stationConfig.name;
                    // Skip if station is explicitly '晚班' to avoid duplication
                    if (station === '晚班') return;

                    const row = sheet1.getRow(currentRowIndex);
                    row.getCell(1).value = station;
                    row.getCell(1).border = borderStyle;
                    row.getCell(1).alignment = alignCenter;

                    dateRange.forEach((dateStr, colIdx) => {
                        const date = new Date(dateStr);
                        const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                        const cell = row.getCell(colIdx + 2);
                        cell.border = borderStyle;
                        if (isWeekend) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };

                        // Modified: Strict check for scheduled_station only
                        const stationShifts = locShifts.filter(s => s.date === dateStr && s.scheduled_station === station);
                        
                        if (stationShifts.length > 0) {
                            const contentParts = stationShifts.map(shift => {
                                const doc = doctors.find(d => d.id === shift.doctorId);
                                const name = doc?.name || doc?.alias || '?';
                                
                                // User Request: Station View also needs Work Time and Task
                                const time = formatTimeForExcel(shift.workTime || (shift as any).work_time || '');
                                const task = (shift.task && !shift.task.includes('固定')) ? `(${shift.task})` : '';

                                return [name, time, task].filter(l => l && l.trim() !== '').join('\n');
                            });

                            cell.value = contentParts.join('\n'); // Single newline
                            cell.alignment = alignCenter;
                            cell.font = { ...fontBase, bold: false }; // No Bold
                            
                            // Check if ANY shift is simulated for coloring (simplified logic: if any is simulated, mark cell or part? 
                            // Since we don't have rich text per part here easily without complex construction, let's just color orange if ANY is simulated)
                            if (isSimulationMode && stationShifts.some(s => s.isAutoGenerated)) {
                                cell.font = { ...fontBase, color: { argb: 'FFD97706' }, bold: false }; // Keep no bold
                            }
                        }
                    });
                    currentRowIndex++;
                });

                // Removed Late Shift from bottom (logic moved up)
            };

            addLocationSection('北投', 'FF3B82F6');
            addLocationSection('大直', 'FFA1887F');
            addLocationSection('台中', 'FFF97316');


            // ==========================================
            // Sheet 2: 人員視角 (Personnel View)
            // ==========================================
            const sheet2 = workbook.addWorksheet('人員視角');
            applyPageSetup(sheet2);
            generateHeader(sheet2);
            
            let sheet2RowIndex = 3;

            // Iterate all doctors (state order)
            doctors.forEach(doc => {
                const row = sheet2.getRow(sheet2RowIndex);
                // Name Column
                row.getCell(1).value = doc.name; // Full Name
                row.getCell(1).border = borderStyle;
                row.getCell(1).alignment = alignCenter;
                row.getCell(1).font = { ...fontBase, bold: true };

                dateRange.forEach((dateStr, colIdx) => {
                    const date = new Date(dateStr);
                    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                    const cell = row.getCell(colIdx + 2);
                    cell.border = borderStyle;
                    if (isWeekend) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };

                    // Find shift
                    const shift = (simulatedShifts || []).find(s => s.doctorId === doc.id && s.date === dateStr) || 
                                  shifts.find(s => s.doctorId === doc.id && s.date === dateStr);

                    if (shift && shift.scheduled_station && shift.scheduled_station !== 'X') {
                        // Content: Location \n Time \n Station(+Task)
                        // Safe Access for workTime (camelCase vs snake_case)
                        // Construct cell content
                        // User Request: Order -> Station -> Location -> Time -> Task
                        let stationVal = shift.scheduled_station;
                        if (stationVal === '耳鼻喉科') stationVal = 'ENT';
                        // Gyn check
                        if (shift.scheduled_station === '解說') {
                            const dayShifts = shifts.filter(s => s.doctorId === doc.id && s.date === dateStr);
                            if (dayShifts.some(s => s.scheduled_station === '婦科')) stationVal = '解+婦';
                        }
                        
                        const loc = shift.location || '';
                        const time = formatTimeForExcel(shift.workTime || (shift as any).work_time || '');
                        const taskVal = (shift.task && !shift.task.includes('固定')) ? shift.task : '';

                        // Order: Station -> Location -> Time -> Task
                        const lines = [stationVal, loc, time, taskVal].filter(line => line && line.trim() !== '');
                        
                        // User Request: Can Station be larger? YES -> Use Rich Text
                        // Logic: First line is Station (if present), make it Big. Rest Small.
                        
                        if (lines.length > 0) {
                            const richTextParts: any[] = [];
                            
                            // 1. Station (Big)
                            // Check if the first line is indeed stationVal (it should be due to order)
                            const isFirstLineStation = lines[0] === stationVal;
                            
                            lines.forEach((line, idx) => {
                                const isStation = idx === 0 && isFirstLineStation;
                                richTextParts.push({
                                    text: line + (idx < lines.length - 1 ? '\n' : ''), // Add newline to all except last
                                    font: isStation 
                                        ? { ...fontBase, size: 14, bold: true } // Big Station
                                        : { ...fontBase, size: 9, bold: false } // Small details
                                });
                            });

                            cell.value = { richText: richTextParts };
                        } else {
                            cell.value = '';
                        }

                        cell.alignment = alignCenter;
                        
                        // Simulation styling (Override font color for whole cell via rich text if needed, 
                        // but rich text parts control their own color. 
                        // If simulation, we might want to color the Station part distinctively or all parts?
                        // Let's color all parts orange if auto-generated)
                        if (isSimulationMode && shift.isAutoGenerated) {
                            const val = cell.value as any; // Cast to any to access richText safely
                            if (val && val.richText) {
                                val.richText.forEach((part: any) => {
                                    part.font.color = { argb: 'FFD97706' };
                                });
                            }
                        }
                    } else if (shift && shift.scheduled_station === 'X') {
                         // X (Off)
                        cell.value = 'X';
                        cell.alignment = alignCenter;
                        cell.font = { ...fontBase, color: { argb: 'FF9CA3AF' } }; // Gray
                    } else if (doc.excludedDays?.includes(date.getDay())) {
                         // Excluded
                         cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } }; // Gray-200
                    }
                });
                sheet2RowIndex++;
            });


            // 4. Save
            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            const year = currentDate.getFullYear();
            const month = String(currentDate.getMonth() + 1).padStart(2, '0');
            link.download = `${year}${month} 醫師排班表.xlsx`;
            link.click();

        } catch (error: any) {
            console.error('Excel Export Failed:', error);
            alert(`匯出 Excel 失敗: ${error.message || error}`);
        }
    };

    const getShiftDisplay = (doctorId: string, date: string) => shifts.find(s => s.doctorId === doctorId && s.date === date);

    const getDailyStats = (date: string) => {
        const dayShifts = shifts.filter(s => s.date === date);
        const stats: Record<string, number> = {};
        dayShifts.forEach(s => {
            // Use scheduled_station for stats
            const st = s.scheduled_station;
            if (st) {
                 stats[st] = (stats[st] || 0) + 1;
            }
        });
        return stats;
    };

    const handleOpenTargetDaysModal = () => {
        // Initialize target days for full-time doctors
        const fullTimeDoctors = doctors.filter(d => !d.isPartTime);
        const initialTargetDays: Record<string, number> = {};
        fullTimeDoctors.forEach(d => {
            initialTargetDays[d.id] = d.monthlyTargetShifts || 20;
        });
        setTargetDays(initialTargetDays);
        setShowTargetDaysModal(true);
    };

    const handleApplyBatchDays = () => {
        const fullTimeDoctors = doctors.filter(d => !d.isPartTime);
        const updated: Record<string, number> = {};
        fullTimeDoctors.forEach(d => {
            updated[d.id] = batchDays;
        });
        setTargetDays(updated);
    };

    const handleAutoSchedule = async () => {
        setIsAutoScheduling(true);
        setShowTargetDaysModal(false);
        try {
            const startDate = dateRange[0];
            const endDate = dateRange[dateRange.length - 1];
            // Dry run for simulation
            const result = await db.autoScheduleDoctors(startDate, endDate, targetDays, false);
            if (Array.isArray(result)) {
                setSimulatedShifts(result);
                setIsSimulationMode(true);
            }
        } catch (e) {
            console.error(e);
            alert('排班失敗');
        } finally {
            setIsAutoScheduling(false);
            setShowAutoScheduleConfirm(false);
        }
    };

    const handleCancelSimulation = () => {
        setSimulatedShifts(null);
        setIsSimulationMode(false);
    };

    const handleSaveSimulation = async () => {
        if (!simulatedShifts) return;
        setIsAutoScheduling(true);
        try {
            // Commit the simulated shifts to the database
            // Note: In store.ts we already have assignDoctorSchedule, but we'll use a batch approach if possible or iterate.
            // For now, let's iterate to ensure all hooks/listeners trigger correctly.
            for (const s of simulatedShifts) {
                await db.assignDoctorSchedule(s.doctorId, s.date, s.station, s.workTime, s.note, s.location, s.task);
            }
            
            setShifts(db.getDoctorShifts());
            setSimulatedShifts(null);
            setIsSimulationMode(false);
            alert('排班已儲存');
        } catch (e) {
            console.error(e);
            alert('儲存失敗');
        } finally {
            setIsAutoScheduling(false);
        }
    };

    // New: Daily View specific actions
    const handleAutoScheduleDay = async () => {
        if (!confirm(`確定要為 ${toLocalISOString(currentDate)} 執行自動排班嗎？\n(將會自動填補空缺)`)) return;
        setIsAutoScheduling(true);
        try {
            await db.autoScheduleDoctors(toLocalISOString(currentDate), toLocalISOString(currentDate));
            alert('單日排班完成！');
        } catch (error) {
            console.error(error);
            alert('排班失敗');
        } finally {
            setIsAutoScheduling(false);
        }
    };

    const handleClearDay = async () => {
        if (!confirm(`⚠️ 警告：確定要清空 ${toLocalISOString(currentDate)} 的所有排班嗎？\n此動作無法復原！`)) return;
        try {
            await db.clearDoctorShifts(toLocalISOString(currentDate), toLocalISOString(currentDate));
            alert('已清空單日排班');
        } catch (error) {
            console.error(error);
            alert('清除失敗');
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-50">
            {isSimulationMode && (
                <div className="bg-amber-100 border-b border-amber-200 px-4 py-2 flex items-center justify-between shadow-sm sticky top-0 z-50 animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="flex items-center gap-2 text-amber-800">
                        <div className="bg-amber-500 text-white p-1 rounded-full">
                            <BarChart2 size={16} />
                        </div>
                        <div>
                            <span className="font-bold">模擬排班模式</span>
                            <span className="text-sm ml-2 hidden sm:inline">這是自動生成的建議排班，點擊「儲存」才會正式生效。</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={handleCancelSimulation}
                            className="px-3 py-1 bg-white hover:bg-red-50 text-red-600 border border-red-200 rounded-lg text-sm font-medium transition-colors"
                        >
                            取消模擬
                        </button>
                        <button 
                            onClick={handleSaveSimulation}
                            className="px-4 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-bold shadow-sm shadow-teal-100 transition-colors flex items-center gap-1"
                        >
                            <Save size={14} /> 儲存排班
                        </button>
                    </div>
                </div>
            )}
            <div className="bg-white border-b border-gray-200 px-4 py-2 flex flex-wrap items-center justify-between gap-y-2 shrink-0 shadow-sm z-30 sticky top-0">
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 text-teal-700 bg-teal-50 px-2 py-1 rounded-lg border border-teal-100">
                        <User className="h-5 w-5" />
                        <h1 className="text-lg font-bold">醫師排班表</h1>
                    </div>
                    
                    <div className="flex items-center bg-slate-100 rounded-lg p-1 border border-slate-200">
                        <button 
                            onClick={() => setViewMode('personnel')}
                            className={`px-3 py-1.5 rounded-md text-sm font-bold transition-all ${viewMode === 'personnel' ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            人員視角
                        </button>
                        <button 
                            onClick={() => setViewMode('station')}
                            className={`px-3 py-1.5 rounded-md text-sm font-bold transition-all ${viewMode === 'station' ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            崗位視角
                        </button>
                         <button 
                            onClick={() => setViewMode('daily')}
                            className={`px-3 py-1.5 rounded-md text-sm font-bold transition-all ${viewMode === 'daily' ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            每日視角
                        </button>
                        {canEdit && (
                            <button 
                                onClick={() => setViewMode('statistics')}
                                className={`px-3 py-1.5 rounded-md text-sm font-bold transition-all flex items-center gap-1 ${viewMode === 'statistics' ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                <BarChart2 size={14} /> 統計報表
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <div className="flex items-center bg-white border border-gray-200 rounded-lg shadow-sm">
                        <button 
                            onClick={() => {
                                const newDate = new Date(currentDate);
                                if (viewMode === 'daily') {
                                    newDate.setDate(newDate.getDate() - 1);
                                } else if (isMobile && viewMode === 'personnel') {
                                    newDate.setDate(newDate.getDate() - 7);
                                } else {
                                    newDate.setDate(1); // Set to 1st to avoid month overflow
                                    newDate.setMonth(newDate.getMonth() - 1);
                                }
                                setCurrentDate(newDate);
                            }}
                            className="p-1.5 hover:bg-slate-50 text-gray-600 border-r border-gray-200"
                        >
                            <ChevronLeft size={20} />
                        </button>
                        <span className="px-4 font-mono font-bold text-gray-700 min-w-[100px] text-center">
                           {viewMode === 'daily' || (isMobile && viewMode === 'personnel')
                                ? `${toLocalISOString(currentDate)} (${['日', '一', '二', '三', '四', '五', '六'][currentDate.getDay()]})`
                                : `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`
                           }
                        </span>
                        <button 
                            onClick={() => {
                                const newDate = new Date(currentDate);
                                if (viewMode === 'daily') {
                                    newDate.setDate(newDate.getDate() + 1);
                                } else if (isMobile && viewMode === 'personnel') {
                                    newDate.setDate(newDate.getDate() + 7);
                                } else {
                                    newDate.setDate(1); // Set to 1st to avoid month overflow
                                    newDate.setMonth(newDate.getMonth() + 1);
                                }
                                setCurrentDate(newDate);
                            }}
                            className="p-1.5 hover:bg-slate-50 text-gray-600 border-l border-gray-200"
                        >
                            <ChevronRight size={20} />
                        </button>
                    </div>

                    <button 
                        onClick={() => setCurrentDate(new Date())}
                        className="px-2 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-200 transition-colors border border-slate-200"
                    >
                        {viewMode === 'daily' || (isMobile && viewMode === 'personnel') ? '今天' : '本月'}
                    </button>

                    {/* View Specific Actions */}
                    
                    {/* Personnel View: Sort, Reorder, Quick Modes */}
                    {viewMode === 'personnel' && canEdit && (
                        <>
                            <button 
                                onClick={() => {
                                    const newVal = !isQuickExcludeMode;
                                    setIsQuickExcludeMode(newVal);
                                    if (newVal) setIsQuickAssignMode(false);
                                }}
                                className={`ml-1 px-2 py-1 rounded-lg text-xs font-bold transition-all border flex items-center gap-1 ${
                                    isQuickExcludeMode 
                                    ? 'bg-red-500 text-white border-red-600 shadow-md animate-pulse' 
                                    : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                                }`}
                            >
                                {isQuickExcludeMode ? <X size={14}/> : <X size={14} className="text-red-400"/>}
                                {isQuickExcludeMode ? '關閉' : '禁排'}
                            </button>

                            <button 
                                onClick={() => {
                                    const newVal = !isQuickAssignMode;
                                    setIsQuickAssignMode(newVal);
                                    if (newVal) setIsQuickExcludeMode(false); 
                                }}
                                className={`ml-1 px-2 py-1 rounded-lg text-xs font-bold transition-all border flex items-center gap-1 ${
                                    isQuickAssignMode 
                                    ? 'bg-amber-500 text-white border-amber-600 shadow-md' 
                                    : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                                }`}
                            >
                                <span className="text-sm">{isQuickAssignMode ? '🖌️' : '🖊️'}</span>
                                {isQuickAssignMode ? '關閉' : '快排'}
                            </button>

                            <button 
                                onClick={handleOpenSpecialtyOrder}
                                className={`ml-1 px-2 py-1 rounded-lg text-xs font-bold transition-all border flex items-center gap-1 ${
                                    showSpecialtyOrderModal 
                                    ? 'bg-teal-500 text-white border-teal-600 shadow-md' 
                                    : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                                }`}
                            >
                                <ArrowUpDown size={14} className={showSpecialtyOrderModal ? "text-white" : "text-gray-400"} />
                                科別排序
                            </button>

                            <button 
                                onClick={() => {
                                    if (confirm('確定要依照設定的科別順序，重新排列所有醫師的順序嗎？\n(這將會更新資料庫中的排序設定)')) {
                                        db.resortDoctorsBySpecialty().then(() => alert('已完成排序執行！'));
                                    }
                                }}
                                className="ml-1 px-2 py-1 bg-white text-slate-500 hover:bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold transition-all flex items-center gap-1"
                            >
                                <ArrowUpDown size={14} className="text-teal-600" />
                                執行排序
                            </button>

                            <button 
                                onClick={() => setIsReorderMode(!isReorderMode)}
                                className={`ml-1 px-2 py-1 rounded-lg text-xs font-bold transition-all border flex items-center gap-1 ${
                                    isReorderMode 
                                    ? 'bg-indigo-500 text-white border-indigo-600 shadow-md' 
                                    : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                                }`}
                            >
                                <ArrowUpDown size={14} className={isReorderMode ? "text-white" : "text-gray-400"} />
                                {isReorderMode ? '完成' : '調序'}
                            </button>

                            <button 
                                onClick={handleOpenTargetDaysModal}
                                className="ml-1 flex items-center gap-1 px-2 py-1 bg-gradient-to-r from-purple-500 to-indigo-600 text-white hover:opacity-90 rounded-lg text-xs font-bold transition-all shadow-md shadow-purple-200"
                            >
                                <Wand2 size={14} />
                                一鍵排班(月)
                            </button>
                        </>
                    )}

                    {/* Daily View: Auto-Schedule Day, Clear Day */}
                    {viewMode === 'daily' && canEdit && (
                        <>
                             <button 
                                onClick={handleAutoScheduleDay}
                                disabled={isAutoScheduling}
                                className="ml-1 flex items-center gap-1 px-3 py-1 bg-gradient-to-r from-teal-500 to-emerald-600 text-white hover:opacity-90 rounded-lg text-xs font-bold transition-all shadow-md shadow-teal-200 disabled:opacity-50"
                            >
                                <Wand2 size={14} />
                                今日一鍵排班
                            </button>
                            <button 
                                onClick={handleClearDay}
                                className="ml-1 flex items-center gap-1 px-3 py-1 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 rounded-lg text-xs font-bold transition-all border border-red-200"
                            >
                                <Trash2 size={14} />
                                清空今日
                            </button>
                        </>
                    )}

                    {/* Station View: Limited Actions or Future Expansion */}
                    {viewMode === 'station' && canEdit && (
                         <button 
                            onClick={handleOpenTargetDaysModal}
                            className="ml-1 flex items-center gap-1 px-2 py-1 bg-gradient-to-r from-purple-500 to-indigo-600 text-white hover:opacity-90 rounded-lg text-xs font-bold transition-all shadow-md shadow-purple-200"
                        >
                            <Wand2 size={14} />
                            一鍵排班(月)
                        </button>
                    )}

                    <div className="flex bg-teal-50 rounded-lg p-0.5 border border-teal-100 items-center h-[26px]">
                        <button 
                            onClick={handleExportPDF}
                            className="px-2 py-0.5 hover:bg-white rounded text-xs font-bold text-teal-700 flex items-center gap-1 transition-all h-full"
                        >
                            <Download size={13} /> PDF
                        </button>
                        <div className="w-[1px] h-3 bg-teal-200 mx-0.5"></div>
                        <button 
                            onClick={handleExportExcel}
                            className="px-2 py-0.5 hover:bg-white rounded text-xs font-bold text-emerald-700 flex items-center gap-1 transition-all h-full"
                        >
                            <FileSpreadsheet size={13} /> Excel
                        </button>
                    </div>

                    {canManageLock && (
                        <button 
                            onClick={handleToggleLock}
                            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold transition-all border shadow-sm ${
                                isLocked 
                                ? 'bg-amber-100 text-amber-800 hover:bg-amber-200 border-amber-200' 
                                : 'bg-emerald-600 text-white hover:bg-emerald-700 border-emerald-700'
                            }`}
                            title={isLocked ? "目前已鎖定" : "點擊鎖定"}
                        >
                            {isLocked ? <Unlock size={14} /> : <Lock size={14} />}
                            {isLocked ? '已鎖' : '鎖定'}
                        </button>
                    )}
                </div>
            </div>
            
            {/* ... Grid Content ... */}
            <div className="flex-1 overflow-auto p-4 md:p-6 pb-20">
                {viewMode === 'personnel' && (
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm inline-block min-w-full">
                        <table className="text-sm border-collapse w-auto">
                            <thead className="relative z-50">
                                <tr className="bg-slate-50 backdrop-blur border-b border-slate-200">
                                    <th className="p-3 text-left font-bold text-slate-600 w-32 sticky left-0 top-0 bg-slate-50 backdrop-blur z-50 border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">醫師</th>
                                    {dateRange.map(date => {
                                        const d = new Date(date);
                                        const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                                        // Holiday Logic
                                        const hList = db.getHolidays().filter(h => h.date === date);
                                        const holiday = hList.find(h => h.type === DateEventType.NATIONAL || h.type === DateEventType.CLOSED);
                                        const note = hList.find(h => h.type === DateEventType.NOTE);
                                        const doctorNote = hList.find(h => h.type === DateEventType.DOCTOR_NOTE);
                                        
                                        const isHoliday = !!holiday;
                                        const isToday = date === new Date().toISOString().split('T')[0];

                                        return (
                                            <th 
                                                key={date} 
                                                onClick={() => {
                                                    if (canEdit) {
                                                        setShowDeleteConfirm(false);
                                                        setMemoModal({ date, content: doctorNote?.name || '' });
                                                    }
                                                }}
                                                className={`p-1 text-center border-r border-slate-100 min-w-[40px] sticky top-0 z-50 cursor-pointer hover:bg-slate-100 transition-colors ${isToday ? 'bg-teal-50' : (isHoliday || isWeekend ? 'bg-red-50' : 'bg-white')} border-b border-slate-200`}
                                            >
                                                <div className={`font-bold text-sm ${isToday ? 'text-teal-600' : (isHoliday || isWeekend ? 'text-red-500' : 'text-slate-800')}`}>{d.getDate()}</div>
                                                <div className={`text-[10px] opacity-75 ${isToday ? 'text-teal-600' : (isHoliday || isWeekend ? 'text-red-500' : 'text-slate-700')}`}>
                                                    {['日', '一', '二', '三', '四', '五', '六'][d.getDay()]}
                                                </div>
                                                <div className="flex flex-col items-center gap-0.5 mt-0.5">
                                                    {holiday && (
                                                        <div className="text-[10px] font-bold text-red-600 whitespace-nowrap overflow-hidden text-ellipsis max-w-[40px]" title={holiday.name}>
                                                            {holiday.name}
                                                        </div>
                                                    )}
                                                    {note && (
                                                        <div className="text-[9px] font-medium text-blue-600 whitespace-nowrap overflow-hidden text-ellipsis max-w-[40px]" title={note.name}>
                                                            {note.name}
                                                        </div>
                                                    )}
                                                    {doctorNote && (
                                                        <div className="text-[10px] bg-purple-100 text-purple-700 px-1 rounded font-bold shadow-sm whitespace-nowrap overflow-hidden text-ellipsis max-w-[40px]" title={doctorNote.name}>
                                                            📝 {doctorNote.name}
                                                        </div>
                                                    )}
                                                    {!doctorNote && canEdit && (
                                                        <div className="opacity-0 group-hover:opacity-100 text-[8px] text-gray-300">+備忘</div>
                                                    )}
                                                </div>
                                            </th>
                                        );
                                    })}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {doctors.map(doc => (
                                    <tr key={doc.id} className="group hover:bg-slate-50/50 transition-colors">
                                        <td className="p-0 border-r border-slate-200 sticky left-0 bg-white z-30 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                                            <div className="p-3 font-bold text-slate-800 flex items-center gap-2 min-w-[128px]">
                                                {isReorderMode && (
                                                    <div className="flex flex-col gap-0.5">
                                                        <button
                                                            onClick={async (e) => {
                                                                e.stopPropagation();
                                                                await db.reorderDoctor(doc.id, 'up');
                                                                setDoctors(db.getDoctors());
                                                            }}
                                                            className="text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded p-0.5 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                                                            disabled={doctors.indexOf(doc) === 0}
                                                            title="向上移動"
                                                        >
                                                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                                                <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
                                                            </svg>
                                                        </button>
                                                        <button
                                                            onClick={async (e) => {
                                                                e.stopPropagation();
                                                                await db.reorderDoctor(doc.id, 'down');
                                                                setDoctors(db.getDoctors());
                                                            }}
                                                            className="text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded p-0.5 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                                                            disabled={doctors.indexOf(doc) === doctors.length - 1}
                                                            title="向下移動"
                                                        >
                                                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                                                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                )}
                                                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500">
                                                    {doc.alias}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span>{doc.name}</span>
                                                    <span className="text-[10px] text-slate-400 font-normal">
                                                        {(isSimulationMode ? [...activeShifts, ...(simulatedShifts || [])] : shifts).filter(s => s.doctorId === doc.id && dateRange.includes(s.date) && s.scheduled_station && s.scheduled_station !== 'X').length} 天
                                                    </span>
                                                </div>
                                            </div>
                                        </td>
                                        {dateRange.map(date => {
                                            // CHECK SIMULATION FIRST
                                            const simulatedShift = simulatedShifts?.find(s => s.doctorId === doc.id && s.date === date);
                                            const shift = simulatedShift || activeShifts.find(s => s.doctorId === doc.id && s.date === date);
                                            const isSimulated = !!simulatedShift;

                                            const d = new Date(date); 
                                            // Fix: 0 is Sunday in JS, but user might map differently? 
                                            // In DoctorManager: Sunday=0, Monday=1... 
                                            const dayOfWeek = d.getDay(); 
                                            const isExcluded = doc.excludedDays?.includes(dayOfWeek);
                                            
                                            const hasStation = shift && shift.scheduled_station;
                                            
                                            // Display logic just for this cell
                                            let cellDisplayStation = shift?.scheduled_station || '';
                                            if (cellDisplayStation === '耳鼻喉科') cellDisplayStation = 'ENT';
                                            
                                            // Gyn+Explanation Logic (simplified visual check, or use computed)
                                            // We need to check if '解+婦' applies here too? 
                                            // The previous logic for grid display was simpler, let's inject it.
                                            if (shift?.scheduled_station === '解說') {
                                                const allShiftsForDate = shifts.filter(s => s.doctorId === doc.id && s.date === date);
                                                if (allShiftsForDate.some(s => s.scheduled_station === '婦科')) cellDisplayStation = '解+婦';
                                            }

                                            return (
                                                <td 
                                                    key={date} 
                                                    onClick={() => canEdit && handleCellClick(doc.id, date)}
                                                    className={`p-1 border-r border-gray-100 h-12 transition-all group text-center
                                                        ${canEdit ? 'cursor-pointer' : 'cursor-not-allowed'}
                                                        ${isSimulated ? 'relative border-2 border-dashed border-amber-400 z-10' : 'z-0'}
                                                        ${hasStation 
                                                            ? (() => {
                                                                const st = shift.scheduled_station || '';
                                                                if (st === 'X') return 'bg-slate-50';
                                                                
                                                                // Empty check - safeguard
                                                                if (!st) return 'hover:bg-gray-50';

                                                                // Admin -> White
                                                                if (st.includes('行政')) return 'bg-white hover:bg-gray-50';
                                                                
                                                                // Special Depts -> Brown
                                                                if (st.includes('眼') || st.includes('婦') || st.includes('耳')) return 'bg-[#D7CCC8] hover:bg-[#BCAAA4]';

                                                                // Darker tints (100)
                                                                if (st.includes('遠') || st.includes('Remote')) return 'bg-pink-100 hover:bg-pink-200';
                                                                if (st.includes('腸胃') || st.toLowerCase().includes('gi') || st.toLowerCase().includes('gastro')) return 'bg-blue-100 hover:bg-blue-200';
                                                                if (st.includes('解說')) return 'bg-orange-100 hover:bg-orange-200';
                                                                if (st.includes('支援')) return 'bg-yellow-100 hover:bg-yellow-200';
                                                                
                                                                return 'bg-teal-100 hover:bg-teal-200';
                                                            })()
                                                            : isExcluded 
                                                                ? 'bg-slate-100/70 hover:bg-slate-200/70 pattern-diagonal-lines pattern-slate-200 pattern-bg-transparent pattern-opacity-20' 
                                                                : 'hover:bg-gray-50'
                                                        }
                                                    `}
                                                >
                                                    {shift ? (
                                                        shift.scheduled_station === 'X' ? (
                                                            <div className="h-full w-full flex items-center justify-center bg-slate-100/70 pattern-diagonal-lines pattern-slate-300 pattern-bg-transparent pattern-opacity-40">
                                                                <span className="text-slate-400 text-lg font-bold select-none">×</span>
                                                            </div>
                                                        ) : (
                                                            <div className="h-full w-full flex flex-col items-center justify-center p-0.5 space-y-0.5">
                                                                {(() => {
                                                                    // Check if this doctor has both 婦科 and 解說 on this date
                                                                    const allShiftsForDate = db.getDoctorShifts().filter(
                                                                        s => s.doctorId === doc.id && s.date === date
                                                                    );
                                                                    const hasGynecology = allShiftsForDate.some(s => s.scheduled_station === '婦科');
                                                                    const hasExplanation = allShiftsForDate.some(s => s.scheduled_station === '解說');
                                                                    
                                                                    const displayStation = (hasGynecology && hasExplanation) 
                                                                        ? '解+婦' 
                                                                        : (shift.scheduled_station === '耳鼻喉科' ? 'ENT' : (shift.scheduled_station || ''));
                                                                    
                                                                    return <span className="font-bold text-teal-700 block text-xs md:text-sm leading-tight text-center">{displayStation}</span>;
                                                                })()}
                                                                {shift.workTime && (
                                                                    <span className="text-[10px] text-slate-500 leading-tight font-medium">
                                                                        {shift.workTime.replace(/(\d{1,2}):(\d{2})/g, (match, h, m) => m === '00' ? String(parseInt(h)) : parseInt(h) + "'").replace(/\s/g, '')}
                                                                    </span>
                                                                )}
                                                                {shift.task && (
                                                                    <span className={`text-[10px] leading-tight font-medium overflow-hidden text-ellipsis w-full px-1 ${shift.task.includes('晚班') ? 'text-red-600 font-bold' : 'text-blue-600'}`}>
                                                                        {shift.task}
                                                                    </span>
                                                                )}
                                                                 {shift.location && (
                                                                    <div className={`text-[10px] px-1 rounded text-white scale-90 ${LOCATION_COLORS[shift.location]?.split(' ')[0] || 'bg-gray-400'}`}>
                                                                        {shift.location}
                                                                    </div>
                                                                 )}
                                                                 {shift.note && (
                                                                    <div className="text-[8px] text-slate-500 scale-90 w-full text-center overflow-hidden text-ellipsis whitespace-nowrap px-0.5" title={shift.note}>
                                                                        {shift.note.length > 4 ? shift.note.substring(0, 4) + '..' : shift.note}
                                                                    </div>
                                                                 )}
                                                                 {/* Weekday-specific task (visual hint) */}
                                                                 {(() => {
                                                                    const dayOfWeek = new Date(date).getDay();
                                                                    const weekdaySetting = doc.weekdaySettings?.find(ws => ws.dayOfWeek === dayOfWeek);
                                                                    // Only show weekday task if it's DIFFERENT from the shift task to avoid duplication
                                                                    if (weekdaySetting?.task && weekdaySetting.task !== shift.task) {
                                                                        return (
                                                                            <div className="text-[8px] text-blue-400 font-medium scale-90 w-full text-center overflow-hidden text-ellipsis whitespace-nowrap px-0.5 opacity-75" title={`${['日', '一', '二', '三', '四', '五', '六'][dayOfWeek]}任務: ${weekdaySetting.task}`}>
                                                                                ({weekdaySetting.task})
                                                                            </div>
                                                                        );
                                                                    }
                                                                    return null;
                                                                 })()}
                                                            </div>
                                                        )
                                                    ) : (
                                                        isExcluded ? (
                                                            <div className="h-full w-full flex items-center justify-center">
                                                                <span className="text-slate-300 text-lg font-light select-none">×</span>
                                                            </div>
                                                        ) : (
                                                            <div className={`opacity-0 group-hover:opacity-100 flex justify-center transition-opacity ${!canEdit ? 'hidden' : ''}`}>
                                                                {isQuickExcludeMode 
                                                                    ? <X size={16} className="text-red-300" />
                                                                    : <Plus size={14} className="text-gray-300" />
                                                                }
                                                            </div>
                                                        )
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                
                {viewMode === 'station' && (
                     <div className="bg-white rounded-xl border border-gray-200 shadow-sm inline-block min-w-full">
                        <table className="text-sm border-collapse w-auto">
                            <thead className="relative z-50">
                                <tr className="bg-slate-50 border-b border-gray-200">
                                    <th className="p-3 text-center font-bold text-gray-600 w-32 sticky left-0 top-0 bg-slate-50 z-50 border-r border-gray-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">崗位</th>
                                    {dateRange.map(date => {
                                        const d = new Date(date);
                                        const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                                        return (
                                            <th key={date} className={`p-1 text-center border-r border-gray-100 min-w-[40px] sticky top-0 z-50 ${isWeekend ? 'text-red-500 bg-red-50' : 'text-gray-700 bg-slate-50'}`}>
                                                <div className="font-bold text-sm">{d.getDate()}</div>
                                                <div className="text-[10px] opacity-75">
                                                    {['日', '一', '二', '三', '四', '五', '六'][d.getDay()]}
                                                </div>
                                            </th>
                                        );
                                    })}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {LOCATIONS.map(location => {
                                    // Filter stations that belong to this location
                                    const locationStations = stations.filter(s => s.location === location);
                                    
                                    if (locationStations.length === 0) return null; // Skip empty locations

                                    return (
                                        <React.Fragment key={location}>
                                            {/* Location Header */}
                                            <tr className="bg-gray-100 border-b border-gray-200">
                                                <td colSpan={dateRange.length + 1} className="px-3 py-1.5 font-bold text-gray-700 bg-gray-100 sticky left-0 z-10 text-left border-y border-gray-300 shadow-[inset_0_2px_4px_rgba(0,0,0,0.05)]">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`w-2 h-2 rounded-full ${LOCATION_COLORS[location]?.split(' ')[0]}`}></span>
                                                        {location}區
                                                    </div>
                                                </td>
                                            </tr>

                                            {/* Main/Assistant Shift Rows (only for Beitou) */}
                                            {location === '北投' && (
                                                <>
                                                    {/* Main Shift (場控) */}
                                                    <tr className="bg-yellow-50/50 border-b border-yellow-200">
                                                        <td className="px-3 py-1.5 text-xs font-bold text-yellow-800 sticky left-0 bg-yellow-50/50 z-10 border-r border-yellow-200">
                                                            主班
                                                        </td>
                                                        {dateRange.map(date => {
                                                            const radiographerShifts = db.shifts;
                                                            const mainShift = radiographerShifts.find(s => 
                                                                s.date === date && s.station?.includes('場控')
                                                            );
                                                            const userName = mainShift 
                                                                ? db.getUsers().find(u => u.id === mainShift.userId)?.name 
                                                                : '-';
                                                            
                                                            return (
                                                                <td 
                                                                    key={date} 
                                                                    className="p-1 border-r border-yellow-100 text-center bg-yellow-50/30 text-xs font-medium text-yellow-900"
                                                                >
                                                                    {userName}
                                                                </td>
                                                            );
                                                        })}
                                                    </tr>

                                                    {/* Assistant Shift (輔控) */}
                                                    <tr className="bg-yellow-50/50 border-b border-yellow-200">
                                                        <td className="px-3 py-1.5 text-xs font-bold text-yellow-800 sticky left-0 bg-yellow-50/50 z-10 border-r border-yellow-200">
                                                            輔班
                                                        </td>
                                                        {dateRange.map(date => {
                                                            const radiographerShifts = db.shifts;
                                                            const assistantShift = radiographerShifts.find(s => 
                                                                s.date === date && s.specialRoles?.includes('輔班')
                                                            );
                                                            const userName = assistantShift 
                                                                ? db.getUsers().find(u => u.id === assistantShift.userId)?.name 
                                                                : '-';
                                                            
                                                            return (
                                                                <td 
                                                                    key={date} 
                                                                    className="p-1 border-r border-yellow-100 text-center bg-yellow-50/30 text-xs font-medium text-yellow-900"
                                                                >
                                                                    {userName}
                                                                </td>
                                                            );
                                                        })}
                                                    </tr>
                                                </>
                                            )}

                                            {locationStations.map(stationConfig => {
                                                const stationName = stationConfig.name;
                                                return (
                                                    <tr key={`${location}-${stationName}`} className="hover:bg-gray-50/80 transition-colors border-b border-gray-100">
                                                        {/* Station Name Header */}
                                                        <th className="p-3 text-center font-medium text-gray-600 w-32 sticky left-0 bg-white z-[10] border-r border-gray-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                                                            <div className="flex flex-col items-center">
                                                                <span className="text-sm font-bold text-gray-800">{stationName}</span>
                                                            </div>
                                                        </th>

                                                        {/* Date Cells */}
                                                        {dateRange.map(date => {
                                                            // NEW: Get ALL shifts for this station+location+date (support multiple doctors)
                                                            // Check BOTH scheduled_station (for doctor schedules) and station (for tech assignments)
                                                            // NEW: Get ALL shifts for this station+location+date (support multiple doctors)
                                                            // Check BOTH scheduled_station (for doctor schedules) and station (for tech assignments)
                                                            const allRelevantShifts = [
                                                                ...activeShifts,
                                                                ...(simulatedShifts || [])
                                                            ];
                                                            
                                                            const currentShifts = allRelevantShifts.filter(s => {
                                                                if (s.date !== date || s.location !== location) return false;
                                                                if (s.scheduled_station === stationName) return true;
                                                                
                                                                // Logic: Show 'Explanation' doctors in 'Gyn' station if FamilyMed + Gyn Capable
                                                                if (stationName === '婦科' && s.scheduled_station === '解說') {
                                                                     const doc = doctors.find(d => d.id === s.doctorId);
                                                                     // Mod: Allow ANY doctor with Gyn capability
                                                                     return doc?.capabilities?.includes('婦科');
                                                                }
                                                                
                                                                // Logic: Show 'Late Shift' task in 'Late Shift' station row
                                                                if (stationName === '晚班' && s.task?.includes('晚班')) return true;

                                                                return false;
                                                            });
                                                            
                                                            // Logic: Cross-site Remote/Imaging Fallback (Station View)
                                                            let displayShifts = [...currentShifts];
                                                            let suffix = '';
                                                            
                                                            // Case A: Dazhi Remote empty -> Pull Beitou Remote
                                                            if (location === '大直' && ['遠班', '遠距', '遠'].includes(stationName) && displayShifts.length === 0) {
                                                                const beitouRemoteShifts = allRelevantShifts.filter(s => s.date === date && s.location === '北投' && ['遠班', '遠距', '遠'].includes(s.scheduled_station));
                                                                if (beitouRemoteShifts.length > 0) {
                                                                    displayShifts = beitouRemoteShifts;
                                                                    suffix = '(北)';
                                                                }
                                                            }
                                                            
                                                            // Case B: Beitou Remote empty -> Pull Dazhi Remote
                                                            if (location === '北投' && ['遠班', '遠距', '遠'].includes(stationName) && displayShifts.length === 0) {
                                                                const dazhiRemoteShifts = allRelevantShifts.filter(s => s.date === date && s.location === '大直' && ['遠班', '遠距', '遠'].includes(s.scheduled_station));
                                                                 if (dazhiRemoteShifts.length > 0) {
                                                                    displayShifts = dazhiRemoteShifts;
                                                                    suffix = '(直)';
                                                                }
                                                            }

                                                            const isWeekend = new Date(date).getDay() === 0 || new Date(date).getDay() === 6;

                                                            // Determine background color based on station type (lighter than personnel view)
                                                            const getStationBgColor = () => {
                                                                if (stationName.includes('遠')) return 'bg-pink-50';
                                                                if (stationName.includes('腸胃') || stationName.toLowerCase().includes('gi')) return 'bg-blue-50';
                                                                if (stationName.includes('解說')) return 'bg-orange-50';
                                                                if (stationName.includes('支援')) return 'bg-yellow-50';
                                                                if (stationName.includes('行政')) return 'bg-white';
                                                                if (stationName.includes('眼') || stationName.includes('婦') || stationName.includes('耳')) return 'bg-amber-50/50';
                                                                return 'bg-teal-50'; // Default for 影像, etc.
                                                            };

                                                            return (
                                                                <td 
                                                                    key={date} 
                                                                    className={`p-1 border-r border-gray-100 group min-w-[40px] 
                                                                        ${canEdit ? 'cursor-pointer' : 'cursor-not-allowed'}
                                                                        ${getStationBgColor()} 
                                                                        ${selectedCell?.date === date && selectedCell?.doctorId === '' /* Just checks selection */ ? 'ring-2 ring-inset ring-blue-400' : ''}
                                                                    `}
                                                                    onClick={() => canEdit && handleStationCellClick(stationName, location, date)}
                                                                >
                                                                    {displayShifts.length > 0 ? (
                                                                        <div className="flex flex-col items-center justify-start h-full w-full gap-0.5 py-1 px-1">
                                                                             {displayShifts.map((shift, index) => {
                                                                                const doc = doctors.find(d => d.id === shift.doctorId);
                                                                                const isSimulated = simulatedShifts?.some(ss => ss.id === shift.id);
                                                                                return (
                                                                                    <div key={shift.id} className={`w-full text-center p-1 rounded ${isSimulated ? 'bg-amber-50 border border-dashed border-amber-400 animate-pulse' : ''}`}>
                                                                                        <div className={`text-xs leading-tight truncate ${isSimulated ? 'text-amber-800' : 'text-gray-900'}`} title={doc?.name}>
                                                                                            {doc?.name || '?'}
                                                                                            {suffix && <span className="text-[8px] text-red-600 ml-0.5">{suffix}</span>}
                                                                                        </div>
                                                                                        {shift.workTime && (
                                                                                            <div className="text-[9px] text-slate-500 leading-tight font-medium">
                                                                                                 {shift.workTime.replace(/(\d{1,2}):\d{2}/g, (match, p1) => parseInt(p1) + '\'').replace(/\s/g, '')}
                                                                                            </div>
                                                                                        )}
                                                                                        {shift.task && (
                                                                                            <div className={`text-[9px] leading-tight font-medium ${shift.task.includes('晚班') ? 'text-red-500 font-bold' : 'text-blue-600'}`}>
                                                                                                {shift.task}
                                                                                            </div>
                                                                                        )}
                                                                                        {index < displayShifts.length - 1 && !isSimulated && (
                                                                                            <div className="border-b border-gray-100 my-0.5"></div>
                                                                                        )}
                                                                                    </div>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    ) : (
                                                                         <div className="w-full h-14 hover:bg-gray-100 transition-colors"></div>
                                                                    )}
                                                                </td>
                                                            );
                                                        })}
                                                    </tr>
                                                );
                                            })}
                                        </React.Fragment>
                                    );
                                })}


                            </tbody>
                        </table>
                     </div>
                )}
                
                {viewMode === 'daily' && (
                    <div className="flex flex-col gap-8 pb-10">
                        {/* Main/Assistant Shift Display */}
                        <div className="bg-gradient-to-r from-yellow-50 to-amber-50 border border-yellow-200 rounded-lg p-4">
                            <div className="flex flex-col sm:flex-row gap-3">
                                {(() => {
                                    const dateStr = toLocalISOString(currentDate);
                                    const radiographerShifts = db.shifts;
                                    const mainShift = radiographerShifts.find(s => 
                                        s.date === dateStr && s.station?.includes('場控')
                                    );
                                    const assistantShift = radiographerShifts.find(s => 
                                        s.date === dateStr && s.specialRoles?.includes('輔班')
                                    );
                                    const mainName = mainShift ? db.getUsers().find(u => u.id === mainShift.userId)?.name : '-';
                                    const assistantName = assistantShift ? db.getUsers().find(u => u.id === assistantShift.userId)?.name : '-';

                                    return (
                                        <>
                                            <div className="flex-1 flex items-center gap-2 bg-white/60 rounded px-3 py-2 border border-yellow-300/30">
                                                <span className="text-xs font-bold text-yellow-800">主班：</span>
                                                <span className="text-sm font-medium text-yellow-900">{mainName}</span>
                                            </div>
                                            <div className="flex-1 flex items-center gap-2 bg-white/60 rounded px-3 py-2 border border-yellow-300/30">
                                                <span className="text-xs font-bold text-yellow-800">輔班：</span>
                                                <span className="text-sm font-medium text-yellow-900">{assistantName}</span>
                                            </div>
                                        </>
                                    );
                                })()}
                            </div>
                        </div>

                        {LOCATIONS.map(loc => {
                            const locStations = stations.filter(s => s.location === loc);
                            if (locStations.length === 0) return null;

                            return (
                                <div key={loc} className="space-y-4">
                                    <div className="flex items-center gap-3 border-b border-gray-200 pb-2">
                                        <h2 className={`font-bold text-base px-3 py-1 rounded-full text-white shadow-sm ${LOCATION_COLORS[loc]?.split(' ')[0] || 'bg-gray-500'}`}>
                                            {loc}區
                                        </h2>
                                        <div className="flex-1 h-px bg-gray-100"></div>
                                    </div>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                        {locStations.map(config => {
                                            const st = config.name;
                                            // User Request: Daily View restore original (do not show Late Shift card)
                                            if (st === '晚班') return null;

                                            const allRelevantShifts = [
                                                ...activeShifts,
                                                ...(simulatedShifts || [])
                                            ];
                                            
                                            const shiftsOnStation = allRelevantShifts.filter(s => {
                                                if (s.date !== toLocalISOString(currentDate) || s.location !== config.location) return false;
                                                const assignedSt = s.scheduled_station || s.station;
                                                if (assignedSt === st) return true;
                                                
                                                 // Logic: Show 'Explanation' doctors in 'Gyn' station if FamilyMed + Gyn Capable
                                                if (st === '婦科' && assignedSt === '解說') {
                                                     const doc = doctors.find(d => d.id === s.doctorId);
                                                     // Mod: Allow ANY doctor with Gyn capability
                                                     return doc?.capabilities?.includes('婦科');
                                                }
                                                return false;
                                            });
                                            let displayShifts = [...shiftsOnStation];
                                            let suffix = '';

                                            // Case A: Dazhi Remote empty -> Pull Beitou Remote
                                            if (config.location === '大直' && ['遠班', '遠距', '遠'].includes(st) && displayShifts.length === 0) {
                                                const beitouRemoteShifts = shifts.filter(s => s.date === toLocalISOString(currentDate) && s.location === '北投' && ['遠班', '遠距', '遠'].includes(s.scheduled_station));
                                                if (beitouRemoteShifts.length > 0) {
                                                    displayShifts = beitouRemoteShifts;
                                                    suffix = '(北投)';
                                                }
                                            }

                                            // Case B: Beitou Remote empty -> Pull Dazhi Remote
                                            if (config.location === '北投' && ['遠班', '遠距', '遠'].includes(st) && displayShifts.length === 0) {
                                                const dazhiRemoteShifts = shifts.filter(s => s.date === toLocalISOString(currentDate) && s.location === '大直' && ['遠班', '遠距', '遠'].includes(s.scheduled_station));
                                                if (dazhiRemoteShifts.length > 0) {
                                                    displayShifts = dazhiRemoteShifts;
                                                    suffix = '(大直)';
                                                }
                                            }
                                            
                                            // Get Requirement
                                            // Fix: Settings uses [Sun, Mon...] index 0-6. currentDate.getDay() returns 0-6 (Sun-Sat).
                                            const dayOfWeek = currentDate.getDay();
                                            const reqKey = `${config.name}_${config.location}`;
                                            const reqs = requirements[reqKey] || requirements[config.name] || [0,0,0,0,0,0,0];
                                            const req = reqs[dayOfWeek];
                                            const isShort = displayShifts.length < req;

                                            return (
                                                <div key={`${loc}-${st}`} className={`rounded-xl border p-4 shadow-sm flex flex-col h-full bg-white transition-all ${isShort ? 'border-red-200 shadow-red-50' : 'border-gray-200'}`}>
                                                    <div className="flex justify-between items-center mb-3 pb-2 border-b border-gray-50">
                                                        <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                                            {st}
                                                            {isShort && <span className="flex h-2 w-2 rounded-full bg-red-500 animate-pulse" title="人力不足"></span>}
                                                        </h3>
                                                        <span className={`text-xs font-bold px-2 py-1 rounded-full ${isShort ? 'bg-red-50 text-red-600' : 'bg-slate-50 text-slate-400'}`}>
                                                            {displayShifts.length} / {req} 人
                                                        </span>
                                                    </div>
                                                    
                                                    <div className="space-y-2 flex-1">
                                                        {displayShifts.length > 0 ? (
                                                            displayShifts.map(s => {
                                                                const doc = doctors.find(d => d.id === s.doctorId);
                                                                const isSimulated = simulatedShifts?.some(ss => ss.id === s.id);
                                                                return (
                                                                    <div key={s.id} className={`flex items-center gap-3 p-2 rounded-lg transform hover:scale-[1.02] transition-all ${isSimulated ? 'bg-amber-50 border border-dashed border-amber-300 animate-pulse' : 'bg-slate-50 border border-slate-100'} ${canEdit ? 'cursor-pointer hover:bg-white hover:shadow-sm' : 'cursor-not-allowed'}`} onClick={()=>canEdit && handleCellClick(s.doctorId, s.date)}>
                                                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shadow-sm border ${isSimulated ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-teal-100 text-teal-600 border-teal-50'}`}>
                                                                            {doc?.alias}
                                                                        </div>
                                                                        <div className="flex-1 min-w-0">
                                                                            <div className="font-bold text-gray-800 truncate flex items-center gap-1">
                                                                                {doc?.name}
                                                                                {suffix && <span className="text-[10px] text-teal-700 bg-teal-50 px-1 rounded border border-teal-100">{suffix}</span>}
                                                                            </div>
                                                                            {s.workTime && <div className="text-xs text-gray-500 flex items-center gap-1"><Clock size={10}/> {s.workTime}</div>}
                                                                            {s.task && <div className="text-xs text-blue-600 font-bold">{s.task}</div>}
                                                                            {s.note && <div className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100 mt-0.5 break-all">📝 {s.note}</div>}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })
                                                        ) : (
                                                            <div 
                                                                onClick={() => canEdit && handleStationCellClick(st, loc, toLocalISOString(currentDate))}
                                                                className={`h-20 flex items-center justify-center text-slate-300 text-xs italic border-2 border-dashed border-slate-50 rounded-lg bg-slate-50/50 transition-all font-bold group ${canEdit ? 'cursor-pointer hover:bg-teal-50 hover:border-teal-200 hover:text-teal-600' : 'cursor-not-allowed'}`}
                                                            >
                                                                <span className="group-hover:scale-105 transition-transform flex items-center gap-1">
                                                                    <Plus size={14}/> 指派醫師
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Copy to Line Section (Daily View Only) */}
                {viewMode === 'daily' && (
                    <div className="p-4 max-w-full">
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                            <h3 className="text-sm font-bold bg-green-50 px-4 py-2 border-b border-green-100 flex items-center gap-2 text-green-700">
                                <FileText size={16} className="text-green-600"/> 複製 Line 文字 (Copy to Line)
                            </h3>
                            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Beitou Copy Block */}
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs font-bold text-gray-500">北投區塊</span>
                                        <button
                                            onClick={() => {
                                                const text = generateBeitouCopyText(currentDate, shifts, doctors);
                                                navigator.clipboard.writeText(text);
                                            }}
                                            className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded text-xs font-bold flex items-center gap-1 transition-colors"
                                        >
                                            <Check size={12} /> 複製
                                        </button>
                                    </div>
                                    <textarea
                                        readOnly
                                        className="w-full h-64 p-3 text-xs font-mono border border-gray-200 rounded-lg bg-slate-50 focus:ring-2 focus:ring-green-500 outline-none resize-none"
                                        value={generateBeitouCopyText(currentDate, shifts, doctors)}
                                    />
                                </div>

                                {/* Dazhi Copy Block */}
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs font-bold text-gray-500">大直區塊</span>
                                        <button
                                            onClick={() => {
                                                const text = generateDazhiCopyText(currentDate, shifts, doctors);
                                                navigator.clipboard.writeText(text);
                                            }}
                                            className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded text-xs font-bold flex items-center gap-1 transition-colors"
                                        >
                                            <Check size={12} /> 複製
                                        </button>
                                    </div>
                                    <textarea
                                        readOnly
                                        className="w-full h-64 p-3 text-xs font-mono border border-gray-200 rounded-lg bg-slate-50 focus:ring-2 focus:ring-green-500 outline-none resize-none"
                                        value={generateDazhiCopyText(currentDate, shifts, doctors)}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                
                {viewMode === 'statistics' && (
                    <div className="flex flex-col gap-6 overflow-auto p-4 max-w-full">
                        {/* 1. Daily Coverage Analysis */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                            <h3 className="text-sm font-bold bg-slate-50 px-4 py-2 border-b border-gray-100 flex items-center gap-2 text-slate-700">
                                <BarChart2 size={16} className="text-teal-600"/> 每日崗位覆蓋率 (實際人數 / 需求人數)
                            </h3>
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                                        <tr>
                                            <th className="px-3 py-2 text-left sticky left-0 bg-slate-50 z-10 border-r border-slate-200 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">日期</th>
                                            {stations.map(st => (
                                                <th key={`head-${st.name}-${st.location}`} className="px-2 py-2 text-center min-w-[60px] border-r border-gray-100">
                                                    <div className="flex flex-col items-center">
                                                        <span>{st.name}</span>
                                                        <span className={`text-[9px] px-1.5 rounded-full mt-0.5 text-white ${LOCATION_COLORS[st.location]?.split(' ')[0] || 'bg-gray-400'}`}>
                                                            {st.location}
                                                        </span>
                                                    </div>
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {dateRange.map(date => {
                                             const dayOfWeek = new Date(date).getDay(); // Sun=0, Mon=1, ..., Sat=6
                                             const dayLabel = ['日','一','二','三','四','五','六'][new Date(date).getDay()];
                                             const isWeekend = new Date(date).getDay() === 0 || new Date(date).getDay() === 6;
                                             
                                             return (
                                                <tr key={date} className={`hover:bg-slate-50 transition-colors ${isWeekend ? 'bg-red-50/10' : ''}`}>
                                                    <td className="px-3 py-2 text-left sticky left-0 bg-white z-10 border-r border-slate-100 font-bold text-slate-600 whitespace-nowrap shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
                                                        {date.slice(5)} <span className="text-gray-400 font-normal">({dayLabel})</span>
                                                    </td>
                                                    {stations.map(st => {
                                                        // Special logic for Gynecology: include Explanation doctors with Gyn capability
                                                        let count = shifts.filter(s => {
                                                            if (s.date !== date || s.location !== st.location || !s.doctorId) return false;
                                                            
                                                            // Direct station match
                                                            if (s.station === st.name || s.scheduled_station === st.name) return true;
                                                            
                                                            // Special: For Gyn station, include Explanation doctors with Gyn capability
                                                            if (st.name === '婦科' && s.scheduled_station === '解說') {
                                                                const doc = doctors.find(d => d.id === s.doctorId);
                                                                return doc?.capabilities?.includes('婦科');
                                                            }
                                                            
                                                            return false;
                                                        }).length;
                                                        const reqKey = `${st.name}_${st.location}`;
                                                        // Fallback to legacy
                                                        const reqs = requirements[reqKey] || requirements[st.name] || [0,0,0,0,0,0,0];
                                                        const req = reqs[dayOfWeek];
                                                        const isLow = count < req;
                                                        
                                                        return (
                                                            <td key={`${date}-${st.name}-${st.location}`} className={`px-2 py-2 text-center border-r border-gray-50 font-mono font-bold ${isLow ? 'bg-red-50' : ''}`}>
                                                                <span className={isLow ? 'text-red-600' : 'text-teal-600'}>{count}</span>
                                                                <span className="text-gray-300 mx-0.5 text-[10px]">/</span>
                                                                <span className="text-gray-400 text-[10px]">{req}</span>
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                             );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* 2. Doctor Workload Analysis */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                            <h3 className="text-sm font-bold bg-slate-50 px-4 py-2 border-b border-gray-100 flex items-center gap-2 text-slate-700">
                                <Briefcase size={16} className="text-indigo-600"/> 醫師排班統計 (班數)
                            </h3>
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                                        <tr>
                                            <th className="px-3 py-2 text-left sticky left-0 bg-slate-50 z-10 border-r border-slate-200 shadow-[2px_0_5px_rgba(0,0,0,0.05)] w-32">醫師姓名</th>
                                            <th className="px-2 py-2 text-center bg-indigo-50 text-indigo-700 border-r border-indigo-100 font-extrabold w-16">總計</th>
                                            {stations.map(st => (
                                                <th key={`doc-head-${st.name}-${st.location}`} className="px-2 py-2 text-center min-w-[60px] border-r border-gray-100 font-normal">
                                                    <div className="flex flex-col items-center opacity-80">
                                                        <span>{st.name}</span>
                                                        <span className={`text-[8px] px-1 rounded-full mt-0.5 text-white ${LOCATION_COLORS[st.location]?.split(' ')[0] || 'bg-gray-400'}`}>
                                                            {st.location}
                                                        </span>
                                                    </div>
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {doctors.map(doc => {
                                            const docShifts = shifts.filter(s => s.doctorId === doc.id && dateRange.includes(s.date));
                                            // Only count shifts that match displayed stations (station+location must exist in stations list)
                                            const total = docShifts.filter(s => {
                                                const st = s.station || s.scheduled_station;
                                                if (!st) return false;
                                                return stations.some(station => 
                                                    (s.station === station.name || s.scheduled_station === station.name) && 
                                                    s.location === station.location
                                                );
                                            }).length;
                                            
                                            // Skip doctors with 0 shifts if list is too long? No, show all.
                                            
                                            return (
                                                <tr key={doc.id} className="hover:bg-slate-50 transition-colors">
                                                    <td className="px-3 py-2 text-left sticky left-0 bg-white z-10 border-r border-slate-100 font-bold text-slate-700 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
                                                        {doc.name}
                                                    </td>
                                                    <td className="px-2 py-2 text-center bg-indigo-50/30 text-indigo-700 font-bold border-r border-indigo-50">
                                                        {total}
                                                    </td>
                                                    {stations.map(st => {
                                                        const count = docShifts.filter(s => (s.station === st.name || s.scheduled_station === st.name) && s.location === st.location).length;
                                                        return (
                                                            <td key={`${doc.id}-${st.name}-${st.location}`} className={`px-2 py-2 text-center border-r border-gray-50 ${count > 0 ? 'font-bold text-slate-700 bg-slate-50' : 'text-gray-200'}`}>
                                                                {count > 0 ? count : '-'}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Edit Modal (Existing) */}
            {selectedCell && (
                <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm border border-gray-100 animate-in zoom-in-95 duration-200 overflow-hidden">
                        <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center bg-teal-50/50">
                            <div>
                                <h3 className="font-bold text-gray-800 text-lg">
                                    {doctors.find(d => d.id === selectedCell.doctorId)?.name}
                                </h3>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    {selectedCell.date} • {['日', '一', '二', '三', '四', '五', '六'][new Date(selectedCell.date).getDay()]}
                                </p>
                            </div>
                            <button onClick={() => setSelectedCell(null)} className="text-gray-400 hover:text-gray-600 bg-white p-1 rounded-full shadow-sm hover:shadow transition-all">
                                <X size={20} />
                            </button>
                        </div>
                        
                        <div className="p-5 space-y-4">
                            {/* Station Selection */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-gray-500 uppercase flex justify-between">
                                    <span>崗位分配</span>
                                    {editData.station && <span className="text-teal-600 cursor-pointer hover:underline" onClick={() => setEditData({...editData, station: ''})}>清除分配</span>}
                                </label>
                                <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-1">
                                    <button
                                        onClick={() => setEditData({ station: '', location: '', workTime: '', note: '', task: '' })}
                                        className={`p-2 rounded-lg text-sm font-bold border transition-all ${!editData.station ? 'bg-slate-200 text-slate-600 border-slate-300 shadow-inner' : 'bg-slate-50 text-gray-400 border-gray-200 hover:bg-white'}`}
                                    >
                                        <div className="flex flex-col items-center">
                                            <span>無 (清除)</span>
                                        </div>
                                    </button>
                                    {Array.from(new Set(stations.map(s => s.name)))
                                        .filter(name => name !== '晚班') // User Request: Late Shift is a Task, not a Station assignment here
                                        .map(stationName => {
                                        // Check associated locations for this station name
                                        const associatedLocs = stations.filter(s => s.name === stationName);
                                        const isUniqueLoc = associatedLocs.length === 1;

                                        return (
                                            <button
                                                key={stationName}
                                                onClick={() => {
                                                    // Auto-select location if unique, otherwise keep current (or user manual select)
                                                    const nextLoc = isUniqueLoc ? associatedLocs[0].location : editData.location;
                                                    setEditData({ ...editData, station: stationName, location: nextLoc });
                                                }}
                                                className={`p-2 rounded-lg text-sm font-bold border transition-all ${editData.station === stationName ? 'bg-teal-500 text-white border-teal-600 shadow-md transform scale-[1.02]' : 'bg-slate-50 text-gray-600 border-gray-200 hover:border-teal-300 hover:bg-white'}`}
                                            >
                                                <div className="flex flex-col items-center">
                                                    <span>{stationName}</span>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            
                            {/* Location */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-gray-500 uppercase">地點標記</label>
                                <div className="flex gap-2">
                                    {LOCATIONS.map(loc => (
                                        <button
                                            key={loc}
                                            onClick={() => setEditData({ ...editData, location: editData.location === loc ? '' : loc })}
                                            className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all ${editData.location === loc ? 'bg-slate-800 text-white border-slate-900 shadow-md' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                                        >
                                            {loc}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Work Time */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-gray-500 uppercase">工作時段</label>
                                <div className="relative">
                                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                                    <input 
                                        type="text" 
                                        value={editData.workTime}
                                        onChange={(e) => setEditData({ ...editData, workTime: e.target.value })}
                                        className="w-full pl-10 pr-3 py-2 bg-slate-50 border border-gray-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all"
                                        placeholder="例如: 08:30-17:00"
                                    />
                                </div>
                            </div>

                            {/* Task Tag */}
                             <div className="space-y-1.5">
                                <label className="text-xs font-bold text-gray-500 uppercase">特殊任務</label>
                                
                                {/* Quick Task Buttons */}
                                <div className="flex gap-2 flex-wrap">
                                    {['晚班', '電台', '行政', '董事會'].map(taskName => (
                                        <button
                                            key={taskName}
                                            type="button"
                                            onClick={() => setEditData({ 
                                                ...editData, 
                                                task: editData.task === taskName ? '' : taskName 
                                            })}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                                                editData.task === taskName 
                                                    ? 'bg-teal-600 text-white border-teal-700 shadow-md' 
                                                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                                            }`}
                                        >
                                            {taskName}
                                        </button>
                                    ))}
                                </div>
                                
                                <div className="relative">
                                    <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                                    <input 
                                        type="text" 
                                        value={editData.task}
                                        onChange={(e) => setEditData({ ...editData, task: e.target.value })}
                                        className="w-full pl-10 pr-3 py-2 bg-slate-50 border border-gray-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all"
                                        placeholder="例如: 會議, 教學..."
                                    />
                                </div>
                            </div>

                            {/* Note */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-gray-500 uppercase">備註說明</label>
                                <div className="relative">
                                    <FileText className="absolute left-3 top-3 text-gray-400" size={16} />
                                    <textarea 
                                        value={editData.note}
                                        onChange={(e) => setEditData({ ...editData, note: e.target.value })}
                                        className="w-full pl-10 pr-3 py-2 bg-slate-50 border border-gray-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all resize-none h-20"
                                        placeholder="輸入排班備註..."
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="p-4 bg-gray-50 border-t border-gray-100 flex gap-3">
                            <button 
                                onClick={handleDelete}
                                className="px-4 py-2 text-red-500 font-bold hover:bg-red-50 rounded-lg transition-colors text-sm"
                            >
                                清除
                            </button>
                            <div className="flex-1"></div>
                            <button 
                                onClick={() => setSelectedCell(null)}
                                className="px-4 py-2 text-gray-500 font-bold hover:bg-gray-200 rounded-lg transition-colors text-sm"
                            >
                                取消
                            </button>
                            <button 
                                onClick={handleSave}
                                className="px-6 py-2 bg-teal-600 text-white font-bold rounded-lg hover:bg-teal-700 shadow-md hover:shadow-lg transition-all text-sm"
                            >
                                儲存排班
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Assign Doctor Modal (New) */}
            {assignModal && (
                <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm border border-gray-100 animate-in zoom-in-95 duration-200 flex flex-col max-h-[80vh]">
                        <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center bg-teal-50/50 shrink-0">
                            <div>
                                <h3 className="font-bold text-gray-800 text-lg">指派醫師</h3>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    {assignModal.date} • {assignModal.station} ({assignModal.location})
                                </p>
                            </div>
                            <button onClick={() => setAssignModal(null)} className="text-gray-400 hover:text-gray-600 bg-white p-1 rounded-full shadow-sm hover:shadow transition-all">
                                <X size={20} />
                            </button>
                        </div>
                        
                        <div className="p-2 overflow-y-auto">
                            {/* 1. Recommended (Matches Capability) */}
                            <div className="mb-2">
                                <div className="text-xs font-bold text-teal-600 uppercase px-3 py-1.5 bg-teal-50/50 rounded-lg mb-1 mx-2">
                                    具備此技能之醫師
                                </div>
                                <div className="grid grid-cols-2 gap-2 p-2">
                                    {doctors.filter(d => {
                                        // User Request: Only full-time doctors for '晚班'
                                        if (assignModal.station === '晚班' && d.isPartTime) return false;
                                        
                                        // User Request: Only doctors with an EXISTING station on that day
                                        // User Request: Only doctors with an EXISTING station on that day
                                        const s = shifts.find(shift => shift.doctorId === d.id && shift.date === assignModal.date);
                                        const assignedSt = s?.scheduled_station || s?.station;
                                        const hasWorkingStation = assignedSt && !['X', 'OFF', '休假', 'Unassigned', '未分配'].includes(assignedSt);
                                        if (!hasWorkingStation) return false;

                                        return d.capabilities?.includes(assignModal.station);
                                    }).map(doc => {
                                        const isAlreadyAssigned = shifts.some(s => s.doctorId === doc.id && s.date === assignModal.date);
                                        return (
                                            <button 
                                                key={doc.id}
                                                onClick={() => handleAssignDoctor(doc.id)}
                                                className={`flex items-center gap-2 p-2 rounded-lg border transition-all text-left ${isAlreadyAssigned ? 'bg-gray-50 border-gray-200 opacity-60' : 'bg-white border-teal-100 hover:border-teal-300 hover:shadow-md hover:bg-teal-50/30'}`}
                                            >
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0 bg-teal-500`}>
                                                    {doc.alias}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="font-bold text-gray-700 text-sm truncate">{doc.name}</div>
                                                    {isAlreadyAssigned && <div className="text-[10px] text-red-400">已有排班</div>}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* 2. Others */}
                            <div>
                                <div className="text-xs font-bold text-gray-400 uppercase px-3 py-1.5 rounded-lg mb-1 mx-2">
                                    其他醫師
                                </div>
                                <div className="grid grid-cols-2 gap-2 p-2">
                                    {doctors.filter(d => {
                                        // User Request: Only full-time doctors for '晚班'
                                        if (assignModal.station === '晚班' && d.isPartTime) return false;
                                        
                                        // User Request: Only doctors with an EXISTING station on that day
                                        // User Request: Only doctors with an EXISTING station on that day
                                        const s = shifts.find(shift => shift.doctorId === d.id && shift.date === assignModal.date);
                                        const assignedSt = s?.scheduled_station || s?.station;
                                        const hasWorkingStation = assignedSt && !['X', 'OFF', '休假', 'Unassigned', '未分配'].includes(assignedSt);
                                        if (!hasWorkingStation) return false;

                                        return !d.capabilities?.includes(assignModal.station);
                                    }).map(doc => {
                                        const isAlreadyAssigned = shifts.some(s => s.doctorId === doc.id && s.date === assignModal.date);
                                        return (
                                            <button 
                                                key={doc.id}
                                                onClick={() => handleAssignDoctor(doc.id)}
                                                className={`flex items-center gap-2 p-2 rounded-lg border transition-all text-left ${isAlreadyAssigned ? 'bg-gray-50 border-gray-200 opacity-60' : 'bg-slate-50 border-slate-100 hover:border-gray-300 hover:bg-white'}`}
                                            >
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0 bg-gray-400`}>
                                                    {doc.alias}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="font-bold text-gray-600 text-sm truncate">{doc.name}</div>
                                                     {isAlreadyAssigned && <div className="text-[10px] text-red-400">已有排班</div>}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Target Days Configuration Modal */}
            {showTargetDaysModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col">
                        {/* Modal Header */}
                        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                                    <Wand2 className="text-purple-600" size={24} />
                                    設定排班天數
                                </h2>
                                <p className="text-xs text-gray-500 mt-1">
                                    排班範圍：{dateRange[0]} 至 {dateRange[dateRange.length - 1]} 
                                    （共 {dateRange.length} 天）
                                </p>
                            </div>
                            <button
                                onClick={() => setShowTargetDaysModal(false)}
                                className="text-gray-400 hover:text-gray-600 p-2 rounded-lg hover:bg-gray-100 transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Batch Setting */}
                        <div className="px-6 py-4 bg-purple-50 border-b border-purple-100">
                            <div className="flex items-center gap-3">
                                <label className="text-sm font-bold text-purple-900">統一設定所有醫師：</label>
                                <input
                                    type="number"
                                    min="0"
                                    max={dateRange.length}
                                    value={batchDays}
                                    onChange={e => setBatchDays(parseInt(e.target.value) || 0)}
                                    className="w-20 px-3 py-2 border border-purple-300 rounded-lg text-center font-bold focus:ring-2 focus:ring-purple-500 outline-none"
                                />
                                <span className="text-sm text-purple-700">天</span>
                                <button
                                    onClick={handleApplyBatchDays}
                                    className="ml-auto px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-bold hover:bg-purple-700 transition-colors shadow-sm"
                                >
                                    套用到全部
                                </button>
                            </div>
                            <div className="mt-2 space-y-1">
                                <p className="text-xs text-purple-600">
                                    💡 提示：設定值為 **該月總排班天數**（含固定排班與手動排班）。
                                </p>
                                <p className="text-[10px] text-purple-500 italic">
                                    設為 0 天的醫師將不會被排班（兼職醫師已自動排除）。
                                </p>
                            </div>
                        </div>

                        {/* Doctors List */}
                        <div className="flex-1 overflow-y-auto p-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {doctors.filter(d => !d.isPartTime).map(doctor => (
                                    <div
                                        key={doctor.id}
                                        className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg border border-gray-200 hover:border-purple-300 transition-colors"
                                    >
                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-400 to-indigo-500 flex items-center justify-center text-white font-bold shadow-md shrink-0">
                                                {doctor.alias || doctor.name[0]}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="font-bold text-gray-800 truncate">{doctor.name}</div>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    {doctor.specialty && (
                                                        <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{doctor.specialty}</span>
                                                    )}
                                                    {(() => {
                                                        const fixedCount = dateRange.reduce((count, date) => {
                                                            const dayOfWeek = new Date(date).getDay();
                                                            return count + (doctor.fixedShifts?.filter(fs => fs.dayOfWeek === dayOfWeek).length || 0);
                                                        }, 0);
                                                        if (fixedCount === 0) return null;
                                                        return (
                                                            <span className="text-[10px] text-indigo-600 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded font-medium">
                                                                固定排班: {fixedCount} 天
                                                            </span>
                                                        );
                                                    })()}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <input
                                                type="number"
                                                min="0"
                                                max={dateRange.length}
                                                value={targetDays[doctor.id] || 0}
                                                onChange={e => setTargetDays({
                                                    ...targetDays,
                                                    [doctor.id]: parseInt(e.target.value) || 0
                                                })}
                                                className="w-16 px-2 py-2 border border-gray-300 rounded-lg text-center font-bold focus:ring-2 focus:ring-purple-500 outline-none"
                                            />
                                            <span className="text-sm text-gray-600 font-medium">天</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between bg-gray-50">
                            <div className="text-xs text-gray-500">
                                全職醫師共 {doctors.filter(d => !d.isPartTime).length} 位
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowTargetDaysModal(false)}
                                    className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-bold transition-colors"
                                >
                                    取消
                                </button>
                                <button
                                    onClick={handleAutoSchedule}
                                    disabled={isAutoScheduling}
                                    className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:opacity-90 text-white rounded-lg font-bold transition-all shadow-md disabled:opacity-50 flex items-center gap-2"
                                >
                                    <Wand2 size={16} />
                                    {isAutoScheduling ? '排班中...' : '開始排班'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Auto Schedule Confirm Modal */}
            <ConfirmModal
                isOpen={showAutoScheduleConfirm}
                onClose={() => setShowAutoScheduleConfirm(false)}
                onConfirm={handleAutoSchedule}
                title="自動排班確認"
                message={
                    <>
                        <p>確定要為目前的日期範圍執行一鍵自動排班嗎？</p>
                        <p className="text-xs text-gray-500 mt-2">
                            範圍：{dateRange[0]} 至 {dateRange[dateRange.length - 1]}<br/>
                            此操作將會填補目前的空缺，已排定的人力將不會被覆蓋，但會參考排班禁忌。
                        </p>
                    </>
                }
                confirmText="開始排班"
                confirmColor="purple"
            />

            {/* Specialty Order Modal */}
            {showSpecialtyOrderModal && (
                <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm border border-gray-100 animate-in zoom-in-95 duration-200 overflow-hidden flex flex-col max-h-[80vh]">
                        <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center bg-teal-50/50">
                            <h3 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                                <ArrowUpDown size={18} className="text-teal-600"/>
                                科別排序設定
                            </h3>
                            <button onClick={() => setShowSpecialtyOrderModal(false)} className="text-gray-400 hover:text-gray-600 bg-white p-1 rounded-full shadow-sm hover:shadow transition-all">
                                <X size={20} />
                            </button>
                        </div>
                        
                        <div className="p-4 overflow-y-auto flex-1 space-y-2">
                             <div className="text-xs text-gray-500 mb-2 px-1">
                                請使用箭頭調整科別顯示順序。(排序靠前者將顯示在上方)
                             </div>
                             {tempSpecialties.map((spec, idx) => (
                                 <div key={spec} className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg shadow-sm hover:border-teal-300 transition-colors">
                                     <div className="flex items-center gap-3">
                                         <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center text-xs font-bold font-mono">
                                             {idx + 1}
                                         </span>
                                         <div className="font-bold text-gray-800 text-sm">{spec || '未分類'}</div>
                                     </div>
                                     <div className="flex items-center gap-1">
                                         <button 
                                            onClick={() => moveSpecialty(idx, 'up')}
                                            disabled={idx === 0}
                                            className="p-1.5 rounded hover:bg-slate-100 text-slate-400 disabled:opacity-30 disabled:hover:bg-transparent"
                                         >
                                             <ChevronLeft size={16} className="rotate-90"/>
                                         </button>
                                         <button 
                                            onClick={() => moveSpecialty(idx, 'down')}
                                            disabled={idx === tempSpecialties.length - 1}
                                            className="p-1.5 rounded hover:bg-slate-100 text-slate-400 disabled:opacity-30 disabled:hover:bg-transparent"
                                         >
                                             <ChevronLeft size={16} className="-rotate-90"/>
                                         </button>
                                     </div>
                                 </div>
                             ))}
                        </div>

                        <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-2">
                            <button
                                onClick={() => setShowSpecialtyOrderModal(false)}
                                className="px-4 py-2 rounded-lg text-sm font-bold text-gray-500 hover:bg-gray-200 transition-colors"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleSaveSpecialtyOrder}
                                className="px-4 py-2 rounded-lg text-sm font-bold bg-teal-600 text-white hover:bg-teal-700 shadow-md transition-colors"
                            >
                                儲存排序
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Doctor Memo Modal */}
            {memoModal && (
                <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-100 animate-in zoom-in-95 duration-200">
                        <div className="bg-purple-600 px-6 py-4 flex justify-between items-center">
                            <h3 className="text-white font-bold flex items-center gap-2">
                                <FileText size={20} />
                                醫師排班備忘 ({memoModal.date.split('-').slice(1).join('/')})
                            </h3>
                            <button onClick={() => setMemoModal(null)} className="text-white/80 hover:text-white transition-colors p-1 hover:bg-white/10 rounded-full">
                                <X size={20} />
                            </button>
                        </div>
                        
                        <div className="p-6">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-2 tracking-wider">備忘內容</label>
                            <textarea
                                className="w-full h-32 p-4 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none resize-none text-sm text-gray-700 placeholder-gray-400 bg-slate-50"
                                placeholder="輸入今日醫師排班相關提醒..."
                                value={memoModal.content}
                                onChange={(e) => setMemoModal({ ...memoModal, content: e.target.value })}
                                autoFocus
                            />
                            
                            <div className="flex justify-between items-center mt-6">
                                {!showDeleteConfirm ? (
                                    <button
                                        type="button"
                                        onClick={() => setShowDeleteConfirm(true)}
                                        className="text-red-500 hover:text-red-700 text-sm font-bold flex items-center gap-1.5 px-3 py-2 hover:bg-red-50 rounded-lg transition-colors"
                                    >
                                        <Trash2 size={16} /> 刪除
                                    </button>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm text-red-600 font-medium">確定要刪除嗎？</span>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                handleDeleteMemo(memoModal.date);
                                                setShowDeleteConfirm(false);
                                            }}
                                            className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-sm font-bold rounded-lg transition-colors"
                                        >
                                            確認刪除
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setShowDeleteConfirm(false)}
                                            className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm font-bold rounded-lg transition-colors"
                                        >
                                            取消
                                        </button>
                                    </div>
                                )}
                                
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setMemoModal(null)}
                                        className="px-4 py-2 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                                    >
                                        取消
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleSaveMemo(memoModal.date, memoModal.content)}
                                        className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold rounded-lg shadow-md shadow-purple-200 transition-all active:scale-95 flex items-center gap-2"
                                    >
                                        <Save size={16} /> 儲存
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PhysicianSchedulePage;
