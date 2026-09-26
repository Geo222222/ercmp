import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { THEMES, type ThemeId } from '../lib/theme'

type Props = {
  theme: ThemeId
  onTheme: (theme: ThemeId) => void
}

type MenuPos = { top: number; right: number }

export function ThemeOrb({ theme, onTheme }: Props) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<MenuPos>({ top: 0, right: 0 })
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const current = THEMES.find((item) => item.id === theme) ?? THEMES[0]

  function placeMenu() {
    const node = rootRef.current
    if (!node) return
    const rect = node.getBoundingClientRect()
    setPos({
      top: Math.round(rect.bottom + 10),
      right: Math.round(window.innerWidth - rect.right),
    })
  }

  useLayoutEffect(() => {
    if (!open) return
    placeMenu()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    const onReposition = () => placeMenu()
    window.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onReposition)
    window.addEventListener('scroll', onReposition, true)
    return () => {
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onReposition)
      window.removeEventListener('scroll', onReposition, true)
    }
  }, [open])

  function cycle() {
    const index = THEMES.findIndex((item) => item.id === theme)
    const next = THEMES[(index + 1) % THEMES.length]
    onTheme(next.id)
  }

  const menu =
    open &&
    createPortal(
      <div
        ref={menuRef}
        className="theme-orb-menu portal"
        id={listId}
        role="listbox"
        aria-label="Color theme"
        style={{ top: pos.top, right: pos.right }}
      >
        {THEMES.map((item) => (
          <button
            key={item.id}
            type="button"
            role="option"
            aria-selected={theme === item.id}
            className={`theme-orb-option${theme === item.id ? ' on' : ''}`}
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
      </div>,
      document.body,
    )

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
      {menu}
    </div>
  )
}
