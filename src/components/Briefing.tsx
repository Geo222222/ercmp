import type { CrewCounts, CrewSummaryRow, CleaningMode } from '../types'
import { formatInt, shortStage } from '../lib/format'

type Props = {
  rows: CrewSummaryRow[]
  stageLabels: string[]
  counts: CrewCounts
  mode: CleaningMode
}

type Insight = {
  key: string
  tone: 'good' | 'bad' | 'warn' | 'neutral'
  label: string
  title: string
  copy: string
  metrics?: { label: string; value: string }[]
}

export function Briefing({ rows, stageLabels, counts, mode }: Props) {
  const insights = buildInsights(rows, stageLabels)
  const account = buildAccounting(counts, mode)

  return (
    <section className="panel briefing span-2">
      <div className="briefing-head">
        <div>
          <p className="kicker">Briefing</p>
          <h2>Situation</h2>
        </div>
        <p className="insight-copy">
          {rows.length === 0 ? 'No crews in view' : `${formatInt(rows.length)} crews ranked · ${mode === 'cleaned' ? 'field-cleaned' : 'raw clocks'}`}
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
          {insights.map((insight) => (
            <article key={insight.key} className={`insight ${insight.tone}`}>
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
            </article>
          ))}
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

function buildInsights(rows: CrewSummaryRow[], stageLabels: string[]): Insight[] {
  if (rows.length === 0) return []

  const fastest = rows[0]
  const slowest = rows[rows.length - 1]
  const insights: Insight[] = [
    {
      key: 'fast',
      tone: 'good',
      label: 'Fastest',
      title: fastest.crew,
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
        copy: `Largest gap between ${slowest.crew} and ${fastest.crew}.`,
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
      copy:
        thin.length > 4
          ? 'Fewer than 20 jobs each — treat rankings as indicative. Prefer 20+ for a steadier board.'
          : 'Fewer than 20 jobs in this comparison — treat ranking as indicative rather than conclusive.',
      metrics: [{ label: 'Crews', value: formatInt(thin.length) }],
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
        { label: 'Batch stamps', value: formatInt(counts.droppedBatch) },
        { label: 'Slowest 1%', value: formatInt(counts.droppedOutlierCleaned) },
        { label: 'Remain', value: formatInt(counts.cleaned) },
      ],
      note: 'Field-cleaned drops backward clocks (>15 min), batch stamps (<4 min between stages), and the slowest 1% before the minimum-jobs cut.',
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
