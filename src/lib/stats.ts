import type { Row } from '../types'
import { displayValue, roundTo } from './format'
import { asNumber, asText, categoricalColumns, numericColumns } from './rows'
import { quantile } from './crew'

export type NumericSummary = {
  Variable: string
  N: number
  Missing: number
  Mean: number | null
  SD: number | null
  Min: number | null
  Q1: number | null
  Median: number | null
  Q3: number | null
  Max: number | null
}

export type CategoricalSummary = {
  Variable: string
  N: number
  Missing: number
  UniqueValues: number
  MostFrequent: string | null
  MostFrequentCount: number
  TopShare: number | null
}

export type ValueShare = {
  value: string
  count: number
  share: number
}

export type FieldBreakdown = {
  column: string
  n: number
  missing: number
  unique: number
  values: ValueShare[]
  hidden: number
}

function sampleSd(values: number[]): number | null {
  if (values.length < 2) return null
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length
  const squared = values.reduce((sum, value) => sum + (value - avg) ** 2, 0)
  return Math.sqrt(squared / (values.length - 1))
}

function finite(values: number[]): number[] {
  return values.filter((value) => Number.isFinite(value))
}

function summarizeNumeric(rows: Row[], column: string): NumericSummary {
  const values: number[] = []
  let missing = 0
  for (const row of rows) {
    const value = row[column]
    if (value == null || value === '') {
      missing += 1
      continue
    }
    const parsed = asNumber(value)
    if (parsed == null) missing += 1
    else values.push(parsed)
  }
  const present = finite(values)
  const rounded = (value: number) => roundTo(value, 3)
  return {
    Variable: column,
    N: present.length,
    Missing: missing,
    Mean: present.length ? rounded(present.reduce((sum, value) => sum + value, 0) / present.length) : null,
    SD: (() => {
      const sd = sampleSd(present)
      return sd == null ? null : rounded(sd)
    })(),
    Min: present.length ? rounded(Math.min(...present)) : null,
    Q1: present.length ? rounded(quantile(present, 0.25)) : null,
    Median: present.length ? rounded(quantile(present, 0.5)) : null,
    Q3: present.length ? rounded(quantile(present, 0.75)) : null,
    Max: present.length ? rounded(Math.max(...present)) : null,
  }
}

function summarizeCategorical(rows: Row[], column: string): CategoricalSummary {
  const counts = new Map<string, number>()
  let missing = 0
  for (const row of rows) {
    const text = asText(row[column])
    if (text == null) {
      missing += 1
      continue
    }
    counts.set(text, (counts.get(text) ?? 0) + 1)
  }
  let top: string | null = null
  let topCount = 0
  for (const [value, count] of counts) {
    if (count > topCount) {
      top = value
      topCount = count
    }
  }
  const present = rows.length - missing
  return {
    Variable: column,
    N: present,
    Missing: missing,
    UniqueValues: counts.size,
    MostFrequent: top,
    MostFrequentCount: topCount,
    TopShare: present > 0 && top != null ? topCount / present : null,
  }
}

