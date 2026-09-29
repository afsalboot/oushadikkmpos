const DAY = 86400000;
const IST_OFFSET = 19800000;
export const dashboardToday = (now = new Date()) => new Date(now.getTime() + IST_OFFSET).toISOString().slice(0, 10);

function parseDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) throw new Error("Select valid From and To dates.");
  const date = new Date(`${value}T00:00:00+05:30`);
  if (!Number.isFinite(date.getTime()) || dashboardToday(date) !== value) throw new Error("Select valid From and To dates.");
  return date;
}

export function dashboardRange(range = "today", from, to, now = new Date()) {
  let start = parseDate(dashboardToday(now));
  let end = new Date(start.getTime() + DAY - 1);
  if (range === "custom") {
    start = parseDate(from);
    end = new Date(parseDate(to).getTime() + DAY - 1);
    if (start > end) throw new Error("From date must be on or before To date.");
  } else if (range === "yesterday") {
    start = new Date(start.getTime() - DAY);
    end = new Date(end.getTime() - DAY);
  } else if (range === "7d") start = new Date(start.getTime() - 6 * DAY);
  else if (range === "week") {
    const weekday = new Date(start.getTime() + IST_OFFSET).getUTCDay();
    start = new Date(start.getTime() - ((weekday + 6) % 7) * DAY);
  } else if (range === "month") start = parseDate(`${dashboardToday(now).slice(0, 7)}-01`);
  else if (range !== "today") throw new Error("Select a valid dashboard date range.");
  const duration = end - start + 1;
  return { start, end, previousStart: new Date(start.getTime() - duration), previousEnd: new Date(start.getTime() - 1), duration };
}

export function dashboardChartWindows(dates) {
  const days = Math.round(dates.duration / DAY);
  const step = Math.max(1, Math.ceil(days / 31));
  const windows = [];
  for (let offset = 0; offset < days; offset += step) {
    const start = new Date(dates.start.getTime() + offset * DAY);
    const end = new Date(Math.min(dates.end.getTime(), start.getTime() + step * DAY - 1));
    windows.push({ start, end, previousStart: new Date(start.getTime() - dates.duration), previousEnd: new Date(end.getTime() - dates.duration) });
  }
  return windows;
}
