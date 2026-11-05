/** Six preceding days are enough to detect a seventh consecutive workday. */
export const getConsecutiveWorkCheckDates = (dates: string[]): string[] => {
  if (!dates.length) return [];
  const start = new Date(`${dates[0]}T00:00:00Z`);
  return [
    ...Array.from({ length: 6 }, (_, index) => {
      const day = new Date(start);
      day.setUTCDate(day.getUTCDate() - 6 + index);
      return day.toISOString().slice(0, 10);
    }),
    ...dates,
  ];
};

/** Input dates must be consecutive and sorted. Rest/not-employed days reset the run. */
export const getConsecutiveWorkWarnings = (
  dates: string[],
  isWorking: (date: string) => boolean,
): Set<string> => {
  const warnings = new Set<string>();
  let consecutive = 0;
  for (const date of dates) {
    consecutive = isWorking(date) ? consecutive + 1 : 0;
    if (consecutive > 6) warnings.add(date);
  }
  return warnings;
};
