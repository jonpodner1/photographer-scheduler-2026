import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { doc, onSnapshot } from 'firebase/firestore'
import { ArrowLeft } from 'lucide-react'
import { COL, db } from '../../lib/firebase'
import { userFromDoc, type AppUser } from '../../types/models'
import PhotographerDashboard from '../../components/PhotographerDashboard'
import Spinner from '../../components/Spinner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export default function AdminPhotographerPage() {
  const { uid } = useParams()
  // undefined = loading, null = not found
  const [user, setUser] = useState<AppUser | null | undefined>(undefined)

  useEffect(() => {
    if (!uid) return
    return onSnapshot(doc(db, COL.users, uid), (snap) =>
      setUser(snap.exists() ? userFromDoc(snap) : null),
    )
  }, [uid])

  if (user === undefined) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    )
  }

  if (user === null) {
    return (
      <div>
        <p className="mb-4 text-sm text-muted-foreground">User not found.</p>
        <Button variant="outline" asChild>
          <Link to="/admin/users">
            <ArrowLeft /> Back to Users
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/admin/users">
            <ArrowLeft /> Users
          </Link>
        </Button>
        <h2 className="text-lg font-semibold">{user.displayName}</h2>
        <Badge
          variant={user.role === 'admin' ? 'default' : 'secondary'}
          className={user.role === 'admin' ? 'bg-primary/10 text-primary' : ''}
        >
          {user.role}
        </Badge>
        <span className="text-sm text-muted-foreground">{user.email}</span>
      </div>
      <PhotographerDashboard photographer={user} adminControls />
    </div>
  )
}
