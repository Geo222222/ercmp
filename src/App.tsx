import { useCallback, useEffect, useMemo, useState } from 'react'
import type { BoardConfig, CleaningMode, MonthDataset, MonthSnapshot, Row, ViewId } from './types'
import {
  createMonthDataset,
  fetchDiscoveredWorkbooks,
  guessHeaderRow,
  isExcelFileName,
  monthTable,
  parseWorkbook,
  refreshMonthRange,
  sortMonthDatasets,
} from './lib/excel'
import { defaultConfig } from './lib/defaults'
import { filterRows, valueCounts } from './lib/rows'
import { buildCrewReport } from './lib/crew'
import { formatInt } from './lib/format'
import { applyTheme, readTheme, type ThemeId } from './lib/theme'
import { MonthProvider, type MonthContextValue } from './lib/monthContext'
import { CommandView } from './views/CommandView'
import { RosterView } from './views/RosterView'
import { StatsView } from './views/StatsView'
import { ChartsView } from './views/ChartsView'
import { MapView } from './views/MapView'
import { FilterDrawer } from './components/FilterDrawer'
import { MonthsOrb } from './components/MonthsOrb'
import { ScopeBar } from './components/ScopeBar'
import { ThemeOrb } from './components/ThemeOrb'
import { ErcmpLogo } from './components/ErcmpLogo'
import { parishColumn } from './lib/parishGeo'
import './styles/months.css'

type View = ViewId

