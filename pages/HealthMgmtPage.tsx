import React, { useState, useEffect, useMemo } from 'react';
import { User, Shift, HealthMgmtShift, UserRole, PERMISSIONS, StaffGroup, HealthMgmtStaff, RosterCycle, AnesthesiaStaff, AnesthesiaShift } from '../types';
import { db } from '../services/store';
import { Users, LayoutDashboard, Calendar, ArrowLeft, ArrowRight, X, Lock, Unlock, UserPlus, Save, Trash2, FileSpreadsheet, BarChart3, Download, Search, ChevronLeft, ChevronRight, Zap, ChevronDown, ChevronUp } from 'lucide-react';
import { toLocalISOString, generateUUID } from '../services/utils';
import ConfirmModal from '../components/ConfirmModal';
import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { loadChineseFontToDoc } from '../services/pdfUtils';

interface HealthMgmtPageProps {
  currentUser: User;
}



const HealthMgmtPage: React.FC<HealthMgmtPageProps> = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState<'schedule' | 'staff' | 'stats' | 'anesthesia'>('schedule');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [shifts, setShifts] = useState<HealthMgmtShift[]>([]);
  const [hmStations, setHmStations] = useState<string[]>(db.getHealthMgmtStations());
  const [healthMgmtStaff, setHealthMgmtStaff] = useState<HealthMgmtStaff[]>([]); // Changed from healthMgmtUsers
  const [anesthesiaStaff, setAnesthesiaStaff] = useState<AnesthesiaStaff[]>([]);
  const [anesthesiaShifts, setAnesthesiaShifts] = useState<AnesthesiaShift[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [hmTasks, setHmTasks] = useState<string[]>(db.getHealthMgmtTasks());
  const [hmCycles, setHmCycles] = useState<RosterCycle[]>(db.getHealthMgmtCycles());
  const [holidays, setHolidays] = useState(db.getHolidays());

  const [newStaffName, setNewStaffName] = useState(''); // For adding new staff
  const [newStaffAlias, setNewStaffAlias] = useState(''); // For adding new staff alias
  const [editingStaffName, setEditingStaffName] = useState(''); // For editing existing staff name
  const [editingStaffAlias, setEditingStaffAlias] = useState(''); // For editing existing staff alias
  const [editingStaffIsActive, setEditingStaffIsActive] = useState(true); // For editing existing staff active status

  const [newAnesStaffName, setNewAnesStaffName] = useState('');
  const [newAnesStaffAlias, setNewAnesStaffAlias] = useState('');
  const [newAnesStaffLocations, setNewAnesStaffLocations] = useState<string[]>(['北投', '大直']);
  const [editingAnesId, setEditingAnesId] = useState<string | null>(null);
  const [editingAnesName, setEditingAnesName] = useState('');
  const [editingAnesAlias, setEditingAnesAlias] = useState('');
  const [editingAnesStaffLocations, setEditingAnesStaffLocations] = useState<string[]>([]);
  const [newStaffRole, setNewStaffRole] = useState<'ADMIN' | 'VIEWER'>('VIEWER');
  const [editingStaffRole, setEditingStaffRole] = useState<'ADMIN' | 'VIEWER'>('VIEWER');
  const [newStaffLocation, setNewStaffLocation] = useState<'北投' | '大直'>('北投');
  const [editingStaffLocation, setEditingStaffLocation] = useState<'北投' | '大直'>('北投');
  const [adminLocationView, setAdminLocationView] = useState<'全部' | '北投' | '大直'>('全部');
  const [newAnesStaffRole, setNewAnesStaffRole] = useState<'ADMIN' | 'VIEWER'>('VIEWER');
  const [editingAnesStaffRole, setEditingAnesStaffRole] = useState<'ADMIN' | 'VIEWER'>('VIEWER');

  // Inline Popup State
  const [selectedCell, setSelectedCell] = useState<{ userId: string; date: string } | null>(null);
  const [editingShiftTime, setEditingShiftTime] = useState('');
  const [editingShiftTask, setEditingShiftTask] = useState(''); // This will map to 'station' (崗位)
  const [editingShiftSubTask, setEditingShiftSubTask] = useState(''); // This will map to 'task' (任務)
  const [editingShiftLocation, setEditingShiftLocation] = useState(''); // New state for 'location'
  const [editingShiftCustomTask, setEditingShiftCustomTask] = useState('');
 
  // Quick Schedule State (Health Mgmt)
  const [isQuickScheduleMode, setIsQuickScheduleMode] = useState(false);
  const [quickScheduleStation, setQuickScheduleStation] = useState('');
  const [quickScheduleTask, setQuickScheduleTask] = useState('');
  const [quickScheduleLocation, setQuickScheduleLocation] = useState('');

  // Quick Schedule State (Anesthesia)
  const [isAnesQuickScheduleMode, setIsAnesQuickScheduleMode] = useState(false);
  const [quickAnesStation, setQuickAnesStation] = useState('');
  const [quickAnesLocation, setQuickAnesLocation] = useState('');
  const [isAnesStaffManagementExpanded, setIsAnesStaffManagementExpanded] = useState(false);
  const [selectedCycleId, setSelectedCycleId] = useState<string>('month');

  const LOCATIONS = ['北投', '大直'];

  const isGlobalReadOnly = currentUser.role === UserRole.VIEWER || currentUser.role === UserRole.RADIOGRAPHER_STAFF;

  const isHmReadOnly = useMemo(() => {
    if (currentUser.role === UserRole.SYSTEM_ADMIN || currentUser.role === UserRole.HM_SUPERVISOR) return false;
    if (currentUser.permissions?.includes(PERMISSIONS.EDIT_HEALTH_MGMT)) return false;
    const matchingStaff = healthMgmtStaff.find(s => s.name === currentUser.name || s.alias === currentUser.name);
    if (matchingStaff?.role === 'ADMIN') return false;
    return true;
  }, [currentUser, healthMgmtStaff]);

  const isAnesReadOnly = useMemo(() => {
    if (currentUser.role === UserRole.SYSTEM_ADMIN || currentUser.role === UserRole.HM_SUPERVISOR) return false;
    if (currentUser.permissions?.includes(PERMISSIONS.EDIT_ANESTHESIA)) return false;
    const matchingStaff = anesthesiaStaff.find(s => s.name === currentUser.name || s.alias === currentUser.name);
    if (matchingStaff?.role === 'ADMIN') return false;
    return true;
  }, [currentUser, anesthesiaStaff]);

  const currentUserLocation = useMemo(() => {
    // If user has a hardcoded location restriction, use it immediately
    if (currentUser.healthMgmtLocation && currentUser.healthMgmtLocation !== '全部') {
       return currentUser.healthMgmtLocation;
    }
    if (currentUser.role === UserRole.SYSTEM_ADMIN || currentUser.permissions?.includes(PERMISSIONS.EDIT_HEALTH_MGMT)) {
      return adminLocationView;
    }
    const matchingStaff = healthMgmtStaff.find(s => s.name === currentUser.name || s.alias === currentUser.name);
    if (matchingStaff && matchingStaff.location) {
        return matchingStaff.location;
    }
    return '全部'; // Fallback
  }, [currentUser, healthMgmtStaff, adminLocationView]);

  // Filtered staff list based on reactive state and location
  const activeHealthMgmtStaff = useMemo(() => {
      let staff = healthMgmtStaff.filter(s => s.isActive !== false);
      if (currentUserLocation !== '全部') {
          staff = staff.filter(s => s.location === currentUserLocation || !s.location);
      }
      return staff;
  }, [healthMgmtStaff, currentUserLocation]);

  const filteredHmCycles = useMemo(() => {
      return hmCycles.filter(cycle => {
          if (currentUserLocation !== '全部') {
              return cycle.location === currentUserLocation || !cycle.location;
          }
          return true;
      });
  }, [hmCycles, currentUserLocation]);

  const activeAnesthesiaStaff = useMemo(() => {
      return anesthesiaStaff.filter(s => s.isActive !== false);
  }, [anesthesiaStaff]);

  // State for local modifications (if needed, but for this change, direct DB updates are used)
  // const [localStaff, setLocalStaff] = useState<HealthMgmtStaff[]>([]);

  useEffect(() => {
    let isInitialLoad = true;
    const loadData = () => {
      setHealthMgmtStaff(db.getHealthMgmtStaff());
      setShifts(db.getHealthMgmtShifts());
      setHmStations(db.getHealthMgmtStations());
      setHmTasks(db.getHealthMgmtTasks());
      const cycles = db.getHealthMgmtCycles();
      setHmCycles(cycles);
      setHolidays(db.getHolidays());
      setAnesthesiaStaff(db.getAnesthesiaStaff());
      setAnesthesiaShifts(db.getAnesthesiaShifts());

      if (isInitialLoad) {
          // Auto-select current cycle if not already set or if it's 'month'
          const todayStr = toLocalISOString(new Date());
          const currentCycle = cycles.find(c => todayStr >= c.startDate && todayStr <= c.endDate);
          if (currentCycle) {
            setSelectedCycleId(currentCycle.id);
          }
          isInitialLoad = false;
      }
    };
    loadData();
    const unsubscribe = db.subscribe(loadData);
    return () => unsubscribe();
  }, []);

  const currentCycle = useMemo(() => {
    return filteredHmCycles.find(c => c.id === selectedCycleId);
  }, [selectedCycleId, filteredHmCycles]);

  // Auto-switch to "month" view if the selected cycle is not available in the current location
  useEffect(() => {
     if (selectedCycleId !== 'month') {
         const isValid = filteredHmCycles.some(c => c.id === selectedCycleId);
         if (!isValid) {
             setSelectedCycleId('month');
         }
     }
  }, [filteredHmCycles, selectedCycleId]);

  const dateRange = useMemo(() => {
    if (selectedCycleId !== 'month' && currentCycle) {
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
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    for (let i = 1; i <= daysInMonth; i++) {
        const d = new Date(year, month, i);
        dates.push(toLocalISOString(d));
    }
    return dates;
  }, [currentDate, selectedCycleId, currentCycle]);

  const handleUpdateShift = async (userId: string, date: string, station: string, task?: string, location?: string) => {
    if (isHmReadOnly) return;
    try {
        const existing = shifts.find(s => s.userId === userId && s.date === date);
        
        if (existing) {
            if (!station && !task && !location) {
                await db.deleteHealthMgmtShift(userId, date);
            } else {
                await db.upsertHealthMgmtShift({ ...existing, station: station || '', task, location });
            }
        } else if (station || task || location) {
            const newShift: HealthMgmtShift = {
                id: generateUUID(),
                userId,
                date,
                station: station || '',
                task,
                location
            };
            await db.upsertHealthMgmtShift(newShift);
        }
    } catch (err) {
        console.error('[HealthMgmtPage] handleUpdateShift failed:', err);
        alert(`健管排班更新失敗: ${err instanceof Error ? err.message : JSON.stringify(err)}`);
    }
  };

  const handleCellClick = async (userId: string, date: string) => {
      if (isHmReadOnly) return;
      
      try {
          if (isQuickScheduleMode) {
              // Quick apply
              // Use quickScheduleStation or quickScheduleTask or quickScheduleLocation
              await handleUpdateShift(userId, date, quickScheduleStation, quickScheduleTask || undefined, quickScheduleLocation || undefined);
          } else {
              // Open Inline Popup
              setSelectedCell({ userId, date });
              const existing = shifts.find(s => s.userId === userId && s.date === date);
              if (existing) {
                  // Extract station and optional time
                  if (existing.station) {
                      const parts = existing.station.split(' ');
                      if (parts.length > 1 && parts[0].includes(':')) {
                          setEditingShiftTime(parts[0]);
                          setEditingShiftTask(parts.slice(1).join(' ')); // This is 'station' (崗位)
                      } else {
                      setEditingShiftTime('');
                      setEditingShiftTask(existing.station);
                  }
              } else {
                  setEditingShiftTime('');
                  setEditingShiftTask('');
              }
              setEditingShiftSubTask(existing.task || ''); // This is 'task' (任務)
              setEditingShiftLocation(existing.location || ''); // Load location
          } else {
              setEditingShiftTime('');
              setEditingShiftTask('');
              setEditingShiftSubTask('');
              setEditingShiftLocation('');
          }
      }
    } catch (err) {
          console.error('[HealthMgmtPage] handleCellClick failed:', err);
          alert(`健管排班點擊失敗: ${err instanceof Error ? err.message : JSON.stringify(err)}`);
      }
  };

  const handleSavePopup = async () => {
      if (!selectedCell) return;
      
      try {
          let finalStation = editingShiftTask;
          if (editingShiftTime) {
              finalStation = (`${editingShiftTime} ${editingShiftTask}`).trim();
          }

          const finalTask = editingShiftCustomTask || editingShiftSubTask;

          await handleUpdateShift(selectedCell.userId, selectedCell.date, finalStation, finalTask || undefined, editingShiftLocation || undefined);
          setSelectedCell(null);
          setEditingShiftCustomTask('');
      } catch (err) {
          console.error('[HealthMgmtPage] handleSavePopup failed:', err);
          alert(`健管排班儲存失敗: ${err instanceof Error ? err.message : JSON.stringify(err)}`);
      }
  };

  const handleExportStats = async () => {
      const label = selectedCycleId === 'month' 
        ? toLocalISOString(currentDate).substring(0, 7) 
        : currentCycle?.name || '週期統計';
      
      const rangeStr = `${dateRange[0]} ~ ${dateRange[dateRange.length - 1]} (共 ${dateRange.length} 天)`;

      const workbook = new ExcelJS.Workbook();
      const ws = workbook.addWorksheet('健管排班統計');

      // Title row
      const titleRow = ws.addRow([`統計區間: ${rangeStr}`]);
      titleRow.font = { bold: true };

      // Header row
      const headers = ['姓名', '上班天數', '平日', '假日班', '主控', '輔控', '晚班', ...hmStations];
      const headerRow = ws.addRow(headers);
      headerRow.font = { bold: true };
      headerRow.alignment = { horizontal: 'center' };
      headerRow.eachCell(cell => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2F0D9' } };
          cell.border = { bottom: { style: 'thin' } };
      });

      // Data rows
      activeHealthMgmtStaff.forEach(staff => {
          let totalWorkDays = 0;
          let weekdayWorkDays = 0;
          let holidayWorkDays = 0;
          const dateCounts: Record<string, number> = {};
          hmStations.forEach(st => dateCounts[st] = 0);
          const roleCounts: Record<string, number> = { '主控': 0, '輔控': 0, '晚班': 0 };

          dateRange.forEach(date => {
              const shift = shifts.find(s => s.userId === staff.id && s.date === date);
              if (shift && (shift.station || shift.task)) {
                  totalWorkDays++;
                  const d = new Date(date);
                  const holiday = holidays.find(h => h.date === date && (h.type === 'NATIONAL' || h.type === 'CLOSED'));
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                  if (holiday || isWeekend) holidayWorkDays++; else weekdayWorkDays++;

                  const parts = shift.station.split(' ');
                  const stationLabel = parts.length > 1 && parts[0].includes(':') ? parts.slice(1).join(' ') : shift.station;
                  if (dateCounts[stationLabel] !== undefined) dateCounts[stationLabel]++;

                  const combinedText = `${shift.station} ${shift.task || ''}`;
                  if (combinedText.includes('主控')) roleCounts['主控']++;
                  if (combinedText.includes('輔控')) roleCounts['輔控']++;
                  if (combinedText.includes('晚班')) roleCounts['晚班']++;
              }
          });

          const row = ws.addRow([
              staff.name, totalWorkDays, weekdayWorkDays, holidayWorkDays,
              roleCounts['主控'], roleCounts['輔控'], roleCounts['晚班'],
              ...hmStations.map(st => dateCounts[st])
          ]);
          row.alignment = { horizontal: 'center' };
          row.getCell(1).alignment = { horizontal: 'left' };
      });

      // Column widths
      ws.getColumn(1).width = 14;
      for (let i = 2; i <= headers.length; i++) ws.getColumn(i).width = 10;

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      const locPrefix = currentUserLocation !== '全部' ? `${currentUserLocation}_` : '';
      link.download = `${locPrefix}健管排班統計_${label}.xlsx`;
      link.click();
      URL.revokeObjectURL(link.href);
  };

  const handleExportScheduleExcel = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('健管排班表');

      const label = selectedCycleId === 'month' 
        ? `${currentDate.getFullYear()}年${currentDate.getMonth() + 1}月`
        : currentCycle?.name || '週期排班';

      // Header row
      const headerRow = ['人員', ...dateRange.map(date => {
        const d = new Date(date);
        return `${d.getMonth() + 1}/${d.getDate()}(${['日', '一', '二', '三', '四', '五', '六'][d.getDay()]})`;
      })];
      
      const firstRow = sheet.addRow(headerRow);
      firstRow.font = { bold: true };
      firstRow.alignment = { horizontal: 'center' };

      // Apply background color for holidays and weekends in header
      headerRow.forEach((colName, index) => {
        if (index === 0) return; // Skip "人員" column
        const dateStr = dateRange[index - 1];
        const d = new Date(dateStr);
        const holiday = holidays.find(h => h.date === dateStr && (h.type === 'NATIONAL' || h.type === 'CLOSED'));
        const isWeekend = d.getDay() === 0 || d.getDay() === 6;

        if (holiday || isWeekend) {
          const cell = firstRow.getCell(index + 1);
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFE4E1' } // MistyRose color for holidays
          };
          cell.font = { bold: true, color: { argb: 'FFFF0000' } }; // Red text for holidays
        }
      });

      // Data rows
      activeHealthMgmtStaff.forEach(staff => {
        const rowData = [staff.name];
        dateRange.forEach(date => {
          const shift = shifts.find(s => s.userId === staff.id && s.date === date);
          if (shift) {
            let content = shift.station || '';
            if (shift.task) content += ` (${shift.task})`;
            rowData.push(content);
          } else {
            rowData.push('');
          }
        });
        const row = sheet.addRow(rowData);
        row.alignment = { horizontal: 'center', vertical: 'middle' };
      });

      // Styling
      sheet.columns.forEach((col, i) => {
        col.width = i === 0 ? 15 : 12;
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      const locPrefix = currentUserLocation !== '全部' ? `${currentUserLocation}_` : '';
      link.download = `${locPrefix}健管排班表_${label}.xlsx`;
      link.click();
    } catch (error) {
      console.error('Excel export failed:', error);
      alert('匯出 Excel 失敗');
    }
  };

  const handleExportSchedulePDF = async () => {
    try {
      const doc = new jsPDF('l', 'mm', 'a4');
      const fontName = await loadChineseFontToDoc(doc);

      const label = selectedCycleId === 'month' 
        ? `${currentDate.getFullYear()}年${currentDate.getMonth() + 1}月`
        : currentCycle?.name || '週期排班';

      const locPrefixTitle = currentUserLocation !== '全部' ? `${currentUserLocation} ` : '';
      doc.setFont(fontName);
      doc.setFontSize(16);
      doc.text(`${locPrefixTitle}健管排班表 - ${label}`, 14, 15);
      doc.setFontSize(10);
      doc.text(`匯出日期: ${new Date().toLocaleDateString('zh-TW')}`, 280, 15, { align: 'right' });

      const headers = [['人員', ...dateRange.map(date => {
        const d = new Date(date);
        return `${d.getMonth() + 1}/${d.getDate()}\n(${['日', '一', '二', '三', '四', '五', '六'][d.getDay()]})`;
      })]];

      const body = activeHealthMgmtStaff.map(staff => [
        staff.name,
        ...dateRange.map(date => {
          const shift = shifts.find(s => s.userId === staff.id && s.date === date);
          if (!shift) return '';
          let text = shift.station || '';
          if (shift.task) text += `\n(${shift.task})`;
          return text;
        })
      ]);

      autoTable(doc, {
        head: headers,
        body: body,
        startY: 15,
        styles: { font: fontName, fontSize: 8, halign: 'center', cellPadding: 1 },
        headStyles: { fillColor: [45, 133, 115] },
        columnStyles: { 0: { fontStyle: 'bold', minCellWidth: 20 } },
        margin: { top: 15, left: 8, right: 8, bottom: 8 },
        didParseCell: (data) => {
          if (data.section === 'head' && data.column.index > 0) {
            const dateStr = dateRange[data.column.index - 1];
            const d = new Date(dateStr);
            const holiday = holidays.find(h => h.date === dateStr && (h.type === 'NATIONAL' || h.type === 'CLOSED'));
            const isWeekend = d.getDay() === 0 || d.getDay() === 6;

            if (holiday || isWeekend) {
              data.cell.styles.fillColor = [255, 228, 225]; // MistyRose
              data.cell.styles.textColor = [255, 0, 0]; // Red text
            }
          }
        }
      });

      const locPrefixFile = currentUserLocation !== '全部' ? `${currentUserLocation}_` : '';
      doc.save(`${locPrefixFile}健管排班表_${label}.pdf`);
    } catch (error) {
      console.error('PDF export failed:', error);
      alert('匯出 PDF 失敗');
    }
  };

  const stats = useMemo(() => {
    return activeHealthMgmtStaff.map(staff => {
        const counts: Record<string, number> = {};
        let total = 0;
        let weekday = 0;
        let holidayCount = 0;
        const roleCounts: Record<string, number> = { '主控': 0, '輔控': 0, '晚班': 0 };

        dateRange.forEach(date => {
            const shift = shifts.find(s => s.userId === staff.id && s.date === date);
            if (shift && (shift.station || shift.task)) {
                total++;
                const d = new Date(date);
                const holiday = holidays.find(h => h.date === date && (h.type === 'NATIONAL' || h.type === 'CLOSED'));
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                if (holiday || isWeekend) {
                    holidayCount++;
                } else {
                    weekday++;
                }

                const parts = shift.station.split(' ');
                const stationLabel = parts.length > 1 && parts[0].includes(':') ? parts.slice(1).join(' ') : shift.station;
                if (hmStations.includes(stationLabel)) {
                    counts[stationLabel] = (counts[stationLabel] || 0) + 1;
                }

                // Count specific roles in both station and task
                const combinedText = `${shift.station} ${shift.task || ''}`;
                if (combinedText.includes('主控')) roleCounts['主控']++;
                if (combinedText.includes('輔控')) roleCounts['輔控']++;
                if (combinedText.includes('晚班')) roleCounts['晚班']++;
            }
        });

        return { staff, counts, total, weekday, holidayCount, roleCounts };
    });
  }, [activeHealthMgmtStaff, hmStations, shifts, dateRange, holidays]);

  // Function to add new HM staff
  const addStaff = async (e: React.FormEvent) => {
      e.preventDefault();
      if (isHmReadOnly) return;
      if (!newStaffName.trim()) {
          setError('請輸入人員名稱');
          return;
      }
      setError(null);
      setIsSaving(true);
      try {
          const newStaff: HealthMgmtStaff = {
              id: generateUUID(),
              name: newStaffName.trim(),
              alias: newStaffAlias.trim() || undefined,
              isActive: true,
              role: newStaffRole,
              location: currentUserLocation === '全部' ? newStaffLocation : (currentUserLocation === '北投' || currentUserLocation === '大直' ? currentUserLocation : newStaffLocation)
          };
          await db.addHealthMgmtStaff(newStaff);
          setNewStaffName('');
          setNewStaffAlias('');
          setNewStaffRole('VIEWER');
          setNewStaffLocation('北投');
      } catch (err: any) {
          setError(err.message || '新增失敗，請重試');
      } finally {
          setIsSaving(false);
      }
  };

  // Function to update staff name and active status
  const updateStaff = async (e: React.FormEvent) => {
      e.preventDefault();
      if (isHmReadOnly) return;
      if (!editingId || !editingStaffName.trim()) {
          setError('請輸入人員名稱');
          return;
      }
      setError(null);
      setIsSaving(true);
      try {
          await db.updateHealthMgmtStaff(editingId, { 
              name: editingStaffName.trim(), 
              alias: editingStaffAlias.trim() || undefined,
              isActive: editingStaffIsActive,
              role: editingStaffRole,
              location: currentUserLocation === '全部' ? editingStaffLocation : (currentUserLocation === '北投' || currentUserLocation === '大直' ? currentUserLocation : editingStaffLocation)
          });
          setEditingId(null);
          setEditingStaffName('');
          setEditingStaffAlias('');
          setEditingStaffIsActive(true);
          setEditingStaffRole('VIEWER');
          setEditingStaffLocation('北投');
      } catch (err: any) {
          setError(err.message || '更新失敗，請重試');
      } finally {
          setIsSaving(false);
      }
  };

   const handleEditStaff = (staff: HealthMgmtStaff) => {
    if (isHmReadOnly) return;
    setEditingId(staff.id);
    setEditingStaffName(staff.name);
    setEditingStaffAlias(staff.alias || '');
    setEditingStaffIsActive(staff.isActive);
    setEditingStaffRole(staff.role || 'VIEWER');
    setEditingStaffLocation((staff.location as any) || '北投');
    setActiveTab('staff');
  };

  const handleDeleteStaff = async () => {
    if (isHmReadOnly) return;
    if (deleteTargetId) {
      await db.updateHealthMgmtStaff(deleteTargetId, { isActive: false }); // Deactivate instead of delete
      setDeleteTargetId(null);
    }
  };

  const canEdit = currentUser.permissions?.includes(PERMISSIONS.EDIT_HEALTH_MGMT) || currentUser.role === UserRole.SYSTEM_ADMIN;

  // --- Anesthesia Staff Management ---
  const addAnesthesiaStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAnesStaffName || isSaving || isAnesReadOnly) return;
    setIsSaving(true);
    setError(null);
    try {
        const staff: AnesthesiaStaff = {
            id: generateUUID(),
            name: newAnesStaffName,
            alias: newAnesStaffAlias || undefined,
            isActive: true,
            locations: newAnesStaffLocations,
            role: newAnesStaffRole
        };
        await db.addAnesthesiaStaff(staff);
        setNewAnesStaffName('');
        setNewAnesStaffAlias('');
        setNewAnesStaffLocations(['北投', '大直']);
        setNewAnesStaffRole('VIEWER');
    } catch (err: any) {
        console.error('[HealthMgmtPage] addAnesthesiaStaff error:', err);
        setError(err?.message || (typeof err === 'object' ? JSON.stringify(err) : String(err)));
    } finally {
        setIsSaving(false);
    }
  };

  const updateAnesthesiaStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAnesId || !editingAnesName || isSaving || isAnesReadOnly) return;
    setIsSaving(true);
    try {
        await db.updateAnesthesiaStaff(editingAnesId, {
            name: editingAnesName,
            alias: editingAnesAlias || undefined,
            locations: editingAnesStaffLocations,
            role: editingAnesStaffRole
        });
        setEditingAnesId(null);
        setEditingAnesName('');
        setEditingAnesAlias('');
        setEditingAnesStaffLocations([]);
        setEditingAnesStaffRole('VIEWER');
    } catch (err: any) {
        console.error('[HealthMgmtPage] updateAnesthesiaStaff error:', err);
        setError(err?.message || (typeof err === 'object' ? JSON.stringify(err) : String(err)));
    } finally {
        setIsSaving(false);
    }
  };

  const handleEditAnesStaff = (staff: AnesthesiaStaff) => {
    if (isAnesReadOnly) return;
    setEditingAnesId(staff.id);
    setEditingAnesName(staff.name);
    setEditingAnesAlias(staff.alias || '');
    setEditingAnesStaffLocations(staff.locations || []);
    setEditingAnesStaffRole(staff.role || 'VIEWER');
  };

  // --- Anesthesia Schedule Management ---
  const [selectedAnesCell, setSelectedAnesCell] = useState<{ userId: string; date: string } | null>(null);
  const [editingAnesShiftStation, setEditingAnesShiftStation] = useState('');
  const [editingAnesShiftLocation, setEditingAnesShiftLocation] = useState('');
  const [editingAnesShiftTask, setEditingAnesShiftTask] = useState('');

  const handleUpdateAnesShift = async (userId: string, date: string, station: string, location?: string, task?: string) => {
    if (isAnesReadOnly) return;
    try {
        await db.assignAnesthesiaShift(userId, date, station, location, task);
    } catch (err) {
        console.error('[HealthMgmtPage] handleUpdateAnesShift failed:', err);
        alert(`麻護排班更新失敗: ${err instanceof Error ? err.message : JSON.stringify(err)}`);
    }
  };

  const handleAnesCellClick = async (userId: string, date: string, currentSectionLoc: string) => {
    if (isAnesReadOnly) return;
    
      try {
          if (isAnesQuickScheduleMode) {
              // Quick apply
              // Use quickScheduleStation or quickScheduleTask or quickScheduleLocation
              const staff = anesthesiaStaff.find(s => s.id === userId);
              let targetLocation = quickAnesLocation;
              
              // If no manual location selected in toolbar, use staff's home base if it's a "麻" shift
              if (!targetLocation && quickAnesStation === '麻') {
                  if (staff?.locations && staff.locations.length > 0) {
                       targetLocation = staff.locations[0]; // Primary location
                  } else {
                       targetLocation = currentSectionLoc;
                  }
              }

              // If station is Off or V, force location to be empty
              if (quickAnesStation === '休' || quickAnesStation === 'V') {
                  targetLocation = '';
              }
              
              await handleUpdateAnesShift(userId, date, quickAnesStation, targetLocation, '');
              return;
          }

          setSelectedAnesCell({ userId, date });
          const existing = anesthesiaShifts.find(s => s.userId === userId && s.date === date);
          if (existing) {
              setEditingAnesShiftStation(existing.station);
              setEditingAnesShiftLocation(existing.location || '');
              setEditingAnesShiftTask(existing.task || '');
          } else {
              setEditingAnesShiftStation('');
              setEditingAnesShiftLocation('');
              setEditingAnesShiftTask('');
          }
      } catch (err) {
          console.error('[HealthMgmtPage] handleAnesCellClick failed:', err);
          alert(`麻護排班點擊失敗: ${err instanceof Error ? err.message : JSON.stringify(err)}`);
      }
  };

  const handleSaveAnesPopup = async () => {
    if (!selectedAnesCell) return;
    await handleUpdateAnesShift(selectedAnesCell.userId, selectedAnesCell.date, editingAnesShiftStation, editingAnesShiftLocation, editingAnesShiftTask);
    setSelectedAnesCell(null);
  };

  const handleExportAnesthesiaPDF = async () => {
    try {
        const doc = new jsPDF('l', 'mm', 'a4');
        const fontName = await loadChineseFontToDoc(doc);
        
        const title = '麻護人員排班表';
        const subtitle = `${dateRange[0]} ~ ${dateRange[dateRange.length - 1]}`;
        const exportDate = `匯出日期: ${new Date().toLocaleDateString('zh-TW')}`;

        doc.setFont(fontName);
        doc.setFontSize(14);
        doc.text(title, 8, 10);
        doc.setFontSize(10);
        doc.text(subtitle, 8, 16);
        doc.text(exportDate, doc.internal.pageSize.width - 8, 16, { align: 'right' });

        const tableData: any[] = [];
        const tableHeaders = ['區域/人員', ...dateRange.map(d => {
            const dateObj = new Date(d);
            return {
                content: `${dateObj.getMonth() + 1}/${dateObj.getDate()}\n(${['日', '一', '二', '三', '四', '五', '六'][dateObj.getDay()]})`,
                styles: {
                    textColor: (dateObj.getDay() === 0 || dateObj.getDay() === 6 || holidays.some(h => h.date === d && (h.type === 'NATIONAL' || h.type === 'CLOSED'))) ? [255, 0, 0] : [255, 255, 255]
                }
            } as any;
        }), '休+V'];

        ['北投', '大直'].forEach(loc => {
            // Location Header Row
            tableData.push([
                { content: `${loc} 區`, colSpan: dateRange.length + 1, styles: { fillColor: [240, 240, 240], fontStyle: 'bold' } }
            ]);

            // GI Count Row
            const giRow = ['台數 (GI)'];
            dateRange.forEach(date => {
                const stats = db.settings.dailyStats?.[date];
                const count = loc === '北投' ? stats?.beitou_gi : stats?.dazhi_gi;
                giRow.push(count?.toString() || '-');
            });
            giRow.push(''); // Empty for 休+V column
            tableData.push(giRow);

            // Part-time Anesthesiologist Row
            const ptAnesRow = ['兼麻醫'];
            const ptAnesthesiologists = db.getDoctorShifts().filter(s => {
                if (s.location !== loc) return false;
                const doctor = db.getDoctors().find(d => d.id === s.doctorId);
                return doctor?.isPartTime && (s.scheduled_station || s.station || '').includes('麻');
            });
            dateRange.forEach(date => {
                const shift = ptAnesthesiologists.find(s => s.date === date);
                const doctor = shift ? db.getDoctors().find(d => d.id === shift.doctorId) : null;
                ptAnesRow.push(doctor?.alias || doctor?.name || '');
            });
            ptAnesRow.push(''); // Empty for 休+V column
            tableData.push(ptAnesRow);

            // Nurses Rows
            activeAnesthesiaStaff.filter(s => s.locations?.includes(loc)).forEach(staff => {
                const staffRow = [staff.name];
                dateRange.forEach(date => {
                    const shift = anesthesiaShifts.find(s => s.userId === staff.id && s.date === date && s.location === loc);
                    if (shift) {
                        let cellText = shift.station;
                        if (shift.task) cellText += `\n(${shift.task})`;
                        if (shift.location && shift.station !== '休' && shift.station !== 'V') cellText += `\n[${shift.location}]`;
                        staffRow.push(cellText);
                    } else {
                        staffRow.push('');
                    }
                });
                
                // Vacation Stats Column
                const vacCount = dateRange.filter(date => {
                    const s = anesthesiaShifts.find(sh => sh.userId === staff.id && sh.date === date && sh.location === loc);
                    return s && (s.station === '休' || s.station === 'V');
                }).length;
                staffRow.push(vacCount > 0 ? vacCount.toString() : '0');
                
                tableData.push(staffRow);
            });

            // Subtotal Row
            const subtotalRow = ['麻護人員 (小計)'];
            dateRange.forEach(date => {
                const dailyStaff = activeAnesthesiaStaff.filter(s => s.locations?.includes(loc));
                const count = dailyStaff.filter(staff => {
                    const s = anesthesiaShifts.find(sh => sh.userId === staff.id && sh.date === date && sh.location === loc);
                    return s && s.station && s.station !== '休' && s.station !== 'V';
                }).length;
                subtotalRow.push(count > 0 ? count.toString() : '-');
            });
            subtotalRow.push(''); // Empty for 休+V column
            tableData.push(subtotalRow);
        });

        autoTable(doc, {
            head: [tableHeaders],
            body: tableData,
            startY: 20,
            theme: 'grid',
            styles: { font: fontName, fontSize: 7, halign: 'center', valign: 'middle', overflow: 'linebreak' },
            headStyles: { fillColor: [45, 45, 45], textColor: [255, 255, 255], fontStyle: 'bold' },
            columnStyles: { 
                0: { fontStyle: 'bold', halign: 'left', cellWidth: 25 },
                [dateRange.length + 1]: { fontStyle: 'bold', fillColor: [249, 250, 251] } 
            },
            margin: { top: 10, left: 8, right: 8, bottom: 8 },
            didParseCell: (data) => {
                if (data.section === 'body') {
                    const cellValue = data.cell.text[0];
                    if (cellValue === '休' || cellValue === 'V' || (typeof cellValue === 'string' && (cellValue.startsWith('休') || cellValue.startsWith('V')))) {
                        data.cell.styles.textColor = [150, 150, 150];
                    }
                    if (data.row.raw[0] === '麻護人員 (小計)') {
                        data.cell.styles.fillColor = [240, 253, 250];
                        data.cell.styles.fontStyle = 'bold';
                    }
                }
            }
        });

        doc.save(`麻護排班表_${subtitle.replace(/ /g, '')}.pdf`);
    } catch (error) {
        console.error('PDF Export Error:', error);
        alert('匯出 PDF 失敗');
    }
  };

  return (
    <div className="p-2 w-full h-screen flex flex-col overflow-hidden bg-slate-50">
      <ConfirmModal
        isOpen={!!deleteTargetId}
        onClose={() => setDeleteTargetId(null)}
        onConfirm={handleDeleteStaff}
        title="確認停用健管人員"
        message="停用後該人員將不會出現在排班選單中，但歷史資料會保留。"
        confirmText="確認停用"
        confirmColor="red"
      />

      <div className="mb-2 flex flex-col md:flex-row md:items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <LayoutDashboard className="text-teal-600" size={24} />
            健管業務管理
            {(currentUser.role === UserRole.SYSTEM_ADMIN || currentUser.permissions?.includes(PERMISSIONS.EDIT_HEALTH_MGMT)) && 
             (!currentUser.healthMgmtLocation || currentUser.healthMgmtLocation === '全部') && (
                <select 
                    value={adminLocationView} 
                    onChange={e => setAdminLocationView(e.target.value as any)}
                    className="ml-2 text-sm font-bold bg-white border border-gray-200 text-teal-700 py-1 px-2 rounded-lg outline-none focus:ring-2 focus:ring-teal-500"
                >
                    <option value="全部">全部院區</option>
                    <option value="北投">北投專區</option>
                    <option value="大直">大直專區</option>
                </select>
            )}
            {(currentUserLocation !== '全部') && 
             !(
                 (currentUser.role === UserRole.SYSTEM_ADMIN || currentUser.permissions?.includes(PERMISSIONS.EDIT_HEALTH_MGMT)) && 
                 (!currentUser.healthMgmtLocation || currentUser.healthMgmtLocation === '全部')
             ) && (
                 <span className="ml-2 text-sm font-bold bg-teal-50 text-teal-700 py-1 px-2 rounded-lg border border-teal-100">
                    {currentUserLocation}專區
                 </span>
            )}
          </h2>
          <p className="text-sm text-gray-500">管理健管人員名單與每日排班</p>
        </div>
        
        <div className="flex bg-gray-100 p-1 rounded-xl w-fit">
          <button
            onClick={() => setActiveTab('schedule')}
            className={"px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 " + (
              activeTab === 'schedule' ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            )}
          >
            <Calendar size={16} /> 健管排班總覽
          </button>
          <button
            onClick={() => setActiveTab('stats')}
            className={"px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 " + (
              activeTab === 'stats' ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            )}
          >
            <BarChart3 size={16} /> 健管統計數據
          </button>
          <button
            onClick={() => setActiveTab('staff')}
            className={"px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 " + (
              activeTab === 'staff' ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            )}
          >
            <Users size={16} /> 健管人員管理
          </button>
          <button
            onClick={() => setActiveTab('anesthesia')}
            className={"px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 " + (
              activeTab === 'anesthesia' ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            )}
          >
            <Calendar size={16} /> 麻護排班
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto w-full pr-2 pb-20 custom-scrollbar">
        {activeTab === 'anesthesia' ? (
          <div className="flex flex-col gap-6">
          {/* Anesthesia Schedule Grid */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                <div className="flex flex-wrap items-center gap-3">
                    <h3 className="font-bold text-gray-700 flex items-center gap-2 text-sm whitespace-nowrap">
                        <Calendar size={18} className="text-teal-600" />
                        麻護排班表
                    </h3>
                    
                    <div className="flex items-center gap-2">
                        {/* Navigation Arrows & Label */}
                        <div className="flex items-center gap-0 bg-white rounded border shadow-sm overflow-hidden scale-90 origin-left">
                            <button onClick={() => {
                                if (selectedCycleId === 'month') {
                                    const prev = new Date(currentDate);
                                    prev.setMonth(prev.getMonth() - 1);
                                    setCurrentDate(prev);
                                } else {
                                    const idx = filteredHmCycles.findIndex(c => c.id === selectedCycleId);
                                    if (idx < filteredHmCycles.length - 1 && idx !== -1) setSelectedCycleId(filteredHmCycles[idx+1].id);
                                }
                            }} className="p-1.5 hover:bg-slate-50 text-gray-600 border-r border-gray-200 transition-colors">
                                <ChevronLeft size={18} />
                            </button>
                            <span className="px-3 font-mono font-bold text-gray-700 min-w-[120px] text-center bg-white py-1 flex items-center justify-center gap-1 text-sm">
                                {selectedCycleId === 'month' 
                                    ? `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`
                                    : currentCycle?.name || '週期檢視'
                                }
                            </span>
                            <button onClick={() => {
                                if (selectedCycleId === 'month') {
                                    const next = new Date(currentDate);
                                    next.setMonth(next.getMonth() + 1);
                                    setCurrentDate(next);
                                } else {
                                    const idx = filteredHmCycles.findIndex(c => c.id === selectedCycleId);
                                    if (idx > 0) setSelectedCycleId(filteredHmCycles[idx-1].id);
                                }
                            }} className="p-1.5 hover:bg-slate-50 text-gray-600 border-l border-gray-200 transition-colors">
                                <ChevronRight size={18} />
                            </button>
                        </div>

                        {/* Cycle Dropdown */}
                        <div className="flex items-center gap-1.5 bg-white p-1 rounded border shadow-sm px-2 text-sm scale-90 origin-left">
                          <select 
                            className="font-bold text-gray-700 bg-transparent border-none outline-none focus:ring-0 cursor-pointer"
                            onChange={(e) => setSelectedCycleId(e.target.value)}
                            value={selectedCycleId}
                          >
                            <option value="month">按月份檢視</option>
                            <optgroup label="自定義週期">
                              {filteredHmCycles.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </optgroup>
                          </select>
                        </div>

                        <button 
                            onClick={() => {
                                const todayStr = toLocalISOString(new Date());
                                const cycle = hmCycles.find(c => todayStr >= c.startDate && todayStr <= c.endDate);
                                if (cycle) {
                                  setSelectedCycleId(cycle.id);
                                } else {
                                  setCurrentDate(new Date());
                                  setSelectedCycleId('month');
                                }
                            }}
                            className="px-3 py-1 font-bold text-teal-600 bg-white border border-teal-100 rounded hover:bg-teal-50 transition-all shadow-sm scale-90 origin-left text-sm"
                        >
                            今天
                        </button>
                    </div>

                    {!isAnesReadOnly && (
                        <div className="flex items-center gap-2 pl-3 border-l border-gray-200 ml-1">
                            <button
                                onClick={() => setIsAnesQuickScheduleMode(!isAnesQuickScheduleMode)}
                                className={"px-3 py-1 rounded font-bold transition-all flex items-center gap-1.5 text-sm " + (isAnesQuickScheduleMode ? 'bg-indigo-600 text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200')}
                            >
                                <Zap size={12} /> 快速排班 {isAnesQuickScheduleMode ? 'ON' : 'OFF'}
                            </button>
                            
                            {isAnesQuickScheduleMode && (
                                <div className="flex items-center gap-1 animate-in slide-in-from-left-2 duration-200 scale-95 origin-left">
                                    {['休', 'V', '麻', '清除'].map(st => (
                                        <button
                                            key={st}
                                            onClick={() => {
                                                const newSt = st === quickAnesStation ? '' : st;
                                                setQuickAnesStation(newSt);
                                                // Default logic: If Off or V, clear location
                                                if (newSt === '休' || newSt === 'V' || newSt === '清除') {
                                                    setQuickAnesLocation('');
                                                }
                                            }}
                                            className={"px-3 py-1.5 rounded-lg text-xs font-bold border transition-all " + (
                                                quickAnesStation === st 
                                                    ? st === '清除' ? 'bg-red-600 text-white border-red-700 shadow-sm' : 'bg-teal-600 text-white border-teal-700 shadow-sm'
                                                    : st === '清除' ? 'bg-white text-red-600 border-red-200 hover:bg-red-50' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                                            )}
                                        >
                                            {st}
                                        </button>
                                    ))}

                                    <div className="h-6 w-px bg-gray-200 mx-1" />

                                    {LOCATIONS.map(loc => (
                                        <button
                                            key={loc}
                                            disabled={quickAnesStation === '休' || quickAnesStation === 'V' || quickAnesStation === '清除'}
                                            onClick={() => setQuickAnesLocation(loc === quickAnesLocation ? '' : loc)}
                                            className={"px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all disabled:opacity-30 disabled:cursor-not-allowed " + (
                                                quickAnesLocation === loc 
                                                    ? 'bg-slate-700 text-white border-slate-800 shadow-sm' 
                                                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                            )}
                                        >
                                            {loc}
                                        </button>
                                    ))}
                                    {quickAnesStation && (
                                        <span className="ml-2 text-[10px] text-indigo-600 font-bold animate-pulse whitespace-nowrap">
                                            {quickAnesStation === '清除' ? '← 點擊格子清除' : `← 套用「${quickAnesStation}」`}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={handleExportAnesthesiaPDF}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors"
                    >
                        <Download size={14} /> 匯出 PDF
                    </button>
                    <button
                        onClick={handleExportStats}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors"
                    >
                        <FileSpreadsheet size={14} /> 匯出 Excel
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-auto relative border-t border-gray-100">
                <table className="min-w-full text-[10px] border-collapse">
                    <thead className="sticky top-0 z-40">
                        <tr className="bg-slate-50 text-slate-500">
                            <th className="p-1.5 text-left border-r border-b sticky left-0 bg-slate-50 z-50 w-[80px] shadow-[1px_0_0_0_#e2e8f0]">區域 / 人員</th>
                            {dateRange.map(date => {
                                const d = new Date(date);
                                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                                const holiday = holidays.find(h => h.date === date && (h.type === 'NATIONAL' || h.type === 'CLOSED'));
                                return (
                                    <th key={date} className={`px-0 py-0.5 border-r border-b text-center min-w-[36px] ${isWeekend || holiday ? 'bg-red-50/50 text-red-600' : ''}`}>
                                        <div className="font-bold text-[10px] leading-tight">{d.getMonth() + 1}/{d.getDate()}</div>
                                        <div className="text-[9px] opacity-70 leading-none">{['日', '一', '二', '三', '四', '五', '六'][d.getDay()]}</div>
                                    </th>
                                );
                            })}
                            <th className="p-1.5 text-center border-r border-b sticky right-0 bg-slate-50 z-50 w-[45px] shadow-[-1px_0_0_0_#e2e8f0]">休+V</th>
                        </tr>
                    </thead>
                    <tbody>
                        {['北投', '大直'].map(loc => {
                            // Find part-time anesthesiologists for this location
                            const ptAnesthesiologists = db.getDoctorShifts().filter(s => {
                                if (s.location !== loc) return false;
                                const doctor = db.getDoctors().find(d => d.id === s.doctorId);
                                if (!doctor?.isPartTime) return false;
                                // Check if station contains 麻
                                return (s.scheduled_station || s.station || '').includes('麻');
                            });

                            return (
                                <React.Fragment key={loc}>
                                    <tr className="bg-slate-100/50 h-5">
                                        <td colSpan={dateRange.length + 2} className="px-2 py-0.5 font-black text-slate-700 border-b uppercase tracking-wider text-[9px]">{loc} 區</td>
                                    </tr>
                                    {/* GI 台數 Row (FIRST) */}
                                    <tr className="bg-slate-50/50 h-7">
                                        <td className="px-2 border-r border-b sticky left-0 bg-slate-50 z-30 font-bold text-slate-500 shadow-[1px_0_0_0_#e2e8f0]">台數 (GI)</td>
                                        {dateRange.map(date => {
                                            const stats = db.settings.dailyStats?.[date];
                                            const giCount = loc === '北投' ? stats?.beitou_gi : stats?.dazhi_gi;
                                            return (
                                                <td key={date} className="p-0 border-r border-b text-center text-slate-600 font-bold leading-tight">
                                                    {giCount || '-'}
                                                </td>
                                            );
                                        })}
                                        <td className="border-b sticky right-0 bg-slate-50/50 z-30 shadow-[-1px_0_0_0_#e2e8f0]"></td>
                                    </tr>
                                    {/* 兼麻醫 Row (SECOND) */}
                                    <tr className="bg-amber-50/30 font-medium h-7">
                                        <td className="px-2 border-r border-b sticky left-0 bg-[#fefce8] z-30 font-bold text-amber-700 shadow-[1px_0_0_0_#e2e8f0]">兼麻醫</td>
                                        {dateRange.map(date => {
                                            const shift = ptAnesthesiologists.find(s => s.date === date);
                                            const doctor = shift ? db.getDoctors().find(d => d.id === shift.doctorId) : null;
                                            return (
                                                <td key={date} className="p-0 border-r border-b text-center text-amber-800 font-medium leading-tight">
                                                    {doctor?.alias || doctor?.name || ''}
                                                </td>
                                            );
                                        })}
                                        <td className="border-b sticky right-0 bg-[#fefce8] z-30 shadow-[-1px_0_0_0_#e2e8f0]"></td>
                                    </tr>
                                    {/* Anesthesia Staff Rows */}
                                    {activeAnesthesiaStaff.filter(s => s.locations?.includes(loc)).map(staff => (
                                        <tr key={`${loc}-${staff.id}`} className="hover:bg-slate-50 transition-colors h-8">
                                            <td className="px-2 border-r border-b sticky left-0 bg-white z-30 font-bold text-slate-700 shadow-[1px_0_0_0_#e2e8f0] truncate">{staff.name}</td>
                                            {dateRange.map(date => {
                                                const shift = anesthesiaShifts.find(s => s.userId === staff.id && s.date === date && s.location === loc);
                                                return (
                                                    <td 
                                                        key={date} 
                                                        onClick={() => handleAnesCellClick(staff.id, date, loc)}
                                                        className={`p-0 border-r border-b text-center cursor-pointer hover:bg-teal-50/50 transition-all ${shift ? 'bg-teal-50/20' : ''}`}
                                                    >
                                                        {shift ? (
                                                            <div className="flex flex-col items-center justify-center h-full gap-0 px-0.5">
                                                                <span className={`font-bold leading-none ${(shift.station === '休' || shift.station === 'V') ? 'text-slate-400' : 'text-teal-700'}`}>
                                                                    {shift.station}
                                                                </span>
                                                                {shift.task && <span className={`text-[8px] leading-tight opacity-80 truncate w-full ${(shift.station === '休' || shift.station === 'V') ? 'text-slate-400' : 'text-teal-600'}`}>{shift.task}</span>}
                                                                {shift.location && shift.station !== '休' && shift.station !== 'V' && (
                                                                    <span className={`text-[9px] leading-none mt-1 opacity-95 px-1.5 py-0.5 rounded truncate font-black shadow-sm ${shift.location === '大直' ? 'bg-red-600 text-white' : 'bg-slate-600 text-white'}`}>
                                                                        {shift.location}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <div className="h-full w-full opacity-0 hover:opacity-10 dark:hover:opacity-20 flex items-center justify-center">+</div>
                                                        )}
                                                    </td>
                                                );
                                            })}
                                            <td className="border-b sticky right-0 bg-white z-30 font-bold text-center text-slate-500 shadow-[-1px_0_0_0_#e2e8f0]">
                                                {dateRange.filter(date => {
                                                    const s = anesthesiaShifts.find(sh => sh.userId === staff.id && sh.date === date && sh.location === loc);
                                                    return s && (s.station === '休' || s.station === 'V');
                                                }).length || '0'}
                                            </td>
                                        </tr>
                                    ))}
                                    {/* 麻護小計 Row */}
                                    <tr className="bg-teal-100/30 font-bold border-t border-teal-100 h-7 text-[10px]">
                                        <td className="px-2 border-r border-b sticky left-0 bg-[#f0fdfa] z-30 text-teal-800 shadow-[1px_0_0_0_#e2e8f0]">麻護 (小計)</td>
                                        {dateRange.map(date => {
                                            const dailyStaff = activeAnesthesiaStaff.filter(s => s.locations?.includes(loc));
                                            const scheduledCount = dailyStaff.filter(staff => {
                                                const s = anesthesiaShifts.find(sh => sh.userId === staff.id && sh.date === date && sh.location === loc);
                                                return s && s.station && s.station !== '休' && s.station !== 'V';
                                            }).length;
                                            return (
                                                <td key={date} className="p-0 border-r border-b text-center text-teal-900 bg-teal-50/20 leading-tight">
                                                    {scheduledCount || '-'}
                                                </td>
                                            );
                                        })}
                                        <td className="border-b sticky right-0 bg-[#f0fdfa] z-30 shadow-[-1px_0_0_0_#e2e8f0]"></td>
                                    </tr>
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>
          </div>

          {/* Anesthesia Staff Management Section (Optional/Collapsible or inline) */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden p-6 transition-all">
            <div 
              className="flex justify-between items-center cursor-pointer group"
              onClick={() => setIsAnesStaffManagementExpanded(!isAnesStaffManagementExpanded)}
            >
              <h3 className="font-bold text-gray-700 flex items-center gap-2 group-hover:text-teal-600 transition-colors">
                <Users size={18} className="text-teal-600" />
                麻護人員管理
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-medium">
                    {isAnesStaffManagementExpanded ? '收起' : '展開編輯'}
                </span>
                {isAnesStaffManagementExpanded ? <ChevronUp size={20} className="text-slate-400" /> : <ChevronDown size={20} className="text-slate-400" />}
              </div>
            </div>
            {/* Anesthesia Staff Management Component */}
            {isAnesStaffManagementExpanded && (
                <div className="mt-6 animate-in slide-in-from-top-2 duration-300">
                    {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm font-bold">{error}</div>}
                    
                    <form onSubmit={editingAnesId ? updateAnesthesiaStaff : addAnesthesiaStaff} className="flex flex-wrap gap-4 items-end mb-6 bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <div className="flex-[1.5] flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-teal-600 uppercase pl-1">姓名</label>
                            <input
                                type="text"
                                value={editingAnesId ? editingAnesName : newAnesStaffName}
                                onChange={e => editingAnesId ? setEditingAnesName(e.target.value) : setNewAnesStaffName(e.target.value)}
                                placeholder="姓名 (例: 麻護1)"
                                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none bg-white"
                            />
                        </div>
                        <div className="flex-1 flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-teal-600 uppercase pl-1">簡稱</label>
                            <input
                                type="text"
                                value={editingAnesId ? editingAnesAlias : newAnesStaffAlias}
                                onChange={e => editingAnesId ? setEditingAnesAlias(e.target.value) : setNewAnesStaffAlias(e.target.value)}
                                placeholder="簡稱 (例: 麻1)"
                                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none bg-white"
                            />
                        </div>
                        <div className="flex-1 flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-teal-600 uppercase pl-1">權限</label>
                            <select
                                value={editingAnesId ? editingAnesStaffRole : newAnesStaffRole}
                                onChange={e => editingAnesId ? setEditingAnesStaffRole(e.target.value as any) : setNewAnesStaffRole(e.target.value as any)}
                                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none bg-white font-bold"
                            >
                                <option value="VIEWER">僅查看</option>
                                <option value="ADMIN">可管理</option>
                            </select>
                        </div>
                        <div className="flex-[1.5] flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-teal-600 uppercase pl-1">工作地點</label>
                            <div className="flex gap-4 px-2 py-2">
                                {['北投', '大直'].map(loc => (
                                    <label key={loc} className="flex items-center gap-2 cursor-pointer">
                                        <input 
                                            type="checkbox"
                                            checked={editingAnesId ? editingAnesStaffLocations.includes(loc) : newAnesStaffLocations.includes(loc)}
                                            onChange={(e) => {
                                                const list = editingAnesId ? editingAnesStaffLocations : newAnesStaffLocations;
                                                const newList = e.target.checked 
                                                    ? [...list, loc]
                                                    : list.filter(l => l !== loc);
                                                editingAnesId ? setEditingAnesStaffLocations(newList) : setNewAnesStaffLocations(newList);
                                            }}
                                            className="w-4 h-4 text-teal-600 rounded border-gray-300 focus:ring-teal-500"
                                        />
                                        <span className="text-sm font-bold text-slate-600">{loc}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button
                                type="submit"
                                disabled={isSaving || isAnesReadOnly || (editingAnesId ? editingAnesStaffLocations.length === 0 : newAnesStaffLocations.length === 0)}
                                className="whitespace-nowrap bg-teal-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-teal-700 transition-colors disabled:opacity-50 h-[42px]"
                            >
                                {editingAnesId ? '儲存更新' : '新增人員'}
                            </button>
                            {editingAnesId && (
                                <button 
                                    type="button" 
                                    onClick={() => { setEditingAnesId(null); setEditingAnesName(''); setEditingAnesAlias(''); setEditingAnesStaffLocations([]); setEditingAnesStaffRole('VIEWER'); }}
                                    className="px-4 py-2 text-slate-500 hover:bg-slate-200 rounded-lg font-bold transition-colors h-[42px]"
                                >
                                    取消
                                </button>
                            )}
                        </div>
                    </form>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {activeAnesthesiaStaff.map(as => (
                            <div key={as.id} className="flex justify-between items-center p-4 border border-slate-100 rounded-xl hover:bg-slate-50 transition-colors bg-white shadow-sm">
                                <div className="flex flex-col gap-0.5">
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-slate-700">{as.name}</span>
                                        {as.alias && <span className="text-xs text-slate-400">({as.alias})</span>}
                                        {as.role === 'ADMIN' && <span className="text-[10px] font-bold px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded border border-indigo-100">管理</span>}
                                    </div>
                                    <div className="flex gap-1">
                                        {as.locations?.map(l => (
                                            <span key={l} className="text-[9px] font-bold px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded">{l}</span>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {!isAnesReadOnly && (
                                        <>
                                            <button 
                                                onClick={() => handleEditAnesStaff(as)}
                                                className="p-2 text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                                                title="編輯"
                                            >
                                                <Users size={16} />
                                            </button>
                                            <button 
                                                onClick={() => setDeleteTargetId(as.id)}
                                                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                title="停用"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
          </div>

          {/* Anesthesia Inline Popup */}
          {selectedAnesCell && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-teal-50 to-white">
                    <div>
                        <h4 className="text-xl font-black text-slate-800">編輯麻護排班</h4>
                        <p className="text-xs text-slate-500 font-bold mt-1">
                            {anesthesiaStaff.find(s => s.id === selectedAnesCell.userId)?.name} - {selectedAnesCell.date}
                        </p>
                    </div>
                    <button onClick={() => setSelectedAnesCell(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400"><X size={20} /></button>
                </div>
                <div className="p-6 space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase px-1">區域</label>
                        <div className="grid grid-cols-2 gap-2">
                            {['北投', '大直'].map(loc => (
                                <button
                                    key={loc}
                                    onClick={() => setEditingAnesShiftLocation(loc)}
                                    className={`py-2 px-4 rounded-xl text-sm font-bold border-2 transition-all ${editingAnesShiftLocation === loc ? 'border-teal-600 bg-teal-50 text-teal-700 shadow-sm' : 'border-slate-100 text-slate-400 hover:border-slate-200'}`}
                                >
                                    {loc}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase px-1">崗位 (主控/輔控等)</label>
                        <input
                            type="text"
                            value={editingAnesShiftStation}
                            onChange={e => setEditingAnesShiftStation(e.target.value)}
                            placeholder="例: 主控"
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-teal-500 outline-none transition-all"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase px-1">備註 / 任務</label>
                        <input
                            type="text"
                            value={editingAnesShiftTask}
                            onChange={e => setEditingAnesShiftTask(e.target.value)}
                            placeholder="自訂任務"
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-teal-500 outline-none transition-all"
                        />
                    </div>
                    <div className="pt-2">
                        <button 
                            onClick={handleSaveAnesPopup}
                            className="w-full bg-teal-600 text-white font-black py-4 rounded-2xl hover:bg-teal-700 transition-all shadow-lg active:scale-[0.98]"
                        >
                            確認儲存
                        </button>
                    </div>
                    {editingAnesShiftStation && (
                        <button 
                            onClick={() => { setEditingAnesShiftStation(''); handleSaveAnesPopup(); }}
                            className="w-full text-red-500 text-sm font-bold py-2 hover:bg-red-50 rounded-lg transition-colors"
                        >
                            清除排班
                        </button>
                    )}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : activeTab === 'schedule' ? (
        <>
          <div className="mb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-white p-1 rounded border shadow-sm scale-90 origin-left">
                <button onClick={() => {
                  if (selectedCycleId === 'month') {
                    const prev = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
                    setCurrentDate(prev);
                  } else {
                    const idx = filteredHmCycles.findIndex(c => c.id === selectedCycleId);
                    if (idx < filteredHmCycles.length - 1 && idx !== -1) setSelectedCycleId(filteredHmCycles[idx+1].id);
                  }
                }} className="p-1.5 hover:bg-gray-50 rounded text-gray-500 transition-colors border-r">
                   <ChevronLeft size={18} />
                </button>
                <div className="px-4 py-1 text-sm font-bold text-gray-700 min-w-[150px] text-center">
                  {selectedCycleId === 'month' 
                    ? `${currentDate.getFullYear()} 年 ${currentDate.getMonth() + 1} 月`
                    : currentCycle?.name || '週期檢視'
                  }
                </div>
                <button onClick={() => {
                  if (selectedCycleId === 'month') {
                    const next = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
                    setCurrentDate(next);
                  } else {
                    const idx = filteredHmCycles.findIndex(c => c.id === selectedCycleId);
                    if (idx > 0) setSelectedCycleId(filteredHmCycles[idx-1].id);
                  }
                }} className="p-1.5 hover:bg-gray-50 rounded text-gray-500 transition-colors border-l">
                  <ChevronRight size={18} />
                </button>
              </div>

              <div className="flex flex-col md:flex-row md:items-center gap-2">
                <div className="flex items-center gap-2 bg-white p-1 rounded border shadow-sm px-3 h-[36px] scale-90 origin-left">
                  <Calendar size={16} className="text-teal-600" />
                  <select 
                    className="text-sm font-bold text-gray-700 bg-transparent border-none outline-none focus:ring-0 cursor-pointer"
                    onChange={(e) => setSelectedCycleId(e.target.value)}
                    value={selectedCycleId}
                  >
                    <option value="month">按月份檢視</option>
                    <optgroup label="自定義週期">
                      {filteredHmCycles.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </optgroup>
                  </select>
                </div>

                {/* Cycle Meta Info */}
                <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 border border-emerald-100 rounded h-[36px] scale-90 origin-left">
                  <Search size={14} className="text-emerald-500" />
                  <span className="text-xs font-medium text-emerald-800 whitespace-nowrap">
                    {dateRange[0]} ~ {dateRange[dateRange.length - 1]} 
                    <span className="mx-2 text-emerald-300">|</span>
                    共 {dateRange.length} 天
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Schedule Toolbar */}
            {!isHmReadOnly && (
                <div className="flex flex-wrap items-center gap-2 bg-white p-2 rounded-xl shadow-sm border border-gray-200">
                    <button
                        onClick={() => setIsQuickScheduleMode(!isQuickScheduleMode)}
                        className={"px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 " + (isQuickScheduleMode ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50')}
                        title="開啟後，點擊格子可快速填寫所選任務"
                    >
                        快速排班 {isQuickScheduleMode ? 'ON' : 'OFF'}
                    </button>
                    
                    {isQuickScheduleMode && (
                        <div className="flex flex-col gap-2 pl-2 border-l border-gray-200 overflow-x-auto max-w-[800px] no-scrollbar">
                            <div className="flex items-center gap-1">
                                <span className="text-[10px] text-gray-400 font-bold mr-2 whitespace-nowrap">崗位：</span>
                                {[...hmStations, '清除'].map(st => (
                                    <button
                                        key={st}
                                        onClick={() => {
                                            if (st === '清除') {
                                                setQuickScheduleStation('');
                                                setQuickScheduleTask('');
                                            } else {
                                                setQuickScheduleStation(st);
                                            }
                                        }}
                                        className={"px-2 py-0.5 rounded text-[10px] font-bold transition-colors border whitespace-nowrap " + (quickScheduleStation === st || (st === '清除' && !quickScheduleStation && !quickScheduleTask)
                                                ? st === '清除' ? 'bg-red-100 text-red-700 border-red-200' : 'bg-teal-600 text-white border-teal-700'
                                                : st === '清除' ? 'bg-white text-red-600 border-red-200 hover:bg-red-50' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                                        )}
                                    >
                                        {st}
                                    </button>
                                ))}
                            </div>
                            <div className="flex items-center gap-1">
                                <span className="text-[10px] text-gray-400 font-bold mr-2 whitespace-nowrap">任務：</span>
                                {hmTasks.map(tk => (
                                    <button
                                        key={tk}
                                        onClick={() => setQuickScheduleTask(tk === quickScheduleTask ? '' : tk)}
                                        className={"px-2 py-0.5 rounded text-[10px] font-bold transition-colors border whitespace-nowrap " + (quickScheduleTask === tk 
                                                ? 'bg-indigo-600 text-white border-indigo-700'
                                                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                                        )}
                                    >
                                        {tk}
                                    </button>
                                ))}
                            </div>
                            <div className="flex items-center gap-1">
                                <span className="text-[10px] text-gray-400 font-bold mr-2 whitespace-nowrap">地點：</span>
                                {LOCATIONS.map(loc => (
                                    <button
                                        key={loc}
                                        onClick={() => setQuickScheduleLocation(loc === quickScheduleLocation ? '' : loc)}
                                        className={"px-2 py-0.5 rounded text-[10px] font-bold transition-colors border whitespace-nowrap " + (quickScheduleLocation === loc 
                                                ? 'bg-slate-800 text-white border-slate-900'
                                                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                                        )}
                                    >
                                        {loc}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            <div className="flex bg-teal-50 rounded-lg p-0.5 border border-teal-100 items-center h-[34px]">
                <button 
                    onClick={handleExportSchedulePDF}
                    className="px-3 py-1 hover:bg-white rounded-md text-xs font-bold text-teal-700 flex items-center gap-1 transition-all"
                >
                    <Download size={14} /> PDF
                </button>
                <div className="w-[1px] h-3 bg-teal-200 mx-1"></div>
                <button 
                    onClick={handleExportScheduleExcel}
                    className="px-3 py-1 hover:bg-white rounded-md text-xs font-bold text-emerald-700 flex items-center gap-1 transition-all"
                >
                    <FileSpreadsheet size={14} /> Excel
                </button>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm inline-block min-w-full">
            <table className="text-sm border-collapse w-auto">
              <thead className="relative z-50">
                <tr className="bg-slate-50 backdrop-blur border-b border-slate-200">
                  <th className="p-3 text-left font-bold text-slate-600 w-32 sticky left-0 top-0 bg-slate-50 backdrop-blur z-50 border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">人員 (天數)</th>
                  {dateRange.map(date => {
                      const d = new Date(date);
                      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                      const isToday = date === toLocalISOString(new Date());

                      return (
                          <th 
                              key={date} 
                              className={"px-0.5 py-0.5 text-center border-r border-slate-100 min-w-[40px] sticky top-0 z-50 " + (isToday ? 'bg-teal-50' : (isWeekend ? 'bg-red-50' : 'bg-white')) + " border-b border-slate-200"}
                          >
                              <div className={"font-bold text-[11px] leading-tight " + (isToday ? 'text-teal-600' : (isWeekend ? 'text-red-500' : 'text-slate-800'))}>{d.getMonth() + 1}/{d.getDate()}</div>
                              <div className={"text-[10px] opacity-75 leading-tight " + (isToday ? 'text-teal-600' : (isWeekend ? 'text-red-500' : 'text-slate-700'))}>
                                  {['日', '一', '二', '三', '四', '五', '六'][d.getDay()]}
                              </div>
                          </th>
                      );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeHealthMgmtStaff.map(staff => (
                  <tr key={staff.id} className="group hover:bg-slate-50/50 transition-colors">
                    <td className="p-0 border-r border-slate-200 sticky left-0 bg-white z-30 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                        <div className="p-3 font-bold text-slate-800 flex items-center min-w-[128px]">
                            {staff.name}
                            <span className="ml-2 text-xs text-gray-400 font-normal whitespace-nowrap">
                                ({shifts.filter(s => s.userId === staff.id && dateRange.includes(s.date) && (s.station || s.task)).length})
                            </span>
                        </div>
                    </td>
                    {dateRange.map(date => {
                        const shift = shifts.find(s => s.userId === staff.id && s.date === date);
                        const hasContent = shift && (shift.station || shift.task);
                        
                        let time = '';
                        let displayStation = '';
                        let displayTask = shift?.task || '';

                        if (shift?.station) {
                            const parts = shift.station.split(' ');
                            if (parts.length > 1 && parts[0].includes(':')) {
                                time = parts[0];
                                displayStation = parts.slice(1).join(' ');
                            } else {
                                displayStation = shift.station;
                            }
                        }

                        // Determine cell style like PhysicianSchedulePage
                        let cellBg = 'hover:bg-gray-50';
                        if (isQuickScheduleMode) {
                            cellBg = (quickScheduleStation || quickScheduleTask) ? 'hover:bg-indigo-50' : 'hover:bg-red-50';
                        } else if (hasContent) {
                            if (shift.location === '大直') cellBg = 'bg-red-50 hover:bg-red-100';
                            else if (displayStation.includes('行政')) cellBg = 'bg-white hover:bg-gray-50';
                            else if (displayTask.includes('主控') || displayStation.includes('主控')) cellBg = 'bg-teal-100 hover:bg-teal-200';
                            else if (displayTask.includes('排班') || displayStation.includes('排班')) cellBg = 'bg-blue-100 hover:bg-blue-200';
                            else if (displayTask.includes('晚班') || displayStation.includes('晚班')) cellBg = 'bg-[#D7CCC8] hover:bg-[#BCAAA4]';
                            else if (displayTask.includes('call') || displayStation.includes('call')) cellBg = 'bg-yellow-100 hover:bg-yellow-200';
                            else cellBg = 'bg-teal-50 hover:bg-teal-100'; // Default assigned
                        }

                        return (
                          <td 
                            key={date} 
                            onClick={() => handleCellClick(staff.id, date)}
                            className={"p-1 border-r border-gray-100 h-16 transition-colors text-center " + (!isHmReadOnly ? 'cursor-pointer' : 'cursor-default') + " " + cellBg}
                          >
                             {hasContent ? (
                                <div className="h-full w-full flex flex-col items-center justify-center p-0 overflow-hidden">
                                     <div className="flex flex-col items-center justify-center space-y-0.5 w-full" style={{ transform: 'scale(0.95)', transformOrigin: 'center center' }}>
                                         <span className={"font-bold block text-sm leading-tight text-center " + (shift.location === '大直' ? 'text-red-700' : (displayTask.includes('晚班') || displayTask.includes('主控') ? 'text-teal-800' : 'text-slate-700'))}>
                                             {displayStation}
                                         </span>
                                         {displayTask && (
                                             <span className={"text-[10px] font-bold px-1 rounded whitespace-nowrap " + (shift.location === '大直' ? 'text-red-800 bg-red-100' : 'text-indigo-600 bg-indigo-50')}>
                                                 {displayTask}
                                             </span>
                                         )}
                                         {shift.location && (
                                             <span className={"text-[10px] font-bold px-1 rounded whitespace-nowrap mt-0.5 " + (shift.location === '大直' ? 'text-white bg-red-500' : 'text-slate-600 bg-slate-200/50')}>
                                                 {shift.location}
                                             </span>
                                         )}
                                         {time && (
                                            <span className="text-[10px] text-slate-500 leading-tight font-medium font-mono">
                                                {time.replace(/(\d{1,2}):(\d{2})/g, (match, h, m) => m === '00' ? String(parseInt(h)) : parseInt(h) + "'").replace(/\s/g, '')}
                                            </span>
                                         )}
                                     </div>
                                </div>
                             ) : (
                                <div className="h-full min-h-[44px] flex items-center justify-center text-gray-300">
                                    {isQuickScheduleMode && !isHmReadOnly ? (
                                         <div className="flex flex-col items-center scale-75 opacity-40">
                                             <span className="text-xs font-bold">{quickScheduleStation}</span>
                                             <span className="text-[10px] font-bold text-indigo-600">{quickScheduleTask}</span>
                                         </div>
                                    ) : null}
                                </div>
                             )}
                          </td>
                        );
                    })}
                  </tr>
                ))}
                {activeHealthMgmtStaff.length === 0 && (
                      <tr>
                          <td colSpan={dateRange.length + 1} className="p-8 text-center text-gray-400">目前沒有健管人員，請先至「健管人員管理」新增名單。</td>
                      </tr>
                  )}
              </tbody>
            </table>
          </div>
          
      {/* Inline Shift Edit Popup */}
      {selectedCell && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm border border-gray-100 animate-in zoom-in-95 duration-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center bg-teal-50/50">
              <div>
                  <h3 className="font-bold text-gray-800 text-lg">
                      分配任務 - {healthMgmtStaff.find(s => s.id === selectedCell.userId)?.name}
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
              <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-500 uppercase flex justify-between">
                      <span>崗位分配 (H, G, 櫃台...)</span>
                      {editingShiftTask && <span className="text-teal-600 cursor-pointer hover:underline" onClick={() => setEditingShiftTask('')}>清除</span>}
                  </label>
                  <div className="flex flex-wrap gap-1.5 p-1 max-h-[100px] overflow-y-auto">
                      {hmStations.map(st => (
                          <button
                              key={st}
                              onClick={() => setEditingShiftTask(st)}
                              className={"px-3 py-1.5 rounded-lg text-xs font-bold border transition-all " + (editingShiftTask === st ? 'bg-teal-500 text-white border-teal-600 shadow-sm' : 'bg-slate-50 text-gray-600 border-gray-200 hover:border-teal-300 hover:bg-white')}
                          >
                              {st}
                          </button>
                      ))}
                  </div>
              </div>

              <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-500 uppercase flex justify-between">
                      <span>業務任務 (主控, 輔控...)</span>
                      {editingShiftSubTask && <span className="text-indigo-600 cursor-pointer hover:underline" onClick={() => setEditingShiftSubTask('')}>清除</span>}
                  </label>
                  <div className="flex flex-wrap gap-1.5 p-1 max-h-[100px] overflow-y-auto">
                      {hmTasks.map(tk => (
                          <button
                              key={tk}
                              onClick={() => setEditingShiftSubTask(tk)}
                              className={"px-3 py-1.5 rounded-lg text-xs font-bold border transition-all " + (editingShiftSubTask === tk ? 'bg-indigo-500 text-white border-indigo-600 shadow-sm' : 'bg-slate-50 text-gray-600 border-gray-200 hover:border-indigo-300 hover:bg-white')}
                          >
                              {tk}
                          </button>
                      ))}
                  </div>
              </div>

              <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-500 uppercase flex justify-between">
                      <span>地點標記 (Location)</span>
                      {editingShiftLocation && <span className="text-indigo-600 cursor-pointer hover:underline" onClick={() => setEditingShiftLocation('')}>清除</span>}
                  </label>
                  <div className="flex flex-wrap gap-1.5 p-1 max-h-[100px] overflow-y-auto">
                      {LOCATIONS.map(loc => (
                          <button
                              key={loc}
                              onClick={() => setEditingShiftLocation(loc)}
                              className={"px-3 py-1.5 rounded-lg text-xs font-bold border transition-all " + (editingShiftLocation === loc ? 'bg-slate-800 text-white border-slate-900 shadow-sm' : 'bg-slate-50 text-gray-600 border-gray-200 hover:border-slate-400 hover:bg-white')}
                          >
                              {loc}
                          </button>
                      ))}
                  </div>
              </div>

              <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-500 uppercase">工作時段 (選填)</label>
                  <input
                      type="text"
                      value={editingShiftTime}
                      onChange={e => setEditingShiftTime(e.target.value)}
                      placeholder="例: 08:00-16:00"
                      className="w-full px-4 py-2 bg-slate-50 border border-gray-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-teal-500 outline-none transition-all"
                  />
              </div>

              <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-500 uppercase">自訂業務任務</label>
                  <input
                      type="text"
                      value={editingShiftCustomTask}
                      onChange={e => setEditingShiftCustomTask(e.target.value)}
                      placeholder="自訂任務名稱"
                      className="w-full px-4 py-2 bg-slate-50 border border-gray-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-teal-500 outline-none transition-all"
                  />
              </div>

              <div className="pt-2">
                  <button 
                      onClick={handleSavePopup}
                      className="w-full bg-teal-600 text-white font-bold py-3 rounded-xl hover:bg-teal-700 transition-colors shadow-sm"
                  >
                      確認儲存
                  </button>
              </div>
            </div>
          </div>
        </div>
      )}
        </>
      ) : activeTab === 'stats' ? (
        /* Statistics Tab */
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col h-fit p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-6 border-b border-slate-100">
                <div>
                   <h3 className="text-xl font-bold text-slate-800">健管統計</h3>
                   <div className="flex items-center gap-2 mt-1">
                      <div className="flex items-center gap-1.5 px-3 py-1 bg-teal-50 border border-teal-100 rounded-lg text-teal-700 text-xs font-bold">
                         <Calendar size={14} />
                         {selectedCycleId === 'month' 
                           ? `${currentDate.getFullYear()} 年 ${currentDate.getMonth() + 1} 月`
                           : currentCycle?.name || '週期統計'}
                      </div>
                      <div className="flex items-center gap-1 px-3 py-1 bg-slate-50 border border-slate-200 rounded-lg text-slate-500 text-xs font-medium">
                         {dateRange[0]} ~ {dateRange[dateRange.length - 1]} 
                         <span className="mx-1 opacity-30">|</span>
                         共 {dateRange.length} 天
                      </div>
                   </div>
                </div>
                <button
                    onClick={handleExportStats}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 shadow-sm transition-colors"
                >
                    <FileSpreadsheet size={16} /> 匯出 Excel
                </button>
            </div>
            
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-slate-50 text-slate-500 border-b border-slate-100">
                            <th className="p-4 text-left font-bold sticky left-0 bg-slate-50 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">姓名</th>
                            <th className="p-4 text-center font-bold text-teal-600">上班</th>
                            <th className="p-4 text-center font-bold text-blue-600">平日</th>
                            <th className="p-4 text-center font-bold text-red-600">假日</th>
                            <th className="p-4 text-center font-bold text-indigo-600">主控</th>
                            <th className="p-4 text-center font-bold text-indigo-600">輔控</th>
                            <th className="p-4 text-center font-bold text-indigo-600">晚班</th>
                            {hmStations.map(st => (
                                <th key={st} className="p-4 text-center font-bold">{st}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {stats.map(({ staff, counts, total, weekday, holidayCount, roleCounts }) => (
                            <tr key={staff.id} className="hover:bg-slate-50/50 transition-colors">
                                <td className="p-4 font-bold text-slate-700 sticky left-0 bg-white z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">{staff.name}</td>
                                <td className="p-4 text-center">
                                    <span className="font-extrabold text-teal-700 bg-teal-50 px-3 py-1.5 rounded-lg border border-teal-100">{total}</span>
                                </td>
                                <td className="p-4 text-center">
                                    <span className="font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md">{weekday}</span>
                                </td>
                                <td className="p-4 text-center font-bold text-red-600">
                                    {holidayCount > 0 ? holidayCount : '-'}
                                </td>
                                <td className="p-4 text-center font-bold text-slate-700">
                                    {roleCounts?.['主控'] || '-'}
                                </td>
                                <td className="p-4 text-center font-bold text-slate-700">
                                    {roleCounts?.['輔控'] || '-'}
                                </td>
                                <td className="p-4 text-center font-bold text-slate-700">
                                    {roleCounts?.['晚班'] || '-'}
                                </td>
                                {hmStations.map(st => (
                                    <td key={st} className="p-4 text-center text-slate-600">
                                        {counts[st] > 0 ? (
                                            <span className="font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md">{counts[st]}</span>
                                        ) : '-'}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
      ) : (
        /* Staff Management Tab */
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
            <h3 className="font-bold text-gray-700">健管人員名單</h3>
          </div>
          <div className="p-6">
              <form onSubmit={editingId ? updateStaff : addStaff} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 items-end mb-8 bg-gray-50 p-5 rounded-xl border border-gray-100">
                  <div className="flex flex-col gap-1 lg:col-span-2 xl:col-span-1">
                      <label className="text-[10px] font-bold text-teal-600 uppercase pl-1">姓名</label>
                      <input
                          type="text"
                          value={editingId ? editingStaffName : newStaffName}
                          onChange={e => editingId ? setEditingStaffName(e.target.value) : setNewStaffName(e.target.value)}
                          placeholder="姓名 (例: 健管1)"
                          className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
                      />
                  </div>
                  <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-teal-600 uppercase pl-1">簡稱</label>
                      <input
                          type="text"
                          value={editingId ? editingStaffAlias : newStaffAlias}
                          onChange={e => editingId ? setEditingStaffAlias(e.target.value) : setNewStaffAlias(e.target.value)}
                          placeholder="簡稱 (例: 健1)"
                          className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
                      />
                  </div>
                  <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-teal-600 uppercase pl-1">權限</label>
                      <select
                          value={editingId ? editingStaffRole : newStaffRole}
                          onChange={e => editingId ? setEditingStaffRole(e.target.value as any) : setNewStaffRole(e.target.value as any)}
                          className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none bg-white font-bold"
                      >
                          <option value="VIEWER">僅查看</option>
                          <option value="ADMIN">可管理</option>
                      </select>
                  </div>
                  {(currentUserLocation === '全部') && (
                      <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-teal-600 uppercase pl-1">所屬院區</label>
                          <select
                              value={editingId ? editingStaffLocation : newStaffLocation}
                              onChange={e => editingId ? setEditingStaffLocation(e.target.value as any) : setNewStaffLocation(e.target.value as any)}
                              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none bg-white font-bold"
                          >
                              <option value="北投">北投</option>
                              <option value="大直">大直</option>
                          </select>
                      </div>
                  )}
                  <div className="flex gap-2 lg:col-span-2 xl:col-span-2">
                      <button
                          type="submit"
                          disabled={isSaving || isHmReadOnly}
                          className="w-full flex-1 whitespace-nowrap bg-teal-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-teal-700 transition-colors disabled:opacity-50 h-[42px]"
                      >
                          {editingId ? '儲存更新' : '新增人員'}
                      </button>
                      {editingId && (
                          <button 
                              type="button" 
                              onClick={() => { setEditingId(null); setEditingStaffName(''); setEditingStaffAlias(''); setEditingStaffIsActive(true); setEditingStaffRole('VIEWER'); }}
                              className="px-4 py-2 flex-1 text-gray-500 hover:bg-gray-200 rounded-lg font-bold transition-colors h-[42px]"
                          >
                              取消
                          </button>
                      )}
                  </div>
              </form>

              {error && <div className="text-red-500 text-sm font-bold mb-4 p-3 bg-red-50 rounded-lg border border-red-100">{error}</div>}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                  {/* Beitou Section */}
                  <div className="bg-white rounded-xl border border-teal-100 p-5 shadow-sm">
                      <h4 className="font-bold text-teal-800 mb-4 flex items-center justify-between border-b border-teal-100 pb-3">
                          <div className="flex items-center gap-2">
                              <span className="w-2.5 h-5 bg-teal-500 rounded-sm"></span> 北投專區
                          </div>
                          <span className="text-xs font-bold text-teal-700 bg-teal-50 px-2.5 py-1 rounded-full border border-teal-100">
                              {activeHealthMgmtStaff.filter(s => s.location !== '大直').length} 人
                          </span>
                      </h4>
                      <div className="space-y-3">
                          {activeHealthMgmtStaff.filter(s => s.location !== '大直').map(staff => (
                              <div key={staff.id} className="flex justify-between items-center p-3 border border-teal-50 rounded-xl hover:bg-teal-50/50 transition-colors bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                                  <div className="flex items-center gap-2">
                                       <span className="font-bold text-slate-700">{staff.name}</span>
                                       {staff.alias && <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">({staff.alias})</span>}
                                       {staff.role === 'ADMIN' && <span className="text-[10px] font-bold px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded border border-indigo-100">管理</span>}
                                  </div>
                                  <div className="flex items-center gap-2">
                                      {!isHmReadOnly && (
                                          <>
                                              <button 
                                                  onClick={() => handleEditStaff(staff)}
                                                  className="px-3 py-1.5 text-xs font-bold text-teal-600 bg-teal-50 rounded-lg hover:bg-teal-100 hover:text-teal-700 transition-colors"
                                              >
                                                  編輯
                                              </button>
                                              <button 
                                                  onClick={() => setDeleteTargetId(staff.id)}
                                                  className="px-3 py-1.5 text-xs font-bold text-red-500 bg-red-50 rounded-lg hover:bg-red-100 hover:text-red-700 transition-colors"
                                              >
                                                  停用
                                              </button>
                                          </>
                                      )}
                                  </div>
                              </div>
                          ))}
                          {activeHealthMgmtStaff.filter(s => s.location !== '大直').length === 0 && (
                              <div className="text-center text-sm text-teal-600/50 py-6 font-bold bg-teal-50/50 rounded-xl border border-teal-100/50">
                                  目前無北投管理人員
                              </div>
                          )}
                      </div>
                  </div>

                  {/* Dazhi Section */}
                  <div className="bg-white rounded-xl border border-rose-100 p-5 shadow-sm">
                      <h4 className="font-bold text-rose-800 mb-4 flex items-center justify-between border-b border-rose-100 pb-3">
                          <div className="flex items-center gap-2">
                              <span className="w-2.5 h-5 bg-rose-500 rounded-sm"></span> 大直專區
                          </div>
                          <span className="text-xs font-bold text-rose-700 bg-rose-50 px-2.5 py-1 rounded-full border border-rose-100">
                              {activeHealthMgmtStaff.filter(s => s.location === '大直').length} 人
                          </span>
                      </h4>
                      <div className="space-y-3">
                          {activeHealthMgmtStaff.filter(s => s.location === '大直').map(staff => (
                              <div key={staff.id} className="flex justify-between items-center p-3 border border-rose-50 rounded-xl hover:bg-rose-50/50 transition-colors bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                                  <div className="flex items-center gap-2">
                                       <span className="font-bold text-slate-700">{staff.name}</span>
                                       {staff.alias && <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">({staff.alias})</span>}
                                       {staff.role === 'ADMIN' && <span className="text-[10px] font-bold px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded border border-indigo-100">管理</span>}
                                  </div>
                                  <div className="flex items-center gap-2">
                                      {!isHmReadOnly && (
                                          <>
                                              <button 
                                                  onClick={() => handleEditStaff(staff)}
                                                  className="px-3 py-1.5 text-xs font-bold text-rose-600 bg-rose-50 rounded-lg hover:bg-rose-100 hover:text-rose-700 transition-colors"
                                              >
                                                  編輯
                                              </button>
                                              <button 
                                                  onClick={() => setDeleteTargetId(staff.id)}
                                                  className="px-3 py-1.5 text-xs font-bold text-red-500 bg-red-50 rounded-lg hover:bg-red-100 hover:text-red-700 transition-colors"
                                              >
                                                  停用
                                              </button>
                                          </>
                                      )}
                                  </div>
                              </div>
                          ))}
                          {activeHealthMgmtStaff.filter(s => s.location === '大直').length === 0 && (
                              <div className="text-center text-sm text-rose-600/50 py-6 font-bold bg-rose-50/50 rounded-xl border border-rose-100/50">
                                  目前無大直管理人員
                              </div>
                          )}
                      </div>
                  </div>
              </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

export default HealthMgmtPage;
