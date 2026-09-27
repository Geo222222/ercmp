import type { CrewCounts, CrewSummaryRow, CleaningMode } from '../types'
import { formatInt, shortStage } from '../lib/format'

type Props = {
  rows: CrewSummaryRow[]
  stageLabels: string[]
  counts: CrewCounts
  mode: CleaningMode
  flagCount?: number
  selectedCrew?: string | null
  onSelectCrew?: (crew: string | null) => void
}

type Insight = {
  key: string
  tone: 'good' | 'bad' | 'warn' | 'neutral'
  label: string
  title: string
  copy: string
  crew?: string
  metrics?: { label: string; value: string }[]
}

export function Briefing({
  rows,
  stageLabels,
  counts,
  mode,
  flagCount = 0,
  selectedCrew = null,
  onSelectCrew,
}: Props) {
  const insights = buildInsights(rows, stageLabels, flagCount)
  const account = buildAccounting(counts, mode)

  function activate(insight: Insight) {
    if (!onSelectCrew || !insight.crew) return
    onSelectCrew(selectedCrew === insight.crew ? null : insight.crew)
  }

  return (
    <section className="panel briefing span-2">
      <div className="briefing-head">
        <div>
          <p className="kicker">Briefing</p>
          <h2>Situation</h2>
        </div>
        <p className="insight-copy">
          {rows.length === 0
            ? 'No crews in view'
            : `${formatInt(rows.length)} crews ranked · ${mode === 'cleaned' ? 'field-cleaned' : 'raw clocks'}`}
        </p>
      </div>

      {insights.length === 0 ? (
        <div className="insight warn">
          <p className="insight-label">Empty board</p>
          <p className="insight-title">No jobs remain after filtering</p>
          <p className="insight-copy">
            Lower the minimum jobs per crew, widen parish or job-type filters, or pick more crews.
          </p>
        </div>
      ) : (
        <div className="insight-grid">
          {insights.map((insight) => {
            const actionable = Boolean(insight.crew && onSelectCrew)
            const active = insight.crew != null && selectedCrew === insight.crew
            const className = `insight ${insight.tone}${actionable ? ' insight-action' : ''}${active ? ' on' : ''}`
            const body = (
              <>
                <p className="insight-label">{insight.label}</p>
                <p className="insight-title">{insight.title}</p>
                <p className="insight-copy">{insight.copy}</p>
                {insight.metrics && insight.metrics.length > 0 && (
                  <div className="metric-row">
                    {insight.metrics.map((metric) => (
                      <div key={metric.label} className="metric-chip">
                        <span>{metric.label}</span>
                        <strong>{metric.value}</strong>
                      </div>
                    ))}
                  </div>
                )}
                {actionable && (
                  <span className="insight-hint">{active ? 'Focused' : 'Tap to focus'}</span>
                )}
              </>
            )
            if (actionable) {
              return (
                <button
                  key={insight.key}
                  type="button"
                  className={className}
                  onClick={() => activate(insight)}
                  aria-pressed={active}
                >
                  {body}
                </button>
              )
            }
            return (
              <article key={insight.key} className={className}>
                {body}
              </article>
            )
          })}
        </div>
      )}

      <div className="account-block">
        <p className="insight-label">Data accounting</p>
        <div className="account-grid">
          {account.items.map((item) => (
            <div key={item.label} className="account-item">
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
        <p className="account-note">{account.note}</p>
      </div>
    </section>
  )
}

function buildInsights(rows: CrewSummaryRow[], stageLabels: string[], flagCount: number): Insight[] {
  if (rows.length === 0) return []

  const fastest = rows[0]
  const slowest = rows[rows.length - 1]
  const insights: Insight[] = [
    {
      key: 'fast',
      tone: 'good',
      label: 'Fastest',
      title: fastest.crew,
      crew: fastest.crew,
      copy: 'Lowest average total time in the current comparison.',
      metrics: [
        { label: 'Avg', value: `${fastest.avg.toFixed(1)} min` },
        { label: 'Median', value: `${fastest.median.toFixed(1)} min` },
        { label: 'Jobs', value: formatInt(fastest.jobs) },
      ],
    },
  ]

  if (rows.length > 1) {
    const ratio = fastest.avg > 0 ? slowest.avg / fastest.avg : 0
    insights.push({
      key: 'slow',
      tone: 'bad',
      label: 'Slowest',
      title: slowest.crew,
      crew: slowest.crew,
      copy: ratio > 0 ? `${ratio.toFixed(1)}× slower than ${fastest.crew}.` : 'Highest average total time on this board.',
      metrics: [
        { label: 'Avg', value: `${slowest.avg.toFixed(1)} min` },
        { label: 'Median', value: `${slowest.median.toFixed(1)} min` },
        { label: 'Jobs', value: formatInt(slowest.jobs) },
      ],
    })

    if (stageLabels.length > 0 && fastest.stageAvgs.length === stageLabels.length) {
      let gapIndex = 0
      let gap = -Infinity
      fastest.stageAvgs.forEach((_, index) => {
        const diff = slowest.stageAvgs[index] - fastest.stageAvgs[index]
        if (diff > gap) {
          gap = diff
          gapIndex = index
        }
      })
      insights.push({
        key: 'gap',
        tone: 'neutral',
        label: 'Bottleneck stage',
        title: shortStage(stageLabels[gapIndex]),
        crew: slowest.crew,
        copy: `Largest gap between ${slowest.crew} and ${fastest.crew} — tap to focus the slower crew.`,
        metrics: [
          { label: 'Slowest', value: `${slowest.stageAvgs[gapIndex].toFixed(1)} min` },
          { label: 'Fastest', value: `${fastest.stageAvgs[gapIndex].toFixed(1)} min` },
          { label: 'Gap', value: `${gap.toFixed(1)} min` },
        ],
      })
    }
  }

  const thin = rows.filter((row) => row.jobs < 20)
  if (thin.length > 0) {
    const names =
      thin.length > 4
        ? `${formatInt(thin.length)} crews`
        : thin.map((row) => row.crew).join(', ')
    insights.push({
      key: 'thin',
      tone: 'warn',
      label: 'Thin samples',
      title: names,
      crew: thin.length === 1 ? thin[0].crew : undefined,
      copy:
        thin.length > 4
          ? 'Fewer than 20 jobs each — treat rankings as indicative. Prefer 20+ for a steadier board.'
          : 'Fewer than 20 jobs in this comparison — treat ranking as indicative rather than conclusive.',
      metrics: [{ label: 'Crews', value: formatInt(thin.length) }],
    })
  }

  if (flagCount > 0) {
    insights.push({
      key: 'clocks',
      tone: 'warn',
      label: 'Clock quality',
      title: `${formatInt(flagCount)} crew-months flagged`,
      copy: 'Repeated backward stamps — open Negative timestamps below and tap a flag to focus that crew.',
      metrics: [{ label: 'Flags', value: formatInt(flagCount) }],
    })
  }

  return insights
}

function buildAccounting(counts: CrewCounts, mode: CleaningMode): {
  items: { label: string; value: string }[]
  note: string
} {
  if (counts.filtered === 0) {
    return {
      items: [{ label: 'Filtered jobs', value: '0' }],
      note: 'No jobs match the current filters.',
    }
  }

  if (mode === 'cleaned') {
    return {
      items: [
        { label: 'In filters', value: formatInt(counts.filtered) },
        { label: 'Complete stamps', value: formatInt(counts.complete) },
        { label: 'Clock reverse', value: formatInt(counts.negative) },
        { label: 'Short completions', value: formatInt(counts.droppedBatch) },
        { label: 'Slowest 1%', value: formatInt(counts.droppedOutlierCleaned) },
        { label: 'Remain', value: formatInt(counts.cleaned) },
      ],
      note: 'The board uses every complete job except Enroute-to-completion times under 5 minutes. Backward clocks remain visible and are flagged below.',
    }
  }

  return {
    items: [
      { label: 'In filters', value: formatInt(counts.filtered) },
      { label: 'Complete stamps', value: formatInt(counts.complete) },
      { label: 'Neg. totals', value: formatInt(counts.negative) },
      { label: 'Slowest 1%', value: formatInt(counts.droppedOutlierRaw) },
      { label: 'Remain', value: formatInt(counts.raw) },
    ],
    note: 'Raw clocks keep stage-level problems, drop negative overall totals, then remove the slowest 1% before the minimum-jobs cut.',
  }
}
