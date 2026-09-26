import type { KeyboardEvent } from 'react'
import type { BarModel, BoxModel, CorrModel, HistModel, ScatterModel } from '../lib/stats'
import { ellipsize } from '../lib/format'

export type ChartPalette = {
  primary: string
  secondary: string
  warn: string
  bad: string
  muted: string
}

type Selectable = {
  selected?: string | null
  onSelect?: (key: string) => void
  palette?: ChartPalette
}

function toggleKey(current: string | null | undefined, next: string, onSelect?: (key: string) => void) {
  if (!onSelect) return
  onSelect(current === next ? '' : next)
}

function rowHandlers(
  key: string,
  selected: string | null | undefined,
  onSelect?: (key: string) => void,
) {
  if (!onSelect) return {}
  return {
    role: 'button' as const,
    tabIndex: 0,
    style: { cursor: 'pointer' as const },
    onClick: () => toggleKey(selected, key, onSelect),
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        toggleKey(selected, key, onSelect)
      }
    },
  }
}

function GradientDefs({ id, from, to }: { id: string; from: string; to: string }) {
  return (
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor={from} stopOpacity={0.55} />
        <stop offset="55%" stopColor={from} stopOpacity={1} />
        <stop offset="100%" stopColor={to} stopOpacity={1} />
      </linearGradient>
      <linearGradient id={`${id}-v`} x1="0" y1="1" x2="0" y2="0">
        <stop offset="0%" stopColor={from} stopOpacity={0.35} />
        <stop offset="100%" stopColor={from} stopOpacity={1} />
      </linearGradient>
      <filter id={`${id}-glow`} x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="2.2" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  )
}

export function HistogramChart({ model, selected, onSelect, palette }: { model: HistModel } & Selectable) {
  const width = 720
  const height = 320
  const pad = { l: 44, r: 12, t: 20, b: 36 }
  const max = Math.max(...model.bins.map((bin) => bin.n), 1)
  const innerW = width - pad.l - pad.r
  const innerH = height - pad.t - pad.b
  const barW = innerW / model.bins.length
  const fill = palette?.primary ?? 'var(--accent)'
  const tip = palette?.secondary ?? fill
  const gid = 'hist-grad'

  return (
    <div className="chart-instrument">
      <div className="chart-scroll chart-h">
        <svg viewBox={`0 0 ${width} ${height}`} className="stat-svg" role="img" aria-label={`Histogram of ${model.column}`}>
          <GradientDefs id={gid} from={fill} to={tip} />
          {Array.from({ length: 5 }, (_, index) => {
            const y = pad.t + (innerH * index) / 4
            return <line key={y} x1={pad.l} x2={width - pad.r} y1={y} y2={y} className="grid-line" opacity={0.55} />
          })}
          {model.bins.map((bin, index) => {
            const key = String(index)
            const h = (bin.n / max) * innerH
            const active = !selected || selected === key
            const isSelected = selected === key
            return (
              <g
                key={key}
                className={onSelect ? 'bar-row' : undefined}
                opacity={active ? 1 : 0.22}
                {...rowHandlers(key, selected, onSelect)}
              >
                {isSelected && (
                  <rect
                    x={pad.l + index * barW}
                    y={pad.t - 4}
                    width={Math.max(barW, 4)}
                    height={innerH + 8}
                    rx={4}
                    className="bar-row-focus"
                  />
                )}
                <rect
                  className={isSelected ? 'hud-bar is-hot' : 'hud-bar'}
                  x={pad.l + index * barW + 1}
                  y={pad.t + innerH - h}
                  width={Math.max(barW - 2, 1)}
                  height={Math.max(h, bin.n > 0 ? 2 : 0)}
                  fill={`url(#${gid}-v)`}
                  rx={2}
                  filter={isSelected ? `url(#${gid}-glow)` : undefined}
                >
                  <title>
                    {bin.lo.toFixed(1)}–{bin.hi.toFixed(1)}: {bin.n}
                  </title>
                </rect>
              </g>
            )
          })}
          <text x={pad.l} y={height - 10} className="axis-label">
            {model.bins[0]?.label}
          </text>
          <text x={width - pad.r} y={height - 10} textAnchor="end" className="axis-label">
            {model.bins[model.bins.length - 1]?.label}
          </text>
          <text x={16} y={pad.t + 8} className="axis-label value-label">
            {max}
          </text>
        </svg>
      </div>
    </div>
  )
}

