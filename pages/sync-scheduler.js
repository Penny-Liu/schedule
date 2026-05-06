import express from "express";
import cron from "node-cron";
import { spawn } from "child_process";

const app = express();
app.use(express.json());

// 執行同步腳本的 Helper
const runSyncBlocks = (blocks) => {
  return new Promise((resolve, reject) => {
    const blockStr = blocks.join(",");
    console.log(`[Sync] 開始執行同步，指定區塊: ${blockStr}`);

    // 移除 shell: true 避免 Node 24 跳出警告，並支援跨平台 npm 指令
    const npmCmd = /^win/.test(process.platform) ? "npm.cmd" : "npm";
    const child = spawn(npmCmd, ["run", "sync-stats"], {
      env: { ...process.env, SYNC_BLOCKS: blockStr },
      stdio: "inherit", // 將輸出導向目前的終端機介面
    });

    child.on("close", (code) => {
      if (code === 0) {
        console.log(`\n[Sync] 執行完成`);
        resolve();
      } else {
        console.error(`\n[Sync] 執行失敗，離開碼: ${code}`);
        reject(new Error(`執行失敗，離開碼: ${code}`));
      }
    });
  });
};

// 1. 給前端呼叫的 API 端點
app.post("/api/sync-stats", async (req, res) => {
  try {
    const { blocks } = req.body;
    if (!blocks || !Array.isArray(blocks)) {
      return res.status(400).json({ error: "無效的區塊參數" });
    }

    // 改為 await 等待腳本確實執行完畢，再回應給前端
    await runSyncBlocks(blocks);

    res.json({ success: true, message: "同步任務已完成！" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. 每天 14:00 自動執行區塊 1 與 3
cron.schedule(
  "0 14 * * *",
  async () => {
    console.log("⏳ 觸發每日 14:00 自動排程：同步區塊 1 與 3");
    try {
      await runSyncBlocks([1, 3]);
      console.log("✅ 每日排程同步完成");
    } catch (err) {
      console.error("❌ 每日排程同步失敗:", err);
    }
  },
  {
    scheduled: true,
    timezone: "Asia/Taipei", // 設定正確時區
  },
);

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`🚀 排程伺服器已啟動，正在監聽 http://localhost:${PORT}`);
});

export default app;
