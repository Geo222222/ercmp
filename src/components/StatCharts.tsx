import type { KeyboardEvent, ReactNode } from 'react'
import type { BarModel, BoxModel, CorrModel, HistModel, ScatterModel } from '../lib/stats'
import { categoryLabel } from '../lib/stats'
import { ellipsize, formatInt } from '../lib/format'

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

const ARC_TOP = 6

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

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

/** Donut wedge from startAngle→endAngle (degrees, 0 = top, clockwise). */
function donutSlice(
  cx: number,
  cy: number,
  rInner: number,
  rOuter: number,
  startAngle: number,
  endAngle: number,
): string {
  const sweep = Math.max(endAngle - startAngle, 0.001)
  const large = sweep > 180 ? 1 : 0
  const o0 = polar(cx, cy, rOuter, startAngle)
  const o1 = polar(cx, cy, rOuter, endAngle)
  const i1 = polar(cx, cy, rInner, endAngle)
  const i0 = polar(cx, cy, rInner, startAngle)
  return [
    `M ${o0.x} ${o0.y}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${o1.x} ${o1.y}`,
    `L ${i1.x} ${i1.y}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${i0.x} ${i0.y}`,
    'Z',
  ].join(' ')
}

function GlowDefs({ id }: { id: string }) {
  return (
    <defs>
      <filter id={`${id}-glow`} x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="2.4" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <linearGradient id={`${id}-rail`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
        <stop offset="100%" stopColor="var(--accent)" stopOpacity={1} />
      </linearGradient>
      <linearGradient id={`${id}-area`} x1="0" y1="1" x2="0" y2="0">
        <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.05} />
        <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.55} />
      </linearGradient>
    </defs>
  )
}

function InstrumentShell({
  children,
  label,
  scroll = true,
}: {
  children: ReactNode
  label: string
  scroll?: boolean
}) {
  return (
    <div className="chart-instrument" data-kind={label}>
      <div className={scroll ? 'chart-scroll chart-h' : 'chart-scroll chart-static'}>{children}</div>
    </div>
  )
}

/**
 * Share mode — arc composition + always-visible ranked density rails.
 */