/** Ranked value shares for a categorical field — used by Stats dive-in. */
export function fieldBreakdown(rows: Row[], column: string, limit = 48): FieldBreakdown | null {
  const counts = new Map<string, number>()
  let missing = 0
  for (const row of rows) {
    const text = asText(row[column])
    if (text == null) {
      missing += 1
      continue
    }
    counts.set(text, (counts.get(text) ?? 0) + 1)
  }
  const present = rows.length - missing
  if (present === 0 && missing === 0) return null
  const ranked = [...counts.entries()]
    .map(([value, count]) => ({ value, count, share: present > 0 ? count / present : 0 }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
  return {
    column,
    n: present,
    missing,
    unique: counts.size,
    values: ranked.slice(0, limit),
    hidden: Math.max(0, ranked.length - limit),
  }
}

/** Compact top-N shares for instrument spark bars. */
export function topShares(rows: Row[], column: string, limit = 5): ValueShare[] {
  const breakdown = fieldBreakdown(rows, column, limit)
  return breakdown?.values ?? []
}

export function descriptiveStats(rows: Row[], columns: string[], groupCol: string): {
  grouped: Record<string, string | number | null>[] | null
  numeric: NumericSummary[]
  categorical: CategoricalSummary[]
} {
  const numeric = numericColumns(columns, rows)
  const categorical = categoricalColumns(columns, rows).filter((column) => column !== groupCol)

  if (groupCol !== 'none' && numeric.length > 0) {
    const groups = new Map<string, Row[]>()
    for (const row of rows) {
      const key = asText(row[groupCol]) ?? 'Unknown'
      const list = groups.get(key)
      if (list) list.push(row)
      else groups.set(key, [row])
    }
    const grouped = [...groups.entries()].map(([group, groupRows]) => {
      const record: Record<string, string | number | null> = { [groupCol]: group }
      for (const column of numeric) {
        const summary = summarizeNumeric(groupRows, column)
        record[`${column}_N`] = summary.N
        record[`${column}_Mean`] = summary.Mean
        record[`${column}_SD`] = summary.SD
        record[`${column}_Median`] = summary.Median
      }
      return record
    })
    return { grouped, numeric: [], categorical: [] }
  }

  return {
    grouped: null,
    numeric: numeric.map((column) => summarizeNumeric(rows, column)),
    categorical: categorical.map((column) => summarizeCategorical(rows, column)),
  }
}

export type HistBin = { label: string; n: number; lo: number; hi: number }
export type HistModel = { column: string; bins: HistBin[]; total: number }
export type BoxGroup = {
  name: string
  n: number
  low: number
  q1: number
  median: number
  q3: number
  high: number
  outliers: number[]
}
export type BoxModel = { column: string; groups: BoxGroup[]; total: number }
export type BarModel = {
  column: string
  items: { label: string; n: number }[]
  hidden: number
  total: number
  missing: number
}
export type ScatterModel = {
  xCol: string
  yCol: string
  points: { x: number; y: number; index: number }[]
  slope: number
  intercept: number
  hidden: number
  total: number
}
export type CorrModel = { labels: string[]; matrix: (number | null)[][] }
export type SpeedGroup = { name: string; n: number; median: number; average: number }
export type SpeedModel = { column: string; groupCol: string; groups: SpeedGroup[]; hidden: number; total: number }

/** Canonical label key for missing category buckets. */
export const UNASSIGNED_KEY = '__unassigned__'

/** True for blank / null / na-style category values. */
export function isMissingCategory(text: string | null | undefined): boolean {
  if (text == null) return true
  const trimmed = text.trim()
  if (trimmed === '') return true
  return /^(null|na|n\/a|none|-)$/i.test(trimmed)
}

export function categoryLabel(raw: string): string {
  if (raw === UNASSIGNED_KEY || isMissingCategory(raw)) return 'Unassigned'
  return displayValue(raw)
}

/** Prefer Job / Order No. when present; fall back to crew + parish-ish fields. */
export function jobHint(row: Row, headers?: string[]): string {
  const keys = headers ?? Object.keys(row)
  const preferred = keys.find((key) => /^(job|order no\.?|order number|wo|work order)$/i.test(key))
  if (preferred) {
    const text = asText(row[preferred])
    if (text) return text
  }
  const crew = keys.find((key) => /^crew$/i.test(key))
  const parish = keys.find((key) => /^parish$/i.test(key))
  const parts = [crew && asText(row[crew]), parish && asText(row[parish])].filter(Boolean)
  if (parts.length) return parts.join(' · ')
  const first = keys.map((key) => asText(row[key])).find(Boolean)
  return first ?? 'Job'
}

export function sampleJobHints(
  rows: Row[],
  match: (row: Row) => boolean,
  limit = 4,
  headers?: string[],
): string[] {
  const hints: string[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    if (!match(row)) continue
    const hint = jobHint(row, headers)
    if (seen.has(hint)) continue
    seen.add(hint)
    hints.push(hint)
    if (hints.length >= limit) break
  }
  return hints
}

function columnNumbers(rows: Row[], column: string): number[] {
  const values: number[] = []
  for (const row of rows) {
    const parsed = asNumber(row[column])
    if (parsed != null) values.push(parsed)
  }
  return values
}

export function histogram(rows: Row[], column: string): HistModel | null {
  const values = columnNumbers(rows, column)
  if (values.length === 0) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const bins = 30
  const width = max === min ? 1 : (max - min) / bins
  const counts = Array.from({ length: bins }, () => 0)
  for (const value of values) {
    let index = Math.floor((value - min) / width)
    if (index >= bins) index = bins - 1
    if (index < 0) index = 0
    counts[index] += 1
  }
  return {
    column,
    total: values.length,
    bins: counts.map((n, index) => {
      const lo = min + index * width
      const hi = index === bins - 1 ? max : min + (index + 1) * width
      const digits = max - min > 10 ? 0 : 1
      return {
        label: lo.toFixed(digits),
        n,
        lo,
        hi,
      }
    }),
  }
}

export function boxplot(rows: Row[], column: string, groupCol: string): BoxModel | null {
  const buckets = new Map<string, number[]>()
  for (const row of rows) {
    const value = asNumber(row[column])
    if (value == null) continue
    const name = groupCol === 'none' ? column : (asText(row[groupCol]) ?? 'Unknown')
    const list = buckets.get(name)
    if (list) list.push(value)
    else buckets.set(name, [value])
  }
  if (buckets.size === 0) return null

  const groups: BoxGroup[] = [...buckets.entries()].map(([name, values]) => {
    const sorted = [...values].sort((a, b) => a - b)
    const q1 = quantile(sorted, 0.25)
    const q3 = quantile(sorted, 0.75)
    const med = quantile(sorted, 0.5)
    const iqr = q3 - q1
    const fenceLow = q1 - 1.5 * iqr
    const fenceHigh = q3 + 1.5 * iqr
    const inside = sorted.filter((value) => value >= fenceLow && value <= fenceHigh)
    const outliers = sorted.filter((value) => value < fenceLow || value > fenceHigh).slice(0, 40)
    return {
      name,
      n: sorted.length,
      low: inside[0] ?? sorted[0],
      q1,
      median: med,
      q3,
      high: inside[inside.length - 1] ?? sorted[sorted.length - 1],
      outliers,
    }
  })

  groups.sort((a, b) => b.median - a.median)
  const sliced = groups.slice(0, 24)
  return { column, groups: sliced, total: sliced.reduce((sum, group) => sum + group.n, 0) }
}

/** Rank categorical groups by median response time; lower is faster. */
export function responseSpeed(rows: Row[], column: string, groupCol: string): SpeedModel | null {
  if (!column || !groupCol || groupCol === 'none') return null
  const buckets = new Map<string, number[]>()
  for (const row of rows) {
    const value = asNumber(row[column])
    const group = asText(row[groupCol])
    if (value == null || value < 0 || isMissingCategory(group)) continue
    const list = buckets.get(group as string)
    if (list) list.push(value)
    else buckets.set(group as string, [value])
  }
  if (buckets.size === 0) return null

  const ranked = [...buckets.entries()]
    .map(([name, values]) => {
      const sorted = [...values].sort((a, b) => a - b)
      return {
        name,
        n: sorted.length,
        median: quantile(sorted, 0.5),
        average: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
      }
    })
    .sort((a, b) => a.median - b.median || a.average - b.average || a.name.localeCompare(b.name))

  const groups = ranked.slice(0, 24)
  return {
    column,
    groupCol,
    groups,
    hidden: Math.max(0, ranked.length - groups.length),
    total: groups.reduce((sum, group) => sum + group.n, 0),
  }
}

export function barCounts(
  rows: Row[],
  column: string,
  options?: { excludeMissing?: boolean },
): BarModel | null {
  const counts = new Map<string, number>()
  let missing = 0
  for (const row of rows) {
    const text = asText(row[column])
    if (isMissingCategory(text)) {
      missing += 1
      if (options?.excludeMissing) continue
      counts.set(UNASSIGNED_KEY, (counts.get(UNASSIGNED_KEY) ?? 0) + 1)
      continue
    }
    counts.set(text as string, (counts.get(text as string) ?? 0) + 1)
  }
  const items = [...counts.entries()]
    .map(([label, n]) => ({ label, n }))
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label))
  if (items.length === 0) return null
  const total = items.reduce((sum, item) => sum + item.n, 0)
  return {
    column,
    items: items.slice(0, 24),
    hidden: Math.max(0, items.length - 24),
    total,
    missing,
  }
}

