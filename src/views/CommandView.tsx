import { useEffect, useMemo, useState } from 'react'
import type { BoardConfig, CleaningMode, CrewReport, CrewSummaryRow, FlagRow, MonthSnapshot } from '../types'
import { Briefing } from '../components/Briefing'
import { GroupedBars } from '../components/GroupedBars'
import { downloadCsv } from '../lib/download'
import { dateStamp, displayValue, formatDuration, formatInt, shortStage } from '../lib/format'
import { monthTone, rangeNote } from '../lib/excel'
import { themePalette } from '../lib/theme'
import { downloadMonthlyReport, printMonthlyReport } from '../lib/monthlyReport'
import { Hint, LabelHint } from '../components/Hint'

type ChartMode = 'stages' | 'avg' | 'total' | 'weather'

type Props = {
  report: CrewReport
  config: BoardConfig
  mode: CleaningMode
  onMode: (mode: CleaningMode) => void
  onMinJobs: (minJobs: number) => void
  selectedCrew: string | null
  onSelectCrew: (crew: string | null) => void
  /** Per-active-month reports for side-by-side comparison (1 = single-month mode). */
  monthSnapshots?: MonthSnapshot[]
  periodLabel?: string
}

type Severity = 'critical' | 'high' | 'watch'

function flagSeverity(jobs: number): Severity {
  if (jobs >= 20) return 'critical'
  if (jobs >= 8) return 'high'
  return 'watch'
}

function severityLabel(severity: Severity): string {
  if (severity === 'critical') return 'Critical'
  if (severity === 'high') return 'High'
  return 'Watch'
}

