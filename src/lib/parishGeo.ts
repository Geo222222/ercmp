/**
 * Jamaica parish geography helpers for the Map / Universe board.
 *
 * Spreadsheet values (JPS-style regions) are mapped onto geoBoundaries ADM1
 * parish polygons. See PARISH_NAME_MAP below.
 *
 * Source GeoJSON: public/geo/jamaica-parishes.geojson
 * (geoBoundaries JAM ADM1 simplified, OSM / Wambacher, CC BY-SA 2.0)
 */

import type { BoardConfig, CleaningMode, CrewReport, Row } from '../types'
import { minutesBetween, parseFlexibleDatetime } from './datetime'
import { displayValue, roundTo } from './format'
import { asText } from './rows'

/** Canonical parish polygon ids (match GeoJSON `properties.id`). */
export const GEO_PARISH_IDS = [
  'Kingston',
  'St. Andrew',
  'St. Thomas',
  'Portland',
  'St. Mary',
  'St. Ann',
  'Trelawny',
  'St. James',
  'Hanover',
  'Westmoreland',
  'St. Elizabeth',
  'Manchester',
  'Clarendon',
  'St. Catherine',
] as const

export type GeoParishId = (typeof GEO_PARISH_IDS)[number]

/**
 * Spreadsheet Parish → geo polygon id.
 *
 * | Spreadsheet     | Polygon        | Notes                                      |
 * |-----------------|----------------|--------------------------------------------|
 * | KSAN            | Kingston       | Kingston & St. Andrew North (approx.)      |
 * | KSAS            | St. Andrew     | Kingston & St. Andrew South (approx.)      |
 * | Portmore        | St. Catherine  | Municipality inside St. Catherine          |
 * | St.Catherine    | St. Catherine  | Dotless / compacted spelling               |
 * | St.James        | St. James      |                                            |
 * | St.Ann          | St. Ann        |                                            |
 * | St.Mary         | St. Mary       |                                            |
 * | St.Elizabeth    | St. Elizabeth  |                                            |
 * | St.Thomas       | St. Thomas     |                                            |
 * | Clarendon       | Clarendon      |                                            |
 * | Manchester      | Manchester     |                                            |
 * | Westmoreland    | Westmoreland   |                                            |
 * | Hanover         | Hanover        |                                            |
 * | Portland        | Portland       |                                            |
 * | Trelawny        | Trelawny       |                                            |
 * | null / empty    | (unassigned)   | No polygon — unmatched bucket              |
 */
export const PARISH_NAME_MAP: Record<string, GeoParishId> = {
  KSAN: 'Kingston',
  KSAS: 'St. Andrew',
  Portmore: 'St. Catherine',
  'St.Catherine': 'St. Catherine',
  'St. Catherine': 'St. Catherine',
  'Saint Catherine': 'St. Catherine',
  'St.James': 'St. James',
  'St. James': 'St. James',
  'Saint James': 'St. James',
  'St.Ann': 'St. Ann',
  'St. Ann': 'St. Ann',
  'Saint Ann': 'St. Ann',
  'St.Mary': 'St. Mary',
  'St. Mary': 'St. Mary',
  'Saint Mary': 'St. Mary',
  'St.Elizabeth': 'St. Elizabeth',
  'St. Elizabeth': 'St. Elizabeth',
  'Saint Elizabeth': 'St. Elizabeth',
  'St.Thomas': 'St. Thomas',
  'St. Thomas': 'St. Thomas',
  'Saint Thomas': 'St. Thomas',
  'St.Andrew': 'St. Andrew',
  'St. Andrew': 'St. Andrew',
  'Saint Andrew': 'St. Andrew',
  Kingston: 'Kingston',
  Clarendon: 'Clarendon',
  Manchester: 'Manchester',
  Westmoreland: 'Westmoreland',
  Hanover: 'Hanover',
  Portland: 'Portland',
  Trelawny: 'Trelawny',
}

export type ParishMetric = 'jobs' | 'avg'

export type ParishCrewPulse = {
  crew: string
  jobs: number
  avg: number
}

export type ParishSignal = {
  id: GeoParishId
  /** Spreadsheet labels that roll into this polygon. */
  sources: string[]
  jobs: number
  share: number
  avg: number | null
  crews: ParishCrewPulse[]
  negativeJobs: number
  completeJobs: number
}