function regression(points: { x: number; y: number }[]): { slope: number; intercept: number } {
  const n = points.length
  let sx = 0
  let sy = 0
  let sxx = 0
  let sxy = 0
  for (const point of points) {
    sx += point.x
    sy += point.y
    sxx += point.x * point.x
    sxy += point.x * point.y
  }
  const denominator = n * sxx - sx * sx
  if (denominator === 0) return { slope: 0, intercept: n ? sy / n : 0 }
  const slope = (n * sxy - sx * sy) / denominator
  return { slope, intercept: (sy - slope * sx) / n }
}

export function scatter(rows: Row[], xCol: string, yCol: string): ScatterModel | null {
  const points: { x: number; y: number; index: number }[] = []
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]
    const x = asNumber(row[xCol])
    const y = asNumber(row[yCol])
    if (x == null || y == null) continue
    points.push({ x, y, index })
  }
  if (points.length < 2) return null
  const fit = regression(points)
  const cap = 5000
  const step = points.length > cap ? Math.ceil(points.length / cap) : 1
  const shown = step === 1 ? points : points.filter((_, index) => index % step === 0)
  return {
    xCol,
    yCol,
    points: shown,
    slope: fit.slope,
    intercept: fit.intercept,
    hidden: Math.max(0, points.length - shown.length),
    total: points.length,
  }
}

function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length
  if (n < 2) return null
  let sx = 0
  let sy = 0
  let sxx = 0
  let syy = 0
  let sxy = 0
  for (let i = 0; i < n; i += 1) {
    sx += xs[i]
    sy += ys[i]
    sxx += xs[i] * xs[i]
    syy += ys[i] * ys[i]
    sxy += xs[i] * ys[i]
  }
  const denominator = Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy))
  if (denominator === 0) return null
  return (n * sxy - sx * sy) / denominator
}

export function correlation(rows: Row[], columns: string[]): CorrModel | null {
  const labels = numericColumns(columns, rows)
  if (labels.length < 2) return null
  const series = labels.map((column) => rows.map((row) => asNumber(row[column])))
  const matrix = labels.map((_, rowIndex) =>
    labels.map((__, colIndex) => {
      const xs: number[] = []
      const ys: number[] = []
      for (let i = 0; i < rows.length; i += 1) {
        const x = series[rowIndex][i]
        const y = series[colIndex][i]
        if (x == null || y == null) continue
        xs.push(x)
        ys.push(y)
      }
      return pearson(xs, ys)
    }),
  )
  return { labels, matrix }
}
