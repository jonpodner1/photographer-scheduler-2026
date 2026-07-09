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

  if (!profile) return null

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    await updateProfile(profile.uid, {
      displayName: displayName.trim(),
      phone: phone.trim() || null,
    })
    setBusy(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="mx-auto max-w-md">
      <h2 className="mb-4 text-lg font-semibold">My Profile</h2>
      <Card>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
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
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">
                Phone <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <Button type="submit" size="lg" disabled={busy} className="w-full">
              {busy ? 'Saving…' : saved ? 'Saved ✓' : 'Save Changes'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