export function BarChart({ model, selected, onSelect, palette }: { model: BarModel } & Selectable) {
  const width = 680
  const heroH = 200
  const cx = 118
  const cy = 108
  const rOuter = 78
  const rInner = 50
  const total = model.total || 1
  const top = model.items.slice(0, ARC_TOP)
  const topSum = top.reduce((sum, item) => sum + item.n, 0)
  const rest = Math.max(0, total - topSum)
  const fill = palette?.primary ?? 'var(--accent)'
  const remainder = palette?.muted ?? 'var(--faint)'
  const selectedItem = selected ? model.items.find((item) => item.label === selected) : null
  const centerValue = selectedItem ? selectedItem.n : total
  const centerLabel = selectedItem
    ? `${((selectedItem.n / total) * 100).toFixed(0)}% · ${categoryLabel(selectedItem.label)}`
    : `${model.column} · ${formatInt(model.items.length)} cats`
  const gid = 'share-arc'

  const wedges: { key: string; n: number; start: number; end: number; color: string; selectable: boolean }[] = []
  let angle = 0
  top.forEach((item, index) => {
    const sweep = (item.n / total) * 360
    const t = top.length <= 1 ? 1 : index / (top.length - 1)
    wedges.push({
      key: item.label,
      n: item.n,
      start: angle,
      end: angle + sweep,
      color: mixStops(fill, palette?.secondary ?? fill, t),
      selectable: true,
    })
    angle += sweep
  })
  if (rest > 0) {
    wedges.push({
      key: '__rest__',
      n: rest,
      start: angle,
      end: 360,
      color: remainder,
      selectable: false,
    })
  }

  const railH = Math.max(36, Math.min(44, 320 / Math.max(model.items.length, 1)))
  const railsHeight = 28 + model.items.length * railH + 12
  const trackL = 168
  const trackR = width - 96
  const trackW = trackR - trackL

  return (
    <InstrumentShell label="share-arc" scroll={false}>
      <div className="share-instrument">
        <div className="share-arc-panel">
          <svg
            viewBox={`0 0 ${width} ${heroH}`}
            width="100%"
            height={heroH}
            className="stat-svg"
            role="img"
            aria-label={`Share composition for ${model.column}`}
          >
            <GlowDefs id={gid} />
            <text x={16} y={22} className="hud-kicker">
              SHARE COMPOSITION · TOP {Math.min(ARC_TOP, model.items.length)}
            </text>
            <circle cx={cx} cy={cy} r={rOuter + 6} fill="none" stroke="var(--line)" strokeWidth={1} opacity={0.7} />
            <circle cx={cx} cy={cy} r={rInner - 4} fill="var(--panel-2)" stroke="var(--line)" strokeWidth={1} />

            {wedges.map((wedge) => {
              if (wedge.end - wedge.start < 0.2) return null
              const isSelected = selected === wedge.key
              const active = !selected || selected === wedge.key || wedge.key === '__rest__'
              const path = donutSlice(cx, cy, rInner, rOuter, wedge.start, wedge.end)
              const shown = wedge.key === '__rest__' ? 'Other' : categoryLabel(wedge.key)
              return (
                <path
                  key={wedge.key}
                  d={path}
                  fill={wedge.color}
                  opacity={active ? (isSelected ? 1 : wedge.key === '__rest__' ? 0.35 : 0.85) : 0.18}
                  stroke="var(--bg-elevated)"
                  strokeWidth={1.5}
                  filter={isSelected ? `url(#${gid}-glow)` : undefined}
                  className={wedge.selectable ? 'hud-wedge' : undefined}
                  {...(wedge.selectable ? rowHandlers(wedge.key, selected, onSelect) : {})}
                >
                  <title>
                    {shown}: {wedge.n}
                  </title>
                </path>
              )
            })}

            <text x={cx} y={cy - 4} textAnchor="middle" className="hud-mega">
              {formatInt(centerValue)}
            </text>
            <text x={cx} y={cy + 16} textAnchor="middle" className="hud-sub">
              {ellipsize(centerLabel, 22)}
            </text>

            {top.map((item, index) => {
              const x = 230
              const y = 44 + index * 28
              const isSelected = selected === item.label
              const active = !selected || selected === item.label
              const share = (item.n / total) * 100
              const shown = categoryLabel(item.label)
              return (
                <g
                  key={`leg-${item.label}`}
                  opacity={active ? 1 : 0.28}
                  className="bar-row"
                  {...rowHandlers(item.label, selected, onSelect)}
                >
                  <rect
                    x={x}
                    y={y - 12}
                    width={width - x - 16}
                    height={26}
                    rx={6}
                    className={isSelected ? 'bar-row-focus' : undefined}
                    fill={isSelected ? undefined : 'transparent'}
                  />
                  <circle
                    cx={x + 10}
                    cy={y + 1}
                    r={5}
                    fill={mixStops(fill, palette?.secondary ?? fill, index / Math.max(top.length - 1, 1))}
                  />
                  <text x={x + 24} y={y + 5} className={isSelected ? 'hud-rail-label hot' : 'hud-rail-label'}>
                    {ellipsize(shown, 18)}
                  </text>
                  <text x={width - 88} y={y + 5} textAnchor="end" className="hud-callout">
                    {formatInt(item.n)}
                  </text>
                  <text x={width - 24} y={y + 5} textAnchor="end" className="hud-micro">
                    {share.toFixed(1)}%
                  </text>
                </g>
              )
            })}
            {rest > 0 && (
              <text x={230} y={44 + top.length * 28 + 6} className="axis-label">
                +{formatInt(rest)} outside top {top.length} · see rails
              </text>
            )}
            {model.missing > 0 && (
              <text x={16} y={heroH - 10} className="hud-micro">
                {formatInt(model.missing)} unassigned in bucket
              </text>
            )}
          </svg>
        </div>

        <div className="share-rails-panel">
          <div className="share-rails-head">
            <p className="hud-kicker-html">Ranked density rails</p>
            <span className="share-rails-meta">
              {formatInt(model.items.length)}
              {model.hidden > 0 ? `+${formatInt(model.hidden)}` : ''} · tap rail to lock
            </span>
          </div>
          <div className="share-rails-scroll chart-h">
            <svg
              viewBox={`0 0 ${width} ${railsHeight}`}
              width="100%"
              height={railsHeight}
              className="stat-svg"
              role="img"
              aria-label={`Density rails for ${model.column}`}
            >
              <GlowDefs id={`${gid}-rails`} />
              {model.items.map((item, index) => {
                const topY = 8 + index * railH
                const mid = topY + railH / 2
                const key = item.label
                const share = item.n / total
                const markerX = trackL + Math.max(share * trackW, share > 0 ? 4 : 0)
                const isSelected = selected === key
                const active = !selected || selected === key
                const shown = categoryLabel(item.label)
                return (
                  <g
                    key={key}
                    className="bar-row density-rail"
                    opacity={active ? 1 : 0.22}
                    {...rowHandlers(key, selected, onSelect)}
                  >
                    {isSelected && (
                      <rect x={8} y={topY + 2} width={width - 16} height={railH - 4} rx={8} className="bar-row-focus" />
                    )}
                    <text x={40} y={mid + 5} textAnchor="end" className="hud-rank">
                      {String(index + 1).padStart(2, '0')}
                    </text>
                    <text x={52} y={mid + 5} className={isSelected ? 'hud-rail-label hot' : 'hud-rail-label'}>
                      {ellipsize(shown, 14)}
                    </text>
                    <line
                      x1={trackL}
                      x2={trackR}
                      y1={mid}
                      y2={mid}
                      stroke="var(--bar-track)"
                      strokeWidth={8}
                      strokeLinecap="round"
                    />
                    <line
                      x1={trackL}
                      x2={markerX}
                      y1={mid}
                      y2={mid}
                      stroke={`url(#${gid}-rails-rail)`}
                      strokeWidth={8}
                      strokeLinecap="round"
                      filter={isSelected ? `url(#${gid}-rails-glow)` : undefined}
                    />
                    <circle
                      cx={markerX}
                      cy={mid}
                      r={isSelected ? 8 : 6}
                      fill="var(--accent)"
                      stroke="var(--bg-elevated)"
                      strokeWidth={2}
                      filter={isSelected ? `url(#${gid}-rails-glow)` : undefined}
                    />
                    <text x={width - 20} y={mid + 1} textAnchor="end" className="hud-callout">
                      {formatInt(item.n)}
                    </text>
                    <text x={width - 20} y={mid + 14} textAnchor="end" className="hud-micro">
                      {(share * 100).toFixed(1)}%
                    </text>
                    <title>
                      {shown}: {item.n} ({(share * 100).toFixed(1)}%)
                    </title>
                  </g>
                )
              })}
            </svg>
          </div>
        </div>
      </div>
    </InstrumentShell>
  )
}

