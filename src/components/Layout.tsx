import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useBranding } from '../context/BrandingContext'
import NotificationBell from './NotificationBell'

const photographerNav = [
  { to: '/available', label: 'Available Events' },
  { to: '/schedule', label: 'My Schedule' },
  { to: '/past', label: 'Past Events' },
]

const adminNav = [
  { to: '/admin/events', label: 'Events' },
  { to: '/admin/calendar', label: 'Calendar' },
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/reports', label: 'Reports' },
  { to: '/admin/branding', label: 'Branding' },
]

export default function Layout() {
  const { profile, isAdmin, signOut } = useAuth()
  const { branding } = useBranding()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  const nav = isAdmin ? adminNav : photographerNav

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors ${
      isActive
        ? 'border-accent text-white'
        : 'border-transparent text-white/70 hover:border-white/30 hover:text-white'
    }`

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-primary shadow print:hidden">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 pt-3">
          {branding.logoUrl && (
            <img src={branding.logoUrl} alt="" className="h-8 w-8 rounded object-contain" />
          )}
          <h1 className="flex-1 truncate text-lg font-semibold text-white">{branding.orgName}</h1>
          <NotificationBell />
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 rounded-full p-1 pl-2 text-sm text-white/90 hover:bg-white/10"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <span className="hidden max-w-40 truncate sm:block">{profile?.displayName}</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent font-semibold text-white">
                {(profile?.displayName || '?').charAt(0).toUpperCase()}
              </span>
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 z-20 mt-2 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                  <div className="border-b border-gray-100 px-4 py-2">
                    <p className="truncate text-sm font-medium text-gray-900">{profile?.displayName}</p>
                    <p className="truncate text-xs text-gray-500">{profile?.email}</p>
                    <p className="mt-0.5 text-xs capitalize text-gray-400">{profile?.role}</p>
                  </div>
                  <button
                    onClick={() => {
                      setMenuOpen(false)
                      navigate('/profile')
                    }}
                    className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                  >
                    My Profile
                  </button>
                  <button
                    onClick={() => signOut()}
                    className="block w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-gray-50"
                  >
                    Sign Out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4" aria-label="Main">
          {nav.map((item) => (
            <NavLink key={item.to} to={item.to} className={linkClass}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
