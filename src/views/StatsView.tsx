import type { BoardConfig, Row } from '../types'
import { descriptiveStats } from '../lib/stats'
import { categoricalColumns, numericColumns } from '../lib/rows'
import { dateStamp, formatInt } from '../lib/format'
import { downloadCsv } from '../lib/download'

type Props = {
  headers: string[]
  rows: Row[]
  config: BoardConfig
  onChange: (patch: Partial<BoardConfig>) => void
}

export function StatsView({ headers, rows, config, onChange }: Props) {
  const numeric = numericColumns(headers, rows)
  const categorical = categoricalColumns(headers, rows)
  const stats = descriptiveStats(rows, config.analysisCols, config.groupCol)

  function toggleColumn(column: string) {
    const next = config.analysisCols.includes(column)
      ? config.analysisCols.filter((item) => item !== column)
      : [...config.analysisCols, column]
    onChange({ analysisCols: next })
  }

  function download() {
    if (stats.grouped) {
      const headersOut = Object.keys(stats.grouped[0] ?? {})
      downloadCsv(`descriptive_stats_${dateStamp()}.csv`, headersOut, stats.grouped)
      return
    }
    const numericRows = stats.numeric.map((row) => ({ ...row, Type: 'Numeric' }))
    const categoricalRows = stats.categorical.map((row) => ({ ...row, Type: 'Categorical' }))
    const combined = [...numericRows, ...categoricalRows]
    const headersOut = [...new Set(combined.flatMap((row) => Object.keys(row)))]
    downloadCsv(`descriptive_stats_${dateStamp()}.csv`, headersOut, combined)
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <p className="kicker">Descriptive stats</p>
          <h2>{formatInt(rows.length)} jobs in view</h2>
        </div>
        <button type="button" className="ghost" onClick={download} disabled={config.analysisCols.length === 0}>
          Download CSV
        </button>
      </div>
      <p className="hint">Tap the fields to include. Response times are on the command board — this sheet’s source columns are mostly categories.</p>
      <div className="chip-wrap">
        {headers.map((header) => (
          <button
            key={header}
            type="button"
            className={config.analysisCols.includes(header) ? 'chip on' : 'chip'}
            onClick={() => toggleColumn(header)}
            aria-pressed={config.analysisCols.includes(header)}
          >
            {header}
          </button>
        ))}
      </div>
      {numeric.length > 0 && (
        <label className="field inline-field">
          <span>Group by</span>
          <select value={config.groupCol} onChange={(event) => onChange({ groupCol: event.target.value })}>
            <option value="none">None</option>
            {categorical.map((column) => (
              <option key={column} value={column}>
                {column}
              </option>
            ))}
          </select>
        </label>
      )}
      {stats.grouped && <DataTable rows={stats.grouped} />}
      {!stats.grouped && stats.numeric.length > 0 && <DataTable rows={stats.numeric} />}
      {!stats.grouped && stats.categorical.length > 0 && <DataTable rows={stats.categorical} />}
      {!stats.grouped && stats.numeric.length === 0 && stats.categorical.length === 0 && (
        <p className="empty">Pick at least one column.</p>
      )}
    </section>
  )
}

function DataTable({ rows }: { rows: Record<string, string | number | null>[] }) {
  const headers = Object.keys(rows[0] ?? {})
  if (headers.length === 0) return null
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {headers.map((header) => (
                <td key={header}>{row[header] == null || row[header] === '' ? '—' : String(row[header])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
