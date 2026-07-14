import { useAuth } from '../context/AuthContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

/** Full-screen gate shown to signed-in users whose account is pending or denied. */
export default function AccountStatusPage({ denied = false }: { denied?: boolean }) {
  const { profile, signOut } = useAuth()

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted p-4">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted text-3xl">
            {denied ? '🚫' : '⏳'}
          </div>
          {denied ? (
            <>
              <h1 className="text-lg font-semibold">Account not approved</h1>
              <p className="text-sm text-muted-foreground">
                Your account request was not approved. If you think this is a mistake, talk to
                your yearbook adviser — they can approve you from the Users tab.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-lg font-semibold">Waiting for approval</h1>
              <p className="text-sm text-muted-foreground">
                Thanks for signing up{profile ? `, ${profile.displayName.split(' ')[0]}` : ''}!
                Your yearbook adviser has been notified and needs to approve your account before
                you can sign up for events. Check back soon — this page updates automatically
                once you're approved.
              </p>
            </>
          )}
          <Button variant="outline" onClick={() => signOut()}>
            Sign Out
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
