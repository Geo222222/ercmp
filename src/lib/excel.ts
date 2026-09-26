import * as XLSX from 'xlsx'
import type { Cell, DataTable, Dataset, MonthDataset, MonthRange, Row, SheetGrid } from '../types'
import { formatYearMonth, parseFlexibleDatetime } from './datetime'

export const BUNDLED_WORKBOOK = 'JUNE - KSA.xlsx'

const MONTH_NAME_RE =
  /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\b/i

let monthSeq = 0

function nextMonthId(fileName: string): string {
  monthSeq += 1
  const slug = fileName.replace(/\.xlsx?$/i, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()
  return `${slug || 'month'}-${monthSeq}`
}

function normalizeCell(value: unknown): Cell {
  if (value == null) return null
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    const pad = (n: number) => String(n).padStart(2, '0')
    const month = value.toLocaleString('en-US', { month: 'short' })
    const hour24 = value.getHours()
    const ap = hour24 >= 12 ? 'pm' : 'am'
    const hour12 = hour24 % 12 || 12
    return `${month} ${value.getDate()}, ${value.getFullYear()} ${hour12}:${pad(value.getMinutes())}${ap}`
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'boolean') return value
  const text = String(value).trim()
  return text === '' ? null : text
}

export function guessHeaderRow(cells: Cell[][]): number {
  const limit = Math.min(cells.length, 25)
  let bestRow = 1
  let bestScore = -1
  for (let i = 0; i < limit; i += 1) {
    const row = cells[i] ?? []
    const labels = row.filter((cell) => typeof cell === 'string' && cell.trim().length > 0) as string[]
    if (labels.length < 2) continue
    let score = labels.length
    const joined = labels.join(' ').toLowerCase()
    if (/crew|time|parish|status/.test(joined)) score += 20
    if (score > bestScore) {
      bestScore = score
      bestRow = i + 1
    }
  }
  return bestRow
}

export function tableFromGrid(grid: SheetGrid, headerRow1: number): DataTable {
  const headerIndex = Math.max(0, headerRow1 - 1)
  const headerLine = grid.cells[headerIndex] ?? []
  const used = new Set<string>()
  const cols: { index: number; name: string }[] = []

  headerLine.forEach((cell, index) => {
    if (typeof cell !== 'string' || cell.trim() === '') return
    let name = cell.trim()
    if (used.has(name)) {
      let n = 2
      while (used.has(`${name} (${n})`)) n += 1
      name = `${name} (${n})`
    }
    used.add(name)
    cols.push({ index, name })
  })

  const headers = cols.map((col) => col.name)
  const rows: Row[] = []
  for (let r = headerIndex + 1; r < grid.cells.length; r += 1) {
    const line = grid.cells[r] ?? []
    const row: Row = {}
    let any = false
    for (const col of cols) {
      const value = line[col.index] ?? null
      row[col.name] = value
      if (value != null && value !== '') any = true
    }
    if (any) rows.push(row)
  }

  return { headers, rows, headerRow: headerRow1 }
}

export function parseWorkbook(data: ArrayBuffer | Uint8Array, fileName: string): Dataset {
  const workbook = XLSX.read(data, { type: 'array', cellDates: true })
  if (workbook.SheetNames.length === 0) {
    throw new Error('That workbook has no sheets.')
  }
  const sheets: SheetGrid[] = workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name]
    const matrix = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: true,
    }) as unknown[][]
    return {
      name,
      cells: matrix.map((line) => (line ?? []).map((cell) => normalizeCell(cell))),
    }
  })
  return { fileName, sheets }
}

export function bundledWorkbookUrl(): string {
  return `${import.meta.env.BASE_URL}${encodeURIComponent(BUNDLED_WORKBOOK)}`
}

/** Human label from a workbook name, e.g. "JUNE - KSA.xlsx" → "June". */
export function monthLabelFromFileName(fileName: string): string {
  const base = fileName.replace(/\.xlsx?$/i, '').trim()
  const match = base.match(MONTH_NAME_RE)
  if (match) {
    const token = match[1]
    return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase()
  }
  const cleaned = base.replace(/\s*[-–—]\s*KSA\s*$/i, '').trim()
  return cleaned || base || 'Workbook'
}

/** Prefer a compact YYYY-MM or "Mon YYYY" label when the sheet has a clear single month. */
export function displayMonthLabel(label: string, range: MonthRange): string {
  if (range.startYm && range.endYm && range.startYm === range.endYm) {
    const [year, month] = range.startYm.split('-').map(Number)
    if (year && month) {
      const date = new Date(year, month - 1, 1)
      return date.toLocaleString('en-US', { month: 'short', year: 'numeric' })
    }
  }
  if (range.startYm && range.endYm && range.startYm !== range.endYm) {
    return `${shortYm(range.startYm)}–${shortYm(range.endYm)}`
  }
  return label
}

function shortYm(ym: string): string {
  const [year, month] = ym.split('-').map(Number)
  if (!year || !month) return ym
  const date = new Date(year, month - 1, 1)
  return date.toLocaleString('en-US', { month: 'short', year: '2-digit' })
}

