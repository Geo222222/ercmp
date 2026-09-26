export function formatInt(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}

export function formatMinutes(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '—'
  return `${value.toFixed(digits)} min`
}

export function formatDuration(mins: number): string {
  if (!Number.isFinite(mins)) return '—'
  const sign = mins < 0 ? '−' : ''
  const abs = Math.abs(mins)
  if (abs < 90) {
    const digits = abs < 10 ? 1 : 0
    return `${sign}${abs.toFixed(digits)}m`
  }
  const hours = Math.floor(abs / 60)
  const minutes = Math.round(abs % 60)
  if (minutes === 60) return `${sign}${hours + 1}h`
  return minutes === 0 ? `${sign}${hours}h` : `${sign}${hours}h ${minutes}m`
}

export function displayValue(value: string): string {
  if (/^null$/i.test(value) || value.trim() === '') return 'Unassigned'
  return value
}

export function shortEndpoint(name: string): string {
  const text = name.toLowerCase()
  if (text.includes('acknowle')) return 'Acknowledge'
  if (text.includes('enroute')) return 'Enroute'
  if (text.includes('on-site') || text.includes('onsite')) return 'On-site'
  if (text.includes('actual comp')) return 'Actual completion'
  if (text.includes('final comp')) return 'Final completion'
  if (text.includes('comp')) return 'Completion'
  if (text.includes('assigned')) return 'Assigned'
  if (text.includes('creation')) return 'Creation'
  return name.replace(/ time$/i, '')
}

export function shortStage(label: string): string {
  const parts = label.split(' -> ')
  if (parts.length !== 2) return label
  return `${shortEndpoint(parts[0])} → ${shortEndpoint(parts[1])}`
}

export function ellipsize(value: string, max: number): string {
  if (value.length <= max) return value
  return `${value.slice(0, max - 1)}…`
}

export function dateStamp(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}
