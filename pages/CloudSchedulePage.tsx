import React, { useState, useMemo, useEffect } from 'react';
import { User, UserRole, ReportAssistant, CloudScheduleEntry, Doctor, PERMISSIONS } from '../types';
import { generateUUID } from '../services/utils';
import { db } from '../services/store';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import ExcelJS from 'exceljs';
import { Cloud, ChevronLeft, ChevronRight, Plus, Pencil, Trash2, Check, X, UserCheck, Save, AlertCircle, Loader2 } from 'lucide-react';

interface CloudSchedulePageProps {
    currentUser: User;
}

const PALETTE = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#84cc16'];

const CloudSchedulePage: React.FC<CloudSchedulePageProps> = ({ currentUser }) => {
    const isEditor = currentUser.permissions?.includes(PERMISSIONS.EDIT_CLOUD_SCHEDULE) || currentUser.role === UserRole.SYSTEM_ADMIN;

    const [currentDate, setCurrentDate] = useState(new Date());
    const [viewMode, setViewMode] = useState<'month' | 'week'>(window.innerWidth < 768 ? 'week' : 'month');
    const [assistants, setAssistants] = useState<ReportAssistant[]>(() => db.getReportAssistants());
    const [entries, setEntries] = useState<CloudScheduleEntry[]>(() => db.getCloudScheduleEntries());
    const [doctors, setDoctors] = useState<Doctor[]>(() => db.getDoctors());
    const [shifts, setShifts] = useState(() => db.doctorShifts);

    // Local dirty tracking: key (date_doctorId) -> partial entry
    const [dirtyEntries, setDirtyEntries] = useState<Record<string, { assistantIds: string[]; proofreaderUserId?: string }>>({});
    const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());
    const [toast, setToast] = useState<string | null>(null);

    // Edit Mode Toggle
    const [isEditing, setIsEditing] = useState(false);

    // Manage assistants panel
    const [showManagePanel, setShowManagePanel] = useState(false);
    const [editingAssistant, setEditingAssistant] = useState<Partial<ReportAssistant> | null>(null);
    const [newName, setNewName] = useState('');
    const [newColor, setNewColor] = useState(PALETTE[0]);

    const radiographers = db.getUsers().filter(u => u.isRadiographer && u.isActive !== false);

    const radiologists = useMemo(() => {
        return doctors
            .filter(d => d.specialty === '放射科' || d.specialty === '影像醫學部')
            .sort((a, b) => (a.displayOrder || 999) - (b.displayOrder || 999));
    }, [doctors]);

    // Subscribe store
    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth < 768) {
                setViewMode('week');
            } else {
                setViewMode('month');
            }
        };
        window.addEventListener('resize', handleResize);

        const unsub = db.subscribe(() => {
            setAssistants([...db.getReportAssistants()]);
            setEntries([...db.getCloudScheduleEntries()]);
            setDoctors([...db.getDoctors()]);
            setShifts([...db.doctorShifts]);
        });
        return () => {
            window.removeEventListener('resize', handleResize);
            unsub();
        };
    }, []);

    const showToast = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(null), 3000);
    };

    // Build month date array or week array
    const visibleDates = useMemo(() => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        if (viewMode === 'month') {
            const days: string[] = [];
            for (let d = 1; d <= daysInMonth; d++) {
                days.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
            }
            return days;
        } else {
            // Week View: 7 days starting from currentDate
            const days: string[] = [];
            const temp = new Date(currentDate);
            for (let i = 0; i < 7; i++) {
                days.push(temp.toISOString().split('T')[0]);
                temp.setDate(temp.getDate() + 1);
            }
            return days;
        }
    }, [currentDate, viewMode]);

    // Get effective entry for a date + doctor (dirty overrides persisted)
    const getEntry = (date: string, doctorId: string) => {
        const key = `${date}_${doctorId}`;
        const dirty = dirtyEntries[key];
        const persisted = entries.find(e => e.date === date && e.doctorId === doctorId);
        if (dirty) return { assistantIds: dirty.assistantIds, proofreaderUserId: dirty.proofreaderUserId };
        if (persisted) return { assistantIds: persisted.assistantIds, proofreaderUserId: persisted.proofreaderUserId };
        return { assistantIds: [], proofreaderUserId: undefined };
    };

    const setAssistant = async (date: string, doctorId: string, assistantId: string) => {
        if (!isEditing) return;
        const key = `${date}_${doctorId}`;
        const current = getEntry(date, doctorId);
        const newIds = assistantId ? [assistantId] : [];
        const updated = { ...current, assistantIds: newIds };
        
        // Update local dirty state first for UI responsiveness
        setDirtyEntries(prev => ({ ...prev, [key]: updated }));
        
        // Auto-save
        await saveEntry(date, doctorId, updated);
    };

    const setProofreader = async (date: string, doctorId: string, userId: string) => {
        if (!isEditing) return;
        const key = `${date}_${doctorId}`;
        const current = getEntry(date, doctorId);
        const value = userId === '' ? undefined : userId;
        const updated = { ...current, proofreaderUserId: value };
        
        // Update local dirty state
        setDirtyEntries(prev => ({ ...prev, [key]: updated }));
        
        // Auto-save
        await saveEntry(date, doctorId, updated);
    };

    const saveEntry = async (date: string, doctorId: string, overrideEntry?: any) => {
        const key = `${date}_${doctorId}`;
        const current = overrideEntry || getEntry(date, doctorId);
        setSavingKeys(prev => new Set(prev).add(key));
        try {
            const payload = { 
                date, 
                doctorId,
                assistantIds: current.assistantIds, 
                proofreaderUserId: current.proofreaderUserId 
            };
            console.log('[CloudSchedulePage] Attempting saveEntry:', payload);
            await db.upsertCloudScheduleEntry(payload);
            setDirtyEntries(prev => { const n = { ...prev }; delete n[key]; return n; });
            // showToast(`已儲存`); // Don't show toast for every auto-save to avoid spam
        } catch (e: any) {
            console.error('[CloudSchedulePage] Save Error:', e);
            showToast(`儲存失敗: ${e.message || e.toString()}`);
        } finally {
            setSavingKeys(prev => { const n = new Set(prev); n.delete(key); return n; });
        }
    };

    // Manage assistants CRUD
    const handleAddAssistant = async () => {
        if (!newName.trim()) return;
        const assistant: ReportAssistant = {
            id: generateUUID(),
            name: newName.trim(),
            color: newColor,
            isActive: true,
        };
        await db.addReportAssistant(assistant);
        setNewName('');
        setNewColor(PALETTE[0]);
    };

    const handleUpdateAssistant = async () => {
        if (!editingAssistant?.id || !editingAssistant.name?.trim()) return;
        await db.updateReportAssistant({
            id: editingAssistant.id,
            name: editingAssistant.name.trim(),
            color: editingAssistant.color,
            isActive: editingAssistant.isActive ?? true,
        });
        setEditingAssistant(null);
    };

    const handleDeleteAssistant = async (id: string) => {
        if (!confirm('確定要刪除此報告助理嗎？')) return;
        await db.deleteReportAssistant(id);
    };

    const activeAssistants = assistants.filter(a => a.isActive !== false);

    const dateLabel = viewMode === 'month' 
        ? currentDate.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long' })
        : `${visibleDates[0]?.split('-')[2]}日 - ${visibleDates[visibleDates.length-1]?.split('-')[2]}日 (${currentDate.toLocaleDateString('zh-TW', { month: 'short' })})`;

    const todayStr = new Date().toISOString().split('T')[0];

    // --- PDF Export Implementation ---
    const exportToPDF = async () => {
        try {
            showToast('正在產生 PDF...');

            // ---- Build month date array (always full month for PDF) ----
            const year = currentDate.getFullYear();
            const month = currentDate.getMonth();
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const monthDates: string[] = [];
            for (let d = 1; d <= daysInMonth; d++) {
                monthDates.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
            }

            // ---- Load jsPDF + font ----
            const doc = new jsPDF('l', 'mm', 'a4');
            let fontName = 'helvetica';

            try {
                const pathsToTry = ['/schedule/fonts/jf-openhuninn-2.1.ttf', '/fonts/jf-openhuninn-2.1.ttf'];
                let response: Response | null = null;
                for (const path of pathsToTry) {
                    try {
                        const res = await fetch(path);
                        if (res.ok && !(res.headers.get('content-type') || '').includes('text/html')) {
                            response = res;
                            break;
                        }
                    } catch { /* continue */ }
                }
                if (response) {
                    const blob = await response.blob();
                    const reader = new FileReader();
                    await new Promise((resolve, reject) => {
                        reader.onloadend = () => {
                            const b64 = (reader.result as string).split('base64,')[1];
                            if (b64) {
                                doc.addFileToVFS('jf-openhuninn-2.1.ttf', b64);
                                doc.addFont('jf-openhuninn-2.1.ttf', 'OpenHuninn', 'normal');
                                doc.addFont('jf-openhuninn-2.1.ttf', 'OpenHuninn', 'bold');
                                doc.setFont('OpenHuninn');
                                fontName = 'OpenHuninn';
                                resolve(true);
                            } else { reject('invalid b64'); }
                        };
                        reader.onerror = reject;
                        reader.readAsDataURL(blob);
                    });
                }
            } catch (e) {
                console.warn('Font load failed, using fallback', e);
            }

            // ---- Constants ----
            const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
            // 臺積電 周天規則：週一(一)、周六(六) => 沈， 周二(二)、周三(三) => 陳， 周四(四)、周五(五) => 謝
            const TSMC_DEFAULT: Record<number, string> = {
                1: '沈', 2: '陳', 3: '陳', 4: '謝', 5: '謝', 6: '沈', 0: ''
            };

            // ---- Helper: get doctors for a station+location on a date ----
            const getDocs = (date: string, location: string, station: string): string => {
                return shifts
                    .filter(s => s.date === date &&
                        (location === 'any' || s.location === location) &&
                        (s.scheduled_station === station || s.station === station))
                    .map(s => radiologists.find(d => d.id === s.doctorId)?.name || '')
                    .filter(Boolean)
                    .join('\n');
            };

            // ---- Build table rows ----
            type RowDef = { label: string; color: [number, number, number]; getter: (date: string) => string };

            const rows: RowDef[] = [
                // 解說 (北投解說班)
                { label: '解說', color: [255, 255, 255], getter: (date) => getDocs(date, '北投', '解說') },

                // 台中 (台中地點所有编組)
                { label: '台中', color: [255, 255, 255], getter: (date) => {
                    return shifts
                        .filter(s => s.date === date && s.location === '台中')
                        .map(s => radiologists.find(d => d.id === s.doctorId)?.name || '')
                        .filter(Boolean).join('\n');
                }},

                // 行政
                { label: '行政', color: [255, 255, 255], getter: (date) => getDocs(date, '北投', '行政') },

                // 台積電
                { label: '台積電', color: [255, 249, 196], getter: (date) => {
                    // First check if any shift has location='台積電'
                    const fromSchedule = getDocs(date, '台積電', '');
                    if (fromSchedule) return fromSchedule;
                    // Default rule by day of week
                    const dow = new Date(date).getDay();
                    return TSMC_DEFAULT[dow] || '';
                }},

                // 大直 (影像 + 遠班)
                { label: '大直', color: [250, 245, 255], getter: (date) => {
                    return shifts
                        .filter(s => s.date === date && s.location === '大直')
                        .map(s => radiologists.find(d => d.id === s.doctorId)?.name || '')
                        .filter(Boolean).join('\n');
                }},

                // 影像 (北投影像)
                { label: '影像', color: [239, 246, 255], getter: (date) => getDocs(date, '北投', '影像') },

                // 報告助理打 (雲班表助理資料) - 格式: 醫師代稱-助理名稱
                { label: '報告助理', color: [240, 253, 250], getter: (date) => {
                    const entryList = entries.filter(e => e.date === date && e.assistantIds.length > 0);
                    const lines: string[] = [];
                    entryList.forEach(e => {
                        const doc = radiologists.find(d => d.id === e.doctorId);
                        const docAlias = doc?.alias || doc?.name || '';
                        e.assistantIds.forEach(aid => {
                            const asstName = assistants.find(a => a.id === aid)?.name || '';
                            if (asstName) lines.push(`${docAlias}-${asstName}`);
                        });
                    });
                    return lines.join('\n');
                }},

                // 報告核對 - 格式: 醫師代稱-放射師代稱
                { label: '報告核對', color: [240, 253, 250], getter: (date) => {
                    const entryList = entries.filter(e => e.date === date && e.proofreaderUserId);
                    const lines: string[] = [];
                    entryList.forEach(e => {
                        const doc = radiologists.find(d => d.id === e.doctorId);
                        const docAlias = doc?.alias || doc?.name || '';
                        const rad = radiographers.find(u => u.id === e.proofreaderUserId);
                        const radAlias = rad?.alias || rad?.name || '';
                        if (radAlias) lines.push(`${docAlias}-${radAlias}`);
                    });
                    return lines.join('\n');
                }},
            ];

            // ---- Title ----
            const titleText = `${year}${String(month + 1).padStart(2, '0')}影像雲班表`;
            doc.setFont(fontName);
            doc.setFontSize(14);
            doc.setTextColor(0, 0, 0);
            const pageWidth = doc.internal.pageSize.width; // 210mm for A4 portrait
            doc.text(titleText, pageWidth / 2, 8, { align: 'center' });

            const margin = 5;
            const labelColWidth = 17; // wide enough for 3 Chinese chars without wrapping
            const avail = pageWidth - margin * 2 - labelColWidth;

            const buildTable = (dates: string[], startY: number) => {
                const dateCols = dates.length;
                const dateColWidth = avail / dateCols;

                const headerRow = [{ content: '' }].concat(
                    dates.map(date => {
                        const d = new Date(date);
                        const isWknd = d.getDay() === 0 || d.getDay() === 6;
                        return { content: `${d.getDate()}\n${weekDays[d.getDay()]}`, styles: { textColor: isWknd ? [200, 50, 50] : [255, 255, 255] } };
                    })
                );

                const bodyRows = rows.map(row =>
                    [{ content: row.label }].concat(
                        dates.map(date => ({ content: row.getter(date) }))
                    )
                );

                autoTable(doc, {
                    head: [headerRow],
                    body: bodyRows,
                    startY,
                    margin: { left: margin, right: margin },
                    tableLineWidth: 0.3,
                    styles: {
                        font: fontName,
                        fontSize: 11,
                        cellPadding: 0.8,
                        valign: 'middle',
                        halign: 'center',
                        lineWidth: 0.2,
                        lineColor: [160, 160, 160],
                        overflow: 'linebreak',
                    },
                    headStyles: {
                        fillColor: [50, 50, 50],
                        textColor: [255, 255, 255],
                        fontStyle: 'bold',
                        fontSize: 12,
                        minCellHeight: 5,
                    },
                    columnStyles: {
                        0: { cellWidth: labelColWidth, fontStyle: 'bold', fillColor: [235, 235, 235] },
                        ...Object.fromEntries(dates.map((_, i) => [i + 1, { cellWidth: dateColWidth }]))
                    },
                    didParseCell: function (data: any) {
                        if (data.section === 'body') {
                            const rowIdx = data.row.index;
                            if (rowIdx < rows.length) {
                                data.cell.styles.fillColor = rows[rowIdx].color;
                            }
                            if (data.column.index > 0) {
                                const date = dates[data.column.index - 1];
                                const dow = new Date(date).getDay();
                                if ((dow === 0 || dow === 6) && data.cell.styles.fillColor?.join?.(',') === '255,255,255') {
                                    data.cell.styles.fillColor = [248, 248, 248];
                                }
                            }
                        }
                    },
                });
            };

            // Split dates: first half 1-15, second half 16-end
            const firstHalf = monthDates.slice(0, 15);
            const secondHalf = monthDates.slice(15);

            buildTable(firstHalf, 12);
            // @ts-ignore
            const firstTableEndY = (doc as any).lastAutoTable?.finalY ?? 145;
            buildTable(secondHalf, firstTableEndY + 4);

            doc.save(`${titleText}.pdf`);
            showToast('已完成匯出 PDF');
        } catch (e: any) {
            console.error('PDF Export Error:', e);
            showToast('匹出失敗：' + (e.message || e));
        }
    };

    // --- Excel Export Implementation ---
    const exportToExcel = async () => {
        try {
            showToast('正在產生 Excel...');

            const year = currentDate.getFullYear();
            const month = currentDate.getMonth();
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const monthDates: string[] = [];
            for (let d = 1; d <= daysInMonth; d++) {
                monthDates.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
            }
            const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
            const TSMC_DEFAULT: Record<number, string> = { 1: '沈', 2: '陳', 3: '陳', 4: '謝', 5: '謝', 6: '沈', 0: '' };

            const getDocs = (date: string, location: string, station: string): string =>
                shifts
                    .filter(s => s.date === date && (location === 'any' || s.location === location) && (s.scheduled_station === station || s.station === station))
                    .map(s => radiologists.find(d => d.id === s.doctorId)?.name || '')
                    .filter(Boolean).join('\n');

            const rowDefs = [
                { label: '解說', color: 'FFFFFFFF', getter: (d: string) => getDocs(d, '北投', '解說') },
                { label: '台中', color: 'FFFFFFFF', getter: (d: string) => shifts.filter(s => s.date === d && s.location === '台中').map(s => radiologists.find(r => r.id === s.doctorId)?.name || '').filter(Boolean).join('\n') },
                { label: '行政', color: 'FFFFFFFF', getter: (d: string) => getDocs(d, '北投', '行政') },
                { label: '台積電', color: 'FFFFF9C4', getter: (d: string) => { const f = getDocs(d, '台積電', ''); if (f) return f; return TSMC_DEFAULT[new Date(d).getDay()] || ''; } },
                { label: '大直', color: 'FFFAF5FF', getter: (d: string) => shifts.filter(s => s.date === d && s.location === '大直').map(s => radiologists.find(r => r.id === s.doctorId)?.name || '').filter(Boolean).join('\n') },
                { label: '影像', color: 'FFEFF6FF', getter: (d: string) => getDocs(d, '北投', '影像') },
                { label: '報告助理', color: 'FFF0FDF5', getter: (d: string) => { const el = entries.filter(e => e.date === d && e.assistantIds.length > 0); return el.flatMap(e => { const da = radiologists.find(r => r.id === e.doctorId)?.alias || radiologists.find(r => r.id === e.doctorId)?.name || ''; return e.assistantIds.map(aid => { const an = assistants.find(a => a.id === aid)?.name || ''; return an ? `${da}-${an}` : ''; }).filter(Boolean); }).join('\n'); } },
                { label: '報告核對', color: 'FFF0FDF5', getter: (d: string) => { const el = entries.filter(e => e.date === d && e.proofreaderUserId); return el.map(e => { const da = radiologists.find(r => r.id === e.doctorId)?.alias || radiologists.find(r => r.id === e.doctorId)?.name || ''; const ra = radiographers.find(u => u.id === e.proofreaderUserId)?.alias || radiographers.find(u => u.id === e.proofreaderUserId)?.name || ''; return ra ? `${da}-${ra}` : ''; }).filter(Boolean).join('\n'); } },
            ];

            const wb = new ExcelJS.Workbook();
            const ws = wb.addWorksheet('影像雲班表');

            const titleText = `${year}${String(month + 1).padStart(2, '0')}影像雲班表`;
            const firstHalf = monthDates.slice(0, 15);
            const secondHalf = monthDates.slice(15);

            const writeHalf = (dates: string[], startRow: number) => {
                // Header row
                const hdrRow = ws.getRow(startRow);
                hdrRow.getCell(1).value = '';
                dates.forEach((date, i) => {
                    const d = new Date(date);
                    const isWknd = d.getDay() === 0 || d.getDay() === 6;
                    const cell = hdrRow.getCell(i + 2);
                    cell.value = `${d.getDate()}\n${weekDays[d.getDay()]}`;
                    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
                    cell.font = { bold: true, size: 11, color: { argb: isWknd ? 'FFC83232' : 'FFFFFFFF' } };
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF323232' } };
                    cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
                });
                hdrRow.height = 20;

                // Data rows
                rowDefs.forEach((row, ri) => {
                    const dataRow = ws.getRow(startRow + 1 + ri);
                    const labelCell = dataRow.getCell(1);
                    labelCell.value = row.label;
                    labelCell.font = { bold: true, size: 10 };
                    labelCell.alignment = { horizontal: 'center', vertical: 'middle' };
                    labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEBEBEB' } };
                    labelCell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

                    dates.forEach((date, i) => {
                        const cell = dataRow.getCell(i + 2);
                        cell.value = row.getter(date);
                        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
                        cell.font = { size: 10 };
                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: row.color } };
                        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
                    });
                    // No fixed height - let ExcelJS auto-adjust based on content
                });

                // Column widths
                ws.getColumn(1).width = 8;
                dates.forEach((_, i) => { ws.getColumn(i + 2).width = 10; });
            };

            // Title
            ws.mergeCells(1, 1, 1, firstHalf.length + 1);
            const titleCell = ws.getCell(1, 1);
            titleCell.value = titleText;
            titleCell.font = { bold: true, size: 14 };
            titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
            ws.getRow(1).height = 22;

            writeHalf(firstHalf, 2);
            // Blank row between halves
            const blankRowIdx = 2 + 1 + rowDefs.length; // header + data + 1 blank
            ws.getRow(blankRowIdx).height = 4;
            writeHalf(secondHalf, blankRowIdx + 1);

            const buffer = await wb.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${titleText}.xlsx`;
            a.click();
            URL.revokeObjectURL(url);
            showToast('已完成匯出 Excel');
        } catch (e: any) {
            console.error('Excel Export Error:', e);
            showToast('Excel 匹出失敗：' + (e.message || e));
        }
    };

    return (
        <div className="h-full flex flex-col bg-slate-50 overflow-hidden">
            {/* Toast */}
            {toast && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-sm px-4 py-2 rounded-xl shadow-xl z-50 animate-bounce-slow">
                    {toast}
                </div>
            )}

            {/* Header */}
            <div className="flex-none px-6 py-4 bg-white border-b border-slate-200 shadow-sm">
                <div className="flex justify-between items-center gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-sky-50 text-sky-600 rounded-lg"><Cloud size={20} /></div>
                        <div className="hidden md:block">
                            <h2 className="text-xl font-bold text-slate-800">影像雲班表</h2>
                            <p className="text-xs text-slate-400">影像醫學部醫師 · 報告助理指定</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Month/Week nav */}
                        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl shadow-sm px-2 py-1">
                            <button onClick={() => setCurrentDate(d => { 
                                const n = new Date(d); 
                                if (viewMode === 'month') n.setMonth(n.getMonth() - 1);
                                else n.setDate(n.getDate() - 7);
                                return n; 
                            })}
                                className="p-1 text-slate-400 hover:text-sky-600 rounded transition-colors">
                                <ChevronLeft size={16} />
                            </button>
                            <span className="font-bold text-slate-700 text-sm min-w-[100px] text-center">{dateLabel}</span>
                            <button onClick={() => setCurrentDate(d => { 
                                const n = new Date(d); 
                                if (viewMode === 'month') n.setMonth(n.getMonth() + 1);
                                else n.setDate(n.getDate() + 7);
                                return n; 
                            })}
                                className="p-1 text-slate-400 hover:text-sky-600 rounded transition-colors">
                                <ChevronRight size={16} />
                            </button>
                            <button onClick={() => setCurrentDate(new Date())} className="px-2 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-200 ml-1">
                                今日
                            </button>
                        </div>

                        {/* View Mode Toggle - Only on Mobile */}
                        <div className="flex md:hidden items-center bg-slate-100 p-1 rounded-xl">
                            <button 
                                onClick={() => setViewMode('month')}
                                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${viewMode === 'month' ? 'bg-white text-sky-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                月
                            </button>
                            <button 
                                onClick={() => setViewMode('week')}
                                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${viewMode === 'week' ? 'bg-white text-sky-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                7天
                            </button>
                        </div>

                        {/* Export Buttons */}
                        <div className="flex items-center gap-2 border-l border-slate-200 pl-3">
                            <button onClick={exportToExcel} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 transition-colors">
                                匯出 Excel
                            </button>
                            <button onClick={exportToPDF} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 transition-colors">
                                匯出 PDF
                            </button>
                        </div>

                        {isEditor && (
                            <div className="flex items-center gap-2 border-l border-slate-200 pl-3">
                                <button
                                    onClick={() => setIsEditing(!isEditing)}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-bold border transition-all ${isEditing ? 'bg-sky-600 text-white border-sky-600 shadow-md animate-pulse' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                                >
                                    <Pencil size={15} /> {isEditing ? '完成' : '編輯模式'}
                                </button>
                                <button
                                    onClick={() => setShowManagePanel(v => !v)}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-bold border transition-all ${showManagePanel ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-slate-200 text-slate-700 hover:bg-indigo-50 hover:border-indigo-300'}`}
                                >
                                    <UserCheck size={15} /> 管理助理
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* Main Schedule Table */}
                <div className="flex-1 overflow-auto p-4 md:p-6">
                    {(!assistants || assistants.length === 0) ? (
                        <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-4">
                            <div className="p-3 bg-slate-100 rounded-full">
                                <UserCheck size={32} className="text-slate-300" />
                            </div>
                            <div className="text-center">
                                <p className="text-lg font-medium text-slate-600">目前沒有報告助理資料</p>
                                <p className="text-sm text-slate-400 mt-1 max-w-xs px-4">
                                    如果您在資料庫中已有資料，請檢查 Supabase RLS 權限或確認資料已正確同步。
                                    (目前從資料庫載入 0 筆)
                                </p>
                            </div>
                            {isEditor && (
                                <button 
                                    onClick={() => {/* 開啟新增助理彈窗 */}}
                                    className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-2"
                                >
                                    <Plus size={18} />
                                    新增第一位助理
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm inline-block min-w-full pb-20 overflow-x-hidden">
                            <table className="border-collapse w-full table-fixed text-[10px]">
                                <thead className="relative z-50">
                                    <tr className="bg-slate-50 border-b border-slate-200">
                                        <th className="p-1 text-center font-bold text-slate-600 min-w-[70px] md:min-w-[80px] sticky left-0 top-0 bg-slate-50 z-50 border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                                            醫師
                                        </th>
                                        {visibleDates.map(date => {
                                            const d = new Date(date);
                                            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                                            const isToday = date === todayStr;

                                            return (
                                                <th 
                                                    key={date} 
                                                    className={`px-0 py-1 text-center border-r border-slate-100 min-w-[45px] md:min-w-[70px] sticky top-0 z-40 ${isToday ? 'bg-teal-50' : (isWeekend ? 'bg-red-50' : 'bg-white')} border-b border-slate-200`}
                                                >
                                                    <div className={`font-bold text-[11px] leading-tight ${isToday ? 'text-teal-600' : (isWeekend ? 'text-red-500' : 'text-slate-800')}`}>
                                                        {d.getMonth() + 1}/{d.getDate()}
                                                    </div>
                                                    <div className={`text-[10px] opacity-75 leading-tight ${isToday ? 'text-teal-600' : (isWeekend ? 'text-red-500' : 'text-slate-700')}`}>
                                                        {['日', '一', '二', '三', '四', '五', '六'][d.getDay()]}
                                                    </div>
                                                </th>
                                            );
                                        })}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {radiologists.map(doc => (
                                        <tr key={doc.id} className="group hover:bg-slate-50/50 transition-colors">
                                            {/* Sticky Doctor Col */}
                                            <td className="p-0 border-r border-slate-200 sticky left-0 bg-white z-30 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] align-middle text-center">
                                                <div className="p-1 font-bold text-slate-800 flex flex-col items-center justify-center gap-1 w-full">
                                                    <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500 mx-auto">
                                                        {doc.alias || doc.name.charAt(0)}
                                                    </div>
                                                    <span className="text-[11px] truncate hidden md:inline">{doc.name}</span>
                                                    <span className="text-[11px] truncate md:hidden">{doc.alias || doc.name}</span>
                                                </div>
                                            </td>

                                            {/* Days Cols */}
                                            {visibleDates.map(date => {
                                                const d = new Date(date);
                                                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                                                const key = `${date}_${doc.id}`;
                                                
                                                // Find if doctor is scheduled today and location is Beitou
                                                const docShift = shifts.find(s => s.date === date && s.doctorId === doc.id);
                                                const isBeitou = docShift?.location === '北投';
                                                
                                                // Check background tint
                                                const isImagingTask = docShift?.task?.includes('影像') || docShift?.scheduled_station?.includes('影像');
                                                const isSupportTask = docShift?.task?.includes('支援') || docShift?.scheduled_station?.includes('支援');
                                                const isRemoteTask = docShift?.task?.includes('遠') || docShift?.scheduled_station?.includes('遠') || docShift?.task?.toLowerCase().includes('remote') || docShift?.scheduled_station?.toLowerCase().includes('remote');
                                                
                                                let bgColor = isWeekend ? 'bg-slate-50' : 'bg-white';
                                                
                                                if (docShift) {
                                                    const isTaichung = docShift.location === '台中';
                                                    // Priority coloring
                                                    if (isTaichung) bgColor = 'bg-white';
                                                    else if (isRemoteTask) bgColor = 'bg-pink-100';
                                                    else if (isSupportTask) bgColor = 'bg-yellow-100';
                                                    else if (isImagingTask) bgColor = 'bg-sky-50';
                                                }

                                                const isEditable = isBeitou || isRemoteTask;

                                                // State data mapped
                                                const entry = getEntry(date, doc.id);
                                                const isDirty = !!dirtyEntries[key];
                                                const isSaving = savingKeys.has(key);
                                                const proofreader = radiographers.find(u => u.id === entry.proofreaderUserId);

                                                return (
                                                    <td key={date} className={`p-1 align-top border-r border-slate-100 ${bgColor} relative group transition-colors hover:bg-slate-50`}>
                                                        {!docShift ? (
                                                            <div className="h-full w-full min-h-[50px] flex items-center justify-center text-[10px] text-slate-300">沒班</div>
                                                        ) : !isEditable ? (
                                                            <div className="h-full w-full min-h-[50px] flex flex-col items-center justify-center text-[10px] leading-tight">
                                                                <span className="text-slate-400 truncate w-full text-center">{docShift.location}</span>
                                                                <span className="text-slate-500 font-bold truncate w-full text-center">{docShift.scheduled_station}</span>
                                                            </div>
                                                        ) : (
                                                            <div className="flex flex-col min-h-[50px] gap-1 items-center justify-center relative w-full pt-1">
                                                                {/* Task Hint */}
                                                                <div className={`text-[11px] font-bold leading-tight w-full text-center whitespace-normal break-words ${isRemoteTask ? 'text-pink-700' : isSupportTask ? 'text-yellow-700' : isImagingTask ? 'text-sky-700' : 'text-slate-600'}`}>
                                                                    {docShift.scheduled_station}
                                                                </div>
                                                                                                                                {isSaving && (
                                                                      <div className="absolute top-0 right-1 flex items-center gap-1 z-20">
                                                                          <span className="text-[8px] text-sky-600 animate-pulse font-bold">Saving...</span>
                                                                          <Loader2 size={8} className="animate-spin text-sky-500" />
                                                                      </div>
                                                                 )}

                                                                {/* Assistant Select */}
                                                                <div className="w-full mt-0.5">
                                                                    {isEditing ? (
                                                                        <select
                                                                            value={entry.assistantIds[0] || ''}
                                                                            onChange={e => setAssistant(date, doc.id, e.target.value)}
                                                                            className={`w-full text-[10px] border rounded-[3px] p-0 outline-none font-bold h-5 leading-tight text-center ${entry.assistantIds.length > 0 ? 'border-sky-400 bg-sky-50 text-sky-700' : 'border-slate-300 bg-white text-slate-500'}`}
                                                                        >
                                                                            <option value="">--</option>
                                                                            {activeAssistants.map(asst => (
                                                                                <option key={asst.id} value={asst.id}>{asst.name}</option>
                                                                            ))}
                                                                        </select>
                                                                    ) : (
                                                                        <div className="text-[11px] font-bold text-sky-700 w-full text-center whitespace-normal break-words">
                                                                            {entry.assistantIds.length > 0 ? (
                                                                                activeAssistants.find(a => a.id === entry.assistantIds[0])?.name || '-'
                                                                            ) : '-'}
                                                                        </div>
                                                                    )}
                                                                </div>

                                                                {/* Proofreader Select */}
                                                                <div className="mt-auto pt-0.5 w-full">
                                                                    {isEditing ? (
                                                                        <select
                                                                            value={entry.proofreaderUserId || ''}
                                                                            onChange={e => setProofreader(date, doc.id, e.target.value)}
                                                                            className={`w-full text-[10px] border rounded-[3px] p-0 outline-none font-bold h-5 leading-tight text-center ${entry.proofreaderUserId ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-slate-300 bg-white text-slate-500'}`}
                                                                        >
                                                                            <option value="">--</option>
                                                                            {radiographers.map(u => (
                                                                                <option key={u.id} value={u.id}>{u.name}</option>
                                                                            ))}
                                                                        </select>
                                                                    ) : (
                                                                        <div className="text-[11px] font-bold text-indigo-700 w-full text-center whitespace-normal break-words">
                                                                            {proofreader ? proofreader.name : '-'}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
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
                </div>

                {/* Manage Assistants Side Panel */}
                {showManagePanel && isEditor && (
                    <div className="w-72 shrink-0 bg-white border-l border-slate-200 flex flex-col overflow-hidden shadow-xl">
                        <div className="px-4 py-4 border-b border-slate-100 flex items-center justify-between">
                            <h3 className="font-bold text-slate-800">報告助理管理</h3>
                            <button onClick={() => setShowManagePanel(false)} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg">
                                <X size={16} />
                            </button>
                        </div>

                        {/* Add new */}
                        <div className="p-4 border-b border-slate-100 bg-slate-50 space-y-3">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">新增助理</label>
                            <input
                                type="text"
                                placeholder="姓名"
                                value={newName}
                                onChange={e => setNewName(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleAddAssistant()}
                                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-sky-400 outline-none"
                            />
                            <div>
                                <p className="text-[10px] text-slate-400 mb-1.5">顏色</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {PALETTE.map(c => (
                                        <button
                                            key={c}
                                            onClick={() => setNewColor(c)}
                                            className={`w-6 h-6 rounded-full border-2 transition-transform ${newColor === c ? 'border-slate-800 scale-125' : 'border-transparent'}`}
                                            style={{ backgroundColor: c }}
                                        />
                                    ))}
                                </div>
                            </div>
                            <button
                                onClick={handleAddAssistant}
                                disabled={!newName.trim()}
                                className="w-full flex items-center justify-center gap-2 bg-sky-600 text-white px-3 py-2 rounded-lg text-sm font-bold disabled:opacity-50 hover:bg-sky-700 active:scale-95 transition-all"
                            >
                                <Plus size={14} /> 新增
                            </button>
                        </div>

                        {/* Existing list */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-2">
                            {assistants.length === 0 && <p className="text-sm text-slate-400 text-center pt-4">尚無助理</p>}
                            {assistants.map(asst => (
                                <div key={asst.id} className={`rounded-xl border p-3 transition-all ${asst.isActive !== false ? 'border-slate-200 bg-white' : 'border-dashed border-slate-200 bg-slate-50 opacity-60'}`}>
                                    {editingAssistant?.id === asst.id ? (
                                        <div className="space-y-2">
                                            <input
                                                type="text"
                                                value={editingAssistant.name || ''}
                                                onChange={e => setEditingAssistant(prev => ({ ...prev, name: e.target.value }))}
                                                className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-sky-400"
                                            />
                                            <div className="flex flex-wrap gap-1">
                                                {PALETTE.map(c => (
                                                    <button
                                                        key={c}
                                                        onClick={() => setEditingAssistant(prev => ({ ...prev, color: c }))}
                                                        className={`w-5 h-5 rounded-full border-2 ${editingAssistant.color === c ? 'border-slate-700 scale-125' : 'border-transparent'}`}
                                                        style={{ backgroundColor: c }}
                                                    />
                                                ))}
                                            </div>
                                            <div className="flex gap-2">
                                                <button onClick={handleUpdateAssistant} className="flex-1 text-xs font-bold bg-teal-600 text-white py-1.5 rounded-lg hover:bg-teal-700 flex items-center justify-center gap-1">
                                                    <Check size={12} /> 確認
                                                </button>
                                                <button onClick={() => setEditingAssistant(null)} className="flex-1 text-xs font-bold bg-slate-100 text-slate-600 py-1.5 rounded-lg hover:bg-slate-200 flex items-center justify-center gap-1">
                                                    <X size={12} /> 取消
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm" style={{ backgroundColor: asst.color || '#9CA3AF' }}>
                                                {asst.name[0]}
                                            </div>
                                            <span className="flex-1 text-sm font-bold text-slate-700 truncate">{asst.name}</span>
                                            <button onClick={() => setEditingAssistant({ ...asst })} className="p-1 text-slate-400 hover:text-sky-600 rounded">
                                                <Pencil size={13} />
                                            </button>
                                            <button onClick={() => handleDeleteAssistant(asst.id)} className="p-1 text-slate-400 hover:text-red-500 rounded">
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CloudSchedulePage;
