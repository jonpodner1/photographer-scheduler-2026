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
import { appUserFromDoc, userFromDoc, type AppUser, type UserRole } from '../types/models'

// The MCHS iOS app's own user collection (photographer capability flags).
const APP_USERS = 'users'

export function listenUsers(cb: (users: AppUser[]) => void): () => void {
  const q = query(collection(db, COL.users), orderBy('displayName'))
  return onSnapshot(q, (snap) => cb(snap.docs.map(userFromDoc)), (err) =>
    console.error('users listener error', err),
  )
}

/**
 * MCHS iOS app users that matter to the scheduler: approved photographers,
 * app admins, and pending photographer requests. Plain app accounts (families
 * following scores) are filtered out. Admin-only — rules deny the collection
 * read to everyone else.
 */
export function listenAppUsers(cb: (users: AppUser[]) => void): () => void {
  return onSnapshot(
    collection(db, APP_USERS),
    (snap) => cb(snap.docs.map(appUserFromDoc).filter((u) => u.status !== 'denied')),
    (err) => console.error('app users listener error', err),
  )
}

/** Approve an MCHS-app photographer request: grant the capability, clear the request. */
export async function approveAppPhotographer(uid: string): Promise<void> {
  await updateDoc(doc(db, APP_USERS, uid), { isPhotographer: true, photographerRequested: false })
}

/** Deny an MCHS-app photographer request: clear the request, grant nothing. */
export async function denyAppPhotographer(uid: string): Promise<void> {
  await updateDoc(doc(db, APP_USERS, uid), { photographerRequested: false })
}

/** Revoke an MCHS-app photographer's capability. */
export async function revokeAppPhotographer(uid: string): Promise<void> {
  await updateDoc(doc(db, APP_USERS, uid), { isPhotographer: false })
}

export async function updateUserRole(uid: string, role: UserRole): Promise<void> {
  await updateDoc(doc(db, COL.users, uid), { role })
}

export async function updateProfile(uid: string, data: { displayName: string; phone: string | null }): Promise<void> {
  await updateDoc(doc(db, COL.users, uid), data)
}

/** Admin-only (enforced by rules): approve or deny a pending signup. */
export async function setUserStatus(uid: string, status: 'active' | 'denied'): Promise<void> {
  await updateDoc(doc(db, COL.users, uid), { status })
}

/** Admin-only (enforced by rules): set the ranking score override for a user. */
export async function updateScoreAdjustment(uid: string, scoreAdjustment: number): Promise<void> {
  await updateDoc(doc(db, COL.users, uid), { scoreAdjustment })
}

/**
 * Deletes the user's profile document. The Firebase Auth account itself is not
 * deleted (same behavior as the Flutter app) — remove it in the console if needed.
 */
export async function deleteUser(uid: string): Promise<void> {
  await deleteDoc(doc(db, COL.users, uid))
}
