import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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
import { dateStamp, formatInt } from '../lib/format'
import { downloadSvgAsPng } from '../lib/download'
import { themePalette } from '../lib/theme'
import './ChartsView.css'

const TYPES: { id: ChartType; label: string; signal: string; tip: HelpKey }[] = [
  { id: 'bar', label: 'Share', signal: 'Arc + density rails', tip: 'chartsShare' },
  { id: 'hist', label: 'Density', signal: 'Signal silhouette', tip: 'chartsDensity' },
  { id: 'box', label: 'Range', signal: 'Tower spread', tip: 'chartsRange' },
  { id: 'scatter', label: 'Field', signal: 'Constellation', tip: 'chartsField' },
  { id: 'corr', label: 'Links', signal: 'Pearson matrix', tip: 'chartsLinks' },
]

type Props = {
  headers: string[]
  rows: Row[]
  config: BoardConfig
  onChange: (patch: Partial<BoardConfig>) => void
  /** Optional period label for multi-month titles later (e.g. "June 2025"). */
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
  const [selected, setSelected] = useState<string | null>(null)
  const [excludeMissing, setExcludeMissing] = useState(false)
  const [paletteTick, setPaletteTick] = useState(0)
  const numeric = numericColumns(headers, rows)
  const categorical = categoricalColumns(headers, rows)
  const activeType = TYPES.find((type) => type.id === config.chartType) ?? TYPES[0]

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
    rows,
    headers,
    config,
    numeric,
    selected,
    onSelect: (key) => setSelected(key || null),
    palette,
    excludeMissing,
  })

  function download() {
    const svg = frame.current?.querySelector('svg')
    if (svg) downloadSvgAsPng(svg, `chart_${dateStamp()}.png`)
  }

  const heading = periodLabel ? `Field picture · ${periodLabel}` : 'Field picture'

  return (
    <section className="panel charts-view">
      <div className="panel-head">
        <div>
          <p className="kicker">Charts</p>
          <h2>{heading}</h2>
        </div>
        <button type="button" className="ghost" onClick={download} disabled={!chart.svg}>
          Download PNG
        </button>
      </div>

      <div className="charts-status" aria-live="polite">
        <span className="charts-live">Instrument live</span>
        <span className="charts-mode">
          Mode <strong>{activeType.label}</strong> · {activeType.signal}
          {periodLabel ? ` · ${periodLabel}` : ''}
        </span>
        <Hint tip={activeType.tip} label={`${activeType.label} help`} />
      </div>

      <div className="charts-controls">
        <div className="seg chart-seg" role="group" aria-label="Chart type">
          {TYPES.map((type) => (
            <button
              key={type.id}
              type="button"
              aria-pressed={config.chartType === type.id}
              onClick={() => onChange({ chartType: type.id })}
            >
              {type.label}
            </button>
          ))}
        </div>

        {config.chartType !== 'corr' && config.chartType !== 'scatter' && (
          <label className="field inline-field">
            <span>Column</span>
            <select value={config.chartCol} onChange={(event) => onChange({ chartCol: event.target.value })}>
              {(config.chartType === 'bar' ? categorical : numeric).map((column) => (
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
              <select value={config.scatterX} onChange={(event) => onChange({ scatterX: event.target.value })}>
                {numeric.map((column) => (
                  <option key={column} value={column}>
                    {column}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Y</span>
              <select value={config.scatterY} onChange={(event) => onChange({ scatterY: event.target.value })}>
                {numeric.map((column) => (
                  <option key={column} value={column}>
                    {column}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </div>

      {chart.focus && <InspectCard focus={chart.focus} onClear={() => setSelected(null)} />}

      <div ref={frame} className="charts-frame">
        {chart.svg ? <InstrumentChassis>{chart.node}</InstrumentChassis> : chart.node}
      </div>

      {chart.note && <p className="hint charts-hint-live">{chart.note}</p>}
      {chart.svg && !chart.focus && (
        <p className="hint charts-hint-live">
          Tap to lock focus — count, share, and sample jobs appear above the instrument.
        </p>
      )}
    </section>
  )
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
          <strong>{sharePct == null ? '—' : `${sharePct.toFixed(1)}%`}</strong>
        </div>
      </div>
      {sharePct != null && (
        <div className="charts-share" aria-hidden="true">
          <div className="charts-share-track">
            <span className="charts-share-fill" style={{ width: `${sharePct}%` }} />
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
    const model = correlation(rows, numeric.length ? numeric : config.analysisCols)
    if (!model) {
      return {
        svg: false,
        node: (
          <EmptyInstrument
            title="Correlation needs numbers"
            body="This workbook’s measurements live on the command board as stage response times. Switch to Share for categories, or open Command for crew clocks."
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
          title="No numeric columns on this sheet"
          body="Use Share for categories (parish, crew, weather), or the command board for response-time instruments."
        />
      ),
    }
  }

  if (config.chartType === 'hist') {
    const model = histogram(rows, config.chartCol || numeric[0])
    if (!model) {
      return { svg: false, node: <EmptyInstrument title="Empty column" body="No numeric values in that column." /> }
    }
    return {
      svg: true,
      node: <HistogramChart model={model} selected={selected} onSelect={onSelect} palette={palette} />,
      focus: histFocus(model, rows, headers, selected),
      note: `Density signal of ${model.column} · ${formatInt(model.total)} values · tap a node to lock a bin.`,
    }
  }

  if (config.chartType === 'box') {
    const model = boxplot(rows, config.chartCol || numeric[0], config.groupCol)
    if (!model) {
      return { svg: false, node: <EmptyInstrument title="Empty column" body="No numeric values in that column." /> }
    }
    return {
      svg: true,
      node: <BoxChart model={model} selected={selected} onSelect={onSelect} palette={palette} />,
      focus: boxFocus(model, rows, headers, config, selected),
      note: 'Range towers — tap a group to lock median, IQR, and sample jobs.',
    }
  }

  if (config.chartType === 'scatter') {
    const model = scatter(rows, config.scatterX, config.scatterY)
    if (!model) {
      return {
        svg: false,
        node: (
          <EmptyInstrument
            title="Need overlapping pairs"
            body="Pick two numeric columns that both have values on the same jobs."
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

  if (categoricalColumns(headers, rows).length === 0 && config.chartType === 'bar') {
    return {
      svg: false,
      node: (
        <EmptyInstrument
          title="No categories to count"
          body="This sheet has nothing categorical for the share instrument. Try a different sheet, or Density if numbers are present."
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
              ? 'Turn off Exclude Unassigned, or pick another column — every remaining value was blank/null.'
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
        : 'Arc for leaders · density rails below for the full ranking · tap to lock.',
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
    detail: `Median ${group.median.toFixed(2)} · IQR ${group.q1.toFixed(2)}–${group.q3.toFixed(2)} · ${group.outliers.length} outliers shown`,
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
    title: `${model.xCol} ${point.x.toFixed(2)}`,
    subtitle: `${model.yCol} ${point.y.toFixed(2)}`,
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
  const abs = Math.abs(value)
  return {
    title: `${model.labels[rowIndex]} × ${model.labels[colIndex]}`,
    subtitle: 'Pearson correlation',
    count: null,
    countLabel: 'r',
    share: abs,
    shareLabel: '|r|',
    samples: [],
    detail: `r = ${value.toFixed(3)} · ${strengthLabel(value)}`,
  }
}

function strengthLabel(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 0.7) return 'strong link'
  if (abs >= 0.4) return 'moderate link'
  if (abs >= 0.2) return 'weak link'
  return 'little linear link'
}
