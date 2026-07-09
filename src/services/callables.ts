import { httpsCallable } from 'firebase/functions'
import { FirebaseError } from 'firebase/app'
import { functions } from '../lib/firebase'

// All slot mutations go through Cloud Functions so they run in a Firestore
// transaction server-side (fixes the race in the old client-side signup).

const call = <Req, Res = { ok: boolean }>(name: string) => httpsCallable<Req, Res>(functions, name)

const signUp = call<{ eventId: string; requestedCamera: boolean }>('signUpForEvent')
const withdraw = call<{ eventId: string; targetUid?: string }>('withdrawFromEvent')
const assign = call<{ eventId: string; photographerId: string }>('assignPhotographer')

/** Returns an error message on failure, null on success (mirrors the Flutter API). */
async function run(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn()
    return null
  } catch (err) {
    if (err instanceof FirebaseError) return err.message
    return 'Something went wrong. Please try again.'
  }
}

export const signUpForEvent = (eventId: string, requestedCamera: boolean) =>
  run(() => signUp({ eventId, requestedCamera }))

/** Withdraw yourself, or (admin only) remove another photographer via targetUid. */
export const withdrawFromEvent = (eventId: string, targetUid?: string) =>
  run(() => withdraw({ eventId, targetUid }))

export const assignPhotographer = (eventId: string, photographerId: string) =>
  run(() => assign({ eventId, photographerId }))
