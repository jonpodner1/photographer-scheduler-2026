import { useAuth } from '../../context/AuthContext'
import PhotographerDashboard from '../../components/PhotographerDashboard'

export default function DashboardPage() {
  const { profile } = useAuth()
  if (!profile) return null

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold">My Dashboard</h2>
      <PhotographerDashboard photographer={profile} />
    </div>
  )
}
