import type { DocumentSnapshot, Timestamp } from 'firebase/firestore'

// ─── Users ────────────────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'photographer'

/**
 * Account approval state. New signups start 'pending' and an admin approves or
 * denies them. Docs without the field (created before this feature, or by an
 * admin in the console) are treated as 'active'.
 */
export type UserStatus = 'pending' | 'active' | 'denied'

/**
 * Where the account lives: 'web' = scheduler_users (this app's signups),
 * 'app' = the MCHS iOS app's users collection (isPhotographer/isAdmin flags,
 * photographerRequested for pending requests).
 */
export type UserSource = 'web' | 'app'

export interface AppUser {
  uid: string
  email: string
  displayName: string
  role: UserRole
  phone?: string | null
  photoUrl?: string | null
  fcmToken?: string | null
  /** Admin-set score override (+/-), added to the real signup count for ranking. */
  scoreAdjustment: number
  status: UserStatus
  source: UserSource
}

export function userFromDoc(snap: DocumentSnapshot): AppUser {
  const d = snap.data() ?? {}
  return {
    uid: snap.id,
    email: d.email ?? '',
    displayName: d.displayName ?? '',
    role: d.role === 'admin' ? 'admin' : 'photographer',
    phone: d.phone ?? null,
    photoUrl: d.photoUrl ?? null,
    fcmToken: d.fcmToken ?? null,
    scoreAdjustment: typeof d.scoreAdjustment === 'number' ? d.scoreAdjustment : 0,
    status: d.status === 'pending' ? 'pending' : d.status === 'denied' ? 'denied' : 'active',
    source: 'web',
  }
}

/**
 * Maps an MCHS iOS app users/{uid} doc into the same shape. Status mapping:
 * photographer/admin capability → active; photographerRequested → pending;
 * neither → denied (callers filter those out — plain app users aren't part of
 * the scheduler).
 */
export function appUserFromDoc(snap: DocumentSnapshot): AppUser {
  const d = snap.data() ?? {}
  const name = `${d.firstName ?? ''} ${d.lastName ?? ''}`.trim()
  const capable = d.isPhotographer === true || d.isAdmin === true
  return {
    uid: snap.id,
    email: d.email ?? '',
    displayName: name || d.email || 'MCHS app user',
    role: d.isAdmin === true ? 'admin' : 'photographer',
    phone: d.phone ?? null,
    photoUrl: null,
    fcmToken: d.fcmToken ?? null,
    scoreAdjustment: 0,
    status: capable ? 'active' : d.photographerRequested === true ? 'pending' : 'denied',
    source: 'app',
  }
}

// ─── Events ───────────────────────────────────────────────────────────────────

export type EventStatus = 'open' | 'filled' | 'cancelled'

export interface PhotographerSlot {
  photographerId: string
  photographerName: string
  acceptedAt: Date
  requestedCamera: boolean
}

export interface ScheduleEvent {
  id: string
  eventName: string
  date: Date
  startTime: Date
  endTime: Date | null
  location: string
  notes: string | null
  slotsNeeded: number
  slots: PhotographerSlot[]
  photographerIds: string[]
  status: EventStatus
  createdBy: string
  createdAt: Date
}

export const slotsRemaining = (e: ScheduleEvent) => e.slotsNeeded - e.slots.length
export const isFull = (e: ScheduleEvent) => e.slots.length >= e.slotsNeeded
export const isOpen = (e: ScheduleEvent) => e.status === 'open' && !isFull(e)
export const isSignedUpBy = (e: ScheduleEvent, uid: string) =>
  e.slots.some((s) => s.photographerId === uid)

// Some legacy data was written with 2-digit years (e.g. 0025). Same fix as the
// Flutter model's _fixYear.
function fixYear(d: Date): Date {
  if (d.getFullYear() < 100) {
    const fixed = new Date(d)
    fixed.setFullYear(d.getFullYear() + 2000)
    return fixed
  }
  return d
}

function toDate(v: unknown): Date {
  if (!v) return new Date()
  return fixYear((v as Timestamp).toDate())
}