/** Histogram as a density silhouette / signal field with peak lock. */
export function HistogramChart({ model, selected, onSelect, palette }: { model: HistModel } & Selectable) {
  const width = 720
  const height = 340
  const pad = { l: 48, r: 20, t: 36, b: 40 }
  const max = Math.max(...model.bins.map((bin) => bin.n), 1)
  const innerW = width - pad.l - pad.r
  const innerH = height - pad.t - pad.b
  const step = innerW / Math.max(model.bins.length - 1, 1)
  const fill = palette?.primary ?? 'var(--accent)'
  const gid = 'hist-sig'
  const peakIndex = model.bins.reduce((best, bin, index, arr) => (bin.n > arr[best].n ? index : best), 0)
  const points = model.bins.map((bin, index) => {
    const x = pad.l + index * step
    const y = pad.t + innerH - (bin.n / max) * innerH
    return `${x},${y}`
  })
  const area = [
    `${pad.l},${pad.t + innerH}`,
    ...points,
    `${pad.l + (model.bins.length - 1) * step},${pad.t + innerH}`,
  ].join(' ')

  return (
    <InstrumentShell label="density-signal">
      <svg viewBox={`0 0 ${width} ${height}`} className="stat-svg" role="img" aria-label={`Density of ${model.column}`}>
        <GlowDefs id={gid} />
        <text x={pad.l} y={22} className="hud-kicker">
          DENSITY SIGNAL · {formatInt(model.total)} VALUES
        </text>
        {Array.from({ length: 4 }, (_, index) => {
          const y = pad.t + (innerH * index) / 3
          return <line key={y} x1={pad.l} x2={width - pad.r} y1={y} y2={y} className="grid-line" opacity={0.45} />
        })}
        <polygon points={area} fill={`url(#${gid}-area)`} />
        <polyline
          points={points.join(' ')}
          fill="none"
          stroke={fill}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          filter={`url(#${gid}-glow)`}
        />
        {model.bins.map((bin, index) => {
          const key = String(index)
          const x = pad.l + index * step
          const y = pad.t + innerH - (bin.n / max) * innerH
          const isSelected = selected === key
          const active = !selected || selected === key
          const isPeak = index === peakIndex
          return (
            <g key={key} opacity={active ? 1 : 0.2} className="bar-row" {...rowHandlers(key, selected, onSelect)}>
              {(isSelected || (isPeak && !selected)) && (
                <line x1={x} x2={x} y1={y} y2={pad.t + innerH} stroke="var(--accent)" strokeOpacity={0.35} strokeDasharray="3 4" />
              )}
              <circle
                cx={x}
                cy={y}
                r={isSelected ? 7 : isPeak ? 5 : 3.5}
                fill={isSelected || isPeak ? 'var(--accent)' : fill}
                stroke="var(--bg-elevated)"
                strokeWidth={isSelected ? 2 : 1}
                filter={isSelected ? `url(#${gid}-glow)` : undefined}
              />
              <title>
                {bin.lo.toFixed(1)}–{bin.hi.toFixed(1)}: {bin.n}
              </title>
            </g>
          )
        })}
        <text x={pad.l} y={height - 12} className="axis-label">
          {model.bins[0]?.label}
        </text>
        <text x={width - pad.r} y={height - 12} textAnchor="end" className="axis-label">
          {model.bins[model.bins.length - 1]?.label}
        </text>
        <text x={width - pad.r} y={28} textAnchor="end" className="hud-callout">
          peak {formatInt(model.bins[peakIndex]?.n ?? 0)}
        </text>
      </svg>
    </InstrumentShell>
  )
}

