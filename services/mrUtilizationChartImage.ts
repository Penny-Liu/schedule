import { mrChartDateLabel, summarizeMrChart, type MrChartDay } from "./mrUtilizationChart";

export type MrChartImageOptions = {
  start: string; end: string; days: MrChartDay[];
  showSunday: boolean; includeSunday: boolean; warning: number; target: number;
};

/** Draw the preview and exported PNG from the same canvas, with no external images. */
export const drawMrUtilizationChart = (canvas: HTMLCanvasElement, options: MrChartImageOptions) => {
  const { start, end, days, showSunday, includeSunday, warning, target } = options;
  const visible = days.filter((day) => showSunday || !day.sunday);
  const summary = summarizeMrChart(days, includeSunday, warning);
  const rows = Math.max(1, Math.ceil(visible.length / 10));
  const width = 1080;
  const height = 570 + rows * 390;
  canvas.width = width * 2;
  canvas.height = height * 2;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("無法建立圖卡，請換用支援圖片的瀏覽器。");
  ctx.scale(2, 2);
  const font = '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif';
  const text = (value: string, x: number, y: number, size = 22, color = "#334155", bold = false) => {
    ctx.font = `${bold ? 700 : 400} ${size}px ${font}`;
    ctx.fillStyle = color;
    ctx.fillText(value, x, y);
  };
  const panel = (x: number, y: number, w: number, h: number, color: string, radius: number | number[] = 18) => {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.fillStyle = color;
    ctx.fill();
  };
  const color = (percent: number) => percent < warning ? "#ef4444" : percent < target ? "#f97316" : "#059669";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  text("MR 設備運用率監控", 32, 62, 36, "#0f172a", true);
  text(`北投 MR｜追蹤期間：${mrChartDateLabel(start)} ～ ${mrChartDateLabel(end)}`, 32, 104, 22, "#64748b");
  const average = summary.average;
  const cards = [
    ["整體平均運用率", average === null ? "—" : `${average.toFixed(1)}%`,
      average === null ? "尚無可統計資料" : `${average >= target ? "已達" : "未達"}目標 ${target}%`, average === null ? "#64748b" : color(average)],
    ["低運用率天數", `${summary.lowDays} 天`, `運用率 < ${warning}%`, "#ef4444"],
    ["最高單日運用率", summary.highest ? `${summary.highest.percent.toFixed(1)}%` : "—",
      summary.highest ? mrChartDateLabel(summary.highest.date) : "尚無可統計資料", summary.highest ? color(summary.highest.percent) : "#64748b"],
  ];
  cards.forEach(([label, value, detail, valueColor], index) => {
    const x = 32 + index * 344;
    panel(x, 132, 328, 144, "#f1f5f9");
    text(label, x + 18, 168, 21, "#64748b");
    text(value, x + 18, 217, 38, valueColor, true);
    text(detail, x + 18, 252, 19, "#64748b");
  });
  panel(32, 296, 1016, 104, summary.lowDays ? "#fff1f2" : "#eff6ff");
  text("排程觀察", 50, 331, 23, summary.lowDays ? "#be123c" : "#1d4ed8", true);
  const observation = average === null ? "目前沒有可統計的排程資料，請先更新工作量資料。"
    : `平均 ${average.toFixed(1)}%，${average >= target ? "已達" : "未達"} ${target}% 目標；${summary.lowDays} 天低於 ${warning}%${summary.lowest === null ? "" : `，最低 ${summary.lowest.toFixed(1)}%`}。`;
  text(observation, 50, 370, 22, "#334155");
  text("每日運用率分布", 32, 448, 25, "#0f172a", true);
  text(`紅：<${warning}%　橘：${warning}%～<${target}%　綠：≥${target}%`, 330, 448, 20, "#64748b");

  const max = Math.max(100, Math.ceil(Math.max(target, ...visible.map((day) => day.percent ?? 0)) / 20) * 20);
  const ticks = 5;
  for (let row = 0; row < rows; row++) {
    const group = visible.slice(row * 10, row * 10 + 10);
    const top = 530 + row * 390;
    const bottom = top + 260;
    const left = 105;
    const plotWidth = 910;
    for (let i = 0; i <= ticks; i++) {
      const value = max * i / ticks;
      const y = bottom - value / max * 260;
      ctx.strokeStyle = "#e2e8f0";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(left + plotWidth, y); ctx.stroke();
      ctx.textAlign = "right";
      text(`${Math.round(value)}%`, left - 14, y + 6, 18, "#64748b");
      ctx.textAlign = "left";
    }
    const targetY = bottom - target / max * 260;
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = "#059669"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(left, targetY); ctx.lineTo(left + plotWidth, targetY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.textAlign = "right";
    text(`目標 ${target}%`, left + plotWidth, top - 45, 18, "#047857", true);
    ctx.textAlign = "left";
    const step = plotWidth / Math.max(group.length, 7);
    group.forEach((day, index) => {
      const center = left + step * (index + 0.5);
      const excluded = day.sunday && !includeSunday;
      if (day.percent !== null) {
        const barHeight = day.percent / max * 260;
        panel(center - 22, bottom - Math.max(2, barHeight), 44, Math.max(2, barHeight), excluded ? "#94a3b8" : color(day.percent), [12, 12, 0, 0]);
        ctx.textAlign = "center";
        text(`${day.percent.toFixed(1)}%`, center, bottom - barHeight - 12, 19, excluded ? "#64748b" : color(day.percent), true);
      } else {
        ctx.textAlign = "center";
        text("無資料", center, bottom - 14, 17, "#94a3b8");
      }
      const [shortDate, weekday] = mrChartDateLabel(day.date).split(" ");
      ctx.textAlign = "center";
      text(shortDate, center, bottom + 30, 19, "#475569");
      text(weekday, center, bottom + 56, 18, day.sunday ? "#e11d48" : "#64748b");
      if (excluded) text("不計統計", center, bottom + 80, 14, "#64748b");
      ctx.textAlign = "left";
    });
    if (!group.length) text("此範圍沒有可顯示的日期", 360, top + 140, 24, "#64748b");
  }
  text(`統計${includeSunday ? "包含" : "排除"}星期日｜有效 ${summary.knownDays} 天，無資料 ${summary.missingDays} 天（不計平均）`, 32, height - 62, 20, "#64748b");
  text("平均採每日運用率算術平均；依目前預約資料估算，實際安排以現場調度為準。", 32, height - 28, 19, "#64748b");
};

export const mrChartPng = (canvas: HTMLCanvasElement): Promise<Blob> => new Promise((resolve, reject) => {
  canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("圖片產生失敗，請重試。")), "image/png");
});
