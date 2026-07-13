import { useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import EventCard from './EventCard'
import Spinner from './Spinner'
import { usePhotographerStats } from '../hooks/usePhotographerStats'
import { updateScoreAdjustment } from '../services/users'
import type { AppUser } from '../types/models'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface Props {
  photographer: AppUser
  /** Show the admin-only score override controls. */
  adminControls?: boolean
}

/**
 * Rank + score summary and the photographer's current/previous events.
 * Used by the photographer's own Dashboard tab and by the admin per-user view.
 */
export default function PhotographerDashboard({ photographer, adminControls }: Props) {
  const stats = usePhotographerStats()
  const [busy, setBusy] = useState(false)

  if (!stats) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    )
  }

  const s = stats.byUid.get(photographer.uid)
  if (!s) return <p className="text-sm text-muted-foreground">No stats for this user yet.</p>

  const adjust = async (delta: number) => {
    setBusy(true)
    try {
      await updateScoreAdjustment(photographer.uid, s.adjustment + delta)
    } finally {
      setBusy(false)
    }
  }

  const rankLabel =
    s.rank !== undefined ? `#${s.rank}` : '—'

  return (
    <div className="space-y-6">
      {/* Summary tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label={`Rank of ${stats.ranked.length} photographer${stats.ranked.length === 1 ? '' : 's'}`}
          value={rankLabel}
          tone="text-primary"
        />
        <StatTile
          label="Total score"
          value={String(s.score)}
          sub={s.adjustment !== 0 ? `${s.eventCount} signups ${s.adjustment > 0 ? '+' : ''}${s.adjustment} adjustment` : `${s.eventCount} signups`}
        />
        <StatTile label="Upcoming" value={String(s.upcoming.length)} tone="text-amber-600" />
        <StatTile label="Completed" value={String(s.past.length)} tone="text-green-600" />
      </div>

      {/* Admin score override */}
      {adminControls && (
        <Card className="flex-row items-center gap-4 p-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Score override</p>
            <p className="text-sm text-muted-foreground">
              Add or take away ranking credit without touching real signups.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon-sm"
              disabled={busy}
              onClick={() => adjust(-1)}
              aria-label="Take one point"
            >
              <Minus />
            </Button>
            <span
              className={cn(
                'w-12 text-center font-mono text-sm font-semibold',
                s.adjustment > 0 && 'text-green-600',
                s.adjustment < 0 && 'text-red-600',
              )}
            >
              {s.adjustment > 0 ? `+${s.adjustment}` : s.adjustment}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={busy}
              onClick={() => adjust(1)}
              aria-label="Add one point"
            >
              <Plus />
            </Button>
          </div>
        </Card>
      )}

      {/* Current events */}
      <section>
        <h3 className="mb-3 text-base font-semibold">Current Events</h3>
        {s.upcoming.length === 0 ? (
          <Card className="border-dashed p-6 text-center text-sm text-muted-foreground">
            No upcoming signups.
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {s.upcoming.map((event) => (
              <EventCard key={event.id} event={event} signedUp />
            ))}
          </div>
        )}
      </section>

      {/* Previous events */}
      <section>
        <h3 className="mb-3 text-base font-semibold">Previous Events</h3>
        {s.past.length === 0 ? (
          <Card className="border-dashed p-6 text-center text-sm text-muted-foreground">
            No past events yet.
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {s.past.map((event) => (
              <EventCard key={event.id} event={event} muted />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function StatTile({
  label,
  value,
  sub,
  tone = '',
}: {
  label: string
  value: string
  sub?: string
  tone?: string
}) {
  return (
    <Card className="gap-1 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('text-2xl font-bold', tone)}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </Card>
  )
}
