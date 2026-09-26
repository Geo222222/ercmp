import type { BoardConfig, DataTable } from '../types'
import { categoricalColumns, numericColumns } from './rows'

function firstMatch(headers: string[], patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const hit = headers.find((header) => pattern.test(header))
    if (hit) return hit
  }
  return null
}

function defaultStages(headers: string[]): string[] {
  const patterns = [/assigned time/i, /acknowle/i, /enroute/i, /on-?site/i, /actual comp/i]
  const stages: string[] = []
  for (const pattern of patterns) {
    const hit = headers.find((header) => pattern.test(header) && !stages.includes(header))
    if (hit) stages.push(hit)
  }
  return stages
}

export function defaultConfig(table: DataTable): BoardConfig {
  const { headers, rows } = table
  const numeric = numericColumns(headers, rows)
  const categorical = categoricalColumns(headers, rows)
  const parish = firstMatch(headers, [/^parish$/i, /parish|region|area/i])
  const jobType = firstMatch(headers, [/^job type$/i, /job type/i])
  const crew = firstMatch(headers, [/^crew$/i, /\bcrew\b/i, /team/i, /technician/i]) ?? headers[0] ?? ''
  const weather = firstMatch(headers, [/^weather condition$/i, /weather/i])
  const preferredAnalysis = ['Parish', 'Crew', 'Job Type', 'Weather Condition'].filter((name) =>
    headers.includes(name),
  )
  const analysisCols = numeric.length > 0 ? numeric : preferredAnalysis.length > 0 ? preferredAnalysis : headers.slice(0, 4)
  const chartCol = headers.includes('Parish') ? 'Parish' : (categorical[0] ?? headers[0] ?? '')

  return {
    globalFilterCol: parish ?? 'none',
    globalFilterVals: [],
    extraFilterCol: jobType ?? 'none',
    extraFilterVals: [],
    crewCol: crew,
    crewNames: [],
    weatherCol: weather ?? 'none',
    stageCols: defaultStages(headers),
    minJobs: 1,
    analysisCols,
    groupCol: 'none',
    chartType: 'bar',
    chartCol,
    scatterX: numeric[0] ?? '',
    scatterY: numeric[1] ?? numeric[0] ?? '',
  }
}
