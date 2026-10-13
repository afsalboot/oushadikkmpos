import { requireSession } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { apiError, ok } from "@/lib/api";
import { User } from "@/models";
import { getNotifications } from "@/services/notification.service";
import mongoose from "mongoose";
import { requestTiming } from "@/lib/performance";
import { notificationIdUpdate } from "@/lib/notification-state";

async function findNotificationUser(userId) {
  return User.collection.findOne(
    { _id: new mongoose.Types.ObjectId(userId) },
    { projection: { readNotificationIds: 1, dismissedNotificationIds: 1 } },
  );
}

async function notificationState(session) {
  const [notifications, user] = await Promise.all([getNotifications(session), findNotificationUser(session.sub)]);
  const activeIds = new Set(notifications.items.map((item) => item.id));
  const savedReadIds = Array.isArray(user?.readNotificationIds) ? user.readNotificationIds : [];
  const savedDismissedIds = Array.isArray(user?.dismissedNotificationIds) ? user.dismissedNotificationIds : [];
  const readIds = savedReadIds.filter((id) => activeIds.has(id));
  const dismissedIds = savedDismissedIds.filter((id) => activeIds.has(id));
  return { notifications, readIds, dismissedIds, user };
}

async function updateNotificationIds(state, field, ids) {
  const activeIds = state.notifications.items.map(item => item.id);
  // Prune old alert IDs on explicit writes while preserving concurrent updates.
  return User.collection.updateOne({ _id: state.user._id }, notificationIdUpdate(activeIds, field, ids));
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
  const timing = requestTiming('notifications');
  try {
    const session = await timing.measure('auth', () => requireSession("products.view"));
    await timing.measure('connection', () => connectDb());
    const state = await timing.measure('alerts', () => notificationState(session));
    return timing.finish(await timing.measure('serialization', () => ok(notificationPayload(state))));
  } catch (error) {
    return timing.finish(apiError(error));
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
      const result = await updateNotificationIds(state, 'readNotificationIds', ids);
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
      const result = await updateNotificationIds(state, 'dismissedNotificationIds', ids);
      if (!result.matchedCount) throw new Error("Notification user was not found");
      const user = await findNotificationUser(session.sub);
      refreshed = stateWithUser(state, user);
    }
    return ok({ cleared: ids.length, ...notificationPayload(refreshed) });
  } catch (error) {
    return apiError(error);
  }
}
