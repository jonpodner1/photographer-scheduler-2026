import type { ReactNode } from 'react'
import {
  isFull,
  isOpen,
  slotsRemaining,
  type ScheduleEvent,
} from '../types/models'
import { formatDateLong, formatTimeRange } from '../lib/format'

export function StatusBadge({ event }: { event: ScheduleEvent }) {
  if (event.status === 'cancelled')
    return <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">Cancelled</span>
  if (isFull(event))
    return <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">Filled</span>
  return (
    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
      {slotsRemaining(event)} {slotsRemaining(event) === 1 ? 'slot' : 'slots'} open
    </span>
  )
}

interface EventCardProps {
  event: ScheduleEvent
  /** Highlight ring + label when the current user is signed up. */
  signedUp?: boolean
  /** Action buttons rendered at the bottom of the card. */
  actions?: ReactNode
  /** Extra content (e.g. slot list with admin remove buttons). */
  children?: ReactNode
  muted?: boolean
}

export default function EventCard({ event, signedUp, actions, children, muted }: EventCardProps) {
  return (
    <div
      className={`print-avoid-break rounded-xl border bg-white p-4 shadow-sm ${
        signedUp ? 'border-primary/40 ring-1 ring-primary/30' : 'border-gray-200'
      } ${muted ? 'opacity-75' : ''}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-gray-900">{event.eventName}</h3>
          <p className="text-sm text-gray-600">{formatDateLong(event.date)}</p>
        </div>
        <div className="flex items-center gap-2">
          {signedUp && (
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
              You're signed up
            </span>
          )}
          <StatusBadge event={event} />
        </div>
      </div>

      <dl className="mt-3 space-y-1 text-sm text-gray-700">
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 text-gray-400">Time</dt>
          <dd>{formatTimeRange(event.startTime, event.endTime)}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 text-gray-400">Where</dt>
          <dd>{event.location}</dd>
        </div>
        {event.notes && (
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 text-gray-400">Notes</dt>
            <dd className="whitespace-pre-wrap">{event.notes}</dd>
          </div>
        )}
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 text-gray-400">Slots</dt>
          <dd>
            {event.slots.length}/{event.slotsNeeded} filled
            {event.slots.length > 0 && (
              <span className="text-gray-500">
                {' — '}
                {event.slots.map((s) => s.photographerName).join(', ')}
              </span>
            )}
          </dd>
        </div>
      </dl>

      {children}
      {actions && <div className="mt-4 flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

// re-export for convenience in pages
export { isOpen }
