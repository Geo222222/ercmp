import type { BoardConfig, CrewCounts, CrewReport, CrewSummaryRow, FlagRow, Row, WeatherRow } from '../types'
import { formatYearMonth, minutesBetween, parseFlexibleDatetime } from './datetime'
import { roundTo } from './format'
import { asText } from './rows'

const NEGATIVE_THRESHOLD_MIN = -15
const COMPLETION_GAP_LIMIT_MIN = 15
const MIN_ENROUTE_COMPLETION_MIN = 5
const OUTLIER_QUANTILE = 0.99

type Job = {
  crew: string
  weather: string | null
  month: string
  stages: number[]
  total: number
  negative: boolean
}

function mean(values: number[]): number {
  if (values.length === 0) return NaN
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function median(values: number[]): number {
  if (values.length === 0) return NaN
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid]
  return (sorted[mid - 1] + sorted[mid]) / 2
}

/** R's default quantile, type 7. */
export function quantile(values: number[], probability: number): number {
  if (values.length === 0) return NaN
  const sorted = [...values].sort((a, b) => a - b)
  const n = sorted.length
  const h = 1 + (n - 1) * probability
  const lower = Math.floor(h)
  const upper = Math.ceil(h)
  if (lower <= 0) return sorted[0]
  if (upper >= n && lower >= n) return sorted[n - 1]
  if (lower === upper) return sorted[lower - 1]
  return sorted[lower - 1] + (h - lower) * (sorted[upper - 1] - sorted[lower - 1])
}

function summarize(jobs: Job[], stageCount: number, minJobs: number): CrewSummaryRow[] {
  const groups = new Map<string, Job[]>()
  for (const job of jobs) {
    const list = groups.get(job.crew)
    if (list) list.push(job)
    else groups.set(job.crew, [job])
  }

  const rows: CrewSummaryRow[] = []
  for (const [crew, list] of groups) {
    if (list.length < minJobs) continue
    const totals = list.map((job) => job.total)
    rows.push({
      crew,
      jobs: list.length,
      avg: roundTo(mean(totals), 1),
      median: roundTo(median(totals), 1),
      stageAvgs: Array.from({ length: stageCount }, (_, index) =>
        roundTo(mean(list.map((job) => job.stages[index])), 1),
      ),
    })
  }

  rows.sort((a, b) => a.avg - b.avg)
  return rows
}

function weatherSummary(jobs: Job[]): WeatherRow[] {
  const groups = new Map<string, number[]>()
  for (const job of jobs) {
    const label = job.weather ?? 'Unassigned'
    const list = groups.get(label)
    if (list) list.push(job.total)
    else groups.set(label, [job.total])
  }
  return [...groups.entries()]
    .map(([label, totals]) => ({
      label,
      jobs: totals.length,
      avg: roundTo(mean(totals), 1),
    }))
    .sort((a, b) => a.avg - b.avg)
}

function trimOutliers(jobs: Job[]): { kept: Job[]; dropped: number } {
  if (jobs.length === 0) return { kept: jobs, dropped: 0 }
  const cutoff = quantile(jobs.map((job) => job.total), OUTLIER_QUANTILE)
  const kept = jobs.filter((job) => job.total <= cutoff)
  return { kept, dropped: jobs.length - kept.length }
}

function emptyCounts(): CrewCounts {
  return {
    filtered: 0,
    complete: 0,
    negative: 0,
    droppedBatch: 0,
    droppedOutlierCleaned: 0,
    droppedOutlierRaw: 0,
    cleaned: 0,
    raw: 0,
  }
}