/** Box as range towers with median fireline. */
export function BoxChart({ model, selected, onSelect, palette }: { model: BoxModel } & Selectable) {
  const width = Math.max(680, model.groups.length * 88 + 80)
  const height = 340
  const pad = { l: 52, r: 20, t: 36, b: 78 }
  const values = model.groups.flatMap((group) => [group.low, group.high, ...group.outliers])
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const yOf = (value: number) => pad.t + ((max - value) / span) * (height - pad.t - pad.b)
  const slot = (width - pad.l - pad.r) / model.groups.length
  const stroke = palette?.primary ?? 'var(--accent)'
  const median = palette?.warn ?? 'var(--warn)'
  const outlier = palette?.bad ?? 'var(--bad)'
  const gid = 'box-towers'

  return (
    <InstrumentShell label="range-towers">
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={`Range towers of ${model.column}`}>
        <GlowDefs id={gid} />
        <text x={pad.l} y={22} className="hud-kicker">
          RANGE TOWERS · {model.column.toUpperCase()}
        </text>
        {Array.from({ length: 5 }, (_, index) => {
          const y = pad.t + ((height - pad.t - pad.b) * index) / 4
          return <line key={y} x1={pad.l} x2={width - pad.r} y1={y} y2={y} className="grid-line" opacity={0.45} />
        })}
        {model.groups.map((group, index) => {
          const x = pad.l + index * slot + slot / 2
          const key = group.name
          const active = !selected || selected === key
          const isSelected = selected === key
          const towerW = Math.min(36, slot * 0.45)
          return (
            <g
              key={key}
              className="bar-row"
              opacity={active ? 1 : 0.2}
              {...rowHandlers(key, selected, onSelect)}
            >
              {isSelected && (
                <rect
                  x={x - slot / 2 + 6}
                  y={pad.t - 6}
                  width={Math.max(slot - 12, 40)}
                  height={height - pad.t - pad.b + 12}
                  rx={8}
                  className="bar-row-focus"
                />
              )}
              <line x1={x} x2={x} y1={yOf(group.high)} y2={yOf(group.low)} stroke="var(--muted)" strokeWidth={1.5} />
              <line x1={x - 10} x2={x + 10} y1={yOf(group.high)} y2={yOf(group.high)} stroke="var(--muted)" />
              <line x1={x - 10} x2={x + 10} y1={yOf(group.low)} y2={yOf(group.low)} stroke="var(--muted)" />
              <rect
                x={x - towerW / 2}
                y={yOf(group.q3)}
                width={towerW}
                height={Math.max(yOf(group.q1) - yOf(group.q3), 3)}
                rx={3}
                fill="var(--panel-2)"
                stroke={stroke}
                strokeWidth={isSelected ? 2.25 : 1.5}
                filter={isSelected ? `url(#${gid}-glow)` : undefined}
              />
              <line
                x1={x - towerW / 2}
                x2={x + towerW / 2}
                y1={yOf(group.median)}
                y2={yOf(group.median)}
                stroke={median}
                strokeWidth={3}
              />
              {group.outliers.map((value, outlierIndex) => (
                <circle key={outlierIndex} cx={x} cy={yOf(value)} r={2.75} fill={outlier} opacity={0.9} />
              ))}
              <text x={x} y={height - 48} textAnchor="middle" className={isSelected ? 'hud-rail-label hot' : 'hud-rail-label'}>
                {ellipsize(categoryLabel(group.name), 12)}
              </text>
              <text x={x} y={height - 30} textAnchor="middle" className="hud-micro">
                n={formatInt(group.n)}
              </text>
            </g>
          )
        })}
      </svg>
    </InstrumentShell>
  )
}

