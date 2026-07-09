import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { COL, db } from '../lib/firebase'
import { notificationFromDoc, type AppNotification } from '../types/models'

const notifsCol = collection(db, COL.notifications)

export function listenNotifications(
  userId: string,
  cb: (notifications: AppNotification[]) => void,
): () => void {
  const q = query(notifsCol, where('userId', '==', userId), orderBy('createdAt', 'desc'))
  return onSnapshot(q, (snap) => cb(snap.docs.map(notificationFromDoc)), (err) =>
    console.error('notifications listener error', err),
  )
}

export async function markAsRead(id: string): Promise<void> {
  await updateDoc(doc(db, COL.notifications, id), { isRead: true })
}

export async function markAllAsRead(userId: string): Promise<void> {
  const snap = await getDocs(
    query(notifsCol, where('userId', '==', userId), where('isRead', '==', false)),
  )
  if (snap.empty) return
  const batch = writeBatch(db)
  snap.docs.forEach((d) => batch.update(d.ref, { isRead: true }))
  await batch.commit()
}

export async function deleteNotification(id: string): Promise<void> {
  await deleteDoc(doc(db, COL.notifications, id))
}