export function buildCrewReport(rows: Row[], config: BoardConfig): CrewReport {
  const stageCols = config.stageCols.filter((column, index) => config.stageCols.indexOf(column) === index)
  const base: Omit<CrewReport, 'error' | 'counts'> = {
    stageLabels: [],
    cleaned: [],
    raw: [],
    weatherCleaned: [],
    weatherRaw: [],
    flags: [],
  }

  if (!config.crewCol || stageCols.length < 2) {
    return {
      ...base,
      counts: emptyCounts(),
      error: 'Pick at least two timestamp columns, earliest stage first.',
    }
  }

  let filtered = rows
  if (config.crewNames.length > 0) {
    const allowed = new Set(config.crewNames)
    filtered = rows.filter((row) => {
      const crew = asText(row[config.crewCol])
      return crew != null && allowed.has(crew)
    })
  }

  const stageLabels = stageCols.slice(0, -1).map((column, index) => `${column} -> ${stageCols[index + 1]}`)
  const jobs: Job[] = []

  for (const row of filtered) {
    const times = stageCols.map((column) => parseFlexibleDatetime(row[column]))
    if (times.some((time) => time == null)) continue
    const stamped = times as Date[]
    const stages = stamped.slice(0, -1).map((time, index) => minutesBetween(stamped[index + 1], time))
    const total = minutesBetween(stamped[stamped.length - 1], stamped[0])
    const actualColumn = Object.keys(row).find((column) => /actual\s*comp/i.test(column))
    const finalColumn = Object.keys(row).find((column) => /final\s*comp/i.test(column))
    const actual = actualColumn ? parseFlexibleDatetime(row[actualColumn]) : null
    const final = finalColumn ? parseFlexibleDatetime(row[finalColumn]) : null
    const completionGap = actual && final ? Math.abs(minutesBetween(final, actual)) : null
    const completionGapNegative = completionGap != null && completionGap > COMPLETION_GAP_LIMIT_MIN
    const negative = stages.some((minutes) => minutes < NEGATIVE_THRESHOLD_MIN) || total < NEGATIVE_THRESHOLD_MIN || completionGapNegative
    const weather = config.weatherCol !== 'none' ? asText(row[config.weatherCol]) : null
    jobs.push({
      crew: asText(row[config.crewCol]) ?? 'Unknown',
      weather,
      month: formatYearMonth(stamped[0]),
      stages,
      total,
      negative,
    })
  }

  const negativeJobs = jobs.filter((job) => job.negative)
  const flagGroups = new Map<string, FlagRow>()
  for (const job of negativeJobs) {
    const key = `${job.crew}\0${job.month}`
    const existing = flagGroups.get(key)
    if (existing) existing.jobs += 1
    else flagGroups.set(key, { crew: job.crew, month: job.month, jobs: 1 })
  }
  const flags = [...flagGroups.values()].filter((flag) => flag.jobs > 2).sort((a, b) => b.jobs - a.jobs)

  const withoutNegative = jobs.filter((job) => !job.negative)
  const afterBatch =
    stageLabels.length >= 3
      ? jobs.filter((job) => job.stages.slice(2).reduce((sum, minutes) => sum + minutes, 0) >= MIN_ENROUTE_COMPLETION_MIN)
      : jobs
  const cleanedTrim = { kept: afterBatch, dropped: 0 }

  const rawBase = jobs.filter((job) => job.total >= 0)
  const rawTrim = trimOutliers(rawBase)

  return {
    stageLabels,
    cleaned: summarize(cleanedTrim.kept, stageLabels.length, config.minJobs),
    raw: summarize(rawTrim.kept, stageLabels.length, config.minJobs),
    weatherCleaned: weatherSummary(cleanedTrim.kept),
    weatherRaw: weatherSummary(rawTrim.kept),
    flags,
    counts: {
      filtered: filtered.length,
      complete: jobs.length,
      negative: negativeJobs.length,
      droppedBatch: withoutNegative.length - afterBatch.length,
      droppedOutlierCleaned: cleanedTrim.dropped,
      droppedOutlierRaw: rawTrim.dropped,
      cleaned: cleanedTrim.kept.length,
      raw: rawTrim.kept.length,
    },
    error: null,
  }
}
