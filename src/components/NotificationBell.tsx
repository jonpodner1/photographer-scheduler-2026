import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { listenNotifications } from '../services/notifications'

export default function NotificationBell() {
  const { firebaseUser } = useAuth()
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    if (!firebaseUser) return
    return listenNotifications(firebaseUser.uid, (list) =>
      setUnread(list.filter((n) => !n.isRead).length),
    )
  }, [firebaseUser])

  return (
    <Link
      to="/notifications"
      className="relative rounded-full p-2 text-white/90 hover:bg-white/10 hover:text-white"
      aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}
    >
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
        />
      </svg>
      {unread > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[11px] font-bold text-white">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  )
}
