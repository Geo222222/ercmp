type Series = {
  name: string
  color: string
  values: number[]
}

type Props = {
  categories: string[]
  series: Series[]
  highlight?: string | null
  onSelect?: (category: string) => void
  /** When true, category taps call onSelect (crew charts). Weather stays non-crew. */
  selectable?: boolean
}

function niceMax(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1
  const padded = value * 1.12
  const power = 10 ** Math.floor(Math.log10(padded))
  return Math.ceil(padded / power) * power
}

export function GroupedBars({ categories, series, highlight, onSelect, selectable = true }: Props) {
  if (categories.length === 0 || series.length === 0) return null

  const flat = series.flatMap((item) => item.values)
  const maxRaw = Math.max(0, ...flat)
  const useHours = maxRaw >= 180
  const scale = useHours ? 60 : 1
  const unit = useHours ? 'h' : 'm'
  const yMax = niceMax(maxRaw / scale)

  const labelW = 128
  const valueW = 56
  const padL = labelW + 8
  const padR = valueW + 8
  const padT = 8
  const padB = 28
  const rowH = Math.max(36, 18 + series.length * 10)
  const width = 640
  const height = padT + padB + categories.length * rowH
  const plotW = width - padL - padR
  const xOf = (value: number) => padL + (value / yMax) * plotW
  const ticks = 4
  const canSelect = Boolean(selectable && onSelect)

  function formatTick(value: number): string {
    const shown = Number.isInteger(value) ? String(value) : value.toFixed(1)
    return `${shown}${unit}`
  }

  function formatValue(raw: number): string {
    const scaled = raw / scale
    if (useHours) {
      let h = Math.floor(scaled)
      let m = Math.round((scaled - h) * 60)
      if (m === 60) {
        h += 1
        m = 0
      }
      if (h === 0) return `${Math.round(raw)}m`
      return m === 0 ? `${h}h` : `${h}h${m}`
    }
    return `${scaled < 10 ? scaled.toFixed(1) : Math.round(scaled)}${unit}`
  }

  function primaryValue(categoryIndex: number): number {
    if (series.length === 1) return series[0].values[categoryIndex] ?? 0
    return Math.max(...series.map((item) => item.values[categoryIndex] ?? 0))
  }

  return (
    <div className="chart-instrument">
      <div className="chart-scroll chart-h">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          height={height}
          role="img"
          aria-label="Crew comparison chart"
        >
          {Array.from({ length: ticks + 1 }, (_, index) => {
            const value = (yMax * index) / ticks
            const x = xOf(value)
            return (
              <g key={value}>
                <line x1={x} x2={x} y1={padT} y2={height - padB} className="grid-line" />
                <text x={x} y={height - 10} textAnchor="middle" className="axis-label">
                  {formatTick(value)}
                </text>
              </g>
            )
          })}

          {categories.map((category, categoryIndex) => {
            const top = padT + categoryIndex * rowH
            const mid = top + rowH / 2
            const active = !highlight || highlight === category
            const selected = highlight === category
            const groupH = Math.min(rowH - 10, series.length * 11)
            const barH = Math.max(6, groupH / series.length - 2)
            const groupTop = mid - groupH / 2

            return (
              <g
                key={category}
                className={canSelect ? 'bar-row' : undefined}
                opacity={active ? 1 : 0.28}
                style={canSelect ? { cursor: 'pointer' } : undefined}
                onClick={canSelect ? () => onSelect?.(category) : undefined}
                role={canSelect ? 'button' : undefined}
                tabIndex={canSelect ? 0 : undefined}
                onKeyDown={
                  canSelect
                    ? (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          onSelect?.(category)
                        }
                      }
                    : undefined
                }
              >
                {selected && (
                  <rect
                    x={2}
                    y={top + 2}
                    width={width - 4}
                    height={rowH - 4}
                    rx={6}
                    className="bar-row-focus"
                  />
                )}
                <text
                  x={labelW - 4}
                  y={mid + 4}
                  textAnchor="end"
                  className={selected ? 'axis-label hot' : 'axis-label'}
                >
                  {category.length > 16 ? `${category.slice(0, 15)}…` : category}
                </text>
                {series.map((item, seriesIndex) => {
                  const raw = item.values[categoryIndex] ?? 0
                  const scaled = Math.max(0, raw / scale)
                  const barW = Math.max(scaled > 0 ? 3 : 0, (scaled / yMax) * plotW)
                  const y = groupTop + seriesIndex * (barH + 2)
                  return (
                    <rect
                      key={item.name}
                      x={padL}
                      y={y}
                      width={barW}
                      height={barH}
                      fill={item.color}
                      rx={2}
                    >
                      <title>
                        {category}: {item.name} {formatValue(raw)}
                      </title>
                    </rect>
                  )
                })}
                <text x={width - 6} y={mid + 4} textAnchor="end" className="axis-label value-label">
                  {formatValue(primaryValue(categoryIndex))}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}
