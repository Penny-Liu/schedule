import { createSign } from "node:crypto";
import { pathToFileURL } from "node:url";

import { createClient } from "@supabase/supabase-js";

export const STUDENT_SCHEDULE_SPREADSHEET_ID =
  "1PNr44vLyB8h5hOzXWEDVHC0oSEW9hTFIH2W9yuCmdoo";
export const STUDENT_SCHEDULE_SHEET = "Shifts";
export const STUDENT_SCHEDULE_SHEET_ID = 408801150;
export const ASSISTANT_STATION = "助理";
export const YINGPING_STUDENT_USER_ID = "u_1782207383509";
export const YINGPING_DISPLAY_NAME = "英平";

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

export const normalizeSheetDate = (value) => {
  const text = String(value ?? "").trim();
  const match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/u);
  if (!match) return "";
  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
};

const hasYingpingAssistant = (names) =>
  names.some((name) => getDisplayName(name) === YINGPING_DISPLAY_NAME);

export const buildSheetUpdatePlan = (rows, assistantsByDate) => {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("Shifts 工作表沒有資料。");
  }

  const headers = rows[0].map((value) => String(value ?? "").trim());
  const dateColumnIndex = headers.indexOf("Date");
  const confirmedUserColumnIndex = headers.indexOf("ConfirmedUserID");
  const memoColumnIndex = headers.indexOf("工讀生備忘");
  if (
    dateColumnIndex < 0 ||
    confirmedUserColumnIndex < 0 ||
    memoColumnIndex < 0
  ) {
    throw new Error(
      "Shifts 工作表缺少 Date、ConfirmedUserID 或工讀生備忘欄位。",
    );
  }

  const cellUpdates = [];
  const sheetDates = [];
  const existingDates = new Set();
  let preservedOtherConfirmedCount = 0;

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const date = normalizeSheetDate(rows[rowIndex]?.[dateColumnIndex]);
    if (!date) continue;
    sheetDates.push(date);
    existingDates.add(date);

    const names = assistantsByDate.get(date) || [];
    const isYingpingAssistant = hasYingpingAssistant(names);
    const currentConfirmedUserId = String(
      rows[rowIndex]?.[confirmedUserColumnIndex] ?? "",
    ).trim();
    let nextConfirmedUserId = currentConfirmedUserId;
    if (isYingpingAssistant) {
      if (
        currentConfirmedUserId === "" ||
        currentConfirmedUserId === YINGPING_STUDENT_USER_ID
      ) {
        nextConfirmedUserId = YINGPING_STUDENT_USER_ID;
      } else {
        preservedOtherConfirmedCount += 1;
      }
    } else if (currentConfirmedUserId === YINGPING_STUDENT_USER_ID) {
      nextConfirmedUserId = "";
    }
    if (currentConfirmedUserId !== nextConfirmedUserId) {
      cellUpdates.push({
        rowNumber: rowIndex + 1,
        columnIndex: confirmedUserColumnIndex,
        date,
        value: nextConfirmedUserId,
      });
    }

    const currentMemo = String(rows[rowIndex]?.[memoColumnIndex] ?? "");
    const nextMemo = removeManagedAssistantMarker(currentMemo);
    if (currentMemo !== nextMemo) {
      cellUpdates.push({
        rowNumber: rowIndex + 1,
        columnIndex: memoColumnIndex,
        date,
        value: nextMemo,
      });
    }
  }

  const missingYingpingDates = [...assistantsByDate.entries()]
    .filter(([date, names]) => date && hasYingpingAssistant(names))
    .map(([date]) => date)
    .filter((date) => !existingDates.has(date))
    .sort();
  const appendedRows = missingYingpingDates.map((date, index) => {
    const values = Array(headers.length).fill("");
    values[dateColumnIndex] = date;
    values[confirmedUserColumnIndex] = YINGPING_STUDENT_USER_ID;
    return {
      rowNumber: rows.length + index + 1,
      date,
      values,
    };
  });

  return {
    cellUpdates,
    appendedRows,
    sheetDates,
    headerColumnCount: headers.length,
    preservedOtherConfirmedCount,
  };
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

const buildAssistantsByDate = async (supabase, startDate) => {
  const shifts = await fetchAllPages(() =>
    supabase
      .from("shifts")
      .select("date,station,userId")
      .eq("station", ASSISTANT_STATION)
      .gte("date", startDate)
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
  const initial = buildSheetUpdatePlan(rows, new Map());
  if (initial.sheetDates.length === 0) {
    throw new Error("Shifts 工作表沒有可辨識的日期。");
  }

  const startDate = initial.sheetDates.reduce((left, right) =>
    left < right ? left : right,
  );
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const assistantsByDate = await buildAssistantsByDate(supabase, startDate);
  const {
    cellUpdates,
    appendedRows,
    headerColumnCount,
    preservedOtherConfirmedCount,
  } = buildSheetUpdatePlan(rows, assistantsByDate);
  const updateCount = cellUpdates.length + appendedRows.length;

  if (updateCount === 0) {
    console.log(
      `[assistant-sheet-sync] 已是最新狀態；保留 ${preservedOtherConfirmedCount} 筆其他工讀生安排。`,
    );
    return {
      updatedCount: 0,
      appendedRowCount: 0,
      preservedOtherConfirmedCount,
      dryRun,
    };
  }
  if (dryRun) {
    console.log(
      `[assistant-sheet-sync] 試跑完成：${cellUpdates.length} 格更新、${appendedRows.length} 列新增、保留 ${preservedOtherConfirmedCount} 筆其他工讀生安排；未寫入。`,
    );
    return {
      updatedCount: cellUpdates.length,
      appendedRowCount: appendedRows.length,
      preservedOtherConfirmedCount,
      dryRun,
    };
  }

  const data = cellUpdates.map((update) => ({
    range: `${STUDENT_SCHEDULE_SHEET}!${columnLetter(update.columnIndex)}${update.rowNumber}`,
    values: [[update.value]],
  }));
  for (const row of appendedRows) {
    data.push({
      range: `${STUDENT_SCHEDULE_SHEET}!A${row.rowNumber}:${columnLetter(headerColumnCount - 1)}${row.rowNumber}`,
      values: [row.values],
    });
  }
  await callGoogleSheets(
    accessToken,
    `spreadsheets/${STUDENT_SCHEDULE_SPREADSHEET_ID}/values:batchUpdate`,
    {
      method: "POST",
      body: JSON.stringify({ valueInputOption: "RAW", data }),
    },
  );

  console.log(
    `[assistant-sheet-sync] 已更新 ${cellUpdates.length} 格、新增 ${appendedRows.length} 列；保留 ${preservedOtherConfirmedCount} 筆其他工讀生安排。`,
  );
  return {
    updatedCount: cellUpdates.length,
    appendedRowCount: appendedRows.length,
    preservedOtherConfirmedCount,
    dryRun,
  };
};

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  runAssistantSheetSync().catch((error) => {
    console.error(`[assistant-sheet-sync] ${error.message}`);
    process.exitCode = 1;
  });
}
