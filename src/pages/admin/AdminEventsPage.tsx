import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
  cancelEvent,
  deleteEvent,
  listenPastEvents,
  listenUpcomingEvents,
} from '../../services/events'
import { assignPhotographer, withdrawFromEvent } from '../../services/callables'
import { listenUsers } from '../../services/users'
import { importFromCsv, type ImportResult } from '../../services/csv'
import EventCard from '../../components/EventCard'
import Modal from '../../components/Modal'
import Spinner from '../../components/Spinner'
import { isSignedUpBy, type AppUser, type ScheduleEvent } from '../../types/models'
import { formatDateLong } from '../../lib/format'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

type Tab = 'upcoming' | 'past'

export default function AdminEventsPage() {
  const { profile } = useAuth()
  const [tab, setTab] = useState<Tab>('upcoming')
  const [upcoming, setUpcoming] = useState<ScheduleEvent[] | null>(null)
  const [past, setPast] = useState<ScheduleEvent[] | null>(null)
  const [users, setUsers] = useState<AppUser[]>([])

  const [assignTarget, setAssignTarget] = useState<ScheduleEvent | null>(null)
  const [confirmAction, setConfirmAction] = useState<{
    kind: 'cancel' | 'delete'
    event: ScheduleEvent
  } | null>(null)
  const [csvOpen, setCsvOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => listenUpcomingEvents(setUpcoming), [])
  useEffect(() => (tab === 'past' ? listenPastEvents(setPast) : undefined), [tab])
  useEffect(() => listenUsers(setUsers), [])

  const events = tab === 'upcoming' ? upcoming : past
  const photographers = useMemo(() => users.filter((u) => u.role === 'photographer'), [users])

  const runConfirm = async () => {
    if (!confirmAction) return
    setError(null)
    try {
      if (confirmAction.kind === 'cancel') await cancelEvent(confirmAction.event.id)
      else await deleteEvent(confirmAction.event.id)
      setConfirmAction(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const removePhotographer = async (event: ScheduleEvent, uid: string) => {
    const err = await withdrawFromEvent(event.id, uid)
    if (err) setError(err)
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList>
            <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
            <TabsTrigger value="past">Past</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setCsvOpen(true)}>
            Import CSV
          </Button>
          <Button asChild>
            <Link to="/admin/events/new">+ New Event</Link>
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription className="flex w-full items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="font-medium underline">
              Dismiss
            </button>
          </AlertDescription>
        </Alert>
      )}

      {!events ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : events.length === 0 ? (
        <Card className="border-dashed p-8 text-center text-sm text-muted-foreground">
          No {tab} events.
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {events.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              muted={event.status === 'cancelled' || tab === 'past'}
              actions={
                <>
                  {tab === 'upcoming' && (
                    <>
                      <Button variant="outline" size="sm" asChild>
                        <Link to={`/admin/events/${event.id}/edit`}>Edit</Link>
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setAssignTarget(event)}>
                        Assign
                      </Button>
                      {event.status !== 'cancelled' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
                          onClick={() => setConfirmAction({ kind: 'cancel', event })}
                        >
                          Cancel Event
                        </Button>
                      )}
                    </>
                  )}
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setConfirmAction({ kind: 'delete', event })}
                  >
                    Delete
                  </Button>
                </>
              }
            >
              {event.slots.length > 0 && tab === 'upcoming' && (
                <ul className="mt-3 space-y-1 rounded-lg bg-muted p-2">
                  {event.slots.map((s) => (
                    <li key={s.photographerId} className="flex items-center justify-between gap-2 text-sm">
                      <span>
                        {s.photographerName}
                        {s.requestedCamera && (
                          <span className="ml-1.5 text-xs text-brand" title="Requested yearbook camera">
                            📷 camera
                          </span>
                        )}
                      </span>
                      <Button
                        variant="link"
                        size="xs"
                        className="text-destructive"
                        onClick={() => removePhotographer(event, s.photographerId)}
                      >
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </EventCard>
          ))}
        </div>
      )}

      {assignTarget && (
        <AssignModal
          event={
            // keep modal in sync with live updates
            (events ?? []).find((e) => e.id === assignTarget.id) ?? assignTarget
          }
          photographers={photographers}
          onClose={() => setAssignTarget(null)}
        />
      )}

      {confirmAction && (
        <Modal
          title={confirmAction.kind === 'cancel' ? 'Cancel Event' : 'Delete Event'}
          onClose={() => setConfirmAction(null)}
        >
          <p className="text-sm">
            {confirmAction.kind === 'cancel' ? (
              <>
                Cancel <span className="font-semibold">{confirmAction.event.eventName}</span> on{' '}
                {formatDateLong(confirmAction.event.date)}? Signed-up photographers will be notified.
              </>
            ) : (
              <>
                Permanently delete <span className="font-semibold">{confirmAction.event.eventName}</span>?
                This cannot be undone and photographers will <em>not</em> be notified — use Cancel Event
                to notify them instead.
              </>
            )}
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmAction(null)}>
              Back
            </Button>
            <Button
              variant="destructive"
              className={confirmAction.kind === 'cancel' ? 'bg-amber-100 text-amber-800 hover:bg-amber-200' : ''}
              onClick={runConfirm}
            >
              {confirmAction.kind === 'cancel' ? 'Cancel Event' : 'Delete Permanently'}
            </Button>
          </div>
        </Modal>
      )}

      {csvOpen && profile && <CsvImportModal adminUid={profile.uid} onClose={() => setCsvOpen(false)} />}
    </div>
  )
}

