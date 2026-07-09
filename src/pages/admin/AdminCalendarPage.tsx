import { useCallback, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { DatesSetArg, EventClickArg } from '@fullcalendar/core'
import { listenEventsInRange } from '../../services/events'
import { isFull, type ScheduleEvent } from '../../types/models'

export default function AdminCalendarPage() {
  const navigate = useNavigate()
  const [events, setEvents] = useState<ScheduleEvent[]>([])
  const unsubRef = useRef<(() => void) | null>(null)

  // Re-subscribe whenever the visible range changes (month/week/day navigation).
  const onDatesSet = useCallback((arg: DatesSetArg) => {
    unsubRef.current?.()
    unsubRef.current = listenEventsInRange(arg.start, arg.end, setEvents)
  }, [])

  const calendarEvents = useMemo(
    () =>
      events.map((e) => ({
        id: e.id,
        title: `${e.eventName} (${e.slots.length}/${e.slotsNeeded})`,
        start: e.startTime,
        end: e.endTime ?? undefined,
        backgroundColor:
          e.status === 'cancelled' ? '#dc2626' : isFull(e) ? '#16a34a' : '#d97706',
        borderColor: 'transparent',
        classNames: e.status === 'cancelled' ? ['line-through', 'opacity-70'] : [],
      })),
    [events],
  )

  const onEventClick = (arg: EventClickArg) => {
    navigate(`/admin/events/${arg.event.id}/edit`)
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap gap-4 text-xs text-gray-600">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-amber-600" /> Needs photographers
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-green-600" /> Filled
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-red-600" /> Cancelled
        </span>
      </div>
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        headerToolbar={{
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,timeGridWeek,timeGridDay',
        }}
        events={calendarEvents}
        datesSet={onDatesSet}
        eventClick={onEventClick}
        height="auto"
        nowIndicator
        dayMaxEventRows={4}
      />
    </div>
  )
}
