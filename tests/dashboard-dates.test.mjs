import test from "node:test";
import assert from "node:assert/strict";
import { dashboardRange, dashboardChartWindows } from "../src/lib/dashboard-dates.js";

test("This Week starts Monday, Last 7 Days includes the prior six days", () => {
  const now = new Date("2026-09-29T10:00:00Z");
  assert.equal(dashboardRange("week", null, null, now).start.toISOString(), "2026-09-27T18:30:00.000Z");
  assert.equal(dashboardRange("7d", null, null, now).start.toISOString(), "2026-09-22T18:30:00.000Z");
});

test("custom range includes both complete IST dates and equal previous period", () => {
  const range = dashboardRange("custom", "2026-09-01", "2026-09-03");
  assert.equal(range.start.toISOString(), "2026-08-31T18:30:00.000Z");
  assert.equal(range.end.toISOString(), "2026-09-03T18:29:59.999Z");
  assert.equal(range.previousStart.toISOString(), "2026-08-28T18:30:00.000Z");
  assert.equal(range.previousEnd.getTime() + 1, range.start.getTime());
});

test("date validation rejects missing, reversed and impossible dates", () => {
  for (const pair of [[null, null], ["2026-02-30", "2026-03-01"], ["2026-10-01", "2026-09-01"]]) {
    assert.throws(() => dashboardRange("custom", ...pair));
  }
  assert.equal(dashboardRange("custom", "2024-02-29", "2024-02-29").duration, 86400000);
});

test("today uses IST even when UTC date differs", () => {
  assert.equal(dashboardRange("today", null, null, new Date("2026-09-28T20:00:00Z")).start.toISOString(), "2026-09-28T18:30:00.000Z");
});

test("long chart ranges cover all dates without gaps and limit plotted buckets", () => {
  const range = dashboardRange("custom", "2025-01-01", "2026-09-29");
  const windows = dashboardChartWindows(range);
  assert.ok(windows.length <= 31);
  assert.equal(windows[0].start.getTime(), range.start.getTime());
  assert.equal(windows.at(-1).end.getTime(), range.end.getTime());
  windows.forEach((window, index) => {
    if (index) assert.equal(window.start.getTime(), windows[index - 1].end.getTime() + 1);
    assert.equal(window.start - window.previousStart, range.duration);
  });
});
