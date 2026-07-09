import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { deleteUser, listenUsers, updateUserRole } from '../../services/users'
import Modal from '../../components/Modal'
import Spinner from '../../components/Spinner'
import type { AppUser } from '../../types/models'

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
      <h2 className="mb-4 text-lg font-semibold text-gray-900">Users</h2>

      {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map((u) => {
              const isSelf = u.uid === profile.uid
              return (
                <tr key={u.uid} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {u.displayName}
                    {isSelf && <span className="ml-1.5 text-xs font-normal text-gray-400">(you)</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{u.email}</td>
                  <td className="px-4 py-3 text-gray-600">{u.phone || '—'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        u.role === 'admin' ? 'bg-primary/10 text-primary' : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => toggleRole(u)}
                      disabled={isSelf}
                      title={isSelf ? "You can't change your own role" : undefined}
                      className="mr-3 text-xs font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:text-gray-300"
                    >
                      {u.role === 'admin' ? 'Make Photographer' : 'Make Admin'}
                    </button>
                    <button
                      onClick={() => setDeleteTarget(u)}
                      disabled={isSelf}
                      className="text-xs font-medium text-red-500 hover:underline disabled:cursor-not-allowed disabled:text-gray-300"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {deleteTarget && (
        <Modal title="Delete User" onClose={() => setDeleteTarget(null)}>
          <p className="text-sm text-gray-700">
            Delete <span className="font-semibold">{deleteTarget.displayName}</span> (
            {deleteTarget.email})? This removes their profile so they can no longer use the app.
            Their sign-in account should also be removed in the Firebase console (Authentication tab).
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              onClick={() => setDeleteTarget(null)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={confirmDelete}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
            >
              Delete User
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
