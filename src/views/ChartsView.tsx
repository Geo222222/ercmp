import { useEffect, useMemo, useRef, useState, type ReactNode, type TouchEvent } from 'react'
import type { BoardConfig, ChartType, Row } from '../types'
import { BarChart, BoxChart, CorrChart, HistogramChart, ScatterChart } from '../components/StatCharts'
import { Hint } from '../components/Hint'
import {
  barCounts,
  boxplot,
  categoryLabel,
  correlation,
  histogram,
  isMissingCategory,
  sampleJobHints,
  scatter,
  UNASSIGNED_KEY,
  type BarModel,
  type BoxModel,
  type CorrModel,
  type HistModel,
  type ScatterModel,
} from '../lib/stats'
import type { HelpKey } from '../lib/helpCopy'
import { asNumber, asText, categoricalColumns, numericColumns } from '../lib/rows'
import { enrichRowsWithTiming, TOTAL_MINUTES } from '../lib/chartMetrics'
import { dateStamp, formatInt } from '../lib/format'
import { downloadSvgAsPng } from '../lib/download'
import { themePalette } from '../lib/theme'
import './ChartsView.css'

const TYPES: { id: ChartType; label: string; signal: string; tip: HelpKey; blurb: string }[] = [
  {
    id: 'bar',
    label: 'Share',
    signal: 'Arc + ranking',
    tip: 'chartsShare',
    blurb: 'Who owns the volume — parish, crew, weather, and the long tail.',
  },
  {
    id: 'hist',
    label: 'Density',
    signal: 'Signal silhouette',
    tip: 'chartsDensity',
    blurb: 'How response times (or any numeric) spread across the board.',
  },
  {
    id: 'box',
    label: 'Range',
    signal: 'Tower spread',
    tip: 'chartsRange',
    blurb: 'Median, IQR, and outliers by group — where clocks get weird.',
  },
  {
    id: 'scatter',
    label: 'Field',
    signal: 'Constellation',
    tip: 'chartsField',
    blurb: 'Two clock measures against each other — stage vs stage, or total vs a gap.',
  },
  {
    id: 'corr',
    label: 'Links',
    signal: 'Pearson matrix',
    tip: 'chartsLinks',
    blurb: 'Which timing stages move together across jobs.',
  },
]

type Props = {
  headers: string[]
  rows: Row[]
  config: BoardConfig
  onChange: (patch: Partial<BoardConfig>) => void
  periodLabel?: string
}

type FocusState = {
  title: string
  subtitle: string
  count: number | null
  share: number | null
  samples: string[]
  detail?: string
  countLabel?: string
  shareLabel?: string
}

