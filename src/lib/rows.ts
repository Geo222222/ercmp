import type { Cell, Row } from '../types'

export function asText(value: Cell | undefined): string | null {
  if (value == null || value === '') return null
  return String(value)
}

export function filterRows(rows: Row[], column: string, values: string[]): Row[] {
  if (!column || column === 'none' || values.length === 0) return rows
  const allowed = new Set(values)
  return rows.filter((row) => {
    const text = asText(row[column])
    return text != null && allowed.has(text)
  })
}

export function valueCounts(rows: Row[], column: string): { value: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const text = asText(row[column])
    if (text == null) continue
    counts.set(text, (counts.get(text) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
}

export function asNumber(value: Cell | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

export function isNumericColumn(rows: Row[], column: string): boolean {
  let seen = 0
  for (const row of rows) {
    const value = row[column]
    if (value == null || value === '') continue
    if (asNumber(value) == null) return false
    seen += 1
  }
  return seen > 0
}

export function numericColumns(headers: string[], rows: Row[]): string[] {
  return headers.filter((header) => isNumericColumn(rows, header))
}

export function categoricalColumns(headers: string[], rows: Row[]): string[] {
  return headers.filter((header) => !isNumericColumn(rows, header) && valueCounts(rows, header).length > 0)
}
