const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 366;

const parseDate = (value, fieldName) => {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) {
    throw new Error(`${fieldName} must use YYYY-MM-DD format`);
  }

  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(timestamp)) {
    throw new Error(`${fieldName} is not a valid date`);
  }
  return timestamp;
};

export const validateSyncPayload = (payloadStr) => {
  if (typeof payloadStr !== "string" || payloadStr.length === 0 || payloadStr.length > 16_384) {
    throw new Error("syncPayload must be a non-empty string smaller than 16 KB");
  }

  let tasks;
  try {
    tasks = JSON.parse(payloadStr);
  } catch {
    throw new Error("syncPayload must contain valid JSON");
  }

  if (!Array.isArray(tasks) || tasks.length === 0 || tasks.length > 3) {
    throw new Error("syncPayload must contain between 1 and 3 tasks");
  }

  const seenIds = new Set();
  const normalizedTasks = tasks.map((task) => {
    if (!task || typeof task !== "object" || Array.isArray(task)) {
      throw new Error("Each sync task must be an object");
    }

    if (!Number.isInteger(task.id) || task.id < 1 || task.id > 3 || seenIds.has(task.id)) {
      throw new Error("Task ids must be unique integers between 1 and 3");
    }
    seenIds.add(task.id);

    if (typeof task.selected !== "boolean") {
      throw new Error("Each task must include a boolean selected value");
    }

    const startTimestamp = parseDate(task.start, "start");
    const endTimestamp = parseDate(task.end, "end");
    if (startTimestamp !== undefined && endTimestamp !== undefined) {
      if (endTimestamp < startTimestamp) {
        throw new Error("Task end date cannot be before its start date");
      }
      if ((endTimestamp - startTimestamp) / 86_400_000 > MAX_RANGE_DAYS) {
        throw new Error(`Task date range cannot exceed ${MAX_RANGE_DAYS} days`);
      }
    }

    return {
      id: task.id,
      selected: task.selected,
      ...(task.start !== undefined ? { start: task.start } : {}),
      ...(task.end !== undefined ? { end: task.end } : {}),
    };
  });

  if (!normalizedTasks.some((task) => task.selected)) {
    throw new Error("At least one sync task must be selected");
  }

  return JSON.stringify(normalizedTasks);
};
