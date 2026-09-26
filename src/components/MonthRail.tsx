import { useRef } from 'react'
import type { MonthDataset } from '../types'
import { monthTone, rangeNote } from '../lib/excel'

type Props = {
  months: MonthDataset[]
  focusMonthId: string | null
  dragOver: boolean
  onToggle: (id: string) => void
  onFocus: (id: string) => void
  onSelectAll: () => void
  onSelectOnly: (id: string) => void
  onFiles: (files: File[]) => void
}

export function MonthRail({
  months,
  focusMonthId,
  dragOver,
  onToggle,
  onFocus,
  onSelectAll,
  onSelectOnly,
  onFiles,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const activeCount = months.filter((item) => item.active).length

  return (
    <section className={dragOver ? 'month-rail drop-target' : 'month-rail'} aria-label="Month library">
      <div className="month-rail-head">
        <div>
          <p className="kicker">Period library</p>
          <h2>Months</h2>
        </div>
        <p className="month-rail-note">
          {dragOver
            ? 'Drop Excel workbooks to add months…'
            : 'Drop `.xlsx` here, or place files in `data/` / project root. Tap chips to compare.'}
        </p>
        <div className="month-rail-actions">
          <button type="button" className="ghost" onClick={onSelectAll} disabled={months.length === 0}>
            All on
          </button>
          <button type="button" className="solid" onClick={() => fileRef.current?.click()}>
            Add Excel
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            multiple
            hidden
            onChange={(event) => {
              const files = [...(event.target.files ?? [])]
              if (files.length) onFiles(files)
              event.target.value = ''
            }}
          />
        </div>
      </div>

      <div className="month-chips" role="group" aria-label="Active months">
        {months.map((month, index) => (
          <button
            key={month.id}
            type="button"
            className={`month-chip${month.active ? ' on' : ''}${focusMonthId === month.id ? ' focus' : ''}`}
            style={{ ['--month-tone' as string]: monthTone(index) }}
            aria-pressed={month.active}
            title={`${month.fileName} · ${rangeNote(month.range)} · double-click = only this month`}
            onClick={() => {
              onToggle(month.id)
              onFocus(month.id)
            }}
            onDoubleClick={(event) => {
              event.preventDefault()
              onSelectOnly(month.id)
              onFocus(month.id)
            }}
          >
            <span className="month-chip-swatch" aria-hidden="true" />
            <strong>{month.label}</strong>
            <small>
              {rangeNote(month.range)}
              {month.active ? '' : ' · off'}
            </small>
          </button>
        ))}
      </div>
      <p className="hint" style={{ margin: 0 }}>
        {activeCount} of {months.length} in comparison
        {activeCount > 1 ? ' · Command shows side-by-side month cards' : ''}
      </p>
    </section>
  )
}
