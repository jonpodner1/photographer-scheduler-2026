import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function SignupPage() {
  const { signUp } = useAuth()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setBusy(true)
    setError(null)
    const err = await signUp(email.trim(), password, displayName.trim(), phone.trim())
    if (err) setError(err)
    setBusy(false)
    // On success the auth listener redirects automatically.
  }

  const field =
    'mb-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30'

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-bold text-gray-900">Create your account</h1>
          <p className="text-sm text-gray-500">
            New accounts join as photographers. Admins are promoted by an existing admin.
          </p>
        </div>

        <form onSubmit={submit} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="name">
            Full Name
          </label>
          <input id="name" required value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={field} autoComplete="name" />

          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="email">
            Email
          </label>
          <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={field} autoComplete="email" />

          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="phone">
            Phone <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={field} autoComplete="tel" />

          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="password">
            Password
          </label>
          <input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className={field} autoComplete="new-password" />

          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="confirm">
            Confirm Password
          </label>
          <input id="confirm" type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} className={field} autoComplete="new-password" />

          <button
            type="submit"
            disabled={busy}
            className="mt-2 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Creating account…' : 'Sign Up'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-gray-600">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
