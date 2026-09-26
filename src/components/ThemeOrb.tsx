import { useEffect, useId, useRef, useState } from 'react'
import { THEMES, type ThemeId } from '../lib/theme'

type Props = {
  theme: ThemeId
  onTheme: (theme: ThemeId) => void
}

export function ThemeOrb({ theme, onTheme }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const current = THEMES.find((item) => item.id === theme) ?? THEMES[0]

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  function cycle() {
    const index = THEMES.findIndex((item) => item.id === theme)
    const next = THEMES[(index + 1) % THEMES.length]
    onTheme(next.id)
  }

  return (
    <div className={`theme-orb${open ? ' open' : ''}`} ref={rootRef} data-theme-orb={theme}>
      <button
        type="button"
        className="theme-orb-core"
        aria-label={`Theme: ${current.label}. Click to choose, double-click to cycle.`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        title={`${current.label} · ${current.hint}`}
        onClick={() => setOpen((value) => !value)}
        onDoubleClick={(event) => {
          event.preventDefault()
          cycle()
          setOpen(false)
        }}
      >
        <span className="theme-orb-ring" aria-hidden="true" />
        <span className="theme-orb-glow" aria-hidden="true" />
        <span className="theme-orb-face" data-theme-swatch={theme} aria-hidden="true" />
        <span className="theme-orb-label">{current.label}</span>
      </button>

      {open && (
        <div className="theme-orb-menu" id={listId} role="listbox" aria-label="Color theme">
          {THEMES.map((item, index) => (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={theme === item.id}
              className={`theme-orb-option${theme === item.id ? ' on' : ''}`}
              style={{ ['--orb-i' as string]: String(index) }}
              title={item.hint}
              onClick={() => {
                onTheme(item.id)
                setOpen(false)
              }}
            >
              <span className="theme-orb-face" data-theme-swatch={item.id} aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
