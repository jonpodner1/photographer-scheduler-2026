import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  deleteNotification,
  listenNotifications,
  markAllAsRead,
  markAsRead,
} from '../services/notifications'
import type { AppNotification, NotificationType } from '../types/models'
import { formatRelative } from '../lib/format'
import Spinner from '../components/Spinner'

const TYPE_ICONS: Record<NotificationType, string> = {
  newEvent: '📅',
  photographerSignedUp: '✋',
  photographerRemoved: '🚫',
  eventCancelled: '❌',
  assignedToEvent: '📸',
}

export default function NotificationsPage() {
  const { firebaseUser } = useAuth()
  const [notifications, setNotifications] = useState<AppNotification[] | null>(null)

  useEffect(() => {
    if (!firebaseUser) return
    return listenNotifications(firebaseUser.uid, setNotifications)
  }, [firebaseUser])

  if (!notifications) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    )
  }

  const unread = notifications.filter((n) => !n.isRead).length

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">
          Notifications {unread > 0 && <span className="text-sm font-normal text-gray-500">({unread} unread)</span>}
        </h2>
        {unread > 0 && (
          <button
            onClick={() => markAllAsRead(firebaseUser!.uid)}
            className="text-sm font-medium text-primary hover:underline"
          >
            Mark all as read
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
          No notifications yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {notifications.map((n) => (
            <li
              key={n.id}
              className={`flex items-start gap-3 rounded-xl border p-4 ${
                n.isRead ? 'border-gray-200 bg-white' : 'border-primary/30 bg-primary/5'
              }`}
            >
              <span className="text-xl" aria-hidden>
                {TYPE_ICONS[n.type]}
              </span>
              <button
                className="min-w-0 flex-1 text-left"
                onClick={() => !n.isRead && markAsRead(n.id)}
                title={n.isRead ? undefined : 'Mark as read'}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className={`text-sm ${n.isRead ? 'font-medium text-gray-700' : 'font-semibold text-gray-900'}`}>
                    {n.title}
                  </p>
                  <span className="shrink-0 text-xs text-gray-400">{formatRelative(n.createdAt)}</span>
                </div>
                <p className="mt-0.5 text-sm text-gray-600">{n.body}</p>
              </button>
              <button
                onClick={() => deleteNotification(n.id)}
                className="rounded p-1 text-gray-300 hover:bg-gray-100 hover:text-gray-500"
                aria-label="Delete notification"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