/** Scatter as a constellation field with fit vector + target crosshair. */
export function ScatterChart({ model, selected, onSelect, palette }: { model: ScatterModel } & Selectable) {
  const width = 720
  const height = 380
  const pad = { l: 52, r: 20, t: 36, b: 40 }
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
  const gid = 'constellation'

  return (
    <InstrumentShell label="constellation">
      <svg viewBox={`0 0 ${width} ${height}`} className="stat-svg" role="img" aria-label={`${model.yCol} versus ${model.xCol}`}>
        <GlowDefs id={gid} />
        <text x={pad.l} y={22} className="hud-kicker">
          CONSTELLATION · {formatInt(model.total)} PAIRS
        </text>
        {Array.from({ length: 5 }, (_, index) => {
          const y = pad.t + ((height - pad.t - pad.b) * index) / 4
          return <line key={`h-${y}`} x1={pad.l} x2={width - pad.r} y1={y} y2={y} className="grid-line" opacity={0.4} />
        })}
        {Array.from({ length: 5 }, (_, index) => {
          const x = pad.l + ((width - pad.l - pad.r) * index) / 4
          return <line key={`v-${x}`} x1={x} x2={x} y1={pad.t} y2={height - pad.b} className="grid-line" opacity={0.3} />
        })}
        <line
          x1={xOf(xMin)}
          y1={yOf(y1)}
          x2={xOf(xMax)}
          y2={yOf(y2)}
          stroke={line}
          strokeWidth={2}
          strokeDasharray="5 4"
          opacity={0.9}
          filter={`url(#${gid}-glow)`}
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
              r={isSelected ? 7 : 3.25}
              fill={fill}
              opacity={active ? (isSelected ? 1 : 0.55) : 0.1}
              className={onSelect ? 'scatter-hit' : undefined}
              filter={isSelected ? `url(#${gid}-glow)` : undefined}
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
              strokeOpacity={0.4}
              strokeDasharray="3 4"
            />
            <line
              x1={xOf(selectedPoint.x)}
              x2={xOf(selectedPoint.x)}
              y1={pad.t}
              y2={height - pad.b}
              stroke="var(--accent)"
              strokeOpacity={0.4}
              strokeDasharray="3 4"
            />
            <circle
              cx={xOf(selectedPoint.x)}
              cy={yOf(selectedPoint.y)}
              r={12}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={1.25}
              opacity={0.7}
            />
          </g>
        )}
        <text x={pad.l} y={height - 12} className="axis-label">
          {model.xCol}
        </text>
        <text x={8} y={pad.t + 4} className="axis-label">
          {model.yCol}
        </text>
        <text x={width - pad.r} y={22} textAnchor="end" className="hud-callout">
          slope {model.slope.toFixed(3)}
        </text>
      </svg>
    </InstrumentShell>
  )
}

