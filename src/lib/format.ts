const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3))

/** "Monday, May 5, 2025" */
export function formatDateLong(d: Date): string {
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

/** "May 5, 2025" */
export function formatDateShort(d: Date): string {
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

/** "May 5" */
export function formatDateTiny(d: Date): string {
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`
}

/** "2:30 PM" */
export function formatTime(d: Date): string {
  let h = d.getHours()
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${String(d.getMinutes()).padStart(2, '0')} ${ampm}`
}

/** "2:30 PM – 4:00 PM" or "2:30 PM" */
export function formatTimeRange(start: Date, end: Date | null): string {
  return end ? `${formatTime(start)} – ${formatTime(end)}` : formatTime(start)
}

/** "May 2025" */
export function formatMonthYear(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

/** Local midnight of the given date. */
export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** Sunday of the week containing d, at local midnight. */
export function startOfWeek(d: Date): Date {
  const s = startOfDay(d)
  s.setDate(s.getDate() - s.getDay())
  return s
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

/** yyyy-mm-dd for <input type="date"> */
export function toDateInputValue(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** HH:mm for <input type="time"> */
export function toTimeInputValue(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Combine yyyy-mm-dd + HH:mm strings into a local Date. */
export function combineDateTime(dateStr: string, timeStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  const [hh, mm] = timeStr.split(':').map(Number)
  return new Date(y, m - 1, d, hh, mm)
}

/** Relative time for notifications: "2m ago", "3h ago", "Jan 5". */
export function formatRelative(d: Date): string {
  const secs = Math.floor((Date.now() - d.getTime()) / 1000)
  if (secs < 60) return 'just now'
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  if (secs < 7 * 86400) return `${Math.floor(secs / 86400)}d ago`
  return formatDateTiny(d)
}
