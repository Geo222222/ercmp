import { useRef, type ReactNode } from 'react'
import type { BoardConfig, ChartType, Row } from '../types'
import { BarChart, BoxChart, CorrChart, HistogramChart, ScatterChart } from '../components/StatCharts'
import { barCounts, boxplot, correlation, histogram, scatter } from '../lib/stats'
import { categoricalColumns, numericColumns } from '../lib/rows'
import { dateStamp } from '../lib/format'
import { downloadSvgAsPng } from '../lib/download'

const TYPES: { id: ChartType; label: string }[] = [
  { id: 'bar', label: 'Bar' },
  { id: 'hist', label: 'Histogram' },
  { id: 'box', label: 'Box' },
  { id: 'scatter', label: 'Scatter' },
  { id: 'corr', label: 'Correlation' },
]

type Props = {
  headers: string[]
  rows: Row[]
  config: BoardConfig
  onChange: (patch: Partial<BoardConfig>) => void
}

export function ChartsView({ headers, rows, config, onChange }: Props) {
  const frame = useRef<HTMLDivElement>(null)
  const numeric = numericColumns(headers, rows)
  const categorical = categoricalColumns(headers, rows)
  const chart = renderChart(rows, config, numeric)

  function download() {
    const svg = frame.current?.querySelector('svg')
    if (svg) downloadSvgAsPng(svg, `chart_${dateStamp()}.png`)
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <p className="kicker">Charts</p>
          <h2>Field picture</h2>
        </div>
        <button type="button" className="ghost" onClick={download} disabled={!chart.svg}>
          Download PNG
        </button>
      </div>
      <div className="seg" role="group" aria-label="Chart type">
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
      <div ref={frame}>{chart.node}</div>
      {chart.note && <p className="hint">{chart.note}</p>}
    </section>
  )
}

function renderChart(rows: Row[], config: BoardConfig, numeric: string[]): { node: ReactNode; svg: boolean; note?: string } {
  if (config.chartType === 'corr') {
    const model = correlation(rows, numeric.length ? numeric : config.analysisCols)
    if (!model) {
      return {
        svg: false,
        node: <p className="empty">Correlation needs at least two numeric columns. This workbook’s measurements are the response times on the command board.</p>,
      }
    }
    return { svg: true, node: <CorrChart model={model} /> }
  }

  if ((config.chartType === 'hist' || config.chartType === 'box' || config.chartType === 'scatter') && numeric.length === 0) {
    return {
      svg: false,
      node: <p className="empty">This sheet has no numeric columns. Use the bar chart for categories, or the command board for response times.</p>,
    }
  }

  if (config.chartType === 'hist') {
    const model = histogram(rows, config.chartCol || numeric[0])
    if (!model) return { svg: false, node: <p className="empty">No numeric values in that column.</p> }
    return { svg: true, node: <HistogramChart model={model} />, note: `Histogram of ${model.column}, 30 bins.` }
  }

  if (config.chartType === 'box') {
    const model = boxplot(rows, config.chartCol || numeric[0], config.groupCol)
    if (!model) return { svg: false, node: <p className="empty">No numeric values in that column.</p> }
    return { svg: true, node: <BoxChart model={model} /> }
  }

  if (config.chartType === 'scatter') {
    const model = scatter(rows, config.scatterX, config.scatterY)
    if (!model) return { svg: false, node: <p className="empty">Need two numeric columns with overlapping values.</p> }
    return {
      svg: true,
      node: <ScatterChart model={model} />,
      note: model.hidden ? `Showing a sample. ${model.hidden} points are off this plot; the line uses every pair.` : undefined,
    }
  }

  const model = barCounts(rows, config.chartCol)
  if (!model) return { svg: false, node: <p className="empty">No values to count.</p> }
  return {
    svg: true,
    node: <BarChart model={model} />,
    note: model.hidden ? `Top 24 of ${model.items.length + model.hidden} values.` : undefined,
  }
}
