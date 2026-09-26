import { useEffect, useState } from 'react'
import type { BoardConfig, CleaningMode, CrewReport, CrewSummaryRow } from '../types'
import { Briefing } from '../components/Briefing'
import { GroupedBars } from '../components/GroupedBars'
import { downloadCsv } from '../lib/download'
import { dateStamp, displayValue, formatDuration, formatInt, shortStage } from '../lib/format'
import { themePalette } from '../lib/theme'

type ChartMode = 'stages' | 'avg' | 'total' | 'weather'

type Props = {
  report: CrewReport
  config: BoardConfig
  mode: CleaningMode
  onMode: (mode: CleaningMode) => void
  onMinJobs: (minJobs: number) => void
  selectedCrew: string | null
  onSelectCrew: (crew: string | null) => void
}

export function CommandView({ report, config, mode, onMode, onMinJobs, selectedCrew, onSelectCrew }: Props) {
  const [chartMode, setChartMode] = useState<ChartMode>('stages')
  const [showTable, setShowTable] = useState(false)
  const [palette, setPalette] = useState(() => themePalette())
  const rows = mode === 'cleaned' ? report.cleaned : report.raw
  const weather = mode === 'cleaned' ? report.weatherCleaned : report.weatherRaw
  const boardJobs = rows.reduce((sum, row) => sum + row.jobs, 0)
  const fastest = rows[0]
  const slowest = rows[rows.length - 1]
  const maxAvg = Math.max(...rows.map((row) => row.avg), 1)

  useEffect(() => {
    const sync = () => setPalette(themePalette())
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

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

  return (
    <div className="command">
      <div className="toolbar">
        <div className="modes" role="group" aria-label="Cleaning mode">
          <button type="button" className={mode === 'cleaned' ? 'mode on' : 'mode'} onClick={() => onMode('cleaned')}>
            <span>Field-cleaned</span>
            <strong>{formatInt(report.counts.cleaned)}</strong>
            <small>batch stamps removed</small>
          </button>
          <button type="button" className={mode === 'raw' ? 'mode on' : 'mode'} onClick={() => onMode('raw')}>
            <span>Raw clocks</span>
            <strong>{formatInt(report.counts.raw)}</strong>
            <small>only negative totals removed</small>
          </button>
        </div>
        <div className="seg" role="group" aria-label="Minimum jobs">
          {[1, 10, 20, 50].map((value) => (
            <button key={value} type="button" aria-pressed={config.minJobs === value} onClick={() => onMinJobs(value)}>
              {value === 1 ? 'Min 1' : `${value}+`}
            </button>
          ))}
        </div>
        <button type="button" className="ghost" onClick={download} disabled={rows.length === 0}>
          Download CSV
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
        />
        <Kpi
          label="Slowest"
          value={rows.length > 1 && slowest ? formatDuration(slowest.avg) : '—'}
          note={rows.length > 1 && slowest ? `${slowest.crew} · ${formatInt(slowest.jobs)} jobs` : 'Needs at least two crews'}
          tone="bad"
        />
        <Kpi
          label="Clock flags"
          value={formatInt(report.flags.length)}
          note={report.flags.length ? 'crew-months over 2 bad jobs' : 'No repeated clock reversals'}
          tone={report.flags.length ? 'warn' : 'good'}
        />
      </section>

      <div className="board">
        <Briefing rows={rows} stageLabels={report.stageLabels} counts={report.counts} mode={mode} />

        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="kicker">Total time</p>
              <h2>Fastest to slowest</h2>
            </div>
            <button type="button" className="text-btn" onClick={() => setShowTable((open) => !open)}>
              {showTable ? 'Hide numbers' : 'Stage numbers'}
            </button>
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
                  onSelect={() => onSelectCrew(selectedCrew === row.crew ? null : row.crew)}
                  rankFast={palette.rankFast}
                  rankSlow={palette.rankSlow}
                />
              ))}
            </div>
          )}
          {showTable && rows.length > 0 && <SummaryTable rows={rows} stageLabels={report.stageLabels} />}
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="kicker">Where the time goes</p>
              <h2>Comparison</h2>
            </div>
          </div>
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
          <ChartBody
            mode={chartMode}
            rows={rows}
            weather={weather}
            stageLabels={report.stageLabels}
            weatherCol={config.weatherCol}
            highlight={selectedCrew}
            palette={palette}
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
          {rows.length > 8 && chartMode !== 'weather' && <p className="hint">Swipe the chart sideways to see every crew.</p>}
        </section>

        <section className="panel span-2">
          <div className="panel-head">
            <div>
              <p className="kicker">Data quality</p>
              <h2>Negative timestamps</h2>
            </div>
          </div>
          <p className="quality-note">
            A job is flagged when any stage, or the total, runs more than 15 minutes backward. Crews below have more than
            two of those jobs in the same month.
          </p>
          {report.flags.length === 0 ? (
            <p className="empty">No crew has more than 2 negative-timestamp jobs in any single month.</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Crew</th>
                    <th>Month</th>
                    <th>Negative jobs</th>
                  </tr>
                </thead>
                <tbody>
                  {report.flags.map((flag) => (
                    <tr key={`${flag.crew}-${flag.month}`}>
                      <td>{flag.crew}</td>
                      <td>{flag.month}</td>
                      <td>{formatInt(flag.jobs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function Kpi({ label, value, note, tone }: { label: string; value: string; note: string; tone?: 'good' | 'bad' | 'warn' }) {
  return (
    <article className={tone ? `kpi ${tone}` : 'kpi'}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  )
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
    <div className={selected ? 'crew-block open' : 'crew-block'}>
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
}: {
  mode: ChartMode
  rows: CrewSummaryRow[]
  weather: CrewReport['weatherCleaned']
  stageLabels: string[]
  weatherCol: string
  highlight: string | null
  palette: ReturnType<typeof themePalette>
}) {
  if (mode === 'weather') {
    if (weatherCol === 'none') return <p className="empty">Pick a breakdown column in Filters. Weather Condition is the usual one.</p>
    if (weather.length === 0) return <p className="empty">No jobs remain for this breakdown.</p>
    return (
      <GroupedBars
        categories={weather.map((item) => displayValue(item.label))}
        series={[{ name: 'Average', color: palette.weather, values: weather.map((item) => item.avg) }]}
      />
    )
  }
  if (rows.length === 0) return <p className="empty">No crews to chart.</p>
  const categories = rows.map((row) => row.crew)
  if (mode === 'total') {
    return (
      <GroupedBars
        categories={categories}
        highlight={highlight}
        series={[{ name: 'Average', color: palette.avg, values: rows.map((row) => row.avg) }]}
      />
    )
  }
  if (mode === 'avg') {
    return (
      <GroupedBars
        categories={categories}
        highlight={highlight}
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
      series={stageLabels.map((label, index) => ({
        name: shortStage(label),
        color: palette.stages[index % palette.stages.length],
        values: rows.map((row) => Math.max(0, row.stageAvgs[index] ?? 0)),
      }))}
    />
  )
}
