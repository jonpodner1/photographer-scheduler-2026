import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { COL, db } from '../../lib/firebase'
import { useAuth } from '../../context/AuthContext'
import { createEvent, updateEvent } from '../../services/events'
import Spinner from '../../components/Spinner'
import { eventFromDoc } from '../../types/models'
import { combineDateTime, toDateInputValue, toTimeInputValue } from '../../lib/format'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

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
    return <p className="text-sm text-muted-foreground">Event not found.</p>
  }

  return (
    <div className="mx-auto max-w-xl">
      <h2 className="mb-4 text-lg font-semibold">{isEditing ? 'Edit Event' : 'New Event'}</h2>
      <Card>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="eventName">Event Name *</Label>
              <Input id="eventName" required value={eventName} onChange={(e) => setEventName(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="location">Location *</Label>
              <Input id="location" required value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="date">Date *</Label>
                <Input id="date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="startTime">Start Time *</Label>
                <Input id="startTime" type="time" required value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="endTime">
                  End Time <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Input id="endTime" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="slots">Photographers Needed *</Label>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setSlotsNeeded((n) => Math.max(1, n - 1))}
                  aria-label="Fewer photographers"
                >
                  −
                </Button>
                <Input
                  id="slots"
                  type="number"
                  min={1}
                  max={20}
                  required
                  value={slotsNeeded}
                  onChange={(e) => setSlotsNeeded(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="w-20 text-center"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setSlotsNeeded((n) => n + 1)}
                  aria-label="More photographers"
                >
                  +
                </Button>
                <span className="text-sm text-muted-foreground">
                  photographer{slotsNeeded === 1 ? '' : 's'} needed
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes">
                Notes <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => navigate('/admin/events')}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? 'Saving…' : isEditing ? 'Save Changes' : 'Create Event'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
