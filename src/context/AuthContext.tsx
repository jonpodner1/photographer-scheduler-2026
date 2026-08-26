import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth'
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { FirebaseError } from 'firebase/app'
import { COL, auth, db } from '../lib/firebase'
import { appUserFromDoc, userFromDoc, type AppUser } from '../types/models'

interface AuthState {
  /** Firebase auth user (null when logged out). */
  firebaseUser: User | null
  /** Firestore profile doc — null until loaded / when logged out. */
  profile: AppUser | null
  isAdmin: boolean
  /** True while restoring the session or loading the profile doc. */
  loading: boolean
  signIn: (email: string, password: string) => Promise<string | null>
  signUp: (email: string, password: string, displayName: string, phone: string) => Promise<string | null>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

function friendlyError(code: string): string {
  switch (code) {
    case 'auth/user-not-found':
      return 'No account found with this email.'
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect email or password.'
    case 'auth/email-already-in-use':
      return 'An account already exists with this email.'
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.'
    case 'auth/invalid-email':
      return 'Please enter a valid email address.'
    case 'auth/too-many-requests':
      return 'Too many attempts. Please try again later.'
    default:
      return 'Authentication error. Please try again.'
  }
}

// undefined = still determining, null = confirmed missing, AppUser = loaded
type ProfileState = AppUser | null | undefined

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null)
  /** scheduler_users/{uid} — accounts created by signing up on this website. */
  const [webProfile, setWebProfile] = useState<ProfileState>(undefined)
  /** users/{uid} — accounts created in the MCHS iOS app (isPhotographer/isAdmin). */
  const [appProfile, setAppProfile] = useState<ProfileState>(undefined)
  /** True while re-checking a scheduler_users doc the watch stream reported missing. */
  const [confirming, setConfirming] = useState(false)
  const [authReady, setAuthReady] = useState(false)
  // Bumped to force a fresh listener when a stale watch missed the doc creation.
  const [listenNonce, setListenNonce] = useState(0)
  const resubscribesRef = useRef(0)

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user)
      setAuthReady(true)
      setWebProfile(user ? undefined : null)
      setAppProfile(user ? undefined : null)
      setConfirming(false)
      resubscribesRef.current = 0
    })
  }, [])

  // Live-subscribe to the scheduler profile doc so role changes take effect immediately.
  useEffect(() => {
    if (!firebaseUser) return
    const ref = doc(db, COL.users, firebaseUser.uid)
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          setWebProfile(userFromDoc(snap))
          setConfirming(false)
          return
        }
        // Our own signup write is still in flight — keep waiting.
        if (snap.metadata.hasPendingWrites) return
        // The listener says the doc is gone, but a doc created moments ago
        // (fresh signup) can race the watch stream. Report it missing now so an
        // MCHS-app account can be used immediately, but keep confirming with
        // direct reads (retrying briefly) — `confirming` holds the spinner up
        // for users who have no app account to fall back on, so a fresh signup
        // never flashes the "profile not found" screen. On success, resubscribe
        // so live updates resume from a watch that includes the doc.
        setWebProfile(null)
        setConfirming(true)
        const confirmMissing = async () => {
          for (let attempt = 0; attempt < 4; attempt++) {
            if (attempt > 0) await new Promise((r) => setTimeout(r, 500 * attempt))
            try {
              const confirmed = await getDoc(ref)
              if (confirmed.exists()) {
                setWebProfile(userFromDoc(confirmed))
                setConfirming(false)
                if (resubscribesRef.current < 3) {
                  resubscribesRef.current += 1
                  setListenNonce((n) => n + 1)
                }
                return
              }
            } catch (err) {
              console.error('profile fallback read failed', err)
            }
          }
          setConfirming(false)
        }
        void confirmMissing()
      },
      (err) => {
        console.error('profile listener error', err)
        setWebProfile(null)
        setConfirming(false)
      },
    )
    return unsub
  }, [firebaseUser, listenNonce])

  // Photographers who signed up in the MCHS iOS app have no scheduler_users doc
  // — their capability flags live on users/{uid}. The rules let a user read
  // their own doc there, and the callables/rules already treat both collections
  // as one identity, so the web app resolves from either. Without this, every
  // app-signup photographer authenticates fine and then bounces back to the
  // login screen with "profile not found".
  useEffect(() => {
    if (!firebaseUser) return
    const unsub = onSnapshot(
      doc(db, COL.appUsers, firebaseUser.uid),
      (snap) => setAppProfile(snap.exists() ? appUserFromDoc(snap) : null),
      (err) => {
        console.error('app profile listener error', err)
        setAppProfile(null)
      },
    )
    return unsub
  }, [firebaseUser])

  // A scheduler_users doc wins when it exists (it's this app's own record);
  // otherwise fall back to the MCHS app account. Mirrors normalizeProfile() in
  // functions/index.js so the client and server agree on who someone is.
  const profile: ProfileState = webProfile ?? appProfile

  const signedIn = firebaseUser !== null
  const loading =
    !authReady ||
    (signedIn && webProfile === undefined) ||
    (signedIn && appProfile === undefined) ||
    // Still double-checking a missing scheduler doc, with no app account to
    // fall back on — keep the spinner up instead of flashing "profile not found".
    (signedIn && confirming && webProfile === null && appProfile === null)

  const signIn = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, password)
      return null
    } catch (err) {
      return err instanceof FirebaseError ? friendlyError(err.code) : 'Sign-in failed.'
    }
  }

  const signUp = async (email: string, password: string, displayName: string, phone: string) => {
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password)
      // New accounts are always photographers awaiting admin approval —
      // security rules enforce both; admins promote/approve from the Users tab.
      await setDoc(doc(db, COL.users, cred.user.uid), {
        email,
        displayName,
        role: 'photographer',
        status: 'pending',
        phone: phone || null,
        photoUrl: null,
        createdAt: serverTimestamp(),
      })
      return null
    } catch (err) {
      return err instanceof FirebaseError ? friendlyError(err.code) : 'Sign-up failed.'
    }
  }

  const signOut = () => fbSignOut(auth)

  const value: AuthState = {
    firebaseUser,
    profile: profile ?? null,
    isAdmin: profile?.role === 'admin',
    loading,
    signIn,
    signUp,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
