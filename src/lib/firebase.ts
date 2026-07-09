import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

/** False until .env.local is filled in — App shows a setup notice instead of crashing. */
export const firebaseConfigured = Boolean(config.apiKey && config.projectId && config.appId)

const app = initializeApp(firebaseConfigured ? config : { ...config, apiKey: 'missing', projectId: 'missing', appId: 'missing' })

export const auth = getAuth(app)
export const db = getFirestore(app)
export const functions = getFunctions(app)

if (import.meta.env.VITE_USE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  connectFunctionsEmulator(functions, '127.0.0.1', 5001)
}

// Collection names are namespaced so this app can share a Firebase project with
// the existing iOS app without colliding with its data.
export const COL = {
  users: 'scheduler_users',
  events: 'scheduler_events',
  notifications: 'scheduler_notifications',
  settings: 'scheduler_settings',
} as const
