import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useBranding } from '../context/BrandingContext'
import NotificationBell from './NotificationBell'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const photographerNav = [
  { to: '/dashboard', label: 'Dashboard' },
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

  const nav = isAdmin ? adminNav : photographerNav

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors ${
      isActive
        ? 'border-brand text-white'
        : 'border-transparent text-white/70 hover:border-white/30 hover:text-white'
    }`

  return (
    <div className="min-h-screen bg-muted">
      <header className="bg-primary shadow print:hidden">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 pt-3">
          {branding.logoUrl && (
            <img src={branding.logoUrl} alt="" className="h-8 w-8 rounded object-contain" />
          )}
          <h1 className="flex-1 truncate text-lg font-semibold text-white">{branding.orgName}</h1>
          <NotificationBell />
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 rounded-full p-1 pl-2 text-sm text-white/90 outline-none hover:bg-white/10">
              <span className="hidden max-w-40 truncate sm:block">{profile?.displayName}</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand font-semibold text-white">
                {(profile?.displayName || '?').charAt(0).toUpperCase()}
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>
                <p className="truncate font-medium">{profile?.displayName}</p>
                <p className="truncate text-xs font-normal text-muted-foreground">{profile?.email}</p>
                <p className="mt-0.5 text-xs font-normal capitalize text-muted-foreground">
                  {profile?.role}
                </p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => navigate('/profile')}>My Profile</DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={() => signOut()}>
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