export function App() {
  const [months, setMonths] = useState<MonthDataset[]>([])
  const [focusMonthId, setFocusMonthId] = useState<string | null>(null)
  const [config, setConfig] = useState<BoardConfig | null>(null)
  const [appliedKey, setAppliedKey] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>('command')
  const [drawer, setDrawer] = useState(false)
  const [mode, setMode] = useState<CleaningMode>('cleaned')
  const [selectedCrew, setSelectedCrew] = useState<string | null>(null)
  const [theme, setTheme] = useState<ThemeId>(() => readTheme())

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const mergeMonths = useCallback((incoming: MonthDataset[]) => {
    setMonths((prev) => {
      const byFile = new Map(prev.map((item) => [item.fileName.toLowerCase(), item]))
      for (const item of incoming) {
        const key = item.fileName.toLowerCase()
        const existing = byFile.get(key)
        if (existing) {
          byFile.set(key, { ...item, id: existing.id, active: existing.active, label: existing.label })
        } else {
          byFile.set(key, item)
        }
      }
      return sortMonthDatasets([...byFile.values()])
    })
    setError(null)
    setLoading(false)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    ;(async () => {
      try {
        const discovered = await fetchDiscoveredWorkbooks(controller.signal)
        if (controller.signal.aborted) return
        if (discovered.length === 0) {
          setError('No Excel workbooks found. Drop files here or place them in data/.')
          setLoading(false)
          return
        }
        const loaded: MonthDataset[] = []
        for (const entry of discovered) {
          const response = await fetch(entry.url, { signal: controller.signal })
          if (!response.ok) throw new Error(`Could not load ${entry.fileName}.`)
          const buffer = await response.arrayBuffer()
          loaded.push(createMonthDataset(parseWorkbook(buffer, entry.fileName)))
        }
        if (controller.signal.aborted) return
        const sorted = sortMonthDatasets(loaded)
        setMonths(sorted)
        setFocusMonthId(sorted[0]?.id ?? null)
        setError(null)
      } catch (reason: unknown) {
        if (controller.signal.aborted || (reason instanceof DOMException && reason.name === 'AbortError')) return
        setError(reason instanceof Error ? reason.message : 'Workbook library could not be loaded.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    })()
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (months.length === 0) return
    if (!focusMonthId || !months.some((item) => item.id === focusMonthId)) {
      setFocusMonthId(months.find((item) => item.active)?.id ?? months[0].id)
    }
  }, [months, focusMonthId])

  const focusMonth = months.find((item) => item.id === focusMonthId) ?? months[0] ?? null
  const activeMonths = useMemo(() => months.filter((item) => item.active), [months])

  const focusTable = useMemo(() => (focusMonth ? monthTable(focusMonth) : null), [focusMonth])
  const tableKey = focusMonth ? `${focusMonth.id}|${focusMonth.sheetName}|${focusMonth.headerRow}` : ''

  useEffect(() => {
    if (!focusTable || !focusMonth || appliedKey === tableKey) return
    setConfig(defaultConfig(focusTable))
    setAppliedKey(tableKey)
    setSelectedCrew(null)
    setMode('cleaned')
    setMonths((prev) =>
      prev.map((item) =>
        item.id === focusMonth.id ? refreshMonthRange({ ...item, headerRow: focusMonth.headerRow }, defaultConfig(focusTable).stageCols) : item,
      ),
    )
  }, [focusTable, focusMonth, tableKey, appliedKey])

  const ready = Boolean(focusTable && config && appliedKey === tableKey && focusMonth)

  const activeTables = useMemo(() => {
    return activeMonths
      .map((month) => {
        const table = monthTable(month)
        return table ? { month, table } : null
      })
      .filter((item): item is { month: MonthDataset; table: NonNullable<ReturnType<typeof monthTable>> } => item != null)
  }, [activeMonths])

  const combinedRows = useMemo(() => {
    if (!config) return [] as Row[]
    const rows: Row[] = []
    for (const { table } of activeTables) {
      const global = filterRows(table.rows, config.globalFilterCol, config.globalFilterVals)
      rows.push(...filterRows(global, config.extraFilterCol, config.extraFilterVals))
    }
    return rows
  }, [activeTables, config])

  const focusGloballyFiltered = useMemo(() => {
    if (!focusTable || !config) return []
    return filterRows(focusTable.rows, config.globalFilterCol, config.globalFilterVals)
  }, [focusTable, config])

  const report = useMemo(() => {
    if (!config) return null
    return buildCrewReport(combinedRows, config)
  }, [combinedRows, config])

  const monthSnapshots: MonthSnapshot[] = useMemo(() => {
    if (!config) return []
    return activeTables.map(({ month, table }) => {
      const global = filterRows(table.rows, config.globalFilterCol, config.globalFilterVals)
      const working = filterRows(global, config.extraFilterCol, config.extraFilterVals)
      return {
        id: month.id,
        label: month.label,
        fileName: month.fileName,
        range: month.range,
        rowCount: working.length,
        report: buildCrewReport(working, config),
      }
    })
  }, [activeTables, config])

  useEffect(() => {
    if (!report || !selectedCrew) return
    const rows = mode === 'cleaned' ? report.cleaned : report.raw
    if (!rows.some((row) => row.crew === selectedCrew)) setSelectedCrew(null)
  }, [report, selectedCrew, mode])

  async function ingestFiles(files: File[]) {
    const excel = files.filter((file) => isExcelFileName(file.name))
    if (excel.length === 0) {
      setError('Drop .xlsx or .xls workbooks only.')
      return
    }
    try {
      const loaded: MonthDataset[] = []
      for (const file of excel) {
        loaded.push(createMonthDataset(parseWorkbook(await file.arrayBuffer(), file.name)))
      }
      mergeMonths(loaded)
      const last = loaded[loaded.length - 1]
      if (last) setFocusMonthId(last.id)
      setDrawer(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'That file could not be read.')
    }
  }

  async function onUpload(file: File) {
    await ingestFiles([file])
  }

  function toggleMonth(id: string) {
    setMonths((prev) => {
      const target = prev.find((item) => item.id === id)
      if (!target) return prev
      const activeCount = prev.filter((item) => item.active).length
      if (target.active && activeCount <= 1) return prev
      return sortMonthDatasets(prev.map((item) => (item.id === id ? { ...item, active: !item.active } : item)))
    })
  }

  function setMonthFilter(ids: string[]) {
    if (ids.length === 0) return
    const allow = new Set(ids)
    setMonths((prev) => sortMonthDatasets(prev.map((item) => ({ ...item, active: allow.has(item.id) }))))
  }

  function setMonthLabel(id: string, label: string) {
    const next = label.trim()
    if (!next) return
    setMonths((prev) => prev.map((item) => (item.id === id ? { ...item, label: next } : item)))
  }

  function removeMonth(id: string) {
    setMonths((prev) => {
      if (prev.length <= 1) return prev
      const next = prev.filter((item) => item.id !== id)
      if (!next.some((item) => item.active) && next[0]) {
        next[0] = { ...next[0], active: true }
      }
      return sortMonthDatasets(next)
    })
  }

  function updateFocusMonth(patch: Partial<Pick<MonthDataset, 'sheetName' | 'headerRow'>>) {
    if (!focusMonth) return
    setMonths((prev) =>
      prev.map((item) => {
        if (item.id !== focusMonth.id) return item
        const next = { ...item, ...patch }
        if (patch.sheetName) {
          const sheet = next.sheets.find((s) => s.name === patch.sheetName)
          if (sheet) next.headerRow = guessHeaderRow(sheet.cells)
        }
        return refreshMonthRange(next, config?.stageCols ?? [])
      }),
    )
  }

  const monthContext: MonthContextValue = {
    monthDatasets: months,
    activeMonths,
    focusMonthId: focusMonth?.id ?? null,
    setFocusMonthId,
    setMonthFilter,
    toggleMonth,
    setMonthLabel,
    removeMonth,
  }

  const globalOptions =
    focusTable && config && config.globalFilterCol !== 'none' ? valueCounts(focusTable.rows, config.globalFilterCol) : []
  const extraOptions =
    config && config.extraFilterCol !== 'none' ? valueCounts(focusGloballyFiltered, config.extraFilterCol) : []

  const activeLabel =
    activeMonths.length === 0
      ? 'No months'
      : activeMonths.length === 1
        ? activeMonths[0].label
        : `${activeMonths.length} months`

  return (
    <MonthProvider value={monthContext}>
      <div className="app">
        <header className="topbar">
          <div className="brand">
            <ErcmpLogo className="brand-logo" />
            <div className="brand-copy">
              <h1>ERCMP</h1>
              <p className="brand-sub">Crew response board</p>
            </div>
          </div>
          <div className="top-meta" role="status" aria-live="polite">
            <div className="meta-cell">
              <span className="meta-label">Months</span>
              <strong>{activeLabel}</strong>
            </div>
            {ready && (
              <div className="meta-cell">
                <span className="meta-label">Rows</span>
                <strong>{formatInt(combinedRows.length)}</strong>
              </div>
            )}
            <div className="meta-cell clock-cell">
              <span className="meta-label">Local</span>
              <Clock />
            </div>
          </div>
          <div className="top-actions">
            <MonthsOrb
              months={months}
              focusMonthId={focusMonth?.id ?? null}
              onToggle={toggleMonth}
              onFocus={setFocusMonthId}
              onSelectAll={() => setMonthFilter(months.map((item) => item.id))}
              onSelectOnly={(id) => setMonthFilter([id])}
              onFiles={ingestFiles}
            />
            <ThemeOrb theme={theme} onTheme={setTheme} />
            <button type="button" className="solid console-btn" onClick={() => setDrawer(true)} disabled={!ready}>
              <span className="console-btn-mark" aria-hidden="true" />
              Setup
            </button>
          </div>
        </header>

        {ready && config && (
          <ScopeBar
            filters={[
              ...(globalOptions.length > 0 && globalOptions.length <= 24
                ? [
                    {
                      key: 'global',
                      label: config.globalFilterCol,
                      options: globalOptions,
                      selected: config.globalFilterVals,
                      onChange: (globalFilterVals: string[]) => setConfig({ ...config, globalFilterVals }),
                    },
                  ]
                : []),
              ...(extraOptions.length > 0 && extraOptions.length <= 12
                ? [
                    {
                      key: 'extra',
                      label: config.extraFilterCol,
                      options: extraOptions,
                      selected: config.extraFilterVals,
                      onChange: (extraFilterVals: string[]) => setConfig({ ...config, extraFilterVals }),
                    },
                  ]
                : []),
            ]}
          />
        )}

        <main>
          {loading && <p className="banner">Loading monthly workbooks…</p>}
          {error && months.length === 0 && (
            <section className="panel">
              <h2>Workbook needed</h2>
              <p>{error}</p>
              <p className="hint">Open the Months orb to drop `.xlsx`, or place files in `data/` / the project root.</p>
              <UploadButton onUpload={onUpload} />
            </section>
          )}
          {error && months.length > 0 && <p className="banner">{error}</p>}
          {ready && config && report && focusTable && view === 'command' && (
            <CommandView
              report={report}
              config={config}
              mode={mode}
              onMode={setMode}
              onMinJobs={(minJobs) => setConfig({ ...config, minJobs })}
              selectedCrew={selectedCrew}
              onSelectCrew={setSelectedCrew}
              monthSnapshots={monthSnapshots}
            />
          )}
          {ready && focusTable && view === 'roster' && <RosterView headers={focusTable.headers} rows={combinedRows} />}
          {ready && config && focusTable && view === 'stats' && (
            <StatsView
              headers={focusTable.headers}
              rows={combinedRows}
              config={config}
              onChange={(patch) => setConfig((current) => (current ? { ...current, ...patch } : current))}
              monthLabel={activeLabel}
            />
          )}
          {ready && config && focusTable && view === 'charts' && (
            <ChartsView
              headers={focusTable.headers}
              rows={combinedRows}
              config={config}
              onChange={(patch) => setConfig((current) => (current ? { ...current, ...patch } : current))}
              periodLabel={activeLabel}
            />
          )}
          {ready && config && focusTable && view === 'map' && (
            <MapView
              headers={focusTable.headers}
              rows={combinedRows}
              config={config}
              report={report}
              mode={mode}
              onMode={setMode}
              monthLabel={activeLabel}
              onScopeParish={(values) => {
                const col = parishColumn(focusTable.headers, config)
                if (!col) return
                setConfig((current) =>
                  current ? { ...current, globalFilterCol: col, globalFilterVals: values } : current,
                )
              }}
              onJump={setView}
              onSelectCrew={setSelectedCrew}
            />
          )}
        </main>

        <nav className="dock" aria-label="Sections">
          <div className="dock-rail" aria-hidden="true" />
          <DockButton id="command" view={view} onView={setView} label="Command" />
          <DockButton id="roster" view={view} onView={setView} label="Roster" />
          <DockButton id="stats" view={view} onView={setView} label="Stats" />
          <DockButton id="charts" view={view} onView={setView} label="Charts" />
          <DockButton id="map" view={view} onView={setView} label="Map" />
        </nav>

        {drawer && ready && config && focusTable && focusMonth && (
          <FilterDrawer
            headers={focusTable.headers}
            allRows={focusTable.rows}
            choiceRows={focusGloballyFiltered}
            sheets={focusMonth.sheets.map((item) => item.name)}
            sheetName={focusMonth.sheetName}
            headerRow={focusMonth.headerRow}
            fileName={focusMonth.fileName}
            config={config}
            months={months}
            focusMonthId={focusMonth.id}
            onFocusMonth={setFocusMonthId}
            onToggleMonth={toggleMonth}
            onMonthLabel={setMonthLabel}
            onRemoveMonth={removeMonth}
            onSheet={(name) => updateFocusMonth({ sheetName: name })}
            onHeaderRow={(row) => updateFocusMonth({ headerRow: row })}
            onChange={(patch) => setConfig((current) => (current ? { ...current, ...patch } : current))}
            onUpload={onUpload}
            onUploadMany={ingestFiles}
            onReset={() => {
              if (focusTable) setConfig(defaultConfig(focusTable))
            }}
            onClose={() => setDrawer(false)}
          />
        )}
      </div>
    </MonthProvider>
  )
}

function DockButton({ id, label, view, onView }: { id: View; label: string; view: View; onView: (view: View) => void }) {
  const active = view === id
  return (
    <button type="button" aria-current={active ? 'page' : undefined} onClick={() => onView(id)}>
      <span className="dock-icon" aria-hidden="true">
        <DockIcon id={id} />
      </span>
      <span className="dock-label">{label}</span>
      {active && <span className="dock-active-mark" aria-hidden="true" />}
    </button>
  )
}

function DockIcon({ id }: { id: View }) {
  if (id === 'command') {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="7.5" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="12" cy="12" r="2.2" fill="currentColor" />
        <path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    )
  }
  if (id === 'roster') {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
        <path d="M5 7h14M5 12h14M5 17h10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        <circle cx="8" cy="7" r="1.4" fill="currentColor" />
        <circle cx="8" cy="12" r="1.4" fill="currentColor" />
        <circle cx="8" cy="17" r="1.4" fill="currentColor" />
      </svg>
    )
  }
  if (id === 'stats') {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
        <path d="M6 17V10M12 17V6M18 17v-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M4.5 19.5h15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      </svg>
    )
  }
  if (id === 'charts') {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
        <path
          d="M4.5 15.5l4.2-4.2 3.2 3.1 6.6-7.4"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M15.2 7h3.8v3.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
      <path
        d="M4.5 12.5c2.2-4.8 4.2-7.2 7.5-7.2s5.3 2.4 7.5 7.2c-2.2 4.8-4.2 7.2-7.5 7.2s-5.3-2.4-7.5-7.2z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M12 8.2v7.6M8.4 12h7.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
  )
}

function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(id)
  }, [])
  return <time dateTime={now.toISOString()}>{now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time>
}

function UploadButton({ onUpload }: { onUpload: (file: File) => void }) {
  return (
    <label className="solid file-btn">
      Upload Excel
      <input
        type="file"
        accept=".xlsx,.xls"
        multiple
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) onUpload(file)
          event.target.value = ''
        }}
      />
    </label>
  )
}
