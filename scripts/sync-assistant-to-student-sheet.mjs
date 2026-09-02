import { createSign } from "node:crypto";
import { pathToFileURL } from "node:url";

import { createClient } from "@supabase/supabase-js";

export const STUDENT_SCHEDULE_SPREADSHEET_ID =
  "1PNr44vLyB8h5hOzXWEDVHC0oSEW9hTFIH2W9yuCmdoo";
export const STUDENT_SCHEDULE_SHEET = "Shifts";
export const STUDENT_SCHEDULE_SHEET_ID = 408801150;
export const ASSISTANT_STATION = "助理";

const GOOGLE_SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const MANAGED_MARKER_PATTERN = /【放射師助理：[^】\r\n]*】/gu;

const requireEnvironment = (...names) => {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  throw new Error(`缺少必要環境變數：${names.join(" 或 ")}`);
};

const encodeBase64Url = (value) =>
  Buffer.from(value)
    .toString("base64")
    .replace(/=/gu, "")
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_");

export const getDisplayName = (fullName) => {
  const characters = Array.from(String(fullName || "").trim());
  return characters.slice(-2).join("");
};

export const removeManagedAssistantMarker = (memo) =>
  String(memo ?? "")
    .replace(MANAGED_MARKER_PATTERN, "")
    .split(/\r?\n/u)
    .filter((line, index, lines) => {
      if (line.trim() !== "") return true;
      return index > 0 && index < lines.length - 1;
    })
    .join("\n")
    .trim();

export const formatManagedAssistantMarker = (names) => {
  const uniqueNames = [...new Set(names.map(getDisplayName).filter(Boolean))].sort(
    (left, right) => left.localeCompare(right, "zh-Hant"),
  );
  return uniqueNames.length > 0
    ? `【放射師助理：${uniqueNames.join("、")}】`
    : "";
};

export const mergeManagedAssistantMemo = (memo, names) => {
  const humanMemo = removeManagedAssistantMarker(memo);
  const marker = formatManagedAssistantMarker(names);
  return [humanMemo, marker].filter(Boolean).join("\n");
};

export const normalizeSheetDate = (value) => {
  const text = String(value ?? "").trim();
  const match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/u);
  if (!match) return "";
  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
};

export const buildMemoUpdates = (rows, assistantsByDate) => {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("Shifts 工作表沒有資料。");
  }

  const headers = rows[0].map((value) => String(value ?? "").trim());
  const dateColumnIndex = headers.indexOf("Date");
  const memoColumnIndex = headers.indexOf("工讀生備忘");
  if (dateColumnIndex < 0 || memoColumnIndex < 0) {
    throw new Error("Shifts 工作表缺少 Date 或工讀生備忘欄位。");
  }

  const updates = [];
  const sheetDates = [];

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const date = normalizeSheetDate(rows[rowIndex]?.[dateColumnIndex]);
    if (!date) continue;
    sheetDates.push(date);

    const currentMemo = String(rows[rowIndex]?.[memoColumnIndex] ?? "");
    const nextMemo = mergeManagedAssistantMemo(
      currentMemo,
      assistantsByDate.get(date) || [],
    );
    if (currentMemo !== nextMemo) {
      updates.push({
        rowNumber: rowIndex + 1,
        columnIndex: memoColumnIndex,
        date,
        value: nextMemo,
      });
    }
  }

  return { updates, sheetDates };
};

const getGoogleAccessToken = async (credentials) => {
  const now = Math.floor(Date.now() / 1000);
  const header = encodeBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = encodeBase64Url(
    JSON.stringify({
      iss: credentials.client_email,
      scope: GOOGLE_SHEETS_SCOPE,
      aud: credentials.token_uri || "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const unsignedToken = `${header}.${claims}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsignedToken);
  signer.end();
  const signature = signer
    .sign(credentials.private_key, "base64")
    .replace(/=/gu, "")
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_");

  const response = await fetch(
    credentials.token_uri || "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: `${unsignedToken}.${signature}`,
      }),
    },
  );
  const body = await response.json();
  if (!response.ok || !body.access_token) {
    throw new Error(`Google 認證失敗 (${response.status})`);
  }
  return body.access_token;
};

