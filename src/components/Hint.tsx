import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { HELP, type HelpKey } from '../lib/helpCopy'
import './Hint.css'

type HintProps = {
  tip: HelpKey
  /** Accessible name for the info button. */
  label?: string
}

/**
 * Tap / focus info control — hover-only tips fail on tablets.
 * Opens a short popover from helpCopy; Escape / outside click closes.
 */
export function Hint({ tip, label = 'More info' }: HintProps) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLSpanElement>(null)
  const tipId = useId()
  const text = HELP[tip]

  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent | TouchEvent) => {
      const node = wrapRef.current
      if (!node) return
      if (event.target instanceof Node && !node.contains(event.target)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('touchstart', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('touchstart', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <span className="hint-wrap" ref={wrapRef}>
      <button
        type="button"
        className={open ? 'hint-btn on' : 'hint-btn'}
        aria-expanded={open}
        aria-controls={tipId}
        aria-label={label}
        onClick={(event) => {
          event.stopPropagation()
          setOpen((value) => !value)
        }}
      >
        ?
      </button>
      {open && (
        <span className="hint-pop" id={tipId} role="tooltip">
          {text}
        </span>
      )}
    </span>
  )
}

export function LabelHint({
  tip,
  children,
  label,
}: {
  tip: HelpKey
  children: ReactNode
  label?: string
}) {
  return (
    <span className="label-hint">
      {children}
      <Hint tip={tip} label={label} />
    </span>
  )
}
