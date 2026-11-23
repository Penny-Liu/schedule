export function getDailyViewSyncRanges(now = new Date()) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const addDays = (days: number) =>
    new Date(Date.parse(`${today}T00:00:00Z`) + days * 86_400_000)
      .toISOString()
      .slice(0, 10);

  return {
    today,
    dailyStatsEnd: addDays(30),
    physicianWorkloadEnd: addDays(1),
  };
}
