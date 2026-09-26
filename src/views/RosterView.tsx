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

function crewLabel(row: Row, crewCol: string): string {
  if (!crewCol) return 'Unassigned'
  return displayValue(cellText(row[crewCol]) || 'Unassigned')
}

function parishLabel(row: Row, parishCol: string): string {
  if (!parishCol) return 'Unassigned'
  return displayValue(cellText(row[parishCol]) || 'Unassigned')
}

function totalClock(row: Row, stages: string[]): number | null {
  if (stages.length < 2) return null
  const first = parseFlexibleDatetime(row[stages[0]])
  const last = parseFlexibleDatetime(row[stages[stages.length - 1]])
  if (!first || !last) return null
  return minutesBetween(last, first)
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}

type SortMode = 'crew-asc' | 'crew-desc' | 'clock-desc' | 'clock-asc' | 'parish-asc' | 'job-asc'

const SORT_OPTIONS: { value: SortMode; label: string; needs: 'crew' | 'clock' | 'parish' | 'job' | 'any' }[] = [
  { value: 'crew-asc', label: 'Crew A–Z', needs: 'crew' },
  { value: 'crew-desc', label: 'Crew Z–A', needs: 'crew' },
  { value: 'clock-desc', label: 'Clock · longest', needs: 'clock' },
  { value: 'clock-asc', label: 'Clock · shortest', needs: 'clock' },
  { value: 'parish-asc', label: 'Parish A–Z', needs: 'parish' },
  { value: 'job-asc', label: 'Job id', needs: 'job' },
]

function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })
}

