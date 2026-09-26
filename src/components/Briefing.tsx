import type { ReactNode } from 'react'
import type { CrewCounts, CrewSummaryRow, CleaningMode } from '../types'
import { formatInt, shortStage } from '../lib/format'

type Props = {
  rows: CrewSummaryRow[]
  stageLabels: string[]
  counts: CrewCounts
  mode: CleaningMode
}

export function Briefing({ rows, stageLabels, counts, mode }: Props) {
  const lines = narrative(rows, stageLabels)
  return (
    <section className="panel briefing span-2">
      <p className="kicker">Briefing</p>
      {lines.map((line) => (
        <p key={line.text} className={line.warn ? 'warn-copy' : undefined}>
          {line.parts}
        </p>
      ))}
      <p className="account">{accounting(counts, mode)}</p>
    </section>
  )
}

function narrative(rows: CrewSummaryRow[], stageLabels: string[]): { text: string; warn?: boolean; parts: ReactNode }[] {
  if (rows.length === 0) {
    return [
      {
        text: 'empty',
        parts: 'No jobs remain after filtering. Lower the minimum jobs per crew, widen the parish or job-type filters, or pick more crews.',
      },
    ]
  }

  const fastest = rows[0]
  const slowest = rows[rows.length - 1]
  const lines: { text: string; warn?: boolean; parts: ReactNode }[] = [
    {
      text: 'fast',
      parts: (
        <>
          <strong>{fastest.crew}</strong> is the fastest crew in this comparison, averaging {fastest.avg.toFixed(1)}{' '}
          minutes (median {fastest.median.toFixed(1)}) across {formatInt(fastest.jobs)} {fastest.jobs === 1 ? 'job' : 'jobs'}.
        </>
      ),
    },
  ]

  if (rows.length > 1 && fastest.avg > 0) {
    const ratio = slowest.avg / fastest.avg
    lines.push({
      text: 'slow',
      parts: (
        <>
          <strong>{slowest.crew}</strong> is the slowest, averaging {slowest.avg.toFixed(1)} minutes (median{' '}
          {slowest.median.toFixed(1)}) across {formatInt(slowest.jobs)} {slowest.jobs === 1 ? 'job' : 'jobs'} —{' '}
          {ratio.toFixed(1)}x slower than {fastest.crew}.
        </>
      ),
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
      lines.push({
        text: 'gap',
        parts: (
          <>
            The biggest gap between them is in the <strong>{shortStage(stageLabels[gapIndex])}</strong> stage (
            {slowest.crew}: {slowest.stageAvgs[gapIndex].toFixed(1)} min vs {fastest.crew}:{' '}
            {fastest.stageAvgs[gapIndex].toFixed(1)} min). That stage is the main driver of the difference.
          </>
        ),
      })
    }
  }

  const thin = rows.filter((row) => row.jobs < 20)
  if (thin.length > 4) {
    lines.push({
      text: 'thin',
      warn: true,
      parts: `${formatInt(thin.length)} crews have fewer than 20 jobs in this comparison — treat their ranking as indicative rather than conclusive. Use 20+ for a steadier board.`,
    })
  } else if (thin.length > 0) {
    const names = thin.map((row) => row.crew).join(', ')
    const verb = thin.length === 1 ? 'has' : 'have'
    const poss = thin.length === 1 ? 'its' : 'their'
    lines.push({
      text: 'thin',
      warn: true,
      parts: `Note: ${names} ${verb} fewer than 20 jobs in this comparison — treat ${poss} ranking as indicative rather than conclusive.`,
    })
  }

  return lines
}

function accounting(counts: CrewCounts, mode: CleaningMode): string {
  if (counts.filtered === 0) return 'No jobs match the current filters.'
  if (mode === 'cleaned') {
    return `${formatInt(counts.filtered)} jobs in the current filters. ${formatInt(counts.complete)} had every timestamp. Removed ${formatInt(counts.negative)} with a stage running more than 15 minutes backward, ${formatInt(counts.droppedBatch)} where a later stage was stamped under 4 minutes after the one before it, and ${formatInt(counts.droppedOutlierCleaned)} in the slowest 1%. ${formatInt(counts.cleaned)} jobs remain before the minimum-jobs cut.`
  }
  return `${formatInt(counts.filtered)} jobs in the current filters. ${formatInt(counts.complete)} had every timestamp. This view keeps stage-level clock problems, drops jobs whose overall total is negative, then removes the slowest 1% (${formatInt(counts.droppedOutlierRaw)} jobs). ${formatInt(counts.raw)} jobs remain before the minimum-jobs cut.`
}