export function eventFromDoc(snap: DocumentSnapshot): ScheduleEvent {
  const d = snap.data() ?? {}
  return {
    id: snap.id,
    eventName: d.eventName ?? '',
    date: toDate(d.date),
    startTime: toDate(d.startTime),
    endTime: d.endTime ? toDate(d.endTime) : null,
    location: d.location ?? '',
    notes: d.notes ?? null,
    slotsNeeded: d.slotsNeeded ?? 1,
    slots: ((d.slots as Array<Record<string, unknown>>) ?? []).map((s) => ({
      photographerId: (s.photographerId as string) ?? '',
      photographerName: (s.photographerName as string) ?? '',
      acceptedAt: toDate(s.acceptedAt),
      requestedCamera: (s.requestedCamera as boolean) ?? false,
    })),
    photographerIds: (d.photographerIds as string[]) ?? [],
    status: d.status === 'filled' ? 'filled' : d.status === 'cancelled' ? 'cancelled' : 'open',
    createdBy: d.createdBy ?? '',
    createdAt: toDate(d.createdAt),
  }
}

// ─── Notifications ────────────────────────────────────────────────────────────

export type NotificationType =
  | 'newEvent'
  | 'photographerSignedUp'
  | 'photographerRemoved'
  | 'eventCancelled'
  | 'assignedToEvent'
  | 'accountPending'
  | 'accountApproved'

export interface AppNotification {
  id: string
  userId: string
  type: NotificationType
  title: string
  body: string
  eventId: string
  eventName: string
  isRead: boolean
  createdAt: Date
}

export function notificationFromDoc(snap: DocumentSnapshot): AppNotification {
  const d = snap.data() ?? {}
  const types: NotificationType[] = [
    'newEvent',
    'photographerSignedUp',
    'photographerRemoved',
    'eventCancelled',
    'assignedToEvent',
    'accountPending',
    'accountApproved',
  ]
  return {
    id: snap.id,
    userId: d.userId ?? '',
    type: types.includes(d.type) ? d.type : 'newEvent',
    title: d.title ?? '',
    body: d.body ?? '',
    eventId: d.eventId ?? '',
    eventName: d.eventName ?? '',
    isRead: d.isRead ?? false,
    createdAt: toDate(d.createdAt),
  }
}

// ─── Branding ─────────────────────────────────────────────────────────────────

export interface Branding {
  orgName: string
  logoUrl: string | null
  // ARGB int, kept identical to the Flutter model so the same document works
  // for both platforms (e.g. 0xFF1A237E).
  primaryColorValue: number
  accentColorValue: number
  pdfHeaderLine1: string
  pdfHeaderLine2: string
  selfSignupEnabled: boolean
}

export const DEFAULT_BRANDING: Branding = {
  orgName: 'Photographer Scheduler',
  logoUrl: null,
  primaryColorValue: 0xff1a237e,
  accentColorValue: 0xffff6f00,
  pdfHeaderLine1: 'Photographer Schedule',
  pdfHeaderLine2: '',
  selfSignupEnabled: true,
}

export function brandingFromData(d: Record<string, unknown> | undefined): Branding {
  if (!d) return DEFAULT_BRANDING
  return {
    orgName: (d.orgName as string) ?? DEFAULT_BRANDING.orgName,
    logoUrl: (d.logoUrl as string) ?? null,
    primaryColorValue: (d.primaryColorValue as number) ?? DEFAULT_BRANDING.primaryColorValue,
    accentColorValue: (d.accentColorValue as number) ?? DEFAULT_BRANDING.accentColorValue,
    pdfHeaderLine1: (d.pdfHeaderLine1 as string) ?? DEFAULT_BRANDING.pdfHeaderLine1,
    pdfHeaderLine2: (d.pdfHeaderLine2 as string) ?? '',
    selfSignupEnabled: (d.selfSignupEnabled as boolean) ?? true,
  }
}

/** ARGB int (Flutter Color.value) → '#rrggbb' */
export function argbToHex(value: number): string {
  return '#' + (value & 0xffffff).toString(16).padStart(6, '0')
}

/** '#rrggbb' → ARGB int with full alpha */
export function hexToArgb(hex: string): number {
  return (parseInt(hex.replace('#', ''), 16) | 0xff000000) >>> 0
}