// ─── Assign photographer modal ────────────────────────────────────────────────

function AssignModal({
  event,
  photographers,
  onClose,
}: {
  event: ScheduleEvent
  photographers: AppUser[]
  onClose: () => void
}) {
  const [busyUid, setBusyUid] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const candidates = photographers.filter((p) => !isSignedUpBy(event, p.uid))

  const assign = async (uid: string) => {
    setBusyUid(uid)
    setError(null)
    const err = await assignPhotographer(event.id, uid)
    setBusyUid(null)
    if (err) setError(err)
  }

  return (
    <Modal title={`Assign to ${event.eventName}`} onClose={onClose}>
      <p className="text-sm text-muted-foreground">
        {event.slots.length}/{event.slotsNeeded} slots filled. Assigning beyond the limit is allowed.
      </p>
      {error && (
        <Alert variant="destructive" className="my-2">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {candidates.length === 0 ? (
        <p className="text-sm text-muted-foreground">Every photographer is already on this event.</p>
      ) : (
        <ul className="max-h-72 divide-y divide-border overflow-y-auto">
          {candidates.map((p) => (
            <li key={p.uid} className="flex items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{p.displayName}</p>
                <p className="truncate text-xs text-muted-foreground">{p.email}</p>
              </div>
              <Button size="sm" onClick={() => assign(p.uid)} disabled={busyUid !== null}>
                {busyUid === p.uid ? 'Assigning…' : 'Assign'}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex justify-end">
        <Button variant="outline" onClick={onClose}>
          Done
        </Button>
      </div>
    </Modal>
  )
}

// ─── CSV import modal ─────────────────────────────────────────────────────────

function CsvImportModal({ adminUid, onClose }: { adminUid: string; onClose: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  const run = async () => {
    const file = fileRef.current?.files?.[0]
    if (!file) return
    setBusy(true)
    setResult(null)
    const text = await file.text()
    const res = await importFromCsv(text, adminUid)
    setResult(res)
    setBusy(false)
  }

  return (
    <Modal title="Import Events from CSV" onClose={() => !busy && onClose()} wide>
      <div className="rounded-lg bg-muted p-3 font-mono text-xs leading-relaxed text-muted-foreground">
        Required headers: date, time, location, event_name
        <br />
        Optional headers: end_time, slots_needed, notes
        <br />
        Date: MM/DD/YYYY &nbsp;·&nbsp; Time: H:MM AM/PM
        <br />
        <br />
        date,time,location,event_name
        <br />
        05/15/2026,2:00 PM,Gym,Varsity Basketball
      </div>

      <Input ref={fileRef} type="file" accept=".csv,text/csv" className="my-4" />

      {result && (
        <div className="mb-4 space-y-2">
          <Alert className="border-green-300 bg-green-50">
            <AlertDescription className="text-green-800">
              Imported {result.success} event{result.success === 1 ? '' : 's'}.
            </AlertDescription>
          </Alert>
          {result.errors.length > 0 && (
            <Alert variant="destructive" className="max-h-40 overflow-y-auto">
              <AlertDescription>
                <p className="mb-1 font-medium">{result.errors.length} row(s) had problems:</p>
                <ul className="list-inside list-disc space-y-0.5">
                  {result.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={busy}>
          {result ? 'Done' : 'Cancel'}
        </Button>
        <Button onClick={run} disabled={busy}>
          {busy ? 'Importing…' : 'Import'}
        </Button>
      </div>
    </Modal>
  )
}
