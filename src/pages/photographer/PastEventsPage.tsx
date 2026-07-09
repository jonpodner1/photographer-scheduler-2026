import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { listenPastEvents } from '../../services/events'
import EventCard from '../../components/EventCard'
import Spinner from '../../components/Spinner'
import { isSignedUpBy, type ScheduleEvent } from '../../types/models'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

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
        <h2 className="text-lg font-semibold">Past Events</h2>
        <div className="flex items-center gap-2">
          <Checkbox
            id="mineOnly"
            checked={mineOnly}
            onCheckedChange={(v) => setMineOnly(v === true)}
          />
          <Label htmlFor="mineOnly" className="font-normal text-muted-foreground">
            Only events I shot
          </Label>
        </div>
      </div>

      {shown.length === 0 ? (
        <Card className="border-dashed p-8 text-center text-sm text-muted-foreground">
          No past events{mineOnly ? ' you were signed up for' : ''}.
        </Card>
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
