import { useEffect, useMemo, useState } from 'react'
import type { BoardConfig, CleaningMode, Dataset } from './types'
import { bundledWorkbookUrl, guessHeaderRow, parseWorkbook, tableFromGrid } from './lib/excel'
import { defaultConfig } from './lib/defaults'
import { filterRows, valueCounts } from './lib/rows'
import { buildCrewReport } from './lib/crew'
import { displayValue, formatInt } from './lib/format'
import { CommandView } from './views/CommandView'
import { RosterView } from './views/RosterView'
import { StatsView } from './views/StatsView'
import { ChartsView } from './views/ChartsView'
import { FilterDrawer } from './components/FilterDrawer'

type View = 'command' | 'roster' | 'stats' | 'charts'

export function App() {
  const [dataset, setDataset] = useState<Dataset | null>(null)
  const [sheetName, setSheetName] = useState('')
  const [headerRow, setHeaderRow] = useState(1)
  const [config, setConfig] = useState<BoardConfig | null>(null)
  const [appliedKey, setAppliedKey] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>('command')
  const [drawer, setDrawer] = useState(false)
  const [mode, setMode] = useState<CleaningMode>('cleaned')
  const [selectedCrew, setSelectedCrew] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch(bundledWorkbookUrl(), { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('The June workbook could not be loaded.')
        return response.arrayBuffer()
      })
      .then((buffer) => adopt(parseWorkbook(buffer, 'JUNE - KSA.xlsx')))
      .catch((reason: unknown) => {
        if (controller.signal.aborted || (reason instanceof DOMException && reason.name === 'AbortError')) return
        setError(reason instanceof Error ? reason.message : 'The workbook could not be read.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [])

  function adopt(next: Dataset) {
    const sheet = next.sheets[0]
    setDataset(next)
    setSheetName(sheet?.name ?? '')
    setHeaderRow(sheet ? guessHeaderRow(sheet.cells) : 1)
    setError(null)
    setLoading(false)
  }

  const sheet = dataset?.sheets.find((item) => item.name === sheetName) ?? null
  const table = useMemo(() => (sheet ? tableFromGrid(sheet, headerRow) : null), [sheet, headerRow])
  const tableKey = `${dataset?.fileName ?? ''}|${sheetName}|${headerRow}`

  useEffect(() => {
    if (!table || appliedKey === tableKey) return
    setConfig(defaultConfig(table))
    setAppliedKey(tableKey)
    setSelectedCrew(null)
    setMode('cleaned')
  }, [table, tableKey, appliedKey])

  const ready = Boolean(table && config && appliedKey === tableKey && config)

  const globallyFiltered = useMemo(() => {
    if (!table || !config) return []
    return filterRows(table.rows, config.globalFilterCol, config.globalFilterVals)
  }, [table, config])

  const workingRows = useMemo(() => {
    if (!config) return []
    return filterRows(globallyFiltered, config.extraFilterCol, config.extraFilterVals)
  }, [globallyFiltered, config])

  const report = useMemo(() => {
    if (!config) return null
    return buildCrewReport(workingRows, config)
  }, [workingRows, config])

  useEffect(() => {
    if (!report || !selectedCrew) return
    const rows = mode === 'cleaned' ? report.cleaned : report.raw
    if (!rows.some((row) => row.crew === selectedCrew)) setSelectedCrew(null)
  }, [report, selectedCrew, mode])

  async function onUpload(file: File) {
    try {
      adopt(parseWorkbook(await file.arrayBuffer(), file.name))
      setDrawer(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'That file could not be read.')
    }
  }

  const globalOptions =
    table && config && config.globalFilterCol !== 'none' ? valueCounts(table.rows, config.globalFilterCol) : []
  const extraOptions =
    config && config.extraFilterCol !== 'none' ? valueCounts(globallyFiltered, config.extraFilterCol) : []

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="mark" aria-hidden="true" />
          <div>
            <p className="eyebrow">Crew response board</p>
            <h1>ERCMP</h1>
          </div>
        </div>
        <div className="top-meta">
          <span className="live">
            <i />
            Board
          </span>
          <strong>{dataset ? dataset.fileName.replace(/\.xlsx?$/i, '') : 'No workbook'}</strong>
          {table && <span>{formatInt(workingRows.length)} rows</span>}
          <Clock />
        </div>
        <button type="button" className="solid" onClick={() => setDrawer(true)} disabled={!ready}>
          Filters
        </button>
      </header>

      {ready && config && globalOptions.length > 0 && globalOptions.length <= 24 && (
        <FilterChips
          label={config.globalFilterCol}
          options={globalOptions}
          selected={config.globalFilterVals}
          onChange={(globalFilterVals) => setConfig({ ...config, globalFilterVals })}
        />
      )}
      {ready && config && extraOptions.length > 0 && extraOptions.length <= 12 && (
        <FilterChips
          label={config.extraFilterCol}
          options={extraOptions}
          selected={config.extraFilterVals}
          onChange={(extraFilterVals) => setConfig({ ...config, extraFilterVals })}
        />
      )}

      <main>
        {loading && <p className="banner">Reading the June KSA workbook…</p>}
        {error && (
          <section className="panel">
            <h2>Workbook needed</h2>
            <p>{error}</p>
            <UploadButton onUpload={onUpload} />
          </section>
        )}
        {ready && config && report && table && view === 'command' && (
          <CommandView
            report={report}
            config={config}
            mode={mode}
            onMode={setMode}
            onMinJobs={(minJobs) => setConfig({ ...config, minJobs })}
            selectedCrew={selectedCrew}
            onSelectCrew={setSelectedCrew}
          />
        )}
        {ready && table && view === 'roster' && <RosterView headers={table.headers} rows={workingRows} />}
        {ready && config && table && view === 'stats' && (
          <StatsView headers={table.headers} rows={workingRows} config={config} onChange={(patch) => setConfig({ ...config, ...patch })} />
        )}
        {ready && config && table && view === 'charts' && (
          <ChartsView headers={table.headers} rows={workingRows} config={config} onChange={(patch) => setConfig({ ...config, ...patch })} />
        )}
      </main>

      <nav className="dock" aria-label="Sections">
        <DockButton id="command" view={view} onView={setView} label="Command" />
        <DockButton id="roster" view={view} onView={setView} label="Roster" />
        <DockButton id="stats" view={view} onView={setView} label="Stats" />
        <DockButton id="charts" view={view} onView={setView} label="Charts" />
      </nav>

      {drawer && ready && config && table && dataset && (
        <FilterDrawer
          headers={table.headers}
          allRows={table.rows}
          choiceRows={globallyFiltered}
          sheets={dataset.sheets.map((item) => item.name)}
          sheetName={sheetName}
          headerRow={headerRow}
          fileName={dataset.fileName}
          config={config}
          onSheet={(name) => {
            setSheetName(name)
            const nextSheet = dataset.sheets.find((item) => item.name === name)
            if (nextSheet) setHeaderRow(guessHeaderRow(nextSheet.cells))
          }}
          onHeaderRow={setHeaderRow}
          onChange={(patch) => setConfig({ ...config, ...patch })}
          onUpload={onUpload}
          onReset={() => {
            if (table) setConfig(defaultConfig(table))
          }}
          onClose={() => setDrawer(false)}
        />
      )}
    </div>
  )
}

function FilterChips({
  label,
  options,
  selected,
  onChange,
}: {
  label: string
  options: { value: string; count: number }[]
  selected: string[]
  onChange: (values: string[]) => void
}) {
  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value])
  }

  return (
    <div className="filter-bar">
      <span>{label}</span>
      <div className="chips">
        <button type="button" className={selected.length === 0 ? 'chip on' : 'chip'} onClick={() => onChange([])}>
          All
        </button>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={selected.includes(option.value) ? 'chip on' : 'chip'}
            aria-pressed={selected.includes(option.value)}
            onClick={() => toggle(option.value)}
          >
            {displayValue(option.value)}
            <em>{formatInt(option.count)}</em>
          </button>
        ))}
      </div>
    </div>
  )
}

function DockButton({ id, label, view, onView }: { id: View; label: string; view: View; onView: (view: View) => void }) {
  return (
    <button type="button" aria-current={view === id ? 'page' : undefined} onClick={() => onView(id)}>
      {label}
    </button>
  )
}

function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(id)
  }, [])
  return <time>{now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time>
}

function UploadButton({ onUpload }: { onUpload: (file: File) => void }) {
  return (
    <label className="solid file-btn">
      Upload Excel
      <input
        type="file"
        accept=".xlsx,.xls"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) onUpload(file)
        }}
      />
    </label>
  )
}