export type UnmatchedParish = {
  label: string
  jobs: number
}

export type ParishUniverse = {
  totalJobs: number
  signals: ParishSignal[]
  byId: Map<GeoParishId, ParishSignal>
  unmatched: UnmatchedParish[]
  maxJobs: number
  maxAvg: number
}

export type GeoJsonParish = {
  type: 'FeatureCollection'
  features: Array<{
    type: 'Feature'
    properties: { id: string; name: string; shapeName?: string; shapeISO?: string }
    geometry: { type: string; coordinates: unknown }
  }>
  attribution?: string
}

function normalizeKey(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
}

/** Resolve a spreadsheet parish cell to a geo polygon id, or null if unassigned/unknown. */
export function resolveParishId(raw: string | null | undefined): GeoParishId | null {
  if (raw == null) return null
  const text = normalizeKey(String(raw))
  if (!text || /^null$/i.test(text)) return null
  const direct = PARISH_NAME_MAP[text]
  if (direct) return direct
  const compact = text.replace(/\s+/g, '')
  const compactHit = PARISH_NAME_MAP[compact]
  if (compactHit) return compactHit
  const lowered = text.toLowerCase()
  for (const [key, id] of Object.entries(PARISH_NAME_MAP)) {
    if (key.toLowerCase() === lowered) return id
  }
  for (const id of GEO_PARISH_IDS) {
    if (id.toLowerCase() === lowered) return id
    if (id.replace(/\./g, '').toLowerCase() === compact.toLowerCase()) return id
  }
  return null
}

export function parishColumn(headers: string[], config: BoardConfig): string {
  if (config.globalFilterCol && config.globalFilterCol !== 'none' && /parish/i.test(config.globalFilterCol)) {
    return config.globalFilterCol
  }
  return headers.find((h) => /^parish$/i.test(h)) ?? headers.find((h) => /parish|region|area/i.test(h)) ?? ''
}

