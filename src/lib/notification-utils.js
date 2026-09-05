export function notificationDayKey(value = new Date(), timeZone = "Asia/Kolkata") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type) => parts.find((entry) => entry.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function purchaseDueNotificationId(purchaseId, value = new Date(), timeZone = "Asia/Kolkata") {
  return `due-${purchaseId}-${notificationDayKey(value, timeZone)}`;
}
