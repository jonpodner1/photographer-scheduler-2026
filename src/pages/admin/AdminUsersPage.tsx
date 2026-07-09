import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { deleteUser, listenUsers, updateUserRole } from '../../services/users'
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
  const [users, setUsers] = useState<AppUser[] | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AppUser | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => listenUsers(setUsers), [])

  if (!users || !profile) {
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

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold">Users</h2>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card className="overflow-x-auto py-0">
        <Table className="min-w-[560px]">
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => {
              const isSelf = u.uid === profile.uid
              return (
                <TableRow key={u.uid}>
                  <TableCell className="font-medium">
                    {u.displayName}
                    {isSelf && (
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell className="text-muted-foreground">{u.phone || '—'}</TableCell>
                  <TableCell>
                    <Badge
                      variant={u.role === 'admin' ? 'default' : 'secondary'}
                      className={u.role === 'admin' ? 'bg-primary/10 text-primary' : ''}
                    >
                      {u.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
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
