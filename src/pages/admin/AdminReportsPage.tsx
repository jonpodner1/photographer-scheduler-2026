import { useEffect, useMemo, useState } from 'react'
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
        <div className="flex rounded-lg border border-gray-300 bg-white p-0.5 text-sm">
          {(['day', 'week', 'month'] as ViewType[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-md px-4 py-1.5 font-medium capitalize ${
                view === v ? 'bg-primary text-white' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {v}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-1 py-0.5">
          <button onClick={() => navigate(-1)} className="rounded p-1.5 hover:bg-gray-100" aria-label="Previous">
            ‹
          </button>
          <button
            onClick={() => setRefDate(new Date())}
            className="rounded px-2 py-1 text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            Today
          </button>
          <button onClick={() => navigate(1)} className="rounded p-1.5 hover:bg-gray-100" aria-label="Next">
            ›
          </button>
        </div>

        <span className="text-sm font-medium text-gray-700">{rangeLabel(view, refDate)}</span>

        <button
          onClick={() => window.print()}
          className="ml-auto rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          🖨 Print / Save PDF
        </button>
      </div>

      {/* Stats — hidden when printing */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 print:hidden">
        <StatCard label="Total Events" value={stats.total} />
        <StatCard label="Open / Unfilled" value={stats.open} tone="text-amber-600" />
        <StatCard label="Fully Filled" value={stats.filled} tone="text-green-600" />
        <StatCard label="Cancelled" value={stats.cancelled} tone="text-red-600" />
      </div>

      {/* Printable schedule */}
      <div data-print-root className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm print:rounded-none print:border-0 print:shadow-none">
        <div className="mb-4 border-b-2 border-primary pb-3">
          <div className="flex items-baseline justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-primary">{branding.pdfHeaderLine1}</h2>
              {branding.pdfHeaderLine2 && <p className="text-sm text-gray-600">{branding.pdfHeaderLine2}</p>}
              <p className="text-sm text-gray-600">{rangeLabel(view, refDate)}</p>
            </div>
            <p className="text-xs text-gray-400">
              Generated: {formatDateShort(new Date())} {formatTime(new Date())}
            </p>
          </div>
        </div>

        {!events ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : grouped.length === 0 ? (
          <p className="py-8 text-center text-sm italic text-gray-500">
            No events scheduled for this period.
          </p>
        ) : (
          <div className="space-y-6">
            {grouped.map(([key, dayEvents]) => (
              <section key={key} className="print-avoid-break">
                <h3 className="mb-2 inline-block rounded bg-primary px-3 py-1 text-sm font-semibold text-white">
                  {formatDateLong(new Date(key))}
                </h3>
                <div className="overflow-x-auto">
                <table className="w-full min-w-[540px] border-collapse text-sm">
                  <thead>
                    <tr className="bg-primary/5 text-left text-xs font-semibold uppercase tracking-wide text-primary">
                      <th className="border border-gray-200 px-2.5 py-1.5">Event</th>
                      <th className="border border-gray-200 px-2.5 py-1.5">Time</th>
                      <th className="border border-gray-200 px-2.5 py-1.5">Location</th>
                      <th className="border border-gray-200 px-2.5 py-1.5">Slots</th>
                      <th className="border border-gray-200 px-2.5 py-1.5">Photographers</th>
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
                        <td className="border border-gray-200 px-2.5 py-1.5">
                          {e.eventName}
                          {e.status === 'cancelled' && (
                            <span className="ml-1 text-xs font-medium text-red-600">(cancelled)</span>
                          )}
                        </td>
                        <td className="border border-gray-200 px-2.5 py-1.5 whitespace-nowrap">
                          {formatTimeRange(e.startTime, e.endTime)}
                        </td>
                        <td className="border border-gray-200 px-2.5 py-1.5">{e.location}</td>
                        <td
                          className={`border border-gray-200 px-2.5 py-1.5 font-semibold whitespace-nowrap ${
                            isFull(e) ? 'text-green-700' : 'text-amber-700'
                          }`}
                        >
                          {e.slots.length}/{e.slotsNeeded}
                        </td>
                        <td className="border border-gray-200 px-2.5 py-1.5">
                          {e.slots.length === 0 ? (
                            <span className="italic text-gray-400">Unassigned</span>
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
      </div>
    </div>
  )
}

function StatCard({ label, value, tone = 'text-gray-800' }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-2xl font-bold ${tone}`}>{value}</p>
    </div>
  )
}