export function CommandView({
  report,
  config,
  mode,
  onMode,
  onMinJobs,
  selectedCrew,
  onSelectCrew,
  monthSnapshots = [],
  periodLabel = 'Current working set',
}: Props) {
  const [chartMode, setChartMode] = useState<ChartMode>('stages')
  const [showTable, setShowTable] = useState(false)
  const [crewQuery, setCrewQuery] = useState('')
  const [palette, setPalette] = useState(() => themePalette())
  const rows = mode === 'cleaned' ? report.cleaned : report.raw
  const weatherRows = mode === 'cleaned' ? report.weatherCleaned : report.weatherRaw
  const boardJobs = rows.reduce((sum, row) => sum + row.jobs, 0)
  const fastest = rows[0]
  const slowest = rows[rows.length - 1]
  const maxAvg = Math.max(...rows.map((row) => row.avg), 1)
  const maxFlag = Math.max(...report.flags.map((flag) => flag.jobs), 1)

  useEffect(() => {
    const sync = () => setPalette(themePalette())
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!selectedCrew) return
    const node = document.getElementById(`crew-${encodeURIComponent(selectedCrew)}`)
    node?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedCrew])

  const outliers = useMemo(() => buildOutliers(rows, report.stageLabels), [rows, report.stageLabels])

  const chartRows = useMemo(() => {
    const q = crewQuery.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((row) => row.crew.toLowerCase().includes(q))
  }, [rows, crewQuery])

  function toggleCrew(crew: string) {
    onSelectCrew(selectedCrew === crew ? null : crew)
  }

  function download() {
    const headers = [
      config.crewCol || 'Crew',
      'Jobs',
      'AvgTotalMin',
      'MedianTotalMin',
      ...report.stageLabels.map((label) => `Avg_${label}`),
    ]
    const records = rows.map((row) => {
      const record: Record<string, string | number> = {
        [config.crewCol || 'Crew']: row.crew,
        Jobs: row.jobs,
        AvgTotalMin: row.avg,
        MedianTotalMin: row.median,
      }
      report.stageLabels.forEach((label, index) => {
        record[`Avg_${label}`] = row.stageAvgs[index]
      })
      return record
    })
    const suffix = mode === 'raw' ? 'raw_' : ''
    downloadCsv(`crew_comparison_${suffix}${dateStamp()}.csv`, headers, records)
  }

  const selectedRow = selectedCrew ? rows.find((row) => row.crew === selectedCrew) ?? null : null

  return (
    <div className="command">
      <div className="toolbar">
        <div className="modes-block">
          <p className="toolbar-tip-row">
            <LabelHint tip="fieldCleaned" label="About field-cleaned mode">
              Field-cleaned
            </LabelHint>
            <span className="tip-sep">·</span>
            <LabelHint tip="rawClocks" label="About raw clocks mode">
              Raw clocks
            </LabelHint>
          </p>
          <div className="modes" role="group" aria-label="Cleaning mode">
            <button type="button" className={mode === 'cleaned' ? 'mode on' : 'mode'} onClick={() => onMode('cleaned')}>
              <span>Field-cleaned</span>
              <strong>{formatInt(report.counts.cleaned)}</strong>
              <small>short completions removed</small>
            </button>
            <button type="button" className={mode === 'raw' ? 'mode on' : 'mode'} onClick={() => onMode('raw')}>
              <span>Raw clocks</span>
              <strong>{formatInt(report.counts.raw)}</strong>
              <small>only negative totals removed</small>
            </button>
          </div>
          <div className="sample-floor">
            <div className="sample-floor-copy">
              <LabelHint tip="minJobs" label="About sample floor">
                Sample floor
              </LabelHint>
              <span className="sample-floor-note">Hide crews below this job count</span>
            </div>
            <div className="sample-floor-pills" role="group" aria-label="Sample floor">
              {[1, 10, 20, 50].map((value) => (
                <button
                  key={value}
                  type="button"
                  className={config.minJobs === value ? 'sample-pill on' : 'sample-pill'}
                  aria-pressed={config.minJobs === value}
                  onClick={() => onMinJobs(value)}
                >
                  {value === 1 ? 'Any' : `${value}+`}
                </button>
              ))}
            </div>
          </div>
        </div>
        <button type="button" className="ghost" onClick={() => downloadMonthlyReport(periodLabel, report, config, mode)}>
          Monthly report
        </button>
        <button type="button" className="solid" onClick={() => printMonthlyReport(periodLabel, report, config, mode)}>
          Print / Save PDF
        </button>
      </div>

      {report.error && <p className="banner">{report.error}</p>}

      <section className="kpis" aria-label="Board metrics">
        <Kpi label="Jobs on board" value={formatInt(boardJobs)} note="After the minimum-jobs cut" />
        <Kpi label="Crews" value={formatInt(rows.length)} note="Ranked on this board" />
        <Kpi
          label="Fastest"
          value={fastest ? formatDuration(fastest.avg) : '—'}
          note={fastest ? `${fastest.crew} · ${formatInt(fastest.jobs)} jobs` : 'No crew in view'}
          tone="good"
          onClick={fastest ? () => toggleCrew(fastest.crew) : undefined}
          active={fastest != null && selectedCrew === fastest.crew}
        />
        <Kpi
          label="Slowest"
          value={rows.length > 1 && slowest ? formatDuration(slowest.avg) : '—'}
          note={rows.length > 1 && slowest ? `${slowest.crew} · ${formatInt(slowest.jobs)} jobs` : 'Needs at least two crews'}
          tone="bad"
          onClick={rows.length > 1 && slowest ? () => toggleCrew(slowest.crew) : undefined}
          active={slowest != null && selectedCrew === slowest.crew}
        />
        <Kpi
          label="Clock flags"
          value={formatInt(report.flags.length)}
          note={report.flags.length ? 'crew-months over 2 bad jobs' : 'No repeated clock reversals'}
          tone={report.flags.length ? 'warn' : 'good'}
        />
      </section>

      {monthSnapshots.length > 1 && (
        <MonthComparePanel snapshots={monthSnapshots} mode={mode} selectedCrew={selectedCrew} onSelectCrew={onSelectCrew} />
      )}

      <div className="board">
        <Briefing
          rows={rows}
          stageLabels={report.stageLabels}
          counts={report.counts}
          mode={mode}
          flagCount={report.flags.length}
          selectedCrew={selectedCrew}
          onSelectCrew={onSelectCrew}
        />

        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="kicker">Total time</p>
              <h2>Fastest to slowest</h2>
            </div>
            <div className="panel-actions">
              <button type="button" className="text-btn" onClick={() => setShowTable((open) => !open)}>
                {showTable ? 'Hide numbers' : 'Stage numbers'}
              </button>
              <button type="button" className="text-btn" onClick={download} disabled={rows.length === 0}>
                Export CSV
              </button>
            </div>
          </div>
          {rows.length === 0 ? (
            <p className="empty">Nothing to rank with these filters.</p>
          ) : (
            <div className="rank-scroll">
              {rows.map((row, index) => (
                <CrewRow
                  key={row.crew}
                  row={row}
                  index={index}
                  count={rows.length}
                  maxAvg={maxAvg}
                  stageLabels={report.stageLabels}
                  selected={selectedCrew === row.crew}
                  onSelect={() => toggleCrew(row.crew)}
                  rankFast={palette.rankFast}
                  rankSlow={palette.rankSlow}
                />
              ))}
            </div>
          )}
          {showTable && rows.length > 0 && <SummaryTable rows={rows} stageLabels={report.stageLabels} />}
        </section>

        <section className="panel comparison-panel">
          <div className="panel-head">
            <div>
              <p className="kicker">Where the time goes</p>
              <h2>Comparison</h2>
            </div>
          </div>

          <div className="comparison-tools">
            <div className="seg chart-seg" role="group" aria-label="Chart">
              {(
                [
                  ['stages', 'Stages'],
                  ['avg', 'Avg vs median'],
                  ['total', 'Total'],
                  ['weather', 'Weather'],
                ] as const
              ).map(([id, label]) => (
                <button key={id} type="button" aria-pressed={chartMode === id} onClick={() => setChartMode(id)}>
                  {label}
                </button>
              ))}
            </div>
            {chartMode !== 'weather' && rows.length > 0 && (
              <div className="comparison-find">
                <label className="crew-search inline">
                  <span className="visually-hidden">Find crew</span>
                  <input
                    type="search"
                    value={crewQuery}
                    placeholder="Find crew…"
                    onChange={(event) => setCrewQuery(event.target.value)}
                    aria-label="Find crew"
                  />
                </label>
                {selectedCrew && (
                  <button type="button" className="text-btn" onClick={() => onSelectCrew(null)}>
                    Clear
                  </button>
                )}
              </div>
            )}
          </div>
          {chartMode === 'avg' && (
            <p className="toolbar-tip-row" style={{ marginTop: 0 }}>
              <LabelHint tip="avgVsMedian" label="About average vs median">
                Why avg vs median
              </LabelHint>
            </p>
          )}

          {chartMode !== 'weather' && rows.length > 0 && (
            <div className="outlier-strip" aria-label="Outliers">
              {outliers.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`outlier-tile ${item.tone}${selectedCrew === item.crew ? ' on' : ''}`}
                  onClick={() => toggleCrew(item.crew)}
                  title={`${item.label}${item.detail ? ` · ${item.detail}` : ''} · ${item.crew} · ${item.value}`}
                >
                  <span className="outlier-kicker">{item.label}</span>
                  {item.detail && <span className="outlier-detail">{item.detail}</span>}
                  <strong className="outlier-crew">{item.crew}</strong>
                  <em className="outlier-value">{item.value}</em>
                </button>
              ))}
            </div>
          )}

          {selectedRow && chartMode !== 'weather' && (
            <FocusCard row={selectedRow} stageLabels={report.stageLabels} onClear={() => onSelectCrew(null)} />
          )}

          <ChartBody
            mode={chartMode}
            rows={chartRows}
            weather={weatherRows}
            stageLabels={report.stageLabels}
            weatherCol={config.weatherCol}
            highlight={selectedCrew}
            palette={palette}
            onSelectCrew={toggleCrew}
          />

          {chartMode === 'stages' && (
            <div className="legend">
              {report.stageLabels.map((label, index) => (
                <span key={label}>
                  <i style={{ background: palette.stages[index % palette.stages.length] }} />
                  {shortStage(label)}
                </span>
              ))}
            </div>
          )}
          {chartMode === 'avg' && (
            <div className="legend">
              <span>
                <i style={{ background: palette.avg }} />
                Average
              </span>
              <span>
                <i style={{ background: palette.median }} />
                Median
              </span>
            </div>
          )}
          {chartMode !== 'weather' && chartRows.length > 10 && (
            <p className="hint">Scroll the instrument — tap a bar or outlier chip to focus that crew on the ranking.</p>
          )}
        </section>

        <section className="panel span-2 quality-panel">
          <div className="panel-head">
            <div>
              <p className="kicker">
                <LabelHint tip="qualityFlags" label="About data-quality flags">
                  Data quality
                </LabelHint>
              </p>
              <h2>Negative timestamps</h2>
            </div>
            {report.flags.length > 0 && (
              <div className="severity-legend" aria-hidden="true">
                <span className="sev critical">Critical ≥20</span>
                <span className="sev high">High ≥8</span>
                <span className="sev watch">Watch</span>
              </div>
            )}
          </div>

          <p className="quality-callout">
            <strong>
              Flag rule <Hint tip="negativeRule" label="About the −15 minute rule" />
            </strong>
            <span>
              Stage or total runs &gt;15 min backward · listed when a crew has &gt;2 of those jobs in one month
            </span>
          </p>

          {report.flags.length === 0 ? (
            <p className="empty">No crew has more than 2 negative-timestamp jobs in any single month.</p>
          ) : (
            <div className="quality-grid" role="list">
              {report.flags.map((flag) => (
                <FlagCard
                  key={`${flag.crew}-${flag.month}`}
                  flag={flag}
                  maxJobs={maxFlag}
                  selected={selectedCrew === flag.crew}
                  onSelect={() => toggleCrew(flag.crew)}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function MonthComparePanel({
  snapshots,
  mode,
  selectedCrew,
  onSelectCrew,
}: {
  snapshots: MonthSnapshot[]
  mode: CleaningMode
  selectedCrew: string | null
  onSelectCrew: (crew: string | null) => void
}) {
  const crewRows = useMemo(() => buildCrewMonthMatrix(snapshots, mode), [snapshots, mode])

  return (
    <section className="panel month-compare" aria-label="Month comparison">
      <div className="panel-head">
        <div>
          <p className="kicker">Month to month</p>
          <h2>Compare periods</h2>
        </div>
        <span className="hint" style={{ margin: 0 }}>
          {snapshots.length} months active
        </span>
      </div>

      <div className="month-compare-grid">
        {snapshots.map((snap, index) => {
          const rows = mode === 'cleaned' ? snap.report.cleaned : snap.report.raw
          const jobs = rows.reduce((sum, row) => sum + row.jobs, 0)
          const fastest = rows[0]
          const slowest = rows[rows.length - 1]
          return (
            <article
              key={snap.id}
              className="month-card"
              style={{ ['--month-tone' as string]: monthTone(index) }}
            >
              <div className="month-card-head">
                <strong>{snap.label}</strong>
                <span>{rangeNote(snap.range)}</span>
              </div>
              <div className="month-card-metrics">
                <p>
                  <span>Jobs</span>
                  <b>{formatInt(jobs)}</b>
                </p>
                <p>
                  <span>Crews</span>
                  <b>{formatInt(rows.length)}</b>
                </p>
                <p className="good">
                  <span>Fastest</span>
                  <b>{fastest ? formatDuration(fastest.avg) : '—'}</b>
                </p>
                <p className="bad">
                  <span>Slowest</span>
                  <b>{rows.length > 1 && slowest ? formatDuration(slowest.avg) : '—'}</b>
                </p>
                <p>
                  <span>Flags</span>
                  <b>{formatInt(snap.report.flags.length)}</b>
                </p>
              </div>
              {fastest && (
                <button type="button" className="text-btn" onClick={() => onSelectCrew(fastest.crew)}>
                  Focus {fastest.crew}
                </button>
              )}
            </article>
          )
        })}
      </div>

      {crewRows.length > 0 && snapshots.length >= 2 && (
        <div className="table-scroll">
          <table className="crew-month-table">
            <thead>
              <tr>
                <th>Crew</th>
                {snapshots.map((snap) => (
                  <th key={snap.id} className="num">
                    {snap.label}
                  </th>
                ))}
                <th className="num">Δ first→last</th>
              </tr>
            </thead>
            <tbody>
              {crewRows.slice(0, 24).map((row) => {
                const first = row.avgs[0]
                const last = row.avgs[row.avgs.length - 1]
                const delta = first != null && last != null ? last - first : null
                return (
                  <tr key={row.crew} className={selectedCrew === row.crew ? 'crew-hit' : undefined}>
                    <td>
                      <button type="button" className="crew-link" onClick={() => onSelectCrew(row.crew)}>
                        {row.crew}
                      </button>
                    </td>
                    {row.avgs.map((avg, index) => (
                      <td key={snapshots[index]?.id ?? index} className="num">
                        {avg == null ? '—' : formatDuration(avg)}
                      </td>
                    ))}
                    <td className="num">
                      {delta == null ? (
                        '—'
                      ) : (
                        <span className={`month-delta ${delta > 0.5 ? 'up' : delta < -0.5 ? 'down' : 'flat'}`}>
                          {delta > 0 ? '+' : ''}
                          {delta.toFixed(1)}m
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function buildCrewMonthMatrix(snapshots: MonthSnapshot[], mode: CleaningMode) {
  const crews = new Map<string, (number | null)[]>()
  snapshots.forEach((snap, index) => {
    const rows = mode === 'cleaned' ? snap.report.cleaned : snap.report.raw
    const byCrew = new Map(rows.map((row) => [row.crew, row.avg]))
    const allCrews = new Set([...crews.keys(), ...byCrew.keys()])
    for (const crew of allCrews) {
      const list = crews.get(crew) ?? Array.from({ length: snapshots.length }, () => null)
      list[index] = byCrew.get(crew) ?? null
      crews.set(crew, list)
    }
  })
  return [...crews.entries()]
    .map(([crew, avgs]) => ({ crew, avgs }))
    .filter((row) => row.avgs.filter((v) => v != null).length >= 2)
    .sort((a, b) => {
      const aAvg = meanDefined(a.avgs)
      const bAvg = meanDefined(b.avgs)
      return aAvg - bAvg
    })
}

function meanDefined(values: (number | null)[]): number {
  const nums = values.filter((v): v is number => v != null)
  if (nums.length === 0) return Number.POSITIVE_INFINITY
  return nums.reduce((sum, v) => sum + v, 0) / nums.length
}

function Kpi({
  label,
  value,
  note,
  tone,
  onClick,
  active,
}: {
  label: string
  value: string
  note: string
  tone?: 'good' | 'bad' | 'warn'
  onClick?: () => void
  active?: boolean
}) {
  const className = [tone ? `kpi ${tone}` : 'kpi', onClick ? 'kpi-action' : '', active ? 'on' : '']
    .filter(Boolean)
    .join(' ')
  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick}>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{note}</small>
      </button>
    )
  }
  return (
    <article className={className}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  )
}

function FlagCard({
  flag,
  maxJobs,
  selected,
  onSelect,
}: {
  flag: FlagRow
  maxJobs: number
  selected: boolean
  onSelect: () => void
}) {
  const severity = flagSeverity(flag.jobs)
  const width = Math.max(8, (flag.jobs / maxJobs) * 100)
  return (
    <button
      type="button"
      role="listitem"
      className={`flag-card ${severity}${selected ? ' on' : ''}`}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <div className="flag-card-top">
        <em className={`sev-badge ${severity}`}>{severityLabel(severity)}</em>
        <strong className="flag-count">{formatInt(flag.jobs)}</strong>
      </div>
      <p className="flag-crew">{flag.crew}</p>
      <p className="flag-month">{flag.month}</p>
      <span className="flag-track" aria-hidden="true">
        <span className={`flag-fill ${severity}`} style={{ width: `${width}%` }} />
      </span>
      <span className="flag-action">{selected ? 'Focused on board' : 'Tap to focus crew'}</span>
    </button>
  )
}

function FocusCard({
  row,
  stageLabels,
  onClear,
}: {
  row: CrewSummaryRow
  stageLabels: string[]
  onClear: () => void
}) {
  const skewed = row.jobs >= 5 && row.median > 0 && row.avg > row.median * 1.4
  const skewRatio = row.median > 0 ? row.avg / row.median : 0
  let bottleneck = 0
  let bottleneckVal = -Infinity
  row.stageAvgs.forEach((value, index) => {
    if (value > bottleneckVal) {
      bottleneckVal = value
      bottleneck = index
    }
  })
  const maxStage = Math.max(...row.stageAvgs, 1)

  return (
    <div className="focus-card">
      <div className="focus-card-head">
        <div>
          <p className="insight-label">Crew focus</p>
          <p className="insight-title">{row.crew}</p>
        </div>
        <button type="button" className="text-btn" onClick={onClear}>
          Clear
        </button>
      </div>
      <div className="metric-row">
        <div className="metric-chip">
          <span>Avg</span>
          <strong>{formatDuration(row.avg)}</strong>
        </div>
        <div className="metric-chip">
          <span>Median</span>
          <strong>{formatDuration(row.median)}</strong>
        </div>
        <div className="metric-chip">
          <span>Jobs</span>
          <strong>{formatInt(row.jobs)}</strong>
        </div>
        {skewed && (
          <div className="metric-chip warn-chip">
            <span>Skew</span>
            <strong>{skewRatio.toFixed(1)}× med</strong>
          </div>
        )}
      </div>
      {stageLabels.length > 0 && (
        <div className="focus-stages">
          <p className="insight-label">
            Stage split · heaviest {shortStage(stageLabels[bottleneck])}
          </p>
          {stageLabels.map((label, index) => (
            <div key={label} className="focus-stage-row">
              <span>{shortStage(label)}</span>
              <span className="flag-track">
                <span
                  className="flag-fill stage"
                  style={{ width: `${Math.max(4, (row.stageAvgs[index] / maxStage) * 100)}%` }}
                />
              </span>
              <strong>{row.stageAvgs[index].toFixed(1)}m</strong>
            </div>
          ))}
        </div>
      )}
      {skewed && (
        <p className="focus-callout">Long-job skew — average pulled up by a long tail past the median.</p>
      )}
      {row.jobs < 20 && (
        <p className="focus-callout">Thin sample — fewer than 20 jobs; treat rank as indicative.</p>
      )}
    </div>
  )
}

type Outlier = {
  key: string
  label: string
  detail?: string
  crew: string
  value: string
  tone: 'good' | 'bad' | 'warn' | 'neutral'
}

function buildOutliers(rows: CrewSummaryRow[], stageLabels: string[]): Outlier[] {
  if (rows.length === 0) return []
  const fastest = rows[0]
  const slowest = rows[rows.length - 1]
  const items: Outlier[] = [
    {
      key: 'fast',
      label: 'Fastest',
      crew: fastest.crew,
      value: formatDuration(fastest.avg),
      tone: 'good',
    },
  ]
  if (rows.length > 1) {
    items.push({
      key: 'slow',
      label: 'Slowest',
      crew: slowest.crew,
      value: formatDuration(slowest.avg),
      tone: 'bad',
    })
  }

  let skewCrew = fastest
  let skewGap = -Infinity
  for (const row of rows) {
    if (row.jobs < 5 || row.median <= 0) continue
    const gap = row.avg - row.median
    if (gap > skewGap) {
      skewGap = gap
      skewCrew = row
    }
  }
  if (skewGap > 0 && skewCrew.median > 0) {
    items.push({
      key: 'skew',
      label: 'Biggest skew',
      detail: `avg ${formatDuration(skewCrew.avg)} · med ${formatDuration(skewCrew.median)}`,
      crew: skewCrew.crew,
      value: `+${formatDuration(skewGap)}`,
      tone: 'warn',
    })
  }

  if (stageLabels.length > 0 && rows.length > 0) {
    let stageIndex = 0
    let stageCrew = rows[0]
    let stageVal = -Infinity
    for (const row of rows) {
      row.stageAvgs.forEach((value, index) => {
        if (value > stageVal) {
          stageVal = value
          stageIndex = index
          stageCrew = row
        }
      })
    }
    if (stageVal > 0) {
      items.push({
        key: 'stage',
        label: 'Bottleneck',
        detail: shortStage(stageLabels[stageIndex]),
        crew: stageCrew.crew,
        value: formatDuration(stageVal),
        tone: 'neutral',
      })
    }
  }

  return items
}

function CrewRow({
  row,
  index,
  count,
  maxAvg,
  stageLabels,
  selected,
  onSelect,
  rankFast,
  rankSlow,
}: {
  row: CrewSummaryRow
  index: number
  count: number
  maxAvg: number
  stageLabels: string[]
  selected: boolean
  onSelect: () => void
  rankFast: string
  rankSlow: string
}) {
  const thin = row.jobs < 20
  const skewed = row.jobs >= 5 && row.median > 0 && row.avg > row.median * 1.4
  return (
    <div className={selected ? 'crew-block open' : 'crew-block'} id={`crew-${encodeURIComponent(row.crew)}`}>
      <button type="button" className="crew-row" onClick={onSelect}>
        <em>{String(index + 1).padStart(2, '0')}</em>
        <div>
          <strong>{row.crew}</strong>
          <span className="bar-track">
            <span
              className="bar-fill"
              style={{ width: `${Math.max(4, (row.avg / maxAvg) * 100)}%`, background: rankColor(index, count, rankFast, rankSlow) }}
            />
          </span>
          <small>
            avg {formatDuration(row.avg)} · med {formatDuration(row.median)} · {formatInt(row.jobs)}{' '}
            {row.jobs === 1 ? 'job' : 'jobs'}
          </small>
          {(thin || skewed) && (
            <span className="crew-tags">
              {thin && <span className="tag warn">Thin sample</span>}
              {skewed && <span className="tag warn">Long-job skew</span>}
            </span>
          )}
        </div>
        <b>{formatDuration(row.avg)}</b>
      </button>
      {selected && (
        <div className="crew-detail">
          {stageLabels.map((label, stageIndex) => (
            <p key={label}>
              <span>{shortStage(label)}</span>
              <strong>{row.stageAvgs[stageIndex].toFixed(1)} min</strong>
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

function rankColor(index: number, count: number, fast: string, slow: string): string {
  const t = count <= 1 ? 0 : index / (count - 1)
  const a = parseRgb(fast)
  const b = parseRgb(slow)
  if (!a || !b) return fast
  const r = Math.round(a.r + (b.r - a.r) * t)
  const g = Math.round(a.g + (b.g - a.g) * t)
  const bl = Math.round(a.b + (b.b - a.b) * t)
  return `rgb(${r}, ${g}, ${bl})`
}

function parseRgb(color: string): { r: number; g: number; b: number } | null {
  const hex = color.trim()
  if (hex.startsWith('#') && (hex.length === 7 || hex.length === 4)) {
    const full =
      hex.length === 4
        ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
        : hex
    return {
      r: Number.parseInt(full.slice(1, 3), 16),
      g: Number.parseInt(full.slice(3, 5), 16),
      b: Number.parseInt(full.slice(5, 7), 16),
    }
  }
  const match = hex.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
  if (!match) return null
  return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]) }
}

function SummaryTable({ rows, stageLabels }: { rows: CrewSummaryRow[]; stageLabels: string[] }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Crew</th>
            <th>Jobs</th>
            <th>Avg</th>
            <th>Median</th>
            {stageLabels.map((label) => (
              <th key={label}>{shortStage(label)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.crew}>
              <td>{row.crew}</td>
              <td>{formatInt(row.jobs)}</td>
              <td>{row.avg.toFixed(1)}</td>
              <td>{row.median.toFixed(1)}</td>
              {row.stageAvgs.map((value, index) => (
                <td key={stageLabels[index]}>{value.toFixed(1)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ChartBody({
  mode,
  rows,
  weather,
  stageLabels,
  weatherCol,
  highlight,
  palette,
  onSelectCrew,
}: {
  mode: ChartMode
  rows: CrewSummaryRow[]
  weather: CrewReport['weatherCleaned']
  stageLabels: string[]
  weatherCol: string
  highlight: string | null
  palette: ReturnType<typeof themePalette>
  onSelectCrew: (crew: string) => void
}) {
  if (mode === 'weather') {
    if (weatherCol === 'none') return <p className="empty">Pick a breakdown column in Setup. Weather Condition is the usual one.</p>
    if (weather.length === 0) return <p className="empty">No jobs remain for this breakdown.</p>
    return (
      <GroupedBars
        categories={weather.map((item) => displayValue(item.label))}
        series={[{ name: 'Average', color: palette.weather, values: weather.map((item) => item.avg) }]}
        selectable={false}
      />
    )
  }
  if (rows.length === 0) return <p className="empty">No crews match this search.</p>
  const categories = rows.map((row) => row.crew)
  if (mode === 'total') {
    return (
      <GroupedBars
        categories={categories}
        highlight={highlight}
        onSelect={onSelectCrew}
        series={[{ name: 'Average', color: palette.avg, values: rows.map((row) => row.avg) }]}
      />
    )
  }
  if (mode === 'avg') {
    return (
      <GroupedBars
        categories={categories}
        highlight={highlight}
        onSelect={onSelectCrew}
        series={[
          { name: 'Average', color: palette.avg, values: rows.map((row) => row.avg) },
          { name: 'Median', color: palette.median, values: rows.map((row) => row.median) },
        ]}
      />
    )
  }
  return (
    <GroupedBars
      categories={categories}
      highlight={highlight}
      onSelect={onSelectCrew}
      series={stageLabels.map((label, index) => ({
        name: shortStage(label),
        color: palette.stages[index % palette.stages.length],
        values: rows.map((row) => Math.max(0, row.stageAvgs[index] ?? 0)),
      }))}
    />
  )
}
