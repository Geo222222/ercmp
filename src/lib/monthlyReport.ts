import type { BoardConfig, CleaningMode, CrewReport, CrewSummaryRow } from '../types'
import { formatDuration, formatInt } from './format'

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char)
}

function crewRows(rows: CrewSummaryRow[]): string {
  return rows
    .slice(0, 10)
    .map(
      (row, index) =>
        `<tr><td>${index + 1}</td><td>${escapeHtml(row.crew)}</td><td>${formatInt(row.jobs)}</td><td>${formatDuration(row.avg)}</td><td>${formatDuration(row.median)}</td></tr>`,
    )
    .join('')
}

export function downloadMonthlyReport(
  periodLabel: string,
  report: CrewReport,
  config: BoardConfig,
  mode: CleaningMode,
): void {
  const rows = mode === 'cleaned' ? report.cleaned : report.raw
  const boardJobs = rows.reduce((sum, row) => sum + row.jobs, 0)
  const fastest = rows[0]
  const slowest = rows.at(-1)
  const highFlags = [...report.flags].sort((a, b) => b.jobs - a.jobs).slice(0, 10)
  const flags = highFlags.length
    ? highFlags.map((flag) => `<tr><td>${escapeHtml(flag.crew)}</td><td>${escapeHtml(flag.month)}</td><td>${formatInt(flag.jobs)}</td></tr>`).join('')
    : '<tr><td colspan="3">No repeated backward-clock flags in this working set.</td></tr>'
  const coaching = highFlags.length
    ? `Prioritize a timestamp refresher with ${highFlags.slice(0, 3).map((flag) => escapeHtml(flag.crew)).join(', ')}. Review the expected order ${report.stageLabels.join(' → ')} and confirm that each stage is recorded when the event occurs. Use the job-level records to distinguish a training need from a genuine operational delay.`
    : 'No repeated backward-clock pattern was detected. Continue routine timestamp-quality checks.'
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Monthly response report · ${escapeHtml(periodLabel)}</title><style>
body{font-family:Arial,sans-serif;color:#17221d;max-width:960px;margin:40px auto;padding:0 24px;line-height:1.45}h1,h2{color:#0b6b43}h1{margin-bottom:4px}h2{margin-top:30px;border-bottom:2px solid #d7e6dd;padding-bottom:6px}.meta{color:#5e6f65}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.kpi{border:1px solid #c8d8cf;padding:14px;background:#f5faf7}.kpi b{display:block;font-size:22px;margin-top:4px}table{border-collapse:collapse;width:100%;margin-top:10px}th,td{text-align:left;border-bottom:1px solid #dce6df;padding:8px}th{background:#eaf4ee}.note{background:#fff8df;border-left:4px solid #d19b00;padding:14px}@media print{body{margin:0}.kpi{break-inside:avoid}}
</style></head><body><h1>Monthly Response Report</h1><p class="meta">${escapeHtml(periodLabel)} · ${mode === 'cleaned' ? 'working-time view' : 'raw-clock view'} · ${escapeHtml(config.globalFilterVals.length ? config.globalFilterVals.join(', ') : 'all parishes')}</p>
<div class="kpis"><div class="kpi">Jobs on board<b>${formatInt(boardJobs)}</b></div><div class="kpi">Crews<b>${formatInt(rows.length)}</b></div><div class="kpi">Fastest crew<b>${fastest ? escapeHtml(fastest.crew) : '—'}</b><small>${fastest ? formatDuration(fastest.avg) : ''}</small></div><div class="kpi">Slowest crew<b>${slowest ? escapeHtml(slowest.crew) : '—'}</b><small>${slowest ? formatDuration(slowest.avg) : ''}</small></div></div>
<h2>Executive summary</h2><p>The working set contains ${formatInt(boardJobs)} jobs across ${formatInt(rows.length)} crews. The fastest and slowest rankings are based on average total response time, with median time included to show whether long jobs are pulling the average upward. The current crew sample floor is ${formatInt(config.minJobs)} jobs.</p>
<h2>Total response time</h2><table><thead><tr><th>Rank</th><th>Crew</th><th>Jobs</th><th>Average</th><th>Median</th></tr></thead><tbody>${crewRows(rows)}</tbody></table>
<h2>Data quality and timestamp coaching</h2><p>${coaching}</p><table><thead><tr><th>Crew</th><th>Month</th><th>Backward-clock jobs</th></tr></thead><tbody>${flags}</tbody></table><p class="note">These flags identify timestamp patterns for review. They should support a coaching conversation and job-level verification, not serve as a standalone performance judgment.</p>
<h2>Recommended discussion</h2><ol><li>Review the slowest crews’ stage averages and identify which timestamp interval contributes most to total time.</li><li>Walk through the timestamp sequence: ${report.stageLabels.join(' → ')}.</li><li>Compare a small sample of flagged and slow jobs with dispatch records to separate data-entry issues from real field delays.</li><li>Agree on a follow-up month and recheck both response time and timestamp completeness.</li></ol>
</body></html>`
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `monthly_response_report_${new Date().toISOString().slice(0, 10)}.html`
  link.click()
  URL.revokeObjectURL(url)
}
