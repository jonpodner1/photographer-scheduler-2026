import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { COL, db } from '../lib/firebase'
import { appUserFromDoc, userFromDoc, type AppUser } from '../types/models'

// The MCHS iOS app's own user collection (photographer capability flags).
const APP_USERS = COL.appUsers

export function listenUsers(cb: (users: AppUser[]) => void): () => void {
  const q = query(collection(db, COL.users), orderBy('displayName'))
  return onSnapshot(q, (snap) => cb(snap.docs.map(userFromDoc)), (err) =>
    console.error('users listener error', err),
  )
}

/**
 * MCHS iOS app users that matter to the scheduler: approved photographers,
 * app admins, and pending photographer requests. Plain app accounts (families
 * following scores) and denied requests are filtered out. Admin-only — rules
 * deny the collection read to everyone else.
 */
export function listenAppUsers(cb: (users: AppUser[]) => void): () => void {
  return onSnapshot(
    collection(db, APP_USERS),
    (snap) =>
      cb(
        snap.docs
          .map(appUserFromDoc)
          .filter((u) => u.status === 'pending' || u.status === 'active'),
      ),
    (err) => console.error('app users listener error', err),
  )
}

/** Approve an MCHS-app photographer request: grant the capability, clear the request. */
export async function approveAppPhotographer(uid: string): Promise<void> {
  await updateDoc(doc(db, APP_USERS, uid), {
    isPhotographer: true,
    photographerRequested: false,
    photographerDeniedAt: deleteField(),
  })
}

/**
 * Deny an MCHS-app photographer request: clear the request, grant nothing.
 * photographerDeniedAt lets both clients tell "denied" apart from "never asked".
 */
export async function denyAppPhotographer(uid: string): Promise<void> {
  await updateDoc(doc(db, APP_USERS, uid), {
    photographerRequested: false,
    photographerDeniedAt: serverTimestamp(),
  })
}

/** Revoke an MCHS-app photographer's capability. */
export async function revokeAppPhotographer(uid: string): Promise<void> {
  await updateDoc(doc(db, APP_USERS, uid), { isPhotographer: false })
}

/**
 * An MCHS-app account asking for photographer access from the website (the
 * same request the app's Create Account toggle makes). The rules let a user
 * set only this flag, and only to true, on their own users/{uid} doc; the
 * onAppUserWritten trigger then notifies every admin.
 */
export async function requestAppPhotographerAccess(uid: string): Promise<void> {
  await updateDoc(doc(db, APP_USERS, uid), { photographerRequested: true })
}

// Role changes (admin ⇄ photographer) go through the setUserRole callable in
// services/callables.ts so both user pools are updated together.

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
