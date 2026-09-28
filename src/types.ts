export type Cell = string | number | boolean | null

export type Row = Record<string, Cell>

export type SheetGrid = {
  name: string
  cells: Cell[][]
}

export type Dataset = {
  fileName: string
  sheets: SheetGrid[]
}

/** Inclusive year-month span inferred from timestamp columns (YYYY-MM). */
export type MonthRange = {
  startYm: string | null
  endYm: string | null
}

/**
 * One loaded monthly workbook (or sheet period) on the board.
 * Operators toggle `active` to include/exclude it from comparison.
 */
export type MonthDataset = {
  id: string
  label: string
  fileName: string
  sheets: SheetGrid[]
  sheetName: string
  headerRow: number
  range: MonthRange
  active: boolean
}

export type MonthSnapshot = {
  id: string
  label: string
  fileName: string
  range: MonthRange
  rowCount: number
  report: CrewReport
  assignedJobsByTeam: TeamJobCounts
  includedJobsByTeam: TeamJobCounts
}

export type TeamJobCounts = {
  'in-house': number
  contractor: number
}

export type DataTable = {
  headers: string[]
  rows: Row[]
  headerRow: number
}

export type ChartType = 'bar' | 'speed' | 'hist' | 'box' | 'scatter' | 'corr'

export type CleaningMode = 'cleaned' | 'raw'

export type ViewId = 'command' | 'roster' | 'stats' | 'charts' | 'map'

export type BoardConfig = {
  globalFilterCol: string
  globalFilterVals: string[]
  extraFilterCol: string
  extraFilterVals: string[]
  crewCol: string
  crewNames: string[]
  weatherCol: string
  stageCols: string[]
  minJobs: number
  analysisCols: string[]
  groupCol: string
  chartType: ChartType
  chartCol: string
  scatterX: string
  scatterY: string
}

export type CrewSummaryRow = {
  crew: string
  jobs: number
  avg: number
  median: number
  stageAvgs: number[]
}

export type WeatherRow = {
  label: string
  jobs: number
  avg: number
}

export type FlagRow = {
  crew: string
  month: string
  jobs: number
}

export type CrewCounts = {
  filtered: number
  complete: number
  negative: number
  droppedBatch: number
  droppedOutlierCleaned: number
  droppedOutlierRaw: number
  cleaned: number
  raw: number
}

export type CrewReport = {
  stageLabels: string[]
  cleaned: CrewSummaryRow[]
  raw: CrewSummaryRow[]
  weatherCleaned: WeatherRow[]
  weatherRaw: WeatherRow[]
  flags: FlagRow[]
  counts: CrewCounts
  error: string | null
}
