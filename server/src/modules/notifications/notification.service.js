import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "./notification.repository.js";

export function createNotificationService(pool) {
  return {
    list: (params) => listNotifications(pool, params),
    markRead: (notificationId, params) => markNotificationRead(pool, notificationId, params),
    markAllRead: (params) => markAllNotificationsRead(pool, params),
  };
}
