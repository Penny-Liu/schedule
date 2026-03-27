
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { db } from '../services/store';
import { Doctor, UserRole, DoctorStationConfig, DateEventType, DoctorShift, PERMISSIONS } from '../types';
import { ChevronLeft, ChevronRight, ChevronDown, Download, Lock, RefreshCw, Save, Unlock, User, UserPlus, X, Calendar as CalendarIcon, Clock, Filter, Sliders, ArrowUpDown, Wand2, BarChart2, Check, AlertCircle, Plus, LayoutGrid, List as ListIcon, Trash2, Briefcase, FileText, MapPin, FileSpreadsheet, CalendarClock, Star, Shield, Users, Eye, EyeOff } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import ConfirmModal from '../components/ConfirmModal';
import { supabase } from '../services/supabaseClient';

interface PhysicianSchedulePageProps {
    currentUser: any;
}
import { toLocalISOString, generateUUID } from '../services/utils';


// Alias for internal use if needed
const propsToLocalISOString = toLocalISOString;

const isGIStation = (name: string) => (name || '').includes('GI') || (name || '').includes('腸胃');

const LOCATIONS = ['北投', '大直', '台中', '外部'];

const LOCATION_COLORS: Record<string, string> = {
    '北投': 'bg-blue-500 border-blue-600',
    '大直': 'bg-stone-500 border-stone-600',
    '台中': 'bg-orange-500 border-orange-600',
    '外部': 'bg-purple-500 border-purple-600',
};

const ASSIGNMENT_STATION_ORDER = [
    '解說', '影像', '遠班', '支援', 'GI1', 'GI2', 'GI', '麻醉', '行政', '耳鼻喉科', '眼科', '婦科'
];

