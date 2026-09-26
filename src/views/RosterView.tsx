import { useEffect, useMemo, useState } from 'react'
import type { Cell, Row } from '../types'
import { minutesBetween, parseFlexibleDatetime } from '../lib/datetime'
import { displayValue, formatDuration, formatInt, shortEndpoint } from '../lib/format'
import './RosterView.css'

/**
 * Roster props — App currently passes `headers` + `rows` only.
 *
 * For multi-month / board wiring later, App should pass:
 * - `stageCols` from BoardConfig (earliest → completion)
 * - `crewCol` / `parishCol` from BoardConfig
 * - `monthCol` OR stamp each working row with `monthLabel` (string)
 *   so the month badge + filter chips light up without further UI work here.
 */
type Props = {
  headers: string[]
  rows: Row[]
  /** Preferred stage timestamp columns (earliest first). Falls back to header heuristics. */
  stageCols?: string[]
  /** Crew column. Falls back to header heuristics. */
  crewCol?: string
  /** Parish / region column. Falls back to header heuristics. */
  parishCol?: string
  /**
   * Dedicated month column when rows are not yet stamped with `monthLabel`.
   * Prefer setting `row.monthLabel` on working rows once multi-month lands.
   */
  monthCol?: string
}

const PAGE_SIZE = 12

const STAGE_PATTERNS = [/assigned time/i, /acknowle/i, /enroute/i, /on-?site/i, /actual comp/i, /final comp/i, /comp(?:letion)? time/i]
const NOTES_PATTERNS = [/note/i, /comment/i, /remark/i, /description/i]
const JOB_PATTERNS = [/^job$/i, /order\s*no/i, /work\s*order/i, /ticket/i, /^wo\b/i]
const TYPE_PATTERNS = [/^job type$/i, /job type/i, /outage/i]

function firstMatch(headers: string[], patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const hit = headers.find((header) => pattern.test(header))
    if (hit) return hit
  }
  return null
}

function detectStages(headers: string[]): string[] {
  const stages: string[] = []
  for (const pattern of STAGE_PATTERNS) {
    const hit = headers.find((header) => pattern.test(header) && !stages.includes(header))
    if (hit) stages.push(hit)
  }
  return stages
}

function cellText(value: Cell | undefined): string {
  if (value == null || value === '') return ''
  return String(value).trim()
}

function monthFromRow(row: Row, monthCol: string | null): string {
  const stamped = cellText(row.monthLabel)
  if (stamped) return stamped
  if (monthCol) return cellText(row[monthCol])
  return ''
}

