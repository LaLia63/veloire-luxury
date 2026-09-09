"use client";

import { Bell, CheckCheck, PackageCheck, X } from "lucide-react";
import { useEffect } from "react";
import { useCommerce } from "./commerce-provider";

export function NotificationPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { notifications, unreadNotificationCount, refreshNotifications, markNotificationRead, markAllNotificationsRead } = useCommerce();

  useEffect(() => {
    if (open) void refreshNotifications();
  }, [open, refreshNotifications]);

  if (!open) return null;

  return <>
    <button className="notification-backdrop" aria-label="Close notifications" onClick={onClose}/>
    <aside className="notification-panel" aria-label="Notifications" aria-live="polite">
      <header>
        <div><Bell aria-hidden="true"/><span>Notifications</span>{unreadNotificationCount > 0 && <b>{unreadNotificationCount}</b>}</div>
        <div className="notification-actions">
          {unreadNotificationCount > 0 && <button onClick={() => void markAllNotificationsRead()}><CheckCheck aria-hidden="true"/>Mark all read</button>}
          <button className="notification-close" aria-label="Close notifications" onClick={onClose}><X aria-hidden="true"/></button>
        </div>
      </header>
      <div className="notification-list">
        {notifications.length ? notifications.map((notification) => <button
          className={notification.is_read ? "" : "unread"}
          key={notification.id}
          onClick={() => void markNotificationRead(notification.id)}
        >
          <span className="notification-icon"><PackageCheck aria-hidden="true"/></span>
          <span><strong>{notification.title}</strong><small>{notification.message}</small><time>{new Date(notification.created_at).toLocaleString()}</time></span>
          {!notification.is_read && <i aria-label="Unread"/>}
        </button>) : <div className="notification-empty"><Bell aria-hidden="true"/><p>No notifications yet.</p><span>Order updates from the Maison will appear here.</span></div>}
      </div>
    </aside>
  </>;
}
