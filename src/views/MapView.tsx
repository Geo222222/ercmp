import { useEffect, useMemo, useState } from 'react'
import type { BoardConfig, CleaningMode, CrewReport, Row, ViewId } from '../types'
import { Hint, LabelHint } from '../components/Hint'
import { GoogleParishMap, JamaicaChoropleth } from '../components/ParishMapPlane'
import {
  buildParishUniverse,
  islandPulse,
  parishColumn,
  scopeValuesForParish,
  type GeoJsonParish,
  type GeoParishId,
  type ParishMetric,
  type ParishSignal,
} from '../lib/parishGeo'
import { displayValue, formatDuration, formatInt, formatMinutes } from '../lib/format'
import { themePalette } from '../lib/theme'
import './MapView.css'

export type MapViewProps = {
  headers: string[]
  rows: Row[]
  config: BoardConfig
  report: CrewReport | null
  mode: CleaningMode
  onMode: (mode: CleaningMode) => void
  monthLabel: string
  onScopeParish: (values: string[]) => void
  onJump: (view: ViewId) => void
  onSelectCrew: (crew: string | null) => void
}

function readCss(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace('#', '').trim()
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16)
    const g = parseInt(clean[1] + clean[1], 16)
    const b = parseInt(clean[2] + clean[2], 16)
    return { r, g, b }
  }
  if (clean.length !== 6) return null
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  }
}

function mixHex(a: string, b: string, t: number): string {
  const A = hexToRgb(a)
  const B = hexToRgb(b)
  if (!A || !B) return a
  const m = (x: number, y: number) => Math.round(x + (y - x) * t)
  const to = (n: number) => n.toString(16).padStart(2, '0')
  return `#${to(m(A.r, B.r))}${to(m(A.g, B.g))}${to(m(A.b, B.b))}`
}

