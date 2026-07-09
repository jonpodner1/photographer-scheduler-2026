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
import { userFromDoc, type AppUser } from '../types/models'

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null)
  // undefined = still determining, null = confirmed missing, AppUser = loaded
  const [profile, setProfile] = useState<AppUser | null | undefined>(undefined)
  const [authReady, setAuthReady] = useState(false)
  // Bumped to force a fresh listener when a stale watch missed the doc creation.
  const [listenNonce, setListenNonce] = useState(0)
  const resubscribesRef = useRef(0)

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user)
      setAuthReady(true)
      setProfile(user ? undefined : null)
      resubscribesRef.current = 0
    })
  }, [])

  // Live-subscribe to the profile doc so role changes take effect immediately.
  useEffect(() => {
    if (!firebaseUser) return
    const ref = doc(db, COL.users, firebaseUser.uid)
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          setProfile(userFromDoc(snap))
          return
        }
        // Our own signup write is still in flight — keep waiting.
        if (snap.metadata.hasPendingWrites) return
        // The listener says the doc is gone, but a doc created moments ago
        // (fresh signup) can race the watch stream. Confirm with direct
        // reads (retrying briefly) before treating the profile as missing,
        // then resubscribe so live updates resume from a watch that
        // includes the doc.
        const confirmMissing = async () => {
          for (let attempt = 0; attempt < 4; attempt++) {
            if (attempt > 0) await new Promise((r) => setTimeout(r, 500 * attempt))
            try {
              const confirmed = await getDoc(ref)
              if (confirmed.exists()) {
                setProfile(userFromDoc(confirmed))
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
          setProfile(null)
        }
        void confirmMissing()
      },
      (err) => {
        console.error('profile listener error', err)
        setProfile(null)
      },
    )
    return unsub
  }, [firebaseUser, listenNonce])

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
      // New accounts are always photographers — security rules enforce this;
      // admins are promoted by an existing admin (or in the console).
      await setDoc(doc(db, COL.users, cred.user.uid), {
        email,
        displayName,
        role: 'photographer',
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
    loading: !authReady || (firebaseUser !== null && profile === undefined),
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
