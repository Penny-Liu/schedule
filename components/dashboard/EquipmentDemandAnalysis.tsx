import React, { useEffect, useMemo, useState } from "react";
import { Activity, CalendarRange, Check, ClipboardCopy, MapPin, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "../../services/supabaseClient";

type EquipmentKey = "MR" | "CT" | "US" | "BMD" | "DX" | "MG";
type LocationName = "北投" | "大直";
type ComparisonKey = EquipmentKey | "totalClients" | "equipmentTotal";
type Metric = { average: number; p90: number; peak: number; activeDays: number; values?: number[] };
type MonthlyRow = {
  year: number; month: number; location: LocationName;
  mr_count: number; ct_count: number; us_count: number; bmd_count: number; dx_count: number; mg_count: number;
  total_clients: number; active_days: number; demand_metrics: Partial<Record<EquipmentKey | "TOTAL_CLIENTS", Metric>>;
  source_end_date: string; is_finalized: boolean;
};

const EQUIPMENT: Array<{ key: EquipmentKey; field: keyof MonthlyRow; label: string; color: string }> = [
  { key: "MR", field: "mr_count", label: "MRI", color: "#6366f1" },
  { key: "CT", field: "ct_count", label: "CT", color: "#0ea5e9" },
  { key: "US", field: "us_count", label: "超音波", color: "#14b8a6" },
  { key: "BMD", field: "bmd_count", label: "骨密", color: "#f59e0b" },
  { key: "DX", field: "dx_count", label: "X 光", color: "#f97316" },
  { key: "MG", field: "mg_count", label: "乳房攝影", color: "#ec4899" },
];
const YEARS = [2023, 2024, 2025, 2026];
const COMPARISON_OPTIONS: Array<{ key: ComparisonKey; label: string; color: string }> = [
  { key: "totalClients", label: "總計（客戶數）", color: "#0891b2" },
  { key: "equipmentTotal", label: "設備總人次", color: "#475569" },
  ...EQUIPMENT.map(({ key, label, color }) => ({ key, label, color })),
];
const count = (row: MonthlyRow, field: keyof MonthlyRow) => Number(row[field] || 0);
const percentile90 = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.9) - 1)];
};

