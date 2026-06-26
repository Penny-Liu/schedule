import { spawn } from 'child_process';
const child = spawn('node', ['scripts/sync-all-to-supabase.mjs'], { stdio: 'pipe' });

child.stdout.on('data', (data) => {
  const str = data.toString();
  process.stdout.write(str);
  
  if (str.includes('--- [1/3] 每日統計 (醫令數與客戶量) ---')) {
    setTimeout(() => child.stdin.write('n\n'), 200);
  } else if (str.includes('--- [2/3] 放射師工作量統計 ---')) {
    setTimeout(() => child.stdin.write('y\n'), 200);
  } else if (str.includes('各檢查量開始日期')) {
    setTimeout(() => child.stdin.write('2026-06-06\n'), 200);
  } else if (str.includes('各檢查量結束日期')) {
    setTimeout(() => child.stdin.write('2026-07-05\n'), 200);
  } else if (str.includes('影像報告校對開始日期')) {
    setTimeout(() => child.stdin.write('2026-06-01\n'), 200);
  } else if (str.includes('影像報告校對結束日期')) {
    setTimeout(() => child.stdin.write('2026-06-30\n'), 200);
  } else if (str.includes('--- [3/3] 影像醫師工作量分類 (大套/小套) ---')) {
    setTimeout(() => child.stdin.write('n\n'), 200);
  } else if (str.includes('要同步此區塊嗎？ [Y/n]:')) {
    if (!str.includes('--- [1/3]') && !str.includes('--- [2/3]') && !str.includes('--- [3/3]')) {
       setTimeout(() => child.stdin.write('n\n'), 200);
    }
  }
});
child.stderr.on('data', (data) => {
  process.stderr.write(data.toString());
});
child.on('close', (code) => {
  console.log(`child process exited with code ${code}`);
});