/**
 * Scan likely timestamp columns for the earliest/latest year-month.
 * Pass stageCols when known; otherwise any header matching time/date patterns is used.
 */
export function inferMonthRange(table: DataTable, stageCols: string[] = []): MonthRange {
  const candidates =
    stageCols.length > 0
      ? stageCols
      : table.headers.filter((header) => /time|date|stamp|assigned|ack|enroute|on-?site|comp/i.test(header))
  const cols = candidates.length > 0 ? candidates : table.headers.slice(0, 8)

  let min: Date | null = null
  let max: Date | null = null
  const sampleLimit = Math.min(table.rows.length, 4000)

  for (let i = 0; i < sampleLimit; i += 1) {
    const row = table.rows[i]
    for (const col of cols) {
      const date = parseFlexibleDatetime(row[col])
      if (!date) continue
      if (!min || date < min) min = date
      if (!max || date > max) max = date
    }
  }

  return {
    startYm: min ? formatYearMonth(min) : null,
    endYm: max ? formatYearMonth(max) : null,
  }
}

export function createMonthDataset(dataset: Dataset, opts?: { label?: string; active?: boolean }): MonthDataset {
  const sheet = dataset.sheets[0]
  const sheetName = sheet?.name ?? ''
  const headerRow = sheet ? guessHeaderRow(sheet.cells) : 1
  const table = sheet ? tableFromGrid(sheet, headerRow) : null
  const range = table ? inferMonthRange(table) : { startYm: null, endYm: null }
  const fromFile = monthLabelFromFileName(dataset.fileName)
  const label = opts?.label ?? (range.startYm && range.endYm && range.startYm === range.endYm
    ? displayMonthLabel(fromFile, range)
    : fromFile)

  return {
    id: nextMonthId(dataset.fileName),
    label,
    fileName: dataset.fileName,
    sheets: dataset.sheets,
    sheetName,
    headerRow,
    range,
    active: opts?.active ?? true,
  }
}

export function refreshMonthRange(month: MonthDataset, stageCols: string[] = []): MonthDataset {
  const sheet = month.sheets.find((item) => item.name === month.sheetName) ?? month.sheets[0]
  if (!sheet) return month
  const table = tableFromGrid(sheet, month.headerRow)
  const range = inferMonthRange(table, stageCols)
  return { ...month, range }
}

export function monthTable(month: MonthDataset): DataTable | null {
  const sheet = month.sheets.find((item) => item.name === month.sheetName) ?? null
  return sheet ? tableFromGrid(sheet, month.headerRow) : null
}

export type DiscoveredWorkbook = {
  fileName: string
  url: string
  source?: 'root' | 'data'
}

function withBase(path: string): string {
  const base = import.meta.env.BASE_URL || '/'
  if (path.startsWith('http')) return path
  const trimmed = path.replace(/^\//, '')
  return `${base}${trimmed}`.replace(/([^:]\/)\/+/g, '$1')
}

/** Manifest of Excel files discovered beside the app (`data/` + repo root). */
export async function fetchDiscoveredWorkbooks(signal?: AbortSignal): Promise<DiscoveredWorkbook[]> {
  const candidates = [withBase('api/workbooks'), withBase('workbooks.json')]
  for (const url of candidates) {
    try {
      const response = await fetch(url, { signal })
      if (!response.ok) continue
      const payload = (await response.json()) as { workbooks?: DiscoveredWorkbook[] }
      if (Array.isArray(payload.workbooks) && payload.workbooks.length > 0) {
        return payload.workbooks.map((item) => ({
          ...item,
          url: item.url.startsWith('http') ? item.url : withBase(item.url.replace(/^\//, '')),
        }))
      }
    } catch {
      // try next candidate
    }
  }

  // Last resort: classic June URL (dev middleware + build copy).
  return [{ fileName: BUNDLED_WORKBOOK, url: bundledWorkbookUrl(), source: 'root' }]
}

export function isExcelFileName(name: string): boolean {
  return /\.xlsx?$/i.test(name) && !name.startsWith('~$')
}

export function sortMonthDatasets(months: MonthDataset[]): MonthDataset[] {
  return [...months].sort((a, b) => {
    const aKey = a.range.startYm ?? a.label
    const bKey = b.range.startYm ?? b.label
    const byRange = aKey.localeCompare(bKey)
    if (byRange !== 0) return byRange
    return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
  })
}

/** Stable accent tones for month chips / compare cards (theme-token friendly via CSS vars fallback). */
export function monthTone(index: number): string {
  const tones = [
    'var(--accent)',
    'var(--good)',
    'var(--warn)',
    'color-mix(in srgb, var(--accent) 55%, var(--good))',
    'color-mix(in srgb, var(--accent) 45%, var(--warn))',
    'color-mix(in srgb, var(--good) 50%, var(--warn))',
  ]
  return tones[index % tones.length]
}

export function rangeNote(range: MonthRange): string {
  if (range.startYm && range.endYm && range.startYm === range.endYm) return range.startYm
  if (range.startYm && range.endYm) return `${range.startYm} → ${range.endYm}`
  if (range.startYm) return range.startYm
  return 'Dates unknown'
}
