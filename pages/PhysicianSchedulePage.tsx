import React, { useState, useMemo, useEffect } from 'react';
import { db } from '../services/store';
import { Doctor, UserRole, DoctorStationConfig, DateEventType } from '../types';
import { ChevronLeft, ChevronRight, Download, User, X, Clock, FileText, MapPin, Plus, Briefcase, Wand2, BarChart2 } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import ConfirmModal from '../components/ConfirmModal';

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

const LOCATIONS = ['北投', '大直', '台中'];

const LOCATION_COLORS: Record<string, string> = {
    '北投': 'bg-blue-500 border-blue-600',
    '大直': 'bg-[#A1887F] border-[#8D6E63]', // Light Brown (Material Brown 300/400 range)
    '台中': 'bg-orange-500 border-orange-600'
};

const PhysicianSchedulePage: React.FC<PhysicianSchedulePageProps> = ({ currentUser }) => {
    const [currentDate, setCurrentDate] = useState(new Date());
    
    // Permission Check
    const canEdit = currentUser.role === UserRole.SYSTEM_ADMIN || currentUser.role === UserRole.SUPERVISOR || currentUser.role === UserRole.SCHEDULER;
    
    const [doctors, setDoctors] = useState<Doctor[]>(db.getDoctors());
    const [shifts, setShifts] = useState(db.getDoctorShifts());
    const [stations, setStations] = useState<DoctorStationConfig[]>(() => {
        const stored = db.settings.doctorStations;
        if (!stored) return [
             { name: '影像', location: '北投' }, { name: '遠距', location: '北投' },
             { name: '支援', location: '大直' },
             { name: '眼科', location: '台中' }, { name: '耳鼻喉科', location: '台中' }, { name: '婦科', location: '台中' }
        ];
        // Migration check
        if (typeof stored[0] === 'string') {
            return (stored as any[]).map(s => ({
                name: s,
                location: s.includes('大直') ? '大直' : s.includes('台中') ? '台中' : '北投'
            }));
        }
        return stored as DoctorStationConfig[];
    });
    
    // Edit Modal State
    const [selectedCell, setSelectedCell] = useState<{ doctorId: string, date: string } | null>(null);
    const [editData, setEditData] = useState<{ station: string, workTime: string, note: string, location: string, task: string }>({ station: '', workTime: '', note: '', location: '', task: '' });
    const [viewMode, setViewMode] = useState<'personnel' | 'station' | 'daily' | 'statistics'>('personnel');
    const [isQuickExcludeMode, setIsQuickExcludeMode] = useState(false);
    const [requirements, setRequirements] = useState(db.getStationRequirements());

    const dateRange = useMemo(() => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        
        const dates = [];
        for (let i = 1; i <= daysInMonth; i++) {
            const d = new Date(year, month, i);
            dates.push(toLocalISOString(d));
        }
        return dates;
    }, [currentDate]); // Recalculate only when month changes

    // Assign Doctor Modal State (for Station View)
    const [assignModal, setAssignModal] = useState<{ station: string, location: string, date: string } | null>(null);
    const [showAutoScheduleConfirm, setShowAutoScheduleConfirm] = useState(false);
    const [isAutoScheduling, setIsAutoScheduling] = useState(false);
    
    // Target Days Modal State
    const [showTargetDaysModal, setShowTargetDaysModal] = useState(false);
    const [targetDays, setTargetDays] = useState<Record<string, number>>({});
    const [batchDays, setBatchDays] = useState<number>(20); // Default batch value

    // Subscribe to database changes
    useEffect(() => {
        const handleDataChange = () => {
            setDoctors(db.getDoctors());
            setShifts(db.getDoctorShifts());
        };

        const unsubscribe = db.subscribe(handleDataChange);
        return () => unsubscribe();
    }, []);

    const handleStationCellClick = (station: string, location: string, date: string) => {
        if (currentUser.role !== UserRole.SYSTEM_ADMIN && currentUser.role !== UserRole.SUPERVISOR && currentUser.role !== UserRole.SCHEDULER) return;
        setAssignModal({ station, location, date });
    };

    const handleAssignDoctor = async (doctorId: string) => {
        if (!assignModal) return;
        // Check if doctor already has a shift
        const existingShift = shifts.find(s => s.doctorId === doctorId && s.date === assignModal.date);
        
        // If already assigned to THIS station (in Schedule), confirm
        // Use scheduled_station
        if (existingShift && confirm(`${doctors.find(d=>d.id===doctorId)?.name} 當天已有排班 (${existingShift.scheduled_station || '未分配'})。要改派至 ${assignModal.station} (${assignModal.location}) 嗎？`)) {
             await db.assignDoctorSchedule(doctorId, assignModal.date, assignModal.station, undefined, undefined, assignModal.location);
        } else if (!existingShift) {
             await db.assignDoctorSchedule(doctorId, assignModal.date, assignModal.station, undefined, undefined, assignModal.location);
        }
        setAssignModal(null);
    };

    const handleCellClick = async (doctorId: string, date: string) => {
        if (currentUser.role !== UserRole.SYSTEM_ADMIN && currentUser.role !== UserRole.SUPERVISOR && currentUser.role !== UserRole.SCHEDULER) return;
        
        const shift = shifts.find(s => s.doctorId === doctorId && s.date === date);

        if (isQuickExcludeMode) {
             if (shift && shift.scheduled_station === 'X') {
                 // Toggle OFF (Remove X from Schedule) - Set to empty or delete row?
                 // assignDoctorSchedule with empty string clears it? Need to check store logic. 
                 // Store upserts. If empty string is passed, it updates.
                 // Ideally remove shift if no other data? assignDoctorSchedule updates `scheduled_station`. 
                 // If we want to "Remove", maybe set to 'Unassigned' or empty?
                 // Let's set to '' for now.
                 await db.assignDoctorSchedule(doctorId, date, '');
             } else {
                 // Toggle ON (Set X)
                 await db.assignDoctorSchedule(doctorId, date, 'X'); 
             }
             setShifts([...db.getDoctorShifts()]);
             return; 
        }

        setSelectedCell({ doctorId, date });
        if (shift) {
            // Read scheduled_station
            setEditData({ 
                station: shift.scheduled_station || '', 
                workTime: shift.workTime || '', 
                note: shift.note || '', 
                location: shift.location || '', 
                task: shift.task || '' 
            });
        } else {
             setEditData({ station: '', workTime: '', note: '', location: '', task: '' });
        }
    };

    const handleSave = async () => {
        if (!selectedCell) return;
        await db.assignDoctorSchedule(selectedCell.doctorId, selectedCell.date, editData.station, editData.workTime, editData.note, editData.location, editData.task);
        setShifts(db.getDoctorShifts());
        setSelectedCell(null);
    };

    const handleDelete = async () => {
         if (!selectedCell) return;
         // Delete from Schedule = Set scheduled_station to empty/null?
         // Or remove row if station is also empty?
         // For separation, we should just clear `scheduled_station`.
         // db.assignDoctorSchedule handle update.
        await db.assignDoctorSchedule(selectedCell.doctorId, selectedCell.date, '');
        setShifts(db.getDoctorShifts());
        setSelectedCell(null);
    };

     const handleExportPDF = async (e?: React.MouseEvent) => {
        if (e) e.preventDefault();
        
        try {
            const doc = new jsPDF('l', 'mm', 'a4');
            let fontName = 'helvetica'; // Default fallback

            // Load Open Huninn font for Chinese support
            try {
                // Try simpler path first for local/Vercel
                const pathsToTry = [
                    '/fonts/jf-openhuninn-2.1.ttf',
                    '/schedule/fonts/jf-openhuninn-2.1.ttf',
                    `${window.location.origin}/fonts/jf-openhuninn-2.1.ttf`,
                    './fonts/jf-openhuninn-2.1.ttf'
                ];

                let response: Response | null = null;
                const isValidFontResponse = (res: Response) => {
                    const type = res.headers.get('content-type');
                    return res.ok && (!type || !type.includes('text/html'));
                };

                for (const path of pathsToTry) {
                    try {
                        const res = await fetch(path);
                        if (isValidFontResponse(res)) {
                            response = res;
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
                        };
                        reader.onerror = reject;
                        reader.readAsDataURL(blob);
                    });
                } else {
                     console.warn('無法載入中文字體檔案，將使用備用字體');
                }
            } catch (error) {
                console.warn('Font loading failed, using fallback font:', error);
                // Continue with fallback font instead of blocking export
            }

            const title = '影像醫學部-醫師排班表';
            const subtitle = `${dateRange[0]} ~ ${dateRange[dateRange.length - 1]}`;
            const exportDate = `匯出日期: ${new Date().toLocaleDateString('zh-TW')}`;

            doc.setFontSize(14);
            // Ensure font is set for title
            doc.setFont(fontName); 
            doc.text(`${title}  ${subtitle}`, 2, 5);

            doc.setFontSize(9);
            const pageWidth = doc.internal.pageSize.width;
            doc.text(exportDate, pageWidth - 2, 5, { align: 'right' });

            const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
            
            // Prepare Headers
            const dateHeaders = dateRange.map(date => {
                const d = new Date(date);
                return `${d.getDate()} \n${weekDays[d.getDay()]}`;
            });

            let headRow = [];
            let bodyRows: any[] = [];

            if (viewMode === 'station') {
                // ... same logic ...
                // Station View Headers
                headRow = [['崗位', ...dateHeaders]];
                
                LOCATIONS.forEach(loc => {
                    const locStations = stations.filter(s => s.location === loc);
                    if (locStations.length === 0) return;
                    
                    locStations.forEach(st => {
                         const rowData: any[] = [{ content: `${st.name}`, styles: { fontStyle: 'bold' }, location: st.location }];
                         
                         dateRange.forEach(date => {
                             const assignedShifts = shifts.filter(s => 
                                 s.date === date && 
                                 s.scheduled_station === st.name && 
                                 s.location === st.location
                             );
                             
                             // Format: Name + Time + Task
                             const formatTimeShort = (time: string) => {
                                 if (!time) return '';
                                 return time.replace(/(\d{1,2}):\d{2}/g, (match, p1) => parseInt(p1) + '\'').replace(/\s/g, '');
                             };
                             
                             // Build content string for height calculation
                             const docInfos = assignedShifts.map(s => {
                                 const doc = doctors.find(d => d.id === s.doctorId);
                                 const name = doc?.alias || doc?.name || '?';
                                 let info = name;
                                 if (s.workTime) info += `\n${formatTimeShort(s.workTime)}`;
                                 if (s.task) info += `\n${s.task}`;
                                 return info;
                             }).join('\n\n');
                             
                             // Pass raw data for custom rendering
                             rowData.push({
                                 content: docInfos,
                                 rawStationShifts: assignedShifts.map(s => {
                                     const doc = doctors.find(d => d.id === s.doctorId);
                                     return {
                                         name: doc?.alias || doc?.name || '?',
                                         time: formatTimeShort(s.workTime),
                                         task: s.task
                                     };
                                 })
                             });
                         });
                         bodyRows.push(rowData);
                    });
                });

            } else {
                // ... same logic ...
                // Personnel View Headers
                headRow = [['醫師', ...dateHeaders]];
                
                // Sort doctors: Specialty -> Name
                const sortedDoctors = [...doctors].sort((a, b) => {
                    const specA = a.specialty || 'Z_Other';
                    const specB = b.specialty || 'Z_Other';
                    if (specA !== specB) return specA.localeCompare(specB, 'zh-TW');
                    return a.name.localeCompare(b.name, 'zh-TW');
                }).filter(doc => {
                    // Only include doctors who have at least one shift in this month AND are not Part-Time
                    // Part-time doctors are excluded from the personnel view PDF list
                    const hasShifts = shifts.some(s => s.doctorId === doc.id && dateRange.includes(s.date));
                    return hasShifts && !doc.isPartTime;
                });

                // Helper Formatters
                const formatTimeShort = (time: string) => {
                    if (!time) return '';
                    // 08:30 -> 8', 17:00 -> 17'
                    return time.replace(/(\d{1,2}):\d{2}/g, (match, p1) => parseInt(p1) + '\'').replace(/\s/g, '');
                };
                const formatLocShort = (loc: string) => {
                    if (loc === '北投') return '北';
                    if (loc === '台中') return '中';
                    if (loc === '大直') return '直';
                    return loc ? `(${loc})` : '';
                };

                bodyRows = sortedDoctors.map(doc => {
                    const rowData: any[] = [{ content: doc.name, styles: { fontStyle: 'bold' } }];
                    
                    dateRange.forEach(date => {
                        const shift = shifts.find(s => s.doctorId === doc.id && s.date === date);
                        const isExcluded = doc.excludedDays?.includes(new Date(date).getDay());
                        
                        if (shift) {
                            const st = shift.scheduled_station;
                            if (st === 'X') {
                                rowData.push('X');
                            } else if (st) {
                                // Check if doctor has both 婦科 and 解說 on this date
                                const allShiftsForDate = shifts.filter(s => s.doctorId === doc.id && s.date === date);
                                const hasGynecology = allShiftsForDate.some(s => s.scheduled_station === '婦科'); // Requires store update for explanation
                                const hasExplanation = allShiftsForDate.some(s => s.scheduled_station === '解說');
                                const displayStation = (hasGynecology && hasExplanation) ? '解+婦' : st;
                                
                                // Construct content for Height Calculation (approx lines)
                                // We will custom draw, but need autoTable to allocate space
                                let content = displayStation || '';
                                if (shift.workTime) content += `\n${formatTimeShort(shift.workTime)}`;
                                if (shift.task) content += `\n${shift.task}`;
                                if (shift.location) content += `\n${formatLocShort(shift.location)}`;
                                
                                rowData.push({
                                    content: content,
                                    rawShift: {
                                        station: displayStation,
                                        time: formatTimeShort(shift.workTime),
                                        task: shift.task,
                                        location: formatLocShort(shift.location)
                                    }
                                });
                            } else {
                                // No scheduled station but shift exists (e.g. metadata only)
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

            // If no doctors have any shifts for the month, skip PDF generation
            if (bodyRows.length === 0) {
                console.warn('No doctors with shifts this month, PDF export aborted.');
                alert('這個月沒有任何排班資料，無法匯出 PDF');
                return;
            }
            // PDF Styles and Generation
            autoTable(doc, {
                startY: 8,
                margin: { top: 2, right: 2, bottom: 2, left: 2 },
                head: headRow,
                body: bodyRows,
                theme: 'grid',
                styles: {
                    font: fontName, // CRITICAL: Use the custom font
                    fontSize: 8,
                    cellPadding: 0,
                    valign: 'middle',
                    halign: 'center',
                    lineWidth: 0.1,
                    lineColor: [0, 0, 0]
                },
                headStyles: {
                    fillColor: [66, 66, 66],
                    textColor: [255, 255, 255],
                    font: fontName // CRITICAL
                },
                didParseCell: function(data: any) {
                    // Header Styling
                    // ... same ...
                    if (data.section === 'head' && data.column.index > 0) {
                        const dateStr = dateRange[data.column.index - 1];
                        const d = new Date(dateStr);
                        if (d.getDay() === 0 || d.getDay() === 6) {
                            data.cell.styles.textColor = [255, 100, 100]; 
                        }
                    }

                    // Body Styling
                    // ... same ...
                    if (data.section === 'body') {
                        if (viewMode === 'station' && data.column.index === 0) {
                            const location = data.row.raw[0]?.location;
                            if (location === '北投') data.cell.styles.fillColor = [239, 246, 255]; 
                            if (location === '大直') data.cell.styles.fillColor = [250, 245, 240]; 
                            if (location === '台中') data.cell.styles.fillColor = [255, 247, 237]; 
                        }

                        if (viewMode !== 'station' && data.column.index > 0) {
                             const raw = data.cell.raw;
                             // Check if it's a shift object with rawShift
                             if (raw && raw.rawShift) {
                                  // Background Color Logic
                                 // We need to access original location for coloring; rawShift.location is short string
                                 // But we have the formatLocShort result (e.g. '(北)').
                                 // Let's use string check or pass raw location? 
                                 // Simpler: use the data.row logic or check content string?
                                 // Let's rely on string presence since we formatted it.
                                 const rawText = raw.content || '';
                                 if (rawText.includes('北') || raw.rawShift.location === '北') data.cell.styles.fillColor = [239, 246, 255];
                                 if (rawText.includes('直') || raw.rawShift.location === '直') data.cell.styles.fillColor = [250, 245, 240];
                                 if (rawText.includes('中') || raw.rawShift.location === '中') data.cell.styles.fillColor = [255, 247, 237];
                             }
                             else if (raw === 'X') {
                                 data.cell.styles.textColor = [200, 200, 200];
                             }
                        }
                    }
                },
                willDrawCell: function(data: any) {
                    if (data.section === 'body' && data.column.index > 0) {
                        const raw = data.cell.raw;
                        // Clear text for custom rendering in both personnel and station views
                        if ((raw && raw.rawShift) || (raw && raw.rawStationShifts)) {
                            data.cell.text = []; // Prevent default drawing
                        }
                    }
                },
                didDrawCell: function(data: any) {
                     // Personnel View Custom Rendering
                     if (data.section === 'body' && data.column.index > 0 && data.cell.raw && data.cell.raw.rawShift) {
                         const { station, time, task, location } = data.cell.raw.rawShift;
                         const x = data.cell.x + data.cell.width / 2;
                         let y = data.cell.y + 3; // Reduced start padding
                         
                         // Station (8pt)
                         doc.setFontSize(8);
                         doc.text(station, x, y, { align: 'center' });
                         y += 3; // Tighter

                         // Time (6pt)
                         if (time) {
                             doc.setFontSize(6);
                             doc.text(time, x, y, { align: 'center' });
                             y += 2.5; // Tighter
                         }

                         // Task (6pt)
                         if (task) {
                            doc.setFontSize(6); 
                            doc.text(task, x, y, { align: 'center' });
                            y += 2.5; // Tighter
                         }
                         
                         // Location (5pt) - separate line
                         if (location) {
                             doc.setFontSize(5);
                             doc.text(location, x, y, { align: 'center' });
                         }
                     }
                     
                     // Station View Custom Rendering
                     if (data.section === 'body' && data.column.index > 0 && data.cell.raw && data.cell.raw.rawStationShifts) {
                         const shifts = data.cell.raw.rawStationShifts;
                         if (shifts.length === 0) return;
                         
                         const x = data.cell.x + data.cell.width / 2;
                         let y = data.cell.y + 3;
                         
                         shifts.forEach((shift: any, idx: number) => {
                             // Name (8pt)
                             doc.setFontSize(8);
                             doc.text(shift.name, x, y, { align: 'center' });
                             y += 3;
                             
                             // Time (6pt)
                             if (shift.time) {
                                 doc.setFontSize(6);
                                 doc.text(shift.time, x, y, { align: 'center' });
                                 y += 2.5;
                             }
                             
                             // Task (6pt)
                             if (shift.task) {
                                 doc.setFontSize(6);
                                 doc.text(shift.task, x, y, { align: 'center' });
                                 y += 2.5;
                             }
                             
                             // Add spacing between doctors
                             if (idx < shifts.length - 1) {
                                 y += 2;
                             }
                         });
                     }
                }
            });
            
            // Generate Filename: YYYY-MM
            const year = currentDate.getFullYear();
            const month = String(currentDate.getMonth() + 1).padStart(2, '0');
            const filename = `${year}${month} 醫師排班表.pdf`;

            doc.save(filename);

        } catch (error) {
            console.error(error);
            alert('匯出 PDF 失敗');
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
            await db.autoScheduleDoctors(startDate, endDate, targetDays);
            setShifts(db.getDoctorShifts()); // Refresh
        } catch (e) {
            console.error(e);
            alert('排班失敗');
        } finally {
            setIsAutoScheduling(false);
            setShowAutoScheduleConfirm(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-50">
            <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shrink-0 shadow-sm z-30 sticky top-0">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 text-teal-700 bg-teal-50 px-3 py-1.5 rounded-lg border border-teal-100">
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
                                } else {
                                    newDate.setMonth(newDate.getMonth() - 1);
                                }
                                setCurrentDate(newDate);
                            }}
                            className="p-1.5 hover:bg-slate-50 text-gray-600 border-r border-gray-200"
                        >
                            <ChevronLeft size={20} />
                        </button>
                        <span className="px-4 font-mono font-bold text-gray-700 min-w-[100px] text-center">
                           {viewMode === 'daily' 
                                ? toLocalISOString(currentDate) 
                                : `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`
                           }
                        </span>
                        <button 
                            onClick={() => {
                                const newDate = new Date(currentDate);
                                if (viewMode === 'daily') {
                                    newDate.setDate(newDate.getDate() + 1);
                                } else {
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
                        className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-sm font-bold hover:bg-slate-200 transition-colors border border-slate-200"
                    >
                        {viewMode === 'daily' ? '今天' : '本月'}
                    </button>

                    {canEdit && (
                        <button 
                            onClick={() => setIsQuickExcludeMode(!isQuickExcludeMode)}
                            className={`ml-2 px-3 py-1.5 rounded-lg text-sm font-bold transition-all border flex items-center gap-1 ${
                                isQuickExcludeMode 
                                ? 'bg-red-500 text-white border-red-600 shadow-md animate-pulse' 
                                : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                            }`}
                        >
                            {isQuickExcludeMode ? <X size={16}/> : <X size={16} className="text-red-400"/>}
                            {isQuickExcludeMode ? '關閉禁排模式' : '禁排'}
                        </button>
                    )}
                    
                    <div className="h-6 w-px bg-gray-200 mx-1"></div>


                    {canEdit && (
                        <button 
                            onClick={handleOpenTargetDaysModal}
                            className="flex items-center gap-1 px-3 py-1.5 bg-gradient-to-r from-purple-500 to-indigo-600 text-white hover:opacity-90 rounded-lg text-sm font-bold transition-all shadow-md shadow-purple-200"
                        >
                            <Wand2 size={16} />
                            一鍵排班
                        </button>
                    )}

                    <button 
                        onClick={handleExportPDF}
                        className="flex items-center gap-1 px-3 py-1.5 bg-teal-50 text-teal-700 hover:bg-teal-100 rounded-lg text-sm font-bold transition-colors border border-teal-100"
                    >
                        <Download size={16} />
                        匯出
                    </button>
                </div>
            </div>
            
            {/* ... Grid Content ... */}
            <div className="flex-1 overflow-auto p-4 md:p-6 pb-20">
                {viewMode === 'personnel' && (
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm inline-block min-w-full">
                        <table className="text-sm border-collapse w-auto">
                            <thead>
                                <tr className="bg-slate-50 border-b border-gray-200">
                                    <th className="p-3 text-left font-bold text-gray-600 w-32 sticky left-0 top-0 bg-slate-50 z-30 border-r border-gray-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">醫師</th>
                                    {dateRange.map(date => {
                                        const d = new Date(date);
                                        const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                                        // Holiday Logic
                                        const holidays = db.getHolidays();
                                        const holiday = holidays.find(h => h.date === date);
                                        const isHoliday = holiday?.type === DateEventType.NATIONAL || holiday?.type === DateEventType.CLOSED;
                                        const isNote = holiday?.type === DateEventType.NOTE;

                                        return (
                                            <th key={date} className={`p-1 text-center border-r border-gray-100 min-w-[40px] sticky top-0 z-20 ${isHoliday || isWeekend ? 'text-red-500 bg-red-50' : 'text-gray-700 bg-slate-50'}`}>
                                                <div className="font-bold text-sm">{d.getDate()}</div>
                                                <div className="text-[10px] opacity-75">
                                                    {['日', '一', '二', '三', '四', '五', '六'][d.getDay()]}
                                                </div>
                                                {holiday && (
                                                    <div className={`text-[10px] font-bold mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis max-w-[40px] ${isHoliday ? 'text-red-600' : 'text-blue-600'}`}>
                                                        {holiday.name}
                                                    </div>
                                                )}
                                            </th>
                                        );
                                    })}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {doctors.map(doc => (
                                    <tr key={doc.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="p-3 font-bold text-gray-700 border-r border-gray-200 sticky left-0 bg-white z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] flex items-center gap-2">
                                            <div className="flex flex-col gap-0.5">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        db.reorderDoctor(doc.id, 'up');
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
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        db.reorderDoctor(doc.id, 'down');
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
                                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500">
                                                {doc.alias}
                                            </div>
                                            <div className="flex flex-col">
                                                <span>{doc.name}</span>
                                                <span className="text-[10px] text-slate-400 font-normal">
                                                    {shifts.filter(s => s.doctorId === doc.id && dateRange.includes(s.date) && s.station !== 'X').length} 天
                                                </span>
                                            </div>
                                        </td>
                                        {dateRange.map(date => {
                                            const shift = shifts.find(s => s.doctorId === doc.id && s.date === date);
                                            const d = new Date(date);
                                            // Fix: 0 is Sunday in JS, but user might map differently? 
                                            // In DoctorManager: Sunday=0, Monday=1... 
                                            const dayOfWeek = d.getDay(); 
                                            const isExcluded = doc.excludedDays?.includes(dayOfWeek);

                                            return (
                                                <td 
                                                    key={date} 
                                                    onClick={() => handleCellClick(doc.id, date)}
                                                    className={`p-1 border-r border-gray-100 h-12 cursor-pointer transition-all relative group text-center
                                                        ${shift 
                                                            ? 'bg-teal-50 hover:bg-teal-100' 
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
                                                                    const displayStation = (hasGynecology && hasExplanation) ? '解+婦' : (shift.scheduled_station || '');
                                                                    
                                                                    return <span className="font-bold text-teal-700 block text-xs md:text-sm leading-tight">{displayStation}</span>;
                                                                })()}
                                                                {shift.workTime && (
                                                                    <span className="text-[10px] text-slate-500 leading-tight font-medium">
                                                                        {shift.workTime.replace(/(\d{1,2}):\d{2}/g, (match, p1) => parseInt(p1) + '\'').replace(/\s/g, '')}
                                                                    </span>
                                                                )}
                                                                {shift.task && (
                                                                    <span className="text-[10px] text-blue-600 leading-tight font-medium overflow-hidden text-ellipsis w-full px-1">
                                                                        {shift.task}
                                                                    </span>
                                                                )}
                                                                 {shift.location && (
                                                                    <div className={`text-[10px] px-1 rounded text-white scale-90 ${LOCATION_COLORS[shift.location]?.split(' ')[0] || 'bg-gray-400'}`}>
                                                                        {shift.location}
                                                                    </div>
                                                                 )}
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
                            <thead>
                                <tr className="bg-slate-50 border-b border-gray-200">
                                    <th className="p-3 text-left font-bold text-gray-600 w-32 sticky left-0 top-0 bg-slate-50 z-30 border-r border-gray-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">崗位</th>
                                    {dateRange.map(date => {
                                        const d = new Date(date);
                                        const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                                        return (
                                            <th key={date} className={`p-1 text-center border-r border-gray-100 min-w-[40px] sticky top-0 z-20 ${isWeekend ? 'text-red-500 bg-red-50' : 'text-gray-700 bg-slate-50'}`}>
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

                                            {locationStations.map(stationConfig => {
                                                const stationName = stationConfig.name;
                                                return (
                                                    <tr key={`${location}-${stationName}`} className="hover:bg-gray-50/80 transition-colors border-b border-gray-100">
                                                        {/* Station Name Header */}
                                                        <th className="p-3 text-left font-medium text-gray-600 w-32 sticky left-0 bg-white z-10 border-r border-gray-200">
                                                            <div className="flex flex-col">
                                                                <span className="text-sm font-bold text-gray-800">{stationName}</span>
                                                            </div>
                                                        </th>

                                                        {/* Date Cells */}
                                                        {dateRange.map(date => {
                                                            // NEW: Get ALL shifts for this station+location+date (support multiple doctors)
                                                            const currentShifts = shifts.filter(s => 
                                                                s.date === date && 
                                                                s.station === stationName && 
                                                                s.location === location
                                                            );
                                                            const isWeekend = new Date(date).getDay() === 0 || new Date(date).getDay() === 6;

                                                            return (
                                                                <td 
                                                                    key={date} 
                                                                    className={`p-1 border-r border-gray-100 relative group cursor-pointer min-w-[40px] 
                                                                        ${isWeekend ? 'bg-red-50/10' : ''} 
                                                                        ${selectedCell?.date === date && selectedCell?.doctorId === '' /* Just checks selection */ ? 'ring-2 ring-inset ring-blue-400' : ''}
                                                                    `}
                                                                    onClick={() => handleStationCellClick(stationName, location, date)}
                                                                >
                                                                    {currentShifts.length > 0 ? (
                                                                        <div className="flex flex-col items-center justify-center h-full w-full gap-0.5 py-1">
                                                                            {currentShifts.map((shift, index) => {
                                                                                const doc = doctors.find(d => d.id === shift.doctorId);
                                                                                return (
                                                                                    <div key={shift.id} className="flex flex-col items-center w-full">
                                                                                        <span className="text-xs font-bold text-gray-900 bg-white/80 px-1.5 py-0.5 rounded shadow-sm border border-gray-200">
                                                                                            {doc?.alias || doc?.name?.charAt(0) || '?'}
                                                                                        </span>
                                                                                        {shift.workTime && (
                                                                                            <span className="text-[9px] text-slate-500 leading-tight font-medium">
                                                                                                 {shift.workTime.replace(/(\d{1,2}):\d{2}/g, (match, p1) => parseInt(p1) + '\'').replace(/\s/g, '')}
                                                                                            </span>
                                                                                        )}
                                                                                        {shift.task && (
                                                                                            <span className="text-[9px] text-blue-600 leading-tight font-medium px-1">
                                                                                                {shift.task}
                                                                                            </span>
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
                                            const shiftsOnStation = shifts.filter(s => s.date === toLocalISOString(currentDate) && s.station === st && s.location === config.location); 
                                            // Get Requirement
                                            const dayOfWeek = (currentDate.getDay() + 6) % 7;
                                            const reqKey = `${config.name}_${config.location}`;
                                            const reqs = requirements[reqKey] || requirements[config.name] || [0,0,0,0,0,0,0];
                                            const req = reqs[dayOfWeek];
                                            const isShort = shiftsOnStation.length < req;

                                            return (
                                                <div key={`${loc}-${st}`} className={`rounded-xl border p-4 shadow-sm flex flex-col h-full bg-white transition-all ${isShort ? 'border-red-200 shadow-red-50' : 'border-gray-200'}`}>
                                                    <div className="flex justify-between items-center mb-3 pb-2 border-b border-gray-50">
                                                        <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                                            {st}
                                                            {isShort && <span className="flex h-2 w-2 rounded-full bg-red-500 animate-pulse" title="人力不足"></span>}
                                                        </h3>
                                                        <span className={`text-xs font-bold px-2 py-1 rounded-full ${isShort ? 'bg-red-50 text-red-600' : 'bg-slate-50 text-slate-400'}`}>
                                                            {shiftsOnStation.length} / {req} 人
                                                        </span>
                                                    </div>
                                                    
                                                    <div className="space-y-2 flex-1">
                                                        {shiftsOnStation.length > 0 ? (
                                                            shiftsOnStation.map(s => {
                                                                const doc = doctors.find(d => d.id === s.doctorId);
                                                                return (
                                                                    <div key={s.id} className="flex items-center gap-3 p-2 rounded-lg bg-slate-50 border border-slate-100 transform hover:scale-[1.02] transition-all cursor-pointer hover:bg-white hover:shadow-sm" onClick={()=>handleCellClick(s.doctorId, s.date)}>
                                                                        <div className="w-10 h-10 rounded-full bg-teal-100 text-teal-600 flex items-center justify-center font-bold text-sm shadow-sm border border-teal-50">
                                                                            {doc?.alias}
                                                                        </div>
                                                                        <div className="flex-1 min-w-0">
                                                                            <div className="font-bold text-gray-800 truncate">{doc?.name}</div>
                                                                            {s.workTime && <div className="text-xs text-gray-500 flex items-center gap-1"><Clock size={10}/> {s.workTime}</div>}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })
                                                        ) : (
                                                            <div className="h-20 flex items-center justify-center text-slate-300 text-xs italic border-2 border-dashed border-slate-50 rounded-lg bg-slate-50/50">
                                                                無人值班
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
                                             const dayOfWeek = (new Date(date).getDay() + 6) % 7; // Mon=0
                                             const dayLabel = ['日','一','二','三','四','五','六'][new Date(date).getDay()];
                                             const isWeekend = new Date(date).getDay() === 0 || new Date(date).getDay() === 6;
                                             
                                             return (
                                                <tr key={date} className={`hover:bg-slate-50 transition-colors ${isWeekend ? 'bg-red-50/10' : ''}`}>
                                                    <td className="px-3 py-2 text-left sticky left-0 bg-white z-10 border-r border-slate-100 font-bold text-slate-600 whitespace-nowrap shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
                                                        {date.slice(5)} <span className="text-gray-400 font-normal">({dayLabel})</span>
                                                    </td>
                                                    {stations.map(st => {
                                                        const count = shifts.filter(s => s.date === date && s.station === st.name && s.location === st.location && s.doctorId).length;
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
                                            const total = docShifts.length;
                                            
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
                                                        const count = docShifts.filter(s => s.station === st.name && s.location === st.location).length;
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
                                    {Array.from(new Set(stations.map(s => s.name))).map(stationName => {
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
                                    {doctors.filter(d => d.capabilities?.includes(assignModal.station)).map(doc => {
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
                                    {doctors.filter(d => !d.capabilities?.includes(assignModal.station)).map(doc => {
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
                            <p className="text-xs text-purple-600 mt-2">
                                💡 提示：設為 0 天的醫師將不會被排班（兼職醫師已自動排除）
                            </p>
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
                                                {doctor.specialty && (
                                                    <div className="text-xs text-gray-500">{doctor.specialty}</div>
                                                )}
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
        </div>
    );
};

export default PhysicianSchedulePage;