function formatClock(date: Date): string {
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

type StagePoint = {
  label: string
  short: string
  raw: string
  at: Date | null
  gapMin: number | null
}

function buildTimeline(row: Row, stageCols: string[]): StagePoint[] {
  return stageCols.map((column, index) => {
    const raw = cellText(row[column])
    const at = parseFlexibleDatetime(row[column])
    const prev = index > 0 ? parseFlexibleDatetime(row[stageCols[index - 1]]) : null
    const gapMin = at && prev ? minutesBetween(at, prev) : null
    return {
      label: column,
      short: shortEndpoint(column),
      raw,
      at,
      gapMin,
    }
  })
}

function jobKey(row: Row, index: number, jobCol: string | null): string {
  const id = jobCol ? cellText(row[jobCol]) : ''
  return id || `row-${index}`
}

export function RosterView({ headers, rows, stageCols, crewCol, parishCol, monthCol }: Props) {
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [monthFilter, setMonthFilter] = useState<string | null>(null)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  const resolved = useMemo(() => {
    const stages = stageCols && stageCols.length >= 2 ? stageCols : detectStages(headers)
    return {
      stages,
      crew: crewCol || firstMatch(headers, [/^crew$/i, /\bcrew\b/i, /team/i, /technician/i]) || '',
      parish: parishCol || firstMatch(headers, [/^parish$/i, /parish|region|area/i]) || '',
      job: firstMatch(headers, JOB_PATTERNS),
      type: firstMatch(headers, TYPE_PATTERNS),
      notes: firstMatch(headers, NOTES_PATTERNS),
      month: monthCol || firstMatch(headers, [/^month$/i, /month\s*label/i, /year.?month/i]),
    }
  }, [headers, stageCols, crewCol, parishCol, monthCol])

  const monthsPresent = useMemo(() => {
    const set = new Set<string>()
    for (const row of rows) {
      const label = monthFromRow(row, resolved.month)
      if (label) set.add(label)
    }
    return Array.from(set).sort()
  }, [rows, resolved.month])

  useEffect(() => {
    if (monthFilter && !monthsPresent.includes(monthFilter)) setMonthFilter(null)
  }, [monthFilter, monthsPresent])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return rows.filter((row) => {
      const month = monthFromRow(row, resolved.month)
      if (monthFilter && month !== monthFilter) return false
      if (!needle) return true
      return headers.some((header) => String(row[header] ?? '').toLowerCase().includes(needle))
    })
  }, [headers, rows, query, monthFilter, resolved.month])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const slice = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

  const selected = useMemo(() => {
    if (!selectedKey) return null
    const index = filtered.findIndex((row, i) => jobKey(row, i, resolved.job) === selectedKey)
    if (index < 0) return null
    return { row: filtered[index], index }
  }, [filtered, selectedKey, resolved.job])

  useEffect(() => {
    if (!selectedKey) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedKey(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedKey])

  const stampedCount = useMemo(() => {
    if (resolved.stages.length < 2) return 0
    return filtered.reduce((count, row) => {
      const stamped = resolved.stages.filter((col) => parseFlexibleDatetime(row[col])).length
      return stamped === resolved.stages.length ? count + 1 : count
    }, 0)
  }, [filtered, resolved.stages])

  return (
    <div className="roster-view">
      <section className="panel roster-instrument">
        <div className="roster-head">
          <div>
            <p className="kicker">Roster</p>
            <h2>Job instrument</h2>
            <p className="roster-lede">Search the working set, open a job, read the clock trail.</p>
          </div>
          <label className="roster-search">
            <span className="visually-hidden">Search jobs</span>
            <input
              type="search"
              value={query}
              placeholder="Search jobs, crews, feeders, notes"
              onChange={(event) => {
                setQuery(event.target.value)
                setPage(0)
              }}
            />
          </label>
        </div>

        <div className="roster-kpis" aria-label="Roster metrics">
          <div className="roster-kpi">
            <span>In view</span>
            <strong>{formatInt(filtered.length)}</strong>
            <small>{query || monthFilter ? 'After search / month cut' : 'Working rows'}</small>
          </div>
          <div className="roster-kpi">
            <span>Page</span>
            <strong>
              {safePage + 1}
              <em>/{pageCount}</em>
            </strong>
            <small>{PAGE_SIZE} per board</small>
          </div>
          <div className="roster-kpi">
            <span>Full stamps</span>
            <strong>{formatInt(stampedCount)}</strong>
            <small>
              {resolved.stages.length >= 2
                ? `${resolved.stages.length} stage columns`
                : 'Add timestamp columns in filters'}
            </small>
          </div>
          {monthsPresent.length > 0 && (
            <div className="roster-kpi">
              <span>Months</span>
              <strong>{formatInt(monthsPresent.length)}</strong>
              <small>{monthFilter ? `Focus · ${monthFilter}` : 'Chip filter ready'}</small>
            </div>
          )}
        </div>

        {monthsPresent.length > 0 && (
          <div className="roster-month-chips" role="group" aria-label="Month filter">
            <button
              type="button"
              className={monthFilter == null ? 'month-chip on' : 'month-chip'}
              onClick={() => {
                setMonthFilter(null)
                setPage(0)
              }}
            >
              All months
            </button>
            {monthsPresent.map((month) => (
              <button
                key={month}
                type="button"
                className={monthFilter === month ? 'month-chip on' : 'month-chip'}
                onClick={() => {
                  setMonthFilter(monthFilter === month ? null : month)
                  setPage(0)
                }}
              >
                {month}
              </button>
            ))}
          </div>
        )}

        {slice.length === 0 ? (
          <p className="roster-empty">No jobs match this search.</p>
        ) : (
          <ul className="roster-cards">
            {slice.map((row, index) => {
              const absolute = safePage * PAGE_SIZE + index
              const key = jobKey(row, absolute, resolved.job)
              const timeline = buildTimeline(row, resolved.stages)
              const stamped = timeline.filter((point) => point.at).length
              const totalGap =
                timeline.length >= 2 && timeline[0].at && timeline[timeline.length - 1].at
                  ? minutesBetween(timeline[timeline.length - 1].at!, timeline[0].at!)
                  : null
              const month = monthFromRow(row, resolved.month)
              const jobId = resolved.job ? cellText(row[resolved.job]) : ''
              const crew = resolved.crew ? displayValue(cellText(row[resolved.crew]) || 'Unassigned') : '—'
              const parish = resolved.parish ? displayValue(cellText(row[resolved.parish]) || 'Unassigned') : '—'
              const type = resolved.type ? cellText(row[resolved.type]) : ''
              const active = selectedKey === key

              return (
                <li key={key}>
                  <button
                    type="button"
                    className={active ? 'roster-card on' : 'roster-card'}
                    onClick={() => setSelectedKey(active ? null : key)}
                    aria-pressed={active}
                  >
                    <div className="roster-card-top">
                      <div className="roster-card-id">
                        <span className="roster-index">{String(absolute + 1).padStart(2, '0')}</span>
                        <strong>{jobId ? displayValue(jobId) : `Job ${absolute + 1}`}</strong>
                      </div>
                      <div className="roster-card-badges">
                        {month && <em className="month-badge">{month}</em>}
                        {type && <em className="type-badge">{type}</em>}
                      </div>
                    </div>
                    <div className="roster-card-meta">
                      <span>
                        <small>Crew</small>
                        {crew}
                      </span>
                      <span>
                        <small>Parish</small>
                        {parish}
                      </span>
                      <span>
                        <small>Clock</small>
                        {totalGap != null ? formatDuration(totalGap) : '—'}
                      </span>
                    </div>
                    {timeline.length > 0 && (
                      <div className="roster-rail" aria-hidden="true">
                        {timeline.map((point, pointIndex) => (
                          <i
                            key={point.label}
                            className={point.at ? 'hit' : 'miss'}
                            style={{ ['--rail-i' as string]: pointIndex }}
                            title={point.short}
                          />
                        ))}
                        <span>
                          {stamped}/{timeline.length}
                        </span>
                      </div>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        <div className="roster-pager">
          <button type="button" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
            Previous
          </button>
          <span>
            {safePage + 1} / {pageCount}
          </span>
          <button type="button" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>
            Next
          </button>
        </div>
      </section>

      {selected && (
        <JobDrawer
          row={selected.row}
          headers={headers}
          stages={resolved.stages}
          crewCol={resolved.crew}
          parishCol={resolved.parish}
          jobCol={resolved.job}
          notesCol={resolved.notes}
          monthCol={resolved.month}
          onClose={() => setSelectedKey(null)}
        />
      )}
    </div>
  )
}

function JobDrawer({
  row,
  headers,
  stages,
  crewCol,
  parishCol,
  jobCol,
  notesCol,
  monthCol,
  onClose,
}: {
  row: Row
  headers: string[]
  stages: string[]
  crewCol: string
  parishCol: string
  jobCol: string | null
  notesCol: string | null
  monthCol: string | null
  onClose: () => void
}) {
  const timeline = buildTimeline(row, stages)
  const month = monthFromRow(row, monthCol)
  const jobId = jobCol ? cellText(row[jobCol]) : ''
  const notes = notesCol ? cellText(row[notesCol]) : ''
  const featured = new Set(
    [jobCol, crewCol, parishCol, notesCol, monthCol, 'monthLabel', ...stages].filter(Boolean) as string[],
  )
  const extras = headers.filter((header) => !featured.has(header) && cellText(row[header]))
  const total =
    timeline.length >= 2 && timeline[0].at && timeline[timeline.length - 1].at
      ? minutesBetween(timeline[timeline.length - 1].at!, timeline[0].at!)
      : null
  const maxGap = Math.max(1, ...timeline.map((point) => (point.gapMin != null && point.gapMin > 0 ? point.gapMin : 0)))

  return (
    <div className="roster-drawer-root">
      <button type="button" className="roster-scrim" aria-label="Close job detail" onClick={onClose} />
      <aside className="roster-drawer" role="dialog" aria-modal="true" aria-labelledby="roster-drawer-title">
        <div className="roster-drawer-head">
          <div>
            <p className="kicker">Job detail</p>
            <h3 id="roster-drawer-title">{jobId ? displayValue(jobId) : 'Selected job'}</h3>
            <p className="roster-drawer-sub">
              {crewCol ? displayValue(cellText(row[crewCol]) || 'Unassigned') : '—'}
              {parishCol ? ` · ${displayValue(cellText(row[parishCol]) || 'Unassigned')}` : ''}
              {month ? ` · ${month}` : ''}
            </p>
          </div>
          <button type="button" className="roster-close" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="roster-drawer-metrics">
          <div>
            <span>Total clock</span>
            <strong>{total != null ? formatDuration(total) : '—'}</strong>
          </div>
          <div>
            <span>Stamps</span>
            <strong>
              {timeline.length === 0
                ? '—'
                : `${timeline.filter((point) => point.at).length}/${timeline.length}`}
            </strong>
          </div>
          <div>
            <span>Parish</span>
            <strong>{parishCol ? displayValue(cellText(row[parishCol]) || 'Unassigned') : '—'}</strong>
          </div>
        </div>

        {timeline.length > 0 ? (
          <section className="roster-timeline" aria-label="Stage timeline">
            <p className="roster-section-label">Stage timeline</p>
            <ol>
              {timeline.map((point, index) => {
                const negative = point.gapMin != null && point.gapMin < -15
                const batch = point.gapMin != null && index > 1 && point.gapMin >= 0 && point.gapMin < 4
                return (
                  <li key={point.label} className={point.at ? 'stamped' : 'missing'}>
                    <span className="timeline-dot" aria-hidden="true" />
                    <div className="timeline-body">
                      <div className="timeline-title">
                        <strong>{point.short}</strong>
                        <em>{point.at ? formatClock(point.at) : point.raw || 'No stamp'}</em>
                      </div>
                      {index > 0 && (
                        <div className="timeline-gap">
                          <span
                            className={`gap-bar${negative ? ' bad' : ''}${batch ? ' warn' : ''}`}
                            style={{
                              width:
                                point.gapMin != null && point.gapMin > 0
                                  ? `${Math.max(6, (point.gapMin / maxGap) * 100)}%`
                                  : '6%',
                            }}
                          />
                          <b>
                            {point.gapMin == null
                              ? '—'
                              : negative
                                ? `−${formatDuration(Math.abs(point.gapMin))}`
                                : formatDuration(point.gapMin)}
                          </b>
                          {batch && <i className="gap-tag">batch?</i>}
                          {negative && <i className="gap-tag bad">reverse</i>}
                        </div>
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>
          </section>
        ) : (
          <p className="roster-empty tight">No stage columns detected — set timestamps in Filters for the timeline.</p>
        )}

        {notes && (
          <section className="roster-notes">
            <p className="roster-section-label">Notes</p>
            <p>{notes}</p>
          </section>
        )}

        {extras.length > 0 && (
          <section className="roster-extras">
            <p className="roster-section-label">Field sheet</p>
            <dl>
              {extras.map((header) => (
                <div key={header}>
                  <dt>{header}</dt>
                  <dd>{displayValue(cellText(row[header]))}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
      </aside>
    </div>
  )
}
