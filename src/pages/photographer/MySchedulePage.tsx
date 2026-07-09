import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { listenMyEvents } from '../../services/events'
import { withdrawFromEvent } from '../../services/callables'
import EventCard from '../../components/EventCard'
import Modal from '../../components/Modal'
import Spinner from '../../components/Spinner'
import type { ScheduleEvent } from '../../types/models'
import { formatDateLong, startOfDay } from '../../lib/format'

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
      <h2 className="mb-4 text-lg font-semibold text-gray-900">My Schedule</h2>

      {upcoming.length === 0 && cancelled.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
          You're not signed up for any upcoming events. Head to Available Events to grab a slot.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {upcoming.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              signedUp
              actions={
                <button
                  onClick={() => {
                    setWithdrawTarget(event)
                    setError(null)
                  }}
                  className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  Withdraw
                </button>
              }
            >
              {mySlot(event)?.requestedCamera && (
                <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-accent">
                  📷 Yearbook camera requested
                </p>
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
          <p className="text-sm text-gray-700">
            Withdraw from <span className="font-semibold">{withdrawTarget.eventName}</span> on{' '}
            {formatDateLong(withdrawTarget.date)}? Your slot will reopen for other photographers.
          </p>
          {error && <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          <div className="mt-5 flex justify-end gap-2">
            <button
              onClick={() => setWithdrawTarget(null)}
              disabled={busy}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Keep My Slot
            </button>
            <button
              onClick={confirmWithdraw}
              disabled={busy}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {busy ? 'Withdrawing…' : 'Withdraw'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
