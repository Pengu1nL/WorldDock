import { useEffect, useState } from "react";
import type { Notification } from "@worlddock/domain";
import { listNotifications, markNotificationRead } from "../worlddock/api";
import { Icon } from "../worlddock/components";

type NotificationCenterProps = {
  sessionToken: string;
};

export function NotificationCenter({ sessionToken }: NotificationCenterProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!sessionToken) return;
    void listNotifications({ sessionToken })
      .then((result) => {
        setNotifications(result.notifications);
        setUnreadCount(result.unreadCount);
      })
      .catch(() => {});
  }, [sessionToken]);

  async function markRead(notification: Notification) {
    if (notification.readAt) return;
    const result = await markNotificationRead(notification.id, { sessionToken });
    setNotifications((items) => items.map((item) => item.id === notification.id ? result.notification : item));
    setUnreadCount((count) => Math.max(0, count - 1));
  }

  return (
    <section className="card" style={{ padding: 14 }}>
      <div className="row gap-2">
        <Icon name="bell" size={13} />
        <span className="title-font" style={{ fontSize: "var(--t-16)", fontWeight: 600 }}>通知</span>
        <span className="badge slate">{unreadCount}</span>
      </div>
      <div className="col" style={{ gap: 8, marginTop: 12 }}>
        {notifications.map((notification) => (
          <button
            key={notification.id}
            className="sb-btn"
            style={{ justifyContent: "flex-start", height: "auto", padding: 10, textAlign: "left" }}
            onClick={() => markRead(notification)}
          >
            <span className={"dot " + (notification.readAt ? "" : "sage")} />
            <span className="col" style={{ gap: 2 }}>
              <span>{notification.title}</span>
              <span style={{ color: "var(--fg-2)", fontSize: "var(--t-12)" }}>{notification.body}</span>
            </span>
          </button>
        ))}
        {notifications.length === 0 ? <p className="prose" style={{ margin: 0 }}>暂无通知。</p> : null}
      </div>
    </section>
  );
}
