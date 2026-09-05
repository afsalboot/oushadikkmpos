import test from "node:test";
import assert from "node:assert/strict";
import { notificationDayKey, purchaseDueNotificationId } from "../src/lib/notification-utils.js";

test("notification day follows the configured store timezone", () => {
  assert.equal(notificationDayKey("2026-08-28T19:30:00.000Z", "Asia/Kolkata"), "2026-08-29");
});

test("supplier outstanding notification is stable for one store day", () => {
  const morning = purchaseDueNotificationId("purchase-1", "2026-08-28T02:30:00.000Z", "Asia/Kolkata");
  const evening = purchaseDueNotificationId("purchase-1", "2026-08-28T17:30:00.000Z", "Asia/Kolkata");
  assert.equal(morning, evening);
});

test("supplier outstanding notification changes on the next store day", () => {
  const today = purchaseDueNotificationId("purchase-1", "2026-08-28T18:29:59.000Z", "Asia/Kolkata");
  const tomorrow = purchaseDueNotificationId("purchase-1", "2026-08-28T18:30:00.000Z", "Asia/Kolkata");
  assert.notEqual(today, tomorrow);
});
