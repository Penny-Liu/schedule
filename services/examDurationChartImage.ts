import type { DurationComparison } from './examDurationComparison';

export const drawExamDurationChart = (
  canvas: HTMLCanvasElement,
  rows: DurationComparison[],
  title: string,
  period: string,
) => {
  const width = 1080;
  const height = 190 + Math.max(1, rows.length) * 58;
  canvas.width = width * 2;
  canvas.height = height * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('無法建立圖卡，請換用支援圖片的瀏覽器。');
  ctx.scale(2, 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.textAlign = 'left';

  const text = (value: string, x: number, y: number, size = 20, color = '#334155', bold = false) => {
    ctx.font = `${bold ? 700 : 400} ${size}px "Noto Sans TC", "PingFang TC", sans-serif`;
    ctx.fillStyle = color;
    ctx.fillText(value, x, y);
  };

  text(title, 32, 58, 32, '#0f172a', true);
  text(`統計期間：${period}｜依姓名排列，耗時不代表品質`, 32, 94, 20, '#64748b');
  text('圓點：目前平均耗時　直線：排程標準（彙總依檢查組合加權）', 32, 126, 18, '#64748b');
  const max = Math.ceil(Math.max(...rows.flatMap(row=>[row.value??0,row.standardMinutes??0]),1)*1.12);
  const left = 170;
  const plotWidth = 790;
  const position = (value: number) => left + value / max * plotWidth;

  for (let tick = 0; tick <= 4; tick++) {
    const value = max * tick / 4;
    const x = position(value);
    ctx.strokeStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.moveTo(x, 150);
    ctx.lineTo(x, height - 35);
    ctx.stroke();
    ctx.textAlign = 'center';
    text(`${value.toFixed(1)}分`, x, 145, 16, '#64748b');
  }
  ctx.textAlign = 'left';

  rows.forEach((row, index) => {
    const y = 182 + index * 58;
    text(row.radiographer_name, 32, y + 7, 20, '#334155', true);
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(left, y - 10, plotWidth, 12);
    if (row.standardMinutes != null) {
      ctx.strokeStyle='#334155';ctx.lineWidth=2;ctx.beginPath();
      ctx.moveTo(position(row.standardMinutes),y-18);ctx.lineTo(position(row.standardMinutes),y+10);ctx.stroke();
    }
    if (row.eligible && row.value !== null) {
      ctx.fillStyle = row.durationZone === 'faster' ? '#059669' : row.durationZone === 'slower' ? '#d97706' : '#0284c7';
      ctx.beginPath();
      ctx.arc(position(row.value), y - 4, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(position(row.value), y - 4, 3, 0, Math.PI * 2);
      ctx.fill();
      text(`${row.value.toFixed(1)}分`, position(row.value) + 12, y + 2, 17, '#334155', true);
    }
    const zone = row.eligible ? (row.comparable ? (row.durationZone === 'faster' ? '標準時間內' : row.durationZone === 'slower' ? '超出標準' : '標準時間內') : '持續觀察') : row.reference;
    ctx.textAlign = 'right';
    text(zone, width - 32, y + 3, 18, '#64748b');
    ctx.textAlign = 'left';
  });
};

export const examDurationChartPng = (canvas: HTMLCanvasElement): Promise<Blob> => new Promise((resolve, reject) => {
  canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('圖片產生失敗，請重試。')), 'image/png');
});
