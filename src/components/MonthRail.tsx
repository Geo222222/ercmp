import { useRef, useState, type DragEvent } from 'react'
import type { MonthDataset } from '../types'
import { monthTone, rangeNote } from '../lib/excel'
import { LabelHint } from './Hint'

type Props = {
  months: MonthDataset[]
  focusMonthId: string | null
  onToggle: (id: string) => void
  onFocus: (id: string) => void
  onSelectAll: () => void
  onSelectOnly: (id: string) => void
  onFiles: (files: File[]) => void
  /** Tighter layout when hosted inside the months sheet. */
  compact?: boolean
}

export function MonthRail({
  months,
  focusMonthId,
  onToggle,
  onFocus,
  onSelectAll,
  onSelectOnly,
  onFiles,
  compact = false,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const activeCount = months.filter((item) => item.active).length

  function onDragOver(event: DragEvent) {
    if (![...event.dataTransfer.types].includes('Files')) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'copy'
    setDragOver(true)
  }

  function onDragLeave(event: DragEvent) {
    if (event.currentTarget.contains(event.relatedTarget as Node)) return
    setDragOver(false)
  }

  function onDrop(event: DragEvent) {
    event.preventDefault()
    event.stopPropagation()
    setDragOver(false)
    const files = [...event.dataTransfer.files]
    if (files.length) onFiles(files)
  }

  return (
    <section
      className={[
        'month-rail',
        compact ? 'compact' : '',
        dragOver ? 'drop-target' : '',
        months.length === 0 ? 'empty' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label="Month library"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="month-drop-well">
        <div className="month-drop-beacon" aria-hidden="true">
          <span className="month-drop-icon" />
        </div>
        <div className="month-drop-copy">
          <p className="month-drop-kicker">{dragOver ? 'Release to load' : 'Drop zone'}</p>
          <h2>{dragOver ? 'Add these workbooks' : 'Drag Excel months here'}</h2>
          <p className="month-rail-note">
            {dragOver
              ? 'Workbooks land in the period library and turn into month chips.'
              : 'Drop `.xlsx` / `.xls`, or browse. Tap chips to compare; double-tap one month alone.'}
          </p>
        </div>
        <div className="month-rail-actions">
          <button type="button" className="ghost" onClick={onSelectAll} disabled={months.length === 0}>
            All on
          </button>
          <button type="button" className="solid month-add-btn" onClick={() => fileRef.current?.click()}>
            <span className="month-add-mark" aria-hidden="true" />
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

      {months.length > 0 ? (
        <>
          <div className="month-chip-head">
            <p className="kicker">
              <LabelHint tip="monthRail" label="About the month rail">
                Active periods
              </LabelHint>
            </p>
            <span>
              {activeCount} of {months.length} in comparison
              {activeCount > 1 ? ' · side-by-side on Command' : ''}
            </span>
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
        </>
      ) : (
        <p className="month-empty-hint">No months loaded yet — drop a workbook or use Add Excel.</p>
      )}
    </section>
  )
}