export function BarChart({ model, selected, onSelect, palette }: { model: BarModel } & Selectable) {
  const width = 640
  const labelW = 148
  const valueW = 52
  const padL = labelW + 8
  const padR = valueW + 8
  const padT = 8
  const padB = 28
  const rowH = 40
  const height = padT + padB + model.items.length * rowH
  const max = Math.max(...model.items.map((item) => item.n), 1)
  const plotW = width - padL - padR
  const fill = palette?.primary ?? 'var(--accent)'
  const tip = palette?.secondary ?? fill
  const ticks = 4
  const gid = 'bar-grad'

  return (
    <div className="chart-instrument">
      <div className="chart-scroll chart-h">
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label={`Counts of ${model.column}`}>
          <GradientDefs id={gid} from={fill} to={tip} />
          {Array.from({ length: ticks + 1 }, (_, index) => {
            const value = (max * index) / ticks
            const x = padL + (value / max) * plotW
            return (
              <g key={value}>
                <line x1={x} x2={x} y1={padT} y2={height - padB} className="grid-line" />
                <text x={x} y={height - 10} textAnchor="middle" className="axis-label">
                  {Math.round(value)}
                </text>
              </g>
            )
          })}
          {model.items.map((item, index) => {
            const top = padT + index * rowH
            const mid = top + rowH / 2
            const key = item.label
            const active = !selected || selected === key
            const isSelected = selected === key
            const barW = Math.max(item.n > 0 ? 3 : 0, (item.n / max) * plotW)
            return (
              <g
                key={key}
                className={onSelect ? 'bar-row' : undefined}
                opacity={active ? 1 : 0.22}
                {...rowHandlers(key, selected, onSelect)}
              >
                {isSelected && (
                  <rect x={2} y={top + 2} width={width - 4} height={rowH - 4} rx={6} className="bar-row-focus" />
                )}
                <rect x={padL} y={mid - 8} width={plotW} height={16} rx={4} fill="var(--bar-track)" opacity={0.9} />
                <text
                  x={labelW - 4}
                  y={mid + 4}
                  textAnchor="end"
                  className={isSelected ? 'axis-label hot' : 'axis-label'}
                >
                  {ellipsize(item.label, 18)}
                </text>
                <rect
                  className={isSelected ? 'hud-bar is-hot' : 'hud-bar'}
                  x={padL}
                  y={mid - 8}
                  width={barW}
                  height={16}
                  rx={4}
                  fill={`url(#${gid})`}
                  filter={isSelected ? `url(#${gid}-glow)` : undefined}
                >
                  <title>
                    {item.label}: {item.n}
                  </title>
                </rect>
                <text x={width - 6} y={mid + 4} textAnchor="end" className="axis-label value-label">
                  {item.n}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}

export function BoxChart({ model, selected, onSelect, palette }: { model: BoxModel } & Selectable) {
  const width = Math.max(640, model.groups.length * 72 + 60)
  const height = 320
  const pad = { l: 48, r: 16, t: 16, b: 72 }
  const values = model.groups.flatMap((group) => [group.low, group.high, ...group.outliers])
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const yOf = (value: number) => pad.t + ((max - value) / span) * (height - pad.t - pad.b)
  const slot = (width - pad.l - pad.r) / model.groups.length
  const stroke = palette?.primary ?? 'var(--accent)'
  const median = palette?.warn ?? 'var(--warn)'
  const outlier = palette?.bad ?? 'var(--bad)'
  const gid = 'box-glow'

  return (
    <div className="chart-instrument">
      <div className="chart-scroll chart-h">
        <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={`Boxplot of ${model.column}`}>
          <defs>
            <filter id={gid} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {Array.from({ length: 5 }, (_, index) => {
            const y = pad.t + ((height - pad.t - pad.b) * index) / 4
            return <line key={y} x1={pad.l} x2={width - pad.r} y1={y} y2={y} className="grid-line" opacity={0.5} />
          })}
          {model.groups.map((group, index) => {
            const x = pad.l + index * slot + slot / 2
            const key = group.name
            const active = !selected || selected === key
            const isSelected = selected === key
            return (
              <g
                key={key}
                className={onSelect ? 'bar-row' : undefined}
                opacity={active ? 1 : 0.22}
                {...rowHandlers(key, selected, onSelect)}
              >
                {isSelected && (
                  <rect
                    x={x - slot / 2 + 4}
                    y={pad.t - 4}
                    width={Math.max(slot - 8, 28)}
                    height={height - pad.t - pad.b + 8}
                    rx={6}
                    className="bar-row-focus"
                  />
                )}
                <line x1={x} x2={x} y1={yOf(group.high)} y2={yOf(group.low)} stroke="var(--muted)" strokeWidth={1.25} />
                <rect
                  x={x - 14}
                  y={yOf(group.q3)}
                  width={28}
                  height={Math.max(yOf(group.q1) - yOf(group.q3), 2)}
                  fill="var(--panel-2)"
                  stroke={stroke}
                  strokeWidth={isSelected ? 2 : 1.25}
                  filter={isSelected ? `url(#${gid})` : undefined}
                />
                <line
                  x1={x - 14}
                  x2={x + 14}
                  y1={yOf(group.median)}
                  y2={yOf(group.median)}
                  stroke={median}
                  strokeWidth={2.5}
                />
                {group.outliers.map((value, outlierIndex) => (
                  <circle key={outlierIndex} cx={x} cy={yOf(value)} r={2.5} fill={outlier} opacity={0.9} />
                ))}
                <text
                  x={x}
                  y={height - 52}
                  textAnchor="end"
                  className={isSelected ? 'axis-label hot' : 'axis-label'}
                  transform={`rotate(-50 ${x} ${height - 52})`}
                >
                  {ellipsize(group.name, 16)}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}

export function ScatterChart({ model, selected, onSelect, palette }: { model: ScatterModel } & Selectable) {
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
  const fill = palette?.secondary ?? 'var(--stage-2)'
  const line = palette?.bad ?? 'var(--bad)'
  const selectedPoint = selected ? model.points.find((point) => String(point.index) === selected) : null

  return (
    <div className="chart-instrument">
      <div className="chart-scroll chart-h">
        <svg viewBox={`0 0 ${width} ${height}`} className="stat-svg" role="img" aria-label={`${model.yCol} versus ${model.xCol}`}>
          <defs>
            <filter id="scatter-glow" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {Array.from({ length: 5 }, (_, index) => {
            const y = pad.t + ((height - pad.t - pad.b) * index) / 4
            return <line key={`h-${y}`} x1={pad.l} x2={width - pad.r} y1={y} y2={y} className="grid-line" opacity={0.45} />
          })}
          {Array.from({ length: 5 }, (_, index) => {
            const x = pad.l + ((width - pad.l - pad.r) * index) / 4
            return <line key={`v-${x}`} x1={x} x2={x} y1={pad.t} y2={height - pad.b} className="grid-line" opacity={0.35} />
          })}
          <line
            x1={xOf(xMin)}
            y1={yOf(y1)}
            x2={xOf(xMax)}
            y2={yOf(y2)}
            stroke={line}
            strokeWidth={2}
            strokeDasharray="4 3"
            opacity={0.85}
          />
          {model.points.map((point) => {
            const key = String(point.index)
            const active = !selected || selected === key
            const isSelected = selected === key
            return (
              <circle
                key={key}
                cx={xOf(point.x)}
                cy={yOf(point.y)}
                r={isSelected ? 6 : 3}
                fill={fill}
                opacity={active ? (isSelected ? 1 : 0.65) : 0.12}
                className={onSelect ? 'scatter-hit' : undefined}
                filter={isSelected ? 'url(#scatter-glow)' : undefined}
                {...rowHandlers(key, selected, onSelect)}
              >
                <title>
                  {model.xCol} {point.x.toFixed(2)} · {model.yCol} {point.y.toFixed(2)}
                </title>
              </circle>
            )
          })}
          {selectedPoint && (
            <g pointerEvents="none">
              <line
                x1={pad.l}
                x2={width - pad.r}
                y1={yOf(selectedPoint.y)}
                y2={yOf(selectedPoint.y)}
                stroke="var(--accent)"
                strokeOpacity={0.35}
                strokeDasharray="3 4"
              />
              <line
                x1={xOf(selectedPoint.x)}
                x2={xOf(selectedPoint.x)}
                y1={pad.t}
                y2={height - pad.b}
                stroke="var(--accent)"
                strokeOpacity={0.35}
                strokeDasharray="3 4"
              />
            </g>
          )}
          <text x={pad.l} y={height - 10} className="axis-label">
            {model.xCol}
          </text>
          <text x={8} y={18} className="axis-label">
            {model.yCol}
          </text>
        </svg>
      </div>
    </div>
  )
}

export function CorrChart({ model, selected, onSelect, palette }: { model: CorrModel } & Selectable) {
  const size = 42
  const pad = 128
  const width = pad + model.labels.length * size + 16
  const height = 28 + model.labels.length * size + 8
  const positive = palette?.primary ?? 'var(--accent)'
  const negative = palette?.bad ?? 'var(--bad)'
  const base = 'var(--panel-2)'

  return (
    <div className="chart-instrument">
      <div className="chart-scroll chart-h">
        <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label="Correlation heatmap">
          {model.labels.map((label, index) => (
            <text key={label} x={pad - 6} y={34 + index * size} textAnchor="end" className="axis-label">
              {ellipsize(label, 16)}
            </text>
          ))}
          {model.matrix.map((row, rowIndex) =>
            row.map((value, colIndex) => {
              if (colIndex < rowIndex || value == null) return null
              const key = `${rowIndex}:${colIndex}`
              const x = pad + colIndex * size
              const y = 16 + rowIndex * size
              const active = !selected || selected === key
              const isSelected = selected === key
              return (
                <g
                  key={key}
                  opacity={active ? 1 : 0.22}
                  className={onSelect ? 'bar-row' : undefined}
                  {...rowHandlers(key, selected, onSelect)}
                >
                  {isSelected && (
                    <rect x={x - 2} y={y - 2} width={size + 1} height={size + 1} rx={6} className="bar-row-focus" />
                  )}
                  <rect
                    x={x}
                    y={y}
                    width={size - 3}
                    height={size - 3}
                    rx={5}
                    fill={corrColor(value, base, positive, negative)}
                    className={isSelected ? 'hud-bar is-hot' : undefined}
                  />
                  <text x={x + (size - 3) / 2} y={y + 22} textAnchor="middle" className="corr-num">
                    {value.toFixed(2)}
                  </text>
                </g>
              )
            }),
          )}
        </svg>
      </div>
    </div>
  )
}

function corrColor(value: number, base: string, positive: string, negative: string): string {
  const t = Math.max(-1, Math.min(1, value))
  if (t >= 0) return mixCss(base, positive, t)
  return mixCss(base, negative, -t)
}

/** Approximate mix when colors are hex; fall back to positive/negative stop. */
function mixCss(from: string, to: string, t: number): string {
  if (from.startsWith('#') && to.startsWith('#')) return mixColor(from, to, t)
  if (t < 0.15) return from
  if (t > 0.85) return to
  return to
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
