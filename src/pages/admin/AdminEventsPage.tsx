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
        <div className="flex rounded-lg border border-gray-300 bg-white p-0.5 text-sm">
          {(['upcoming', 'past'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md px-4 py-1.5 font-medium capitalize ${
                tab === t ? 'bg-primary text-white' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setCsvOpen(true)}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Import CSV
          </button>
          <Link
            to="/admin/events/new"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            + New Event
          </Link>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-center justify-between rounded-lg bg-red-50 p-3 text-sm text-red-700">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="font-medium underline">
            Dismiss
          </button>
        </div>
      )}

      {!events ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : events.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
          No {tab} events.
        </p>
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
                      <Link
                        to={`/admin/events/${event.id}/edit`}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                      >
                        Edit
                      </Link>
                      <button
                        onClick={() => setAssignTarget(event)}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                      >
                        Assign
                      </button>
                      {event.status !== 'cancelled' && (
                        <button
                          onClick={() => setConfirmAction({ kind: 'cancel', event })}
                          className="rounded-lg border border-amber-300 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-50"
                        >
                          Cancel Event
                        </button>
                      )}
                    </>
                  )}
                  <button
                    onClick={() => setConfirmAction({ kind: 'delete', event })}
                    className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </>
              }
            >
              {event.slots.length > 0 && tab === 'upcoming' && (
                <ul className="mt-3 space-y-1 rounded-lg bg-gray-50 p-2">
                  {event.slots.map((s) => (
                    <li key={s.photographerId} className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-gray-700">
                        {s.photographerName}
                        {s.requestedCamera && (
                          <span className="ml-1.5 text-xs text-accent" title="Requested yearbook camera">
                            📷 camera
                          </span>
                        )}
                      </span>
                      <button
                        onClick={() => removePhotographer(event, s.photographerId)}
                        className="text-xs font-medium text-red-500 hover:underline"
                      >
                        Remove
                      </button>
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
          <p className="text-sm text-gray-700">
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
          <div className="mt-5 flex justify-end gap-2">
            <button
              onClick={() => setConfirmAction(null)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Back
            </button>
            <button
              onClick={runConfirm}
              className={`rounded-lg px-4 py-2 text-sm font-semibold text-white ${
                confirmAction.kind === 'cancel' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              {confirmAction.kind === 'cancel' ? 'Cancel Event' : 'Delete Permanently'}
            </button>
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
      <p className="mb-3 text-sm text-gray-500">
        {event.slots.length}/{event.slotsNeeded} slots filled. Assigning beyond the limit is allowed.
      </p>
      {error && <div className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {candidates.length === 0 ? (
        <p className="text-sm text-gray-500">Every photographer is already on this event.</p>
      ) : (
        <ul className="max-h-72 divide-y divide-gray-100 overflow-y-auto">
          {candidates.map((p) => (
            <li key={p.uid} className="flex items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-800">{p.displayName}</p>
                <p className="truncate text-xs text-gray-500">{p.email}</p>
              </div>
              <button
                onClick={() => assign(p.uid)}
                disabled={busyUid !== null}
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {busyUid === p.uid ? 'Assigning…' : 'Assign'}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex justify-end">
        <button
          onClick={onClose}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Done
        </button>
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
      <div className="mb-4 rounded-lg bg-gray-50 p-3 font-mono text-xs leading-relaxed text-gray-600">
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

      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="mb-4 block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:opacity-90"
      />

      {result && (
        <div className="mb-4 space-y-2">
          <div className="rounded-lg bg-green-50 p-3 text-sm text-green-800">
            Imported {result.success} event{result.success === 1 ? '' : 's'}.
          </div>
          {result.errors.length > 0 && (
            <div className="max-h-40 overflow-y-auto rounded-lg bg-red-50 p-3 text-sm text-red-700">
              <p className="mb-1 font-medium">{result.errors.length} row(s) had problems:</p>
              <ul className="list-inside list-disc space-y-0.5">
                {result.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button
          onClick={onClose}
          disabled={busy}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          {result ? 'Done' : 'Cancel'}
        </button>
        <button
          onClick={run}
          disabled={busy}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Importing…' : 'Import'}
        </button>
      </div>
    </Modal>
  )
}
