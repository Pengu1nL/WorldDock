import { useEffect, useState } from "react";
import type { ActivityEvent, Notification } from "@worlddock/domain";
import { listActivity, listNotifications, markNotificationRead } from "../worlddock/api";
import { Icon } from "../worlddock/components";

type NotificationCenterProps = {
  sessionToken: string;
  refreshKey?: number;
};

export function NotificationCenter({ sessionToken, refreshKey = 0 }: NotificationCenterProps) {
  const [tab, setTab] = useState<"notifications" | "activity">("notifications");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationStatus, setNotificationStatus] = useState<"idle" | "loading" | "error">("idle");
  const [activityStatus, setActivityStatus] = useState<"idle" | "loading" | "error">("idle");
  const [markingIds, setMarkingIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!sessionToken) {
      setNotifications([]);
      setActivity([]);
      setUnreadCount(0);
      setNotificationStatus("idle");
      setActivityStatus("idle");
      return;
    }

    let cancelled = false;
    setNotificationStatus("loading");
    setActivityStatus("loading");

    void listNotifications({ sessionToken })
      .then((notificationResult) => {
        if (cancelled) return;
        setNotifications(notificationResult.notifications);
        setUnreadCount(notificationResult.unreadCount);
        setNotificationStatus("idle");
      })
      .catch(() => {
        if (!cancelled) setNotificationStatus("error");
      });

    void listActivity({ sessionToken })
      .then((activityResult) => {
        if (cancelled) return;
        setActivity(activityResult.activity);
        setActivityStatus("idle");
      })
      .catch(() => {
        if (!cancelled) setActivityStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [sessionToken, refreshKey]);

  async function markRead(notification: Notification) {
    if (notification.readAt || !sessionToken || markingIds.has(notification.id)) return;
    setMarkingIds((ids) => new Set(ids).add(notification.id));
    try {
      const result = await markNotificationRead(notification.id, { sessionToken });
      const wasUnread = notifications.some((item) => item.id === notification.id && !item.readAt);
      setNotifications((items) => items.map((item) => item.id === notification.id ? result.notification : item));
      if (wasUnread) setUnreadCount((count) => Math.max(0, count - 1));
    } catch {
      setNotificationStatus("error");
    } finally {
      setMarkingIds((ids) => {
        const next = new Set(ids);
        next.delete(notification.id);
        return next;
      });
    }
  }

  return (
    <section className="card" style={{ padding: 14 }}>
      <div className="row gap-2" style={{ justifyContent: "space-between" }}>
        <div className="row gap-2">
          <Icon name="bell" size={13} />
          <span className="title-font" style={{ fontSize: "var(--t-16)", fontWeight: 600 }}>通知与活动</span>
          <span className="badge slate" aria-label="未读通知数">{unreadCount}</span>
        </div>
        <div className="row gap-1">
          <button className={"sb-btn " + (tab === "notifications" ? "primary" : "")} onClick={() => setTab("notifications")}>通知</button>
          <button className={"sb-btn " + (tab === "activity" ? "primary" : "")} onClick={() => setTab("activity")}>活动</button>
        </div>
      </div>
      {tab === "notifications" ? (
        <div className="col" style={{ gap: 8, marginTop: 12 }}>
          {notificationStatus === "loading" ? <p className="prose" style={{ margin: 0 }}>同步中...</p> : null}
          {notificationStatus === "error" ? <p className="prose" style={{ margin: 0, color: "var(--danger)" }}>通知同步失败。</p> : null}
          {notifications.map((notification) => (
            <button
              key={notification.id}
              className="sb-btn"
              style={{ justifyContent: "flex-start", height: "auto", padding: 10, textAlign: "left" }}
              disabled={markingIds.has(notification.id)}
              onClick={() => markRead(notification)}
            >
              <span className={"dot " + (notification.readAt ? "" : "sage")} />
              <span className="col" style={{ gap: 2 }}>
                <span>{notification.title}</span>
                <span style={{ color: "var(--fg-2)", fontSize: "var(--t-12)" }}>{notification.body}</span>
              </span>
            </button>
          ))}
          {notifications.length === 0 && notificationStatus !== "loading" ? <p className="prose" style={{ margin: 0 }}>暂无通知。</p> : null}
        </div>
      ) : (
        <div className="col" style={{ gap: 8, marginTop: 12 }}>
          {activityStatus === "loading" ? <p className="prose" style={{ margin: 0 }}>同步中...</p> : null}
          {activityStatus === "error" ? <p className="prose" style={{ margin: 0, color: "var(--danger)" }}>活动同步失败。</p> : null}
          {activity.map((item) => (
            <div key={item.id} className="row gap-2" style={{ alignItems: "flex-start", borderTop: "1px solid var(--hairline)", paddingTop: 8 }}>
              <Icon name="history" size={13} />
              <span className="col" style={{ gap: 2 }}>
                <span>{item.title}</span>
                <span style={{ color: "var(--fg-2)", fontSize: "var(--t-12)" }}>{item.body}</span>
              </span>
            </div>
          ))}
          {activity.length === 0 && activityStatus !== "loading" ? <p className="prose" style={{ margin: 0 }}>暂无活动。</p> : null}
        </div>
      )}
    </section>
  );
}
