import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { COL, db } from '../lib/firebase'
import { DEFAULT_BRANDING, argbToHex, brandingFromData, type Branding } from '../types/models'
import { useAuth } from './AuthContext'

interface BrandingState {
  branding: Branding
  saveBranding: (b: Branding) => Promise<void>
}

const BrandingContext = createContext<BrandingState>({
  branding: DEFAULT_BRANDING,
  saveBranding: async () => {},
})

function applyCssVars(b: Branding) {
  // Drives the shadcn theme (--primary) plus the custom --brand accent token.
  const root = document.documentElement
  root.style.setProperty('--primary', argbToHex(b.primaryColorValue))
  root.style.setProperty('--ring', argbToHex(b.primaryColorValue))
  root.style.setProperty('--brand', argbToHex(b.accentColorValue))
}

export function BrandingProvider({ children }: { children: ReactNode }) {
  const { firebaseUser } = useAuth()
  const [branding, setBranding] = useState<Branding>(DEFAULT_BRANDING)

  // Branding doc is only readable when authenticated (rules), so subscribe per login.
  useEffect(() => {
    if (!firebaseUser) {
      setBranding(DEFAULT_BRANDING)
      applyCssVars(DEFAULT_BRANDING)
      return
    }
    return onSnapshot(
      doc(db, COL.settings, 'branding'),
      (snap) => {
        const b = brandingFromData(snap.data())
        setBranding(b)
        applyCssVars(b)
      },
      (err) => console.error('branding listener error', err),
    )
  }, [firebaseUser])

  const saveBranding = async (b: Branding) => {
    await setDoc(doc(db, COL.settings, 'branding'), { ...b })
  }

  return (
    <BrandingContext.Provider value={{ branding, saveBranding }}>
      {children}
    </BrandingContext.Provider>
  )
}

export const useBranding = () => useContext(BrandingContext)
