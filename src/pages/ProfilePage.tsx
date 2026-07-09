import { useState, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { updateProfile } from '../services/users'

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

  const field =
    'mb-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30'

  return (
    <div className="mx-auto max-w-md">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">My Profile</h2>
      <form onSubmit={submit} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
        <input value={profile.email} disabled className={`${field} bg-gray-50 text-gray-500`} />

        <label className="mb-1 block text-sm font-medium text-gray-700">Role</label>
        <input value={profile.role} disabled className={`${field} bg-gray-50 capitalize text-gray-500`} />

        <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="displayName">
          Display Name
        </label>
        <input
          id="displayName"
          required
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className={field}
        />

        <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="phone">
          Phone <span className="font-normal text-gray-400">(optional)</span>
        </label>
        <input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={field} />

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Saving…' : saved ? 'Saved ✓' : 'Save Changes'}
        </button>
      </form>
    </div>
  )
}
