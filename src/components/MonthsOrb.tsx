import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { MonthDataset } from '../types'
import { MonthRail } from './MonthRail'

type Props = {
  months: MonthDataset[]
  focusMonthId: string | null
  onToggle: (id: string) => void
  onFocus: (id: string) => void
  onSelectAll: () => void
  onSelectOnly: (id: string) => void
  onRemove: (id: string) => void
  onFiles: (files: File[]) => void
}

export function MonthsOrb({
  months,
  focusMonthId,
  onToggle,
  onFocus,
  onSelectAll,
  onSelectOnly,
  onRemove,
  onFiles,
}: Props) {
  const [open, setOpen] = useState(false)
  const listId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)
  const active = months.filter((item) => item.active)
  const label =
    active.length === 0 ? '—' : active.length === 1 ? active[0].label.slice(0, 6) : `${active.length}`
  const detail =
    active.length === 0
      ? 'No months'
      : active.length === 1
        ? active[0].label
        : `${active.length} months on`

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    // Focus after paint so the portal node exists.
    const id = window.requestAnimationFrame(() => closeRef.current?.focus())
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
      window.cancelAnimationFrame(id)
    }
  }, [open])

  const sheet =
    open &&
    createPortal(
      <div className="chrome-sheet-scrim" onClick={() => setOpen(false)}>
        <div
          className="chrome-sheet months-sheet"
          id={listId}
          role="dialog"
          aria-modal="true"
          aria-label="Period library"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="chrome-sheet-head">
            <div>
              <p className="kicker">Period library</p>
              <h2>Months</h2>
            </div>
            <button type="button" className="icon-btn" ref={closeRef} onClick={() => setOpen(false)}>
              Done
            </button>
          </div>
          <div className="chrome-sheet-body">
            <MonthRail
              months={months}
              focusMonthId={focusMonthId}
              onToggle={onToggle}
              onFocus={onFocus}
              onSelectAll={onSelectAll}
              onSelectOnly={onSelectOnly}
              onRemove={onRemove}
              onFiles={onFiles}
              compact
            />
          </div>
        </div>
      </div>,
      document.body,
    )

  return (
    <>
      <div className="months-orb">
        <button
          type="button"
          className="months-orb-core"
          aria-label={`Months: ${detail}. Open period library.`}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={listId}
          title={`${detail} · manage periods`}
          onClick={() => setOpen(true)}
        >
          <span className="months-orb-ring" aria-hidden="true" />
          <span className="months-orb-face" aria-hidden="true">
            {label}
          </span>
          <span className="months-orb-label">Months</span>
        </button>
      </div>
      {sheet}
    </>
  )
}
