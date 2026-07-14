import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
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
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const TYPE_ICONS: Record<NotificationType, string> = {
  newEvent: '📅',
  photographerSignedUp: '✋',
  photographerRemoved: '🚫',
  eventCancelled: '❌',
  assignedToEvent: '📸',
  accountPending: '🆕',
  accountApproved: '✅',
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
        <h2 className="text-lg font-semibold">
          Notifications{' '}
          {unread > 0 && (
            <span className="text-sm font-normal text-muted-foreground">({unread} unread)</span>
          )}
        </h2>
        {unread > 0 && (
          <Button variant="link" size="sm" onClick={() => markAllAsRead(firebaseUser!.uid)}>
            Mark all as read
          </Button>
        )}
      </div>

      {notifications.length === 0 ? (
        <Card className="border-dashed p-8 text-center text-sm text-muted-foreground">
          No notifications yet.
        </Card>
      ) : (
        <ul className="space-y-2">
          {notifications.map((n) => (
            <li key={n.id}>
              <Card
                className={cn('flex-row items-start gap-3 p-4', !n.isRead && 'border-primary/30 bg-primary/5')}
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
                    <p className={cn('text-sm', n.isRead ? 'font-medium text-muted-foreground' : 'font-semibold')}>
                      {n.title}
                    </p>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatRelative(n.createdAt)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p>
                </button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => deleteNotification(n.id)}
                  aria-label="Delete notification"
                >
                  <X />
                </Button>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
