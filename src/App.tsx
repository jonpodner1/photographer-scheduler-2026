import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { firebaseConfigured } from './lib/firebase'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Spinner from './components/Spinner'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import AccountStatusPage from './pages/AccountStatusPage'
import NotificationsPage from './pages/NotificationsPage'
import ProfilePage from './pages/ProfilePage'
import DashboardPage from './pages/photographer/DashboardPage'
import AvailableEventsPage from './pages/photographer/AvailableEventsPage'
import MySchedulePage from './pages/photographer/MySchedulePage'
import PastEventsPage from './pages/photographer/PastEventsPage'
import AdminEventsPage from './pages/admin/AdminEventsPage'
import EventFormPage from './pages/admin/EventFormPage'
// Lazy-loaded: FullCalendar is heavy and only admins use it
const AdminCalendarPage = lazy(() => import('./pages/admin/AdminCalendarPage'))
import AdminUsersPage from './pages/admin/AdminUsersPage'
import AdminPhotographerPage from './pages/admin/AdminPhotographerPage'
import AdminReportsPage from './pages/admin/AdminReportsPage'
import AdminBrandingPage from './pages/admin/AdminBrandingPage'

function ConfigNotice() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
      <div className="max-w-lg rounded-xl border border-amber-300 bg-amber-50 p-6 text-sm text-amber-900">
        <h1 className="mb-2 text-lg font-semibold">Firebase is not configured</h1>
        <p>
          Copy <code className="rounded bg-amber-100 px-1">.env.example</code> to{' '}
          <code className="rounded bg-amber-100 px-1">.env.local</code>, fill in the{' '}
          <code className="rounded bg-amber-100 px-1">VITE_FIREBASE_*</code> values from your
          Firebase project, then restart the dev server. See SETUP.md for the full walkthrough.
        </p>
      </div>
    </div>
  )
}

export default function App() {
  const { firebaseUser, profile, isAdmin, loading } = useAuth()

  if (!firebaseConfigured) return <ConfigNotice />

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    )
  }

  // Logged out → auth pages only
  if (!firebaseUser) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  // Authenticated but profile doc missing (deleted by an admin) — treat as signed out.
  if (!profile) {
    return (
      <Routes>
        <Route path="*" element={<LoginPage missingProfile />} />
      </Routes>
    )
  }

  // Awaiting admin approval / denied — no app access. The profile doc is
  // live-subscribed, so approval flips this instantly without a reload.
  if (profile.status !== 'active') {
    return (
      <Routes>
        <Route path="*" element={<AccountStatusPage denied={profile.status === 'denied'} />} />
      </Routes>
    )
  }

  const home = isAdmin ? '/admin/events' : '/available'

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to={home} replace />} />
        <Route path="/login" element={<Navigate to={home} replace />} />
        <Route path="/signup" element={<Navigate to={home} replace />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/profile" element={<ProfilePage />} />

        {/* Photographer */}
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/available" element={<AvailableEventsPage />} />
        <Route path="/schedule" element={<MySchedulePage />} />
        <Route path="/past" element={<PastEventsPage />} />

        {/* Admin */}
        {isAdmin && (
          <>
            <Route path="/admin/events" element={<AdminEventsPage />} />
            <Route path="/admin/events/new" element={<EventFormPage />} />
            <Route path="/admin/events/:eventId/edit" element={<EventFormPage />} />
            <Route
              path="/admin/calendar"
              element={
                <Suspense
                  fallback={
                    <div className="flex justify-center py-16">
                      <Spinner />
                    </div>
                  }
                >
                  <AdminCalendarPage />
                </Suspense>
              }
            />
            <Route path="/admin/users" element={<AdminUsersPage />} />
            <Route path="/admin/users/:uid" element={<AdminPhotographerPage />} />
            <Route path="/admin/reports" element={<AdminReportsPage />} />
            <Route path="/admin/branding" element={<AdminBrandingPage />} />
          </>
        )}

        <Route path="*" element={<Navigate to={home} replace />} />
      </Route>
    </Routes>
  )
}
