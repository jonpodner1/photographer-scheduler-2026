import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { COL, db } from '../../lib/firebase'
import { useAuth } from '../../context/AuthContext'
import { useTags } from '../../context/TagsContext'
import { createEvent, updateEvent } from '../../services/events'
import { cleanTagName, createTag, findTagByName } from '../../services/tags'
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
  const { tags } = useTags()

  const [loaded, setLoaded] = useState(!isEditing)
  const [notFound, setNotFound] = useState(false)
  const [eventName, setEventName] = useState('')
  const [location, setLocation] = useState('')
  const [date, setDate] = useState(toDateInputValue(new Date()))
  const [startTime, setStartTime] = useState('15:00')
  const [endTime, setEndTime] = useState('')
  const [slotsNeeded, setSlotsNeeded] = useState(1)
  const [notes, setNotes] = useState('')
  const [tagId, setTagId] = useState('')
  // Inline "New tag" so an admin doesn't lose the form to go make one.
  const [newTag, setNewTag] = useState<string | null>(null)
  const [tagBusy, setTagBusy] = useState(false)
  const [tagError, setTagError] = useState<string | null>(null)
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
      setTagId(e.tagId ?? '')
      setLoaded(true)
    })
  }, [eventId])

  // Undefined for no tag, or a tag deleted while the form was open.
  const selectedTag = tags.find((t) => t.id === tagId)

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
        tagId: selectedTag?.id ?? null,
      }
      if (isEditing && eventId) await updateEvent(eventId, data)
      else await createEvent(data, profile.uid)
      navigate('/admin/events')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  const addTag = async () => {
    if (!profile || newTag === null) return
    const name = cleanTagName(newTag)
    if (!name) {
      setTagError('Tag names need at least one letter or number.')
      return
    }
    const existing = findTagByName(tags, name)
    if (existing) {
      setTagId(existing.id)
      setNewTag(null)
      setTagError(null)
      return
    }
    setTagBusy(true)
    setTagError(null)
    try {
      setTagId(await createTag(name, profile.uid))
      setNewTag(null)
    } catch (err) {
      setTagError(err instanceof Error ? err.message : String(err))
    } finally {
      setTagBusy(false)
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
              <Label htmlFor="tag">
                Tag <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              {newTag === null ? (
                <div className="flex gap-2">
                  <select
                    id="tag"
                    value={selectedTag?.id ?? ''}
                    onChange={(e) => setTagId(e.target.value)}
                    className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <option value="">No tag</option>
                    {tags.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <Button type="button" variant="outline" onClick={() => setNewTag('')}>
                    New tag
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    id="tag"
                    autoFocus
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        void addTag()
                      }
                    }}
                    placeholder="e.g. Football"
                    maxLength={40}
                  />
                  <Button type="button" onClick={addTag} disabled={tagBusy}>
                    {tagBusy ? 'Adding…' : 'Add'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setNewTag(null)
                      setTagError(null)
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              )}
              {tagError ? (
                <p className="text-xs text-destructive">{tagError}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {selectedTag
                    ? `Uploaded photos go in ${selectedTag.name} / ${eventName.trim() || 'Event name'} ${date}.`
                    : 'Tagged events keep their uploaded photos together in a folder named after the tag.'}
                </p>
              )}
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
