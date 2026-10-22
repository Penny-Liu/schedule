import React, { useEffect, useRef, useState } from "react";
import { Copy, Download } from "lucide-react";
import { canCopyPngAutomatically } from "../../services/clipboard";
import { db } from "../../services/store";
import { buildMrChartDays, getMrChartDates, getMrChartRange, type MrChartPreset } from "../../services/mrUtilizationChart";
import { drawMrUtilizationChart, mrChartPng } from "../../services/mrUtilizationChartImage";
import { loadRadiographerStatisticsMonths } from "../../services/radiographerStatisticsData";

const presets: Array<[MrChartPreset, string]> = [["20", "未來20天"], ["past20", "近20天（含當日）"], ["week", "本週"], ["nextWeek", "下週"], ["14", "未來14天"], ["30", "未來30天"], ["custom", "自訂日期"]];

export const MrUtilizationChart: React.FC<{ date: string }> = ({ date }) => {
  const [preset, setPreset] = useState<MrChartPreset>("20");
  const [custom, setCustom] = useState(() => getMrChartRange(date, "20"));
  const [showSunday, setShowSunday] = useState(true);
  const [includeSunday, setIncludeSunday] = useState(false);
  const [warning, setWarning] = useState(60);
  const [target, setTarget] = useState(80);
  const [revision, setRevision] = useState(0);
  const [loaded, setLoaded] = useState("");
  const [retry, setRetry] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [preview, setPreview] = useState<{ key: string; url: string; blob: Blob } | null>(null);
  const [displayedUrl, setDisplayedUrl] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [nativeCopy, setNativeCopy] = useState(false);
  const nativeCopyPanel = useRef<HTMLDivElement>(null);
  const automaticCopy = canCopyPngAutomatically();
  const range = preset === "custom" ? custom : getMrChartRange(date, preset);
  const dates = getMrChartDates(range.start, range.end);
  const rangeKey = `${range.start}/${range.end}`;
  const validThresholds = Number.isFinite(warning) && Number.isFinite(target) && warning > 0 && warning < target && target <= 200;
  const renderKey = JSON.stringify([rangeKey, showSunday, includeSunday, warning, target, revision, retry]);
  const ready = loaded === rangeKey && preview?.key === renderKey && displayedUrl === preview.url && dates.length > 0 && validThresholds && !loadError;

  useEffect(() => db.subscribe(() => setRevision((value) => value + 1)), []);
  useEffect(() => {
    let cancelled = false;
    setLoaded("");
    setLoadError("");
    setMessage("");
    const selected = getMrChartDates(range.start, range.end);
    if (!selected.length) return;
    const months = [...new Set(selected.map((day) => day.slice(0, 7)))];
    loadRadiographerStatisticsMonths(months, (year, month) => db.loadDataForMonth(year, month, { requireComplete: true }))
      .then(() => { if (!cancelled) setLoaded(rangeKey); })
      .catch(() => { if (!cancelled) setLoadError("排程資料載入失敗，請重試。"); });
    return () => { cancelled = true; };
  }, [range.start, range.end, rangeKey, retry]);

  useEffect(() => {
    let cancelled = false;
    let imageUrl: string | undefined;
    setPreview(null);
    setNativeCopy(false);
    setMessage("");
    if (loaded !== rangeKey || !validThresholds || !dates.length) return;
    const render = async () => {
      try {
        await document.fonts.ready;
        if (cancelled) return;
        const canvas = document.createElement("canvas");
        drawMrUtilizationChart(canvas, {
          ...range, days: buildMrChartDays(dates, db.getHolidays(), (day) => db.getDailyStats(day)),
          showSunday, includeSunday, warning, target,
        });
        const blob = await mrChartPng(canvas);
        if (cancelled) return;
        imageUrl = URL.createObjectURL(blob);
        setPreview({ key: renderKey, url: imageUrl, blob });
      } catch {
        if (!cancelled) setMessage("圖卡產生失敗，請重新整理後重試。");
      }
    };
    void render();
    return () => {
      cancelled = true;
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [loaded, renderKey]);

  useEffect(() => {
    if (nativeCopy) nativeCopyPanel.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [nativeCopy]);

  const exportImage = async (copy: boolean) => {
    if (!ready || !preview || busy) return;
    setMessage("");
    if (copy && !automaticCopy) {
      setNativeCopy(true);
      setMessage("尚未更新剪貼簿：請對下方目前圖卡按右鍵，選擇「複製圖片」後再貼至 LINE。");
      return;
    }
    setBusy(true);
    try {
      // Export the exact PNG already loaded in the preview, without redrawing.
      if (copy) {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": preview.blob })]);
        setMessage("已複製圖片，可以到 LINE 貼上。");
      } else {
        const url = URL.createObjectURL(preview.blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `MR運用率-${range.start}-${range.end}.png`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        setMessage("已下載 PNG，可將圖片傳至 LINE。");
      }
    } catch {
      if (copy) setNativeCopy(true);
      setMessage(copy ? "此次未能更新剪貼簿，請勿貼上舊圖。請對下方目前圖卡按右鍵，選擇「複製圖片」，或下載 PNG。" : "圖片下載失敗，請重試。");
    } finally {
      setBusy(false);
    }
  };
  const inputClass = "rounded border border-slate-300 bg-white px-2 py-1.5 text-sm";
  return (
    <section className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-3" aria-label="MR 運用率圖卡">
      <h4 className="font-bold text-sky-900">MR 運用率圖卡</h4>
      <p className="my-2 text-xs text-slate-600">以今日視角選取的 {date} 為基準，本週從週一開始；未來天數從隔天起算。週六及國定假日納入。</p>
      <fieldset disabled={busy}>
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm">日期範圍
          <select className={inputClass} value={preset} onChange={(event) => {
            if (event.target.value === "custom") setCustom(range);
            setPreset(event.target.value as MrChartPreset);
          }}>{presets.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        </label>
        {preset === "custom" && <>
          <label className="grid gap-1 text-sm">開始日期<input className={inputClass} type="date" value={custom.start} onChange={(event) => setCustom({ ...custom, start: event.target.value })} /></label>
          <label className="grid gap-1 text-sm">結束日期<input className={inputClass} type="date" value={custom.end} onChange={(event) => setCustom({ ...custom, end: event.target.value })} /></label>
        </>}
        <label className="grid gap-1 text-sm">低運用率警示（%）<input className={`${inputClass} w-24`} type="number" min="1" max={target - 1} value={warning} onChange={(event) => setWarning(Number(event.target.value))} /></label>
        <label className="grid gap-1 text-sm">目標運用率（%）<input className={`${inputClass} w-24`} type="number" min={warning + 1} max="200" value={target} onChange={(event) => setTarget(Number(event.target.value))} /></label>
      </div>
      <div className="my-3 flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={showSunday} onChange={(event) => setShowSunday(event.target.checked)} />圖表顯示星期日</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={includeSunday} onChange={(event) => setIncludeSunday(event.target.checked)} />平均與警示統計納入星期日</label>
      </div>
      </fieldset>
      {!dates.length && <p role="alert" className="my-2 text-sm text-red-700">請選擇有效的起訖日期，最多可呈現62天。</p>}
      {!validThresholds && <p role="alert" className="my-2 text-sm text-red-700">警示值須大於0且低於目標值，目標值最高200%。</p>}
      {loadError && <p role="alert" className="my-2 text-sm text-red-700">{loadError} <button type="button" className="underline" onClick={() => setRetry((value) => value + 1)}>重新載入</button></p>}
      {!ready && !loadError && dates.length > 0 && validThresholds && !message && <p role="status" className="my-2 text-sm text-slate-600">正在準備圖卡…</p>}
      <div className="mb-3 flex flex-wrap gap-2">
        <button type="button" disabled={!ready || busy} onClick={() => void exportImage(true)} className="flex items-center gap-1 rounded-lg bg-sky-700 px-3 py-2 text-sm text-white disabled:opacity-40"><Copy size={15} />{automaticCopy ? "複製圖片" : "複製圖片（右鍵方式）"}</button>
        <button type="button" disabled={!ready || busy} onClick={() => void exportImage(false)} className="flex items-center gap-1 rounded-lg border border-sky-300 bg-white px-3 py-2 text-sm text-sky-800 disabled:opacity-40"><Download size={15} />下載 PNG</button>
      </div>
      {!automaticCopy && <p className="mb-2 text-sm text-slate-700">目前連線不支援自動複製圖片；請對下方圖卡按右鍵 →「複製圖片」，或下載 PNG。</p>}
      {busy && <p role="status" className="mb-2 text-sm text-sky-900">正在處理 {range.start} ～ {range.end} 的圖片，請等待完成後再貼上。</p>}
      {nativeCopy && ready && preview && <div ref={nativeCopyPanel} className="mb-3 rounded-lg border-2 border-amber-400 bg-amber-50 p-3 text-sm text-amber-950">
        <p className="font-bold">請複製下方這張完整圖卡：{range.start} ～ {range.end}</p>
        <p className="my-1">在圖片上按滑鼠右鍵，選擇「複製圖片」，再到 LINE 貼上。這個按鈕尚未更動剪貼簿。</p>
        <a href={preview.url} target="_blank" rel="noopener noreferrer" className="font-bold underline">開啟目前完整圖卡，再按右鍵複製</a>
      </div>}
      {message && <p role="status" className="mb-3 text-sm text-sky-900">{message}</p>}
      {preview && <img
        src={preview.url}
        alt={`北投 MR 運用率，${range.start} 至 ${range.end}；${includeSunday ? "包含" : "排除"}星期日統計`}
        onLoad={() => setDisplayedUrl(preview.url)}
        onError={() => setMessage("圖卡載入失敗，請重新整理後重試。")}
        className={`h-auto w-full rounded-lg bg-white ${ready ? "" : "hidden"}`}
      />}
    </section>
  );
};