export function MapView({
  headers,
  rows,
  config,
  report,
  mode,
  onMode,
  monthLabel,
  onScopeParish,
  onJump,
  onSelectCrew,
}: MapViewProps) {
  const apiKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim() || ''
  const mapId = (import.meta.env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined)?.trim() || ''
  const [geo, setGeo] = useState<GeoJsonParish | null>(null)
  const [geoError, setGeoError] = useState<string | null>(null)
  const [metric, setMetric] = useState<ParishMetric>('jobs')
  const [selected, setSelected] = useState<GeoParishId | null>(null)
  const [googleFailed, setGoogleFailed] = useState(false)
  const [paletteTick, setPaletteTick] = useState(0)

  const parishCol = useMemo(() => parishColumn(headers, config), [headers, config])
  const universe = useMemo(() => buildParishUniverse(rows, config, parishCol), [rows, config, parishCol])
  const pulse = useMemo(() => islandPulse(report, mode), [report, mode])
  const focus = selected ? universe.byId.get(selected) ?? null : null

  useEffect(() => {
    const sync = () => setPaletteTick((t) => t + 1)
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    ;(async () => {
      try {
        const response = await fetch('/geo/jamaica-parishes.geojson', { signal: controller.signal })
        if (!response.ok) throw new Error(`GeoJSON ${response.status}`)
        const json = (await response.json()) as GeoJsonParish
        setGeo(json)
        setGeoError(null)
      } catch (reason) {
        if (controller.signal.aborted) return
        setGeoError(reason instanceof Error ? reason.message : 'Could not load parish outlines')
      }
    })()
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (selected && !universe.byId.get(selected)?.jobs) {
      /* keep selection even if empty so unmatched polygons stay focusable */
    }
  }, [selected, universe])

  const colors = useMemo(() => {
    void paletteTick
    const theme = themePalette()
    return {
      empty: readCss('--panel-2', '#101a14'),
      low: theme.rankFast,
      high: theme.rankSlow,
      mid: theme.avg,
      stroke: readCss('--line-strong', '#2a4a34'),
      accent: readCss('--accent', '#259653'),
    }
  }, [paletteTick])

  const fillFor = useMemo(() => {
    return (signal: ParishSignal | undefined, intensity: number) => {
      if (!signal || signal.jobs <= 0) return colors.empty
      if (metric === 'jobs') {
        return mixHex(colors.low, colors.mid, Math.pow(intensity, 0.85))
      }
      return mixHex(colors.mid, colors.high, Math.pow(intensity, 0.9))
    }
  }, [colors, metric])

  const mappedJobs = universe.signals.reduce((sum, s) => sum + s.jobs, 0)
  const unmatchedJobs = universe.unmatched.reduce((sum, u) => sum + u.jobs, 0)
  const useGoogle = Boolean(apiKey) && !googleFailed

  function selectParish(id: GeoParishId | null) {
    setSelected(id)
  }

  function scopeFocus() {
    if (!focus) return
    onScopeParish(scopeValuesForParish(focus))
  }

  function openRoster() {
    if (focus) onScopeParish(scopeValuesForParish(focus))
    onJump('roster')
  }

  function openCommand(crew?: string) {
    if (crew) onSelectCrew(crew)
    onJump('command')
  }

  function openCharts() {
    if (focus) onScopeParish(scopeValuesForParish(focus))
    onJump('charts')
  }

  return (
    <section className="panel map-view">
      <div className="panel-head">
        <div>
          <p className="kicker">Universe</p>
          <h2>Jamaica field plane · {monthLabel}</h2>
        </div>
        <div className="map-head-actions">
          <div className="seg" role="group" aria-label="Cleaning mode">
            <button type="button" aria-pressed={mode === 'cleaned'} onClick={() => onMode('cleaned')}>
              Field-cleaned
            </button>
            <button type="button" aria-pressed={mode === 'raw'} onClick={() => onMode('raw')}>
              Raw clocks
            </button>
          </div>
          <Hint tip="mapUniverse" label="About Map universe" />
        </div>
      </div>

      <div className="map-status" aria-live="polite">
        <span className="map-live">Situational live</span>
        <span className="map-mode">
          {useGoogle ? 'Google geo plane' : 'SVG choropleth'} · {formatInt(universe.totalJobs)} jobs ·{' '}
          {formatInt(mappedJobs)} on parish · {formatInt(unmatchedJobs)} unassigned
        </span>
      </div>

      <div className="map-island-pulse" aria-label="Island command pulse">
        <div className="map-pulse-card">
          <span>Fastest crew</span>
          <strong>{pulse.fastest ?? '—'}</strong>
        </div>
        <div className="map-pulse-card">
          <span>Slowest crew</span>
          <strong>{pulse.slowest ?? '—'}</strong>
        </div>
        <div className="map-pulse-card">
          <span>Quality flags</span>
          <strong>{formatInt(pulse.flags)}</strong>
        </div>
        <div className="map-pulse-card">
          <span>Cleaned / raw</span>
          <strong>
            {formatInt(pulse.cleaned)} / {formatInt(pulse.raw)}
          </strong>
        </div>
      </div>

      <div className="map-controls">
        <LabelHint tip="mapMetric" label="About map metric">
          <span className="map-control-label">Paint by</span>
        </LabelHint>
        <div className="seg" role="group" aria-label="Choropleth metric">
          <button type="button" aria-pressed={metric === 'jobs'} onClick={() => setMetric('jobs')}>
            Job density
          </button>
          <button type="button" aria-pressed={metric === 'avg'} onClick={() => setMetric('avg')}>
            Avg response
          </button>
        </div>
      </div>

      <div className="map-stage">
        <div className="map-plane">
          {!apiKey && (
            <div className="map-key-banner" role="status">
              <strong>Google Maps key not set</strong>
              <p>
                Add <code>VITE_GOOGLE_MAPS_API_KEY</code> to <code>.env</code> (see <code>.env.example</code>). Optional{' '}
                <code>VITE_GOOGLE_MAPS_MAP_ID</code> enables vector / tilt styling. SVG parish plane stays live below.
              </p>
            </div>
          )}
          {useGoogle && geo && (
            <GoogleParishMap
              apiKey={apiKey}
              mapId={mapId || undefined}
              geo={geo}
              universe={universe}
              metric={metric}
              selected={selected}
              onSelect={selectParish}
              fillFor={fillFor}
              strokeColor={colors.stroke}
              onError={() => setGoogleFailed(true)}
            />
          )}
          {(!useGoogle || googleFailed) && (
            <JamaicaChoropleth
              geo={geo}
              universe={universe}
              metric={metric}
              selected={selected}
              onSelect={selectParish}
              fillFor={fillFor}
              strokeColor={colors.stroke}
            />
          )}
          {useGoogle && !googleFailed && (
            <details className="map-fallback-details">
              <summary>SVG parish fallback</summary>
              <JamaicaChoropleth
                geo={geo}
                universe={universe}
                metric={metric}
                selected={selected}
                onSelect={selectParish}
                fillFor={fillFor}
                strokeColor={colors.stroke}
              />
            </details>
          )}
          {geoError && <p className="banner">{geoError}</p>}
        </div>

        <aside className="map-focus" aria-label="Parish focus stack">
          {!focus && (
            <div className="map-focus-empty">
              <p className="kicker">Focus</p>
              <h3>Tap a parish</h3>
              <p className="hint">
                Map composes Command speed, Roster jobs, Stats share, and Charts instruments onto Jamaica’s parishes.
                Select a polygon to open the focus stack.
              </p>
              <ul className="map-leader">
                {universe.signals
                  .filter((s) => s.jobs > 0)
                  .slice(0, 6)
                  .map((s) => (
                    <li key={s.id}>
                      <button type="button" onClick={() => setSelected(s.id)}>
                        <span>{s.id}</span>
                        <em>
                          {formatInt(s.jobs)} · {(s.share * 100).toFixed(0)}%
                          {s.avg != null ? ` · ${formatDuration(s.avg)}` : ''}
                        </em>
                      </button>
                    </li>
                  ))}
              </ul>
              {universe.unmatched.length > 0 && (
                <div className="map-unmatched">
                  <p className="kicker">Unassigned / unmatched</p>
                  <ul>
                    {universe.unmatched.map((item) => (
                      <li key={item.label}>
                        <span>{displayValue(item.label)}</span>
                        <em>{formatInt(item.jobs)}</em>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {focus && (
            <div className="map-focus-stack">
              <div className="map-focus-head">
                <div>
                  <p className="kicker">Parish focus</p>
                  <h3>{focus.id}</h3>
                  <p className="hint">
                    Sources: {focus.sources.length > 0 ? focus.sources.join(', ') : '—'}
                  </p>
                </div>
                <button type="button" className="ghost" onClick={() => setSelected(null)}>
                  Clear
                </button>
              </div>

              <div className="map-kpis">
                <div className="kpi">
                  <span>Jobs</span>
                  <strong>{formatInt(focus.jobs)}</strong>
                  <small>Roster signal</small>
                </div>
                <div className="kpi">
                  <span>Share</span>
                  <strong>{(focus.share * 100).toFixed(1)}%</strong>
                  <small>Stats dominance</small>
                </div>
                <div className={`kpi ${focus.avg != null && focus.avg > 60 ? 'warn' : 'good'}`}>
                  <span>Avg response</span>
                  <strong>{focus.avg != null ? formatMinutes(focus.avg) : '—'}</strong>
                  <small>Command clock</small>
                </div>
                <div className={`kpi ${focus.negativeJobs > 0 ? 'bad' : ''}`}>
                  <span>Neg. clocks</span>
                  <strong>{formatInt(focus.negativeJobs)}</strong>
                  <small>Quality pulse</small>
                </div>
              </div>

              <div className="map-share-rail" aria-hidden="true">
                <div className="map-share-fill" style={{ width: `${Math.min(100, focus.share * 100)}%` }} />
              </div>

              <div className="map-crew-block">
                <p className="kicker">Top crews here</p>
                {focus.crews.length === 0 ? (
                  <p className="hint">No crew samples in this parish for the current working set.</p>
                ) : (
                  <ul className="map-crew-list">
                    {focus.crews.slice(0, 5).map((crew, index) => (
                      <li key={crew.crew}>
                        <button type="button" onClick={() => openCommand(crew.crew)}>
                          <span className="map-crew-rank">{index + 1}</span>
                          <span className="map-crew-name">{crew.crew}</span>
                          <em>
                            {formatInt(crew.jobs)}
                            {Number.isFinite(crew.avg) ? ` · ${formatDuration(crew.avg)}` : ''}
                          </em>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="map-actions">
                <button type="button" className="solid" onClick={scopeFocus} disabled={focus.jobs === 0}>
                  Scope to parish
                </button>
                <button type="button" className="ghost" onClick={openRoster} disabled={focus.jobs === 0}>
                  Open Roster
                </button>
                <button type="button" className="ghost" onClick={() => openCommand()}>
                  Jump Command
                </button>
                <button type="button" className="ghost" onClick={openCharts} disabled={focus.jobs === 0}>
                  Charts for scope
                </button>
              </div>
            </div>
          )}
        </aside>
      </div>

      <p className="map-attribution hint">
        Parish outlines: geoBoundaries JAM ADM1 (OSM / Wambacher), CC BY-SA 2.0. KSAN→Kingston, KSAS→St. Andrew,
        Portmore→St. Catherine — see README mapping table.
      </p>
    </section>
  )
}
