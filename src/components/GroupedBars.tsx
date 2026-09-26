type Series = {
  name: string
  color: string
  values: number[]
}

type Props = {
  categories: string[]
  series: Series[]
  highlight?: string | null
}

function niceMax(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1
  const padded = value * 1.12
  const power = 10 ** Math.floor(Math.log10(padded))
  return Math.ceil(padded / power) * power
}

export function GroupedBars({ categories, series, highlight }: Props) {
  if (categories.length === 0 || series.length === 0) return null

  const flat = series.flatMap((item) => item.values)
  const minValue = Math.min(0, ...flat)
  const maxValue = Math.max(0, ...flat)
  const useHours = Math.max(Math.abs(minValue), maxValue) >= 180
  const scale = useHours ? 60 : 1
  const unit = useHours ? 'h' : 'm'
  const yMax = niceMax(maxValue / scale)
  const yMin = minValue < 0 ? -niceMax(Math.abs(minValue) / scale) : 0
  const padL = 46
  const padR = 12
  const padT = 18
  const padB = 78
  const slot = Math.max(72, series.length > 1 ? 84 : 68)
  const width = padL + padR + categories.length * slot
  const height = 320
  const plotH = height - padT - padB
  const plotW = width - padL - padR
  const span = yMax - yMin || 1
  const yOf = (value: number) => padT + ((yMax - value) / span) * plotH
  const baseline = yOf(0)
  const ticks = 4

  return (
    <div className="chart-scroll">
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img">
        {Array.from({ length: ticks + 1 }, (_, index) => {
          const value = yMin + ((yMax - yMin) * index) / ticks
          const y = yOf(value)
          return (
            <g key={value}>
              <line x1={padL} x2={padL + plotW} y1={y} y2={y} className="grid-line" />
              <text x={padL - 8} y={y + 4} textAnchor="end" className="axis-label">
                {Number.isInteger(value) ? value : value.toFixed(1)}
                {unit}
              </text>
            </g>
          )
        })}
        <line x1={padL} x2={padL + plotW} y1={baseline} y2={baseline} className="axis-line" />
        {categories.map((category, categoryIndex) => {
          const center = padL + categoryIndex * slot + slot / 2
          const groupWidth = Math.min(slot - 16, series.length * 18)
          const barWidth = groupWidth / series.length
          return (
            <g key={category}>
              {series.map((item, seriesIndex) => {
                const raw = (item.values[categoryIndex] ?? 0) / scale
                const y = yOf(Math.max(raw, 0))
                const barHeight = Math.abs(yOf(raw) - baseline)
                const x = center - groupWidth / 2 + seriesIndex * barWidth
                return (
                  <rect
                    key={item.name}
                    x={x + 1}
                    y={raw >= 0 ? y : baseline}
                    width={Math.max(barWidth - 2, 1)}
                    height={Math.max(barHeight, 0)}
                    fill={item.color}
                    rx={3}
                    opacity={highlight && highlight !== category ? 0.35 : 1}
                  />
                )
              })}
              <text
                x={center}
                y={height - 58}
                textAnchor="end"
                className={highlight === category ? 'axis-label hot' : 'axis-label'}
                transform={`rotate(-55 ${center} ${height - 58})`}
              >
                {category.length > 16 ? `${category.slice(0, 15)}…` : category}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
