import { useEffect, useMemo, useRef, useState } from 'react'
import {
  GEO_PARISH_IDS,
  JAMAICA_BOUNDS,
  type GeoJsonParish,
  type GeoParishId,
  type ParishMetric,
  type ParishSignal,
  type ParishUniverse,
  metricIntensity,
} from '../lib/parishGeo'

type Props = {
  geo: GeoJsonParish | null
  universe: ParishUniverse
  metric: ParishMetric
  selected: GeoParishId | null
  onSelect: (id: GeoParishId | null) => void
  fillFor: (signal: ParishSignal | undefined, intensity: number) => string
  strokeColor: string
}

type ProjectedParish = {
  id: GeoParishId
  path: string
  labelX: number
  labelY: number
}

const VB_W = 1000
const VB_H = 420
const PAD = 18

function project(lon: number, lat: number): [number, number] {
  const { west, east, south, north } = JAMAICA_BOUNDS
  const x = PAD + ((lon - west) / (east - west)) * (VB_W - PAD * 2)
  const y = PAD + ((north - lat) / (north - south)) * (VB_H - PAD * 2)
  return [x, y]
}

function ringPath(ring: number[][]): string {
  if (ring.length === 0) return ''
  return ring
    .map((coord, index) => {
      const [x, y] = project(coord[0], coord[1])
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
    .concat(' Z')
}

function geometryPath(geometry: { type: string; coordinates: unknown }): string {
  if (geometry.type === 'Polygon') {
    const coords = geometry.coordinates as number[][][]
    return coords.map(ringPath).join(' ')
  }
  if (geometry.type === 'MultiPolygon') {
    const coords = geometry.coordinates as number[][][][]
    return coords.flatMap((poly) => poly.map(ringPath)).join(' ')
  }
  return ''
}

function centroidOfPath(ring: number[][]): { x: number; y: number } {
  let sx = 0
  let sy = 0
  let n = 0
  for (const coord of ring) {
    const [x, y] = project(coord[0], coord[1])
    sx += x
    sy += y
    n += 1
  }
  return n > 0 ? { x: sx / n, y: sy / n } : { x: VB_W / 2, y: VB_H / 2 }
}

function projectParishes(geo: GeoJsonParish): ProjectedParish[] {
  const out: ProjectedParish[] = []
  for (const feature of geo.features) {
    const id = feature.properties.id as GeoParishId
    if (!GEO_PARISH_IDS.includes(id)) continue
    const geom = feature.geometry as { type: string; coordinates: unknown }
    const path = geometryPath(geom)
    let label = { x: VB_W / 2, y: VB_H / 2 }
    if (geom.type === 'Polygon') {
      label = centroidOfPath((geom.coordinates as number[][][])[0] ?? [])
    } else if (geom.type === 'MultiPolygon') {
      const polys = geom.coordinates as number[][][][]
      let best = polys[0]?.[0] ?? []
      let bestLen = best.length
      for (const poly of polys) {
        if ((poly[0]?.length ?? 0) > bestLen) {
          best = poly[0]
          bestLen = best.length
        }
      }
      label = centroidOfPath(best)
    }
    out.push({ id, path, labelX: label.x, labelY: label.y })
  }
  return out
}

export function JamaicaChoropleth({ geo, universe, metric, selected, onSelect, fillFor, strokeColor }: Props) {
  const projected = useMemo(() => (geo ? projectParishes(geo) : []), [geo])

  if (!geo || projected.length === 0) {
    return (
      <div className="map-choropleth empty">
        <p>{geo ? 'Parish outlines could not be projected.' : 'Loading parish outlines…'}</p>
      </div>
    )
  }

  return (
    <div className="map-choropleth">
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        role="img"
        aria-label="Jamaica parish choropleth"
        className="map-choropleth-svg"
      >
        <defs>
          <linearGradient id="map-sea" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--bg)" />
            <stop offset="100%" stopColor="var(--panel-2)" />
          </linearGradient>
        </defs>
        <rect width={VB_W} height={VB_H} fill="url(#map-sea)" rx="12" />
        {projected.map((parish) => {
          const signal = universe.byId.get(parish.id)
          const intensity = signal ? metricIntensity(signal, metric, universe) : 0
          const active = selected === parish.id
          return (
            <g key={parish.id}>
              <path
                d={parish.path}
                className={active ? 'map-parish on' : 'map-parish'}
                fill={fillFor(signal, intensity)}
                stroke={strokeColor}
                strokeWidth={active ? 2.4 : 1.1}
                onClick={() => onSelect(active ? null : parish.id)}
                role="button"
                tabIndex={0}
                aria-pressed={active}
                aria-label={`${parish.id}${signal ? `, ${signal.jobs} jobs` : ''}`}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onSelect(active ? null : parish.id)
                  }
                }}
              />
              {(signal?.jobs ?? 0) > 0 && (
                <text
                  x={parish.labelX}
                  y={parish.labelY}
                  className="map-parish-label"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  pointerEvents="none"
                >
                  {parish.id.replace(/^St\.\s/, 'St.')}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

type GoogleProps = Props & {
  apiKey: string
  mapId?: string
  onError?: (message: string) => void
}

declare global {
  interface Window {
    google?: typeof google
    __ercmpMapsPromise?: Promise<typeof google>
  }
}

function loadGoogleMaps(apiKey: string, mapId?: string): Promise<typeof google> {
  if (window.google?.maps) return Promise.resolve(window.google)
  if (window.__ercmpMapsPromise) return window.__ercmpMapsPromise

  window.__ercmpMapsPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-ercmp-maps]')
    if (existing) {
      existing.addEventListener('load', () => resolve(window.google!))
      existing.addEventListener('error', () => reject(new Error('Google Maps failed to load')))
      return
    }
    const script = document.createElement('script')
    script.dataset.ercmpMaps = '1'
    script.async = true
    script.defer = true
    const params = new URLSearchParams({
      key: apiKey,
      v: 'weekly',
    })
    void mapId
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`
    script.onload = () => {
      if (window.google?.maps) resolve(window.google)
      else reject(new Error('Google Maps loaded without maps namespace'))
    }
    script.onerror = () => reject(new Error('Google Maps script error'))
    document.head.appendChild(script)
  })
  return window.__ercmpMapsPromise
}

export function GoogleParishMap({
  apiKey,
  mapId,
  geo,
  universe,
  metric,
  selected,
  onSelect,
  fillFor,
  strokeColor,
  onError,
}: GoogleProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const dataRef = useRef<google.maps.Data | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const fillRef = useRef(fillFor)
  const universeRef = useRef(universe)
  const metricRef = useRef(metric)
  const selectedRef = useRef(selected)
  const onSelectRef = useRef(onSelect)
  fillRef.current = fillFor
  universeRef.current = universe
  metricRef.current = metric
  selectedRef.current = selected
  onSelectRef.current = onSelect

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const g = await loadGoogleMaps(apiKey, mapId)
        if (cancelled || !hostRef.current) return
        const mapOptions: google.maps.MapOptions = {
          center: { lat: 18.11, lng: -77.3 },
          zoom: 8,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
          gestureHandling: 'greedy',
          backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#050806',
        }
        if (mapId) {
          mapOptions.mapId = mapId
          mapOptions.tilt = 45
          mapOptions.heading = 20
        } else {
          mapOptions.mapTypeId = 'roadmap'
          mapOptions.styles = [
            { elementType: 'geometry', stylers: [{ color: '#0c1610' }] },
            { elementType: 'labels.text.fill', stylers: [{ color: '#9eb4a6' }] },
            { elementType: 'labels.text.stroke', stylers: [{ color: '#050806' }] },
            { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#061018' }] },
            { featureType: 'road', stylers: [{ visibility: 'off' }] },
            { featureType: 'poi', stylers: [{ visibility: 'off' }] },
            { featureType: 'transit', stylers: [{ visibility: 'off' }] },
            { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#2a4a34' }] },
          ]
          mapOptions.tilt = 0
        }
        const map = new g.maps.Map(hostRef.current, mapOptions)
        mapRef.current = map
        const data = new g.maps.Data({ map })
        dataRef.current = data
        if (geo) {
          data.addGeoJson(geo as unknown as object)
          const bounds = new g.maps.LatLngBounds()
          data.forEach((feature) => {
            feature.getGeometry()?.forEachLatLng((latLng) => bounds.extend(latLng))
          })
          if (!bounds.isEmpty()) map.fitBounds(bounds, 28)
        }
        data.addListener('click', (event: google.maps.Data.MouseEvent) => {
          const id = String(event.feature.getProperty('id') ?? '') as GeoParishId
          if (!GEO_PARISH_IDS.includes(id)) return
          onSelectRef.current(selectedRef.current === id ? null : id)
        })
        if (!cancelled) setStatus('ready')
      } catch (reason) {
        const message = reason instanceof Error ? reason.message : 'Maps failed to load'
        if (!cancelled) {
          setStatus('error')
          setError(message)
          onError?.(message)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [apiKey, mapId, geo, onError])

  useEffect(() => {
    const data = dataRef.current
    if (!data || status !== 'ready') return
    data.setStyle((feature) => {
      const id = String(feature.getProperty('id') ?? '') as GeoParishId
      const signal = universeRef.current.byId.get(id)
      const intensity = signal ? metricIntensity(signal, metricRef.current, universeRef.current) : 0
      const active = selectedRef.current === id
      return {
        fillColor: fillRef.current(signal, intensity),
        fillOpacity: signal && signal.jobs > 0 ? 0.72 : 0.18,
        strokeColor,
        strokeWeight: active ? 2.8 : 1.2,
        strokeOpacity: active ? 1 : 0.75,
        zIndex: active ? 3 : 1,
      }
    })
  }, [universe, metric, selected, strokeColor, status, fillFor])

  useEffect(() => {
    const map = mapRef.current
    const data = dataRef.current
    if (!map || !data || !selected || status !== 'ready' || !window.google) return
    const bounds = new window.google.maps.LatLngBounds()
    let found = false
    data.forEach((feature) => {
      if (String(feature.getProperty('id')) !== selected) return
      found = true
      feature.getGeometry()?.forEachLatLng((latLng) => bounds.extend(latLng))
    })
    if (found && !bounds.isEmpty()) {
      map.fitBounds(bounds, 64)
      try {
        map.setTilt(45)
      } catch {
        /* tilt optional */
      }
    }
  }, [selected, status])

  if (status === 'error') {
    return (
      <div className="map-google-error">
        <p>Google Maps could not load{error ? `: ${error}` : ''}.</p>
        <p className="hint">Falling back to the SVG choropleth below.</p>
      </div>
    )
  }

  return (
    <div className="map-google-host">
      {status === 'loading' && <div className="map-google-loading">Loading geo plane…</div>}
      <div ref={hostRef} className="map-google-canvas" aria-label="Jamaica Google Map" />
    </div>
  )
}