const EquipmentDemandAnalysis: React.FC = () => {
  const [year, setYear] = useState(2026);
  const [location, setLocation] = useState<LocationName>("北投");
  const [comparisonMonth, setComparisonMonth] = useState(Math.min(new Date().getMonth() + 1, 12));
  const [comparisonKey, setComparisonKey] = useState<ComparisonKey>("totalClients");
  const [lineBaseYear, setLineBaseYear] = useState(2025);
  const [lineCompareYear, setLineCompareYear] = useState(2026);
  const [lineComparisonKey, setLineComparisonKey] = useState<ComparisonKey>("MR");
  const [copied, setCopied] = useState(false);
  const [rows, setRows] = useState<MonthlyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase.from("equipment_visit_monthly").select("*").eq("location", location).gte("year", 2023).lte("year", 2026).order("year").order("month")
      .then(({ data, error: queryError }) => {
        if (cancelled) return;
        setRows((data || []) as MonthlyRow[]);
        setError(queryError?.message || "");
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [location]);

  const analysis = useMemo(() => {
    const selected = rows.filter((row) => row.year === year);
    const monthly = Array.from({ length: 12 }, (_, index) => {
      const row = selected.find((item) => item.month === index + 1);
      return {
        month: index + 1, label: `${index + 1}月`, totalClients: row?.total_clients || 0,
        finalized: row?.is_finalized || false, sourceEnd: row?.source_end_date || "",
        ...Object.fromEntries(EQUIPMENT.map(({ key, field }) => [key, row ? count(row, field) : 0])),
      } as Record<EquipmentKey, number> & { month: number; label: string; totalClients: number; finalized: boolean; sourceEnd: string };
    });
    const yearly = YEARS.map((value) => {
      const yearRows = rows.filter((row) => row.year === value);
      return {
        year: value, totalClients: yearRows.reduce((sum, row) => sum + row.total_clients, 0), months: yearRows.length,
        ...Object.fromEntries(EQUIPMENT.map(({ key, field }) => [key, yearRows.reduce((sum, row) => sum + count(row, field), 0)])),
      } as Record<EquipmentKey, number> & { year: number; totalClients: number; months: number };
    });
    const current = yearly.find((row) => row.year === year)!;
    const equipmentTotal = EQUIPMENT.reduce((sum, item) => sum + current[item.key], 0);
    const busiestMonth = monthly.reduce((best, row) => row.totalClients > best.totalClients ? row : best, monthly[0]);
    const demand = EQUIPMENT.map((item) => {
      const values = selected.flatMap((row) => row.demand_metrics?.[item.key]?.values || []);
      return { ...item, average: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0, p90: percentile90(values), peak: values.length ? Math.max(...values) : 0 };
    });
    return { monthly, yearly, current, equipmentTotal, busiestMonth, demand, latest: selected.at(-1) };
  }, [rows, year]);

  const crossYearComparison = useMemo(() => {
    const option = COMPARISON_OPTIONS.find((item) => item.key === comparisonKey)!;
    const data = YEARS.map((comparisonYear, index) => {
      const row = rows.find((item) => item.year === comparisonYear && item.month === comparisonMonth);
      let value: number | null = null;
      if (row) {
        if (comparisonKey === "totalClients") value = row.total_clients;
        else if (comparisonKey === "equipmentTotal") value = EQUIPMENT.reduce((sum, item) => sum + count(row, item.field), 0);
        else value = count(row, EQUIPMENT.find((item) => item.key === comparisonKey)!.field);
      }
      const previousRow = index > 0 ? rows.find((item) => item.year === YEARS[index - 1] && item.month === comparisonMonth) : undefined;
      let previousValue: number | null = null;
      if (previousRow) {
        if (comparisonKey === "totalClients") previousValue = previousRow.total_clients;
        else if (comparisonKey === "equipmentTotal") previousValue = EQUIPMENT.reduce((sum, item) => sum + count(previousRow, item.field), 0);
        else previousValue = count(previousRow, EQUIPMENT.find((item) => item.key === comparisonKey)!.field);
      }
      const change = value !== null && previousValue !== null && previousValue > 0
        ? ((value - previousValue) / previousValue) * 100
        : null;
      return { year: comparisonYear, label: `${comparisonYear} 年`, value, change, partial: Boolean(row && !row.is_finalized), sourceEnd: row?.source_end_date || "" };
    });
    return { option, data };
  }, [rows, comparisonMonth, comparisonKey]);

  const lineSummary = useMemo(() => {
    const option = COMPARISON_OPTIONS.find((item) => item.key === lineComparisonKey)!;
    const valueFor = (row: MonthlyRow | undefined) => {
      if (!row) return null;
      if (lineComparisonKey === "totalClients") return row.total_clients;
      if (lineComparisonKey === "equipmentTotal") return EQUIPMENT.reduce((sum, item) => sum + count(row, item.field), 0);
      return count(row, EQUIPMENT.find((item) => item.key === lineComparisonKey)!.field);
    };
    const title = lineComparisonKey === "totalClients"
      ? "客戶數"
      : lineComparisonKey === "equipmentTotal"
        ? "設備總人次"
        : `${lineComparisonKey}檢查人次`;
    const compareLabel = lineCompareYear === new Date().getFullYear() ? "今年" : `${lineCompareYear}`;
    const lines = [`【${location}｜${title}】`];
    for (let month = 1; month <= 12; month += 1) {
      const baseRow = rows.find((row) => row.year === lineBaseYear && row.month === month);
      const compareRow = rows.find((row) => row.year === lineCompareYear && row.month === month);
      const baseValue = valueFor(baseRow);
      const compareValue = valueFor(compareRow);
      const partial = compareRow && !compareRow.is_finalized
        ? `（統計至 ${compareRow.source_end_date.slice(5).replace("-", "/")}）`
        : "";
      lines.push(`${lineBaseYear}/${String(month).padStart(2, "0")}：${baseValue === null ? "" : baseValue.toLocaleString()}　${compareLabel}：${compareValue === null ? "" : compareValue.toLocaleString()}${partial}`);
    }
    lines.push(`項目：${option.label}`);
    if (lineComparisonKey === "totalClients") lines.push("註：客戶數為跨設備去重。");
    return lines.join("\n");
  }, [location, lineBaseYear, lineCompareYear, lineComparisonKey, rows]);

  const copyLineSummary = async () => {
    try {
      await navigator.clipboard.writeText(lineSummary);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = lineSummary;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  if (loading) return <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">正在讀取設備人次…</div>;
  if (error) return <div className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-rose-800">讀取設備人次失敗：{error}</div>;

  return <div className="space-y-5 pb-8">
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
      <div><h3 className="text-lg font-bold text-slate-800">各儀器人次統計</h3><p className="mt-1 text-sm text-slate-500">設備欄以日期、設備、預約單號去重；最後一欄「總計（客戶數）」跨設備只計一次。</p></div>
      <div className="flex gap-2"><select value={location} onChange={(event) => setLocation(event.target.value as LocationName)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium"><option>北投</option><option>大直</option></select><select value={year} onChange={(event) => setYear(Number(event.target.value))} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium">{YEARS.map((value) => <option key={value}>{value}</option>)}</select></div>
    </div>
    <div className="grid gap-3 md:grid-cols-4"><SummaryCard icon={<Users size={19}/>} label="總計（客戶數）" value={analysis.current.totalClients.toLocaleString()} note="跨設備去重"/><SummaryCard icon={<Activity size={19}/>} label="設備總人次" value={analysis.equipmentTotal.toLocaleString()} note="六種設備加總"/><SummaryCard icon={<CalendarRange size={19}/>} label="最多客戶月份" value={analysis.busiestMonth?.label || "—"} note={`${analysis.busiestMonth?.totalClients?.toLocaleString() || 0} 位`}/><SummaryCard icon={<MapPin size={19}/>} label="資料更新至" value={analysis.latest?.source_end_date || "—"} note={`${year} 年・${location}`}/></div>
    <TableCard title="2023–2026 年度比較"><table className="w-full min-w-[820px] text-sm"><TableHead first="年度"/><tbody className="divide-y divide-slate-100">{analysis.yearly.map((row) => <tr key={row.year} className={row.year === year ? "bg-cyan-50" : "hover:bg-slate-50"}><td className="px-4 py-3 font-bold">{row.year} 年 <span className="text-xs font-normal text-slate-400">({row.months} 個月)</span></td>{EQUIPMENT.map(({key}) => <td key={key} className="px-3 py-3 text-right tabular-nums">{row[key].toLocaleString()}</td>)}<td className="bg-slate-50 px-4 py-3 text-right font-bold tabular-nums">{row.totalClients.toLocaleString()}</td></tr>)}</tbody></table></TableCard>
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 md:flex-row md:items-end md:justify-between">
        <div><h4 className="font-bold text-slate-800">同月跨年度比較</h4><p className="mt-1 text-xs text-slate-500">固定同一月份，比較不同年度的客戶量或指定設備人次。</p></div>
        <div className="flex flex-wrap gap-2">
          <label className="text-xs font-medium text-slate-500">月份<select value={comparisonMonth} onChange={(event) => setComparisonMonth(Number(event.target.value))} className="ml-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">{Array.from({length:12},(_,index)=><option key={index+1} value={index+1}>{index+1} 月</option>)}</select></label>
          <label className="text-xs font-medium text-slate-500">比較項目<select value={comparisonKey} onChange={(event) => setComparisonKey(event.target.value as ComparisonKey)} className="ml-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">{COMPARISON_OPTIONS.map((item)=><option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
        </div>
      </div>
      <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(360px,1fr)]">
        <div className="h-[300px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={crossYearComparison.data}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis dataKey="label"/><YAxis allowDecimals={false}/><Tooltip formatter={(value:number)=>[`${Number(value).toLocaleString()} 人次`,crossYearComparison.option.label]}/><Bar dataKey="value" name={crossYearComparison.option.label} fill={crossYearComparison.option.color} radius={[6,6,0,0]}/></BarChart></ResponsiveContainer></div>
        <div className="overflow-hidden rounded-lg border border-slate-200"><table className="w-full text-sm"><thead className="bg-slate-50 text-slate-600"><tr><th className="px-3 py-2.5 text-left">年度</th><th className="px-3 py-2.5 text-right">{crossYearComparison.option.label}</th><th className="px-3 py-2.5 text-right">較前一年</th></tr></thead><tbody className="divide-y divide-slate-100">{crossYearComparison.data.map((item)=><tr key={item.year}><td className="px-3 py-3 font-bold text-slate-700">{item.year}{item.partial&&<span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">統計至 {item.sourceEnd.slice(5).replace("-","/")}</span>}</td><td className="px-3 py-3 text-right font-bold tabular-nums">{item.value===null?"—":item.value.toLocaleString()}</td><td className={`px-3 py-3 text-right font-medium tabular-nums ${item.change===null?"text-slate-400":item.change>0?"text-rose-600":item.change<0?"text-emerald-600":"text-slate-500"}`}>{item.change===null?"—":`${item.change>0?"+":""}${item.change.toFixed(1)}%`}</td></tr>)}</tbody></table></div>
      </div>
    </div>
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><h4 className="mb-1 font-bold text-slate-800">{year} 每月設備人次趨勢</h4><p className="mb-4 text-xs text-slate-500">客戶數為跨設備去重，可與六種設備人次一起觀察。</p><div className="h-[320px]"><ResponsiveContainer width="100%" height="100%"><LineChart data={analysis.monthly}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis dataKey="label"/><YAxis allowDecimals={false}/><Tooltip/><Legend/><Line type="monotone" dataKey="totalClients" name="客戶數" stroke="#0f172a" strokeWidth={3} strokeDasharray="6 3" dot={{r:3}}/>{EQUIPMENT.map(({key,label,color}) => <Line key={key} type="monotone" dataKey={key} name={label} stroke={color} strokeWidth={2} dot={{r:2}}/>)}</LineChart></ResponsiveContainer></div></div>
    <TableCard title={`${year} 每月比較表`}><table className="w-full min-w-[820px] text-sm"><TableHead first="月份"/><tbody className="divide-y divide-slate-100">{analysis.monthly.map((row) => <tr key={row.month} className="hover:bg-slate-50"><td className="px-4 py-2.5 font-medium">{row.label}{row.sourceEnd && !row.finalized && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">更新中</span>}</td>{EQUIPMENT.map(({key}) => <td key={key} className="px-3 py-2.5 text-right tabular-nums">{row[key].toLocaleString()}</td>)}<td className="bg-slate-50 px-4 py-2.5 text-right font-bold tabular-nums">{row.totalClients.toLocaleString()}</td></tr>)}</tbody><tfoot className="border-t-2 bg-cyan-50 font-bold"><tr><td className="px-4 py-3">年度合計</td>{EQUIPMENT.map(({key}) => <td key={key} className="px-3 py-3 text-right">{analysis.current[key].toLocaleString()}</td>)}<td className="px-4 py-3 text-right">{analysis.current.totalClients.toLocaleString()}</td></tr></tfoot></table></TableCard>
    <TableCard title="排班需求參考（有量工作日）"><table className="w-full min-w-[620px] text-sm"><thead className="bg-slate-50 text-slate-600"><tr><th className="px-4 py-3 text-left">設備</th><th className="px-4 py-3 text-right">日平均</th><th className="px-4 py-3 text-right">P90 日人次</th><th className="px-4 py-3 text-right">尖峰日人次</th><th className="px-4 py-3 text-left">排班用途</th></tr></thead><tbody className="divide-y">{analysis.demand.map((item) => <tr key={item.key}><td className="px-4 py-3 font-bold" style={{color:item.color}}>{item.label}</td><td className="px-4 py-3 text-right">{item.average.toFixed(1)}</td><td className="px-4 py-3 text-right font-bold">{item.p90}</td><td className="px-4 py-3 text-right font-bold text-rose-600">{item.peak}</td><td className="px-4 py-3 text-slate-600">日常以 P90 配置；尖峰日預留跨站支援</td></tr>)}</tbody></table></TableCard>
    <div className="rounded-xl border border-emerald-200 bg-white shadow-sm">
      <div className="border-b border-emerald-100 bg-emerald-50/60 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><h4 className="font-bold text-slate-800">LINE 逐月比較摘要</h4><p className="mt-1 text-xs text-slate-500">自由選擇兩個年度與統計項目，產生 12 個月的 LINE 比較文字。</p></div><button type="button" onClick={copyLineSummary} className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-white transition ${copied ? "bg-emerald-600" : "bg-slate-800 hover:bg-slate-700"}`}>{copied ? <Check size={17}/> : <ClipboardCopy size={17}/>} {copied ? "已複製" : "複製 LINE 文字"}</button></div>
        <div className="mt-4 flex flex-wrap gap-3">
          <label className="text-xs font-medium text-slate-600">基準年度<select value={lineBaseYear} onChange={(event)=>setLineBaseYear(Number(event.target.value))} className="ml-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">{YEARS.map((value)=><option key={value} value={value} disabled={value===lineCompareYear}>{value}</option>)}</select></label>
          <label className="text-xs font-medium text-slate-600">比較年度<select value={lineCompareYear} onChange={(event)=>setLineCompareYear(Number(event.target.value))} className="ml-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">{YEARS.map((value)=><option key={value} value={value} disabled={value===lineBaseYear}>{value}</option>)}</select></label>
          <label className="text-xs font-medium text-slate-600">比較項目<select value={lineComparisonKey} onChange={(event)=>setLineComparisonKey(event.target.value as ComparisonKey)} className="ml-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">{COMPARISON_OPTIONS.map((item)=><option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
        </div>
      </div>
      <div className="p-4"><pre className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-4 font-sans text-sm leading-7 text-slate-700">{lineSummary}</pre></div>
    </div>
  </div>;
};

const TableHead = ({first}:{first:string}) => <thead className="bg-slate-50 text-slate-600"><tr><th className="px-4 py-3 text-left">{first}</th>{EQUIPMENT.map(({key,label}) => <th key={key} className="px-3 py-3 text-right">{label}</th>)}<th className="bg-slate-100 px-4 py-3 text-right">總計（客戶數）</th></tr></thead>;
const TableCard = ({title,children}:{title:string;children:React.ReactNode}) => <div className="rounded-xl border border-slate-200 bg-white shadow-sm"><div className="border-b p-4"><h4 className="font-bold text-slate-800">{title}</h4></div><div className="overflow-x-auto">{children}</div></div>;
const SummaryCard = ({icon,label,value,note}:{icon:React.ReactNode;label:string;value:string;note:string}) => <div className="rounded-xl border bg-white p-4 shadow-sm"><div className="flex items-center gap-2 text-sm text-slate-500">{icon}{label}</div><div className="mt-2 text-2xl font-bold tabular-nums">{value}</div><div className="mt-1 text-xs text-slate-500">{note}</div></div>;
export default EquipmentDemandAnalysis;
