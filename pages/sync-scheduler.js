import express from "express";
import { spawn } from "child_process";
import { validateSyncPayload } from "./syncValidation.js";

const app = express();
app.use(express.json({ limit: "32kb" }));

const SYNC_TIMEOUT_MS = 10 * 60 * 1000;
let isSyncRunning = false;

// 執行同步腳本的 Helper
const runSyncBlocks = (payloadStr) => {
  return new Promise((resolve, reject) => {
    console.log(`[Sync] 開始執行同步任務...`);

    const envObj = { ...process.env };
    if (payloadStr) envObj.SYNC_PAYLOAD = payloadStr;

    // 移除 shell: true 避免 Node 24 跳出警告，並支援跨平台 npm 指令
    const npmCmd = /^win/.test(process.platform) ? "npm.cmd" : "npm";
    const child = spawn(npmCmd, ["run", "sync-stats"], {
      env: envObj,
      stdio: "inherit", // 將輸出導向目前的終端機介面
    });

    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback(value);
    };

    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      finish(reject, new Error("同步任務逾時"));
    }, SYNC_TIMEOUT_MS);

    child.once("error", (error) => finish(reject, error));

    child.once("close", (code) => {
      if (code === 0) {
        console.log(`\n[Sync] 執行完成`);
        finish(resolve);
      } else {
        console.error(`\n[Sync] 執行失敗，離開碼: ${code}`);
        finish(reject, new Error(`執行失敗，離開碼: ${code}`));
      }
    });
  });
};

// 1. 給前端呼叫的 API 端點
app.post("/api/sync-stats", async (req, res) => {
  if (isSyncRunning) {
    return res.status(409).json({ success: false, error: "已有同步任務執行中" });
  }

  try {
    const { syncPayload } = req.body || {};
    const validatedPayload = validateSyncPayload(syncPayload);

    isSyncRunning = true;
    await runSyncBlocks(validatedPayload);

    res.json({ success: true, message: "同步任務已完成！" });
  } catch (err) {
    const isValidationError = err instanceof Error && err.message.startsWith("syncPayload") ||
      err instanceof Error && err.message.startsWith("Task") ||
      err instanceof Error && err.message.startsWith("Each") ||
      err instanceof Error && err.message.startsWith("At least") ||
      err instanceof Error && err.message.startsWith("start") ||
      err instanceof Error && err.message.startsWith("end");
    const status = isValidationError ? 400 : 500;
    console.error("[Sync] Request failed:", err);
    res.status(status).json({
      success: false,
      error: status === 400 ? err.message : "同步任務執行失敗",
    });
  } finally {
    isSyncRunning = false;
  }
});

// 每日自動排程已停用，改為手動進行同步
// cron.schedule(
//   "0 14 * * *",
//   async () => { ... },
//   { scheduled: true, timezone: "Asia/Taipei" },
// );


const PORT = 3001;
const HOST = "127.0.0.1";
app.listen(PORT, HOST, () => {
  console.log(`🚀 排程伺服器已啟動，正在監聽 http://localhost:${PORT}`);
});

export default app;
