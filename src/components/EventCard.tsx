import type { ReactNode } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  isFull,
  isOpen,
  slotsRemaining,
  type ScheduleEvent,
} from '../types/models'
import { formatDateLong, formatTimeRange } from '../lib/format'

export function StatusBadge({ event }: { event: ScheduleEvent }) {
  if (event.status === 'cancelled')
    return (
      <Badge className="border-transparent bg-red-100 text-red-700" variant="outline">
        Cancelled
      </Badge>
    )
  if (isFull(event))
    return (
      <Badge className="border-transparent bg-green-100 text-green-700" variant="outline">
        Filled
      </Badge>
    )
  return (
    <Badge className="border-transparent bg-amber-100 text-amber-700" variant="outline">
      {slotsRemaining(event)} {slotsRemaining(event) === 1 ? 'slot' : 'slots'} open
    </Badge>
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
    <Card
      className={cn(
        'print-avoid-break gap-0 p-4',
        signedUp && 'border-primary/40 ring-1 ring-primary/30',
        muted && 'opacity-75',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold">{event.eventName}</h3>
          <p className="text-sm text-muted-foreground">{formatDateLong(event.date)}</p>
        </div>
        <div className="flex items-center gap-2">
          {signedUp && (
            <Badge variant="outline" className="border-transparent bg-primary/10 text-primary">
              You're signed up
            </Badge>
          )}
          <StatusBadge event={event} />
        </div>
      </div>

      <dl className="mt-3 space-y-1 text-sm">
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 text-muted-foreground">Time</dt>
          <dd>{formatTimeRange(event.startTime, event.endTime)}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 text-muted-foreground">Where</dt>
          <dd>{event.location}</dd>
        </div>
        {event.notes && (
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 text-muted-foreground">Notes</dt>
            <dd className="whitespace-pre-wrap">{event.notes}</dd>
          </div>
        )}
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 text-muted-foreground">Slots</dt>
          <dd>
            {event.slots.length}/{event.slotsNeeded} filled
            {event.slots.length > 0 && (
              <span className="text-muted-foreground">
                {' — '}
                {event.slots.map((s) => s.photographerName).join(', ')}
              </span>
            )}
          </dd>
        </div>
      </dl>

      {children}
      {actions && <div className="mt-4 flex flex-wrap gap-2">{actions}</div>}
    </Card>
  )
}

// re-export for convenience in pages
export { isOpen }
