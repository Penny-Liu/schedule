import { spawn } from 'child_process';

const p = spawn('node', ['scripts/sync-all-to-supabase.mjs']);

p.stdout.on('data', (data) => {
  const str = data.toString();
  process.stdout.write(str);
  
  if (str.includes('[1/3] 每日統計')) {
    p.stdin.write('y\n');
  } else if (str.includes('開始日期')) {
    p.stdin.write('2026-07-28\n');
  } else if (str.includes('結束日期')) {
    p.stdin.write('2026-07-28\n');
  } else if (str.includes('[2/3] 排班表')) {
    p.stdin.write('n\n');
  } else if (str.includes('[3/3] 放射師')) {
    p.stdin.write('n\n');
  }
});

p.stderr.on('data', data => console.error(data.toString()));
p.on('close', code => console.log(`Done with code ${code}`));
