import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { listenPastEvents } from '../../services/events'
import EventCard from '../../components/EventCard'
import Spinner from '../../components/Spinner'
import { isSignedUpBy, type ScheduleEvent } from '../../types/models'

export default function PastEventsPage() {
  const { profile } = useAuth()
  const [events, setEvents] = useState<ScheduleEvent[] | null>(null)
  const [mineOnly, setMineOnly] = useState(false)

  useEffect(() => listenPastEvents(setEvents), [])

  if (!profile) return null
  if (!events) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    )
  }

  const shown = mineOnly ? events.filter((e) => isSignedUpBy(e, profile.uid)) : events

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Past Events</h2>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={mineOnly}
            onChange={(e) => setMineOnly(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 accent-[var(--color-primary)]"
          />
          Only events I shot
        </label>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
          No past events{mineOnly ? ' you were signed up for' : ''}.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {shown.map((event) => (
            <EventCard key={event.id} event={event} signedUp={isSignedUpBy(event, profile.uid)} muted />
          ))}
        </div>
      )}
    </div>
  )
}
