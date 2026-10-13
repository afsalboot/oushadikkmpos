export function notificationIdUpdate(activeIds, field, ids) {
  const retained = key => ({ $filter: { input: { $ifNull: ['$' + key, []] }, as: 'id', cond: { $in: ['$$id', { $literal: activeIds }] } } });
  return [{ $set: {
    readNotificationIds: field === 'readNotificationIds' ? { $setUnion: [retained('readNotificationIds'), { $literal: ids }] } : retained('readNotificationIds'),
    dismissedNotificationIds: field === 'dismissedNotificationIds' ? { $setUnion: [retained('dismissedNotificationIds'), { $literal: ids }] } : retained('dismissedNotificationIds'),
  } }];
}
