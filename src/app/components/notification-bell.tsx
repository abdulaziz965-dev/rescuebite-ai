import { useEffect, useMemo, useState } from "react";
import { Bell, CheckCheck, ChevronDown, ExternalLink } from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, onSnapshot } from "firebase/firestore";
import { auth, db } from "../../firebase/config";
import { AppNotification, markNotificationRead, NotificationAudienceRole } from "../lib/notifications";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";

export function NotificationBell({ audienceRole }: { audienceRole: NotificationAudienceRole }) {
  const [currentUserUid, setCurrentUserUid] = useState<string | null>(auth.currentUser?.uid || null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUserUid(user?.uid || null);
    });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "notifications"), (snapshot) => {
      const nextNotifications = snapshot.docs.map((docSnapshot) => ({
        id: docSnapshot.id,
        ...(docSnapshot.data() as Omit<AppNotification, "id">),
      }));
      setNotifications(nextNotifications);
    });

    return () => unsubscribe();
  }, []);

  const visibleNotifications = useMemo(() => {
    return [...notifications]
      .filter((notification) => {
        return (
          notification.recipientRole === "all" ||
          notification.recipientRole === audienceRole ||
          (currentUserUid && notification.recipientUid === currentUserUid)
        );
      })
      .sort((a, b) => {
        const timeA = a.createdAt?.toDate?.().getTime() || 0;
        const timeB = b.createdAt?.toDate?.().getTime() || 0;
        return timeB - timeA;
      });
  }, [audienceRole, currentUserUid, notifications]);

  const unreadCount = useMemo(() => {
    if (!currentUserUid) {
      return visibleNotifications.length;
    }

    return visibleNotifications.filter((notification) => !(notification.readByUids || []).includes(currentUserUid)).length;
  }, [currentUserUid, visibleNotifications]);

  const handleMarkRead = async (notificationId: string) => {
    if (!currentUserUid) {
      return;
    }

    try {
      await markNotificationRead(notificationId, currentUserUid);
    } catch {
      // Ignore read errors.
    }
  };

  return (
    <div className="relative">
      <Button
        type="button"
        variant="ghost"
        className="p-2 rounded-2xl hover:bg-gray-100 transition-all relative"
        onClick={() => setOpen((prev) => !prev)}
      >
        <Bell className="w-6 h-6 text-gray-600" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-5 h-5 px-1 rounded-full bg-[#f97316] text-white text-[10px] flex items-center justify-center">
            {unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 mt-3 w-[24rem] max-w-[calc(100vw-2rem)] z-50">
          <Card className="rounded-3xl border border-gray-200 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div>
                <div className="font-semibold">Notifications</div>
                <div className="text-xs text-gray-500">Live Firestore updates</div>
              </div>
              <button
                type="button"
                className="text-gray-500 hover:text-gray-800"
                onClick={() => setOpen(false)}
              >
                <ChevronDown className="w-5 h-5" />
              </button>
            </div>
            <div className="max-h-96 overflow-auto">
              {visibleNotifications.length > 0 ? (
                visibleNotifications.map((notification) => {
                  const isRead = currentUserUid ? (notification.readByUids || []).includes(currentUserUid) : false;
                  return (
                    <div
                      key={notification.id}
                      className={`p-4 border-b border-gray-100 ${isRead ? "bg-white" : "bg-[#f8fafc]"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-sm">{notification.title}</div>
                          <div className="text-sm text-gray-600 mt-1">{notification.message}</div>
                          <div className="text-xs text-gray-400 mt-2">
                            {notification.createdAt?.toDate?.()?.toLocaleString() || "Just now"}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {notification.link && (
                            <a
                              href={notification.link}
                              className="text-[#10b981] hover:text-[#047857]"
                              title="Open link"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          )}
                          {!isRead && currentUserUid && (
                            <button
                              type="button"
                              className="text-[#10b981] hover:text-[#047857]"
                              title="Mark as read"
                              onClick={() => handleMarkRead(notification.id)}
                            >
                              <CheckCheck className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="p-6 text-center text-sm text-gray-500">No notifications yet</div>
              )}
            </div>
            {currentUserUid && visibleNotifications.length > 0 && (
              <div className="px-4 py-3 border-t border-gray-100 flex justify-end">
                <Badge className="rounded-full bg-[#d1fae5] text-[#047857]">{unreadCount} unread</Badge>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
