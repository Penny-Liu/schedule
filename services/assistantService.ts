// services/assistantService.ts
export interface AssistantData {
  [date: string]: string[];
}

export async function fetchAssistantData(): Promise<AssistantData> {
  const result: AssistantData = {};
  
  try {
    // 1. Fetch Users mapping using gviz (CORS friendly)
    const usersUrl = "https://docs.google.com/spreadsheets/d/1PNr44vLyB8h5hOzXWEDVHC0oSEW9hTFIH2W9yuCmdoo/gviz/tq?tqx=out:csv&gid=1634457962";
    const usersRes = await fetch(usersUrl);
    const usersText = await usersRes.text();
    
    // Parse CSV helper
    const parseCsvLine = (line: string): string[] => {
      const result: string[] = [];
      let current = "";
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"';
            i++; // skip escaped quote
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          result.push(current);
          current = "";
        } else {
          current += char;
        }
      }
      result.push(current);
      return result;
    };

    // Parse Users CSV
    const userMap: Record<string, string> = {};
    const userLines = usersText.split('\n');
    for (let i = 1; i < userLines.length; i++) {
      const line = userLines[i].trim();
      if (!line) continue;
      const parts = parseCsvLine(line);
      if (parts.length >= 2) {
        userMap[parts[0]] = parts[1];
      }
    }

    // 2. Fetch Shifts using gviz (CORS friendly)
    const shiftsUrl = "https://docs.google.com/spreadsheets/d/1PNr44vLyB8h5hOzXWEDVHC0oSEW9hTFIH2W9yuCmdoo/gviz/tq?tqx=out:csv&gid=408801150";
    const shiftsRes = await fetch(shiftsUrl);
    const shiftsText = await shiftsRes.text();
    
    // Parse Shifts CSV
    // Columns: Date,Signups_JSON,ConfirmedUserID,IsClosed,Note,Memos_JSON,工讀生備忘
    const shiftLines = shiftsText.split('\n');
    for (let i = 1; i < shiftLines.length; i++) {
      const line = shiftLines[i].trim();
      if (!line) continue;
      
      const fields = parseCsvLine(line);
      const date = fields[0];
      const signupsJson = fields[1];
      const confirmedUserId = fields[2];
      
      if (!date) continue;

      let userIdsToProcess: string[] = [];

      if (confirmedUserId && confirmedUserId !== 'NO_STUDENT') {
        userIdsToProcess.push(confirmedUserId);
      } else if (signupsJson && signupsJson.startsWith('[')) {
        try {
          const parsedArr = JSON.parse(signupsJson);
          // If exactly 1 person signed up, use them automatically
          if (Array.isArray(parsedArr) && parsedArr.length === 1) {
            userIdsToProcess = parsedArr;
          }
          // If 2 or more signed up, we wait for ConfirmedUserID (so userIdsToProcess remains empty)
        } catch (e) {
          // ignore parse errors
        }
      }

      if (userIdsToProcess.length > 0) {
        if (!result[date]) {
          result[date] = [];
        }
        for (const uid of userIdsToProcess) {
          const name = userMap[uid] || uid;
          // Exclude "英平" as requested by user
          if (name !== "英平" && !result[date].includes(name)) {
            result[date].push(name);
          }
        }
      }
    }
  } catch (err) {
    console.error("Failed to fetch assistant data:", err);
  }
  
  return result;
}
