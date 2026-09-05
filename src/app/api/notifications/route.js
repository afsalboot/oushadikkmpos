import { requireSession } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { apiError, ok } from "@/lib/api";
import { User } from "@/models";
import { getNotifications } from "@/services/notification.service";

async function findNotificationUser(userId) {
  const identity = await User.findById(userId).select("_id").lean();
  if (!identity) return null;
  return User.collection.findOne(
    { _id: identity._id },
    { projection: { readNotificationIds: 1, dismissedNotificationIds: 1 } },
  );
}

async function notificationState(session) {
  const notifications = await getNotifications(session);
  const user = await findNotificationUser(session.sub);
  const activeIds = new Set(notifications.items.map((item) => item.id));
  const savedReadIds = Array.isArray(user?.readNotificationIds) ? user.readNotificationIds : [];
  const savedDismissedIds = Array.isArray(user?.dismissedNotificationIds) ? user.dismissedNotificationIds : [];
  const readIds = savedReadIds.filter((id) => activeIds.has(id));
  const dismissedIds = savedDismissedIds.filter((id) => activeIds.has(id));
  if (user && (readIds.length !== savedReadIds.length || dismissedIds.length !== savedDismissedIds.length)) await User.collection.updateOne({ _id: user._id }, { $set: { readNotificationIds: readIds, dismissedNotificationIds: dismissedIds } });
  return { notifications, readIds, dismissedIds, user };
}

function stateWithUser(state, user) {
  const activeIds = new Set(state.notifications.items.map((item) => item.id));
  return {
    ...state,
    user,
    readIds: (Array.isArray(user.readNotificationIds) ? user.readNotificationIds : []).filter((id) => activeIds.has(id)),
    dismissedIds: (Array.isArray(user.dismissedNotificationIds) ? user.dismissedNotificationIds : []).filter((id) => activeIds.has(id)),
  };
}

function notificationPayload({ notifications, readIds, dismissedIds }) {
  const read = new Set(readIds);
  const dismissed = new Set(dismissedIds);
  const items = notifications.items
    .filter((item) => !dismissed.has(item.id))
    .map((item) => ({ ...item, read: read.has(item.id) }));
  return {
    count: items.length,
    unreadCount: items.filter((item) => !item.read).length,
    items: items.slice(0, 100),
    generatedAt: notifications.generatedAt,
  };
}

export async function GET() {
  try {
    const session = await requireSession("products.view");
    await connectDb();
    return ok(notificationPayload(await notificationState(session)));
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request) {
  try {
    const session = await requireSession("products.view");
    await connectDb();
    const body = await request.json();
    const state = await notificationState(session);
    const dismissed = new Set(state.dismissedIds);
    const visibleIds = state.notifications.items.filter((item) => !dismissed.has(item.id)).map((item) => item.id);
    const ids = body.all ? visibleIds : visibleIds.includes(String(body.id || "")) ? [String(body.id)] : [];
    let refreshed = state;
    if (ids.length && state.user) {
      const result = await User.collection.updateOne({ _id: state.user._id }, { $addToSet: { readNotificationIds: { $each: ids } } });
      if (!result.matchedCount) throw new Error("Notification user was not found");
      const user = await findNotificationUser(session.sub);
      refreshed = stateWithUser(state, user);
    }
    return ok({ updated: ids.length, ...notificationPayload(refreshed) });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request) {
  try {
    const session = await requireSession("products.view");
    await connectDb();
    const body = await request.json();
    const state = await notificationState(session);
    const dismissed = new Set(state.dismissedIds);
    const visibleIds = state.notifications.items.filter((item) => !dismissed.has(item.id)).map((item) => item.id);
    const ids = body.all ? visibleIds : visibleIds.includes(String(body.id || "")) ? [String(body.id)] : [];
    let refreshed = state;
    if (ids.length && state.user) {
      const result = await User.collection.updateOne({ _id: state.user._id }, { $addToSet: { dismissedNotificationIds: { $each: ids } } });
      if (!result.matchedCount) throw new Error("Notification user was not found");
      const user = await findNotificationUser(session.sub);
      refreshed = stateWithUser(state, user);
    }
    return ok({ cleared: ids.length, ...notificationPayload(refreshed) });
  } catch (error) {
    return apiError(error);
  }
}
