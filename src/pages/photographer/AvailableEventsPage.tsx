import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useBranding } from '../../context/BrandingContext'
import { listenOpenEvents } from '../../services/events'
import { signUpForEvent } from '../../services/callables'
import EventCard from '../../components/EventCard'
import Modal from '../../components/Modal'
import Spinner from '../../components/Spinner'
import { isOpen, isSignedUpBy, type ScheduleEvent } from '../../types/models'
import { formatDateLong, formatTimeRange } from '../../lib/format'

export default function AvailableEventsPage() {
  const { profile } = useAuth()
  const { branding } = useBranding()
  const [events, setEvents] = useState<ScheduleEvent[] | null>(null)
  const [signupTarget, setSignupTarget] = useState<ScheduleEvent | null>(null)
  const [requestCamera, setRequestCamera] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => listenOpenEvents(setEvents), [])

  if (!profile) return null
  if (!events) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    )
  }

  const available = events.filter(isOpen)

  const confirmSignup = async () => {
    if (!signupTarget) return
    setBusy(true)
    setError(null)
    const err = await signUpForEvent(signupTarget.id, requestCamera)
    setBusy(false)
    if (err) {
      setError(err)
    } else {
      setSignupTarget(null)
      setRequestCamera(false)
    }
  }

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-gray-900">Available Events</h2>

      {!branding.selfSignupEnabled && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Self-signup is currently disabled. Your adviser will assign photographers to events.
        </div>
      )}

      {available.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
          No open events right now. Check back soon!
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {available.map((event) => {
            const signedUp = isSignedUpBy(event, profile.uid)
            return (
              <EventCard
                key={event.id}
                event={event}
                signedUp={signedUp}
                actions={
                  branding.selfSignupEnabled && !signedUp ? (
                    <button
                      onClick={() => {
                        setSignupTarget(event)
                        setRequestCamera(false)
                        setError(null)
                      }}
                      className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
                    >
                      Sign Up
                    </button>
                  ) : undefined
                }
              />
            )
          })}
        </div>
      )}

      {signupTarget && (
        <Modal title="Confirm Sign-Up" onClose={() => !busy && setSignupTarget(null)}>
          <p className="text-sm text-gray-700">
            Sign up to photograph <span className="font-semibold">{signupTarget.eventName}</span>?
          </p>
          <p className="mt-1 text-sm text-gray-500">
            {formatDateLong(signupTarget.date)} · {formatTimeRange(signupTarget.startTime, signupTarget.endTime)} ·{' '}
            {signupTarget.location}
          </p>

          <label className="mt-4 flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={requestCamera}
              onChange={(e) => setRequestCamera(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 accent-[var(--color-primary)]"
            />
            I need to borrow a yearbook camera
          </label>

          {error && <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

          <div className="mt-5 flex justify-end gap-2">
            <button
              onClick={() => setSignupTarget(null)}
              disabled={busy}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={confirmSignup}
              disabled={busy}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {busy ? 'Signing up…' : 'Confirm Sign-Up'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
