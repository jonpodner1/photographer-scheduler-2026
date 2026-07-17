import { useEffect, useMemo, useState } from 'react'
import { listenAllEvents } from '../services/events'
import { listenUsers } from '../services/users'
import { startOfDay } from '../lib/format'
import type { AppUser, ScheduleEvent } from '../types/models'

export interface PhotographerStats {
  user: AppUser
  /** Non-cancelled upcoming events they hold a slot in, soonest first. */
  upcoming: ScheduleEvent[]
  /** Non-cancelled past events they held a slot in, most recent first. */
  past: ScheduleEvent[]
  /** Real signups: non-cancelled events they hold a slot in (upcoming + past). */
  eventCount: number
  /** Admin override credit (can be negative). */
  adjustment: number
  /** eventCount + adjustment — what the ranking sorts on. */
  score: number
  /** 1-based rank among photographers (ties share a rank). Undefined for admins. */
  rank?: number
}

export interface StatsData {
  byUid: Map<string, PhotographerStats>
  /** Photographers only, best score first. */
  ranked: PhotographerStats[]
  users: AppUser[]
}

/**
 * Live stats for every user: which events they're on, their score
 * (signups + admin adjustment), and their rank among photographers.
 * Returns null until both listeners have delivered.
 *
 * MCHS-app photographers don't have scheduler_users docs, and their users
 * collection is admin-only — so for ranking purposes they're derived from the
 * event slots themselves (uid + display name live on every slot). That keeps
 * ranks identical for every viewer without exposing the app's user list.
 */
export function usePhotographerStats(): StatsData | null {
  const [events, setEvents] = useState<ScheduleEvent[] | null>(null)
  const [users, setUsers] = useState<AppUser[] | null>(null)

  useEffect(() => listenAllEvents(setEvents), [])
  useEffect(() => listenUsers(setUsers), [])

  return useMemo(() => {
    if (!events || !users) return null
    const today = startOfDay(new Date()).getTime()

    const statsFor = (user: AppUser): PhotographerStats => {
      const mine = events.filter(
        (e) => e.status !== 'cancelled' && e.photographerIds.includes(user.uid),
      )
      const upcoming = mine.filter((e) => e.date.getTime() >= today)
      const past = mine.filter((e) => e.date.getTime() < today).reverse()
      const adjustment = user.scoreAdjustment ?? 0
      return {
        user,
        upcoming,
        past,
        eventCount: mine.length,
        adjustment,
        score: mine.length + adjustment,
      }
    }

    const byUid = new Map<string, PhotographerStats>()
    for (const user of users) byUid.set(user.uid, statsFor(user))

    // MCHS-app photographers appear only via their slots: synthesize entries.
    for (const event of events) {
      for (const slot of event.slots) {
        if (byUid.has(slot.photographerId)) continue
        byUid.set(
          slot.photographerId,
          statsFor({
            uid: slot.photographerId,
            email: '',
            displayName: slot.photographerName,
            role: 'photographer',
            scoreAdjustment: 0,
            status: 'active',
            source: 'app',
          }),
        )
      }
    }

    // Rank approved photographers by score (competition ranking: ties share a rank).
    const ranked = [...byUid.values()]
      .filter((s) => s.user.role === 'photographer' && s.user.status === 'active')
      .sort((a, b) => b.score - a.score || a.user.displayName.localeCompare(b.user.displayName))
    ranked.forEach((s, i) => {
      s.rank = i > 0 && ranked[i - 1].score === s.score ? ranked[i - 1].rank : i + 1
    })

    return { byUid, ranked, users }
  }, [events, users])
}
