const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
}

function monthIndex(token: string): number | null {
  const key = token.slice(0, 3).toLowerCase()
  return key in MONTHS ? MONTHS[key] : null
}

function hour12(hour: number, ap: string): number | null {
  if (hour < 1 || hour > 12) return null
  const pm = ap.toLowerCase() === 'pm'
  if (pm && hour !== 12) return hour + 12
  if (!pm && hour === 12) return 0
  return hour
}

function localDate(year: number, month: number, day: number, hour: number, minute: number, second = 0): Date | null {
  if (month < 0 || month > 11 || day < 1 || day > 31 || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null
  }
  const date = new Date(year, month, day, hour, minute, second)
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return null
  return date
}

function excelSerialToDate(serial: number): Date | null {
  if (!Number.isFinite(serial) || serial < 20_000 || serial > 80_000) return null
  const epoch = Date.UTC(1899, 11, 30)
  const utc = new Date(epoch + serial * 86_400_000)
  return localDate(
    utc.getUTCFullYear(),
    utc.getUTCMonth(),
    utc.getUTCDate(),
    utc.getUTCHours(),
    utc.getUTCMinutes(),
    utc.getUTCSeconds(),
  )
}

/**
 * Parse the timestamp shapes the desktop analyzer accepted, including
 * "Jul 31, 2026 11:58pm". Unparseable values become null.
 */
export function parseFlexibleDatetime(value: unknown): Date | null {
  if (value == null || value === '') return null
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }
  if (typeof value === 'number') return excelSerialToDate(value)

  const raw = String(value).trim()
  if (!raw || /^(null|na|n\/a|none|-)$/i.test(raw)) return null

  const monthName = raw.match(
    /^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i,
  )
  if (monthName) {
    const month = monthIndex(monthName[1])
    if (month == null) return null
    const day = Number(monthName[2])
    const year = Number(monthName[3])
    const minute = Number(monthName[5])
    const second = monthName[6] ? Number(monthName[6]) : 0
    let hour = Number(monthName[4])
    if (monthName[7]) {
      const converted = hour12(hour, monthName[7])
      if (converted == null) return null
      hour = converted
    }
    return localDate(year, month, day, hour, minute, second)
  }

  const ymd = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (ymd) {
    return localDate(
      Number(ymd[1]),
      Number(ymd[2]) - 1,
      Number(ymd[3]),
      Number(ymd[4]),
      Number(ymd[5]),
      ymd[6] ? Number(ymd[6]) : 0,
    )
  }

  const numeric = raw.match(
    /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i,
  )
  if (numeric) {
    const year = Number(numeric[3])
    const minute = Number(numeric[5])
    const second = numeric[6] ? Number(numeric[6]) : 0
    let hour = Number(numeric[4])
    if (numeric[7]) {
      const converted = hour12(hour, numeric[7])
      if (converted == null) return null
      hour = converted
    }
    const monthFirst = localDate(year, Number(numeric[1]) - 1, Number(numeric[2]), hour, minute, second)
    if (monthFirst) return monthFirst
    return localDate(year, Number(numeric[2]) - 1, Number(numeric[1]), hour, minute, second)
  }

  const fallback = new Date(raw)
  return Number.isNaN(fallback.getTime()) ? null : fallback
}

export function formatYearMonth(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function minutesBetween(later: Date, earlier: Date): number {
  return (later.getTime() - earlier.getTime()) / 60_000
}