/** Correlation as a link-strength matrix with focus glow. */
export function CorrChart({ model, selected, onSelect, palette }: { model: CorrModel } & Selectable) {
  const size = 48
  const pad = 140
  const width = pad + model.labels.length * size + 24
  const height = 48 + model.labels.length * size + 16
  const positive = palette?.primary ?? 'var(--accent)'
  const negative = palette?.bad ?? 'var(--bad)'
  const gid = 'corr-link'

  return (
    <InstrumentShell label="link-matrix">
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label="Correlation link matrix">
        <GlowDefs id={gid} />
        <text x={16} y={24} className="hud-kicker">
          LINK MATRIX · PEARSON r
        </text>
        {model.labels.map((label, index) => (
          <text key={label} x={pad - 8} y={56 + index * size} textAnchor="end" className="axis-label">
            {ellipsize(label, 16)}
          </text>
        ))}
        {model.labels.map((label, index) => (
          <text
            key={`col-${label}`}
            x={pad + index * size + (size - 4) / 2}
            y={40}
            textAnchor="middle"
            className="hud-micro"
          >
            {ellipsize(label, 8)}
          </text>
        ))}
        {model.matrix.map((row, rowIndex) =>
          row.map((value, colIndex) => {
            if (colIndex < rowIndex || value == null) return null
            const key = `${rowIndex}:${colIndex}`
            const x = pad + colIndex * size
            const y = 44 + rowIndex * size
            const active = !selected || selected === key
            const isSelected = selected === key
            const strength = Math.abs(value)
            return (
              <g
                key={key}
                opacity={active ? 1 : 0.18}
                className="bar-row"
                {...rowHandlers(key, selected, onSelect)}
              >
                {isSelected && (
                  <rect x={x - 3} y={y - 3} width={size + 2} height={size + 2} rx={8} className="bar-row-focus" />
                )}
                <rect
                  x={x}
                  y={y}
                  width={size - 4}
                  height={size - 4}
                  rx={7}
                  fill={corrColor(value, '#163246', positive.startsWith('#') ? positive : '#2ee6c7', negative.startsWith('#') ? negative : '#ff5a6a')}
                  filter={isSelected || strength >= 0.7 ? `url(#${gid}-glow)` : undefined}
                />
                <text x={x + (size - 4) / 2} y={y + 24} textAnchor="middle" className="corr-num">
                  {value.toFixed(2)}
                </text>
              </g>
            )
          }),
        )}
      </svg>
    </InstrumentShell>
  )
}

function mixStops(from: string, to: string, t: number): string {
  if (from.startsWith('#') && to.startsWith('#')) return mixColor(from, to, t)
  return t > 0.5 ? to : from
}

function corrColor(value: number, base: string, positive: string, negative: string): string {
  const t = Math.max(-1, Math.min(1, value))
  if (t >= 0) return mixColor(base, positive, t)
  return mixColor(base, negative, -t)
}

function mixColor(from: string, to: string, t: number): string {
  const a = hex(from)
  const b = hex(to)
  const channel = (index: number) => Math.round(a[index] + (b[index] - a[index]) * t)
  return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`
}

function hex(value: string): [number, number, number] {
  const raw = value.startsWith('#') ? value.slice(1) : value
  if (raw.length < 6) return [32, 80, 96]
  return [parseInt(raw.slice(0, 2), 16), parseInt(raw.slice(2, 4), 16), parseInt(raw.slice(4, 6), 16)]
}
