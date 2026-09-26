export type ThemeId = 'matrix' | 'mono' | 'sky'

export const THEMES: { id: ThemeId; label: string; hint: string }[] = [
  { id: 'matrix', label: 'Matrix', hint: 'Green terminal' },
  { id: 'mono', label: 'B&W', hint: 'High contrast' },
  { id: 'sky', label: 'Sky', hint: 'Daylight blue' },
]

const STORAGE_KEY = 'ercmp-theme'

export function isThemeId(value: string | null | undefined): value is ThemeId {
  return value === 'matrix' || value === 'mono' || value === 'sky'
}

export function readTheme(): ThemeId {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (isThemeId(stored)) return stored
  } catch {
    /* ignore */
  }
  return 'matrix'
}

export function applyTheme(theme: ThemeId) {
  document.documentElement.dataset.theme = theme
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) {
    const color = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
    if (color) meta.setAttribute('content', color)
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    /* ignore */
  }
}

/** Chart / rank palette from the active theme CSS variables. */
export function themePalette(): {
  stages: string[]
  avg: string
  median: string
  weather: string
  rankFast: string
  rankSlow: string
} {
  const root = getComputedStyle(document.documentElement)
  const read = (name: string, fallback: string) => root.getPropertyValue(name).trim() || fallback
  return {
    stages: [
      read('--stage-1', '#33c46a'),
      read('--stage-2', '#4aa3ff'),
      read('--stage-3', '#d4a017'),
      read('--stage-4', '#e07040'),
      read('--stage-5', '#7a9bb0'),
      read('--stage-6', '#9eb4c4'),
    ],
    avg: read('--chart-avg', '#4aa3ff'),
    median: read('--chart-median', '#d4a017'),
    weather: read('--chart-weather', '#33c46a'),
    rankFast: read('--rank-fast', '#33c46a'),
    rankSlow: read('--rank-slow', '#e07040'),
  }
}
