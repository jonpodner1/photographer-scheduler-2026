import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Printer } from 'lucide-react'
import { useBranding } from '../../context/BrandingContext'
import { listenEventsInRange } from '../../services/events'
import Spinner from '../../components/Spinner'
import { isFull, isOpen, type ScheduleEvent } from '../../types/models'
import {
  addDays,
  formatDateLong,
  formatDateShort,
  formatMonthYear,
  formatTime,
  formatTimeRange,
  startOfDay,
  startOfWeek,
} from '../../lib/format'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

type ViewType = 'day' | 'week' | 'month'

function getRange(view: ViewType, ref: Date): { start: Date; end: Date } {
  switch (view) {
    case 'day': {
      const d = startOfDay(ref)
      return { start: d, end: d }
    }
    case 'week': {
      const start = startOfWeek(ref)
      return { start, end: addDays(start, 6) }
    }
    case 'month': {
      return {
        start: new Date(ref.getFullYear(), ref.getMonth(), 1),
        end: new Date(ref.getFullYear(), ref.getMonth() + 1, 0),
      }
    }
  }
}

function rangeLabel(view: ViewType, ref: Date): string {
  const r = getRange(view, ref)
  switch (view) {
    case 'day':
      return formatDateLong(r.start)
    case 'week':
      return `Week of ${formatDateShort(r.start)} – ${formatDateShort(r.end)}`
    case 'month':
      return formatMonthYear(ref)
  }
}

export default function AdminReportsPage() {
  const { branding } = useBranding()
  const [view, setView] = useState<ViewType>('week')
  const [refDate, setRefDate] = useState(new Date())
  const [events, setEvents] = useState<ScheduleEvent[] | null>(null)

  const range = useMemo(() => getRange(view, refDate), [view, refDate])

  useEffect(() => {
    setEvents(null)
    return listenEventsInRange(range.start, range.end, setEvents)
  }, [range.start.getTime(), range.end.getTime()]) // eslint-disable-line react-hooks/exhaustive-deps

  const navigate = (dir: 1 | -1) => {
    setRefDate((d) => {
      if (view === 'day') return addDays(d, dir)
      if (view === 'week') return addDays(d, 7 * dir)
      return new Date(d.getFullYear(), d.getMonth() + dir, 1)
    })
  }

  const grouped = useMemo(() => {
    const map = new Map<string, ScheduleEvent[]>()
    for (const e of events ?? []) {
      const key = startOfDay(e.date).toISOString()
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(e)
    }
    for (const list of map.values()) list.sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [events])

  const stats = useMemo(() => {
    const list = events ?? []
    return {
      total: list.length,
      open: list.filter(isOpen).length,
      filled: list.filter((e) => isFull(e) && e.status !== 'cancelled').length,
      cancelled: list.filter((e) => e.status === 'cancelled').length,
    }
  }, [events])

  return (
    <div>
      {/* Controls — hidden when printing */}
      <div className="mb-4 flex flex-wrap items-center gap-3 print:hidden">
        <Tabs value={view} onValueChange={(v) => setView(v as ViewType)}>
          <TabsList>
            <TabsTrigger value="day">Day</TabsTrigger>
            <TabsTrigger value="week">Week</TabsTrigger>
            <TabsTrigger value="month">Month</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" onClick={() => navigate(-1)} aria-label="Previous">
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setRefDate(new Date())}>
            Today
          </Button>
          <Button variant="outline" size="icon-sm" onClick={() => navigate(1)} aria-label="Next">
            <ChevronRight />
          </Button>
        </div>

        <span className="text-sm font-medium">{rangeLabel(view, refDate)}</span>

        <Button className="ml-auto" onClick={() => window.print()}>
          <Printer /> Print / Save PDF
        </Button>
      </div>

      {/* Stats — hidden when printing */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 print:hidden">
        <StatCard label="Total Events" value={stats.total} />
        <StatCard label="Open / Unfilled" value={stats.open} tone="text-amber-600" />
        <StatCard label="Fully Filled" value={stats.filled} tone="text-green-600" />
        <StatCard label="Cancelled" value={stats.cancelled} tone="text-red-600" />
      </div>

      {/* Printable schedule */}
      <Card data-print-root className="block p-6 print:rounded-none print:border-0 print:shadow-none">
        <div className="mb-4 border-b-2 border-primary pb-3">
          <div className="flex items-baseline justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-primary">{branding.pdfHeaderLine1}</h2>
              {branding.pdfHeaderLine2 && (
                <p className="text-sm text-muted-foreground">{branding.pdfHeaderLine2}</p>
              )}
              <p className="text-sm text-muted-foreground">{rangeLabel(view, refDate)}</p>
            </div>
            <p className="text-xs text-muted-foreground/70">
              Generated: {formatDateShort(new Date())} {formatTime(new Date())}
            </p>
          </div>
        </div>

        {!events ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : grouped.length === 0 ? (
          <p className="py-8 text-center text-sm italic text-muted-foreground">
            No events scheduled for this period.
          </p>
        ) : (
          <div className="space-y-6">
            {grouped.map(([key, dayEvents]) => (
              <section key={key} className="print-avoid-break">
                <h3 className="mb-2 inline-block rounded bg-primary px-3 py-1 text-sm font-semibold text-primary-foreground">
                  {formatDateLong(new Date(key))}
                </h3>
                <div className="overflow-x-auto">
                <table className="w-full min-w-[540px] border-collapse text-sm">
                  <thead>
                    <tr className="bg-primary/5 text-left text-xs font-semibold uppercase tracking-wide text-primary">
                      <th className="border border-border px-2.5 py-1.5">Event</th>
                      <th className="border border-border px-2.5 py-1.5">Time</th>
                      <th className="border border-border px-2.5 py-1.5">Location</th>
                      <th className="border border-border px-2.5 py-1.5">Slots</th>
                      <th className="border border-border px-2.5 py-1.5">Photographers</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dayEvents.map((e) => (
                      <tr
                        key={e.id}
                        className={
                          e.status === 'cancelled'
                            ? 'bg-red-50'
                            : isFull(e)
                              ? 'bg-green-50'
                              : 'bg-amber-50'
                        }
                      >
                        <td className="border border-border px-2.5 py-1.5">
                          {e.eventName}
                          {e.status === 'cancelled' && (
                            <span className="ml-1 text-xs font-medium text-red-600">(cancelled)</span>
                          )}
                        </td>
                        <td className="border border-border px-2.5 py-1.5 whitespace-nowrap">
                          {formatTimeRange(e.startTime, e.endTime)}
                        </td>
                        <td className="border border-border px-2.5 py-1.5">{e.location}</td>
                        <td
                          className={cn(
                            'border border-border px-2.5 py-1.5 font-semibold whitespace-nowrap',
                            isFull(e) ? 'text-green-700' : 'text-amber-700',
                          )}
                        >
                          {e.slots.length}/{e.slotsNeeded}
                        </td>
                        <td className="border border-border px-2.5 py-1.5">
                          {e.slots.length === 0 ? (
                            <span className="italic text-muted-foreground">Unassigned</span>
                          ) : (
                            e.slots.map((s) => s.photographerName).join(', ')
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </section>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

function StatCard({ label, value, tone = '' }: { label: string; value: number; tone?: string }) {
  return (
    <Card className="gap-1 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('text-2xl font-bold', tone)}>{value}</p>
    </Card>
  )
}
