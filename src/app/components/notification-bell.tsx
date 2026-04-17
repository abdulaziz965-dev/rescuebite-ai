import { useEffect, useMemo, useState } from "react";
import { Bell, CheckCheck, ChevronDown, ExternalLink } from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { onAuthStateChanged } from "firebase/auth";
import { collection, onSnapshot } from "firebase/firestore";
import { auth, db } from "../../firebase/config";
import { AppNotification, markNotificationRead, NotificationAudienceRole } from "../lib/notifications";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";

export function NotificationBell({ audienceRole }: { audienceRole: NotificationAudienceRole }) {
  const navigate = useNavigate();
  const location = useLocation();
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

  const resolveNotificationDestination = (notification: AppNotification) => {
    const link = typeof notification.link === "string" ? notification.link.trim() : "";
    if (link) {
      return link;
    }

    const source = (notification.source || "").toLowerCase();
    if (source.includes("donor")) {
      return "/donor";
    }
    if (source.includes("receiver")) {
      return "/receiver";
    }
    if (source.includes("volunteer")) {
      return "/volunteer";
    }
    if (source.includes("admin") || source.includes("ai")) {
      return "/admin";
    }

    if (audienceRole === "donor") {
      return "/donor";
    }
    if (audienceRole === "receiver") {
      return "/receiver";
    }
    if (audienceRole === "volunteer") {
      return "/volunteer";
    }
    if (audienceRole === "admin") {
      return "/admin";
    }

    return "/login";
  };

  const handleOpenNotification = async (notification: AppNotification) => {
    const destination = resolveNotificationDestination(notification);

    if (currentUserUid) {
      await handleMarkRead(notification.id);
    }

    setOpen(false);
    if (/^https?:\/\//i.test(destination)) {
      window.open(destination, "_blank", "noopener,noreferrer");
      return;
    }

    const destinationPath = destination.startsWith("/") ? destination : `/${destination}`;
    const normalizedCurrentPath = location.pathname.replace(/\/$/, "") || "/";
    const normalizedDestinationPath = destinationPath.replace(/\/$/, "") || "/";

    if (normalizedCurrentPath === normalizedDestinationPath) {
      navigate(`${destinationPath}?notification=${notification.id}`);
      return;
    }

    navigate(destinationPath);
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
        <div className="fixed left-2 right-2 top-16 z-50 sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-3 sm:w-[24rem] sm:translate-x-0">
          <Card className="rounded-3xl border border-gray-200 shadow-2xl overflow-hidden max-h-[70vh] sm:max-h-none">
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
            <div className="max-h-[60vh] sm:max-h-96 overflow-auto">
              {visibleNotifications.length > 0 ? (
                visibleNotifications.map((notification) => {
                  const isRead = currentUserUid ? (notification.readByUids || []).includes(currentUserUid) : false;
                  return (
                    <div
                      key={notification.id}
                      className={`p-4 border-b border-gray-100 ${isRead ? "bg-white" : "bg-[#f8fafc]"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left"
                          onClick={() => void handleOpenNotification(notification)}
                          title="Open notification"
                        >
                          <div className="font-medium text-sm">{notification.title}</div>
                          <div className="text-sm text-gray-600 mt-1">{notification.message}</div>
                          <div className="text-xs text-gray-400 mt-2">
                            {notification.createdAt?.toDate?.()?.toLocaleString() || "Just now"}
                          </div>
                        </button>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            className="text-[#10b981] hover:text-[#047857]"
                            title="Open details"
                            onClick={() => void handleOpenNotification(notification)}
                          >
                            <ExternalLink className="w-4 h-4" />
                          </button>
                          {!isRead && currentUserUid && (
                            <button
                              type="button"
                              className="text-[#10b981] hover:text-[#047857]"
                              title="Mark as read"
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleMarkRead(notification.id);
                              }}
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
