# scripts/

這個資料夾目前混有「正式會用到的 CLI」與「開發期間的探勘/除錯版本」。以下整理哪些是目前專案會用到的、哪些偏一次性。

## 目前專案會用到（package.json 有掛 npm script）

- `scripts/sync-all-to-supabase.mjs`：`npm run sync-stats`
- `scripts/sync-salesforce-daily-stats.mjs`：`npm run sf:sync-daily-stats`
- `scripts/salesforce-list-objects.mjs`：`npm run sf:list-objects`
- `scripts/salesforce-describe-object.mjs`：`npm run sf:describe -- <ObjectApiName>`

## 共用模組（被多支 script import）

- `scripts/salesforce-utils.mjs`：Salesforce auth / SOQL / describe / list 工具

## 偏一次性/除錯/舊版（已移到 scripts/_archive/）

以下檔案在 repo 內找不到被 `npm script` 或其他程式直接引用（用 `rg` 搜尋不到引用點），多半是開發期間用來找欄位、核對邏輯、或產出某一版統計；目前已用 `git mv` 移到 `scripts/_archive/` 保留。

- 統計舊版/試算：`scripts/_archive/stats/get_all_stats.mjs`, `scripts/_archive/stats/get_ultimate_all_stats.mjs`, `scripts/_archive/stats/get_beitou_stats.mjs`, `scripts/_archive/stats/get_beitou_stats_v2.mjs`, `scripts/_archive/stats/get_dazhi_stats.mjs`, `scripts/_archive/stats/get_dazhi_stats_v2.mjs`
- Salesforce 欄位/物件探勘：`scripts/_archive/sf-introspection/check_objects.mjs`, `scripts/_archive/sf-introspection/describe_fields.mjs`, `scripts/_archive/sf-introspection/find_date_fields.mjs`, `scripts/_archive/sf-introspection/detect_id_field.mjs`
- 個案除錯：`scripts/_archive/debug/analyze_mr.mjs`, `scripts/_archive/debug/debug_beitou_discrepancy.mjs`, `scripts/_archive/debug/diagnose_beitou.mjs`
- Python 原型：`scripts/_archive/python/fetch_sf_stats.py`（需要額外 Python 套件，Node 專案目前未使用）

## 建議清理方式（安全、不破壞）

1. 保留「目前專案會用到」與 `scripts/salesforce-utils.mjs` 在 `scripts/` 根目錄。
2. `scripts/_archive/` 的檔案先留著；確認一段時間都不需要後再刪除。
