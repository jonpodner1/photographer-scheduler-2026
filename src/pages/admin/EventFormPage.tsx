import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { COL, db } from '../../lib/firebase'
import { useAuth } from '../../context/AuthContext'
import { createEvent, updateEvent } from '../../services/events'
import Spinner from '../../components/Spinner'
import { eventFromDoc } from '../../types/models'
import { combineDateTime, toDateInputValue, toTimeInputValue } from '../../lib/format'

export default function EventFormPage() {
  const { eventId } = useParams()
  const isEditing = Boolean(eventId)
  const navigate = useNavigate()
  const { profile } = useAuth()

  const [loaded, setLoaded] = useState(!isEditing)
  const [notFound, setNotFound] = useState(false)
  const [eventName, setEventName] = useState('')
  const [location, setLocation] = useState('')
  const [date, setDate] = useState(toDateInputValue(new Date()))
  const [startTime, setStartTime] = useState('15:00')
  const [endTime, setEndTime] = useState('')
  const [slotsNeeded, setSlotsNeeded] = useState(1)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!eventId) return
    getDoc(doc(db, COL.events, eventId)).then((snap) => {
      if (!snap.exists()) {
        setNotFound(true)
        setLoaded(true)
        return
      }
      const e = eventFromDoc(snap)
      setEventName(e.eventName)
      setLocation(e.location)
      setDate(toDateInputValue(e.date))
      setStartTime(toTimeInputValue(e.startTime))
      setEndTime(e.endTime ? toTimeInputValue(e.endTime) : '')
      setSlotsNeeded(e.slotsNeeded)
      setNotes(e.notes ?? '')
      setLoaded(true)
    })
  }, [eventId])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!profile) return
    setBusy(true)
    setError(null)
    try {
      const data = {
        eventName: eventName.trim(),
        date: combineDateTime(date, '00:00'),
        startTime: combineDateTime(date, startTime),
        endTime: endTime ? combineDateTime(date, endTime) : null,
        location: location.trim(),
        notes: notes.trim() || null,
        slotsNeeded,
      }
      if (isEditing && eventId) await updateEvent(eventId, data)
      else await createEvent(data, profile.uid)
      navigate('/admin/events')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  if (!loaded) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    )
  }

  if (notFound) {
    return <p className="text-sm text-gray-500">Event not found.</p>
  }

  const field =
    'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30'
  const label = 'mb-1 block text-sm font-medium text-gray-700'

  return (
    <div className="mx-auto max-w-xl">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">
        {isEditing ? 'Edit Event' : 'New Event'}
      </h2>
      <form onSubmit={submit} className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <div>
          <label className={label} htmlFor="eventName">
            Event Name *
          </label>
          <input id="eventName" required value={eventName} onChange={(e) => setEventName(e.target.value)} className={field} />
        </div>

        <div>
          <label className={label} htmlFor="location">
            Location *
          </label>
          <input id="location" required value={location} onChange={(e) => setLocation(e.target.value)} className={field} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className={label} htmlFor="date">
              Date *
            </label>
            <input id="date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={field} />
          </div>
          <div>
            <label className={label} htmlFor="startTime">
              Start Time *
            </label>
            <input id="startTime" type="time" required value={startTime} onChange={(e) => setStartTime(e.target.value)} className={field} />
          </div>
          <div>
            <label className={label} htmlFor="endTime">
              End Time <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <input id="endTime" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={field} />
          </div>
        </div>

        <div>
          <label className={label} htmlFor="slots">
            Photographers Needed *
          </label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSlotsNeeded((n) => Math.max(1, n - 1))}
              className="h-9 w-9 rounded-lg border border-gray-300 text-lg text-gray-600 hover:bg-gray-50"
              aria-label="Fewer photographers"
            >
              −
            </button>
            <input
              id="slots"
              type="number"
              min={1}
              max={20}
              required
              value={slotsNeeded}
              onChange={(e) => setSlotsNeeded(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className={`${field} w-20 text-center`}
            />
            <button
              type="button"
              onClick={() => setSlotsNeeded((n) => n + 1)}
              className="h-9 w-9 rounded-lg border border-gray-300 text-lg text-gray-600 hover:bg-gray-50"
              aria-label="More photographers"
            >
              +
            </button>
            <span className="text-sm text-gray-500">
              photographer{slotsNeeded === 1 ? '' : 's'} needed
            </span>
          </div>
        </div>

        <div>
          <label className={label} htmlFor="notes">
            Notes <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={field} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => navigate('/admin/events')}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Saving…' : isEditing ? 'Save Changes' : 'Create Event'}
          </button>
        </div>
      </form>
    </div>
  )
}
