import {
  Timestamp,
  type Query,
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { COL, db } from '../lib/firebase'
import { startOfDay } from '../lib/format'
import { eventFromDoc, type ScheduleEvent } from '../types/models'

const eventsCol = collection(db, COL.events)

type Unsubscribe = () => void
type EventsCallback = (events: ScheduleEvent[]) => void
type ErrorCallback = (err: Error) => void

function listen(q: Query, cb: EventsCallback, onError?: ErrorCallback): Unsubscribe {
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map(eventFromDoc)),
    (err) => {
      console.error('events listener error', err)
      onError?.(err)
    },
  )
}

/** All events from today forward (admin events list). Server-side range query. */
export function listenUpcomingEvents(cb: EventsCallback, onError?: ErrorCallback): Unsubscribe {
  const q = query(
    eventsCol,
    where('date', '>=', Timestamp.fromDate(startOfDay(new Date()))),
    orderBy('date'),
    orderBy('startTime'),
  )
  return listen(q, cb, onError)
}

/** Open events from today forward. Fullness is filtered client-side (can't query slots.length). */
export function listenOpenEvents(cb: EventsCallback, onError?: ErrorCallback): Unsubscribe {
  const q = query(
    eventsCol,
    where('status', '==', 'open'),
    where('date', '>=', Timestamp.fromDate(startOfDay(new Date()))),
    orderBy('date'),
    orderBy('startTime'),
  )
  return listen(q, cb, onError)
}

/** Events the given photographer is signed up for (uses the photographerIds mirror array). */
export function listenMyEvents(uid: string, cb: EventsCallback, onError?: ErrorCallback): Unsubscribe {
  const q = query(
    eventsCol,
    where('photographerIds', 'array-contains', uid),
    orderBy('date'),
    orderBy('startTime'),
  )
  return listen(q, cb, onError)
}

/** Every event, oldest first (dashboard/ranking stats). */
export function listenAllEvents(cb: EventsCallback, onError?: ErrorCallback): Unsubscribe {
  const q = query(eventsCol, orderBy('date'), orderBy('startTime'))
  return listen(q, cb, onError)
}

/** Events before today, most recent first. */
export function listenPastEvents(cb: EventsCallback, onError?: ErrorCallback): Unsubscribe {
  const q = query(
    eventsCol,
    where('date', '<', Timestamp.fromDate(startOfDay(new Date()))),
    orderBy('date', 'desc'),
    orderBy('startTime', 'desc'),
  )
  return listen(q, cb, onError)
}

/** Events in [start, end] inclusive — server-side range query (calendar, reports). */
export function listenEventsInRange(
  start: Date,
  end: Date,
  cb: EventsCallback,
  onError?: ErrorCallback,
): Unsubscribe {
  const endExclusive = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1)
  const q = query(
    eventsCol,
    where('date', '>=', Timestamp.fromDate(startOfDay(start))),
    where('date', '<', Timestamp.fromDate(endExclusive)),
    orderBy('date'),
    orderBy('startTime'),
  )
  return listen(q, cb, onError)
}

// ─── Admin CRUD (allowed by rules for admins only) ───────────────────────────

export interface EventFormData {
  eventName: string
  date: Date
  startTime: Date
  endTime: Date | null
  location: string
  notes: string | null
  slotsNeeded: number
}

export async function createEvent(
  data: EventFormData,
  createdBy: string,
  opts: { notify?: boolean } = {},
): Promise<string> {
  const ref = await addDoc(eventsCol, {
    eventName: data.eventName,
    date: Timestamp.fromDate(startOfDay(data.date)),
    startTime: Timestamp.fromDate(data.startTime),
    endTime: data.endTime ? Timestamp.fromDate(data.endTime) : null,
    location: data.location,
    notes: data.notes,
    slotsNeeded: data.slotsNeeded,
    slots: [],
    photographerIds: [],
    status: 'open',
    createdBy,
    createdAt: serverTimestamp(),
    // false suppresses the new-event notification fan-out (used by CSV bulk import)
    notifyOnCreate: opts.notify !== false,
  })
  return ref.id
}

/** Updates event fields only — slots/status/photographerIds are managed by the callables. */
export async function updateEvent(id: string, data: EventFormData): Promise<void> {
  await updateDoc(doc(db, COL.events, id), {
    eventName: data.eventName,
    date: Timestamp.fromDate(startOfDay(data.date)),
    startTime: Timestamp.fromDate(data.startTime),
    endTime: data.endTime ? Timestamp.fromDate(data.endTime) : null,
    location: data.location,
    notes: data.notes,
    slotsNeeded: data.slotsNeeded,
  })
}

/** Cancelling triggers the server-side "event cancelled" notification fan-out. */
export async function cancelEvent(id: string): Promise<void> {
  await updateDoc(doc(db, COL.events, id), { status: 'cancelled' })
}

export async function deleteEvent(id: string): Promise<void> {
  await deleteDoc(doc(db, COL.events, id))
}
