import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { buildCrewReport } from '../src/lib/crew'
import { defaultConfig } from '../src/lib/defaults'
import { guessHeaderRow, parseWorkbook, tableFromGrid } from '../src/lib/excel'
import { parseFlexibleDatetime } from '../src/lib/datetime'

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error('FAIL', message)
    process.exitCode = 1
    return
  }
  console.log('ok', message)
}

const workbookPath = fileURLToPath(new URL('../JUNE - KSA.xlsx', import.meta.url))
const dataset = parseWorkbook(readFileSync(workbookPath), 'JUNE - KSA.xlsx')
const sheet = dataset.sheets[0]
const headerRow = guessHeaderRow(sheet.cells)
const table = tableFromGrid(sheet, headerRow)
const config = defaultConfig(table)
const report = buildCrewReport(table.rows, config)

console.log({
  headerRow,
  headers: table.headers,
  rows: table.rows.length,
  stages: config.stageCols,
  counts: report.counts,
  crews: report.cleaned.length,
  fastest: report.cleaned[0],
  slowest: report.cleaned[report.cleaned.length - 1],
  flags: report.flags.length,
})

assert(headerRow === 3, `header row ${headerRow}`)
assert(table.rows.length === 10061, `row count ${table.rows.length}`)
assert(config.globalFilterVals.join(' | ') === 'St.Thomas | KSAN | KSAS', `default parishes ${config.globalFilterVals.join(' | ')}`)
assert(config.minJobs === 20, `minimum jobs ${config.minJobs}`)
assert(config.stageCols.join(' | ') === 'Assigned Time | Acknowlege Time | Enroute Time | On-Site Time | Actual Comp. Time', config.stageCols.join(' | '))
assert(report.counts.complete === 10038, `complete ${report.counts.complete}`)
assert(report.counts.negative === 365, `negative ${report.counts.negative}`)
assert(report.counts.droppedBatch === 8691, `batch ${report.counts.droppedBatch}`)
assert(report.counts.cleaned === 972, `cleaned ${report.counts.cleaned}`)
assert(report.counts.droppedOutlierCleaned === 10, `cleaned outliers ${report.counts.droppedOutlierCleaned}`)
assert(report.counts.raw === 9793, `raw ${report.counts.raw}`)
assert(report.counts.droppedOutlierRaw === 99, `raw outliers ${report.counts.droppedOutlierRaw}`)
assert(report.flags.length === 23, `flags ${report.flags.length}`)
assert(report.flags[0]?.crew === 'Swon Miller' && report.flags[0]?.jobs === 52, `top flag ${report.flags[0]?.crew} ${report.flags[0]?.jobs}`)
assert(report.cleaned[0]?.crew === 'Tyrese Williams' && report.cleaned[0]?.avg === 231 && report.cleaned[0]?.jobs === 52, `fastest ${report.cleaned[0]?.crew} ${report.cleaned[0]?.avg}`)
assert(report.cleaned.at(-1)?.crew === 'Hopeton Henry' && report.cleaned.at(-1)?.avg === 620, `slowest ${report.cleaned.at(-1)?.crew} ${report.cleaned.at(-1)?.avg}`)

const parsed = parseFlexibleDatetime('Jul 31, 2026 11:58pm')
assert(parsed?.getFullYear() === 2026 && parsed.getMonth() === 6 && parsed.getDate() === 31 && parsed.getHours() === 23 && parsed.getMinutes() === 58, 'datetime parse')

if (process.exitCode) {
  process.exit(process.exitCode)
}
console.log('all checks passed')
