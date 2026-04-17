import { addDoc, arrayUnion, collection, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../../firebase/config";

export type NotificationAudienceRole = "donor" | "receiver" | "volunteer" | "admin" | "all";

export type AppNotification = {
  id: string;
  title: string;
  message: string;
  recipientUid?: string;
  recipientRole?: NotificationAudienceRole;
  link?: string;
  source?: string;
  createdAt?: { toDate?: () => Date };
  readByUids?: string[];
};

export async function sendNotification(payload: {
  title: string;
  message: string;
  recipientUid?: string;
  recipientRole?: NotificationAudienceRole;
  link?: string;
  source?: string;
}) {
  return addDoc(collection(db, "notifications"), {
    title: payload.title,
    message: payload.message,
    recipientUid: payload.recipientUid || null,
    recipientRole: payload.recipientRole || null,
    link: payload.link || null,
    source: payload.source || null,
    readByUids: [],
    createdAt: serverTimestamp(),
  });
}

export async function markNotificationRead(notificationId: string, userUid: string) {
  return updateDoc(doc(db, "notifications", notificationId), {
    readByUids: arrayUnion(userUid),
    updatedAt: serverTimestamp(),
  });
}
