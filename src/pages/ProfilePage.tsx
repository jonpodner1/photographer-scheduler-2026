import { useState, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { updateProfile } from '../services/users'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function ProfilePage() {
  const { profile } = useAuth()
  const [displayName, setDisplayName] = useState(profile?.displayName ?? '')
  const [phone, setPhone] = useState(profile?.phone ?? '')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!profile) return null

  // MCHS-app accounts live in the iOS app's users/{uid} doc, which the rules
  // let a user change only for push-token fields — so name/phone are read-only
  // here and edited in the app instead.
  const readOnly = profile.source === 'app'

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (readOnly) return
    setBusy(true)
    try {
      await updateProfile(profile.uid, {
        displayName: displayName.trim(),
        phone: phone.trim() || null,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      console.error('profile save failed', err)
      setError('Could not save your profile. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <h2 className="mb-4 text-lg font-semibold">My Profile</h2>
      <Card>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            {readOnly && (
              <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                Your account comes from the MCHS app — edit your name and phone number there.
              </p>
            )}
            {error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={profile.email} disabled />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Input value={profile.role} disabled className="capitalize" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="displayName">Display Name</Label>
              <Input
                id="displayName"
                required
                disabled={readOnly}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">
                Phone <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="phone"
                type="tel"
                disabled={readOnly}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <Button type="submit" size="lg" disabled={busy || readOnly} className="w-full">
              {busy ? 'Saving…' : saved ? 'Saved ✓' : 'Save Changes'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
