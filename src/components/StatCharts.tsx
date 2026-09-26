import type { BarModel, BoxModel, CorrModel, HistModel, ScatterModel } from '../lib/stats'
import { ellipsize } from '../lib/format'

export function HistogramChart({ model }: { model: HistModel }) {
  const width = 720
  const height = 320
  const pad = { l: 40, r: 12, t: 16, b: 28 }
  const max = Math.max(...model.bins.map((bin) => bin.n), 1)
  const innerW = width - pad.l - pad.r
  const innerH = height - pad.t - pad.b
  const barW = innerW / model.bins.length
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="stat-svg" role="img" aria-label={`Histogram of ${model.column}`}>
      {model.bins.map((bin, index) => {
        const h = (bin.n / max) * innerH
        return (
          <g key={bin.label}>
            <rect
              x={pad.l + index * barW + 1}
              y={pad.t + innerH - h}
              width={Math.max(barW - 2, 1)}
              height={h}
              fill="#2ee6c7"
              rx={2}
            />
          </g>
        )
      })}
      <text x={pad.l} y={height - 8} className="axis-label">
        {model.bins[0]?.label}
      </text>
      <text x={width - pad.r} y={height - 8} textAnchor="end" className="axis-label">
        {model.bins[model.bins.length - 1]?.label}
      </text>
      <text x={16} y={pad.t + 8} className="axis-label">
        {max}
      </text>
    </svg>
  )
}

export function BarChart({ model }: { model: BarModel }) {
  const width = 760
  const rowH = 28
  const height = 36 + model.items.length * rowH
  const max = Math.max(...model.items.map((item) => item.n), 1)
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="stat-svg" role="img" aria-label={`Counts of ${model.column}`}>
      {model.items.map((item, index) => {
        const y = 8 + index * rowH
        const w = (item.n / max) * (width - 280)
        return (
          <g key={item.label}>
            <text x={168} y={y + 16} textAnchor="end" className="axis-label">
              {ellipsize(item.label, 22)}
            </text>
            <rect x={180} y={y + 4} width={Math.max(w, 2)} height={16} rx={4} fill="#4aa3ff" />
            <text x={188 + w} y={y + 16} className="axis-label">
              {item.n}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export function BoxChart({ model }: { model: BoxModel }) {
  const width = Math.max(640, model.groups.length * 72 + 60)
  const height = 320
  const pad = { l: 48, r: 16, t: 16, b: 72 }
  const values = model.groups.flatMap((group) => [group.low, group.high, ...group.outliers])
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const yOf = (value: number) => pad.t + ((max - value) / span) * (height - pad.t - pad.b)
  const slot = (width - pad.l - pad.r) / model.groups.length
  return (
    <div className="chart-scroll">
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={`Boxplot of ${model.column}`}>
        {model.groups.map((group, index) => {
          const x = pad.l + index * slot + slot / 2
          return (
            <g key={group.name}>
              <line x1={x} x2={x} y1={yOf(group.high)} y2={yOf(group.low)} stroke="#9eb4c4" />
              <rect
                x={x - 14}
                y={yOf(group.q3)}
                width={28}
                height={Math.max(yOf(group.q1) - yOf(group.q3), 2)}
                fill="#132430"
                stroke="#2ee6c7"
              />
              <line x1={x - 14} x2={x + 14} y1={yOf(group.median)} y2={yOf(group.median)} stroke="#f0b429" strokeWidth={2} />
              {group.outliers.map((value, outlierIndex) => (
                <circle key={outlierIndex} cx={x} cy={yOf(value)} r={2.5} fill="#ff8a5b" />
              ))}
              <text x={x} y={height - 52} textAnchor="end" className="axis-label" transform={`rotate(-50 ${x} ${height - 52})`}>
                {ellipsize(group.name, 16)}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export function ScatterChart({ model }: { model: ScatterModel }) {
  const width = 720
  const height = 360
  const pad = { l: 48, r: 16, t: 16, b: 36 }
  const xs = model.points.map((point) => point.x)
  const ys = model.points.map((point) => point.y)
  const xMin = Math.min(...xs)
  const xMax = Math.max(...xs)
  const yMin = Math.min(...ys)
  const yMax = Math.max(...ys)
  const xSpan = xMax - xMin || 1
  const ySpan = yMax - yMin || 1
  const xOf = (value: number) => pad.l + ((value - xMin) / xSpan) * (width - pad.l - pad.r)
  const yOf = (value: number) => pad.t + ((yMax - value) / ySpan) * (height - pad.t - pad.b)
  const y1 = model.intercept + model.slope * xMin
  const y2 = model.intercept + model.slope * xMax
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="stat-svg" role="img" aria-label={`${model.yCol} versus ${model.xCol}`}>
      {model.points.map((point, index) => (
        <circle key={index} cx={xOf(point.x)} cy={yOf(point.y)} r={3} fill="#4aa3ff" opacity={0.75} />
      ))}
      <line x1={xOf(xMin)} y1={yOf(y1)} x2={xOf(xMax)} y2={yOf(y2)} stroke="#ff5a6a" strokeWidth={2} />
      <text x={pad.l} y={height - 10} className="axis-label">
        {model.xCol}
      </text>
      <text x={8} y={18} className="axis-label">
        {model.yCol}
      </text>
    </svg>
  )
}

export function CorrChart({ model }: { model: CorrModel }) {
  const size = 36
  const pad = 120
  const width = pad + model.labels.length * size + 16
  const height = 28 + model.labels.length * size + 8
  return (
    <div className="chart-scroll">
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label="Correlation heatmap">
        {model.labels.map((label, index) => (
          <text key={label} x={pad - 6} y={32 + index * size} textAnchor="end" className="axis-label">
            {ellipsize(label, 16)}
          </text>
        ))}
        {model.matrix.map((row, rowIndex) =>
          row.map((value, colIndex) => {
            if (colIndex < rowIndex || value == null) return null
            const x = pad + colIndex * size
            const y = 16 + rowIndex * size
            return (
              <g key={`${rowIndex}-${colIndex}`}>
                <rect x={x} y={y} width={size - 3} height={size - 3} rx={4} fill={corrColor(value)} />
                <text x={x + (size - 3) / 2} y={y + 18} textAnchor="middle" className="corr-num">
                  {value.toFixed(2)}
                </text>
              </g>
            )
          }),
        )}
      </svg>
    </div>
  )
}

function corrColor(value: number): string {
  const t = Math.max(-1, Math.min(1, value))
  if (t >= 0) {
    const mix = t
    return mixColor('#163246', '#2ee6c7', mix)
  }
  return mixColor('#163246', '#ff5a6a', -t)
}

function mixColor(from: string, to: string, t: number): string {
  const a = hex(from)
  const b = hex(to)
  const channel = (index: number) => Math.round(a[index] + (b[index] - a[index]) * t)
  return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`
}

function hex(value: string): [number, number, number] {
  const raw = value.slice(1)
  return [parseInt(raw.slice(0, 2), 16), parseInt(raw.slice(2, 4), 16), parseInt(raw.slice(4, 6), 16)]
}
