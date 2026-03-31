import React, { useState, useEffect, useMemo, useRef } from 'react';
import { User, Shift, HealthMgmtShift, UserRole, PERMISSIONS, StaffGroup, HealthMgmtStaff, RosterCycle, AnesthesiaStaff, AnesthesiaShift, HMDesignation } from '../types';
import { db } from '../services/store';
import { Users, LayoutDashboard, Calendar, ArrowLeft, ArrowRight, X, Lock, Unlock, UserPlus, Save, Trash2, FileSpreadsheet, BarChart3, Download, Search, ChevronLeft, ChevronRight, Zap, ChevronDown, ChevronUp, UserSearch, Stethoscope, Syringe, ConciergeBell, Apple, Microscope, Pill, Clock } from 'lucide-react';
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
  const [activeTab, setActiveTab] = useState<'schedule' | 'today' | 'staff' | 'stats' | 'anesthesia'>('schedule');
  const [todayDate, setTodayDate] = useState(new Date());
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
  const [hmTimes, setHmTimes] = useState<string[]>(db.getHealthMgmtTimes());
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
  const [newStaffDesignation, setNewStaffDesignation] = useState<HMDesignation>('健管師');
  const [editingStaffDesignation, setEditingStaffDesignation] = useState<HMDesignation>('健管師');
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
  const [quickScheduleTime, setQuickScheduleTime] = useState('');
  const [isReorderMode, setIsReorderMode] = useState(false);

  // Quick Schedule State (Anesthesia)
  const [isAnesQuickScheduleMode, setIsAnesQuickScheduleMode] = useState(false);
  const [quickAnesStation, setQuickAnesStation] = useState('');
  const [quickAnesLocation, setQuickAnesLocation] = useState('');
  const [isAnesStaffManagementExpanded, setIsAnesStaffManagementExpanded] = useState(false);
  const [selectedCycleId, setSelectedCycleId] = useState<string>('month');
  const [isAnesReorderMode, setIsAnesReorderMode] = useState(false);
  // Stats bar: selected date for the schedule tab stats view (defaults to today)
  const [statsViewDate, setStatsViewDate] = useState<string>(toLocalISOString(new Date()));

  const LOCATIONS = ['北投', '大直'];

  const isGlobalReadOnly = currentUser.role === UserRole.VIEWER || currentUser.role === UserRole.RADIOGRAPHER_STAFF;

  const isHmReadOnly = useMemo(() => {
    if (currentUser.role === UserRole.SYSTEM_ADMIN) return false;
    if (currentUser.permissions?.includes(PERMISSIONS.EDIT_HEALTH_MGMT)) return false;
    const matchingStaff = healthMgmtStaff.find(s => s.name === currentUser.name || s.alias === currentUser.name);
    if (matchingStaff?.role === 'ADMIN') return false;
    return true;
  }, [currentUser, healthMgmtStaff]);

  const isAnesReadOnly = useMemo(() => {
    if (currentUser.role === UserRole.SYSTEM_ADMIN) return false;
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

  const filteredHmCycles = useMemo(() => {
      return hmCycles.filter(cycle => {
          if (currentUserLocation !== '全部') {
              return cycle.location === currentUserLocation || !cycle.location;
          }
          return true;
      });
  }, [hmCycles, currentUserLocation]);

  const currentCycle = useMemo(() => {
    return filteredHmCycles.find(c => c.id === selectedCycleId);
  }, [selectedCycleId, filteredHmCycles]);

  const DESIGNATION_ORDER: Record<string, number> = {
      '健管師': 1,
      '行政人員': 2,
      '營養師': 3,
      '醫檢師': 4,
      '藥師': 5
  };

  // Filtered staff list based on reactive state and location
  const activeHealthMgmtStaff = useMemo(() => {
      let staff = healthMgmtStaff.filter(s => s.isActive !== false);
      if (currentUserLocation !== '全部') {
          staff = staff.filter(s => s.location === currentUserLocation || !s.location);
      }
      
      // Per-cycle sorting priority
      const staffOrder = currentCycle?.staffOrder || [];
      
      return [...staff].sort((a, b) => {
          // 1. Designation Order
          const orderA = a.designation ? DESIGNATION_ORDER[a.designation] : 999;
          const orderB = b.designation ? DESIGNATION_ORDER[b.designation] : 999;
          if (orderA !== orderB) return orderA - orderB;

          // 2. Cycle-specific or displayOrder
          if (selectedCycleId !== 'month' && staffOrder.length > 0) {
              const idxA = staffOrder.indexOf(a.id);
              const idxB = staffOrder.indexOf(b.id);
              if (idxA !== -1 || idxB !== -1) {
                  if (idxA === -1) return 1;
                  if (idxB === -1) return -1;
                  return idxA - idxB;
              }
          }
          return (a.displayOrder ?? 999) - (b.displayOrder ?? 999);
      });
  }, [healthMgmtStaff, currentUserLocation, currentCycle, selectedCycleId]);

  const activeAnesthesiaStaff = useMemo(() => {
      const staff = anesthesiaStaff.filter(s => s.isActive !== false);
      return [...staff].sort((a, b) => (a.displayOrder ?? 999) - (b.displayOrder ?? 999));
  }, [anesthesiaStaff]);

  // State for local modifications (if needed, but for this change, direct DB updates are used)
  // const [localStaff, setLocalStaff] = useState<HealthMgmtStaff[]>([]);

  useEffect(() => {
    let isInitialLoad = true;
    const loadData = () => {
      setHealthMgmtStaff(db.getHealthMgmtStaff());
      setShifts(db.getHealthMgmtShifts());
      setHmStations(db.getHealthMgmtStations(currentUserLocation));
      setHmTasks(db.getHealthMgmtTasks(currentUserLocation));
      setHmTimes(db.getHealthMgmtTimes(currentUserLocation));
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
  }, [currentUserLocation]);


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
    
    // Enforcement: Check if station is allowed for this staff's designation
    const designation = getDesignationByStaffId(userId);
    if (station && !isStationAllowedForDesignation(designation, station)) {
        alert(`警告：該同仁身分為「${designation}」，不能安排此崗位 (${station})。`);
        return;
    }

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
              const fullStation = quickScheduleTime ? `${quickScheduleTime} ${quickScheduleStation}` : quickScheduleStation;
              await handleUpdateShift(userId, date, fullStation, quickScheduleTask || undefined);
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

  const handleMoveAnesStaff = async (staffId: string, direction: 'up' | 'down') => {
      const staffList = [...activeAnesthesiaStaff];
      const index = staffList.findIndex(s => s.id === staffId);
      if (index === -1) return;
      const newIndex = direction === 'up' ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= staffList.length) return;
      const temp = staffList[index];
      staffList[index] = staffList[newIndex];
      staffList[newIndex] = temp;
      try {
          const updates = staffList.map((s, i) =>
              db.updateAnesthesiaStaff(s.id, { displayOrder: i })
          );
          await Promise.all(updates);
      } catch (err) {
          console.error('Failed to update anesthesia staff order:', err);
          alert('調整麻護排序失敗');
      }
  };

  const handleMoveStaff = async (staffId: string, direction: 'up' | 'down') => {
      const staffList = [...activeHealthMgmtStaff];
      const index = staffList.findIndex(s => s.id === staffId);
      if (index === -1) return;
      
      const newIndex = direction === 'up' ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= staffList.length) return;
      
      // Swap
      const temp = staffList[index];
      staffList[index] = staffList[newIndex];
      staffList[newIndex] = temp;
      
      try {
          if (selectedCycleId !== 'month' && currentCycle) {
              // Update cycle-specific order
              const newOrder = staffList.map(s => s.id);
              await db.updateHealthMgmtCycle(currentCycle.id, { staffOrder: newOrder });
          } else {
              // Update global displayOrder for all staff in this list
              const updates = staffList.map((s, i) => 
                  db.updateHealthMgmtStaff(s.id, { displayOrder: i })
              );
              await Promise.all(updates);
          }
      } catch (err) {
          console.error('Failed to update staff order:', err);
          alert('調整順序失敗，請重新整理頁面');
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

  const getDesignationByStaffId = (staffId: string) => {
    const staff = healthMgmtStaff.find(s => s.id === staffId);
    return staff?.designation;
  };

  const isStationAllowedForDesignation = (designation: HMDesignation | undefined, station: string) => {
    if (!designation) return true;
    if (['休', 'V', 'E', '公出', '補', '病', '外', '特'].some(s => station.startsWith(s))) return true;
    
    // Normalize station to handle "07:30 H" format
    const parts = station.split(' ');
    const mainStation = parts.length > 1 && parts[0].includes(':') ? parts.slice(1).join(' ') : station;

    switch (designation) {
      case '健管師': 
        return ['H', 'G', 'A'].some(s => mainStation.includes(s));
      case '行政人員': 
        return ['R', '櫃'].some(s => mainStation.includes(s));
      case '營養師': 
        return ['D', '營'].some(s => mainStation.includes(s));
      case '醫檢師': 
        return ['M', '醫檢'].some(s => mainStation.includes(s));
      case '藥師': 
        return ['P', '藥師'].some(s => mainStation.includes(s));
      default: return true;
    }
  };

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
              location: currentUserLocation === '全部' ? newStaffLocation : (currentUserLocation === '北投' || currentUserLocation === '大直' ? currentUserLocation : newStaffLocation),
              designation: newStaffDesignation
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
              location: currentUserLocation === '全部' ? editingStaffLocation : (currentUserLocation === '北投' || currentUserLocation === '大直' ? currentUserLocation : editingStaffLocation),
              designation: editingStaffDesignation
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
    setEditingStaffDesignation(staff.designation || '健管師');
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
          {/* Desktop: text + icon; Mobile: icon + ultra-short label */}
          <button
            onClick={() => setActiveTab('schedule')}
            className={"px-2 md:px-4 py-2 rounded-lg text-xs md:text-sm font-bold transition-all flex items-center gap-1 md:gap-2 " + (
              activeTab === 'schedule' ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            )}
            title="健管排班總覽"
          >
            <Calendar size={15} />
            <span className="hidden md:inline">健管排班總覽</span>
            <span className="md:hidden text-[10px]">總覽</span>
          </button>
          <button
            onClick={() => setActiveTab('today')}
            className={"px-2 md:px-4 py-2 rounded-lg text-xs md:text-sm font-bold transition-all flex items-center gap-1 md:gap-2 " + (
              activeTab === 'today' ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            )}
            title="今日崗位"
          >
            <LayoutDashboard size={15} />
            <span className="hidden md:inline">今日崗位</span>
            <span className="md:hidden text-[10px]">今日</span>
          </button>
          <button
            onClick={() => setActiveTab('stats')}
            className={"px-2 md:px-4 py-2 rounded-lg text-xs md:text-sm font-bold transition-all flex items-center gap-1 md:gap-2 " + (
              activeTab === 'stats' ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            )}
            title="健管統計數據"
          >
            <BarChart3 size={15} />
            <span className="hidden md:inline">健管統計數據</span>
            <span className="md:hidden text-[10px]">統計</span>
          </button>
          <button
            onClick={() => setActiveTab('staff')}
            className={"px-2 md:px-4 py-2 rounded-lg text-xs md:text-sm font-bold transition-all flex items-center gap-1 md:gap-2 " + (
              activeTab === 'staff' ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            )}
            title="健管人員管理"
          >
            <Users size={15} />
            <span className="hidden md:inline">健管人員管理</span>
            <span className="md:hidden text-[10px]">人員</span>
          </button>
          <button
            onClick={() => setActiveTab('anesthesia')}
            className={"px-2 md:px-4 py-2 rounded-lg text-xs md:text-sm font-bold transition-all flex items-center gap-1 md:gap-2 " + (
              activeTab === 'anesthesia' ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            )}
            title="麻護排班"
          >
            <Calendar size={15} />
            <span className="hidden md:inline">麻護排班</span>
            <span className="md:hidden text-[10px]">麻護</span>
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
                    {!isAnesReadOnly && (
                        <button
                            onClick={() => setIsAnesReorderMode(!isAnesReorderMode)}
                            className={`px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1 transition-all border ${
                                isAnesReorderMode ? 'bg-amber-500 text-white border-amber-600 shadow-md' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                            }`}
                            title="調整麦護人員顯示順序"
                        >
                            {isAnesReorderMode ? <Save size={12}/> : <Users size={12}/>}
                            {isAnesReorderMode ? '完成排序' : '調整順序'}
                        </button>
                    )}
                    <button
                        onClick={handleExportAnesthesiaPDF}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors"
                    >
                        <Download size={14} /> 匙出 PDF
                    </button>
                    <button
                        onClick={handleExportStats}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors"
                    >
                        <FileSpreadsheet size={14} /> 匙出 Excel
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
                                        <tr key={`${loc}-${staff.id}`} className={`hover:bg-slate-50 transition-colors h-8 ${isAnesReorderMode ? 'bg-amber-50/40' : ''}`}>
                                            <td className={`px-2 border-r border-b sticky left-0 z-30 font-bold text-slate-700 shadow-[1px_0_0_0_#e2e8f0] truncate ${isAnesReorderMode ? 'bg-[#fffbeb]' : 'bg-white'}`}>
                                                <div className="flex items-center justify-between pr-1">
                                                    <span className={isAnesReorderMode ? 'text-amber-700' : ''}>{staff.name}</span>
                                                    {isAnesReorderMode && (
                                                        <div className="flex flex-col gap-0">
                                                            <button onClick={() => handleMoveAnesStaff(staff.id, 'up')} className="p-0.5 hover:bg-amber-200 rounded text-amber-600"><ChevronUp size={12}/></button>
                                                            <button onClick={() => handleMoveAnesStaff(staff.id, 'down')} className="p-0.5 hover:bg-amber-200 rounded text-amber-600"><ChevronDown size={12}/></button>
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
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
      ) : activeTab === 'today' ? (
        <div className="flex flex-col relative w-full h-full overflow-hidden">
             <HMTodayView 
                date={todayDate} 
                onDateChange={setTodayDate}
                location={currentUserLocation}
                shifts={shifts}
                anesthesiaShifts={anesthesiaShifts}
                staff={healthMgmtStaff}
                anesStaff={anesthesiaStaff}
                canEdit={!isHmReadOnly}
                onSaveShift={async (userId, date, time) => {
                    const existing = shifts.find(s => s.userId === userId && s.date === date);
                    if (existing) {
                        await db.upsertHealthMgmtShift({ ...existing, time });
                    }
                }}
                onSaveAnesShift={async (userId, date, workTime) => {
                    const existing = anesthesiaShifts.find(s => s.userId === userId && s.date === date);
                    if (existing) {
                        await db.assignAnesthesiaShift(
                            existing.userId, existing.date, existing.station || '',
                            existing.location, existing.task, workTime, existing.note
                        );
                    } else {
                        // Handle case where we click a name but no record was pre-fetched
                        await db.assignAnesthesiaShift(userId, date, '', '大直', '', workTime, '');
                    }
                }}
            />
        </div>
      ) : activeTab === 'schedule' ? (
        <div className="flex flex-col relative w-full">
          {/* ── Unified Sticky Header ── */}
          <div className="sticky top-0 z-[100] bg-white border-b border-slate-200 shadow-sm">

            {/* Row 1: All controls in one compact line */}
            <div className="flex items-center gap-2 px-3 py-2 flex-wrap">

              {/* Calendar nav (prev / label / next) */}
              <div className="flex items-center bg-slate-100 rounded-lg overflow-hidden border border-slate-200">
                <button
                  onClick={() => {
                    if (selectedCycleId === 'month') {
                      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
                    } else {
                      const idx = filteredHmCycles.findIndex(c => c.id === selectedCycleId);
                      if (idx < filteredHmCycles.length - 1 && idx !== -1) setSelectedCycleId(filteredHmCycles[idx + 1].id);
                    }
                  }}
                  className="px-2 py-1.5 hover:bg-slate-200 text-slate-500 transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="px-2 text-xs font-black text-slate-700 whitespace-nowrap min-w-[110px] text-center">
                  {selectedCycleId === 'month'
                    ? `${currentDate.getFullYear()} 年 ${currentDate.getMonth() + 1} 月`
                    : currentCycle?.name || '週期'}
                </span>
                <button
                  onClick={() => {
                    if (selectedCycleId === 'month') {
                      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
                    } else {
                      const idx = filteredHmCycles.findIndex(c => c.id === selectedCycleId);
                      if (idx > 0) setSelectedCycleId(filteredHmCycles[idx - 1].id);
                    }
                  }}
                  className="px-2 py-1.5 hover:bg-slate-200 text-slate-500 transition-colors"
                >
                  <ChevronRight size={16} />
                </button>
              </div>

              {/* Cycle selector dropdown */}
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2 h-[30px]">
                <Calendar size={13} className="text-teal-500 shrink-0" />
                <select
                  className="text-xs font-bold text-gray-700 bg-transparent border-none outline-none focus:ring-0 cursor-pointer"
                  onChange={(e) => setSelectedCycleId(e.target.value)}
                  value={selectedCycleId}
                >
                  <option value="month">月份</option>
                  <optgroup label="週期">
                    {filteredHmCycles.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </optgroup>
                </select>
              </div>

              {/* Date range info */}
              <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded-lg font-medium whitespace-nowrap hidden sm:inline">
                {dateRange[0]} ~ {dateRange[dateRange.length - 1]}
                <span className="mx-1 text-emerald-300">|</span>
                {dateRange.length} 天
              </span>

              {/* Spacer */}
              <div className="flex-1" />

              {/* Action buttons */}
              {!isHmReadOnly && (
                <>
                  <button
                    onClick={() => setIsReorderMode(!isReorderMode)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all border flex items-center gap-1 ${
                      isReorderMode ? 'bg-amber-500 text-white border-amber-600 shadow-md' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                    }`}
                    title="調整人員顯示順序"
                  >
                    {isReorderMode ? <Save size={13}/> : <Users size={13}/>}
                    <span className="hidden sm:inline">{isReorderMode ? '完成排序' : '排序'}</span>
                  </button>

                  <button
                    onClick={() => { setIsQuickScheduleMode(!isQuickScheduleMode); }}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all border flex items-center gap-1 ${
                      isQuickScheduleMode ? 'bg-indigo-600 text-white border-indigo-700 shadow-md' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                    }`}
                    title="快速排班"
                  >
                    <Zap size={13} />
                    <span className="hidden sm:inline">快速排班</span>
                    {isQuickScheduleMode && <span className="text-[9px] bg-white/20 px-1 rounded">ON</span>}
                  </button>
                </>
              )}

              <div className="flex bg-teal-50 rounded-lg p-0.5 border border-teal-100 items-center h-[30px]">
                <button onClick={handleExportSchedulePDF} className="px-2 py-0.5 hover:bg-white rounded-md text-xs font-bold text-teal-700 flex items-center gap-1 transition-all">
                  <Download size={13} /> PDF
                </button>
                <div className="w-[1px] h-3 bg-teal-200 mx-0.5" />
                <button onClick={handleExportScheduleExcel} className="px-2 py-0.5 hover:bg-white rounded-md text-xs font-bold text-emerald-700 flex items-center gap-1 transition-all">
                  <FileSpreadsheet size={13} /> Excel
                </button>
              </div>
            </div>

            {/* Row 2: Quick Schedule Toolbar (collapsible, only shows when ON) */}
            {!isHmReadOnly && isQuickScheduleMode && (
              <div className="border-t border-indigo-100 bg-indigo-50/60 px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-[10px] text-indigo-400 font-black mr-1 whitespace-nowrap">崗位：</span>
                  {[...hmStations, '清除'].map(st => (
                    <button
                      key={st}
                      onClick={() => {
                        if (st === '清除') {
                          setQuickScheduleStation('');
                          setQuickScheduleTask('');
                          setQuickScheduleTime('');
                        } else {
                          setQuickScheduleStation(st);
                        }
                      }}
                      className={"px-2 py-0.5 rounded text-[10px] font-bold transition-colors border whitespace-nowrap " + (
                        quickScheduleStation === st || (st === '清除' && !quickScheduleStation && !quickScheduleTask)
                          ? st === '清除' ? 'bg-red-100 text-red-700 border-red-200' : 'bg-teal-600 text-white border-teal-700'
                          : st === '清除' ? 'bg-white text-red-600 border-red-200 hover:bg-red-50' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                      )}
                    >
                      {st}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-[10px] text-indigo-400 font-black mr-1 whitespace-nowrap">任務：</span>
                  {hmTasks.map(tk => (
                    <button
                      key={tk}
                      onClick={() => setQuickScheduleTask(tk === quickScheduleTask ? '' : tk)}
                      className={"px-2 py-0.5 rounded text-[10px] font-bold transition-colors border whitespace-nowrap " + (
                        quickScheduleTask === tk ? 'bg-indigo-600 text-white border-indigo-700' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                      )}
                    >
                      {tk}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-[10px] text-indigo-400 font-black mr-1 whitespace-nowrap">班時：</span>
                  {['07:30-15:30', '08:00-16:00', '08:30-16:30', '09:00-17:00'].map(tm => (
                    <button
                      key={tm}
                      onClick={() => setQuickScheduleTime(tm === quickScheduleTime ? '' : tm)}
                      className={"px-2 py-0.5 rounded text-[10px] font-bold transition-colors border whitespace-nowrap " + (
                        tm === quickScheduleTime ? 'bg-slate-800 text-white border-slate-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                      )}
                    >
                      {tm}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          {/* === Stats Bar for Selected Date === */}
          {(() => {
              const svStats = db.getDailyStats(statsViewDate);
              const svDate = new Date(statsViewDate);
              const isStatsToday = statsViewDate === toLocalISOString(new Date());
              
              // Compute per-station headcount for that date (based on station assignment letter)
              const statsShifts = shifts.filter(s => {
                  if (s.date !== statsViewDate) return false;
                  if (currentUserLocation !== '全部' && s.location && s.location !== currentUserLocation) return false;
                  return true;
              });

              const STATION_GROUPS: Record<string, string[]> = {
                  'H': ['H', '健管', '接待'],
                  'G': ['G', '腸胃', '診1', '診2', 'POR', '流動', '洗滌'],
                  'R': ['R', '行政', '櫃台', '櫃1', '櫃2', '櫃3', '櫃助'],
                  'D': ['D', '代謝', '營養', '營1', '營2'],
                  'M': ['M', '醫檢', '檢驗'],
                  'P': ['P', '藥師'],
              };
              const stationCounts: Record<string, number> = {};
              const groupNames: Record<string, string[]> = {};
              
              const countedUserIds = new Set<string>(); // Each person counts once per day

              statsShifts.forEach(s => {
                  const sText = (s.station || '').toUpperCase();
                  if (!sText || sText.includes('休') || sText.includes('V')) return;
                  if (countedUserIds.has(s.userId)) return;
                  
                  const u = db.getHealthMgmtStaff().find(st => st.id === s.userId);
                  if (!u || u.isActive === false) return; // Only count active staff

                  const parts = s.station.split(' ');
                  const base = parts.find(p => !p.includes(':')) || parts[parts.length - 1] || '';

                  for (const [key, vals] of Object.entries(STATION_GROUPS)) {
                      if (vals.some(v => sText.includes(v.toUpperCase()) || base.toUpperCase().startsWith(v.toUpperCase()))) {
                          stationCounts[key] = (stationCounts[key] || 0) + 1;
                          if (!groupNames[key]) groupNames[key] = [];
                          groupNames[key].push(u.name);
                          countedUserIds.add(s.userId);
                          break;
                      }
                  }
              });
              // Anesthesia = A
              const anesDate = anesthesiaShifts.filter(s => {
                  if (s.date !== statsViewDate) return false;
                  if (currentUserLocation !== '全部' && s.location && s.location !== currentUserLocation) return false;
                  const st = (s.station || '').toUpperCase();
                  if (!st.trim() || st.includes('休') || st.includes('V')) return false;

                  const u = db.getAnesthesiaStaff().find(as => as.id === s.userId);
                  return u && u.isActive !== false;
              });
              
              const uniqueAnesUserIds = new Set<string>();
              const anesNames: string[] = [];
              
              anesDate.forEach(s => {
                  if (!uniqueAnesUserIds.has(s.userId)) {
                      uniqueAnesUserIds.add(s.userId);
                      const u = db.getAnesthesiaStaff().find(st => st.id === s.userId);
                      if (u) anesNames.push(u.name);
                  }
              });
              
              const anesCount = uniqueAnesUserIds.size;

              // Abbr map for display
              const DESG_ABBR: Record<string, string> = { 'H': 'H', 'G': 'G', 'R': 'R', 'D': 'D', 'M': 'M', 'P': 'P' };

              return (
                  <div className="border border-teal-100 rounded-xl mt-2 overflow-hidden bg-white shadow-sm">
                      {/* Header row: date navigation */}
                      <div className="bg-gradient-to-r from-teal-600 to-teal-500 px-4 py-2 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                              <button
                                  onClick={() => { const d = new Date(statsViewDate); d.setDate(d.getDate() - 1); setStatsViewDate(toLocalISOString(d)); }}
                                  className="p-1 rounded-full hover:bg-white/20 text-white transition-colors"
                              ><ChevronLeft size={16} /></button>
                              <div className="flex items-center gap-2">
                                  <span className="text-white font-black text-base">
                                      {svDate.getMonth() + 1}/{svDate.getDate()}
                                  </span>
                                  <span className={`text-sm font-bold ${isStatsToday ? 'text-teal-100' : 'text-teal-200'}`}>
                                      ({['日', '一', '二', '三', '四', '五', '六'][svDate.getDay()]})
                                  </span>
                                  {isStatsToday && <span className="text-[10px] font-black text-white bg-white/20 px-2 py-0.5 rounded-full">今日</span>}
                              </div>
                              <button
                                  onClick={() => { const d = new Date(statsViewDate); d.setDate(d.getDate() + 1); setStatsViewDate(toLocalISOString(d)); }}
                                  className="p-1 rounded-full hover:bg-white/20 text-white transition-colors"
                              ><ChevronRight size={16} /></button>
                              {!isStatsToday && (
                                  <button onClick={() => setStatsViewDate(toLocalISOString(new Date()))} className="text-[10px] font-black text-teal-600 bg-white px-2.5 py-1 rounded-full hover:bg-teal-50 transition-colors">回今日</button>
                              )}
                          </div>
                          {/* Per-designation counts */}
                          <div className="flex items-center gap-1.5 flex-wrap justify-end">
                              <span className="text-[10px] text-white/70 font-bold shrink-0">人員：</span>
                              {Object.entries(DESG_ABBR).map(([key, abbr]) => {
                                  const cnt = stationCounts[key] || 0;
                                  const names = groupNames[key] || [];
                                  return (
                                      <div 
                                          key={key} 
                                          title={names.length > 0 ? names.join(', ') : '無排班'}
                                          className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-black transition-all cursor-help ${cnt > 0 ? 'bg-white text-teal-700 shadow-sm' : 'bg-white/20 text-white/40'}`}
                                      >
                                          <span>{abbr}:{cnt}</span>
                                      </div>
                                  );
                              })}
                              <div 
                                  title={anesNames.length > 0 ? anesNames.join(', ') : '無排班'}
                                  className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-black transition-all cursor-help ${anesCount > 0 ? 'bg-rose-100 text-rose-600 shadow-sm' : 'bg-white/20 text-white/40'}`}
                              >
                                  <span>A:{anesCount}</span>
                              </div>
                          </div>
                      </div>

                      {/* Data rows: conditional by location */}
                      <div className={`grid ${currentUserLocation === '全部' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                          {/* 北投 - show if 北投 or 全部 */}
                          {(currentUserLocation === '北投' || currentUserLocation === '全部') && (
                              <div className={`px-3 py-2 flex flex-col gap-1 ${currentUserLocation === '全部' ? 'border-r border-slate-100' : ''}`}>
                                  {currentUserLocation === '全部' && (
                                      <div className="flex items-center gap-1 mb-0.5">
                                          <span className="w-1.5 h-3 bg-teal-500 rounded-sm inline-block"></span>
                                          <span className="text-xs font-black text-teal-700">北投</span>
                                      </div>
                                  )}
                                  <div className="flex flex-wrap gap-2 md:gap-4">
                                      <div className="flex flex-col">
                                          <span className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase">GI</span>
                                          <span className="text-base md:text-xl font-black text-emerald-600">{svStats?.beitou_gi ?? '-'}</span>
                                      </div>
                                      <div className="flex flex-col">
                                          <span className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase">健檢</span>
                                          <span className="text-base md:text-xl font-black text-slate-700">{svStats?.beitou_clients ?? '-'}</span>
                                      </div>
                                      {!isHmReadOnly ? (
                                          <div className="flex flex-col">
                                              <span className="text-[9px] md:text-[10px] font-bold text-amber-500 uppercase">上限</span>
                                              <input
                                                  type="number"
                                                  value={svStats?.beitou_max_capacity || ''}
                                                  onChange={(e) => db.updateDailyStats(statsViewDate, { beitou_max_capacity: Number(e.target.value) || undefined })}
                                                  placeholder="-"
                                                  className="w-12 md:w-16 text-base md:text-xl font-black bg-amber-50 border border-amber-200 rounded-lg px-1 md:px-2 py-0.5 outline-none focus:ring-2 focus:ring-amber-400 text-amber-700 placeholder-amber-200"
                                              />
                                          </div>
                                      ) : (
                                          <div className="flex flex-col">
                                              <span className="text-[9px] md:text-[10px] font-bold text-amber-500 uppercase">上限</span>
                                              <span className="text-base md:text-xl font-black text-amber-700">{svStats?.beitou_max_capacity ?? '-'}</span>
                                          </div>
                                      )}
                                  </div>
                              </div>
                          )}

                          {/* 大直 - show if 大直 or 全部 */}
                          {(currentUserLocation === '大直' || currentUserLocation === '全部') && (
                              <div className="px-3 py-2 flex flex-col gap-1">
                                  {currentUserLocation === '全部' && (
                                      <div className="flex items-center gap-1 mb-0.5">
                                          <span className="w-1.5 h-3 bg-rose-500 rounded-sm inline-block"></span>
                                          <span className="text-xs font-black text-rose-600">大直</span>
                                      </div>
                                  )}
                                  <div className="flex flex-wrap gap-2 md:gap-4">
                                      <div className="flex flex-col">
                                          <span className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase">GI</span>
                                          <span className="text-base md:text-xl font-black text-emerald-600">{svStats?.dazhi_gi ?? '-'}</span>
                                      </div>
                                      <div className="flex flex-col">
                                          <span className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase">健檢</span>
                                          <span className="text-base md:text-xl font-black text-slate-700">{svStats?.dazhi_clients ?? '-'}</span>
                                      </div>
                                      <div className="flex flex-col">
                                          <span className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase">代謝</span>
                                          <span className="text-base md:text-xl font-black text-sky-600">{svStats?.dazhi_metabolism_clients ?? '-'}</span>
                                      </div>
                                      {!isHmReadOnly ? (
                                          <div className="flex flex-col">
                                              <span className="text-[9px] md:text-[10px] font-bold text-amber-500 uppercase">上限</span>
                                              <input
                                                  type="number"
                                                  value={svStats?.dazhi_max_capacity || ''}
                                                  onChange={(e) => db.updateDailyStats(statsViewDate, { dazhi_max_capacity: Number(e.target.value) || undefined })}
                                                  placeholder="-"
                                                  className="w-12 md:w-16 text-base md:text-xl font-black bg-amber-50 border border-amber-200 rounded-lg px-1 md:px-2 py-0.5 outline-none focus:ring-2 focus:ring-amber-400 text-amber-700 placeholder-amber-200"
                                              />
                                          </div>
                                      ) : (
                                          <div className="flex flex-col">
                                              <span className="text-[9px] md:text-[10px] font-bold text-amber-500 uppercase">上限</span>
                                              <span className="text-base md:text-xl font-black text-amber-700">{svStats?.dazhi_max_capacity ?? '-'}</span>
                                          </div>
                                      )}
                                  </div>
                              </div>
                          )}
                      </div>
                  </div>
              );
          })()}


          <div className="bg-white rounded-xl border border-gray-200 shadow-sm inline-block min-w-full">
            <table className="text-sm border-collapse w-auto">
              <thead className={`sticky z-50 transition-all duration-300 ${isQuickScheduleMode ? 'top-[125px]' : 'top-[46px]'}`}>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="p-3 text-left font-bold text-slate-600 w-32 sticky left-0 top-0 bg-slate-50 z-[60] border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">人員 (天數)</th>
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
                    <td className={`p-0 border-r border-slate-200 sticky left-0 z-30 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] transition-colors ${isReorderMode ? 'bg-amber-50' : 'bg-white'}`}>
                        <div className="p-3 font-bold text-slate-800 flex items-center justify-between min-w-[128px]">
                            <div className="flex items-center">
                                <span className={isReorderMode ? 'text-amber-700' : ''}>{staff.name}</span>
                                <span className="ml-2 text-xs text-gray-400 font-normal whitespace-nowrap">
                                    ({shifts.filter(s => s.userId === staff.id && dateRange.includes(s.date) && (s.station || s.task)).length})
                                </span>
                            </div>
                            
                            {isReorderMode && (
                                <div className="flex flex-col gap-0.5 ml-2">
                                    <button 
                                        onClick={() => handleMoveStaff(staff.id, 'up')}
                                        className="p-1 hover:bg-amber-200 rounded text-amber-600 transition-colors"
                                    >
                                        <ChevronUp size={14} />
                                    </button>
                                    <button 
                                        onClick={() => handleMoveStaff(staff.id, 'down')}
                                        className="p-1 hover:bg-amber-200 rounded text-amber-600 transition-colors"
                                    >
                                        <ChevronDown size={14} />
                                    </button>
                                </div>
                            )}
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
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-[150] p-4">
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
                  <div className="flex flex-wrap gap-1.5 p-1 max-h-[300px] overflow-y-auto custom-scrollbar">
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
                  <div className="flex flex-wrap gap-1.5 p-1 max-h-[300px] overflow-y-auto custom-scrollbar">
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
                  <div className="flex flex-wrap gap-1.5 p-1 max-h-[300px] overflow-y-auto custom-scrollbar">
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
                  <label className="text-xs font-bold text-gray-500 uppercase flex justify-between">
                      <span>工作時段 (選填)</span>
                      {editingShiftTime && <span className="text-teal-600 cursor-pointer hover:underline" onClick={() => setEditingShiftTime('')}>清除</span>}
                  </label>
                  <div className="flex flex-wrap gap-1.5 p-1 mb-2">
                      {hmTimes.map(time => (
                          <button
                              key={time}
                              onClick={() => setEditingShiftTime(time)}
                              className={"px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all " + (editingShiftTime === time ? 'bg-teal-500 text-white border-teal-600 shadow-sm' : 'bg-slate-50 text-gray-600 border-gray-200 hover:border-teal-300 hover:bg-white')}
                          >
                              {time}
                          </button>
                      ))}
                  </div>
                  <input
                      type="text"
                      value={editingShiftTime}
                      onChange={e => setEditingShiftTime(e.target.value)}
                      placeholder="自訂時段 (例: 08:00-16:00)"
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
        </div>
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
                            <th className="p-4 text-left font-bold text-slate-500">身份</th>
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
                                <td className="p-4 text-slate-500 font-medium">{staff.designation || '-'}</td>
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
                      <label className="text-[10px] font-bold text-teal-600 uppercase pl-1">身份 (崗位限制)</label>
                      <select
                          value={editingId ? editingStaffDesignation : newStaffDesignation}
                          onChange={e => editingId ? setEditingStaffDesignation(e.target.value as any) : setNewStaffDesignation(e.target.value as any)}
                          className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none bg-white font-bold text-indigo-700"
                      >
                          {Object.keys(DESIGNATION_ORDER).map(d => (
                              <option key={d} value={d}>{d}</option>
                          ))}
                      </select>
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
                                       {staff.designation && <span className="text-[10px] font-bold px-1.5 py-0.5 bg-rose-50 text-rose-600 rounded border border-rose-100">{staff.designation}</span>}
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

// --- Today View Component ---
const HMTodayView: React.FC<{
    date: Date;
    onDateChange: (d: Date) => void;
    location: string;
    shifts: HealthMgmtShift[];
    anesthesiaShifts: AnesthesiaShift[];
    staff: HealthMgmtStaff[];
    anesStaff: AnesthesiaStaff[];
    canEdit?: boolean;
    onSaveShift?: (userId: string, date: string, time: string) => Promise<void>;
    onSaveAnesShift?: (userId: string, date: string, workTime: string) => Promise<void>;
}> = ({ date, onDateChange, location, shifts, anesthesiaShifts, staff, anesStaff, canEdit = false, onSaveShift, onSaveAnesShift }) => {
    const dateStr = toLocalISOString(date);
    const dateInputRef = useRef<HTMLInputElement>(null);
    // Time edit popup state
    const [editingMember, setEditingMember] = useState<{ userId: string; name: string; currentTime: string; date: string; isAnes?: boolean } | null>(null);
    const [editingTime, setEditingTime] = useState('');

    const filteredShifts = useMemo(() => shifts.filter(s => s.date === dateStr), [shifts, dateStr]);
    const filteredAnes = useMemo(() => anesthesiaShifts.filter(s => s.date === dateStr), [anesthesiaShifts, dateStr]);

    const groups = useMemo(() => {
        // User Request: Use categorized view for ALL locations (Beitou, Dazhi, All)
        // This ensures R (Counter) and D (Metabolism) are always categorized/found properly
        return [
            { id: 'H', label: '接待(H)', stations: ['H', '健管', '接待'], icon: <UserSearch size={18} />, color: 'indigo' },
            { 
                id: 'G', label: '腸胃(G)', stations: ['G', '腸胃', '診1', '診2', 'POR', '流動', '洗滌'], icon: <Stethoscope size={18} />, color: 'emerald',
                taskOrder: ['放診1', '診2', 'POR', '流動', '洗滌'] 
            },
            { 
                id: 'A', label: '麻護(A)', isAnesthesia: true, icon: <Syringe size={18} />, color: 'rose',
                taskOrder: ['麻1', '麻2']
            },
            { 
                id: 'R', label: '櫃台(R)', stations: ['R', '行政', '行政人員', '櫃台', '櫃枱', '櫃1', '櫃2', '櫃3', '櫃助', '櫃'], icon: <ConciergeBell size={18} />, color: 'amber',
                taskOrder: ['早班', '晚班', '供餐'] 
            },
            { 
                id: 'D', label: '代謝(D)', stations: ['D', '代謝', '營養', '營1', '營2'], icon: <Apple size={18} />, color: 'sky',
                taskOrder: ['營1', '營2'] 
            },
            { 
                id: 'M', label: '醫檢(M)', stations: ['M', '醫檢', '檢驗'], icon: <Microscope size={18} />, color: 'violet',
                taskOrder: ['早班', '晚班'] 
            },
            { 
                id: 'P', label: '藥師(P)', stations: ['P', '藥師'], icon: <Pill size={18} />, color: 'teal'
            }
        ];
    }, []);

    const getGroupAssignments = (group: any) => {
        let assignments: any[] = [];
        
        if (group.isAnesthesia) {
            assignments = filteredAnes.filter(s => {
                // Location filter
                if (location !== '全部' && s.location && s.location !== location) return false;
                if (location === '全部' && s.location === '北投') return false; // Default HM logic for Anes: only Dazhi + All

                const st = (s.station || '').toUpperCase();
                if (!st.trim() || st.includes('休') || st.includes('V')) return false;

                const u = anesStaff.find(as => as.id === s.userId);
                return u && u.isActive !== false;
            }).map(s => {
                const u = anesStaff.find(st => st.id === s.userId);
                return {
                    name: u?.name || '未知',
                    task: s.station, // station is the task for anes (e.g. 麻1)
                    time: s.workTime || '',
                    raw: { ...s, userId: s.userId }
                };
            });
        } else {
            // Also match by designation for R (行政/counter) and D (代謝/nutrition)
            assignments = filteredShifts.filter(s => {
                const sText = (s.station || '').toUpperCase();
                if (!sText || sText.includes('休') || sText.includes('V')) return false;

                const u = staff.find(st => st.id === s.userId);
                if (!u || u.isActive === false) return false;

                const stationParts = sText.split(' ');
                const baseStation = stationParts.find(p => !p.includes(':')) || stationParts[stationParts.length - 1] || '';
                
                // Location filter: if view is 北投/大直, only show that location. If 全部, show all.
                if (location !== '全部' && s.location && s.location !== location) return false;

                return group.stations.some(st => {
                    const stUpper = st.toUpperCase();
                    return sText.includes(stUpper) || baseStation.startsWith(stUpper);
                });
            }).map(s => {
                const u = staff.find(st => st.id === s.userId);
                let time = s.time || '';
                let displayStation = s.station;
                
                // Legacy support: extract time from station string if present
                if (!time && s.station.includes(' ')) {
                    const parts = s.station.split(' ');
                    if (parts[0].includes(':')) {
                        time = parts[0];
                        displayStation = parts.slice(1).join(' ');
                    }
                }

                return {
                    name: u?.name || '未知',
                    task: s.task,
                    time: time,
                    raw: { ...s, station: displayStation }
                };
            });
        }

        // Apply Sorting
        assignments.sort((a, b) => {
            // Priority 1: 主控, Priority 2: 輔控
            const isMainA = (a.task || '').includes('主控') || (a.raw?.station || '').includes('主控');
            const isMainB = (b.task || '').includes('主控') || (b.raw?.station || '').includes('主控');
            const isAsstA = (a.task || '').includes('輔控') || (a.raw?.station || '').includes('輔控');
            const isAsstB = (b.task || '').includes('輔控') || (b.raw?.station || '').includes('輔控');

            if (isMainA && !isMainB) return -1;
            if (!isMainA && isMainB) return 1;
            if (isAsstA && !isAsstB) return -1;
            if (!isAsstA && isAsstB) return 1;

            // Priority 3: Work Time
            if (a.time && b.time) {
                return a.time.localeCompare(b.time);
            }
            if (a.time) return -1;
            if (b.time) return 1;

            // Priority 4: Task Order
            if (group.taskOrder) {
                const idxA = group.taskOrder.indexOf(a.task);
                const idxB = group.taskOrder.indexOf(b.task);
                if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                if (idxA !== -1) return -1;
                if (idxB !== -1) return 1;
            }
            return 0;
        });

        return assignments;
    };

    return (
        <div className="flex-1 flex flex-col p-6 space-y-6 overflow-hidden">
            <div className="bg-white/80 backdrop-blur-md rounded-[2.5rem] shadow-sm border border-slate-200/60 p-5 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-6">
                    <button 
                        onClick={() => { const d = new Date(date); d.setDate(d.getDate() - 1); onDateChange(d); }}
                        className="w-12 h-12 flex items-center justify-center bg-slate-50 hover:bg-white rounded-full text-slate-400 hover:text-teal-600 hover:shadow-md transition-all duration-300 border border-slate-100"
                    >
                        <ArrowLeft size={22} />
                    </button>
                    <div className="flex flex-col items-center">
                        <div className="text-2xl font-black text-slate-800 tracking-tight">
                            {date.toLocaleDateString('zh-TW', { month: 'long', day: 'numeric' })}
                            <span className="ml-3 text-base font-black text-teal-500 bg-teal-50 px-3 py-1 rounded-full border border-teal-100/50">
                                {['週日', '週一', '週二', '週三', '週四', '週五', '週六'][date.getDay()]}
                            </span>
                        </div>
                    </div>
                    <button 
                        onClick={() => { const d = new Date(date); d.setDate(d.getDate() + 1); onDateChange(d); }}
                        className="w-12 h-12 flex items-center justify-center bg-slate-50 hover:bg-white rounded-full text-slate-400 hover:text-teal-600 hover:shadow-md transition-all duration-300 border border-slate-100"
                    >
                        <ArrowRight size={22} />
                    </button>
                </div>
                <div className="flex items-center gap-4">
                    <div className="relative group/date">
                        <input 
                            ref={dateInputRef}
                            type="date" 
                            className="absolute inset-0 opacity-0 invisible"
                            onChange={(e) => onDateChange(new Date(e.target.value))}
                            value={dateStr}
                        />
                        <button 
                            onClick={() => dateInputRef.current?.showPicker ? dateInputRef.current.showPicker() : dateInputRef.current?.click()}
                            className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-2xl text-sm font-black hover:bg-slate-800 transition-all shadow-lg shadow-slate-200 group-hover/date:scale-105 active:scale-95"
                        >
                            <Calendar size={16} /> 跳轉日期
                        </button>
                    </div>
                    <button 
                        onClick={() => onDateChange(new Date())}
                        className="px-6 py-2.5 bg-teal-50 text-teal-600 rounded-2xl border border-teal-100 hover:bg-teal-600 hover:text-white transition-all shadow-sm hover:shadow-teal-100 font-black text-sm active:scale-95"
                        title="回到今天"
                    >
                        今日
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-auto pr-2 pb-8 scrolling-touch">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {groups.map(group => {
                        const members = getGroupAssignments(group);
                        if (members.length === 0) return null;

                        const colorClasses: Record<string, string> = {
                            indigo: 'border-indigo-600 text-indigo-700 bg-indigo-50',
                            emerald: 'border-emerald-600 text-emerald-700 bg-emerald-50',
                            rose: 'border-rose-600 text-rose-700 bg-rose-50',
                            amber: 'border-amber-600 text-amber-700 bg-amber-50',
                            sky: 'border-sky-600 text-sky-700 bg-sky-50',
                            violet: 'border-violet-600 text-violet-700 bg-violet-50',
                            teal: 'border-teal-600 text-teal-700 bg-teal-50'
                        };

                        const accentColor = colorClasses[group.color || 'teal'].split(' ')[0].replace('border-', 'bg-');

                        return (
                            <div key={group.id} className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden flex flex-col group hover:shadow-xl hover:shadow-slate-200/50 transition-all duration-300 hover:-translate-y-1 relative">
                                <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${accentColor}`}></div>
                                <div className="px-6 py-4 bg-white border-b border-slate-50 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-xl ${colorClasses[group.color || 'teal'].split(' ')[2]} ${colorClasses[group.color || 'teal'].split(' ')[1]}`}>
                                            {group.icon}
                                        </div>
                                        <h4 className="font-black text-slate-800 text-lg uppercase tracking-tight">
                                            {group.label}
                                        </h4>
                                    </div>
                                    <span className="text-[11px] font-black bg-slate-100 px-2.5 py-1 rounded-full text-slate-500 border border-slate-200/50">
                                        {members.length}
                                    </span>
                                </div>
                                <div className="p-4 space-y-3">
                                    {members.length > 0 ? (
                                        members.map((m, idx) => {
                                            const isClickable = canEdit && (group.isAnesthesia ? !!onSaveAnesShift : !!onSaveShift) && m.raw?.userId;
                                            return (
                                            <div
                                                key={idx}
                                                onClick={() => {
                                                    if (!isClickable) return;
                                                    setEditingMember({ 
                                                        userId: m.raw.userId, 
                                                        name: m.name, 
                                                        currentTime: m.time, 
                                                        date: dateStr,
                                                        isAnes: !!group.isAnesthesia
                                                    });
                                                    setEditingTime(m.time || '');
                                                }}
                                                className={`flex items-center justify-between p-3.5 bg-slate-50/30 rounded-2xl border border-slate-100/50 hover:bg-white hover:border-teal-100 hover:shadow-md transition-all duration-300 group/item ${isClickable ? 'cursor-pointer' : ''}`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-black text-white shadow-sm transition-transform group-hover/item:scale-110 ${accentColor}`}>
                                                        {m.name.slice(-2)}
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-base font-black text-slate-800 tracking-tight">{m.name}</span>
                                                        {m.task && (
                                                            <div className="flex items-center gap-1.5 mt-1">
                                                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg border shadow-sm ${colorClasses[group.color || 'teal']}`}>
                                                                    {m.task}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex flex-col items-end gap-1">
                                                    {m.time ? (
                                                        <div className="flex items-center gap-1.5 text-[11px] font-black text-white bg-slate-700/90 px-3 py-1.5 rounded-xl border border-slate-600 shadow-md transform hover:scale-105 transition-transform">
                                                            <Clock size={12} className="text-teal-400" />
                                                            {m.time}
                                                        </div>
                                                    ) : isClickable ? (
                                                        <div className="text-[10px] text-slate-400 font-bold px-3 py-1.5 rounded-xl border-2 border-dashed border-slate-100 bg-slate-50/50 hover:bg-teal-50 hover:border-teal-200 hover:text-teal-600 cursor-pointer transition-all">+ 時間</div>
                                                    ) : null}
                                                </div>
                                            </div>
                                            );
                                        })
                                    ) : (
                                        <div className="py-12 flex flex-col items-center justify-center text-slate-300 gap-3">
                                            <div className="w-12 h-12 rounded-full border-2 border-dashed border-slate-200 flex items-center justify-center">
                                                <Users size={20} className="opacity-20" />
                                            </div>
                                            <span className="text-xs font-bold italic tracking-wider">尚未排班</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Time Edit Popup */}
            {editingMember && (
                <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-[200] p-4" onClick={() => setEditingMember(null)}>
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        <div className="px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-teal-50 to-white flex items-center justify-between">
                            <div>
                                <h4 className="text-lg font-black text-slate-800">{editingMember.name}</h4>
                                <p className="text-xs text-slate-500 mt-0.5">{editingMember.date} 上班時間</p>
                            </div>
                            <button onClick={() => setEditingMember(null)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"><X size={18} /></button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div className="grid grid-cols-2 gap-2">
                                {['07:30-15:30', '08:00-16:00', '08:30-16:30', '09:00-17:00', '10:00-18:00', '11:00-19:00'].map(t => (
                                    <button
                                        key={t}
                                        onClick={() => setEditingTime(t)}
                                        className={`py-2.5 px-3 rounded-xl text-sm font-bold border-2 transition-all ${
                                            editingTime === t ? 'bg-teal-500 text-white border-teal-600 shadow-md' : 'border-slate-100 text-slate-600 hover:border-teal-200 hover:bg-teal-50'
                                        }`}
                                    >{t}</button>
                                ))}
                            </div>
                            <input
                                type="text"
                                value={editingTime}
                                onChange={e => setEditingTime(e.target.value)}
                                placeholder="自訂時段 (例: 08:00-16:00)"
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-teal-500 outline-none transition-all"
                            />
                            <div className="flex gap-2">
                                {editingMember.currentTime && (
                                    <button
                                        onClick={async () => {
                                            if (onSaveShift && !editingMember.isAnes) await onSaveShift(editingMember.userId, editingMember.date, '');
                                        if (onSaveAnesShift && editingMember.isAnes) await onSaveAnesShift(editingMember.userId, editingMember.date, '');
                                            setEditingMember(null);
                                        }}
                                        className="flex-1 py-3 text-sm font-bold text-red-500 bg-red-50 rounded-xl hover:bg-red-100 transition-colors border border-red-100"
                                    >清除時間</button>
                                )}
                                <button
                                    onClick={async () => {
                                        if (onSaveShift && !editingMember.isAnes && editingTime) await onSaveShift(editingMember.userId, editingMember.date, editingTime);
                                        if (onSaveAnesShift && editingMember.isAnes && editingTime) await onSaveAnesShift(editingMember.userId, editingMember.date, editingTime);
                                        setEditingMember(null);
                                    }}
                                    disabled={!editingTime}
                                    className="flex-1 py-3 text-sm font-black text-white bg-teal-600 rounded-xl hover:bg-teal-700 transition-colors disabled:opacity-40 shadow-lg shadow-teal-100"
                                >確認儲存</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default HealthMgmtPage;
