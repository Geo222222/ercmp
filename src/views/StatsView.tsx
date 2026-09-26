import { useMemo, useState } from 'react'
import type { BoardConfig, Row } from '../types'
import { descriptiveStats, fieldBreakdown, topShares, type CategoricalSummary, type NumericSummary, type ValueShare } from '../lib/stats'
import { categoricalColumns, numericColumns } from '../lib/rows'
import { dateStamp, displayValue, formatInt } from '../lib/format'
import { downloadCsv } from '../lib/download'
import './StatsView.css'

type Props = {
  headers: string[]
  rows: Row[]
  config: BoardConfig
  onChange: (patch: Partial<BoardConfig>) => void
  /** Optional period label when multi-month boards land. */
  monthLabel?: string
}

export function StatsView({ headers, rows, config, onChange, monthLabel }: Props) {
  const [selectedField, setSelectedField] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(true)

  const numeric = useMemo(() => numericColumns(headers, rows), [headers, rows])
  const categorical = useMemo(() => categoricalColumns(headers, rows), [headers, rows])
  const stats = useMemo(
    () => descriptiveStats(rows, config.analysisCols, config.groupCol),
    [rows, config.analysisCols, config.groupCol],
  )

  const selectedSet = useMemo(() => new Set(config.analysisCols), [config.analysisCols])
  const activeField =
    selectedField && selectedSet.has(selectedField) ? selectedField : (config.analysisCols[0] ?? null)

  const breakdown = useMemo(
    () => (activeField ? fieldBreakdown(rows, activeField) : null),
    [rows, activeField],
  )

  const numericSet = useMemo(() => new Set(numeric), [numeric])

  const sparkByField = useMemo(() => {
    const map = new Map<string, ValueShare[]>()
    for (const column of config.analysisCols) {
      if (numericSet.has(column)) continue
      map.set(column, topShares(rows, column, 4))
    }
    return map
  }, [rows, config.analysisCols, numericSet])

  function toggleColumn(column: string) {
    const next = config.analysisCols.includes(column)
      ? config.analysisCols.filter((item) => item !== column)
      : [...config.analysisCols, column]
    onChange({ analysisCols: next })
    if (selectedField === column && !next.includes(column)) setSelectedField(null)
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

  function focusValue(column: string, value: string) {
    if (column === config.globalFilterCol) {
      onChange({ globalFilterVals: [value] })
      return
    }
    onChange({ extraFilterCol: column, extraFilterVals: [value] })
  }

  function clearValueFocus(column: string) {
    if (column === config.globalFilterCol) {
      onChange({ globalFilterVals: [] })
      return
    }
    if (column === config.extraFilterCol) {
      onChange({ extraFilterVals: [] })
    }
  }

  function isValueFocused(column: string, value: string): boolean {
    if (column === config.globalFilterCol) {
      return config.globalFilterVals.length === 1 && config.globalFilterVals[0] === value
    }
    return (
      column === config.extraFilterCol &&
      config.extraFilterVals.length === 1 &&
      config.extraFilterVals[0] === value
    )
  }

  const hasInstruments =
    Boolean(stats.grouped) || stats.numeric.length > 0 || stats.categorical.length > 0

  return (
    <section className="panel stats-view">
      <div className="panel-head">
        <div>
          <p className="kicker">Field story</p>
          <h2>{formatInt(rows.length)} jobs in view</h2>
          {monthLabel && <p className="stats-month">{monthLabel}</p>}
        </div>
        <button type="button" className="ghost" onClick={download} disabled={config.analysisCols.length === 0}>
          Download CSV
        </button>
      </div>

      <p className="stats-lede">
        Share and dominance for the categories in view. Response times live on the Command board — this sheet’s
        source columns are mostly categories.
      </p>

      <div className="stats-picker">
        <button
          type="button"
          className="stats-picker-toggle"
          aria-expanded={pickerOpen}
          onClick={() => setPickerOpen((open) => !open)}
        >
          <span>Fields to include</span>
          <strong>
            {config.analysisCols.length}/{headers.length}
          </strong>
        </button>
        {pickerOpen && (
          <div className="chip-wrap stats-chips" role="group" aria-label="Analysis fields">
            {headers.map((header) => (
              <button
                key={header}
                type="button"
                className={selectedSet.has(header) ? 'chip on' : 'chip'}
                onClick={() => toggleColumn(header)}
                aria-pressed={selectedSet.has(header)}
              >
                {header}
              </button>
            ))}
          </div>
        )}
      </div>

      {numeric.length > 0 && config.analysisCols.some((col) => numeric.includes(col)) && (
        <label className="field inline-field stats-group">
          <span>Group numeric by</span>
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

      {!hasInstruments && <p className="empty">Pick at least one column to open the instruments.</p>}

      {stats.grouped && (
        <div className="stats-grouped">
          <p className="stats-section-label">Grouped numeric summary</p>
          <DataTable rows={stats.grouped} />
        </div>
      )}

      {!stats.grouped && (stats.categorical.length > 0 || stats.numeric.length > 0) && (
        <div className="stats-layout">
          <div className="stats-instruments" role="list">
            {stats.categorical.map((summary) => (
              <CategoricalInstrument
                key={summary.Variable}
                summary={summary}
                sparks={sparkByField.get(summary.Variable) ?? []}
                active={activeField === summary.Variable}
                totalRows={rows.length}
                onSelect={() => setSelectedField(summary.Variable)}
              />
            ))}
            {stats.numeric.map((summary) => (
              <NumericInstrument
                key={summary.Variable}
                summary={summary}
                active={activeField === summary.Variable}
                onSelect={() => setSelectedField(summary.Variable)}
              />
            ))}
          </div>

          {activeField && breakdown && (
            <aside className="stats-breakdown" aria-live="polite">
              <div className="stats-breakdown-head">
                <div>
                  <p className="insight-label">Value breakdown</p>
                  <h3>{activeField}</h3>
                </div>
                <p className="stats-breakdown-meta">
                  {formatInt(breakdown.n)} present
                  {breakdown.missing > 0 ? ` · ${formatInt(breakdown.missing)} missing` : ''}
                  {` · ${formatInt(breakdown.unique)} unique`}
                </p>
              </div>
              <p className="hint stats-breakdown-hint">Tap a value to focus the board filters on that slice.</p>
              <ul className="stats-value-list">
                {breakdown.values.map((item) => {
                  const focused = isValueFocused(activeField, item.value)
                  return (
                    <li key={item.value}>
                      <button
                        type="button"
                        className={focused ? 'stats-value-row on' : 'stats-value-row'}
                        onClick={() => (focused ? clearValueFocus(activeField) : focusValue(activeField, item.value))}
                        aria-pressed={focused}
                      >
                        <span className="stats-value-label">{displayValue(item.value)}</span>
                        <span className="stats-value-nums">
                          <strong>{formatInt(item.count)}</strong>
                          <em>{pct(item.share)}</em>
                        </span>
                        <span className="stats-share-track" aria-hidden="true">
                          <i style={{ width: `${Math.max(item.share * 100, item.count > 0 ? 1.5 : 0)}%` }} />
                        </span>
                        <span className="stats-value-action">{focused ? 'Focused · tap to clear' : 'Focus board'}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
              {breakdown.hidden > 0 && (
                <p className="hint">+{formatInt(breakdown.hidden)} more values not shown</p>
              )}
            </aside>
          )}

          {activeField && !breakdown && stats.numeric.some((row) => row.Variable === activeField) && (
            <aside className="stats-breakdown">
              <div className="stats-breakdown-head">
                <div>
                  <p className="insight-label">Numeric field</p>
                  <h3>{activeField}</h3>
                </div>
              </div>
              <p className="hint">
                Distribution detail for measured columns belongs with Charts. Response-time stages stay on Command.
              </p>
              {stats.numeric
                .filter((row) => row.Variable === activeField)
                .map((row) => (
                  <NumericDetail key={row.Variable} summary={row} />
                ))}
            </aside>
          )}
        </div>
      )}
    </section>
  )
}

function CategoricalInstrument({
  summary,
  sparks,
  active,
  totalRows,
  onSelect,
}: {
  summary: CategoricalSummary
  sparks: ValueShare[]
  active: boolean
  totalRows: number
  onSelect: () => void
}) {
  const dominance = summary.TopShare ?? 0
  const missingShare = totalRows > 0 ? summary.Missing / totalRows : 0
  return (
    <button
      type="button"
      role="listitem"
      className={active ? 'stats-instrument on' : 'stats-instrument'}
      onClick={onSelect}
      aria-pressed={active}
    >
      <div className="stats-instrument-top">
        <span className="stats-instrument-name">{summary.Variable}</span>
        <span className="stats-instrument-unique">{formatInt(summary.UniqueValues)} unique</span>
      </div>

      <div className="stats-dominance">
        <div className="stats-dominance-copy">
          <span className="stats-dominance-label">Most frequent</span>
          <strong>{summary.MostFrequent ? displayValue(summary.MostFrequent) : '—'}</strong>
        </div>
        <em>{pct(dominance)}</em>
      </div>
      <span className="stats-share-track stats-dominance-bar" aria-hidden="true">
        <i style={{ width: `${Math.max(dominance * 100, dominance > 0 ? 2 : 0)}%` }} />
      </span>

      <div className="stats-spark" aria-hidden="true">
        {sparks.map((item) => (
          <span key={item.value} className="stats-spark-row">
            <span className="stats-spark-label">{displayValue(item.value)}</span>
            <span className="stats-share-track">
              <i style={{ width: `${Math.max(item.share * 100, 1.5)}%` }} />
            </span>
          </span>
        ))}
      </div>

      <div className="stats-instrument-foot">
        <span>
          N <strong>{formatInt(summary.N)}</strong>
        </span>
        <span className={summary.Missing > 0 ? 'warn-miss' : undefined}>
          Miss <strong>{formatInt(summary.Missing)}</strong>
          {missingShare > 0 ? ` (${pct(missingShare)})` : ''}
        </span>
        <span className="stats-dive">Dive in</span>
      </div>
    </button>
  )
}

function NumericInstrument({
  summary,
  active,
  onSelect,
}: {
  summary: NumericSummary
  active: boolean
  onSelect: () => void
}) {
  const min = summary.Min
  const max = summary.Max
  const median = summary.Median
  const span = min != null && max != null && max > min ? max - min : null
  const medianPct = span != null && median != null ? ((median - (min as number)) / span) * 100 : 50

  return (
    <button
      type="button"
      role="listitem"
      className={active ? 'stats-instrument numeric on' : 'stats-instrument numeric'}
      onClick={onSelect}
      aria-pressed={active}
    >
      <div className="stats-instrument-top">
        <span className="stats-instrument-name">{summary.Variable}</span>
        <span className="stats-instrument-unique">Numeric</span>
      </div>
      <div className="stats-dominance">
        <div className="stats-dominance-copy">
          <span className="stats-dominance-label">Median</span>
          <strong>{fmtNum(summary.Median)}</strong>
        </div>
        <em>μ {fmtNum(summary.Mean)}</em>
      </div>
      <span className="stats-range-track" aria-hidden="true">
        <i className="stats-range-fill" />
        <i className="stats-range-median" style={{ left: `${medianPct}%` }} />
      </span>
      <div className="stats-instrument-foot">
        <span>
          N <strong>{formatInt(summary.N)}</strong>
        </span>
        <span>
          Range <strong>{fmtNum(summary.Min)}–{fmtNum(summary.Max)}</strong>
        </span>
        <span className={summary.Missing > 0 ? 'warn-miss' : undefined}>
          Miss <strong>{formatInt(summary.Missing)}</strong>
        </span>
      </div>
    </button>
  )
}

function NumericDetail({ summary }: { summary: NumericSummary }) {
  return (
    <dl className="stats-numeric-detail">
      <div>
        <dt>N</dt>
        <dd>{formatInt(summary.N)}</dd>
      </div>
      <div>
        <dt>Missing</dt>
        <dd>{formatInt(summary.Missing)}</dd>
      </div>
      <div>
        <dt>Mean</dt>
        <dd>{fmtNum(summary.Mean)}</dd>
      </div>
      <div>
        <dt>SD</dt>
        <dd>{fmtNum(summary.SD)}</dd>
      </div>
      <div>
        <dt>Min</dt>
        <dd>{fmtNum(summary.Min)}</dd>
      </div>
      <div>
        <dt>Q1</dt>
        <dd>{fmtNum(summary.Q1)}</dd>
      </div>
      <div>
        <dt>Median</dt>
        <dd>{fmtNum(summary.Median)}</dd>
      </div>
      <div>
        <dt>Q3</dt>
        <dd>{fmtNum(summary.Q3)}</dd>
      </div>
      <div>
        <dt>Max</dt>
        <dd>{fmtNum(summary.Max)}</dd>
      </div>
    </dl>
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

function pct(share: number): string {
  if (!Number.isFinite(share) || share <= 0) return '0%'
  if (share >= 0.995) return '100%'
  if (share < 0.01) return '<1%'
  return `${Math.round(share * 100)}%`
}

function fmtNum(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return String(value)
}
