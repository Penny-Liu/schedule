import { spawnSync } from 'child_process';
spawnSync('node', ['scripts/sync-all-to-supabase.mjs'], { 
  input: 'n\ny\n2026-06-06\n2026-07-05\n2026-06-01\n2026-06-30\nn\n',
  stdio: 'inherit'
});
