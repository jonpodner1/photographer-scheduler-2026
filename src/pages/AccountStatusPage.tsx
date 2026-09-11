import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { requestAppPhotographerAccess } from '../services/users'
import type { UserSource, UserStatus } from '../types/models'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface Props {
  status: UserStatus
  source: UserSource
  uid: string
}

/**
 * Full-screen gate for signed-in users who can't use the scheduler yet:
 * pending approval, denied, or (MCHS-app accounts) never asked for
 * photographer access. App accounts can send the request from here — the
 * same request the app's Create Account toggle makes — so nobody has to go
 * back to their phone to get onto the website.
 */
export default function AccountStatusPage({ status, source, uid }: Props) {
  const { profile, signOut } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const firstName = profile?.displayName.split(' ')[0]
  const canRequest = source === 'app' && (status === 'none' || status === 'denied')

  const request = async () => {
    setBusy(true)
    setError(null)
    try {
      await requestAppPhotographerAccess(uid)
      // The live profile listener flips this page to "Waiting for approval".
    } catch (err) {
      console.error('photographer request failed', err)
      setError('Could not send the request. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  let icon = '⏳'
  let title = 'Waiting for approval'
  let body: string

  if (status === 'pending') {
    body = `Thanks for signing up${firstName ? `, ${firstName}` : ''}! Your yearbook adviser has been notified and needs to approve your account before you can sign up for events. Check back soon — this page updates automatically once you're approved.`
  } else if (status === 'denied') {
    icon = '🚫'
    title = 'Account not approved'
    body =
      source === 'app'
        ? 'Your photographer request was not approved. If you think this is a mistake, talk to your yearbook adviser — or send the request again below.'
        : 'Your account request was not approved. If you think this is a mistake, talk to your yearbook adviser — they can approve you from the Users tab.'
  } else {
    icon = '📷'
    title = 'Photographer access needed'
    body = `You're signed in with your MCHS app account${firstName ? `, ${firstName}` : ''}, but this site is only for yearbook photographers. Ask your adviser for photographer access below — once they approve it, you can sign up for events here and in the app.`
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted p-4">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted text-3xl">
            {icon}
          </div>
          <h1 className="text-lg font-semibold">{title}</h1>
          <p className="text-sm text-muted-foreground">{body}</p>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-wrap justify-center gap-2">
            {canRequest && (
              <Button onClick={request} disabled={busy}>
                {busy ? 'Sending…' : status === 'denied' ? 'Request again' : 'Request photographer access'}
              </Button>
            )}
            <Button variant="outline" onClick={() => signOut()}>
              Sign Out
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
