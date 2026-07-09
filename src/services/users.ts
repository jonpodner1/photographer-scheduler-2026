import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from 'firebase/firestore'
import { COL, db } from '../lib/firebase'
import { userFromDoc, type AppUser, type UserRole } from '../types/models'

export function listenUsers(cb: (users: AppUser[]) => void): () => void {
  const q = query(collection(db, COL.users), orderBy('displayName'))
  return onSnapshot(q, (snap) => cb(snap.docs.map(userFromDoc)), (err) =>
    console.error('users listener error', err),
  )
}

export async function updateUserRole(uid: string, role: UserRole): Promise<void> {
  await updateDoc(doc(db, COL.users, uid), { role })
}

export async function updateProfile(uid: string, data: { displayName: string; phone: string | null }): Promise<void> {
  await updateDoc(doc(db, COL.users, uid), data)
}

/**
 * Deletes the user's profile document. The Firebase Auth account itself is not
 * deleted (same behavior as the Flutter app) — remove it in the console if needed.
 */
export async function deleteUser(uid: string): Promise<void> {
  await deleteDoc(doc(db, COL.users, uid))
}
