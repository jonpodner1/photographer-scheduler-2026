import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { deleteUser, setUserStatus, updateUserRole } from '../../services/users'
import { usePhotographerStats } from '../../hooks/usePhotographerStats'
import Modal from '../../components/Modal'
import Spinner from '../../components/Spinner'
import type { AppUser } from '../../types/models'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export default function AdminUsersPage() {
  const { profile } = useAuth()
  const stats = usePhotographerStats()
  const [deleteTarget, setDeleteTarget] = useState<AppUser | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!stats || !profile) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    )
  }

  const toggleRole = async (u: AppUser) => {
    setError(null)
    try {
      await updateUserRole(u.uid, u.role === 'admin' ? 'photographer' : 'admin')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setError(null)
    try {
      await deleteUser(deleteTarget.uid)
      setDeleteTarget(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const changeStatus = async (u: AppUser, status: 'active' | 'denied') => {
    setError(null)
    try {
      await setUserStatus(u.uid, status)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const pending = stats.users.filter((u) => u.status === 'pending')

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold">Users</h2>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {pending.length > 0 && (
        <Card className="mb-6 gap-3 border-amber-300 bg-amber-50/50 p-4">
          <h3 className="text-sm font-semibold text-amber-900">
            Pending approval ({pending.length})
          </h3>
          <ul className="divide-y divide-amber-200/60">
            {pending.map((u) => (
              <li key={u.uid} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{u.displayName}</p>
                  <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => changeStatus(u, 'active')}>
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => changeStatus(u, 'denied')}
                  >
                    Deny
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="overflow-x-auto py-0">
        <Table className="min-w-[680px]">
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="text-right">Rank</TableHead>
              <TableHead className="text-right">Events</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stats.users
              .filter((u) => u.status !== 'pending')
              .map((u) => {
              const isSelf = u.uid === profile.uid
              const s = stats.byUid.get(u.uid)
              return (
                <TableRow key={u.uid} className={u.status === 'denied' ? 'opacity-60' : ''}>
                  <TableCell className="font-medium">
                    <Link to={`/admin/users/${u.uid}`} className="text-primary hover:underline">
                      {u.displayName}
                    </Link>
                    {isSelf && (
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell>
                    <Badge
                      variant={u.role === 'admin' ? 'default' : 'secondary'}
                      className={u.role === 'admin' ? 'bg-primary/10 text-primary' : ''}
                    >
                      {u.role}
                    </Badge>
                    {u.status === 'denied' && (
                      <Badge variant="outline" className="ml-1.5 border-transparent bg-red-100 text-red-700">
                        denied
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {s?.rank !== undefined ? `#${s.rank}` : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    {s ? (
                      <span title={s.adjustment !== 0 ? `${s.eventCount} signups ${s.adjustment > 0 ? '+' : ''}${s.adjustment} adjustment` : undefined}>
                        {s.score}
                        {s.adjustment !== 0 && <span className="text-xs text-muted-foreground">*</span>}
                      </span>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {u.status === 'denied' && (
                      <Button variant="link" size="xs" onClick={() => changeStatus(u, 'active')}>
                        Approve
                      </Button>
                    )}
                    <Button
                      variant="link"
                      size="xs"
                      onClick={() => toggleRole(u)}
                      disabled={isSelf}
                      title={isSelf ? "You can't change your own role" : undefined}
                    >
                      {u.role === 'admin' ? 'Make Photographer' : 'Make Admin'}
                    </Button>
                    <Button
                      variant="link"
                      size="xs"
                      className="text-destructive"
                      onClick={() => setDeleteTarget(u)}
                      disabled={isSelf}
                    >
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>

      <p className="mt-2 text-xs text-muted-foreground">
        Click a name to see that photographer's dashboard. * = includes an admin score override.
      </p>

      {deleteTarget && (
        <Modal title="Delete User" onClose={() => setDeleteTarget(null)}>
          <p className="text-sm">
            Delete <span className="font-semibold">{deleteTarget.displayName}</span> (
            {deleteTarget.email})? This removes their profile so they can no longer use the app.
            Their sign-in account should also be removed in the Firebase console (Authentication tab).
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Delete User
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