function mean(values: number[]): number {
  if (values.length === 0) return NaN
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

function jobTiming(row: Row, stageCols: string[]): { total: number; negative: boolean } | null {
  if (stageCols.length < 2) return null
  const times = stageCols.map((column) => parseFlexibleDatetime(row[column]))
  if (times.some((t) => t == null)) return null
  const stamped = times as Date[]
  const stages = stamped.slice(0, -1).map((time, index) => minutesBetween(stamped[index + 1], time))
  const total = minutesBetween(stamped[stamped.length - 1], stamped[0])
  const negative = stages.some((m) => m < -15) || total < -15
  return { total, negative }
}

/**
 * Aggregate working rows onto parish polygons + unmatched bucket.
 * Uses the same working set the rest of the board sees (caller passes filtered rows).
 */
export function buildParishUniverse(rows: Row[], config: BoardConfig, parishCol: string): ParishUniverse {
  const stageCols = config.stageCols.filter((column, index) => config.stageCols.indexOf(column) === index)
  const buckets = new Map<
    GeoParishId,
    { sources: Map<string, number>; totals: number[]; crews: Map<string, number[]>; negative: number; complete: number }
  >()
  const unmatchedMap = new Map<string, number>()

  for (const id of GEO_PARISH_IDS) {
    buckets.set(id, { sources: new Map(), totals: [], crews: new Map(), negative: 0, complete: 0 })
  }

  for (const row of rows) {
    const raw = parishCol ? asText(row[parishCol]) : null
    const label = displayValue(raw ?? 'Unassigned')
    const geoId = resolveParishId(raw)
    if (!geoId) {
      unmatchedMap.set(label, (unmatchedMap.get(label) ?? 0) + 1)
      continue
    }
    const bucket = buckets.get(geoId)!
    const sourceKey = raw && !/^null$/i.test(String(raw).trim()) ? String(raw).trim() : label
    bucket.sources.set(sourceKey, (bucket.sources.get(sourceKey) ?? 0) + 1)

    const crew = asText(row[config.crewCol]) ?? 'Unknown'
    const timing = jobTiming(row, stageCols)
    if (timing) {
      bucket.complete += 1
      if (timing.negative) bucket.negative += 1
      else {
        bucket.totals.push(timing.total)
        const list = bucket.crews.get(crew)
        if (list) list.push(timing.total)
        else bucket.crews.set(crew, [timing.total])
      }
    } else {
      const list = bucket.crews.get(crew)
      if (list) list.push(NaN)
      else bucket.crews.set(crew, [NaN])
    }
  }

  const totalJobs = rows.length
  const signals: ParishSignal[] = []

  for (const id of GEO_PARISH_IDS) {
    const bucket = buckets.get(id)!
    const jobs = [...bucket.sources.values()].reduce((a, b) => a + b, 0)
    const finiteTotals = bucket.totals.filter((v) => Number.isFinite(v))
    const crews: ParishCrewPulse[] = [...bucket.crews.entries()]
      .map(([crew, totals]) => {
        const finite = totals.filter((v) => Number.isFinite(v))
        return {
          crew,
          jobs: totals.length,
          avg: finite.length > 0 ? roundTo(mean(finite), 1) : NaN,
        }
      })
      .sort((a, b) => {
        const aAvg = Number.isFinite(a.avg) ? a.avg : Number.POSITIVE_INFINITY
        const bAvg = Number.isFinite(b.avg) ? b.avg : Number.POSITIVE_INFINITY
        return aAvg - bAvg || b.jobs - a.jobs
      })

    signals.push({
      id,
      sources: [...bucket.sources.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name),
      jobs,
      share: totalJobs > 0 ? jobs / totalJobs : 0,
      avg: finiteTotals.length > 0 ? roundTo(mean(finiteTotals), 1) : null,
      crews,
      negativeJobs: bucket.negative,
      completeJobs: bucket.complete,
    })
  }

  signals.sort((a, b) => b.jobs - a.jobs || a.id.localeCompare(b.id))

  const unmatched = [...unmatchedMap.entries()]
    .map(([label, jobs]) => ({ label, jobs }))
    .sort((a, b) => b.jobs - a.jobs || a.label.localeCompare(b.label))

  const withJobs = signals.filter((s) => s.jobs > 0)
  const maxJobs = Math.max(...withJobs.map((s) => s.jobs), 1)
  const avgs = withJobs.map((s) => s.avg).filter((v): v is number => v != null && Number.isFinite(v))
  const maxAvg = Math.max(...avgs, 1)

  return {
    totalJobs,
    signals,
    byId: new Map(signals.map((s) => [s.id, s])),
    unmatched,
    maxJobs,
    maxAvg,
  }
}

/** Spreadsheet values to feed Scope / global parish filter for a polygon. */
export function scopeValuesForParish(signal: ParishSignal): string[] {
  return signal.sources.length > 0 ? signal.sources : [signal.id]
}

export function metricValue(signal: ParishSignal, metric: ParishMetric): number {
  if (metric === 'jobs') return signal.jobs
  return signal.avg ?? 0
}

/** 0–1 intensity for choropleth fill. Higher jobs = hotter; higher avg = slower = hotter. */
export function metricIntensity(signal: ParishSignal, metric: ParishMetric, universe: ParishUniverse): number {
  if (signal.jobs <= 0) return 0
  if (metric === 'jobs') return Math.min(1, signal.jobs / universe.maxJobs)
  if (signal.avg == null || !Number.isFinite(signal.avg)) return 0
  return Math.min(1, signal.avg / universe.maxAvg)
}

export function islandPulse(
  report: CrewReport | null,
  mode: CleaningMode,
): { fastest: string | null; slowest: string | null; flags: number; cleaned: number; raw: number } {
  if (!report) return { fastest: null, slowest: null, flags: 0, cleaned: 0, raw: 0 }
  const rows = mode === 'cleaned' ? report.cleaned : report.raw
  return {
    fastest: rows[0]?.crew ?? null,
    slowest: rows.length > 0 ? rows[rows.length - 1]?.crew ?? null : null,
    flags: report.flags.length,
    cleaned: report.counts.cleaned,
    raw: report.counts.raw,
  }
}

/** Jamaica approximate bounding box for SVG / map fit. */
export const JAMAICA_BOUNDS = {
  west: -78.4,
  south: 17.68,
  east: -76.17,
  north: 18.55,
} as const

export const JAMAICA_CENTER = { lat: 18.11, lng: -77.3 } as const
