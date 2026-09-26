import type { Row } from '../types'
import { minutesBetween, parseFlexibleDatetime } from './datetime'
import { shortEndpoint } from './format'

export const TOTAL_MINUTES = 'Total minutes'

export type TimingEnrichment = {
  headers: string[]
  rows: Row[]
  numericTiming: string[]
  stageGaps: string[]
}

/**
 * Add computed response-time columns from ordered stage timestamps so Charts
 * can run Density / Range / Field / Links on a sheet that is otherwise categorical.
 */
export function enrichRowsWithTiming(headers: string[] | undefined, rows: Row[], stageCols: string[]): TimingEnrichment {
  const stages = stageCols.filter((column, index) => stageCols.indexOf(column) === index && headers?.includes(column))
  if (stages.length < 2) {
    return { headers: headers ?? [], rows, numericTiming: [], stageGaps: [] }
  }

  const stageGaps = stages.slice(0, -1).map((column, index) => {
    const from = shortEndpoint(column)
    const to = shortEndpoint(stages[index + 1])
    return `${from} → ${to} (min)`
  })
  const numericTiming = [TOTAL_MINUTES, ...stageGaps]
  const nextHeaders = [...(headers ?? [])]
  for (const name of numericTiming) {
    if (!nextHeaders.includes(name)) nextHeaders.push(name)
  }

  const nextRows = rows.map((row) => {
    const times = stages.map((column) => parseFlexibleDatetime(row[column]))
    const out: Row = { ...row }
    if (times.some((time) => time == null)) {
      out[TOTAL_MINUTES] = null
      for (const gap of stageGaps) out[gap] = null
      return out
    }
    const stamped = times as Date[]
    out[TOTAL_MINUTES] = minutesBetween(stamped[stamped.length - 1], stamped[0])
    for (let i = 0; i < stageGaps.length; i += 1) {
      out[stageGaps[i]] = minutesBetween(stamped[i + 1], stamped[i])
    }
    return out
  })

  return { headers: nextHeaders, rows: nextRows, numericTiming, stageGaps }
}