export function RosterView({ headers, rows, stageCols, crewCol, parishCol, monthCol }: Props) {
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [monthFilter, setMonthFilter] = useState<string | null>(null)
  const [crewFilter, setCrewFilter] = useState<string[]>([])
  const [parishFilter, setParishFilter] = useState<string[]>([])
  const [crewNeedle, setCrewNeedle] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('crew-asc')
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

  const monthScoped = useMemo(() => {
    if (!monthFilter) return rows
    return rows.filter((row) => monthFromRow(row, resolved.month) === monthFilter)
  }, [rows, monthFilter, resolved.month])

  const crewsPresent = useMemo(
    () => uniqueSorted(monthScoped.map((row) => crewLabel(row, resolved.crew))),
    [monthScoped, resolved.crew],
  )

  const parishesPresent = useMemo(() => {
    if (!resolved.parish) return [] as string[]
    return uniqueSorted(monthScoped.map((row) => parishLabel(row, resolved.parish)))
  }, [monthScoped, resolved.parish])

  const sortOptions = useMemo(() => {
    return SORT_OPTIONS.filter((option) => {
      if (option.needs === 'any') return true
      if (option.needs === 'crew') return Boolean(resolved.crew) || crewsPresent.length > 0
      if (option.needs === 'clock') return resolved.stages.length >= 2
      if (option.needs === 'parish') return Boolean(resolved.parish)
      if (option.needs === 'job') return Boolean(resolved.job)
      return true
    })
  }, [resolved.crew, resolved.stages.length, resolved.parish, resolved.job, crewsPresent.length])

  useEffect(() => {
    if (monthFilter && !monthsPresent.includes(monthFilter)) setMonthFilter(null)
  }, [monthFilter, monthsPresent])

  useEffect(() => {
    setCrewFilter((prev) => {
      const next = prev.filter((crew) => crewsPresent.includes(crew))
      return next.length === prev.length ? prev : next
    })
  }, [crewsPresent])

  useEffect(() => {
    setParishFilter((prev) => {
      const next = prev.filter((parish) => parishesPresent.includes(parish))
      return next.length === prev.length ? prev : next
    })
  }, [parishesPresent])

  useEffect(() => {
    if (!sortOptions.some((option) => option.value === sortMode)) {
      setSortMode(sortOptions[0]?.value ?? 'crew-asc')
    }
  }, [sortOptions, sortMode])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const crewSet = crewFilter.length > 0 ? new Set(crewFilter) : null
    const parishSet = parishFilter.length > 0 ? new Set(parishFilter) : null

    const list = monthScoped.filter((row) => {
      if (crewSet && !crewSet.has(crewLabel(row, resolved.crew))) return false
      if (parishSet && !parishSet.has(parishLabel(row, resolved.parish))) return false
      if (!needle) return true
      return headers.some((header) => String(row[header] ?? '').toLowerCase().includes(needle))
    })

    const ranked = [...list]
    ranked.sort((a, b) => {
      if (sortMode === 'crew-asc' || sortMode === 'crew-desc') {
        const cmp = compareText(crewLabel(a, resolved.crew), crewLabel(b, resolved.crew))
        return sortMode === 'crew-asc' ? cmp : -cmp
      }
      if (sortMode === 'clock-desc' || sortMode === 'clock-asc') {
        const clockA = totalClock(a, resolved.stages)
        const clockB = totalClock(b, resolved.stages)
        if (clockA == null && clockB == null) return compareText(crewLabel(a, resolved.crew), crewLabel(b, resolved.crew))
        if (clockA == null) return 1
        if (clockB == null) return -1
        const cmp = clockA - clockB
        return sortMode === 'clock-asc' ? cmp : -cmp
      }
      if (sortMode === 'parish-asc') {
        const cmp = compareText(parishLabel(a, resolved.parish), parishLabel(b, resolved.parish))
        return cmp || compareText(crewLabel(a, resolved.crew), crewLabel(b, resolved.crew))
      }
      if (sortMode === 'job-asc' && resolved.job) {
        return compareText(cellText(a[resolved.job]), cellText(b[resolved.job]))
      }
      return 0
    })
    return ranked
  }, [
    headers,
    monthScoped,
    query,
    crewFilter,
    parishFilter,
    sortMode,
    resolved.crew,
    resolved.parish,
    resolved.stages,
    resolved.job,
  ])

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

  const crewChoices = useMemo(() => {
    const needle = crewNeedle.trim().toLowerCase()
    if (!needle) return crewsPresent
    return crewsPresent.filter((crew) => crew.toLowerCase().includes(needle))
  }, [crewsPresent, crewNeedle])

  const filtersActive = crewFilter.length > 0 || parishFilter.length > 0 || Boolean(query) || Boolean(monthFilter)

  function toggleCrew(crew: string) {
    setCrewFilter((prev) => (prev.includes(crew) ? prev.filter((item) => item !== crew) : [...prev, crew]))
    setPage(0)
  }

  function toggleParish(parish: string) {
    setParishFilter((prev) => (prev.includes(parish) ? prev.filter((item) => item !== parish) : [...prev, parish]))
    setPage(0)
  }

  function clearSmartFilters() {
    setCrewFilter([])
    setParishFilter([])
    setCrewNeedle('')
    setQuery('')
    setPage(0)
  }

  return (
    <div className="roster-view">
      <section className="panel roster-instrument">
        <div className="roster-head">
          <div>
            <p className="kicker">Roster</p>
            <h2>Job instrument</h2>
            <p className="roster-lede">Filter crews, sort the board, open a job and read the clock trail.</p>
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

        <div className="roster-toolbar" aria-label="Roster smart list controls">
          <div className="roster-control roster-crew-control">
            <div className="roster-control-head">
              <span>Crew</span>
              <button
                type="button"
                className="roster-text-btn"
                disabled={crewFilter.length === 0}
                onClick={() => {
                  setCrewFilter([])
                  setPage(0)
                }}
              >
                All crews
              </button>
            </div>
            <label className="roster-crew-search">
              <span className="visually-hidden">Find crew</span>
              <input
                type="search"
                value={crewNeedle}
                placeholder={crewsPresent.length ? `Find among ${crewsPresent.length} crews` : 'No crews in view'}
                onChange={(event) => setCrewNeedle(event.target.value)}
                disabled={crewsPresent.length === 0}
              />
            </label>
            {crewFilter.length > 0 && (
              <div className="roster-selected-chips" aria-label="Selected crews">
                {crewFilter.map((crew) => (
                  <button key={crew} type="button" className="filter-chip on" onClick={() => toggleCrew(crew)}>
                    {crew}
                    <span aria-hidden="true">×</span>
                  </button>
                ))}
              </div>
            )}
            <div className="roster-chip-scroll" role="group" aria-label="Crew filter">
              {crewChoices.length === 0 ? (
                <p className="roster-chip-empty">{crewNeedle ? 'No crew matches' : 'No crews in this set'}</p>
              ) : (
                crewChoices.map((crew) => {
                  const on = crewFilter.includes(crew)
                  return (
                    <button
                      key={crew}
                      type="button"
                      className={on ? 'filter-chip on' : 'filter-chip'}
                      aria-pressed={on}
                      onClick={() => toggleCrew(crew)}
                    >
                      {crew}
                    </button>
                  )
                })
              )}
            </div>
          </div>

          {parishesPresent.length > 0 && (
            <div className="roster-control">
              <div className="roster-control-head">
                <span>Parish</span>
                <button
                  type="button"
                  className="roster-text-btn"
                  disabled={parishFilter.length === 0}
                  onClick={() => {
                    setParishFilter([])
                    setPage(0)
                  }}
                >
                  All parishes
                </button>
              </div>
              <div className="roster-chip-scroll" role="group" aria-label="Parish filter">
                {parishesPresent.map((parish) => {
                  const on = parishFilter.includes(parish)
                  return (
                    <button
                      key={parish}
                      type="button"
                      className={on ? 'filter-chip on' : 'filter-chip'}
                      aria-pressed={on}
                      onClick={() => toggleParish(parish)}
                    >
                      {parish}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="roster-control roster-sort-control">
            <div className="roster-control-head">
              <span>Sort</span>
              {(crewFilter.length > 0 || parishFilter.length > 0 || query) && (
                <button type="button" className="roster-text-btn" onClick={clearSmartFilters}>
                  Clear filters
                </button>
              )}
            </div>
            <label className="roster-sort">
              <span className="visually-hidden">Sort jobs</span>
              <select
                value={sortMode}
                onChange={(event) => {
                  setSortMode(event.target.value as SortMode)
                  setPage(0)
                }}
              >
                {sortOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="roster-kpis" aria-label="Roster metrics">
          <div className="roster-kpi">
            <span>In view</span>
            <strong>{formatInt(filtered.length)}</strong>
            <small>{filtersActive ? 'Smart list after filters' : 'Working rows'}</small>
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
          <div className="roster-kpi">
            <span>Crews lit</span>
            <strong>{formatInt(crewFilter.length > 0 ? crewFilter.length : crewsPresent.length)}</strong>
            <small>{crewFilter.length > 0 ? 'Selected crews' : 'In month / working set'}</small>
          </div>
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
          <p className="roster-empty">No jobs match this smart list.</p>
        ) : (
          <ul className="roster-cards">
            {slice.map((row, index) => {
              const absolute = safePage * PAGE_SIZE + index
              const key = jobKey(row, absolute, resolved.job)
              const timeline = buildTimeline(row, resolved.stages)
              const stamped = timeline.filter((point) => point.at).length
              const totalGap = totalClock(row, resolved.stages)
              const month = monthFromRow(row, resolved.month)
              const jobId = resolved.job ? cellText(row[resolved.job]) : ''
              const crew = crewLabel(row, resolved.crew)
              const parish = resolved.parish ? parishLabel(row, resolved.parish) : '—'
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
