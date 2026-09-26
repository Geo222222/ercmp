import { useEffect, useMemo, useRef, useState } from 'react'
import type { BoardConfig, MonthDataset, Row } from '../types'
import { displayValue, formatInt } from '../lib/format'
import { rangeNote } from '../lib/excel'
import { valueCounts } from '../lib/rows'
import { LabelHint } from './Hint'

type Props = {
  headers: string[]
  allRows: Row[]
  choiceRows: Row[]
  sheets: string[]
  sheetName: string
  headerRow: number
  fileName: string
  config: BoardConfig
  months: MonthDataset[]
  focusMonthId: string
  onFocusMonth: (id: string) => void
  onToggleMonth: (id: string) => void
  onMonthLabel: (id: string, label: string) => void
  onRemoveMonth: (id: string) => void
  onSheet: (name: string) => void
  onHeaderRow: (row: number) => void
  onChange: (patch: Partial<BoardConfig>) => void
  onUpload: (file: File) => void
  onUploadMany: (files: File[]) => void
  onReset: () => void
  onClose: () => void
}

export function FilterDrawer(props: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const { config, headers, onChange, onClose } = props

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const globalOptions = useMemo(
    () => (config.globalFilterCol === 'none' ? [] : valueCounts(props.allRows, config.globalFilterCol)),
    [props.allRows, config.globalFilterCol],
  )
  const extraOptions = useMemo(
    () => (config.extraFilterCol === 'none' ? [] : valueCounts(props.choiceRows, config.extraFilterCol)),
    [props.choiceRows, config.extraFilterCol],
  )
  const crewOptions = useMemo(
    () => (config.crewCol ? valueCounts(props.choiceRows, config.crewCol) : []),
    [props.choiceRows, config.crewCol],
  )
  const unusedStages = headers.filter((header) => !config.stageCols.includes(header))

  return (
    <div className="scrim" onClick={onClose}>
      <aside className="drawer" onClick={(event) => event.stopPropagation()} aria-label="Board filters">
        <div className="drawer-head">
          <div>
            <p className="kicker">Controls</p>
            <h2>Board setup</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="drawer-body">
          <section className="field">
            <span>Month library</span>
            <p className="hint">Add monthly Excel files. Active months feed Command comparison. Focus month drives sheet/header below.</p>
            <div className="drawer-months">
              {props.months.map((month) => (
                <div key={month.id} className={month.active ? 'drawer-month-row on' : 'drawer-month-row'}>
                  <input
                    type="checkbox"
                    checked={month.active}
                    aria-label={`Include ${month.label}`}
                    onChange={() => props.onToggleMonth(month.id)}
                  />
                  <input
                    type="text"
                    value={month.label}
                    aria-label={`Label for ${month.fileName}`}
                    onFocus={() => props.onFocusMonth(month.id)}
                    onChange={(event) => props.onMonthLabel(month.id, event.target.value)}
                  />
                  <button
                    type="button"
                    className="text-btn"
                    disabled={props.months.length <= 1}
                    onClick={() => props.onRemoveMonth(month.id)}
                  >
                    Remove
                  </button>
                  <p className="drawer-month-meta">
                    {month.fileName} · {rangeNote(month.range)}
                    {props.focusMonthId === month.id ? ' · editing' : ''}
                  </p>
                </div>
              ))}
            </div>
            <button type="button" className="solid" onClick={() => fileRef.current?.click()}>
              Upload month Excel…
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              multiple
              hidden
              onChange={(event) => {
                const files = [...(event.target.files ?? [])]
                if (files.length === 1) props.onUpload(files[0])
                else if (files.length > 1) props.onUploadMany(files)
                event.target.value = ''
              }}
            />
          </section>

          <section className="field">
            <span>Focus workbook</span>
            <strong className="file-name">{props.fileName}</strong>
            <p className="hint">Sheet and header row apply to the focused month only.</p>
          </section>

          {props.sheets.length > 1 && (
            <label className="field">
              <span>Sheet</span>
              <select value={props.sheetName} onChange={(event) => props.onSheet(event.target.value)}>
                {props.sheets.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="field">
            <span>
              <LabelHint tip="headerRow" label="About header row">
                Header row
              </LabelHint>
            </span>
            <input
              type="number"
              min={1}
              max={50}
              value={props.headerRow}
              onChange={(event) => props.onHeaderRow(Math.max(1, Number(event.target.value) || 1))}
            />
            <p className="hint">Row that holds the column names. This workbook uses row 3, under the title.</p>
          </label>

          <label className="field">
            <span>
              <LabelHint tip="globalFilter" label="About board filters">
                Filter column
              </LabelHint>
            </span>
            <select
              value={config.globalFilterCol}
              onChange={(event) => onChange({ globalFilterCol: event.target.value, globalFilterVals: [] })}
            >
              <option value="none">None</option>
              {headers.map((header) => (
                <option key={header} value={header}>
                  {header}
                </option>
              ))}
            </select>
          </label>
          {config.globalFilterCol !== 'none' && (
            <ValuePicker
              label="Values to include"
              options={globalOptions}
              selected={config.globalFilterVals}
              onChange={(globalFilterVals) => onChange({ globalFilterVals })}
            />
          )}

          <label className="field">
            <span>Second filter</span>
            <select
              value={config.extraFilterCol}
              onChange={(event) => onChange({ extraFilterCol: event.target.value, extraFilterVals: [] })}
            >
              <option value="none">None</option>
              {headers.map((header) => (
                <option key={header} value={header}>
                  {header}
                </option>
              ))}
            </select>
            <p className="hint">Parish and this second filter apply to every view.</p>
          </label>
          {config.extraFilterCol !== 'none' && (
            <ValuePicker
              label={`${config.extraFilterCol} values`}
              options={extraOptions}
              selected={config.extraFilterVals}
              onChange={(extraFilterVals) => onChange({ extraFilterVals })}
            />
          )}

          <section className="field">
            <span>
              <LabelHint tip="stageOrder" label="About timestamp order">
                Timestamp order
              </LabelHint>
            </span>
            <p className="hint">
              Earliest stage at the top, completion at the bottom.{' '}
              <LabelHint tip="batchStamp" label="About the 4-minute batch rule">
                Batch rule
              </LabelHint>{' '}
              and{' '}
              <LabelHint tip="negativeRule" label="About the −15 minute rule">
                −15 min rule
              </LabelHint>{' '}
              apply in field-cleaned mode.
            </p>
            <ol className="stage-list">
              {config.stageCols.map((column, index) => (
                <li key={column}>
                  <em>{index + 1}</em>
                  <span>{column}</span>
                  <button type="button" disabled={index === 0} onClick={() => moveStage(config.stageCols, index, -1, onChange)}>
                    Up
                  </button>
                  <button
                    type="button"
                    disabled={index === config.stageCols.length - 1}
                    onClick={() => moveStage(config.stageCols, index, 1, onChange)}
                  >
                    Down
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange({ stageCols: config.stageCols.filter((item) => item !== column) })}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ol>
            {unusedStages.length > 0 && (
              <select
                value=""
                onChange={(event) => {
                  if (!event.target.value) return
                  onChange({ stageCols: [...config.stageCols, event.target.value] })
                }}
              >
                <option value="">Add a timestamp column</option>
                {unusedStages.map((header) => (
                  <option key={header} value={header}>
                    {header}
                  </option>
                ))}
              </select>
            )}
          </section>

          <label className="field">
            <span>Crew column</span>
            <select
              value={config.crewCol}
              onChange={(event) => onChange({ crewCol: event.target.value, crewNames: [] })}
            >
              {headers.map((header) => (
                <option key={header} value={header}>
                  {header}
                </option>
              ))}
            </select>
          </label>
          <ValuePicker
            label="Crews to compare"
            options={crewOptions}
            selected={config.crewNames}
            onChange={(crewNames) => onChange({ crewNames })}
          />

          <label className="field">
            <span>
              <LabelHint tip="minJobs" label="About minimum jobs">
                Minimum jobs per crew
              </LabelHint>
            </span>
            <input
              type="number"
              min={1}
              value={config.minJobs}
              onChange={(event) => onChange({ minJobs: Math.max(1, Number(event.target.value) || 1) })}
            />
          </label>

          <label className="field">
            <span>Breakdown column</span>
            <select value={config.weatherCol} onChange={(event) => onChange({ weatherCol: event.target.value })}>
              <option value="none">None</option>
              {headers.map((header) => (
                <option key={header} value={header}>
                  {header}
                </option>
              ))}
            </select>
            <p className="hint">Used for the weather chart. Defaults to Weather Condition when that column exists.</p>
          </label>

          <button type="button" className="ghost" onClick={props.onReset}>
            Reset to workbook defaults
          </button>
        </div>
      </aside>
    </div>
  )
}

function moveStage(columns: string[], index: number, direction: -1 | 1, onChange: (patch: Partial<BoardConfig>) => void) {
  const next = columns.slice()
  const target = index + direction
  if (target < 0 || target >= next.length) return
  const [item] = next.splice(index, 1)
  next.splice(target, 0, item)
  onChange({ stageCols: next })
}

function ValuePicker({
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
  const [query, setQuery] = useState('')
  const merged = useMemo(() => {
    const known = new Set(options.map((option) => option.value))
    const missing = selected.filter((value) => !known.has(value)).map((value) => ({ value, count: 0 }))
    return [...options, ...missing]
  }, [options, selected])
  const visible = merged.filter((option) => displayValue(option.value).toLowerCase().includes(query.trim().toLowerCase()))
  const useChips = merged.length > 0 && merged.length <= 18

  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value])
  }

  return (
    <div className="field">
      <div className="field-head">
        <span>{label}</span>
        <button type="button" className="text-btn" onClick={() => onChange([])}>
          All
        </button>
      </div>
      <p className="hint">{selected.length === 0 ? 'Empty selection includes every value.' : `${selected.length} selected`}</p>
      {useChips ? (
        <div className="chip-wrap">
          {merged.map((option) => (
            <button
              key={option.value}
              type="button"
              className={selected.includes(option.value) ? 'chip on' : 'chip'}
              onClick={() => toggle(option.value)}
              aria-pressed={selected.includes(option.value)}
            >
              {displayValue(option.value)} <em>{formatInt(option.count)}</em>
            </button>
          ))}
        </div>
      ) : (
        <>
          <input type="search" value={query} placeholder="Search" onChange={(event) => setQuery(event.target.value)} />
          <div className="check-list">
            {visible.slice(0, 80).map((option) => (
              <label key={option.value}>
                <input type="checkbox" checked={selected.includes(option.value)} onChange={() => toggle(option.value)} />
                <span>{displayValue(option.value)}</span>
                <em>{formatInt(option.count)}</em>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
