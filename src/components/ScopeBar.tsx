import { useEffect, useId, useState } from 'react'
import { displayValue, formatInt } from '../lib/format'

export type ScopeFilter = {
  key: string
  label: string
  options: { value: string; count: number }[]
  selected: string[]
  onChange: (values: string[]) => void
}

const STORAGE_KEY = 'ercmp-scope-open'

function readOpen(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function writeOpen(open: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, open ? '1' : '0')
  } catch {
    /* ignore */
  }
}

function summarize(filter: ScopeFilter): string {
  if (filter.selected.length === 0) return 'All'
  if (filter.selected.length === 1) return displayValue(filter.selected[0])
  const first = displayValue(filter.selected[0])
  return `${first}+${filter.selected.length - 1}`
}

type Props = {
  filters: ScopeFilter[]
}

/** Compact Scope control — collapsed summary by default; expands parish/job chips. */
export function ScopeBar({ filters }: Props) {
  const [open, setOpen] = useState(() => readOpen())
  const panelId = useId()

  useEffect(() => {
    writeOpen(open)
  }, [open])

  if (filters.length === 0) return null

  const summary = filters.map((filter) => `${shortLabel(filter.label)}: ${summarize(filter)}`).join(' · ')

  return (
    <div className={`scope-bar${open ? ' open' : ''}`}>
      <button
        type="button"
        className="scope-pill"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="scope-pill-mark" aria-hidden="true" />
        <span className="scope-pill-title">Scope</span>
        <strong className="scope-pill-summary">{summary}</strong>
        <span className="scope-pill-chevron" aria-hidden="true">
          {open ? '▴' : '▾'}
        </span>
      </button>

      {open && (
        <div className="scope-panel" id={panelId}>
          {filters.map((filter) => (
            <FilterChips
              key={filter.key}
              label={filter.label}
              options={filter.options}
              selected={filter.selected}
              onChange={filter.onChange}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function shortLabel(label: string): string {
  if (/parish/i.test(label)) return 'Parish'
  if (/job/i.test(label)) return 'Job'
  return label.length > 10 ? `${label.slice(0, 9)}…` : label
}

export function FilterChips({
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
