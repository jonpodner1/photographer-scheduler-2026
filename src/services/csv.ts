import Papa from 'papaparse'
import { createEvent } from './events'

export interface ImportResult {
  success: number
  errors: string[]
}

// Accepted formats mirror the Flutter importer:
// dates: MM/DD/YYYY, M/D/YYYY, YYYY-MM-DD, MM-DD-YYYY — times: h:mm AM/PM, H:mm

function parseDate(dateStr: string): Date | null {
  let m = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/) // MM/DD/YYYY, M/D/YYYY
  if (m) return validDate(+m[3], +m[1], +m[2])
  m = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/) // YYYY-MM-DD
  if (m) return validDate(+m[1], +m[2], +m[3])
  m = dateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/) // MM-DD-YYYY
  if (m) return validDate(+m[3], +m[1], +m[2])
  return null
}

function validDate(year: number, month: number, day: number): Date | null {
  const d = new Date(year, month - 1, day)
  const ok = d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day
  return ok ? d : null
}

function parseTime(timeStr: string): { hour: number; minute: number } | null {
  const s = timeStr.trim().toUpperCase()
  let m = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/) // h:mm AM/PM
  if (m) {
    let hour = +m[1]
    const minute = +m[2]
    if (hour < 1 || hour > 12 || minute > 59) return null
    if (m[3] === 'PM' && hour !== 12) hour += 12
    if (m[3] === 'AM' && hour === 12) hour = 0
    return { hour, minute }
  }
  m = s.match(/^(\d{1,2}):(\d{2})$/) // H:mm / HH:mm (24h)
  if (m) {
    const hour = +m[1]
    const minute = +m[2]
    if (hour > 23 || minute > 59) return null
    return { hour, minute }
  }
  return null
}

function combine(date: Date, t: { hour: number; minute: number }): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), t.hour, t.minute)
}

/**
 * Imports events from CSV text. Required headers: date, time, location, event_name.
 * Optional: end_time, slots_needed, notes. Header names are case/space-insensitive.
 * Per-row failures are collected as "Row N: ..." messages, matching the Flutter importer.
 */
export async function importFromCsv(csvContent: string, createdByUid: string): Promise<ImportResult> {
  let rows: string[][]
  try {
    const parsed = Papa.parse<string[]>(csvContent.trim(), { skipEmptyLines: true })
    rows = parsed.data
  } catch (e) {
    return { success: 0, errors: [`Failed to parse CSV: ${e}`] }
  }
  if (rows.length === 0) return { success: 0, errors: ['Empty CSV'] }

  const headers = rows[0].map((h) => h.toString().trim().toLowerCase().replace(/ /g, '_'))
  const dateIdx = headers.indexOf('date')
  const timeIdx = headers.indexOf('time')
  const locationIdx = headers.indexOf('location')
  const eventNameIdx = headers.indexOf('event_name')
  const endTimeIdx = headers.indexOf('end_time')
  const slotsIdx = headers.indexOf('slots_needed')
  const notesIdx = headers.indexOf('notes')

  if (dateIdx === -1 || timeIdx === -1 || locationIdx === -1 || eventNameIdx === -1) {
    return { success: 0, errors: ['CSV must have headers: date, time, location, event_name'] }
  }

  let success = 0
  const errors: string[] = []

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (row.every((c) => !c || !c.toString().trim())) continue

    try {
      const dateStr = (row[dateIdx] ?? '').toString().trim()
      const timeStr = (row[timeIdx] ?? '').toString().trim()
      const location = (row[locationIdx] ?? '').toString().trim()
      const eventName = (row[eventNameIdx] ?? '').toString().trim()

      if (!dateStr || !timeStr) {
        errors.push(`Row ${i + 1}: Missing date or time`)
        continue
      }

      const date = parseDate(dateStr)
      const startT = parseTime(timeStr)
      if (!date || !startT) {
        errors.push(`Row ${i + 1}: Invalid date/time format. Use MM/DD/YYYY and HH:MM AM/PM`)
        continue
      }

      let endTime: Date | null = null
      if (endTimeIdx !== -1 && row.length > endTimeIdx) {
        const endStr = (row[endTimeIdx] ?? '').toString().trim()
        if (endStr) {
          const endT = parseTime(endStr)
          if (endT) endTime = combine(date, endT)
        }
      }

      const slotsNeeded =
        slotsIdx !== -1 && row.length > slotsIdx
          ? parseInt((row[slotsIdx] ?? '').toString().trim(), 10) || 1
          : 1

      const notesRaw =
        notesIdx !== -1 && row.length > notesIdx ? (row[notesIdx] ?? '').toString().trim() : ''

      await createEvent(
        {
          eventName,
          date,
          startTime: combine(date, startT),
          endTime,
          location,
          notes: notesRaw || null,
          slotsNeeded,
        },
        createdByUid,
        // Bulk import: skip per-event new-event notification fan-out
        { notify: false },
      )
      success++
    } catch (e) {
      errors.push(`Row ${i + 1}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return { success, errors }
}