const PhysicianSchedulePage: React.FC<PhysicianSchedulePageProps> = ({ currentUser }) => {
    
    // --- Copy Text Generators ---
    const generateBeitouCopyText = (date: Date, shifts: any[], doctors: Doctor[], staffShifts: any[], users: any[]) => {
        const dateStr = propsToLocalISOString(date);
        const dayShifts = shifts.filter(s => s.date === dateStr && (s.location === '北投' || !s.location));
        const dayStaffShifts = staffShifts.filter(s => s.date === dateStr);
        const dayHMShifts = db.getHealthMgmtShifts().filter(s => s.date === dateStr);
        const hmStaff = db.getHealthMgmtStaff();

        const getName = (userId: string) => {
            const u = users.find(user => user.id === userId);
            if (!u) return '';
            if (u.alias && /^[A-Za-z]+$/.test(u.alias)) return u.name.slice(-2);
            return u.alias || u.name.slice(-2);
        };

        const mainRads = dayStaffShifts.filter(s => {
            const u = users.find(user => user.id === s.userId);
            return u?.isRadiographer && (s.station?.includes('場控') || s.station === '主' || s.station === '主控');
        }).map(s => getName(s.userId));
        
        const assistRads = dayStaffShifts.filter(s => {
            const u = users.find(user => user.id === s.userId);
            return u?.isRadiographer && (s.specialRoles?.includes('輔班') || s.station === '輔' || s.station === '輔控');
        }).map(s => getName(s.userId));

        const getHM = (loc: string, type: '主' | '輔') => {
            return dayHMShifts.filter(s => {
                const isType = type === '主' ? (s.station?.includes('主控') || s.task === '主控') : (s.station?.includes('輔控') || s.task === '輔控');
                if (!isType) return false;
                const u = hmStaff.find(st => st.id === s.userId);
                return (s.location || u?.location || '北投') === loc;
            }).map(s => {
                const u = hmStaff.find(st => st.id === s.userId);
                return u?.alias || u?.name?.slice(-2) || '-';
            });
        };

        const mainHM = getHM('北投', '主');
        const assistHM = getHM('北投', '輔');

        const getDocs = (station: string) => dayShifts.filter(s => (s.scheduled_station === station || s.station === station)).map(s => {
            const d = doctors.find(doc => doc.id === s.doctorId);
            return d?.alias || d?.name || '?';
        });

        const giDocsArr = dayShifts.filter(s => isGIStation(s.scheduled_station || s.station || '')).map(s => {
            const d = doctors.find(doc => doc.id === s.doctorId);
            return d?.alias || d?.name || '?';
        });

        const stats = db.getDailyStats(dateStr);
        const dayNames = ['日', '一', '二', '三', '四', '五', '六'];

        return `${date.getMonth() + 1}/${date.getDate()} （${dayNames[date.getDay()]}）
主/輔：${mainRads.join('/') || '-'}/${assistRads.join('/') || '-'}  ${mainHM.join('/') || '-'}/${assistHM.join('/') || '-'}
影像：${getDocs('影像').join('/') || '無'}
解說：${getDocs('解說').join('/') || '無'}
支援：${getDocs('支援').join('/') || '無'}
GI：${giDocsArr.join('/') || '無'}
行政：${getDocs('行政').join('/') || '無'}
總人數 : ${stats?.beitou_clients || 0}人
MR：${stats?.beitou_mr || 0} 人
GI：${stats?.beitou_gi || 0} 台`;
    };

    const generateDazhiCopyText = (date: Date, shifts: any[], doctors: Doctor[]) => {
        const dateStr = propsToLocalISOString(date);
        const dayShifts = shifts.filter(s => s.date === dateStr && s.location === '大直');
        const dayHMShifts = db.getHealthMgmtShifts().filter(s => s.date === dateStr);
        const hmStaff = db.getHealthMgmtStaff();
        const stats = db.getDailyStats(dateStr);

        const getDocs = (station: string) => dayShifts.filter(s => s.scheduled_station === station).map(s => {
            const d = doctors.find(doc => doc.id === s.doctorId);
            return d?.name || '?';
        });

        const getRemoteDocs = () => {
            return shifts.filter(s => s.date === dateStr && ['遠班', '遠距', '遠'].includes(s.scheduled_station || s.station || ''))
                .map(s => {
                    const d = doctors.find(doc => doc.id === s.doctorId);
                    return `${d?.name} 醫師${s.location === '北投' ? ' (北投)' : ''}`;
                });
        };

        const imgDocs = getRemoteDocs();
        const expDocs = getDocs('解說');
        const giShifts = dayShifts.filter(s => isGIStation(s.scheduled_station || s.station || ''));
        // Maintain a stable order for GI doctors based on the station name (GI1, GI2...)
        const sortedGIShifts = [...giShifts].sort((a,b) => (a.scheduled_station || '').localeCompare(b.scheduled_station || ''));
        const giDocsNames = sortedGIShifts.map(s => doctors.find(doc => doc.id === s.doctorId)?.name || '?');
        
        const anesShifts = db.getAnesthesiaShifts().filter(s => s.date === dateStr && s.location === '大直');
        const anesStaffNames = anesShifts.map(s => db.getAnesthesiaStaff().find(as => as.id === s.userId)?.name).filter(Boolean);
        const anesDocNames = dayShifts.filter(s => (s.scheduled_station || '').includes('麻')).map(s => doctors.find(d => d.id === s.doctorId)?.name).filter(Boolean);
        const allAnes = Array.from(new Set([...anesStaffNames, ...anesDocNames]));

        const getSpec = (st: string) => {
            let res = getDocs(st).join('、');
            if (!res && st === '婦科') {
                const expShifts = dayShifts.filter(s => s.scheduled_station === '解說');
                const doc = expShifts.map(s => doctors.find(d => d.id === s.doctorId)).find(d => d?.capabilities?.includes('婦科'));
                if (doc) res = doc.name;
            }
            return res || '-';
        };

        const dayNames = ['日', '一', '二', '三', '四', '五', '六'];

        return `${date.getMonth() + 1}/${date.getDate()} （${dayNames[date.getDay()]}）
健檢客戶： ${stats?.dazhi_clients || 0} 位
(腸胃：${stats?.dazhi_gi || 0} / 心超： )
代謝客戶：   位

影像 : ${imgDocs.join('、') || '-'}
解說 : ${expDocs.join('、') || '-'} 醫師
腸胃：${giDocsNames.join(' 醫師、') || '-'} 醫師
麻醫：${allAnes.map(n => n + ' 醫師').join('、') || '-'}

3科會診醫師(09:00~12:00)
婦科：${getSpec('婦科')}
耳鼻喉科：${getSpec('耳鼻喉科')}
眼科：${getSpec('眼科')}

放射

營養諮詢

線上：


供餐：

腸胃鏡：${giDocsNames.map(n => n + '醫師').join('、') || '-'}
${giDocsNames.length}線 ${stats?.dazhi_gi || 0}台 (第一台 :   ，第二台 : ，最後一台 :     ，麻評  位)

${giDocsNames.map((n, i) => `診${i+1}：${n} 醫師(08：00)
主跟：
麻護：`).join('\n\n')}

POR：
流+洗：`;
    };

    const [currentDate, setCurrentDate] = useState(new Date());
    const dateInputRef = useRef<HTMLInputElement>(null);

    const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        if (val) {
            const [y, m, d] = val.split('-').map(Number);
            const newDate = new Date(y, m - 1, d);
            setCurrentDate(newDate);
        }
    };
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
    const canEdit = (currentUser.permissions?.includes(PERMISSIONS.EDIT_PHYSICIAN) || currentUser.role === UserRole.SYSTEM_ADMIN) && !isLocked;
    // Viewer and Finance can see stats only
    const canEditStats = (currentUser.permissions?.includes(PERMISSIONS.VIEW_DOCTOR_STATS) || currentUser.role === UserRole.SYSTEM_ADMIN || currentUser.role === UserRole.VIEWER || currentUser.role === UserRole.FINANCE) && !isLocked;
    const canManageLock = currentUser.role === UserRole.SYSTEM_ADMIN || currentUser.permissions?.includes(PERMISSIONS.EDIT_SETTINGS);
    
    const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Sync doctors with DB and handle updates
  useEffect(() => {
    const refreshDoctors = () => {
      setDoctors(db.getDoctors().filter(d => !d.isPartTime));
    };
    refreshDoctors();
    return db.subscribe(refreshDoctors);
  }, []);
    const [shifts, setShifts] = useState(db.getDoctorShifts());
    const [staffShifts, setStaffShifts] = useState(db.shifts); // New: For Radiologist Total Count
    // Fetch all users for name resolution (radiographers)
    const [users, setUsers] = useState<any[]>(db.getUsers());
    const radiographers = useMemo(() => users.filter(u => u.isRadiographer === true && u.isActive !== false), [users]);
    const currentCycle = useMemo(() => {
        const monthStr = `${currentDate.getFullYear()}/${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
        return db.getCycles().find(c => c.name === monthStr) || db.getCycles().find(c => c.startDate.startsWith(monthStr.replace('/', '-')));
    }, [currentDate]);

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
        return (currentUser.role === UserRole.VIEWER || currentUser.role === UserRole.FINANCE) ? 'daily' : 'personnel';
    });
    const [isQuickExcludeMode, setIsQuickExcludeMode] = useState(false);
    const [isReorderMode, setIsReorderMode] = useState(false);
    
    // Quick Assign (Paintbrush) State
    const [isQuickAssignMode, setIsQuickAssignMode] = useState(false);
    const [quickAssignData, setQuickAssignData] = useState<{ station: string, location: string, workTime: string, task: string }>(() => {
        try {
            const saved = localStorage.getItem('quickAssignData');
            if (saved) return JSON.parse(saved);
        } catch {}
        return { station: '影像', location: '北投', workTime: '', task: '' };
    });

    const [hiddenDoctorIds, setHiddenDoctorIds] = useState<string[]>([]);
    
    useEffect(() => {
        const saved = localStorage.getItem(`hiddenDoctorIds_${currentYearMonth}`);
        setHiddenDoctorIds(saved ? JSON.parse(saved) : []);
    }, [currentYearMonth]);

    useEffect(() => {
        if (hiddenDoctorIds.length >= 0) {
            localStorage.setItem(`hiddenDoctorIds_${currentYearMonth}`, JSON.stringify(hiddenDoctorIds));
        }
    }, [hiddenDoctorIds, currentYearMonth]);

    const updateQuickAssignData = (data: Partial<{ station: string, location: string, workTime: string, task: string }>) => {
        setQuickAssignData(prev => {
            const next = { ...prev, ...data };
            localStorage.setItem('quickAssignData', JSON.stringify(next));
            return next;
        });
    };


    const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
    const [doctorSearchQuery, setDoctorSearchQuery] = useState('');

    const [requirements, setRequirements] = useState(db.getStationRequirements());

    const dateRange = useMemo(() => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        
        // Mobile weekly view for Personnel perspective
        if (isMobile && (viewMode === 'personnel' || viewMode === 'station')) {
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
    const [isManpowerStatsExpanded, setIsManpowerStatsExpanded] = useState(false);
    
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

    const filteredDoctorsForDisplay = useMemo(() => {
        return doctors.filter(doc => !hiddenDoctorIds.includes(doc.id));
    }, [doctors, hiddenDoctorIds]);

    // Specialty Order Modal State
    const [showSpecialtyOrderModal, setShowSpecialtyOrderModal] = useState(false);
    const [tempSpecialties, setTempSpecialties] = useState<string[]>([]);
    const [specialtyOrder, setSpecialtyOrder] = useState<string[]>(db.settings.doctorSpecialties || []);
    const [holidays, setHolidays] = useState(() => db.getHolidays());

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
            setHolidays(db.getHolidays());
        };

        const unsubscribe = db.subscribe(handleDataChange);
        
        // Ensure data is loaded
        db.initializeData().then(() => {
            setDoctors(db.getDoctors());
            setShifts(db.getDoctorShifts());
            setStaffShifts(db.shifts);
            setHolidays(db.getHolidays());
        });

        return () => unsubscribe();
    }, [currentYearMonth]);

    const handleToggleLock = async () => {
        if (!canManageLock) return;
        const newLockState = await db.toggleMonthLock(currentYearMonth);
        setIsLocked(newLockState);
    };

    const handleStationCellClick = (station: string, location: string, date: string) => {
        if (currentUser.role !== UserRole.SYSTEM_ADMIN && !currentUser.permissions?.includes(PERMISSIONS.EDIT_PHYSICIAN)) return;
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
                id: existingShift?.id || generateUUID(),
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
        if (currentUser.role !== UserRole.SYSTEM_ADMIN && !currentUser.permissions?.includes(PERMISSIONS.EDIT_PHYSICIAN)) return;
        
        const contextShifts = isSimulationMode ? (simulatedShifts || []) : activeShifts;
        const shift = contextShifts.find(s => s.doctorId === doctorId && s.date === date);

        if (isQuickExcludeMode) {
             if (isSimulationMode) {
                 const updated = [...(simulatedShifts || [])].filter(s => !(s.doctorId === doctorId && s.date === date));
                 if (!(shift && shift.scheduled_station === 'X')) {
                     updated.push({
                         id: shift?.id || generateUUID(),
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
                     id: shift?.id || generateUUID(),
                     doctorId,
                     date,
                     station: quickAssignData.station,
                     scheduled_station: quickAssignData.station,
                     location: quickAssignData.location,
                     workTime: quickAssignData.workTime,
                     task: quickAssignData.task,
                     isAutoGenerated: true
                 });
                 setSimulatedShifts(updated);
                 return;
             }
             await db.assignDoctorSchedule(doctorId, date, quickAssignData.station, quickAssignData.workTime, undefined, quickAssignData.location, quickAssignData.task);
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
                    id: generateUUID(),
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

            const drawHeaders = () => {
                doc.setFont(fontName); 
                doc.setFontSize(12);
                doc.text(`${title} ${subtitle}`, 7, 6);

                doc.setFontSize(10);
                const pageWidth = doc.internal.pageSize.width;
                doc.text(exportDate, pageWidth - 7, 6, { align: 'right' });
            };

            // drawHeaders(); // Handled by didDrawPage


            const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
            
            // Prepare Headers
            let radiologistStartIndex = -1;
            let radiologistEndIndex = -1;
            let giStartIndex = -1;
            let giEndIndex = -1;

            const dateHeaders = dateRange.map(date => {
                const d = new Date(date);
                return `${d.getMonth() + 1}/${d.getDate()} \n${weekDays[d.getDay()]}`;
            });

            // Common Table Config
            const tableConfig: any = {
                theme: 'grid',
                rowPageBreak: 'avoid',
                tableLineWidth: 0.3,
                styles: {
                    font: fontName,
                    fontSize: viewMode === 'station' ? 8 : 7, 
                    cellPadding: viewMode === 'station' ? { top: 0.5, right: 0.3, bottom: 0.5, left: 0.3 } : 0.1, 
                    valign: 'middle',
                    halign: 'center',
                    lineWidth: 0.2,
                    lineColor: [180, 180, 180],
                    minCellHeight: viewMode === 'station' ? 5.0 : 3.2
                },
                headStyles: {
                    fillColor: viewMode === 'station' ? [30, 41, 59] : [66, 66, 66],
                    textColor: [255, 255, 255],
                    font: fontName,
                    fontSize: viewMode === 'station' ? 8 : 8,
                    cellPadding: viewMode === 'station' ? { top: 1.5, right: 0.5, bottom: 1.5, left: 0.5 } : 0.1,
                    minCellHeight: viewMode === 'station' ? 6.0 : 4.0 
                },
                columnStyles: (() => {
                    const pageWidth = doc.internal.pageSize.width;
                    const marginX = 2; // margin: 2 (left/right)
                    const nameWidth = viewMode === 'station' ? 17 : 16; 
                    const availableDateWidth = pageWidth - (marginX * 2) - nameWidth;
                    const dateWidth = availableDateWidth / dateRange.length;

                    const styles: Record<number, any> = {
                        0: { cellWidth: nameWidth, halign: 'center', fontStyle: 'bold' }
                    };
                    dateRange.forEach((_, i) => {
                        styles[i + 1] = { cellWidth: dateWidth };
                    });
                    return styles;
                })(),
                didDrawPage: (data: any) => {
                    drawHeaders();
                },
                // ... (didParseCell logic remains same)
                didParseCell: function(data: any) {
                    // Header Styling
                    if (data.section === 'head' && data.column.index > 0) {
                        const dateStr = dateRange[data.column.index - 1];
                        const d = new Date(dateStr);
                        const isHoliday = holidays.some(h => h.date === dateStr && (h.type === 'NATIONAL' || h.type === 'CLOSED'));
                        if (d.getDay() === 0 || d.getDay() === 6 || isHoliday) {
                            data.cell.styles.textColor = [255, 0, 0]; 
                        }
                    }
                    // Body Styling
                    if (data.section === 'body') {
                         // Apply light gray background to weekends for both views
                         if (data.column.index > 0) {
                              const dateStr = dateRange[data.column.index - 1];
                              const d = new Date(dateStr);
                              const isHoliday = holidays.some(h => h.date === dateStr && (h.type === 'NATIONAL' || h.type === 'CLOSED'));
                              if (d.getDay() === 0 || d.getDay() === 6 || isHoliday) {
                                  data.cell.styles.fillColor = [245, 245, 245];
                              }
                         }
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
                                       if (rawText.includes('中') || raw.rawShift.location === '中') data.cell.styles.fillColor = [255, 248, 186]; // Yellow for 台中
                                      
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
                         // Name: 10pt (~3.5mm line height)
                         // Details: 7pt (~2.5mm line height)
                         let totalHeight = 0;
                          shifts.forEach((shift: any, idx: number) => {
                              totalHeight += 2.8; // Name (8pt)
                              if (shift.locationAbbr) totalHeight += 2.3;
                              if (shift.time) totalHeight += 2.3;
                              if (shift.task && !(shift.stationName === '晚班' && shift.task === '晚班')) totalHeight += 2.3; 
                              if (idx < shifts.length - 1) totalHeight += 1.5; // Spacing between doctors
                          });
                          
                          let y = data.cell.y + (data.cell.height - totalHeight) / 2 + 2.2; // Baseline adjust
                         
                         shifts.forEach((shift: any, idx: number) => {
                              doc.setFontSize(8); // 8pt doctor name
                              doc.setTextColor(15, 23, 42);  // Near-black for name
                              doc.text(shift.name, x, y, { align: 'center' });
                              y += 2.8; 
                              
                              if (shift.locationAbbr) {
                                  doc.setFontSize(7);
                                  doc.setTextColor(100, 100, 100);
                                  doc.text(shift.locationAbbr, x, y, { align: 'center' });
                                  doc.setTextColor(0, 0, 0);
                                  y += 2.3;
                              }

                              if (shift.time) {
                                  doc.setFontSize(7);
                                  doc.setTextColor(80, 80, 80);
                                  doc.text(shift.time, x, y, { align: 'center' });
                                  doc.setTextColor(0, 0, 0);
                                  y += 2.3; 
                              }
                              
                              if (shift.task && !(shift.stationName === '晚班' && shift.task === '晚班')) {
                                  doc.setFontSize(7);
                                  if (shift.task === '晚班') {
                                      doc.setTextColor(220, 0, 0); 
                                  } else {
                                      doc.setTextColor(0, 0, 200); 
                                  }
                                  doc.text(shift.task, x, y, { align: 'center' });
                                  doc.setTextColor(0, 0, 0); 
                                  y += 2.3; 
                              }
                              
                              if (idx < shifts.length - 1) {
                                  // Draw a thin separator line between doctors
                                  doc.setDrawColor(200, 200, 200);
                                  doc.setLineWidth(0.2);
                                  doc.line(data.cell.x + 3, y + 0.5, data.cell.x + data.cell.width - 3, y + 0.5);
                                  doc.setDrawColor(0, 0, 0);
                                  y += 1.5;
                              }
                         });
                     }
                }
            };

            let headRow = [];
            let bodyRows: any[] = [];
            // 為崗位分離建置兩組 body
            let beitouRows: any[] = [];
            let dazhiTaichungRows: any[] = [];

            if (viewMode === 'station') {
                 // Single Page Logic with Sections
                headRow = [['崗位', ...dateHeaders]];
                
                const healthMgmtStaff = db.getHealthMgmtStaff();
                
                LOCATIONS.forEach((loc, locIndex) => {
                    const locStations = stations.filter(s => s.location === loc);
                    if (locStations.length === 0) return;
                    
                    // Location Header Row
                    const locBg = loc === '北投' ? [37, 99, 235] : 
                                  loc === '大直' ? [120, 95, 85] :
                                  loc === '台中' ? [217, 90, 15] :
                                  [109, 60, 220];
                    const locationHeaderRow: any[] = [
                        {
                            content: loc,
                            colSpan: dateRange.length + 1,
                            styles: {
                                fillColor: locBg,
                                textColor: [255, 255, 255],
                                fontStyle: 'bold',
                                halign: 'center',
                                fontSize: 11,
                                cellPadding: { top: 1.5, right: 4, bottom: 1.5, left: 4 },
                                minCellHeight: 6.0 
                            }
                        }
                    ];
                    // Check if loc is Beitou to determine which rows array to use
                    const targetRows = loc === '北投' ? beitouRows : dazhiTaichungRows;
                    
                    targetRows.push(locationHeaderRow);
                    
                    // Add Main/Assistant Shift Rows (only for Beitou)
                    if (loc === '北投') {
                        const isHM = (userId: string) => healthMgmtStaff.some(s => s.id === userId);
                        const isRad = (userId: string) => users.some(u => u.id === userId);

                        // Row 1: Radiographers
                        const radRow: any[] = [
                            {
                                content: '主/輔 (放射)',
                                styles: { fontStyle: 'bold', halign: 'center', fontSize: 8, minCellHeight: 5.0 }
                            }
                        ];
                        
                        // Row 2: Health Management
                        const hmRow: any[] = [
                            {
                                content: '主/輔 (健管)',
                                styles: { fontStyle: 'bold', halign: 'center', fontSize: 8, minCellHeight: 5.0 }
                            }
                        ];

                        dateRange.forEach(date => {
                            const dayRadShifts = db.shifts.filter(s => s.date === date);
                            const dayHMShifts = db.getHealthMgmtShifts().filter(s => s.date === date);
                            
                            const radMainShifts = dayRadShifts.filter(s => s.station?.includes('場控') || s.station === '主' || s.station === '主控');
                            const radAssistShifts = dayRadShifts.filter(s => s.specialRoles?.includes('輔班') || s.station === '輔控');

                            const hmMainShifts = dayHMShifts.filter(s => {
                                if (!(s.station === '主控' || s.task === '主控' || s.station?.includes('主控'))) return false;
                                const st = healthMgmtStaff.find(u => u.id === s.userId);
                                const effectiveLoc = s.location || st?.location || '北投';
                                return effectiveLoc === '北投';
                            });
                            const hmAssistShifts = dayHMShifts.filter(s => {
                                if (!(s.station === '輔控' || s.task === '輔控' || s.station?.includes('輔控'))) return false;
                                const st = healthMgmtStaff.find(u => u.id === s.userId);
                                const effectiveLoc = s.location || st?.location || '北投';
                                return effectiveLoc === '北投';
                            });

                            const getRadNames = (shifts: any[]) => {
                                return shifts
                                    .map(s => {
                                        const u = users.find(user => user.id === s.userId);
                                        return u?.alias || u?.name?.slice(-2) || '-';
                                    })
                                    .filter(n => n !== '-')
                                    .join('/');
                            };

                            const getHMNames = (shifts: any[]) => {
                                return shifts
                                    .map(s => {
                                        const u = healthMgmtStaff.find(st => st.id === s.userId);
                                        return u?.alias || u?.name?.slice(-2) || '-';
                                    })
                                    .filter(n => n !== '-')
                                    .join('/');
                            };

                            const radMain = getRadNames(radMainShifts) || '-';
                            const radAssist = getRadNames(radAssistShifts) || '-';
                            radRow.push({
                                content: `${radMain}/${radAssist}`,
                                styles: { halign: 'center', fontSize: 8, minCellHeight: 5.0 }
                            });

                            const hmMain = getHMNames(hmMainShifts) || '-';
                            const hmAssist = getHMNames(hmAssistShifts) || '-';
                            hmRow.push({
                                content: `${hmMain}/${hmAssist}`,
                                styles: { halign: 'center', fontSize: 8, minCellHeight: 5.0 }
                            });
                        });
                        
                        targetRows.push(radRow, hmRow);
                    }
                    
                    // Add Health Mgmt Main/Assistant Rows for Dazhi
                    if (loc === '大直') {
                        const isHM = (userId: string) => healthMgmtStaff.some(s => s.id === userId);
                        
                        const hmRow: any[] = [
                            {
                                content: '主/輔 (健管)',
                                styles: { fontStyle: 'bold', halign: 'center', fontSize: 8, minCellHeight: 5.0 }
                            }
                        ];

                        dateRange.forEach(date => {
                            const dayHMShifts = db.getHealthMgmtShifts().filter(s => s.date === date);
                            
                            const hmMainShifts = dayHMShifts.filter(s => {
                                if (!(s.station === '主控' || s.task === '主控' || s.station?.includes('主控'))) return false;
                                const st = healthMgmtStaff.find(u => u.id === s.userId);
                                const effectiveLoc = s.location || st?.location || '北投';
                                return effectiveLoc === '大直';
                            });
                            const hmAssistShifts = dayHMShifts.filter(s => {
                                if (!(s.station === '輔控' || s.task === '輔控' || s.station?.includes('輔控'))) return false;
                                const st = healthMgmtStaff.find(u => u.id === s.userId);
                                const effectiveLoc = s.location || st?.location || '北投';
                                return effectiveLoc === '大直';
                            });

                            const getHMNames = (shifts: any[]) => {
                                return shifts
                                    .map(s => {
                                        const u = healthMgmtStaff.find(st => st.id === s.userId);
                                        return u?.alias || u?.name?.slice(-2) || '-';
                                    })
                                    .filter(n => n !== '-')
                                    .join('/');
                            };

                            const hmMain = getHMNames(hmMainShifts) || '-';
                            const hmAssist = getHMNames(hmAssistShifts) || '-';
                            hmRow.push({
                                content: `${hmMain}/${hmAssist}`,
                                styles: { halign: 'center', fontSize: 8, minCellHeight: 5.0 }
                            });
                        });
                        
                        targetRows.push(hmRow);
                    }
                    
                    const processedStationNames: string[] = [];
                    locStations.forEach(s => {
                        const name = isGIStation(s.name) ? 'GI' : s.name;
                        if (!processedStationNames.includes(name)) processedStationNames.push(name);
                    });

                    processedStationNames.forEach(stName => {
                         if (loc === '大直' && stName === '晚班') return;
                          // Minimum cell height for each station row
                          const dynamicMinHeight = 5.0;
                          // Station name cell: subtle background
                          const stationNameBg = stName === '晚班' ? [255, 240, 240] : [248, 250, 252];
                          const rowData: any[] = [{ content: stName, styles: { fontStyle: 'bold', fontSize: 8, minCellHeight: dynamicMinHeight, fillColor: stationNameBg, textColor: stName === '晚班' ? [200, 0, 0] : [30, 41, 59] }, location: loc }];
                         
                         dateRange.forEach(date => {
                             let assignedShifts: any[] = [];
                             if (stName === 'GI') {
                                 ['GI1', 'GI2', 'GI', '腸胃'].forEach(actualSt => {
                                     const subShifts = shifts.filter(s => 
                                         s.date === date && s.location === loc && s.scheduled_station === actualSt
                                     );
                                     assignedShifts.push(...subShifts);
                                 });
                             } else {
                                 assignedShifts = shifts.filter(s => {
                                     if (s.date !== date || s.location !== loc) return false;
                                     if (stName === '晚班') return s.task?.includes('晚班');
                                     if (s.scheduled_station === stName) return true;
                                     if (stName === '婦科' && s.scheduled_station === '解說') {
                                         const doc = doctors.find(d => d.id === s.doctorId);
                                         return doc?.capabilities?.includes('婦科');
                                     }
                                     return false;
                                 });
                             }
                             
                             // Follow UI logic for remote crossover
                             if (assignedShifts.length === 0 && ['遠班', '遠距', '遠'].includes(stName)) {
                                 if (loc === '大直') {
                                     assignedShifts = shifts.filter(s => s.date === date && s.location === '北投' && ['遠班', '遠距', '遠'].includes(s.scheduled_station || ''));
                                 } else if (loc === '北投') {
                                     assignedShifts = shifts.filter(s => s.date === date && s.location === '大直' && ['遠班', '遠距', '遠'].includes(s.scheduled_station || ''));
                                 }
                             }
                             
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
                              
                              let cellStyles: any = { minCellHeight: dynamicMinHeight };
                              if (assignedShifts.length > 0) {
                                  let totalHeight = 0;
                                  assignedShifts.forEach((s, idx) => {
                                       totalHeight += 2.8; // Name (8pt)
                                       if (s.workTime) totalHeight += 2.3; 
                                       const showTask = s.task && !(stName === '晚班' && s.task === '晚班');
                                       if (showTask) totalHeight += 2.3;
                                       if (idx < assignedShifts.length - 1) totalHeight += 1.5;
                                        if (stName.includes('遠') && s.location) totalHeight += 2.3;
                                  });
                                  const hasAnyTask = assignedShifts.some(s => s.task && !(stName === '晚班' && s.task === '晚班'));
                                  const paddingBuffer = hasAnyTask ? 2.5 : 1.0;
                                  cellStyles = { minCellHeight: Math.max(totalHeight + paddingBuffer, dynamicMinHeight) }; 
                              } else {
                                  cellStyles = { minCellHeight: dynamicMinHeight };
                              }
                             
                             rowData.push({
                                 content: docInfos, // Dummy content for autoTable
                                 styles: cellStyles,
                                 rawStationShifts: assignedShifts.map(s => {
                                     const doc = doctors.find(d => d.id === s.doctorId);
                                     // 遠班加上地點縮寫，但移至下一行 (加入 locationAbbr)
                                     const isRemote = stName.includes('遠');
                                     const locAbbrStr = isRemote && s.location ? s.location : '';
                                     return {
                                         name: doc?.name || '?',
                                         time: formatTimeShort(s.workTime),
                                         task: s.task,
                                         locationAbbr: locAbbrStr,
                                         stationName: stName
                                     };
                                 })
                             });
                         });
                          targetRows.push(rowData);
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
                    .map((d, i) => d.specialty === '影像醫學部' ? i : -1)
                    .filter(i => i !== -1);
                
                if (radioIndices.length > 0) {
                    radiologistStartIndex = radioIndices[0];
                    radiologistEndIndex = radioIndices[radioIndices.length - 1];
                }

                // Find GI range
                const isGI = (st: string) => isGIStation(st);
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
                 const formatLocShort = (loc: string) => (loc === '北投' ? '北' : loc === '台中' ? '中' : loc === '大直' ? '直' : loc === '外部' ? '外' : loc ? `(${loc})` : '');

                // Push to outer bodyRows
                bodyRows = sortedDoctors.map(doc => {
                    const fixedHeight = 8.0;
                    const rowData: any[] = [{ content: doc.name, styles: { fontStyle: 'bold', fontSize: 9, minCellHeight: fixedHeight, cellPadding: { top: 0.2, bottom: 0.2, left: 0, right: 0 } } }];
                    dateRange.forEach(date => {
                         const shift = shifts.find(s => s.doctorId === doc.id && s.date === date);
                         const isExcluded = doc.excludedDays?.includes(new Date(date).getDay());
                         
                         // Set a consistent height for all cells in Personnel View
                         // (Base: 3.2, Max Task/Time: +2.2 +2.2 = 7.6, Padding: 0.2 -> ~8.0)

                         if (shift) {
                             const st = shift.scheduled_station;
                             if (st === 'X') {
                                 rowData.push({ content: 'X', styles: { minCellHeight: fixedHeight } });
                             } else if (st) {
                                 const allShiftsForDate = shifts.filter(s => s.doctorId === doc.id && s.date === date);
                                 const hasGynecology = allShiftsForDate.some(s => s.scheduled_station === '婦科');
                                 const hasExplanation = allShiftsForDate.some(s => s.scheduled_station === '解說');
                                 let displayStation = (hasGynecology && hasExplanation) ? '解+婦' : st;
                                 if (displayStation === '耳鼻喉科') displayStation = 'ENT';
                                 
                                 rowData.push({
                                     content: displayStation, 
                                     styles: { minCellHeight: fixedHeight }, 
                                     rawShift: {
                                         station: displayStation,
                                         time: formatTimeShort(shift.workTime),
                                         task: shift.task,
                                         location: formatLocShort(shift.location)
                                     }
                                 });
                             } else {
                                 rowData.push({ content: '', styles: { minCellHeight: fixedHeight } });
                             }
                         } else if (isExcluded) {
                             rowData.push({ content: 'X', styles: { minCellHeight: fixedHeight } });
                         } else {
                             rowData.push({ content: '', styles: { minCellHeight: fixedHeight } });
                         }
                    });
                    return rowData;
                });
            }

            // Unified autoTable call for both views
            if (viewMode === 'station') {
                 if (beitouRows.length > 0) {
                     autoTable(doc, {
                        ...tableConfig,
                        startY: 9, 
                        head: headRow,
                        body: beitouRows,
                        margin: { top: 11, right: 2, bottom: 2, left: 2 },
                     });
                 }
                 if (dazhiTaichungRows.length > 0) {
                     if (beitouRows.length > 0) doc.addPage();

                     autoTable(doc, {
                        ...tableConfig,
                        startY: 9, 
                        head: headRow,
                        body: dazhiTaichungRows,
                        margin: { top: 11, right: 2, bottom: 2, left: 2 },
                     });
                 }
            } else if (bodyRows.length > 0) {
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
                    
                    cell.value = `${date.getMonth() + 1}/${date.getDate()}\n${weekDays[dayOfWeek]}`;
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

                // Specialized Rows (Main/Assistant/Late)
                const healthMgmtStaff = db.getHealthMgmtStaff();
                const allHMShifts = db.getHealthMgmtShifts();
                const radShifts = db.shifts || [];
                const radUsers = db.getUsers();

                if (locationName === '北投') {
                    // 1. Main Shift (主班) - Combined Rad and HM
                    const rowMain = sheet1.getRow(currentRowIndex);
                    rowMain.getCell(1).value = '主班';
                    rowMain.getCell(1).border = borderStyle;
                    rowMain.getCell(1).alignment = alignCenter;

                    dateRange.forEach((dateStr, colIdx) => {
                        const dayRadShifts = radShifts.filter(s => s.date === dateStr && (s.station?.includes('場控') || s.station === '主' || s.station === '主控'));
                        const dayHMShifts = allHMShifts.filter(s => {
                            if (s.date !== dateStr) return false;
                            if (!(s.task === '主控' || s.station?.includes('主控'))) return false;
                            const st = healthMgmtStaff.find(u => u.id === s.userId);
                            const effectiveLoc = s.location || st?.location || '北投';
                            return effectiveLoc === '北投';
                        });

                        const names = [
                            ...dayRadShifts.map(s => radUsers.find(u => u.id === s.userId)?.name),
                            ...dayHMShifts.map(s => healthMgmtStaff.find(u => u.id === s.userId)?.name)
                        ].filter(Boolean);

                        const cell = rowMain.getCell(colIdx + 2);
                        cell.value = names.join('\n');
                        cell.border = borderStyle;
                        cell.alignment = alignCenter;
                        cell.font = { ...fontBase, bold: false };
                    });
                    currentRowIndex++;

                    // 2. Assistant Shift (輔班) - Combined Rad and HM
                    const rowAssist = sheet1.getRow(currentRowIndex);
                    rowAssist.getCell(1).value = '輔班';
                    rowAssist.getCell(1).border = borderStyle;
                    rowAssist.getCell(1).alignment = alignCenter;

                    dateRange.forEach((dateStr, colIdx) => {
                        const dayRadShifts = radShifts.filter(s => s.date === dateStr && (s.specialRoles?.includes('輔班') || s.station === '輔' || s.station === '輔控'));
                        const dayHMShifts = allHMShifts.filter(s => {
                            if (s.date !== dateStr) return false;
                            if (!(s.task === '輔控' || s.station?.includes('輔控'))) return false;
                            const st = healthMgmtStaff.find(u => u.id === s.userId);
                            const effectiveLoc = s.location || st?.location || '北投';
                            return effectiveLoc === '北投';
                        });

                        const names = [
                            ...dayRadShifts.map(s => radUsers.find(u => u.id === s.userId)?.name),
                            ...dayHMShifts.map(s => healthMgmtStaff.find(u => u.id === s.userId)?.name)
                        ].filter(Boolean);

                        const cell = rowAssist.getCell(colIdx + 2);
                        cell.value = names.join('\n');
                        cell.border = borderStyle;
                        cell.alignment = alignCenter;
                        cell.font = { ...fontBase, size: 9 };
                    });
                    currentRowIndex++;

                    // 3. Late Shift (晚班)
                    const rowLate = sheet1.getRow(currentRowIndex);
                    rowLate.getCell(1).value = '晚班';
                    rowLate.getCell(1).border = borderStyle;
                    rowLate.getCell(1).alignment = alignCenter;

                    dateRange.forEach((dateStr, colIdx) => {
                         const lateShifts = locShifts.filter(s => s.date === dateStr && s.task?.includes('晚班'));
                         const date = new Date(dateStr);
                         const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                         const cell = rowLate.getCell(colIdx + 2);
                         cell.border = borderStyle;
                         if (isWeekend) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };

                         if (lateShifts.length > 0) {
                             const richText: any[] = [];
                             lateShifts.forEach((lateShift, idx) => {
                                 const doc = doctors.find(d => d.id === lateShift.doctorId);
                                 const name = doc?.name || '?';
                                 const time = formatTimeForExcel(lateShift.workTime || (lateShift as any).work_time || '');
                                 
                                 richText.push({ text: name });
                                 if (time) richText.push({ text: '\n' + time });
                                 
                                 // Task is always "晚班" here, color it red
                                 richText.push({ text: '\n晚班', font: { color: { argb: 'FFFF0000' } } });
                                 
                                 if (idx < lateShifts.length - 1) {
                                     richText.push({ text: '\n\n' }); // Double newline between doctors
                                 }
                             });

                             cell.value = { richText };
                             cell.alignment = alignCenter;
                         }
                    });
                    currentRowIndex++;
                } else if (locationName === '大直') {
                    // 1. Main Shift (主控 - 大直)
                    const rowMain = sheet1.getRow(currentRowIndex);
                    rowMain.getCell(1).value = '主控';
                    rowMain.getCell(1).border = borderStyle;
                    rowMain.getCell(1).alignment = alignCenter;

                    dateRange.forEach((dateStr, colIdx) => {
                        const dayHMShifts = allHMShifts.filter(s => {
                            if (s.date !== dateStr) return false;
                            if (!(s.task === '主控' || s.station?.includes('主控'))) return false;
                            const st = healthMgmtStaff.find(u => u.id === s.userId);
                            const effectiveLoc = s.location || st?.location || '北投';
                            return effectiveLoc === '大直';
                        });

                        const names = dayHMShifts.map(s => healthMgmtStaff.find(u => u.id === s.userId)?.name).filter(Boolean);

                        const cell = rowMain.getCell(colIdx + 2);
                        cell.value = names.join('\n');
                        cell.border = borderStyle;
                        cell.alignment = alignCenter;
                        cell.font = { ...fontBase, bold: false };
                    });
                    currentRowIndex++;

                    // 2. Assistant Shift (輔控 - 大直)
                    const rowAssist = sheet1.getRow(currentRowIndex);
                    rowAssist.getCell(1).value = '輔控';
                    rowAssist.getCell(1).border = borderStyle;
                    rowAssist.getCell(1).alignment = alignCenter;

                    dateRange.forEach((dateStr, colIdx) => {
                        const dayHMShifts = allHMShifts.filter(s => {
                            if (s.date !== dateStr) return false;
                            if (!(s.task === '輔控' || s.station?.includes('輔控'))) return false;
                            const st = healthMgmtStaff.find(u => u.id === s.userId);
                            const effectiveLoc = s.location || st?.location || '北投';
                            return effectiveLoc === '大直';
                        });

                        const names = dayHMShifts.map(s => healthMgmtStaff.find(u => u.id === s.userId)?.name).filter(Boolean);

                        const cell = rowAssist.getCell(colIdx + 2);
                        cell.value = names.join('\n');
                        cell.border = borderStyle;
                        cell.alignment = alignCenter;
                        cell.font = { ...fontBase, size: 9 };
                    });
                    currentRowIndex++;
                }

                // Stations
                const processedStations: string[] = [];
                locStations.forEach(stationConfig => {
                    let station = stationConfig.name;
                    
                    // Unified GI logic for Excel
                    if (isGIStation(station)) {
                        if (processedStations.includes('GI')) return;
                        station = 'GI';
                        processedStations.push('GI');
                    } else {
                        processedStations.push(station);
                    }

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

                        // Find shifts for this station (support multiple doctors)
                        const stationShifts = locShifts.filter(s => {
                            if (s.date !== dateStr) return false;
                            if (station === 'GI') return isGIStation(s.scheduled_station || '');
                            return s.scheduled_station === station;
                        });
                        
                         if (stationShifts.length > 0) {
                             const richText: any[] = [];
                             stationShifts.forEach((shift, idx) => {
                                 const doc = doctors.find(d => d.id === shift.doctorId);
                                 const name = doc?.name || doc?.alias || '?';
                                 const time = formatTimeForExcel(shift.workTime || (shift as any).work_time || '');
                                 
                                 // User Request: Station View also needs Work Time and Task
                                 const showTaskValue = shift.task && !shift.task.includes('固定');
                                 const task = showTaskValue ? `(${shift.task})` : '';

                                 const baseColor = (isSimulationMode && shift.isAutoGenerated) ? 'FFD97706' : undefined;

                                 richText.push({ 
                                     text: name, 
                                     font: baseColor ? { color: { argb: baseColor } } : undefined 
                                 });
                                 if (time) {
                                     richText.push({ 
                                         text: '\n' + time, 
                                         font: baseColor ? { color: { argb: baseColor } } : undefined 
                                     });
                                 }
                                 
                                 if (task) {
                                     const taskColor = shift.task === '晚班' ? 'FFFF0000' : 'FF0000FF'; // Red for Evening, Blue for others
                                     richText.push({ 
                                         text: '\n' + task, 
                                         font: { color: { argb: taskColor } } 
                                     });
                                 }

                                 if (idx < stationShifts.length - 1) {
                                     richText.push({ text: '\n\n' }); // Double newline between doctors
                                 }
                             });

                             cell.value = { richText };
                             cell.alignment = alignCenter;
                         }
                    });
                    currentRowIndex++;
                });

                // Removed Late Shift from bottom (logic moved up)
            };

            addLocationSection('北投', 'FF3B82F6');
            addLocationSection('大直', 'FFA1887F');
            addLocationSection('台中', 'FFF97316');
            addLocationSection('外部', 'FF8B5CF6');


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
            <div className="bg-white border-b border-gray-200 px-2 md:px-4 py-2 flex flex-wrap items-center justify-between gap-y-2 shrink-0 shadow-sm z-30 sticky top-0">
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 text-teal-700 bg-teal-50 px-2 py-1 rounded-lg border border-teal-100">
                        <CalendarClock className="h-5 w-5" />
                        <h1 className="text-lg font-bold hidden md:block">醫師排班表</h1>
                    </div>
                    
                    <div className="flex items-center bg-slate-100 rounded-lg p-1 border border-slate-200">
                        <button 
                            onClick={() => setViewMode('personnel')}
                            className={`px-2 md:px-3 py-1 rounded-md text-xs font-bold transition-all ${viewMode === 'personnel' ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            人員
                        </button>
                        <button 
                            onClick={() => setViewMode('station')}
                            className={`px-2 md:px-3 py-1 rounded-md text-xs font-bold transition-all ${viewMode === 'station' ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            崗位
                        </button>
                         <button 
                            onClick={() => setViewMode('daily')}
                            className={`px-2 md:px-3 py-1 rounded-md text-xs font-bold transition-all ${viewMode === 'daily' ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            每日
                        </button>
                        {canEdit && (
                            <button 
                                onClick={() => setViewMode('statistics')}
                                className={`px-2 md:px-3 py-1 rounded-md text-xs font-bold transition-all flex items-center gap-1 ${viewMode === 'statistics' ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                <BarChart2 size={13} /> 統計報表
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
                                } else if (isMobile && (viewMode === 'personnel' || viewMode === 'station')) {
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
                        <div 
                            className="relative px-3 font-mono font-bold text-gray-700 min-w-[100px] text-center cursor-pointer hover:bg-slate-50 transition-colors flex items-center gap-1.5 group select-none"
                            onClick={() => dateInputRef.current?.showPicker ? dateInputRef.current.showPicker() : dateInputRef.current?.click()}
                            title="點擊切換日期"
                        >
                           {viewMode === 'daily' || (isMobile && (viewMode === 'personnel' || viewMode === 'station'))
                                ? `${toLocalISOString(currentDate)} (${['日', '一', '二', '三', '四', '五', '六'][currentDate.getDay()]})`
                                : `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`
                           }
                           <CalendarIcon size={14} className="text-gray-400 group-hover:text-blue-500" />
                           <input 
                                ref={dateInputRef}
                                type="date"
                                className="absolute opacity-0 invisible"
                                value={toLocalISOString(currentDate)}
                                onChange={handleDateChange}
                           />
                        </div>
                        <button 
                            onClick={() => {
                                const newDate = new Date(currentDate);
                                if (viewMode === 'daily') {
                                    newDate.setDate(newDate.getDate() + 1);
                                } else if (isMobile && (viewMode === 'personnel' || viewMode === 'station')) {
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
                        className="px-3 py-1 bg-slate-100 text-slate-600 rounded-lg text-sm font-bold hover:bg-slate-200 transition-colors border border-slate-200"
                    >
                        {viewMode === 'daily' || (isMobile && (viewMode === 'personnel' || viewMode === 'station')) ? '今天' : '本月'}
                    </button>

                    {(viewMode === 'personnel' || viewMode === 'station') && (
                        <button 
                            onClick={() => setIsFilterModalOpen(true)}
                            className={`px-3 py-1 rounded-lg text-sm font-bold border transition-all flex items-center gap-1.5 ${
                                hiddenDoctorIds.length > 0
                                ? 'bg-amber-100 text-amber-700 border-amber-300 shadow-sm' 
                                : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                            }`}
                        >
                            <Filter size={14} />
                            <span className="hidden sm:inline">過濾醫師</span>
                            {hiddenDoctorIds.length > 0 && (
                                <span className="bg-amber-500 text-white text-[10px] px-1.5 rounded-full ml-0.5">
                                    {doctors.length - hiddenDoctorIds.length}/{doctors.length}
                                </span>
                            )}
                        </button>
                    )}

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
                                className={`ml-1 px-3 py-1 rounded-lg text-sm font-bold transition-all border flex items-center gap-1 ${
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
                                    if (setIsAutoScheduling) setIsAutoScheduling(false);
                                }}
                                className={`ml-1 px-3 py-1 rounded-lg text-sm font-bold transition-all border flex items-center gap-1 ${
                                    isQuickAssignMode 
                                    ? 'bg-amber-500 text-white border-amber-600 shadow-md' 
                                    : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                                }`}
                            >
                                <span className="text-sm">{isQuickAssignMode ? '🖌️' : '🖊️'}</span>
                                {isQuickAssignMode ? '關閉' : '快排'}
                            </button>

                            {/* Quick Assign Config: shown inline when active */}
                            {isQuickAssignMode && (
                                <div className="ml-1 flex items-center gap-1 px-2 py-1 bg-amber-50 border border-amber-300 rounded-lg text-xs">
                                    <select
                                        value={quickAssignData.station}
                                        onChange={e => updateQuickAssignData({ station: e.target.value })}
                                        className="bg-transparent text-amber-800 font-bold outline-none cursor-pointer"
                                        title="快排崗位"
                                    >
                                        {Array.from(new Set(stations.map(s => s.name))).sort((a, b) => {
                                            const order = ['影像', '遠班', '遠距', '支援', 'GI1', 'GI2', 'GI', '麻醉', '行政', '耳鼻喉科', '眼科', '婦科'];
                                            let idxA = order.indexOf(a);
                                            let idxB = order.indexOf(b);
                                            if (idxA === -1) idxA = 999;
                                            if (idxB === -1) idxB = 999;
                                            return idxA - idxB;
                                        }).map(name => (
                                            <option key={name} value={name}>{name}</option>
                                        ))}
                                    </select>
                                    <span className="text-amber-400">/</span>
                                    <select
                                        value={quickAssignData.location}
                                        onChange={e => updateQuickAssignData({ location: e.target.value })}
                                        className="bg-transparent text-amber-700 outline-none cursor-pointer"
                                        title="快排地點"
                                    >
                                        <option value="北投">北投</option>
                                        <option value="大直">大直</option>
                                        <option value="台中">台中</option>
                                        <option value="外部">外部</option>
                                    </select>
                                    <span className="text-amber-400">/</span>
                                    <input
                                        type="text"
                                        placeholder="預設時間"
                                        value={quickAssignData.workTime}
                                        onChange={e => updateQuickAssignData({ workTime: e.target.value })}
                                        className="w-16 bg-transparent text-amber-700 outline-none placeholder:text-amber-300/50"
                                        title="手動輸入上班時間 (留空則用預設)"
                                    />
                                    <span className="text-amber-400">/</span>
                                    <input
                                        type="text"
                                        placeholder="特殊任務"
                                        value={quickAssignData.task || ''}
                                        onChange={e => updateQuickAssignData({ task: e.target.value })}
                                        className="w-16 bg-transparent text-amber-700 outline-none placeholder:text-amber-300/50"
                                        title="手動輸入特殊任務"
                                    />
                                </div>
                            )}

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
                            className="px-2 py-0.5 hover:bg-white rounded-lg text-xs font-bold text-teal-700 flex items-center gap-1 transition-all h-full"
                        >
                            <Download size={13} /> PDF
                        </button>
                        <div className="w-[1px] h-3 bg-teal-200 mx-0.5"></div>
                        <button 
                            onClick={handleExportExcel}
                            className="px-2 py-0.5 hover:bg-white rounded-lg text-xs font-bold text-emerald-700 flex items-center gap-1 transition-all h-full"
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
                                                className={`px-0.5 py-0.5 text-center border-r border-slate-100 min-w-[40px] sticky top-0 z-50 cursor-pointer hover:bg-slate-100 transition-colors ${isToday ? 'bg-teal-50' : (isHoliday || isWeekend ? 'bg-red-50' : 'bg-white')} border-b border-slate-200`}
                                            >
                                                <div className={`font-bold text-[11px] leading-tight ${isToday ? 'text-teal-600' : (isHoliday || isWeekend ? 'text-red-500' : 'text-slate-800')}`}>{d.getMonth() + 1}/{d.getDate()}</div>
                                                <div className={`text-[10px] opacity-75 leading-tight ${isToday ? 'text-teal-600' : (isHoliday || isWeekend ? 'text-red-500' : 'text-slate-700')}`}>
                                                    {['日', '一', '二', '三', '四', '五', '六'][d.getDay()]}
                                                </div>
                                                {(holiday || note || doctorNote) && (
                                                    <div className="flex flex-col items-center">
                                                        {holiday && (
                                                            <div className="text-[8px] font-bold text-red-600 whitespace-nowrap overflow-hidden text-ellipsis max-w-[40px]" title={holiday.name}>
                                                                {holiday.name}
                                                            </div>
                                                        )}
                                                        {note && (
                                                            <div className="text-[8px] font-medium text-blue-600 whitespace-nowrap overflow-hidden text-ellipsis max-w-[40px]" title={note.name}>
                                                                {note.name}
                                                            </div>
                                                        )}
                                                        {doctorNote && (
                                                            <div className="text-[9px] bg-purple-100 text-purple-700 px-0.5 rounded-lg font-bold shadow-sm whitespace-nowrap overflow-hidden text-ellipsis max-w-[40px]" title={doctorNote.name}>
                                                                📝 {doctorNote.name}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </th>
                                        );
                                    })}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredDoctorsForDisplay.map(doc => (
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
                                                            className="text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg p-0.5 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
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
                                                            className="text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg p-0.5 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
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
                                                    {(() => {
                                                        // Find the personalCycle entry for the currently viewed month
                                                        const currentMonthStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
                                                        const NON_WORK = ['', '未分配', 'Unassigned', '休假', 'SystemOff', 'X'];
                                                        const allShifts = isSimulationMode ? [...activeShifts, ...(simulatedShifts || [])] : shifts;

                                                        let activeCycle: { startDate: string; endDate: string } | null = null;
                                                        if (doc.personalCycles && doc.personalCycles[currentMonthStr]) {
                                                            activeCycle = doc.personalCycles[currentMonthStr];
                                                        }

                                                        // Format as M/D
                                                        const fmtDate = (s: string) => {
                                                            const [, m, d] = s.split('-');
                                                            return `${parseInt(m)}/${parseInt(d)}`;
                                                        };

                                                        if (activeCycle) {
                                                            const cycleShifts = allShifts.filter(s =>
                                                                s.doctorId === doc.id &&
                                                                s.date >= activeCycle!.startDate &&
                                                                s.date <= activeCycle!.endDate &&
                                                                !!s.scheduled_station &&
                                                                !NON_WORK.includes(s.scheduled_station)
                                                            ).length;
                                                            return (
                                                                <span className="text-[10px] text-slate-400 font-normal leading-tight">
                                                                    {fmtDate(activeCycle.startDate)}~{fmtDate(activeCycle.endDate)} · {cycleShifts}天
                                                                </span>
                                                            );
                                                        }
                                                        // Fallback: current month count in dateRange
                                                        const monthCount = allShifts.filter(s =>
                                                            s.doctorId === doc.id &&
                                                            dateRange.includes(s.date) &&
                                                            !!s.scheduled_station &&
                                                            !NON_WORK.includes(s.scheduled_station)
                                                        ).length;
                                                        return (
                                                            <span className="text-[10px] text-slate-400 font-normal">
                                                                {monthCount} 天
                                                            </span>
                                                        );
                                                    })()}
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
                                            if (isGIStation(cellDisplayStation)) cellDisplayStation = 'GI';
                                            else if (cellDisplayStation === '耳鼻喉科') cellDisplayStation = 'ENT';
                                            
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
                                                            <div className="h-full w-full flex flex-col items-center justify-center p-0 overflow-hidden">
                                                            <div className="flex flex-col items-center justify-center space-y-0.5 w-full" style={{ transform: 'scale(0.9)', transformOrigin: 'center center' }}>
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
                                                                    <div className={`text-[10px] px-1 rounded-lg text-white scale-90 ${LOCATION_COLORS[shift.location]?.split(' ')[0] || 'bg-gray-400'}`}>
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
                        <table className="w-full border-collapse bg-white table-fixed">
                            <thead className="sticky top-0 z-20 shadow-sm">
                                <tr>
                                    <th className={`sticky left-0 z-30 bg-slate-50/95 backdrop-blur border-b border-r border-slate-200 shadow-[4px_0_8px_rgba(0,0,0,0.02)] ${isMobile ? 'p-1 w-[85px] min-w-[85px]' : 'p-2 w-[120px] text-left'}`}>
                                        <div className={`flex items-center font-bold text-xs text-slate-600 ${isMobile ? 'justify-center' : 'gap-2'}`}>
                                            <LayoutGrid size={14} className="text-teal-600" />
                                            {!isMobile && '工作崗位'}
                                        </div>
                                    </th>
                                    {dateRange.map(date => {
                                        const d = new Date(date);
                                        const isToday = date === toLocalISOString(new Date());
                                        const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                                        const dailyHolidays = db.getHolidays().filter(h => h.date === date);
                                        const holiday = dailyHolidays.find(h => h.type === DateEventType.NATIONAL || h.type === DateEventType.CLOSED);
                                        
                                        return (
                                            <th 
                                                key={date} 
                                                className={`border-b border-slate-200 py-1.5 min-w-[52px] text-center relative ${isToday ? 'bg-teal-100' : (holiday ? 'bg-red-50' : 'bg-white')}`}
                                            >
                                                <div className="flex flex-col items-center gap-0.5">
                                                    <div className={`font-bold text-[11px] leading-tight ${isToday ? 'text-teal-600' : (isWeekend || holiday ? 'text-red-500' : 'text-slate-800')}`}>
                                                        {d.getMonth() + 1}/{d.getDate()}
                                                    </div>
                                                    <div className={`text-[10px] opacity-75 leading-tight ${isToday ? 'text-teal-600' : (isWeekend || holiday ? 'text-red-500' : 'text-slate-700')}`}>
                                                        {['日', '一', '二', '三', '四', '五', '六'][d.getDay()]}
                                                    </div>
                                                    {holiday && (
                                                        <span className={`text-[9px] px-1 rounded-sm leading-tight max-w-[45px] truncate mt-0.5 ${isToday ? 'bg-teal-200 text-teal-800 border border-teal-300' : 'bg-red-100 text-red-700 border border-red-200'}`}>
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
                                {/* --- Manpower Stats Rows --- */}
                                <tr className="bg-slate-100/50 border-t-2 border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => setIsManpowerStatsExpanded(!isManpowerStatsExpanded)}>
                                    <td colSpan={dateRange.length + 1} className="py-1.5 px-3">
                                        <div className="flex items-center gap-2 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                                            {isManpowerStatsExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                            客戶與檢查統計 (北投/大直)
                                            {!isManpowerStatsExpanded && <span className="text-[10px] font-normal lowercase text-slate-400 ml-2">(點擊展開詳細數據)</span>}
                                        </div>
                                    </td>
                                </tr>
                                {isManpowerStatsExpanded && (
                                    <>
                                        <tr className="bg-slate-50">
                                    <td className={`sticky left-0 z-10 bg-slate-50/95 backdrop-blur border-r border-slate-200 shadow-[4px_0_8px_rgba(0,0,0,0.02)] ${isMobile ? 'p-1 w-[85px] min-w-[85px]' : 'p-2'}`}>
                                        <div className="text-[10px] font-bold text-slate-600 flex items-center justify-end pr-2">北投客戶數</div>
                                    </td>
                                    {dateRange.map(date => {
                                        const stats = db.getDailyStats(date);
                                        return (
                                            <td key={date} className="p-0.5 border-r border-slate-100 text-center align-middle">
                                                {canEditStats ? (
                                                    <input 
                                                        type="number"
                                                        value={stats?.beitou_clients || 0}
                                                        onChange={(e) => db.updateDailyStats(date, { beitou_clients: Number(e.target.value) })}
                                                        className="w-full text-center text-xs font-bold bg-transparent outline-none focus:bg-white focus:ring-1 focus:ring-teal-500 rounded-lg py-1 text-slate-700"
                                                        placeholder="0"
                                                    />
                                                ) : (
                                                    <span className="text-xs font-bold text-slate-700">{stats?.beitou_clients || 0}</span>
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>
                                <tr className="bg-slate-50">
                                    <td className={`sticky left-0 z-10 bg-slate-50/95 backdrop-blur border-r border-slate-200 shadow-[4px_0_8px_rgba(0,0,0,0.02)] ${isMobile ? 'p-1 w-[85px] min-w-[85px]' : 'p-2'}`}>
                                        <div className="text-[10px] font-bold text-slate-600 flex items-center justify-end pr-2">MR 數</div>
                                    </td>
                                    {dateRange.map(date => {
                                        const stats = db.getDailyStats(date);
                                        return (
                                            <td key={date} className="p-0.5 border-r border-slate-100 text-center align-middle">
                                                {canEditStats ? (
                                                    <input 
                                                        type="number"
                                                        value={stats?.beitou_mr || 0}
                                                        onChange={(e) => db.updateDailyStats(date, { beitou_mr: Number(e.target.value) })}
                                                        className="w-full text-center text-xs font-bold bg-transparent outline-none focus:bg-white focus:ring-1 focus:ring-teal-500 rounded-lg py-1 text-slate-700"
                                                        placeholder="0"
                                                    />
                                                ) : (
                                                    <span className="text-xs font-bold text-blue-600">{stats?.beitou_mr || 0}</span>
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>
                                <tr className="bg-slate-50">
                                    <td className={`sticky left-0 z-10 bg-slate-50/95 backdrop-blur border-r border-slate-200 shadow-[4px_0_8px_rgba(0,0,0,0.02)] ${isMobile ? 'p-1 w-[85px] min-w-[85px]' : 'p-2'}`}>
                                        <div className="text-[10px] font-bold text-slate-600 flex items-center justify-end pr-2">GI(北投)</div>
                                    </td>
                                    {dateRange.map(date => {
                                        const stats = db.getDailyStats(date);
                                        return (
                                            <td key={date} className="p-0.5 border-r border-slate-100 text-center align-middle">
                                                {canEditStats ? (
                                                    <input 
                                                        type="number"
                                                        value={stats?.beitou_gi || 0}
                                                        onChange={(e) => db.updateDailyStats(date, { beitou_gi: Number(e.target.value) })}
                                                        className="w-full text-center text-xs font-bold bg-transparent outline-none focus:bg-white focus:ring-1 focus:ring-teal-500 rounded-lg py-1 text-slate-700"
                                                        placeholder="0"
                                                    />
                                                ) : (
                                                    <span className="text-xs font-bold text-emerald-600">{stats?.beitou_gi || 0}</span>
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>
                                <tr className="bg-slate-50">
                                    <td className={`sticky left-0 z-10 bg-slate-50/95 backdrop-blur border-r border-slate-200 shadow-[4px_0_8px_rgba(0,0,0,0.02)] ${isMobile ? 'p-1 w-[85px] min-w-[85px]' : 'p-2'}`}>
                                        <div className="text-[10px] font-bold text-slate-600 flex items-center justify-end pr-2">CTA 數</div>
                                    </td>
                                    {dateRange.map(date => {
                                        const stats = db.getDailyStats(date);
                                        return (
                                            <td key={date} className="p-0.5 border-r border-slate-100 text-center align-middle">
                                                {canEditStats ? (
                                                    <input 
                                                        type="number"
                                                        value={stats?.beitou_cta || 0}
                                                        onChange={(e) => db.updateDailyStats(date, { beitou_cta: Number(e.target.value) })}
                                                        className="w-full text-center text-xs font-bold bg-transparent outline-none focus:bg-white focus:ring-1 focus:ring-teal-500 rounded-lg py-1 text-slate-700"
                                                        placeholder="0"
                                                    />
                                                ) : (
                                                    <span className="text-xs font-bold text-slate-700">{stats?.beitou_cta || 0}</span>
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>
                                <tr className="bg-slate-50">
                                    <td className={`sticky left-0 z-10 bg-slate-50/95 backdrop-blur border-r border-slate-200 shadow-[4px_0_8px_rgba(0,0,0,0.02)] ${isMobile ? 'p-1 w-[85px] min-w-[85px]' : 'p-2'}`}>
                                        <div className="text-[10px] font-bold text-slate-600 flex items-center justify-end pr-2">大直客戶數</div>
                                    </td>
                                    {dateRange.map(date => {
                                        const stats = db.getDailyStats(date);
                                        return (
                                            <td key={date} className="p-0.5 border-r border-slate-100 text-center align-middle">
                                                {canEditStats ? (
                                                    <input 
                                                        type="number"
                                                        value={stats?.dazhi_clients || 0}
                                                        onChange={(e) => db.updateDailyStats(date, { dazhi_clients: Number(e.target.value) })}
                                                        className="w-full text-center text-xs font-bold bg-transparent outline-none focus:bg-white focus:ring-1 focus:ring-teal-500 rounded-lg py-1 text-slate-700"
                                                        placeholder="0"
                                                    />
                                                ) : (
                                                    <span className="text-xs font-bold text-slate-700">{stats?.dazhi_clients || 0}</span>
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>
                                <tr className="bg-slate-50 border-b border-slate-200">
                                    <td className={`sticky left-0 z-10 bg-slate-50/95 backdrop-blur border-r border-slate-200 shadow-[4px_0_8px_rgba(0,0,0,0.02)] ${isMobile ? 'p-1 w-[85px] min-w-[85px]' : 'p-2'}`}>
                                        <div className="text-[10px] font-bold text-slate-600 flex items-center justify-end pr-2">GI(大直)</div>
                                    </td>
                                    {dateRange.map(date => {
                                        const stats = db.getDailyStats(date);
                                        return (
                                            <td key={date} className="p-0.5 border-r border-slate-100 text-center align-middle">
                                                {canEditStats ? (
                                                    <input 
                                                        type="number"
                                                        value={stats?.dazhi_gi || 0}
                                                        onChange={(e) => db.updateDailyStats(date, { dazhi_gi: Number(e.target.value) })}
                                                        className="w-full text-center text-xs font-bold bg-transparent outline-none focus:bg-white focus:ring-1 focus:ring-teal-500 rounded-lg py-1 text-slate-700"
                                                        placeholder="0"
                                                    />
                                                ) : (
                                                    <span className="text-xs font-bold text-emerald-600">{stats?.dazhi_gi || 0}</span>
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>
                                </>
                                )}
                                {LOCATIONS.map(location => {
                                    // Filter stations that belong to this location
                                    const locationStations = stations.filter(s => s.location === location);
                                    
                                    if (locationStations.length === 0) return null; // Skip empty locations

                                    const radUsers = db.getUsers();
                                    const hmStaff = db.getHealthMgmtStaff();

                                    return (
                                        <React.Fragment key={location}>
                                            {/* Location Header */}
                                            <tr className="bg-slate-100 border-b-2 border-slate-300">
                                                <td colSpan={dateRange.length + 1} className="px-3 py-2 font-bold text-slate-800 bg-slate-200 sticky left-0 z-10 text-left border-y-2 border-slate-400 shadow-[inset_0_2px_4px_rgba(0,0,0,0.1)]">
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
                                                    <tr className="bg-amber-50/30 border-b border-amber-100 group hover:bg-amber-50/50 transition-colors">
                                                        <td className={`sticky left-0 z-10 bg-amber-50/80 backdrop-blur border-r border-amber-200 shadow-[4px_0_8px_rgba(0,0,0,0.02)] ${isMobile ? 'p-1 w-[85px] min-w-[85px]' : 'p-2'}`}>
                                                            <div className="text-xs font-bold text-amber-800 flex items-center justify-end pr-2">主班</div>
                                                        </td>
                                                        {dateRange.map(date => {
                                                            const radShifts = db.shifts.filter(s => 
                                                                s.date === date && (s.station?.includes('場控') || s.station === '主' || s.station === '主控')
                                                            );
                                                            const hmShifts = db.getHealthMgmtShifts().filter(s => {
                                                                if (s.date !== date) return false;
                                                                if (!(s.task === '主控' || s.station?.includes('主控'))) return false;
                                                                const st = hmStaff.find(u => u.id === s.userId);
                                                                const effectiveLoc = s.location || st?.location || '北投';
                                                                return effectiveLoc === '北投';
                                                            });
                                                            
                                                            const radNames = radShifts.map(s => {
                                                                const u = radUsers.find(u => u.id === s.userId);
                                                                return u?.isRadiographer ? u.name : null;
                                                            }).filter(Boolean);
                                                            
                                                            const hmNames = hmShifts.map(s => {
                                                                const st = hmStaff.find(u => u.id === s.userId);
                                                                return st?.name;
                                                            }).filter(Boolean);
                                                            
                                                            const displayList = [...radNames, ...hmNames];
                                                            
                                                            return (
                                                                <td 
                                                                    key={date} 
                                                                    className="p-1 border-r border-amber-50 text-center text-[11px] font-normal text-amber-900"
                                                                >
                                                                    {displayList.length > 0 ? displayList.map((name, i) => (
                                                                        <div key={`${name}-${i}`} className="leading-tight py-0.5">{name}</div>
                                                                    )) : '-'}
                                                                </td>
                                                            );
                                                        })}
                                                    </tr>

                                                    {/* Assistant Shift (輔控) */}
                                                    <tr className="bg-amber-50/30 border-b border-amber-100 group hover:bg-amber-50/50 transition-colors">
                                                        <td className={`sticky left-0 z-10 bg-amber-50/80 backdrop-blur border-r border-amber-200 shadow-[4px_0_8px_rgba(0,0,0,0.02)] ${isMobile ? 'p-1 w-[85px] min-w-[85px]' : 'p-2'}`}>
                                                            <div className="text-xs font-bold text-amber-800 flex items-center justify-end pr-2">輔班</div>
                                                        </td>
                                                        {dateRange.map(date => {
                                                            const radShifts = db.shifts.filter(s => 
                                                                s.date === date && (s.specialRoles?.includes('輔班') || s.station === '輔' || s.station === '輔控')
                                                            );
                                                            const hmShifts = db.getHealthMgmtShifts().filter(s => {
                                                                if (s.date !== date) return false;
                                                                if (!(s.task === '輔控' || s.station?.includes('輔控'))) return false;
                                                                const st = hmStaff.find(u => u.id === s.userId);
                                                                const effectiveLoc = s.location || st?.location || '北投';
                                                                return effectiveLoc === '北投';
                                                            });
                                                            
                                                            const radNames = radShifts.map(s => {
                                                                const u = radUsers.find(u => u.id === s.userId);
                                                                return u?.isRadiographer ? u.name : null;
                                                            }).filter(Boolean);
                                                            
                                                            const hmNames = hmShifts.map(s => {
                                                                const st = hmStaff.find(u => u.id === s.userId);
                                                                return st?.name;
                                                            }).filter(Boolean);
                                                            
                                                            const displayList = [...radNames, ...hmNames];
                                                            
                                                            return (
                                                                <td 
                                                                    key={date} 
                                                                    className="p-1 border-r border-amber-50 text-center text-[11px] font-normal text-amber-900"
                                                                >
                                                                    {displayList.length > 0 ? displayList.map((name, i) => (
                                                                        <div key={`${name}-${i}`} className="leading-tight py-0.5">{name}</div>
                                                                    )) : '-'}
                                                                </td>
                                                            );
                                                        })}
                                                    </tr>
                                                </>
                                            )}

                                            {/* Main/Assistant Shift Rows (only for Dazhi Health Mgmt) */}
                                            {location === '大直' && (
                                                <>
                                                    {/* Main Shift (主控 - 大直) */}
                                                    <tr className="bg-amber-50/30 border-b border-amber-100 group hover:bg-amber-50/50 transition-colors">
                                                        <td className={`sticky left-0 z-10 bg-amber-50/80 backdrop-blur border-r border-amber-200 shadow-[4px_0_8px_rgba(0,0,0,0.02)] ${isMobile ? 'p-1 w-[85px] min-w-[85px]' : 'p-2'}`}>
                                                            <div className="text-xs font-bold text-amber-800 flex items-center justify-end pr-2">主控</div>
                                                        </td>
                                                        {dateRange.map(date => {
                                                            const hmShifts = db.getHealthMgmtShifts().filter(s => {
                                                                if (s.date !== date) return false;
                                                                if (!(s.task === '主控' || s.station?.includes('主控'))) return false;
                                                                const st = hmStaff.find(u => u.id === s.userId);
                                                                const effectiveLoc = s.location || st?.location || '北投';
                                                                return effectiveLoc === '大直';
                                                            });
                                                            
                                                            const hmNames = hmShifts.map(s => {
                                                                const st = hmStaff.find(u => u.id === s.userId);
                                                                return st?.name;
                                                            }).filter(Boolean);
                                                            
                                                            return (
                                                                <td 
                                                                    key={date} 
                                                                    className="p-1 border-r border-amber-50 text-center text-[11px] font-normal text-amber-900"
                                                                >
                                                                    {hmNames.length > 0 ? hmNames.map((name, i) => (
                                                                        <div key={`${name}-${i}`} className="leading-tight py-0.5">{name}</div>
                                                                    )) : '-'}
                                                                </td>
                                                            );
                                                        })}
                                                    </tr>

                                                    {/* Assistant Shift (輔控 - 大直) */}
                                                    <tr className="bg-amber-50/30 border-b border-amber-100 group hover:bg-amber-50/50 transition-colors">
                                                        <td className={`sticky left-0 z-10 bg-amber-50/80 backdrop-blur border-r border-amber-200 shadow-[4px_0_8px_rgba(0,0,0,0.02)] ${isMobile ? 'p-1 w-[85px] min-w-[85px]' : 'p-2'}`}>
                                                            <div className="text-xs font-bold text-amber-800 flex items-center justify-end pr-2">輔控</div>
                                                        </td>
                                                        {dateRange.map(date => {
                                                            const hmShifts = db.getHealthMgmtShifts().filter(s => {
                                                                if (s.date !== date) return false;
                                                                if (!(s.task === '輔控' || s.station?.includes('輔控'))) return false;
                                                                const st = hmStaff.find(u => u.id === s.userId);
                                                                const effectiveLoc = s.location || st?.location || '北投';
                                                                return effectiveLoc === '大直';
                                                            });
                                                            
                                                            const hmNames = hmShifts.map(s => {
                                                                const st = hmStaff.find(u => u.id === s.userId);
                                                                return st?.name;
                                                            }).filter(Boolean);
                                                            
                                                            return (
                                                                <td 
                                                                    key={date} 
                                                                    className="p-1 border-r border-amber-50 text-center text-[11px] font-normal text-amber-900"
                                                                >
                                                                    {hmNames.length > 0 ? hmNames.map((name, i) => (
                                                                        <div key={`${name}-${i}`} className="leading-tight py-0.5">{name}</div>
                                                                    )) : '-'}
                                                                </td>
                                                            );
                                                        })}
                                                    </tr>
                                                </>
                                            )}
                

                                            {(() => {
                                                const PRESCRIBED_ORDER: Record<string, string[]> = {
                                                    '北投': ['晚班', '解說', '影像', '遠班', '支援', 'GI', '麻醉', '耳鼻喉科', '眼科', '婦科', '行政'],
                                                    '大直': ['解說', '遠班', 'GI', '麻醉', '耳鼻喉科', '眼科', '婦科'],
                                                    '台中': ['影像', 'GI']
                                                };
                                                
                                                const orderedStationNames = PRESCRIBED_ORDER[location] || [];
                                                const locationStations = orderedStationNames.map(name => ({ name, location }));

                                                return locationStations.map(stationConfig => {
                                                const stationName = stationConfig.name;
                                                return (
                                                    <tr key={`${location}-${stationName}`} className="group hover:bg-slate-50/50 transition-colors border-b border-slate-100">
                                                        {/* Station Name Header */}
                                                        <td className={`sticky left-0 z-10 bg-white group-hover:bg-slate-50 backdrop-blur-sm border-r border-slate-200 shadow-[4px_0_8px_rgba(0,0,0,0.02)] ${isMobile ? 'p-1 w-[85px] min-w-[85px]' : 'p-2'}`}>
                                                            <div className="flex flex-col items-end pr-2">
                                                                <span className="text-xs font-bold text-slate-700">{stationName}</span>
                                                            </div>
                                                        </td>

                                                        {/* Date Cells */}
                                                        {dateRange.map(date => {
                                                            // NEW: Get ALL shifts for this station+location+date (support multiple doctors)
                                                            const allRelevantShifts = [
                                                                ...activeShifts,
                                                                ...(simulatedShifts || [])
                                                            ];
                                                            
                                                            const currentShifts = allRelevantShifts.filter(s => {
                                                                if (s.date !== date || s.location !== location) return false;
                                                                
                                                                if (stationName === 'GI') {
                                                                    return isGIStation(s.scheduled_station || '');
                                                                }

                                                                if (s.scheduled_station === stationName) return true;
                                                                
                                                                // Logic: Show 'Explanation' doctors in 'Gyn' station if FamilyMed + Gyn Capable
                                                                if (stationName === '婦科' && s.scheduled_station === '解說') {
                                                                     const doc = doctors.find(d => d.id === s.doctorId);
                                                                     return doc?.capabilities?.includes('婦科');
                                                                }
                                                                
                                                                // Logic: Show 'Late Shift' task in 'Late Shift' station row
                                                                if (stationName === '晚班' && s.task?.includes('晚班')) return true;

                                                                return false;
                                                            });
                                                            
                                                            let displayShifts = [...currentShifts];
                                                            let suffix = '';
                                                            
                                                            if (location === '大直' && ['遠班', '遠距', '遠'].includes(stationName) && displayShifts.length === 0) {
                                                                const beitouRemoteShifts = allRelevantShifts.filter(s => s.date === date && s.location === '北投' && ['遠班', '遠距', '遠'].includes(s.scheduled_station));
                                                                if (beitouRemoteShifts.length > 0) {
                                                                    displayShifts = beitouRemoteShifts;
                                                                    suffix = '(北)';
                                                                }
                                                            }
                                                            
                                                            if (location === '北投' && ['遠班', '遠距', '遠'].includes(stationName) && displayShifts.length === 0) {
                                                                const dazhiRemoteShifts = allRelevantShifts.filter(s => s.date === date && s.location === '大直' && ['遠班', '遠距', '遠'].includes(s.scheduled_station));
                                                                 if (dazhiRemoteShifts.length > 0) {
                                                                    displayShifts = dazhiRemoteShifts;
                                                                    suffix = '(直)';
                                                                }
                                                            }

                                                            // Custom sort for GI station
                                                            if (stationName === 'GI') {
                                                                displayShifts.sort((a, b) => {
                                                                    const getWeight = (st: string) => {
                                                                        const s = st.toUpperCase();
                                                                        if (s === 'GI1') return 1;
                                                                        if (s === 'GI2') return 2;
                                                                        if (s === 'GI') return 3;
                                                                        return 4;
                                                                    };
                                                                    return getWeight(a.scheduled_station || a.station || '') - getWeight(b.scheduled_station || b.station || '');
                                                                });
                                                            }

                                                            const isToday = date === toLocalISOString(new Date());

                                                            // Background color logic
                                                            const getStationBgColor = () => {
                                                                if (stationName.includes('遠')) return 'bg-pink-100/50';
                                                                if (stationName.includes('腸胃') || stationName.toLowerCase().includes('gi')) return 'bg-blue-100/50';
                                                                if (stationName.includes('解說')) return 'bg-orange-100/50';
                                                                if (stationName.includes('支援')) return 'bg-yellow-100/50';
                                                                if (stationName.includes('行政')) return 'bg-white';
                                                                if (stationName.includes('眼') || stationName.includes('婦') || stationName.includes('耳')) return 'bg-amber-100/50';
                                                                return 'bg-teal-50/40'; 
                                                            };

                                                            return (
                                                                <td 
                                                                    key={date} 
                                                                    className={`p-1 border-r border-slate-100 min-w-[52px] relative 
                                                                        ${canEdit ? 'cursor-pointer hover:bg-slate-50' : 'cursor-not-allowed'}
                                                                        ${getStationBgColor()} 
                                                                        ${selectedCell?.date === date && selectedCell?.doctorId === '' ? 'ring-2 ring-inset ring-blue-400' : ''}
                                                                    `}
                                                                    onClick={() => canEdit && handleStationCellClick(stationName, location, date)}
                                                                >
                                                                    {/* Indicators for GI (Red) and Explanation (Deep Blue) */}
                                                                    {(() => {
                                                                        const isGI = isGIStation(stationName);
                                                                        const isExp = stationName.includes('解說');
                                                                        const stats = db.getDailyStats(date);
                                                                        
                                                                        if (isGI) {
                                                                            return (
                                                                                <div className="absolute top-0 right-0 z-10 bg-red-600 text-white px-1.5 py-0.5 text-[10px] font-black rounded-bl shadow-md pointer-events-none">
                                                                                    {location === '北投' ? stats?.beitou_gi : (location === '大直' ? stats?.dazhi_gi : '')}
                                                                                </div>
                                                                            );
                                                                        }
                                                                        if (isExp) {
                                                                            return (
                                                                                <div className="absolute top-0 right-0 z-10 bg-blue-700 text-white px-1.5 py-0.5 text-[10px] font-black rounded-bl shadow-md pointer-events-none">
                                                                                    {location === '北投' ? stats?.beitou_clients : (location === '大直' ? stats?.dazhi_clients : '')}
                                                                                </div>
                                                                            );
                                                                        }
                                                                        return null;
                                                                    })()}
                                                                    {displayShifts.length > 0 ? (
                                                                        <div className={`flex flex-col items-center gap-0.5 px-0.5 pb-1 w-full ${(isGIStation(stationName) || stationName.includes('解說')) ? 'justify-start pt-6' : 'justify-center py-1'}`}>
                                                                             {displayShifts.map((shift, index) => {
                                                                                const doc = doctors.find(d => d.id === shift.doctorId);
                                                                                const isSimulated = simulatedShifts?.some(ss => ss.id === shift.id);
                                                                                 return (
                                                                                     <div key={shift.id} className={`w-full text-center p-0.5 rounded ${isSimulated ? 'bg-amber-50 border border-dashed border-amber-400 animate-pulse' : ''}`}>
                                                                                         <div className={`flex flex-col items-center ${isSimulated ? 'text-amber-800' : 'text-slate-800'}`} title={doc?.name}>
                                                                                             <div className="text-[11px] font-normal leading-tight whitespace-nowrap">
                                                                                                 {doc?.name || '?'}
                                                                                             </div>
                                                                                             {suffix && (
                                                                                                 <div className="text-[9px] text-red-600 leading-none font-bold mt-0.5">
                                                                                                     {suffix}
                                                                                                 </div>
                                                                                             )}
                                                                                         </div>
                                                                                        {shift.workTime && (
                                                                                            <div className="text-[9px] text-slate-400 leading-tight font-medium">
                                                                                                 {shift.workTime.replace(/(\d{1,2}):\d{2}/g, (match, p1) => parseInt(p1) + '\'').replace(/\s/g, '')}
                                                                                            </div>
                                                                                        )}
                                                                                        {shift.task && (
                                                                                            <div className={`text-[9px] leading-tight font-bold ${shift.task.includes('晚班') ? 'text-red-500' : 'text-blue-500'}`}>
                                                                                                {shift.task}
                                                                                            </div>
                                                                                        )}
                                                                                        {index < displayShifts.length - 1 && !isSimulated && (
                                                                                            <div className="border-b border-slate-100 my-0.5 opacity-50"></div>
                                                                                        )}
                                                                                    </div>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    ) : (
                                                                         <div className="w-full h-10"></div>
                                                                    )}
                                                                </td>
                                                            );
                                                        })}
                                                    </tr>
                                                );
                                            });
                                        })()}
                                        </React.Fragment>
                                    );
                                })}


                            </tbody>
                        </table>
                     </div>
                )}
                
                {viewMode === 'daily' && (
                    <div className="flex flex-col gap-8 pb-10">
                        {(() => {
                            const stations = db.settings.doctorStations || [];
                            return LOCATIONS.map(loc => {
                                const rawLocStations = stations.filter(s => s.location === loc);
                                if (rawLocStations.length === 0) return null;

                                // Merge GI stations for Daily View cards
                                const locStations: DoctorStationConfig[] = [];
                                const seenGI = new Set<string>();
                                rawLocStations.forEach(s => {
                                    if (isGIStation(s.name)) {
                                        if (!seenGI.has(loc)) {
                                            locStations.push({ ...s, name: 'GI' });
                                            seenGI.add(loc);
                                        }
                                    } else {
                                        locStations.push(s);
                                    }
                                });

                                return (
                                    <div key={loc} className="space-y-4">
                                        <div className="flex items-center gap-4 border-b border-gray-200 pb-2">
                                            <h2 className={`font-bold text-base px-4 py-1 rounded-full text-white shadow-md ${LOCATION_COLORS[loc]?.split(' ')[0] || 'bg-gray-500'}`}>
                                                {loc}區
                                            </h2>
                                            {(() => {
                                                const stats = db.getDailyStats(toLocalISOString(currentDate));
                                                if (loc === '北投') {
                                                    return (
                                                        <div className="flex flex-wrap items-center gap-3">
                                                            <div className="flex items-center gap-1.5 bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200 shadow-sm">
                                                                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">北投客戶數</span>
                                                                <span className="text-base font-black text-slate-800">{stats?.beitou_clients || 0}</span>
                                                            </div>
                                                            <div className="flex items-center gap-1.5 bg-blue-50 px-3 py-1.5 rounded-full border border-blue-100 shadow-sm">
                                                                <span className="text-[11px] font-bold text-blue-500 uppercase tracking-wider">MR 數</span>
                                                                <span className="text-base font-black text-blue-700">{stats?.beitou_mr || 0}</span>
                                                            </div>
                                                            <div className="flex items-center gap-1.5 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100 shadow-sm">
                                                                <span className="text-[11px] font-bold text-emerald-500 uppercase tracking-wider">GI(北投)</span>
                                                                <span className="text-base font-black text-emerald-700">{stats?.beitou_gi || 0}</span>
                                                            </div>
                                                            <div className="flex items-center gap-1.5 bg-amber-50 px-3 py-1.5 rounded-full border border-amber-100 shadow-sm">
                                                                <span className="text-[11px] font-bold text-amber-600 uppercase tracking-wider">CTA 數</span>
                                                                <span className="text-base font-black text-amber-700">{stats?.beitou_cta || 0}</span>
                                                            </div>
                                                        </div>
                                                    );
                                                }
                                                if (loc === '大直') {
                                                    return (
                                                        <div className="flex flex-wrap items-center gap-3">
                                                            <div className="flex items-center gap-1.5 bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200 shadow-sm">
                                                                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">大直客戶數</span>
                                                                <span className="text-base font-black text-slate-800">{stats?.dazhi_clients || 0}</span>
                                                            </div>
                                                            <div className="flex items-center gap-1.5 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100 shadow-sm">
                                                                <span className="text-[11px] font-bold text-emerald-500 uppercase tracking-wider">GI(大直)</span>
                                                                <span className="text-base font-black text-emerald-700">{stats?.dazhi_gi || 0}</span>
                                                            </div>
                                                        </div>
                                                    );
                                                }
                                                return null;
                                            })()}
                                            <div className="flex-1 h-px bg-gray-100"></div>
                                        </div>

                                        {/* Main/Assistant (Rad + HM Staff) Row for this Location - Skip for Taichung */}
                                        {loc !== '台中' && (
                                            <div className="flex flex-col md:flex-row gap-4 mb-4">
                                                {(() => {
                                                    const dateStr = toLocalISOString(currentDate);
                                                    const radShifts = db.shifts.filter(s => s.date === dateStr);
                                                    const hmShifts = db.getHealthMgmtShifts().filter(s => s.date === dateStr);
                                                    const radUsers = db.getUsers();
                                                    const hmStaff = db.getHealthMgmtStaff();
                                                    
                                                    const locMainRadNames = radShifts.filter(s => {
                                                        const u = radUsers.find(user => user.id === s.userId);
                                                        const effectiveLoc = s.location || '北投';
                                                        return u?.isRadiographer && effectiveLoc === loc && (s.station?.includes('場控') || s.station === '主' || s.station === '主控');
                                                    }).map(s => radUsers.find(u => u.id === s.userId)?.name).filter(Boolean);
                                                    
                                                    const locMainHMNames = hmShifts.filter(s => {
                                                        const u = hmStaff.find(st => st.id === s.userId);
                                                        const effectiveLoc = s.location || u?.location || '北投';
                                                        return effectiveLoc === loc && (s.station === '主控' || s.task === '主控' || s.station?.includes('主控'));
                                                    }).map(s => hmStaff.find(u => u.id === s.userId)?.name).filter(Boolean);
                                                    
                                                    const locMainNamesJoined = [...locMainRadNames, ...locMainHMNames].join(' / ') || '-';
                                                    
                                                    const locAssistRadNames = radShifts.filter(s => {
                                                        const u = radUsers.find(user => user.id === s.userId);
                                                        const effectiveLoc = s.location || '北投';
                                                        return u?.isRadiographer && effectiveLoc === loc && (s.specialRoles?.includes('輔班') || s.station === '輔' || s.station === '輔控');
                                                    }).map(s => radUsers.find(u => u.id === s.userId)?.name).filter(Boolean);
                                                    
                                                    const locAssistHMNames = hmShifts.filter(s => {
                                                        const u = hmStaff.find(st => st.id === s.userId);
                                                        const effectiveLoc = s.location || u?.location || '北投';
                                                        return effectiveLoc === loc && (s.station === '輔控' || s.task === '輔控' || s.station?.includes('輔控'));
                                                    }).map(s => hmStaff.find(u => u.id === s.userId)?.name).filter(Boolean);
                                                    
                                                    const locAssistNamesJoined = [...locAssistRadNames, ...locAssistHMNames].join(' / ') || '-';

                                                    return (
                                                        <>
                                                            <div className="flex-1 flex items-center gap-3 bg-gradient-to-br from-white to-amber-50/50 border border-amber-200/60 rounded-xl p-3 shadow-sm">
                                                                <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center text-amber-500 shadow-sm ring-1 ring-amber-100">
                                                                    <Star size={18} className="fill-amber-400"/>
                                                                </div>
                                                                <div>
                                                                    <div className="text-[10px] font-bold text-amber-600/80 uppercase tracking-widest mb-0.5">主班 (場控)</div>
                                                                    <div className="text-[15px] font-black text-amber-900">{locMainNamesJoined}</div>
                                                                </div>
                                                            </div>
                                                            <div className="flex-1 flex items-center gap-3 bg-gradient-to-br from-white to-orange-50/50 border border-orange-200/60 rounded-xl p-3 shadow-sm">
                                                                <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center text-orange-500 shadow-sm ring-1 ring-orange-100">
                                                                    <Shield size={18} className="fill-orange-400"/>
                                                                </div>
                                                                <div>
                                                                    <div className="text-[10px] font-bold text-orange-600/80 uppercase tracking-widest mb-0.5">輔控</div>
                                                                    <div className="text-[15px] font-black text-orange-900">{locAssistNamesJoined}</div>
                                                                </div>
                                                            </div>
                                                        </>
                                                    );
                                                })()}
                                            </div>
                                        )}

                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
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
                                                 const assignedSt = s.scheduled_station || s.station || '';
                                                 
                                                 if (st === 'GI') return isGIStation(assignedSt);
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

                                            // Custom sort for GI station
                                            if (st === 'GI') {
                                                displayShifts.sort((a, b) => {
                                                    const getWeight = (stationStr: string) => {
                                                        const s = stationStr.toUpperCase();
                                                        if (s === 'GI1') return 1;
                                                        if (s === 'GI2') return 2;
                                                        if (s === 'GI') return 3;
                                                        return 4;
                                                    };
                                                    return getWeight(a.scheduled_station || a.station || '') - getWeight(b.scheduled_station || b.station || '');
                                                });
                                            }

                                                                                        // Get Requirement (sum up if GI)
                                             const dayOfWeek = currentDate.getDay();
                                             let req = 0;

                                             if (st === 'GI') {
                                                 // Find all original stations that count as GI for this location
                                                 const originalGIStations = rawLocStations.filter(s => isGIStation(s.name));
                                                 originalGIStations.forEach(orig => {
                                                     const reqKey = `${orig.name}_${orig.location}`;
                                                     const reqs = requirements[reqKey] || requirements[orig.name] || [0,0,0,0,0,0,0];
                                                     req += reqs[dayOfWeek] || 0;
                                                 });
                                             } else {
                                                 const reqKey = `${config.name}_${config.location}`;
                                                 const reqs = requirements[reqKey] || requirements[config.name] || [0,0,0,0,0,0,0];
                                                 req = reqs[dayOfWeek] || 0;
                                             }
                                            const isShort = displayShifts.length < req;

                                            const getStationTheme = (stationName: string) => {
                                                if (stationName.includes('解說')) return {
                                                    card: 'bg-gradient-to-br from-white to-indigo-50/70 border-indigo-200/80 hover:border-indigo-300 hover:shadow-indigo-100/50',
                                                    title: 'text-indigo-900',
                                                    border: 'border-indigo-100',
                                                    badgeNormal: 'bg-indigo-50 text-indigo-700 border-indigo-200',
                                                    avatarRing: 'ring-indigo-100',
                                                    avatarBg: 'bg-gradient-to-br from-indigo-50 to-indigo-100/50 text-indigo-700',
                                                    avatarEdge: 'bg-indigo-400/80',
                                                    emptyBorder: 'border-indigo-200/80 bg-indigo-50/30 hover:bg-indigo-50/50 hover:border-indigo-300 hover:text-indigo-700',
                                                    emptyIconBg: 'group-hover/empty:bg-indigo-50 group-hover/empty:border-indigo-200 group-hover/empty:shadow-indigo-100/50',
                                                    emptyIconText: 'group-hover/empty:text-indigo-500 text-indigo-300'
                                                };
                                                if (stationName.includes('影像') || stationName.match(/MR|CT/i)) return {
                                                    card: 'bg-gradient-to-br from-white to-blue-50/70 border-blue-200/80 hover:border-blue-300 hover:shadow-blue-100/50',
                                                    title: 'text-blue-900',
                                                    border: 'border-blue-100',
                                                    badgeNormal: 'bg-blue-50 text-blue-700 border-blue-200',
                                                    avatarRing: 'ring-blue-100',
                                                    avatarBg: 'bg-gradient-to-br from-blue-50 to-blue-100/50 text-blue-700',
                                                    avatarEdge: 'bg-blue-400/80',
                                                    emptyBorder: 'border-blue-200/80 bg-blue-50/30 hover:bg-blue-50/50 hover:border-blue-300 hover:text-blue-700',
                                                    emptyIconBg: 'group-hover/empty:bg-blue-50 group-hover/empty:border-blue-200 group-hover/empty:shadow-blue-100/50',
                                                    emptyIconText: 'group-hover/empty:text-blue-500 text-blue-300'
                                                };
                                                if (stationName.includes('遠')) return {
                                                    card: 'bg-gradient-to-br from-white to-rose-50/70 border-rose-200/80 hover:border-rose-300 hover:shadow-rose-100/50',
                                                    title: 'text-rose-900',
                                                    border: 'border-rose-100',
                                                    badgeNormal: 'bg-rose-50 text-rose-700 border-rose-200',
                                                    avatarRing: 'ring-rose-100',
                                                    avatarBg: 'bg-gradient-to-br from-rose-50 to-rose-100/50 text-rose-700',
                                                    avatarEdge: 'bg-rose-400/80',
                                                    emptyBorder: 'border-rose-200/80 bg-rose-50/30 hover:bg-rose-50/50 hover:border-rose-300 hover:text-rose-700',
                                                    emptyIconBg: 'group-hover/empty:bg-rose-50 group-hover/empty:border-rose-200 group-hover/empty:shadow-rose-100/50',
                                                    emptyIconText: 'group-hover/empty:text-rose-500 text-rose-300'
                                                };
                                                if (stationName.includes('GI') || stationName.includes('腸胃')) return {
                                                    card: 'bg-gradient-to-br from-white to-emerald-50/70 border-emerald-200/80 hover:border-emerald-300 hover:shadow-emerald-100/50',
                                                    title: 'text-emerald-900',
                                                    border: 'border-emerald-100',
                                                    badgeNormal: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                                                    avatarRing: 'ring-emerald-100',
                                                    avatarBg: 'bg-gradient-to-br from-emerald-50 to-emerald-100/50 text-emerald-700',
                                                    avatarEdge: 'bg-emerald-400/80',
                                                    emptyBorder: 'border-emerald-200/80 bg-emerald-50/30 hover:bg-emerald-50/50 hover:border-emerald-300 hover:text-emerald-700',
                                                    emptyIconBg: 'group-hover/empty:bg-emerald-50 group-hover/empty:border-emerald-200 group-hover/empty:shadow-emerald-100/50',
                                                    emptyIconText: 'group-hover/empty:text-emerald-500 text-emerald-300'
                                                };
                                                if (stationName.includes('婦科')) return {
                                                    card: 'bg-gradient-to-br from-white to-pink-50/70 border-pink-200/80 hover:border-pink-300 hover:shadow-pink-100/50',
                                                    title: 'text-pink-900',
                                                    border: 'border-pink-100',
                                                    badgeNormal: 'bg-pink-50 text-pink-700 border-pink-200',
                                                    avatarRing: 'ring-pink-100',
                                                    avatarBg: 'bg-gradient-to-br from-pink-50 to-pink-100/50 text-pink-700',
                                                    avatarEdge: 'bg-pink-400/80',
                                                    emptyBorder: 'border-pink-200/80 bg-pink-50/30 hover:bg-pink-50/50 hover:border-pink-300 hover:text-pink-700',
                                                    emptyIconBg: 'group-hover/empty:bg-pink-50 group-hover/empty:border-pink-200 group-hover/empty:shadow-pink-100/50',
                                                    emptyIconText: 'group-hover/empty:text-pink-500 text-pink-300'
                                                };
                                                return {
                                                    card: 'bg-gradient-to-br from-white to-slate-50/30 border-slate-200/60 hover:border-slate-300 hover:shadow-slate-100/50',
                                                    title: 'text-slate-800',
                                                    border: 'border-slate-100/80',
                                                    badgeNormal: 'bg-slate-50 text-slate-500 border-slate-200',
                                                    avatarRing: 'ring-teal-50',
                                                    avatarBg: 'bg-gradient-to-br from-teal-50 to-teal-100/50 text-teal-700',
                                                    avatarEdge: 'bg-teal-400/80',
                                                    emptyBorder: 'border-slate-200/80 bg-slate-50/30 hover:bg-teal-50/20 hover:border-teal-300/60 hover:text-teal-600',
                                                    emptyIconBg: 'group-hover/empty:bg-teal-50 group-hover/empty:border-teal-200 group-hover/empty:shadow-teal-100/50',
                                                    emptyIconText: 'group-hover/empty:text-teal-500 text-slate-300'
                                                };
                                            };
                                            const theme = getStationTheme(st);

                                            return (
                                                <div key={`${loc}-${st}`} className={`group rounded-2xl border p-4 shadow-sm flex flex-col h-full transition-all duration-300 ${isShort ? 'border-red-200 bg-red-50/10 hover:shadow-red-100/50' : `${theme.card} hover:shadow-md`}`}>
                                                    <div className={`flex justify-between items-center mb-4 pb-3 border-b ${theme.border}`}>
                                                        <h3 className={`font-extrabold flex items-center gap-2 text-[15px] tracking-wide ${theme.title}`}>
                                                            {st}
                                                            {isShort && <span className="flex h-2 w-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)] animate-pulse" title="人力不足"></span>}
                                                        </h3>
                                                        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)] border ${isShort ? 'bg-red-50 text-red-600 border-red-100' : theme.badgeNormal}`}>
                                                            {displayShifts.length} / {req} 人
                                                        </span>
                                                    </div>
                                                    
                                                    <div className="space-y-2.5 flex-1">
                                                        {displayShifts.length > 0 ? (
                                                            displayShifts.map(s => {
                                                                const doc = doctors.find(d => d.id === s.doctorId);
                                                                const isSimulated = simulatedShifts?.some(ss => ss.id === s.id);
                                                                return (
                                                                    <div key={s.id} className={`relative flex items-start gap-3 p-3 rounded-xl border transition-all duration-200 overflow-hidden ${isSimulated ? 'bg-amber-50/80 border-dashed border-amber-300 animate-[pulse_2s_ease-in-out_infinite]' : 'bg-white border-slate-100 shadow-[0_2px_4px_rgba(0,0,0,0.02)]'} ${canEdit ? `cursor-pointer hover:-translate-y-[2px] hover:shadow-lg ${theme.border.replace('border-', 'hover:border-')}` : 'cursor-not-allowed'}`} onClick={()=>canEdit && handleCellClick(s.doctorId, s.date)}>
                                                                        {/* Indicator bar on the left edge */}
                                                                        <div className={`absolute left-0 top-0 bottom-0 w-1 ${isSimulated ? 'bg-amber-400' : theme.avatarEdge}`}></div>
                                                                        <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-black text-[13px] shadow-sm ring-2 ring-offset-1 z-10 ${isSimulated ? 'bg-amber-100 text-amber-700 ring-amber-50' : `${theme.avatarBg} ${theme.avatarRing}`}`}>
                                                                            {doc?.alias}
                                                                        </div>
                                                                        <div className="flex-1 min-w-0 pt-0.5 z-10">
                                                                            <div className="flex justify-between items-start gap-2 mb-1">
                                                                                <div className={`font-bold truncate flex items-center gap-1.5 text-[14px] ${theme.title}`}>
                                                                                    {doc?.name}
                                                                                    {suffix && <span className="text-[9px] text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded-md border border-teal-100/50 tracking-wider font-bold whitespace-nowrap">{suffix}</span>}
                                                                                </div>
                                                                                {s.workTime && (
                                                                                    <div className="shrink-0 text-[10px] font-bold text-slate-500 bg-slate-50/80 px-1.5 py-0.5 rounded-lg flex items-center gap-1 shadow-[inset_0_1px_1px_rgba(0,0,0,0.02)] border border-slate-100/50">
                                                                                        <Clock size={10} className="text-slate-400"/> {s.workTime}
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                            <div className="flex flex-wrap gap-1.5">
                                                                                {s.task && <span className={`text-[10px] px-2 py-0.5 rounded-lg border font-bold tracking-wide ${s.task.includes('晚班') ? 'text-red-700 bg-red-50/80 border-red-100/50' : 'text-blue-700 bg-blue-50/80 border-blue-100/50'}`}>{s.task}</span>}
                                                                                {s.note && <span className="text-[10px] text-amber-700 bg-amber-50/80 px-1.5 py-0.5 rounded-lg border border-amber-100/50 font-bold break-words flex flex-wrap items-center gap-1 leading-tight w-full"><span className="text-amber-500 shrink-0">📝</span> <span>{s.note}</span></span>}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })
                                                        ) : (
                                                            <div 
                                                                onClick={() => canEdit && handleStationCellClick(st, loc, toLocalISOString(currentDate))}
                                                                className={`group/empty h-full min-h-[5.5rem] flex flex-col items-center justify-center text-[13px] border-2 border-dashed rounded-xl transition-all duration-300 font-bold ${canEdit ? `cursor-pointer ${theme.emptyBorder}` : 'border-slate-100 bg-slate-50/30 cursor-not-allowed text-slate-400'}`}
                                                            >
                                                                <div className={`w-8 h-8 rounded-full bg-white shadow-sm border border-slate-100 flex items-center justify-center mb-1.5 transition-all duration-300 ${canEdit ? theme.emptyIconBg : ''}`}>
                                                                    <Plus size={16} className={`transition-colors ${canEdit ? theme.emptyIconText : 'text-slate-200'}`}/>
                                                                </div>
                                                                <span className="opacity-70 tracking-widest">指派醫師</span>
                                                            </div>

                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        </div>
                                    </div>
                                );
                            });
                        })()}
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
                                                const text = generateBeitouCopyText(currentDate, shifts, doctors, staffShifts, users);
                                                navigator.clipboard.writeText(text);
                                            }}
                                            className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors"
                                        >
                                            <Check size={12} /> 複製
                                        </button>
                                    </div>
                                    <textarea
                                        readOnly
                                        className="w-full h-64 p-3 text-xs font-mono border border-gray-200 rounded-lg bg-slate-50 focus:ring-2 focus:ring-green-500 outline-none resize-none"
                                        value={generateBeitouCopyText(currentDate, shifts, doctors, staffShifts, users)}
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
                                            className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors"
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
                                            {(() => {
                                                const seen = new Set<string>();
                                                return stations.filter(st => {
                                                    const key = `${isGIStation(st.name) ? 'GI' : st.name}-${st.location}`;
                                                    if (seen.has(key)) return false;
                                                    seen.add(key);
                                                    return true;
                                                }).map(st => {
                                                    const displayStationName = isGIStation(st.name) ? 'GI' : st.name;
                                                    return (
                                                        <th key={`head-${displayStationName}-${st.location}`} className="px-2 py-2 text-center min-w-[60px] border-r border-gray-100">
                                                            <div className="flex flex-col items-center">
                                                                <span>{displayStationName}</span>
                                                                <span className={`text-[9px] px-1.5 rounded-full mt-0.5 text-white ${LOCATION_COLORS[st.location]?.split(' ')[0] || 'bg-gray-400'}`}>
                                                                    {st.location}
                                                                </span>
                                                            </div>
                                                        </th>
                                                    );
                                                });
                                            })()}
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
                                                    {(() => {
                                                        const seen = new Set<string>();
                                                        return stations.filter(st => {
                                                            const key = `${isGIStation(st.name) ? 'GI' : st.name}-${st.location}`;
                                                            if (seen.has(key)) return false;
                                                            seen.add(key);
                                                            return true;
                                                        }).map(st => {
                                                            const displayStationName = isGIStation(st.name) ? 'GI' : st.name;
                                                            // Calculate count (sum up if GI)
                                                            let count = shifts.filter(s => {
                                                                if (s.date !== date || s.location !== st.location || !s.doctorId) return false;
                                                                
                                                                const sStation = s.scheduled_station || s.station || '';
                                                                if (displayStationName === 'GI') {
                                                                    if (isGIStation(sStation)) return true;
                                                                } else if (sStation === displayStationName) {
                                                                    return true;
                                                                }
                                                                
                                                                // Special: For Gyn station, include Explanation doctors with Gyn capability
                                                                if (displayStationName === '婦科' && sStation === '解說') {
                                                                    const doc = doctors.find(d => d.id === s.doctorId);
                                                                    return doc?.capabilities?.includes('婦科');
                                                                }
                                                                
                                                                return false;
                                                            }).length;

                                                            // Calculate requirement (sum up if GI)
                                                            let req = 0;
                                                            if (displayStationName === 'GI') {
                                                                stations.filter(os => os.location === st.location && isGIStation(os.name)).forEach(os => {
                                                                    const reqKey = `${os.name}_${os.location}`;
                                                                    const reqs = requirements[reqKey] || requirements[os.name] || [0,0,0,0,0,0,0];
                                                                    req += reqs[dayOfWeek] || 0;
                                                                });
                                                            } else {
                                                                const reqKey = `${st.name}_${st.location}`;
                                                                const reqs = requirements[reqKey] || requirements[st.name] || [0,0,0,0,0,0,0];
                                                                req = reqs[dayOfWeek] || 0;
                                                            }

                                                            const isLow = count < req;
                                                            
                                                            return (
                                                                <td key={`${date}-${displayStationName}-${st.location}`} className={`px-2 py-2 text-center border-r border-gray-50 font-mono font-bold ${isLow ? 'bg-red-50' : ''}`}>
                                                                    <span className={isLow ? 'text-red-600' : 'text-teal-600'}>{count}</span>
                                                                    <span className="text-gray-300 mx-0.5 text-[10px]">/</span>
                                                                    <span className="text-gray-400 text-[10px]">{req}</span>
                                                                </td>
                                                            );
                                                        });
                                                    })()}
                                                </tr>
                                             );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* 2. Doctor Workload Analysis */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                            <h3 className="text-base font-bold bg-slate-50 px-4 py-3 border-b border-gray-100 flex items-center gap-2 text-slate-700">
                                <Briefcase size={18} className="text-indigo-600"/> 醫師排班統計 (班數)
                            </h3>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                                        <tr>
                                            <th className="px-3 py-3 text-left sticky left-0 bg-slate-50 z-10 border-r border-slate-200 shadow-[2px_0_5px_rgba(0,0,0,0.05)] w-32">醫師姓名</th>
                                            <th className="px-2 py-3 text-center bg-teal-50 text-teal-700 border-r border-teal-100 font-extrabold w-16">週期</th>
                                            <th className="px-2 py-3 text-center bg-indigo-50 text-indigo-700 border-r border-indigo-100 font-extrabold w-16">總計</th>
                                            {(() => {
                                                const seen = new Set<string>();
                                                return stations.filter(st => {
                                                    const key = `${isGIStation(st.name) ? 'GI' : st.name}-${st.location}`;
                                                    if (seen.has(key)) return false;
                                                    seen.add(key);
                                                    return true;
                                                }).map(st => {
                                                    const displayStationName = isGIStation(st.name) ? 'GI' : st.name;
                                                    return (
                                                        <th key={`doc-head-${displayStationName}-${st.location}`} className="px-2 py-3 text-center min-w-[60px] border-r border-gray-100 font-normal">
                                                            <div className="flex flex-col items-center opacity-80">
                                                                <span className="font-bold">{displayStationName}</span>
                                                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full mt-0.5 text-white ${LOCATION_COLORS[st.location]?.split(' ')[0] || 'bg-gray-400'}`}>
                                                                    {st.location}
                                                                </span>
                                                            </div>
                                                        </th>
                                                    );
                                                });
                                            })()}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {doctors.map(doc => {
                                            const monthKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
                                            const savedCycle = doc.personalCycles?.[monthKey];
                                            
                                            // Fallback to current calendar month if no personal cycle
                                            let currentCycleRange = dateRange;
                                            const holidays = db.getHolidays();
                                            
                                            // Helper to check if a station label represents actual work (Synced with Stats page)
                                            const isActualWork = (station?: string) => {
                                                if (!station) return false;
                                                const sNormalized = station.trim().toUpperCase();
                                                if (sNormalized === '' || sNormalized === '未分配' || sNormalized === 'UNASSIGNED') return false;
                                                if (sNormalized === '休假' || sNormalized.startsWith('休')) return false;
                                                if (sNormalized === 'X' || sNormalized === 'SYSTEMOFF') return false;
                                                return true;
                                            };

                                            if (savedCycle) {
                                                const start = savedCycle.startDate;
                                                const end = savedCycle.endDate;
                                                // Generate all dates in the cycle for consistent filtering
                                                const tempRange = [];
                                                const [sY, sM, sD] = start.split('-').map(Number);
                                                const [eY, eM, eD] = end.split('-').map(Number);
                                                const startDate = new Date(sY, sM - 1, sD);
                                                const endDate = new Date(eY, eM - 1, eD);
                                                
                                                for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
                                                    // Standardize formatting
                                                    tempRange.push(toLocalISOString(d));
                                                }
                                                currentCycleRange = tempRange;
                                            }

                                            const docShifts = shifts.filter(s => s.doctorId === doc.id && currentCycleRange.includes(s.date));
                                            // Only count shifts that match displayed stations AND count as actual work
                                            // Calculate total by summing up the logic used for individual columns
                                            let total = 0;
                                            const seenTotal = new Set<string>();
                                            stations.filter(st => {
                                                const key = `${isGIStation(st.name) ? 'GI' : st.name}-${st.location}`;
                                                if (seenTotal.has(key)) return false;
                                                seenTotal.add(key);
                                                return true;
                                            }).forEach(st => {
                                                const displayStationName = isGIStation(st.name) ? 'GI' : st.name;
                                                const count = docShifts.filter(s => {
                                                    const sStation = s.scheduled_station || s.station || '';
                                                    if (displayStationName === 'GI') {
                                                        return isGIStation(sStation) && s.location === st.location;
                                                    }
                                                    return sStation === displayStationName && s.location === st.location;
                                                }).length;
                                                total += count;
                                            });
                                            
                                            // Skip doctors with 0 shifts if list is too long? No, show all.
                                            
                                            return (
                                                <tr key={doc.id} className="hover:bg-slate-50 transition-colors">
                                                    <td className="px-3 py-3 text-left sticky left-0 bg-white z-10 border-r border-slate-100 font-bold text-slate-700 shadow-[2px_0_5px_rgba(0,0,0,0.05)] text-base">
                                                        <div className="flex flex-col">
                                                            <span>{doc.name}</span>
                                                            {savedCycle?.memo && <span className="text-xs text-amber-600 font-normal leading-tight mt-0.5">{savedCycle.memo}</span>}
                                                        </div>
                                                    </td>
                                                    <td className="px-2 py-3 text-center bg-teal-50/20 text-teal-700 text-xs border-r border-teal-50 whitespace-nowrap">
                                                        {savedCycle ? `${savedCycle.startDate.slice(5)}~${savedCycle.endDate.slice(5)}` : '全月'}
                                                    </td>
                                                    <td className="px-2 py-3 text-center bg-indigo-50/30 text-indigo-700 font-bold border-r border-indigo-50 text-base">
                                                        {total}
                                                    </td>
                                                    {(() => {
                                                        const seen = new Set<string>();
                                                        return stations.filter(st => {
                                                            const key = `${isGIStation(st.name) ? 'GI' : st.name}-${st.location}`;
                                                            if (seen.has(key)) return false;
                                                            seen.add(key);
                                                            return true;
                                                        }).map(st => {
                                                            const displayStationName = isGIStation(st.name) ? 'GI' : st.name;
                                                            const count = docShifts.filter(s => {
                                                                const sStation = s.scheduled_station || s.station || '';
                                                                if (displayStationName === 'GI') {
                                                                    return isGIStation(sStation) && s.location === st.location;
                                                                }
                                                                return sStation === displayStationName && s.location === st.location;
                                                            }).length;
                                                            
                                                            return (
                                                                <td key={`${doc.id}-${displayStationName}-${st.location}`} className={`px-2 py-3 text-center border-r border-gray-50 text-base ${count > 0 ? 'font-bold text-slate-700 bg-slate-50/50' : 'text-gray-300'}`}>
                                                                    {count > 0 ? count : '-'}
                                                                </td>
                                                            );
                                                        });
                                                    })()}
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
                <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm border border-gray-100 animate-in zoom-in-95 duration-200 overflow-hidden flex flex-col max-h-[95vh] sm:max-h-[90vh]">
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
                        
                        <div className="p-5 space-y-4 flex-1 overflow-y-auto">
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
                                        .sort((a, b) => {
                                            const idxA = ASSIGNMENT_STATION_ORDER.indexOf(a);
                                            const idxB = ASSIGNMENT_STATION_ORDER.indexOf(b);
                                            if (idxA === -1 && idxB === -1) return a.localeCompare(b, 'zh-Hant');
                                            if (idxA === -1) return 1;
                                            if (idxB === -1) return -1;
                                            return idxA - idxB;
                                        })
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
                                    {['晚班', '電台', '行政', '子抹','董事會'].map(taskName => (
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
                            {(() => {
                                const dayOfWeek = new Date(assignModal.date).getDay();
                                const skilledDocs = doctors.filter(d => {
                                    if (assignModal.station === '晚班' && d.isPartTime) return false;
                                    return d.capabilities?.includes(assignModal.station);
                                });

                                const scheduledSkilled: { doc: Doctor, stationName: string, isUnavailable: boolean, offReason?: string }[] = [];
                                const unscheduledSkilled: { doc: Doctor, isUnavailable: boolean, offReason?: string }[] = [];

                                skilledDocs.forEach(d => {
                                    const s = activeShifts.find(shift => shift.doctorId === d.id && shift.date === assignModal.date);
                                    const assignedSt = s?.scheduled_station || s?.station;
                                    const isWorking = assignedSt && !['X', 'OFF', '休假', 'Unassigned', '未分配'].includes(assignedSt);
                                    
                                    const isExcluded = assignedSt === 'X';
                                    const isPermanentlyOff = d.excludedDays?.includes(dayOfWeek);
                                    const isUnavailable = isExcluded || isPermanentlyOff;
                                    const offReason = isExcluded ? '當天禁排' : (isPermanentlyOff ? '固定不報到' : undefined);

                                    if (isWorking) {
                                        scheduledSkilled.push({ doc: d, stationName: assignedSt, isUnavailable, offReason });
                                    } else {
                                        unscheduledSkilled.push({ doc: d, isUnavailable, offReason });
                                    }
                                });

                                // Sort Unscheduled: Available first, then Unavailable
                                unscheduledSkilled.sort((a, b) => (a.isUnavailable === b.isUnavailable ? 0 : a.isUnavailable ? 1 : -1));

                                const otherDocs = doctors.filter(d => {
                                    if (assignModal.station === '晚班' && d.isPartTime) return false;
                                    return !d.capabilities?.includes(assignModal.station);
                                });

                                return (
                                    <>
                                        {/* 1. Unscheduled Skilled (Priority) */}
                                        {unscheduledSkilled.length > 0 && (
                                            <div className="mb-4">
                                                <div className="text-[11px] font-black text-emerald-600 uppercase px-3 py-1 bg-emerald-50 rounded-md mb-2 mx-1 tracking-wider flex items-center gap-1">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                                    可指派 (具備技能)
                                                </div>
                                                <div className="grid grid-cols-2 gap-2 p-1">
                                                    {unscheduledSkilled.map(({ doc, isUnavailable, offReason }) => (
                                                        <button 
                                                            key={doc.id}
                                                            onClick={() => handleAssignDoctor(doc.id)}
                                                            className={`flex items-center gap-2 p-2 rounded-lg border transition-all text-left group ${
                                                                isUnavailable 
                                                                    ? 'bg-gray-50 border-gray-100 opacity-40 grayscale pointer-events-none' 
                                                                    : 'bg-white border-emerald-100 hover:border-emerald-400 hover:shadow-md hover:bg-emerald-50/30'
                                                            }`}
                                                        >
                                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0 ${isUnavailable ? 'bg-gray-400' : 'bg-emerald-500 group-hover:scale-110'}`}>
                                                                {doc.alias}
                                                            </div>
                                                            <div className="min-w-0">
                                                                <div className={`font-bold text-sm truncate ${isUnavailable ? 'text-gray-400' : 'text-gray-700'}`}>{doc.name}</div>
                                                                <div className={`text-[10px] font-medium ${isUnavailable ? 'text-gray-400' : 'text-emerald-500'}`}>
                                                                    {offReason || '空閒中'}
                                                                </div>
                                                            </div>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* 2. Scheduled Skilled (Need Swap/Reassign) */}
                                        {scheduledSkilled.length > 0 && (
                                            <div className="mb-4">
                                                <div className="text-[11px] font-black text-orange-600 uppercase px-3 py-1 bg-orange-50 rounded-md mb-2 mx-1 tracking-wider">
                                                    已排班 (具備技能)
                                                </div>
                                                <div className="grid grid-cols-2 gap-2 p-1">
                                                    {scheduledSkilled.map(({ doc, stationName, isUnavailable, offReason }) => (
                                                        <button 
                                                            key={doc.id}
                                                            onClick={() => handleAssignDoctor(doc.id)}
                                                            className={`flex items-center gap-2 p-2 rounded-lg border transition-all text-left ${
                                                                isUnavailable 
                                                                    ? 'bg-gray-50 border-gray-100 opacity-40 grayscale pointer-events-none' 
                                                                    : 'border-orange-100 bg-orange-50/20 hover:border-orange-400 hover:bg-orange-50/40'
                                                            }`}
                                                        >
                                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0 ${isUnavailable ? 'bg-gray-400' : 'bg-orange-400'}`}>
                                                                {doc.alias}
                                                            </div>
                                                            <div className="min-w-0">
                                                                <div className={`font-bold text-sm truncate ${isUnavailable ? 'text-gray-400' : 'text-gray-700'}`}>{doc.name}</div>
                                                                <div className={`text-[10px] font-bold whitespace-nowrap overflow-hidden text-ellipsis ${isUnavailable ? 'text-gray-400' : 'text-orange-500'}`}>
                                                                    {offReason ? offReason : `已排在: ${stationName}`}
                                                                </div>
                                                            </div>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* 3. Others (Fallback) */}
                                        {otherDocs.length > 0 && (
                                            <div>
                                                <div className="text-[11px] font-bold text-gray-400 uppercase px-3 py-1 rounded-md mb-2 mx-1 tracking-wider">
                                                    其他醫師
                                                </div>
                                                <div className="grid grid-cols-2 gap-2 p-1">
                                                    {otherDocs.map(doc => {
                                                        const s = activeShifts.find(shift => shift.doctorId === doc.id && shift.date === assignModal.date);
                                                        const assignedSt = s?.scheduled_station || s?.station;
                                                        const isWorking = assignedSt && !['X', 'OFF', '休假', 'Unassigned', '未分配'].includes(assignedSt);
                                                        
                                                        const isExcluded = assignedSt === 'X';
                                                        const isPermanentlyOff = doc.excludedDays?.includes(dayOfWeek);
                                                        const isUnavailable = isExcluded || isPermanentlyOff;
                                                        const offReason = isExcluded ? '當天禁排' : (isPermanentlyOff ? '固定不報到' : undefined);

                                                        return (
                                                            <button 
                                                                key={doc.id}
                                                                onClick={() => handleAssignDoctor(doc.id)}
                                                                className={`flex items-center gap-2 p-2 rounded-lg border transition-all text-left ${
                                                                    isUnavailable 
                                                                        ? 'bg-gray-50 border-gray-100 opacity-40 grayscale pointer-events-none' 
                                                                        : isWorking ? 'bg-gray-50 border-gray-100 opacity-60' : 'bg-white border-gray-100 hover:border-gray-300'
                                                                }`}
                                                            >
                                                                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0 bg-gray-300">
                                                                    {doc.alias}
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <div className="font-bold text-gray-400 text-sm truncate">{doc.name}</div>
                                                                    <div className="text-[10px] text-gray-400 truncate">
                                                                        {offReason || (isWorking ? `已排: ${assignedSt}` : '')}
                                                                    </div>
                                                                </div>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </>
                                );
                            })()}
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
                                                            <span className="text-[10px] text-indigo-600 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded-lg font-medium">
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
                                            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 disabled:opacity-30 disabled:hover:bg-transparent"
                                         >
                                             <ChevronLeft size={16} className="rotate-90"/>
                                         </button>
                                         <button 
                                            onClick={() => moveSpecialty(idx, 'down')}
                                            disabled={idx === tempSpecialties.length - 1}
                                            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 disabled:opacity-30 disabled:hover:bg-transparent"
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
                <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[100] flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-gray-100 animate-in zoom-in-95 duration-200 flex flex-col max-h-[95vh] overflow-hidden">
                        <div className="bg-purple-600 px-6 py-4 flex justify-between items-center">
                            <h3 className="text-white font-bold flex items-center gap-2">
                                <FileText size={20} />
                                醫師排班備忘 ({memoModal.date.split('-').slice(1).join('/')})
                            </h3>
                            <button onClick={() => setMemoModal(null)} className="text-white/80 hover:text-white transition-colors p-1 hover:bg-white/10 rounded-full">
                                <X size={20} />
                            </button>
                        </div>
                        
                        <div className="p-6 flex-1 overflow-y-auto">
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

            {/* Doctor Visibility Filter Modal */}
            {isFilterModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 flex flex-col max-h-[90vh] overflow-hidden">
                        {/* Header */}
                        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10">
                            <div className="flex items-center gap-2">
                                <div className="p-2 bg-amber-50 rounded-lg">
                                    <Filter size={20} className="text-amber-600" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-800">醫師顯示過濾器</h3>
                                    <p className="text-xs text-slate-400">勾選要在畫面上顯示的醫師</p>
                                </div>
                            </div>
                            <button onClick={() => setIsFilterModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl transition-all">
                                <X size={20} />
                            </button>
                        </div>

                        {/* Search & Bulk Actions */}
                        <div className="p-4 bg-slate-50 border-b border-slate-100 gap-3 flex flex-col">
                            <div className="relative">
                                <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input 
                                    type="text" 
                                    placeholder="搜尋醫師姓名..."
                                    className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                                    value={doctorSearchQuery}
                                    onChange={(e) => setDoctorSearchQuery(e.target.value)}
                                />
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <button 
                                    onClick={() => setHiddenDoctorIds([])}
                                    className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all"
                                >
                                    顯示全部
                                </button>
                                <button 
                                    onClick={() => {
                                        const currentShifts = isSimulationMode ? (simulatedShifts || []) : activeShifts;
                                        const hasShiftIds = new Set(currentShifts.filter(s => 
                                            dateRange.includes(s.date) && 
                                            s.scheduled_station && 
                                            s.scheduled_station !== 'OFF' &&
                                            s.scheduled_station !== 'X' &&
                                            s.scheduled_station !== ''
                                        ).map(s => s.doctorId));
                                        
                                        const idsToHide = doctors.map(d => d.id).filter(id => !hasShiftIds.has(id));
                                        setHiddenDoctorIds(idsToHide);
                                    }}
                                    className="px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-xs font-bold text-amber-700 hover:bg-amber-100 transition-all"
                                >
                                    僅顯示有班醫師
                                </button>
                                <button 
                                    onClick={() => setHiddenDoctorIds(doctors.map(d => d.id))}
                                    className="px-3 py-1.5 bg-slate-200 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-300 transition-all"
                                >
                                    全部隱藏
                                </button>
                            </div>
                        </div>

                        {/* List */}
                        <div className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-slate-200">
                            <div className="grid grid-cols-1 gap-1">
                                {doctors.filter(d => 
                                    d.name.includes(doctorSearchQuery) || 
                                    (d.alias || '').includes(doctorSearchQuery)
                                ).map(doc => {
                                    const isVisible = !hiddenDoctorIds.includes(doc.id);
                                    return (
                                        <label 
                                            key={doc.id} 
                                            className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all ${
                                                isVisible ? 'bg-teal-50/50 hover:bg-teal-50 border border-teal-100' : 'bg-white hover:bg-slate-50 border border-transparent'
                                            }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${isVisible ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-400'}`}>
                                                    {doc.alias || doc.name.charAt(0)}
                                                </div>
                                                <div>
                                                    <div className={`font-bold text-sm ${isVisible ? 'text-teal-900' : 'text-slate-500'}`}>{doc.name}</div>
                                                    <div className="text-[10px] text-slate-400">{doc.specialty}</div>
                                                </div>
                                            </div>
                                            <input 
                                                type="checkbox" 
                                                className="w-5 h-5 rounded-lg border-slate-300 text-teal-600 focus:ring-teal-500"
                                                checked={isVisible}
                                                onChange={() => {
                                                    if (isVisible) {
                                                        setHiddenDoctorIds([...hiddenDoctorIds, doc.id]);
                                                    } else {
                                                        setHiddenDoctorIds(hiddenDoctorIds.filter(id => id !== doc.id));
                                                    }
                                                }}
                                            />
                                        </label>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
                            <button 
                                onClick={() => setIsFilterModalOpen(false)}
                                className="px-6 py-2 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-900 transition-all shadow-lg shadow-slate-200"
                            >
                                完成
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PhysicianSchedulePage;