const callGoogleSheets = async (accessToken, path, options = {}) => {
  const response = await fetch(`https://sheets.googleapis.com/v4/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(
      `Google Sheets API 失敗 (${response.status}): ${body.error?.message || "未知錯誤"}`,
    );
  }
  return body;
};

const fetchAllPages = async (makeQuery) => {
  const rows = [];
  const pageSize = 1000;
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await makeQuery().range(start, start + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
};

const buildAssistantsByDate = async (supabase, startDate, endDate) => {
  const shifts = await fetchAllPages(() =>
    supabase
      .from("shifts")
      .select("date,station,userId")
      .eq("station", ASSISTANT_STATION)
      .gte("date", startDate)
      .lte("date", endDate)
      .order("date", { ascending: true }),
  );

  const userIds = [...new Set(shifts.map((shift) => shift.userId).filter(Boolean))];
  if (userIds.length === 0) return new Map();

  const { data: users, error } = await supabase
    .from("users")
    .select("id,name")
    .in("id", userIds);
  if (error) throw error;

  const namesById = new Map((users || []).map((user) => [user.id, user.name]));
  const missingUserIds = userIds.filter((userId) => !namesById.has(userId));
  if (missingUserIds.length > 0) {
    throw new Error(`有 ${missingUserIds.length} 位助理找不到人員姓名，已停止寫入。`);
  }

  const result = new Map();
  for (const shift of shifts) {
    const names = result.get(shift.date) || [];
    names.push(namesById.get(shift.userId));
    result.set(shift.date, names);
  }
  return result;
};

const columnLetter = (zeroBasedIndex) => {
  let index = zeroBasedIndex + 1;
  let result = "";
  while (index > 0) {
    const remainder = (index - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    index = Math.floor((index - 1) / 26);
  }
  return result;
};

export const runAssistantSheetSync = async () => {
  const supabaseUrl = requireEnvironment("SUPABASE_URL", "VITE_SUPABASE_URL");
  const supabaseKey = requireEnvironment(
    "SUPABASE_SERVICE_ROLE_KEY",
    "VITE_SUPABASE_ANON_KEY",
  );
  const rawCredentials = requireEnvironment("GOOGLE_SERVICE_ACCOUNT_JSON");
  const dryRun = process.env.DRY_RUN === "true";

  let credentials;
  try {
    credentials = JSON.parse(rawCredentials);
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON 不是有效的 JSON。");
  }
  if (!credentials.client_email || !credentials.private_key) {
    throw new Error("Google 服務帳戶 JSON 缺少 client_email 或 private_key。");
  }

  const accessToken = await getGoogleAccessToken(credentials);
  const metadata = await callGoogleSheets(
    accessToken,
    `spreadsheets/${STUDENT_SCHEDULE_SPREADSHEET_ID}?fields=sheets.properties`,
  );
  const targetSheet = metadata.sheets?.find(
    (sheet) => sheet.properties?.title === STUDENT_SCHEDULE_SHEET,
  );
  if (!targetSheet || targetSheet.properties.sheetId !== STUDENT_SCHEDULE_SHEET_ID) {
    throw new Error("找不到預期的 Shifts 工作表，為避免寫錯位置已停止同步。");
  }

  const sourceRange = encodeURIComponent(`${STUDENT_SCHEDULE_SHEET}!A1:J2000`);
  const values = await callGoogleSheets(
    accessToken,
    `spreadsheets/${STUDENT_SCHEDULE_SPREADSHEET_ID}/values/${sourceRange}?valueRenderOption=FORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,
  );
  const rows = values.values || [];
  const initial = buildMemoUpdates(rows, new Map());
  if (initial.sheetDates.length === 0) {
    throw new Error("Shifts 工作表沒有可辨識的日期。");
  }

  const startDate = initial.sheetDates.reduce((left, right) =>
    left < right ? left : right,
  );
  const endDate = initial.sheetDates.reduce((left, right) =>
    left > right ? left : right,
  );
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const assistantsByDate = await buildAssistantsByDate(
    supabase,
    startDate,
    endDate,
  );
  const { updates } = buildMemoUpdates(rows, assistantsByDate);

  if (updates.length === 0) {
    console.log("[assistant-sheet-sync] 已是最新狀態，無需更新。");
    return { updatedCount: 0, dryRun };
  }
  if (dryRun) {
    console.log(
      `[assistant-sheet-sync] 試跑完成：偵測到 ${updates.length} 格需要更新，未寫入。`,
    );
    return { updatedCount: updates.length, dryRun };
  }

  const data = updates.map((update) => ({
    range: `${STUDENT_SCHEDULE_SHEET}!${columnLetter(update.columnIndex)}${update.rowNumber}`,
    values: [[update.value]],
  }));
  await callGoogleSheets(
    accessToken,
    `spreadsheets/${STUDENT_SCHEDULE_SPREADSHEET_ID}/values:batchUpdate`,
    {
      method: "POST",
      body: JSON.stringify({ valueInputOption: "RAW", data }),
    },
  );

  console.log(`[assistant-sheet-sync] 已更新 ${updates.length} 格工讀生備忘。`);
  return { updatedCount: updates.length, dryRun };
};

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  runAssistantSheetSync().catch((error) => {
    console.error(`[assistant-sheet-sync] ${error.message}`);
    process.exitCode = 1;
  });
}
