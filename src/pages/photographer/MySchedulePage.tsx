import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { listenMyEvents } from '../../services/events'
import { withdrawFromEvent } from '../../services/callables'
import EventCard from '../../components/EventCard'
import Modal from '../../components/Modal'
import Spinner from '../../components/Spinner'
import type { ScheduleEvent } from '../../types/models'
import { formatDateLong, startOfDay } from '../../lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

export default function MySchedulePage() {
  const { profile } = useAuth()
  const [events, setEvents] = useState<ScheduleEvent[] | null>(null)
  const [withdrawTarget, setWithdrawTarget] = useState<ScheduleEvent | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!profile) return
    return listenMyEvents(profile.uid, setEvents)
  }, [profile])

  if (!profile) return null
  if (!events) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    )
  }

  const today = startOfDay(new Date()).getTime()
  const upcoming = events.filter((e) => e.date.getTime() >= today && e.status !== 'cancelled')
  const cancelled = events.filter((e) => e.date.getTime() >= today && e.status === 'cancelled')

  const confirmWithdraw = async () => {
    if (!withdrawTarget) return
    setBusy(true)
    setError(null)
    const err = await withdrawFromEvent(withdrawTarget.id)
    setBusy(false)
    if (err) setError(err)
    else setWithdrawTarget(null)
  }

  const mySlot = (e: ScheduleEvent) => e.slots.find((s) => s.photographerId === profile.uid)

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold">My Schedule</h2>

      {upcoming.length === 0 && cancelled.length === 0 ? (
        <Card className="border-dashed p-8 text-center text-sm text-muted-foreground">
          You're not signed up for any upcoming events. Head to Available Events to grab a slot.
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {upcoming.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              signedUp
              actions={
                <Button
                  variant="destructive"
                  onClick={() => {
                    setWithdrawTarget(event)
                    setError(null)
                  }}
                >
                  Withdraw
                </Button>
              }
            >
              {mySlot(event)?.requestedCamera && (
                <Badge variant="outline" className="mt-2 border-transparent bg-brand/10 text-brand">
                  📷 Yearbook camera requested
                </Badge>
              )}
            </EventCard>
          ))}
          {cancelled.map((event) => (
            <EventCard key={event.id} event={event} muted />
          ))}
        </div>
      )}

      {withdrawTarget && (
        <Modal title="Withdraw from Event" onClose={() => !busy && setWithdrawTarget(null)}>
          <p className="text-sm">
            Withdraw from <span className="font-semibold">{withdrawTarget.eventName}</span> on{' '}
            {formatDateLong(withdrawTarget.date)}? Your slot will reopen for other photographers.
          </p>
          {error && (
            <Alert variant="destructive" className="mt-3">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setWithdrawTarget(null)} disabled={busy}>
              Keep My Slot
            </Button>
            <Button variant="destructive" onClick={confirmWithdraw} disabled={busy}>
              {busy ? 'Withdrawing…' : 'Withdraw'}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
