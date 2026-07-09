import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useBranding } from '../../context/BrandingContext'
import { listenOpenEvents } from '../../services/events'
import { signUpForEvent } from '../../services/callables'
import EventCard from '../../components/EventCard'
import Modal from '../../components/Modal'
import Spinner from '../../components/Spinner'
import { isOpen, isSignedUpBy, type ScheduleEvent } from '../../types/models'
import { formatDateLong, formatTimeRange } from '../../lib/format'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'

export default function AvailableEventsPage() {
  const { profile } = useAuth()
  const { branding } = useBranding()
  const [events, setEvents] = useState<ScheduleEvent[] | null>(null)
  const [signupTarget, setSignupTarget] = useState<ScheduleEvent | null>(null)
  const [requestCamera, setRequestCamera] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => listenOpenEvents(setEvents), [])

  if (!profile) return null
  if (!events) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    )
  }

  const available = events.filter(isOpen)

  const confirmSignup = async () => {
    if (!signupTarget) return
    setBusy(true)
    setError(null)
    const err = await signUpForEvent(signupTarget.id, requestCamera)
    setBusy(false)
    if (err) {
      setError(err)
    } else {
      setSignupTarget(null)
      setRequestCamera(false)
    }
  }

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold">Available Events</h2>

      {!branding.selfSignupEnabled && (
        <Alert className="mb-4 border-amber-300 bg-amber-50">
          <AlertDescription className="text-amber-900">
            Self-signup is currently disabled. Your adviser will assign photographers to events.
          </AlertDescription>
        </Alert>
      )}

      {available.length === 0 ? (
        <Card className="border-dashed p-8 text-center text-sm text-muted-foreground">
          No open events right now. Check back soon!
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {available.map((event) => {
            const signedUp = isSignedUpBy(event, profile.uid)
            return (
              <EventCard
                key={event.id}
                event={event}
                signedUp={signedUp}
                actions={
                  branding.selfSignupEnabled && !signedUp ? (
                    <Button
                      onClick={() => {
                        setSignupTarget(event)
                        setRequestCamera(false)
                        setError(null)
                      }}
                    >
                      Sign Up
                    </Button>
                  ) : undefined
                }
              />
            )
          })}
        </div>
      )}

      {signupTarget && (
        <Modal title="Confirm Sign-Up" onClose={() => !busy && setSignupTarget(null)}>
          <p className="text-sm">
            Sign up to photograph <span className="font-semibold">{signupTarget.eventName}</span>?
          </p>
          <p className="text-sm text-muted-foreground">
            {formatDateLong(signupTarget.date)} · {formatTimeRange(signupTarget.startTime, signupTarget.endTime)} ·{' '}
            {signupTarget.location}
          </p>

          <div className="mt-2 flex items-center gap-2">
            <Checkbox
              id="requestCamera"
              checked={requestCamera}
              onCheckedChange={(v) => setRequestCamera(v === true)}
            />
            <Label htmlFor="requestCamera" className="font-normal">
              I need to borrow a yearbook camera
            </Label>
          </div>

          {error && (
            <Alert variant="destructive" className="mt-3">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setSignupTarget(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={confirmSignup} disabled={busy}>
              {busy ? 'Signing up…' : 'Confirm Sign-Up'}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
