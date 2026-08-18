// Shared iCalendar builder — used by both the .ics download route and the RSVP confirmation email

function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

function foldLine(line: string): string {
  const CRLF = '\r\n'
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  const bytes = encoder.encode(line)
  if (bytes.length <= 75) return line

  const result: string[] = []
  let offset = 0
  while (offset < bytes.length) {
    const chunkSize = offset === 0 ? 75 : 74
    let end = Math.min(offset + chunkSize, bytes.length)
    while (end > offset && end < bytes.length && (bytes[end]! & 0xc0) === 0x80) end--
    result.push(decoder.decode(bytes.slice(offset, end)))
    offset = end
  }
  return result.join(CRLF + ' ')
}

const IST_OFFSET_MINUTES = 330

function parseTimeString(s: string): { hours: number; minutes: number } | null {
  const m12 = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (m12) {
    let h = parseInt(m12[1]!, 10)
    const min = parseInt(m12[2]!, 10)
    if (m12[3]!.toUpperCase() === 'PM' && h !== 12) h += 12
    if (m12[3]!.toUpperCase() === 'AM' && h === 12) h = 0
    return { hours: h, minutes: min }
  }
  const m24 = s.match(/^(\d{1,2}):(\d{2})$/)
  if (m24) return { hours: parseInt(m24[1]!, 10), minutes: parseInt(m24[2]!, 10) }
  return null
}

type IcsDateResult = { allDay: false; value: string } | { allDay: true; value: string }

function toIcsDate(isoDate: string, timeStr: string | null, addHours = 0): IcsDateResult {
  const parts = isoDate.substring(0, 10).split('-').map(Number) as [number, number, number]
  const [year, month, day] = parts
  if (!timeStr) {
    return { allDay: true, value: `${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}` }
  }
  const t = parseTimeString(timeStr)
  if (!t) {
    return { allDay: true, value: `${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}` }
  }
  const ms = Date.UTC(year, month - 1, day, t.hours + addHours, t.minutes, 0) - IST_OFFSET_MINUTES * 60_000
  const dt = new Date(ms)
  const value =
    String(dt.getUTCFullYear()) +
    String(dt.getUTCMonth() + 1).padStart(2, '0') +
    String(dt.getUTCDate()).padStart(2, '0') +
    'T' +
    String(dt.getUTCHours()).padStart(2, '0') +
    String(dt.getUTCMinutes()).padStart(2, '0') +
    '00Z'
  return { allDay: false, value }
}

function icsDateProp(name: string, result: IcsDateResult): string {
  return result.allDay ? `${name};VALUE=DATE:${result.value}` : `${name}:${result.value}`
}

export type IcsEventRow = {
  id: string
  name: string
  date: Date
  start_time: string | null
  end_time: string | null
  venue_name: string | null
  venue_address: string | null
  description: string | null
  dress_code: string | null
}

function buildVevent(ev: IcsEventRow, dtstamp: string): string {
  const isoDate = ev.date.toISOString()
  const dtstart = toIcsDate(isoDate, ev.start_time)
  const dtend = ev.end_time
    ? toIcsDate(isoDate, ev.end_time)
    : dtstart.allDay ? dtstart : toIcsDate(isoDate, ev.start_time, 2)

  const lines: string[] = [
    'BEGIN:VEVENT',
    `UID:${ev.id}@weddingwebsite`,
    `DTSTAMP:${dtstamp}`,
    icsDateProp('DTSTART', dtstart),
    icsDateProp('DTEND', dtend),
    `SUMMARY:${escapeIcsText(`${ev.name} – Aarav & Ananya`)}`,
  ]

  const locationParts = [ev.venue_name, ev.venue_address].filter(Boolean)
  if (locationParts.length > 0) {
    lines.push(`LOCATION:${escapeIcsText(locationParts.join(', '))}`)
  }

  const descParts = [ev.description, ev.dress_code ? `Dress code: ${ev.dress_code}` : null].filter(Boolean)
  if (descParts.length > 0) {
    lines.push(`DESCRIPTION:${escapeIcsText(descParts.join('\n'))}`)
  }

  lines.push('END:VEVENT')
  return lines.map(foldLine).join('\r\n')
}

export function buildIcs(events: IcsEventRow[]): string {
  const now = new Date()
  const dtstamp =
    String(now.getUTCFullYear()) +
    String(now.getUTCMonth() + 1).padStart(2, '0') +
    String(now.getUTCDate()).padStart(2, '0') +
    'T' +
    String(now.getUTCHours()).padStart(2, '0') +
    String(now.getUTCMinutes()).padStart(2, '0') +
    String(now.getUTCSeconds()).padStart(2, '0') +
    'Z'

  const vevents = events.map((ev) => buildVevent(ev, dtstamp)).join('\r\n')

  return [
    'BEGIN:VCALENDAR',
    'PRODID:-//Wedding//RSVP//EN',
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    vevents,
    'END:VCALENDAR',
  ].join('\r\n')
}