export function ChartsView({ headers, rows, config, onChange, periodLabel }: Props) {
  const frame = useRef<HTMLDivElement>(null)
  const touchX = useRef<number | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [excludeMissing, setExcludeMissing] = useState(false)
  const [paletteTick, setPaletteTick] = useState(0)

  const timing = useMemo(
    () => enrichRowsWithTiming(headers, rows, config.stageCols),
    [headers, rows, config.stageCols],
  )
  const chartHeaders = timing.headers
  const chartRows = timing.rows
  const numeric = numericColumns(chartHeaders, chartRows)
  const categorical = categoricalColumns(chartHeaders, chartRows)
  const modeIndex = Math.max(0, TYPES.findIndex((type) => type.id === config.chartType))
  const activeType = TYPES[modeIndex] ?? TYPES[0]

  useEffect(() => {
    const sync = () => setPaletteTick((tick) => tick + 1)
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    setSelected(null)
  }, [config.chartType, config.chartCol, config.groupCol, config.scatterX, config.scatterY, excludeMissing])

  // Keep controls pointed at usable columns when the carousel lands on a mode.
  useEffect(() => {
    const patch = defaultsForMode(config.chartType, {
      categorical,
      numeric,
      timingNumeric: timing.numericTiming,
      stageGaps: timing.stageGaps,
      current: config,
    })
    if (Object.keys(patch).length > 0) onChange(patch)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-seed when mode or metric set changes
  }, [config.chartType, timing.numericTiming.join('|'), categorical.join('|'), numeric.join('|')])

  const palette = useMemo(() => {
    void paletteTick
    const theme = themePalette()
    return {
      primary: theme.avg,
      secondary: theme.stages[1] ?? theme.avg,
      warn: theme.median,
      bad: theme.rankSlow,
      muted: 'var(--faint)',
    }
  }, [paletteTick])

  const chart = renderChart({
    rows: chartRows,
    headers: chartHeaders,
    config,
    numeric,
    selected,
    onSelect: (key) => setSelected(key || null),
    palette,
    excludeMissing,
  })

  function go(delta: number) {
    const next = (modeIndex + delta + TYPES.length) % TYPES.length
    onChange({ chartType: TYPES[next].id })
  }

  function onTouchStart(event: TouchEvent) {
    touchX.current = event.changedTouches[0]?.clientX ?? null
  }

  function onTouchEnd(event: TouchEvent) {
    const start = touchX.current
    touchX.current = null
    if (start == null) return
    const end = event.changedTouches[0]?.clientX ?? start
    const delta = end - start
    if (Math.abs(delta) < 56) return
    go(delta < 0 ? 1 : -1)
  }

  function download() {
    const svg = frame.current?.querySelector('svg')
    if (svg) downloadSvgAsPng(svg, `chart_${dateStamp()}.png`)
  }

  const heading = periodLabel ? `Field picture · ${periodLabel}` : 'Field picture'
  const measureChoices = numeric.length ? numeric : timing.numericTiming

  return (
    <section className="panel charts-view">
      <div className="panel-head">
        <div>
          <p className="kicker">Charts</p>
          <h2>{heading}</h2>
          <p className="charts-lede">
            Five instruments on the same filtered jobs — swipe or step the carousel. Timing slides use clocks built from your stage columns.
          </p>
        </div>
        <button type="button" className="ghost" onClick={download} disabled={!chart.svg}>
          Download PNG
        </button>
      </div>

      <div className="charts-carousel" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div className="charts-carousel-nav">
          <button type="button" className="charts-arrow" aria-label="Previous instrument" onClick={() => go(-1)}>
            ‹
          </button>
          <div className="charts-carousel-title">
            <p className="charts-live">Instrument live</p>
            <h3>
              {activeType.label}
              <Hint tip={activeType.tip} label={`${activeType.label} help`} />
            </h3>
            <p className="charts-blurb">{activeType.blurb}</p>
            <p className="charts-mode">
              {modeIndex + 1} / {TYPES.length} · {activeType.signal}
              {periodLabel ? ` · ${periodLabel}` : ''}
            </p>
          </div>
          <button type="button" className="charts-arrow" aria-label="Next instrument" onClick={() => go(1)}>
            ›
          </button>
        </div>

        <div className="charts-dots" role="tablist" aria-label="Chart instruments">
          {TYPES.map((type, index) => (
            <button
              key={type.id}
              type="button"
              role="tab"
              aria-selected={index === modeIndex}
              className={index === modeIndex ? 'charts-dot on' : 'charts-dot'}
              onClick={() => onChange({ chartType: type.id })}
              title={type.label}
            >
              <span>{type.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="charts-controls">
        {config.chartType !== 'corr' && config.chartType !== 'scatter' && (
          <label className="field inline-field">
            <span>{config.chartType === 'bar' ? 'Category' : 'Measure'}</span>
            <select
              value={
                config.chartType === 'bar'
                  ? config.chartCol
                  : measureChoices.includes(config.chartCol)
                    ? config.chartCol
                    : measureChoices[0] ?? ''
              }
              onChange={(event) => onChange({ chartCol: event.target.value })}
            >
              {(config.chartType === 'bar' ? categorical : measureChoices).map((column) => (
                <option key={column} value={column}>
                  {column}
                </option>
              ))}
            </select>
          </label>
        )}
        {config.chartType === 'bar' && (
          <label className="charts-toggle">
            <input
              type="checkbox"
              checked={excludeMissing}
              onChange={(event) => setExcludeMissing(event.target.checked)}
            />
            <span>Exclude Unassigned</span>
            <Hint tip="chartsExcludeMissing" label="Exclude Unassigned help" />
          </label>
        )}
        {config.chartType === 'box' && (
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
        {config.chartType === 'scatter' && (
          <div className="split-fields">
            <label className="field">
              <span>X</span>
              <select
                value={measureChoices.includes(config.scatterX) ? config.scatterX : measureChoices[0] ?? ''}
                onChange={(event) => onChange({ scatterX: event.target.value })}
              >
                {measureChoices.map((column) => (
                  <option key={column} value={column}>
                    {column}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Y</span>
              <select
                value={measureChoices.includes(config.scatterY) ? config.scatterY : measureChoices[1] ?? measureChoices[0] ?? ''}
                onChange={(event) => onChange({ scatterY: event.target.value })}
              >
                {measureChoices.map((column) => (
                  <option key={column} value={column}>
                    {column}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        {timing.numericTiming.length > 0 && config.chartType !== 'bar' && (
          <p className="charts-timing-note">
            Timing fields from stages: {timing.numericTiming.slice(0, 4).join(' · ')}
            {timing.numericTiming.length > 4 ? '…' : ''}
          </p>
        )}
      </div>

      {chart.focus && <InspectCard focus={chart.focus} onClear={() => setSelected(null)} />}

      <div ref={frame} className="charts-frame charts-slide" key={activeType.id}>
        {chart.svg ? <InstrumentChassis>{chart.node}</InstrumentChassis> : chart.node}
      </div>

      {chart.note && <p className="hint charts-hint-live">{chart.note}</p>}
      {chart.svg && !chart.focus && (
        <p className="hint charts-hint-live">Tap the instrument to lock focus — details open above.</p>
      )}
    </section>
  )
}

function defaultsForMode(
  type: ChartType,
  args: {
    categorical: string[]
    numeric: string[]
    timingNumeric: string[]
    stageGaps: string[]
    current: BoardConfig
  },
): Partial<BoardConfig> {
  const { categorical, numeric, timingNumeric, stageGaps, current } = args
  const measures = numeric.length ? numeric : timingNumeric
  const patch: Partial<BoardConfig> = {}

  if (type === 'bar') {
    if (!categorical.includes(current.chartCol) && categorical[0]) patch.chartCol = categorical[0]
    return patch
  }

  if (type === 'hist' || type === 'box') {
    const preferred = measures.includes(TOTAL_MINUTES) ? TOTAL_MINUTES : measures[0]
    if (preferred && !measures.includes(current.chartCol)) patch.chartCol = preferred
    if (type === 'box' && current.groupCol !== 'none' && !categorical.includes(current.groupCol)) {
      if (categorical.includes('Parish')) patch.groupCol = 'Parish'
      else if (categorical[0]) patch.groupCol = categorical[0]
      else patch.groupCol = 'none'
    }
  }

  if (type === 'scatter') {
    const x = stageGaps[0] ?? measures[0] ?? ''
    const y = stageGaps[1] ?? measures.find((name) => name !== x) ?? measures[0] ?? ''
    const xBad = !current.scatterX || !measures.includes(current.scatterX)
    const yBad =
      !current.scatterY ||
      !measures.includes(current.scatterY) ||
      current.scatterY === (xBad ? x : current.scatterX)
    if (x && xBad) patch.scatterX = x
    if (y && yBad) patch.scatterY = y
  }

  return patch
}

function InstrumentChassis({ children }: { children: ReactNode }) {
  return (
    <div className="charts-chassis">
      <div className="charts-corners" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
      {children}
    </div>
  )
}

function InspectCard({ focus, onClear }: { focus: FocusState; onClear: () => void }) {
  const sharePct = focus.share == null ? null : Math.max(0, Math.min(100, focus.share * 100))
  const shareDisplay =
    focus.share == null
      ? '—'
      : focus.shareLabel === '|r|'
        ? focus.share.toFixed(3)
        : `${sharePct!.toFixed(1)}%`
  return (
    <div className="charts-inspect">
      <div className="charts-inspect-head">
        <div>
          <p className="insight-label">Target lock</p>
          <p className="insight-title">{focus.title}</p>
          <p className="charts-inspect-sub">{focus.subtitle}</p>
        </div>
        <button type="button" className="text-btn" onClick={onClear}>
          Clear
        </button>
      </div>
      <div className="metric-row">
        <div className="metric-chip">
          <span>{focus.countLabel ?? 'Count'}</span>
          <strong>{focus.count == null ? '—' : formatInt(focus.count)}</strong>
        </div>
        <div className="metric-chip">
          <span>{focus.shareLabel ?? 'Share'}</span>
          <strong>{shareDisplay}</strong>
        </div>
      </div>
      {sharePct != null && focus.shareLabel !== '|r|' && (
        <div className="charts-share" aria-hidden="true">
          <div className="charts-share-track">
            <span className="charts-share-fill" style={{ width: `${sharePct}%` }} />
          </div>
        </div>
      )}
      {focus.shareLabel === '|r|' && focus.share != null && (
        <div className="charts-share" aria-hidden="true">
          <div className="charts-share-track">
            <span className="charts-share-fill" style={{ width: `${Math.abs(focus.share) * 100}%` }} />
          </div>
        </div>
      )}
      {focus.detail && <p className="charts-inspect-detail">{focus.detail}</p>}
      {focus.samples.length > 0 && (
        <div className="charts-samples">
          <p className="insight-label">Sample jobs</p>
          <ul>
            {focus.samples.map((sample) => (
              <li key={sample}>{sample}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function EmptyInstrument({ title, body }: { title: string; body: string }) {
  return (
    <div className="charts-empty" role="status">
      <p className="insight-label">Channel offline</p>
      <p className="insight-title">{title}</p>
      <p>{body}</p>
    </div>
  )
}

type RenderArgs = {
  rows: Row[]
  headers: string[]
  config: BoardConfig
  numeric: string[]
  selected: string | null
  onSelect: (key: string) => void
  palette: { primary: string; secondary: string; warn: string; bad: string; muted: string }
  excludeMissing: boolean
}

function renderChart(args: RenderArgs): { node: ReactNode; svg: boolean; note?: string; focus?: FocusState } {
  const { rows, headers, config, numeric, selected, onSelect, palette, excludeMissing } = args

  if (config.chartType === 'corr') {
    const corrCols = numeric.length >= 2 ? numeric : config.analysisCols
    const model = correlation(rows, corrCols)
    if (!model) {
      return {
        svg: false,
        node: (
          <EmptyInstrument
            title="Need timing fields"
            body="Links needs at least two numeric measures. Set timestamp stages in Setup so Total minutes and stage gaps can be built."
          />
        ),
      }
    }
    return {
      svg: true,
      node: <CorrChart model={model} selected={selected} onSelect={onSelect} palette={palette} />,
      focus: corrFocus(model, selected),
      note: 'Link matrix — tap a cell for pair strength. Strong |r| glows.',
    }
  }

  if ((config.chartType === 'hist' || config.chartType === 'box' || config.chartType === 'scatter') && numeric.length === 0) {
    return {
      svg: false,
      node: (
        <EmptyInstrument
          title="No measures yet"
          body="Open Setup and pick at least two timestamp columns in order. Charts then builds Total minutes and stage gaps automatically."
        />
      ),
    }
  }

  if (config.chartType === 'hist') {
    const col = numeric.includes(config.chartCol) ? config.chartCol : numeric[0]
    const model = histogram(rows, col)
    if (!model) {
      return { svg: false, node: <EmptyInstrument title="Empty measure" body="No numeric values in that column after filters." /> }
    }
    return {
      svg: true,
      node: <HistogramChart model={model} selected={selected} onSelect={onSelect} palette={palette} />,
      focus: histFocus(model, rows, headers, selected),
      note: `Density of ${model.column} · ${formatInt(model.total)} values · tap a node to lock a bin.`,
    }
  }

  if (config.chartType === 'box') {
    const col = numeric.includes(config.chartCol) ? config.chartCol : numeric[0]
    const model = boxplot(rows, col, config.groupCol)
    if (!model) {
      return { svg: false, node: <EmptyInstrument title="Empty measure" body="No numeric values in that column after filters." /> }
    }
    return {
      svg: true,
      node: <BoxChart model={model} selected={selected} onSelect={onSelect} palette={palette} />,
      focus: boxFocus(model, rows, headers, config, selected),
      note: 'Range towers — tap a group to lock median, IQR, and sample jobs.',
    }
  }

  if (config.chartType === 'scatter') {
    const xCol = numeric.includes(config.scatterX) ? config.scatterX : numeric[0]
    const yCol =
      numeric.includes(config.scatterY) && config.scatterY !== xCol
        ? config.scatterY
        : numeric.find((name) => name !== xCol) ?? numeric[1] ?? numeric[0]
    const model = scatter(rows, xCol, yCol)
    if (!model) {
      return {
        svg: false,
        node: (
          <EmptyInstrument
            title="Need overlapping pairs"
            body="Pick two timing measures that both have values on the same jobs."
          />
        ),
      }
    }
    return {
      svg: true,
      node: <ScatterChart model={model} selected={selected} onSelect={onSelect} palette={palette} />,
      focus: scatterFocus(model, rows, headers, selected),
      note: model.hidden
        ? `Constellation sample — ${formatInt(model.hidden)} points off-plot; fit uses every pair.`
        : 'Constellation field — tap a star to lock that pair.',
    }
  }

  if (categoricalColumns(headers, rows).length === 0) {
    return {
      svg: false,
      node: (
        <EmptyInstrument
          title="No categories to count"
          body="Share needs a categorical column. Try Density for Total minutes instead."
        />
      ),
    }
  }

  const model = barCounts(rows, config.chartCol, { excludeMissing })
  if (!model) {
    return {
      svg: false,
      node: (
        <EmptyInstrument
          title={excludeMissing ? 'Only Unassigned left' : 'No values to count'}
          body={
            excludeMissing
              ? 'Turn off Exclude Unassigned, or pick another column.'
              : 'That column is empty after filters.'
          }
        />
      ),
    }
  }
  return {
    svg: true,
    node: <BarChart model={model} selected={selected} onSelect={onSelect} palette={palette} />,
    focus: barFocus(model, rows, headers, selected),
    note:
      model.missing > 0 && !excludeMissing
        ? `Unassigned shown as its own rail (${formatInt(model.missing)}). Toggle Exclude Unassigned to hide.`
        : 'Arc for leaders · full ranking below · tap to lock.',
  }
}

function barFocus(model: BarModel, rows: Row[], headers: string[], selected: string | null): FocusState | undefined {
  if (!selected) return undefined
  const item = model.items.find((entry) => entry.label === selected)
  if (!item) return undefined
  return {
    title: categoryLabel(item.label),
    subtitle: model.column,
    count: item.n,
    share: model.total ? item.n / model.total : null,
    samples: sampleJobHints(
      rows,
      (row) => {
        const text = asText(row[model.column])
        if (item.label === UNASSIGNED_KEY) return isMissingCategory(text)
        return text === item.label
      },
      4,
      headers,
    ),
    detail: item.label === UNASSIGNED_KEY ? 'Blank / null / n/a values in this column.' : undefined,
  }
}

function histFocus(model: HistModel, rows: Row[], headers: string[], selected: string | null): FocusState | undefined {
  if (selected == null || selected === '') return undefined
  const index = Number(selected)
  const bin = model.bins[index]
  if (!bin) return undefined
  const digits = Math.abs(bin.hi - bin.lo) > 10 ? 0 : 1
  return {
    title: `${bin.lo.toFixed(digits)} – ${bin.hi.toFixed(digits)}`,
    subtitle: model.column,
    count: bin.n,
    share: model.total ? bin.n / model.total : null,
    samples: sampleJobHints(
      rows,
      (row) => {
        const value = asNumber(row[model.column])
        if (value == null) return false
        if (index === model.bins.length - 1) return value >= bin.lo && value <= bin.hi
        return value >= bin.lo && value < bin.hi
      },
      4,
      headers,
    ),
    detail: `${formatInt(bin.n)} of ${formatInt(model.total)} values land in this bin.`,
  }
}

function boxFocus(
  model: BoxModel,
  rows: Row[],
  headers: string[],
  config: BoardConfig,
  selected: string | null,
): FocusState | undefined {
  if (!selected) return undefined
  const group = model.groups.find((entry) => entry.name === selected)
  if (!group) return undefined
  return {
    title: categoryLabel(group.name),
    subtitle: model.column,
    count: group.n,
    share: model.total ? group.n / model.total : null,
    samples: sampleJobHints(
      rows,
      (row) => {
        if (asNumber(row[model.column]) == null) return false
        if (config.groupCol === 'none') return true
        return (asText(row[config.groupCol]) ?? 'Unknown') === group.name
      },
      4,
      headers,
    ),
    detail: `Median ${group.median.toFixed(1)} · IQR ${group.q1.toFixed(1)}–${group.q3.toFixed(1)} · ${group.outliers.length} outliers shown`,
  }
}

function scatterFocus(
  model: ScatterModel,
  rows: Row[],
  headers: string[],
  selected: string | null,
): FocusState | undefined {
  if (!selected) return undefined
  const point = model.points.find((entry) => String(entry.index) === selected)
  if (!point) return undefined
  const row = rows[point.index]
  return {
    title: `${model.xCol} ${point.x.toFixed(1)}`,
    subtitle: `${model.yCol} ${point.y.toFixed(1)}`,
    count: 1,
    share: model.total ? 1 / model.total : null,
    samples: row ? sampleJobHints([row], () => true, 1, headers) : [],
    detail: `Fit slope ${model.slope.toFixed(3)} · ${formatInt(model.total)} pairs on the line`,
  }
}

function corrFocus(model: CorrModel, selected: string | null): FocusState | undefined {
  if (!selected) return undefined
  const [rowText, colText] = selected.split(':')
  const rowIndex = Number(rowText)
  const colIndex = Number(colText)
  const value = model.matrix[rowIndex]?.[colIndex]
  if (value == null) return undefined
  return {
    title: model.labels[rowIndex],
    subtitle: model.labels[colIndex],
    count: null,
    share: Math.abs(value),
    samples: [],
    detail: `Pearson r = ${value.toFixed(3)}`,
    countLabel: 'Pair',
    shareLabel: '|r|',
  }
}
