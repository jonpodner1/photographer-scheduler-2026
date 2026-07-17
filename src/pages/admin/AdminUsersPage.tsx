import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
  approveAppPhotographer,
  deleteUser,
  denyAppPhotographer,
  listenAppUsers,
  revokeAppPhotographer,
  setUserStatus,
  updateUserRole,
} from '../../services/users'
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
  const [appUsers, setAppUsers] = useState<AppUser[] | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AppUser | null>(null)
  const [error, setError] = useState<string | null>(null)

  // MCHS-app photographers/requests — admin-only listener.
  useEffect(() => listenAppUsers(setAppUsers), [])

  const run = (action: () => Promise<void>) => async () => {
    setError(null)
    try {
      await action()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  // Web accounts win when the same uid exists in both collections.
  const merged = useMemo(() => {
    if (!stats || !appUsers) return null
    const webUids = new Set(stats.users.map((u) => u.uid))
    return {
      pending: [
        ...stats.users.filter((u) => u.status === 'pending'),
        ...appUsers.filter((u) => u.status === 'pending' && !webUids.has(u.uid)),
      ],
      rows: [
        ...stats.users.filter((u) => u.status !== 'pending'),
        ...appUsers.filter((u) => u.status === 'active' && !webUids.has(u.uid)),
      ],
    }
  }, [stats, appUsers])

  if (!merged || !stats || !profile) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    )
  }

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold">Users</h2>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {merged.pending.length > 0 && (
        <Card className="mb-6 gap-3 border-amber-300 bg-amber-50/50 p-4">
          <h3 className="text-sm font-semibold text-amber-900">
            Pending approval ({merged.pending.length})
          </h3>
          <ul className="divide-y divide-amber-200/60">
            {merged.pending.map((u) => (
              <li key={u.uid} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {u.displayName}
                    {u.source === 'app' && <SourceBadge />}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={run(() =>
                      u.source === 'app' ? approveAppPhotographer(u.uid) : setUserStatus(u.uid, 'active'),
                    )}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={run(() =>
                      u.source === 'app' ? denyAppPhotographer(u.uid) : setUserStatus(u.uid, 'denied'),
                    )}
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
            {merged.rows.map((u) => {
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
                    {u.source === 'app' && <SourceBadge />}
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
                      '0'
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {u.source === 'app' ? (
                      u.role === 'photographer' && (
                        <Button
                          variant="link"
                          size="xs"
                          className="text-destructive"
                          onClick={run(() => revokeAppPhotographer(u.uid))}
                        >
                          Revoke Photographer
                        </Button>
                      )
                    ) : (
                      <>
                        {u.status === 'denied' && (
                          <Button variant="link" size="xs" onClick={run(() => setUserStatus(u.uid, 'active'))}>
                            Approve
                          </Button>
                        )}
                        <Button
                          variant="link"
                          size="xs"
                          onClick={run(() =>
                            updateUserRole(u.uid, u.role === 'admin' ? 'photographer' : 'admin'),
                          )}
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
                      </>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>

      <p className="mt-2 text-xs text-muted-foreground">
        Click a name to see that photographer's dashboard. * = includes an admin score override.
        "MCHS app" accounts signed up in the iOS app — manage their photographer access here or
        in the app's Manage Access screen.
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
            <Button
              variant="destructive"
              onClick={run(async () => {
                await deleteUser(deleteTarget.uid)
                setDeleteTarget(null)
              })}
            >
              Delete User
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function SourceBadge() {
  return (
    <Badge variant="outline" className="ml-1.5 border-transparent bg-blue-100 text-blue-700">
      MCHS app
    </Badge>
  )
}
