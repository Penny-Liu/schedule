# 行政排班功能

## 功能概述

行政排班功能專門用於管理行政人員的排班，包括客服、智基、資訊、報告、行政等分類。支援快速假日排班和人員管理功能。

## 主要功能

### 1. 人員管理

- 新增/編輯/刪除行政人員
- 分類管理：客服、智基、資訊、報告、行政
- 人員基本信息管理（姓名、電話、郵件等）

### 2. 排班管理

- 月曆式排班表顯示
- 支援班別：全日、上午、下午、假日
- 支援地點：北投、大直
- 假日自動標記（週六、日）

### 3. 快速排班

- 選擇特定人員後，可快速為其安排整個月的班別
- 支援按班別類型和地點進行批量排班
- 智能跳過已存在的排班

### 4. 數據匯出

- PDF 格式匯出排班表
- 包含完整月份的排班信息

## 數據庫設置

運行以下 SQL 腳本創建所需的数据表：

```sql
-- 執行 scripts/create_administrative_tables.sql
```

該腳本將創建：

- `administrative_staff` 表：存儲行政人員信息
- `administrative_shifts` 表：存儲排班數據

## 權限設置

新增的權限：

- `VIEW_ADMINISTRATIVE`: 查看行政排班
- `EDIT_ADMINISTRATIVE`: 編輯行政排班

需要在用戶角色中配置相應權限。

## 使用說明

1. **訪問功能**：在側邊欄的「行政」分類中點擊「排班表」

2. **管理人員**：
   - 點擊「管理人員」按鈕
   - 填寫人員信息並選擇分類
   - 可編輯或刪除現有人員

3. **快速排班**：
   - 在人員列表中點擊人員頭像選擇該人員
   - 在快速排班面板中選擇班別和地點
   - 點擊對應按鈕為整個月安排班別

4. **手動調整**：可在排班表格中直接修改個別日期的班別

5. **儲存變更**：點擊「儲存排班」按鈕保存所有修改

## 技術實現

- **前端**：React + TypeScript
- **數據庫**：Supabase (PostgreSQL)
- **UI 組件**：Tailwind CSS + Lucide Icons
- **PDF 匯出**：jsPDF + autoTable

## 文件結構

```
pages/
  AdministrativeSchedulePage.tsx    # 主要排班頁面

components/
  # 共用組件已在頁面內實現

scripts/
  create_administrative_tables.sql  # 數據庫建表腳本

types.ts                           # 新增權限定義
App.tsx                           # 新增路由
components/Sidebar.tsx            # 新增導航項目
```
