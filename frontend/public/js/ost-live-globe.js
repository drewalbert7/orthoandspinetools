import { CENTROIDS, LAND_POLYS, US_STATE_NAMES } from './globe-geo.js'

const D2R = Math.PI / 180
/** Default facing: continental North America (spine of the Americas).
 *  Camera lon is opposite geographic lon in this projector (geo −98° → camera +98°). */
const HOME = { lon: 98, lat: 38 }
const POLL_MS = 12_000
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
]

/** Theme-aware globe palette (light default matches site tokens) */
function globeColors() {
  const dark = document.documentElement.classList.contains('dark')
  if (dark) {
    return {
      sea0: '#1a2228',
      sea1: '#12181c',
      sea2: '#0a0e10',
      land: '#7a858c',
      landUs: '#0a7ea4',
      livePin: '#3db8d8',
      placePin: '#8ab4c4',
      ink: '#f4efe6',
      ring: 'rgba(244, 239, 230, 0.12)',
      accent: '#0a7ea4',
    }
  }
  return {
    sea0: '#b8cdd8',
    sea1: '#9eb8c6',
    sea2: '#7a9aab',
    land: '#2f3d44',
    landUs: '#0a7ea4',
    livePin: '#0a7ea4',
    placePin: '#145a72',
    ink: '#111111',
    ring: 'rgba(17, 17, 17, 0.18)',
    accent: '#0a7ea4',
  }
}

function formatNum(n) {
  return Math.round(n).toLocaleString('en-US')
}

function inPoly(lat, lon, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i]
    const [yj, xj] = poly[j]
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function isLand(lat, lon) {
  return LAND_POLYS.some((p) => inPoly(lat, lon, p))
}

function inConus(lat, lon) {
  return lat >= 24 && lat <= 50 && lon >= -125 && lon <= -66
}

function buildDots(baseStep = 3.2) {
  const dots = []
  for (let lat = -84; lat <= 84; lat += baseStep) {
    const latRad = Math.max(0.25, Math.cos(lat * D2R))
    const band = lat >= 24 && lat <= 50
    const step = band ? baseStep * 0.48 : baseStep
    const lonStep = step / latRad
    for (let lon = -180; lon < 180; lon += lonStep) {
      const us = inConus(lat, lon)
      const land = isLand(lat, lon)
      const bayer =
        BAYER[Math.abs(Math.round(lat / step)) & 3][Math.abs(Math.round(lon / step)) & 3] / 16
      if (!land && bayer >= 0.2) continue
      if (us && land && bayer > 0.88) continue
      const φ = lat * D2R
      const λ = lon * D2R
      dots.push({
        x: Math.cos(φ) * Math.sin(λ),
        y: Math.sin(φ),
        zc: Math.cos(φ) * Math.cos(λ),
        land,
        big: bayer < 0.42 || us,
        us,
      })
    }
  }
  return dots
}

const dotsCache = {}
function getDots(light) {
  if (light) {
    if (!dotsCache.light) dotsCache.light = buildDots(4.4)
    return dotsCache.light
  }
  if (!dotsCache.full) dotsCache.full = buildDots(2.45)
  return dotsCache.full
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function flag(cc) {
  const country = (cc || '').split('-')[0]
  if (!/^[A-Z]{2}$/.test(country)) return ''
  return String.fromCodePoint(...[...country].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65))
}

let regionNames
try {
  regionNames = new Intl.DisplayNames(['en'], { type: 'region' })
} catch {
  /* ignore */
}

const THE = new Set(['US', 'GB', 'NL', 'PH', 'AE', 'DO', 'CD'])

function placeLabel(code, city) {
  if (city && code.startsWith('US-')) {
    const st = US_STATE_NAMES[code.slice(3)] || code.slice(3)
    return `${city}, ${st}`
  }
  if (city) return city
  if (!code) return 'unknown'
  const parts = code.split('-')
  if (parts.length === 2 && parts[0] === 'US') {
    return US_STATE_NAMES[parts[1]] || parts[1]
  }
  if (parts.length === 2 && parts[0] === 'CA') {
    try {
      return regionNames?.of(parts[0]) ? `${parts[1]}, Canada` : code
    } catch {
      return code
    }
  }
  try {
    const name = regionNames?.of(parts[0]) || parts[0]
    return THE.has(parts[0]) ? `the ${name}` : name
  } catch {
    return code
  }
}

function barePlace(code, city) {
  if (city && code.startsWith('US-')) {
    return `${city}, ${US_STATE_NAMES[code.slice(3)] || code.slice(3)}`
  }
  if (city) return city
  const parts = code.split('-')
  if (parts.length === 2 && parts[0] === 'US') {
    return US_STATE_NAMES[parts[1]] || `US-${parts[1]}`
  }
  if (parts.length === 2) return `${parts[1]}, ${parts[0]}`
  try {
    return regionNames?.of(code) || code
  } catch {
    return code
  }
}

function agoStr(sec) {
  const s = Math.max(0, Math.floor(Number(sec)))
  if (!Number.isFinite(s)) return ''
  if (s < 10) return 'just now'
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function xyzFromLatLon(lat, lon) {
  const φ = lat * D2R
  const λ = lon * D2R
  return {
    x: Math.cos(φ) * Math.sin(λ),
    y: Math.sin(φ),
    zc: Math.cos(φ) * Math.cos(λ),
  }
}

function resolveLatLon(code, lat, lon) {
  if (lat != null && lon != null && Number.isFinite(lat) && Number.isFinite(lon)) {
    return [lat, lon]
  }
  const hit = CENTROIDS[code] || CENTROIDS[code.split('-')[0]]
  return hit || null
}

function jitterLatLon(lat, lon, salt, i) {
  let h = 0
  for (let k = 0; k < salt.length; k++) h = (h * 31 + salt.charCodeAt(k)) | 0
  const a = ((h + i * 97) % 360) * D2R
  const r = 0.12 + (Math.abs(h) % 7) * 0.04
  return [lat + Math.sin(a) * r, lon + Math.cos(a) * r]
}

function buildLivePins(data) {
  if (!data?.pins?.length) return []
  const byKey = new Map()
  const feed = data.feed || []
  return data.pins
    .map((p) => {
      const ll0 = resolveLatLon(p.c, p.lat, p.lon)
      if (!ll0) return null
      const stack = byKey.get(p.c) || 0
      byKey.set(p.c, stack + 1)
      const ll = stack ? jitterLatLon(ll0[0], ll0[1], p.c, stack) : ll0
      const { x, y, zc } = xyzFromLatLon(ll[0], ll[1])
      const latest = feed.find((f) => f.c === p.c || f.country === p.country)
      return {
        c: p.c,
        n: p.n || 1,
        ago: Number(p.ago) || 0,
        kind: 'live',
        x,
        y,
        zc,
        city: p.city || latest?.city,
        latest,
      }
    })
    .filter(Boolean)
}

/** Softer pins for all-time / member countries (centroids). */
function buildPlacePins(rows, kind = 'place') {
  if (!rows?.length) return []
  const byKey = new Map()
  return rows
    .map((r, i) => {
      const code = r.c || r.code || r.country
      if (!code) return null
      const ll0 = resolveLatLon(code, r.lat, r.lon)
      if (!ll0) return null
      const stack = byKey.get(code) || 0
      byKey.set(code, stack + 1)
      const ll = stack ? jitterLatLon(ll0[0], ll0[1], code, stack) : ll0
      const { x, y, zc } = xyzFromLatLon(ll[0], ll[1])
      return {
        c: code,
        n: r.n || r.count || 1,
        ago: 99999,
        kind,
        x,
        y,
        zc,
        city: r.city || '',
        latest: null,
      }
    })
    .filter(Boolean)
}

function centroidOf(pins) {
  if (!pins.length) return null
  let sx = 0
  let sy = 0
  let sz = 0
  for (const p of pins) {
    sx += p.x
    sy += p.y
    sz += p.zc
  }
  const n = pins.length
  const x = sx / n
  const y = sy / n
  const z = sz / n
  const lat = Math.asin(Math.max(-1, Math.min(1, y))) / D2R
  const lon = Math.atan2(x, z) / D2R
  return { lon, lat }
}

function countryCode(pin) {
  const c = String(pin?.c || pin?.country || '')
  return c.startsWith('US-') ? 'US' : c.slice(0, 2).toUpperCase()
}

function inAmericas(pin) {
  return [
    'US', 'CA', 'MX', 'GT', 'BZ', 'HN', 'SV', 'NI', 'CR', 'PA',
    'CU', 'JM', 'HT', 'DO', 'PR', 'TT',
    'CO', 'VE', 'GY', 'SR', 'GF', 'EC', 'PE', 'BO', 'BR', 'PY', 'UY', 'AR', 'CL',
  ].includes(countryCode(pin))
}

/** Prefer North America / live local pins — never average US+NZ into the Pacific. */
function pickFocus(livePins, placePins) {
  const liveAm = (livePins || []).filter(inAmericas)
  if (liveAm.length) return cameraFromGeo(centroidOf(liveAm)) || { ...HOME }
  if (livePins?.length) return cameraFromGeo(centroidOf(livePins)) || { ...HOME }
  const placeAm = (placePins || []).filter(inAmericas)
  if (placeAm.length) return cameraFromGeo(centroidOf(placeAm)) || { ...HOME }
  return { ...HOME }
}

/** Geographic lon/lat → camera lon/lat for this projector. */
function cameraFromGeo(geo) {
  if (!geo) return null
  return { lon: -geo.lon, lat: geo.lat }
}

function lerpLon(from, to, t) {
  let d = ((((to - from) % 360) + 540) % 360) - 180
  return from + d * t
}

function normLon(lon) {
  return ((((lon + 180) % 360) + 360) % 360) - 180
}

async function fetchVisitorGlobe() {
  try {
    const res = await fetch('/api/analytics/globe', { cache: 'no-store' })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

async function fetchMemberGlobe() {
  try {
    const res = await fetch('/api/community', { cache: 'no-store' })
    if (!res.ok) return null
    const d = await res.json()
    const countries = d.countries || []
    const cities = d.cities || []
    const pins = countries.map((row) => ({
      c: row.code,
      country: row.code,
      n: row.count,
      ago: 99999,
    }))
    const feed = cities.slice(0, 8).map((row) => ({
      c: row.country,
      country: row.country,
      city: row.city,
      path: 'on the floor',
      ago: 99999,
      n: row.count,
    }))
    return {
      live: d.members || 0,
      liveCountries: countries.length,
      liveRegions: 0,
      allTime: { views: d.members || 0, since: null },
      pins,
      feed,
      topCountries: countries.map((row) => ({ c: row.code, n: row.count })),
      topRegions: [],
      moreCountries: Math.max(0, countries.length - 12),
      age: 0,
      mode: 'members',
    }
  } catch {
    return null
  }
}

/**
 * Mount a globe into a container that already holds the expected markup.
 * @param {HTMLElement} rootEl
 * @param {{ mode?: 'visitors' | 'members', pollMs?: number }} [options]
 * @returns {() => void} cleanup
 */
export function initLiveGlobe(rootEl, options = {}) {
  const wrap = rootEl.querySelector('.globe-wrap')
  const canvas = rootEl.querySelector('.globe-canvas')
  const elLive = rootEl.querySelector('[data-g-live]')
  const elSub = rootEl.querySelector('[data-g-sub]')
  const elPins = rootEl.querySelector('[data-g-pins]')
  const elFeed = rootEl.querySelector('[data-g-feed]')
  const elRegions = rootEl.querySelector('[data-g-regions]')
  const elCountries = rootEl.querySelector('[data-g-countries]')

  if (!wrap || !canvas) {
    console.warn('[oc-live-globe] missing .globe-wrap or .globe-canvas inside rootEl')
    return () => {}
  }

  const mode =
    options.mode ||
    rootEl.getAttribute('data-oc-globe-mode') ||
    'visitors'
  const isMembers = mode === 'members'
  const pollMs = options.pollMs || (isMembers ? 60_000 : POLL_MS)
  const fetchData = isMembers ? fetchMemberGlobe : fetchVisitorGlobe

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  const light =
    matchMedia('(max-width: 900px)').matches || matchMedia('(pointer: coarse)').matches
  const DOTS = getDots(light)
  const ctx = canvas.getContext('2d')
  if (!ctx) return () => {}

  let data = null
  let ready = false
  let offline = false
  let dataAt = Date.now()
  let livePins = []
  let placePins = []
  let targetView = { ...HOME }
  let pollId = null
  let cancelled = false

  let W = 0
  let H = 0
  let R = 0
  let CX = 0
  let CY = 0
  let lon0 = HOME.lon
  let lat0 = HOME.lat
  let dragging = false
  let lastPointer = -1e9
  let px = 0
  let py = 0
  let hoverPin = null
  let visible = false
  let onScreen = false
  let raf = null
  let lastT = 0
  const pinScreen = []
  let tip = null

  function driftSec() {
    return Math.floor((Date.now() - dataAt) / 1000)
  }

  function updatePanel() {
    const drift = driftSec()

    if (elLive) {
      elLive.textContent = ready && data ? formatNum(data.live) : '—'
    }

    if (elSub) {
      if (ready && data) {
        if (isMembers) {
          elSub.textContent = `${formatNum(data.live)} member${data.live === 1 ? '' : 's'} · ${formatNum(
            data.liveCountries,
          )} ${data.liveCountries === 1 ? 'country' : 'countries'} · self-reported`
        } else {
          const since = data.allTime?.since
            ? ` since ${new Date(data.allTime.since + 'T00:00:00Z')
                .toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  timeZone: 'UTC',
                })
                .toLowerCase()}`
            : ''
          elSub.textContent = `from ${formatNum(data.liveCountries)} ${
            data.liveCountries === 1 ? 'country' : 'countries'
          }${
            data.liveRegions
              ? ` · ${formatNum(data.liveRegions)} state${data.liveRegions === 1 ? '' : 's'}`
              : ''
          } · ${formatNum(data.allTime?.views)} visits${since}`
        }
      } else if (offline) {
        elSub.textContent = isMembers
          ? 'community floor offline'
          : 'live map offline — showing no invented traffic'
      } else {
        elSub.textContent = isMembers ? 'loading member map…' : 'loading live map…'
      }
    }

    if (elPins) {
      elPins.textContent = String(
        isMembers
          ? data?.topCountries?.length ?? data?.pins?.length ?? 0
          : (data?.pins?.length ?? 0),
      )
    }

    if (elFeed) {
      const feed = (data?.feed || []).slice(0, 6)
      elFeed.innerHTML = ''

      if (ready && feed.length) {
        for (let i = 0; i < feed.length; i++) {
          const f = feed[i]
          const ago = f.ago + drift
          const place = placeLabel(f.c, f.city)
          const text = isMembers
            ? f.city
              ? `${f.n || 1} train in ${f.city}${place && !place.toLowerCase().includes(String(f.city).toLowerCase()) ? ` · ${place}` : ''}`
              : place
                ? `members in ${place}`
                : 'member on the floor'
            : f.c
              ? `someone in ${place} ${ago < 120 ? 'is reading' : 'read'} ${f.path}`
              : `someone ${ago < 120 ? 'is reading' : 'read'} ${f.path}`
          const li = document.createElement('li')
          if (i === 0) li.className = 'fresh'
          li.innerHTML = `<span class="g-dot" aria-hidden="true"></span><span class="g-line">${f.c ? `${flag(f.c)} ` : ''}${esc(text)}</span><span class="g-ago">${isMembers ? (f.n ? `${formatNum(f.n)}` : '') : esc(agoStr(ago))}</span>`
          elFeed.appendChild(li)
        }
      } else if (ready && !feed.length) {
        elFeed.innerHTML = isMembers
          ? '<li><span class="g-dot" aria-hidden="true"></span><span class="g-line">no cities shared yet — country pins still show</span></li>'
          : '<li><span class="g-dot" aria-hidden="true"></span><span class="g-line">quiet — no recent real visits yet</span></li>'
      } else {
        elFeed.innerHTML = `<li><span class="g-dot" aria-hidden="true"></span><span class="g-line">${
          offline
            ? isMembers
              ? 'couldn\u2019t reach the floor'
              : 'couldn\u2019t reach analytics'
            : isMembers
              ? 'connecting to the floor\u2026'
              : 'connecting to analytics\u2026'
        }</span></li>`
      }
    }

    if (elRegions) {
      const regions = data?.topRegions || []
      if (ready && regions.length) {
        elRegions.hidden = false
        elRegions.innerHTML =
          `<span class="g-chips-label">${isMembers ? 'members' : 'real visitors'} · by state</span>` +
          regions
            .map(
              (r) =>
                `<span class="g-chip">${flag(r.c)} ${esc(r.c.replace(/^US-/, ''))} ${formatNum(r.n)}</span>`,
            )
            .join('')
      } else {
        elRegions.hidden = true
        elRegions.innerHTML = ''
      }
    }

    if (elCountries) {
      const countries = data?.topCountries || []
      if (ready && countries.length) {
        elCountries.hidden = false
        elCountries.innerHTML =
          `<span class="g-chips-label">${isMembers ? 'members · self-reported' : 'real visitors · all time'} · by country</span>` +
          countries
            .map((r) => `<span class="g-chip">${flag(r.c)} ${esc(r.c)} ${formatNum(r.n)}</span>`)
            .join('') +
          (data.moreCountries > 0
            ? `<span class="g-more">+ ${formatNum(data.moreCountries)} more</span>`
            : '')
      } else {
        elCountries.hidden = true
        elCountries.innerHTML = ''
      }
    }
  }

  async function load() {
    const next = await fetchData()
    if (cancelled) return
    if (!next) {
      offline = true
      livePins = []
      placePins = []
      updatePanel()
      return
    }
    if (isMembers) {
      placePins = buildPlacePins(next.topCountries || next.pins || [], 'member')
      livePins = []
    } else {
      livePins = buildLivePins(next)
      placePins = buildPlacePins(next.topCountries || [], 'place')
    }
    targetView = { ...HOME }
    // Keep the camera on North America — worldwide place pins (NZ/MY/NL…) must not yank the view.
    const liveAm = livePins.filter(inAmericas)
    if (liveAm.length) {
      const focus = cameraFromGeo(centroidOf(liveAm))
      if (focus) targetView = focus
    }
    if (!dragging) {
      lon0 = HOME.lon
      lat0 = HOME.lat
    }
    data = next
    dataAt = Date.now() - (next.age || 0) * 1000
    ready = true
    offline = false
    updatePanel()
  }

  const setup = () => {
    const box = wrap.getBoundingClientRect()
    const size = Math.min(box.width || 440, 540)
    if (!size) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.style.width = `${size}px`
    canvas.style.height = `${size}px`
    canvas.width = size * dpr
    canvas.height = size * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    W = H = size
    R = size * 0.455
    CX = CY = size / 2
  }

  const project = (d, sinLon, cosLon, sinLat, cosLat) => {
    const x1 = d.x * cosLon - d.zc * sinLon
    const z1 = d.x * sinLon + d.zc * cosLon
    const y1 = d.y * cosLat - z1 * sinLat
    const z2 = d.y * sinLat + z1 * cosLat
    return { sx: CX + R * x1, sy: CY - R * y1, z: z2 }
  }

  const hideTip = () => {
    if (tip) tip.style.display = 'none'
  }

  const showTip = (pin, cx, cy) => {
    if (!tip) {
      tip = document.createElement('div')
      tip.className = 'globe-tip'
      document.body.appendChild(tip)
    }
    const drift = driftSec()
    const f = pin.latest
    const place = barePlace(pin.c, pin.city || f?.city)
    let lines = ''
    if (isMembers || pin.kind === 'member' || pin.kind === 'place') {
      const head = `${flag(pin.c)} ${place}${pin.n > 1 ? ` · ${pin.n}` : ''}`
      lines = `<b>${esc(head)}</b>`
      lines += isMembers || pin.kind === 'member'
        ? `<br><span>${pin.n} member${pin.n === 1 ? '' : 's'} · self-reported</span>`
        : `<br><span>${formatNum(pin.n)} unique visitors · all time</span>`
    } else {
      const head = `${flag(pin.c)} ${place}${pin.n > 1 ? ` · ${pin.n} this hour` : ''}`
      lines = `<b>${esc(head)}</b>`
      if (f) {
        const verb = Number(f.ago) + drift < 120 ? `reading ${esc(f.path)}` : `read ${esc(f.path)}`
        lines += `<br>someone ${verb}`
        if (f.device) lines += ` · ${esc(f.device.toLowerCase())}`
        lines += `<br><span>${esc(agoStr(Number(f.ago) + drift))} · real visit</span>`
      } else {
        lines += `<br><span>last seen ${esc(agoStr(Number(pin.ago) + drift))} · real visit</span>`
      }
    }
    tip.innerHTML = lines
    tip.style.display = 'block'
    const r = tip.getBoundingClientRect()
    tip.style.left = `${Math.min(cx + 14, innerWidth - r.width - 10)}px`
    tip.style.top = `${Math.max(cy - r.height - 12, 8)}px`
  }

  const draw = (t = 0) => {
    ctx.clearRect(0, 0, W, H)
    const sinLon = Math.sin(-lon0 * D2R)
    const cosLon = Math.cos(-lon0 * D2R)
    const sinLat = Math.sin(lat0 * D2R)
    const cosLat = Math.cos(lat0 * D2R)

    const { sea0, sea1, sea2, land, landUs, livePin, placePin, ink, ring, accent } = globeColors()

    const halo = ctx.createRadialGradient(CX, CY, R * 0.92, CX, CY, R * 1.18)
    halo.addColorStop(0, 'rgba(196, 90, 78, 0)')
    halo.addColorStop(0.55, 'rgba(196, 90, 78, 0.07)')
    halo.addColorStop(1, 'rgba(196, 90, 78, 0)')
    ctx.fillStyle = halo
    ctx.beginPath()
    ctx.arc(CX, CY, R * 1.18, 0, Math.PI * 2)
    ctx.fill()

    const grd = ctx.createRadialGradient(CX - R * 0.28, CY - R * 0.34, R * 0.08, CX, CY, R)
    grd.addColorStop(0, sea0)
    grd.addColorStop(0.5, sea1)
    grd.addColorStop(1, sea2)
    ctx.fillStyle = grd
    ctx.beginPath()
    ctx.arc(CX, CY, R, 0, Math.PI * 2)
    ctx.fill()

    const limb = ctx.createRadialGradient(CX, CY, R * 0.55, CX, CY, R)
    limb.addColorStop(0, 'rgba(0,0,0,0)')
    limb.addColorStop(1, 'rgba(0, 0, 0, 0.35)')
    ctx.fillStyle = limb
    ctx.beginPath()
    ctx.arc(CX, CY, R, 0, Math.PI * 2)
    ctx.fill()

    ctx.strokeStyle = ring
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(CX, CY, R + 2.5, 0, Math.PI * 2)
    ctx.stroke()

    ctx.globalAlpha = 0.18
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.ellipse(CX - R * 0.28, CY - R * 0.32, R * 0.22, R * 0.12, -0.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1

    const k = R / 240
    for (const d of DOTS) {
      const p = project(d, sinLon, cosLon, sinLat, cosLat)
      if (p.z <= 0.02) continue
      if (d.land) {
        ctx.fillStyle = d.us ? landUs : land
        ctx.globalAlpha = d.us ? 0.3 + 0.58 * p.z : 0.16 + 0.48 * p.z
        const r = (0.95 + 0.9 * p.z) * (d.big ? 1.18 : 0.86) * k * (d.us ? 1.08 : 1)
        ctx.fillRect(p.sx - r, p.sy - r, r * 2, r * 2)
      } else {
        ctx.fillStyle = land
        ctx.globalAlpha = 0.04 + 0.07 * p.z
        ctx.fillRect(p.sx - 0.65 * k, p.sy - 0.65 * k, 1.3 * k, 1.3 * k)
      }
    }
    ctx.globalAlpha = 1

    pinScreen.length = 0

    for (const pin of placePins) {
      const p = project(pin, sinLon, cosLon, sinLat, cosLat)
      if (p.z <= 0.08) continue
      const base = (1.55 + Math.min(2.4, Math.log2(1 + pin.n))) * k
      const hot = hoverPin === pin
      ctx.fillStyle = placePin || landUs
      ctx.globalAlpha = hot ? 0.9 : 0.55 + 0.25 * p.z
      ctx.beginPath()
      ctx.arc(p.sx, p.sy, base * (hot ? 1.25 : 1), 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.globalAlpha = 0.35
      ctx.beginPath()
      ctx.arc(p.sx - base * 0.2, p.sy - base * 0.2, base * 0.22, 0, Math.PI * 2)
      ctx.fill()
      pinScreen.push({ pin, sx: p.sx, sy: p.sy, r: base * 2.6 })
    }
    ctx.globalAlpha = 1

    for (const pin of livePins) {
      const p = project(pin, sinLon, cosLon, sinLat, cosLat)
      if (p.z <= 0.05) continue
      const fresh = pin.ago < 180
      const hotNow = pin.ago < 45
      const base = (2.15 + Math.min(2.2, Math.log2(1 + pin.n))) * k
      const pulse = fresh && !reduced ? 1 + 0.28 * Math.sin(t / 320 + pin.x * 8 + pin.y * 3) : 1
      const hot = hoverPin === pin

      if (fresh) {
        const wave = (t / 900 + Math.abs(pin.x)) % 1
        ctx.strokeStyle = livePin
        ctx.globalAlpha = (1 - wave) * 0.45
        ctx.lineWidth = 1.4 * k
        ctx.beginPath()
        ctx.arc(p.sx, p.sy, base * (1.4 + wave * 2.4) * pulse, 0, Math.PI * 2)
        ctx.stroke()
      }
      ctx.fillStyle = livePin
      ctx.globalAlpha = hotNow ? 0.28 : 0.14
      ctx.beginPath()
      ctx.arc(p.sx, p.sy, base * 2.6 * pulse, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = hot ? 1 : 0.96
      ctx.beginPath()
      ctx.arc(p.sx, p.sy, base * (hot ? 1.3 : 1), 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.globalAlpha = 0.55
      ctx.beginPath()
      ctx.arc(p.sx - base * 0.25, p.sy - base * 0.25, base * 0.28, 0, Math.PI * 2)
      ctx.fill()

      if (pin.c.startsWith('US-') && p.z > 0.58 && R >= 150) {
        const st = pin.c.slice(3)
        ctx.globalAlpha = 0.8 * p.z
        ctx.fillStyle = ink
        ctx.font = `${Math.max(8, 9.5 * k)}px IBM Plex Mono, ui-monospace, monospace`
        ctx.textAlign = 'center'
        ctx.fillText(st, p.sx, p.sy - base * 2.35)
      }
      pinScreen.push({ pin, sx: p.sx, sy: p.sy, r: base * 2.8 })
    }
    ctx.globalAlpha = 1

    const liveN = livePins.length
    const placeN = placePins.length
    ctx.font = `${Math.max(10, 11 * k)}px IBM Plex Sans, system-ui, sans-serif`
    ctx.textAlign = 'left'
    ctx.fillStyle = ink
    ctx.globalAlpha = 0.55
    let foot = 'waiting for visitors'
    if (isMembers) {
      foot = placeN ? `${placeN} countr${placeN === 1 ? 'y' : 'ies'} on the floor` : 'waiting for members'
    } else if (liveN || placeN) {
      foot = liveN
        ? `${liveN} live · ${placeN} countr${placeN === 1 ? 'y' : 'ies'}`
        : `${placeN} countr${placeN === 1 ? 'y' : 'ies'} all time`
    }
    ctx.fillText(foot, 10, H - 12)
    ctx.globalAlpha = 1

    ctx.strokeStyle = accent
    ctx.globalAlpha = 0.35
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(CX, CY, R + 6, -0.4, 0.15)
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  const hitPin = (x, y) => {
    let best = null
    let bestD = Infinity
    for (const s of pinScreen) {
      const dx = x - s.sx
      const dy = y - s.sy
      const d = dx * dx + dy * dy
      const reach = (s.r + 12) * (s.r + 12)
      if (d < reach && d < bestD) {
        best = s
        bestD = d
      }
    }
    return best
  }

  const onDown = (e) => {
    dragging = true
    lastPointer = performance.now()
    px = e.clientX
    py = e.clientY
    canvas.setPointerCapture(e.pointerId)
  }

  const onMove = (e) => {
    lastPointer = performance.now()
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    if (dragging) {
      lon0 += (e.clientX - px) * 0.32
      lat0 = Math.max(-70, Math.min(70, lat0 + (e.clientY - py) * 0.32))
      px = e.clientX
      py = e.clientY
      hideTip()
      if (reduced) draw(performance.now())
      return
    }
    const hit = hitPin(x, y)
    hoverPin = hit ? hit.pin : null
    canvas.style.cursor = hit ? 'pointer' : 'grab'
    if (hit) showTip(hit.pin, e.clientX, e.clientY)
    else hideTip()
    if (reduced) draw(performance.now())
  }

  const release = () => {
    dragging = false
    lastPointer = performance.now()
  }

  const onUp = (e) => {
    release()
    const rect = canvas.getBoundingClientRect()
    const hit = hitPin(e.clientX - rect.left, e.clientY - rect.top)
    if (hit && e.pointerType !== 'mouse') {
      showTip(hit.pin, e.clientX, e.clientY)
      window.setTimeout(hideTip, 3500)
    }
  }

  const onLeave = () => {
    hoverPin = null
    hideTip()
    canvas.style.cursor = 'grab'
  }

  const loop = (t) => {
    raf = null
    if (!visible) return
    const dt = Math.min(40, t - lastT || 16)
    lastT = t
    const idle = performance.now() - lastPointer > 1800
    if (!dragging) {
      const focus = targetView || HOME
      if (idle) {
        // Ease back to North America (or live Americas focus) and hold still — no idle spin.
        const k = Math.min(1, 0.0045 * dt)
        lon0 = lerpLon(lon0, focus.lon, k)
        lat0 += (focus.lat - lat0) * k
      }
      // After a drag, leave the camera where the user left it until idle re-homes.
    }
    draw(t)
    if (elFeed && ready && data?.feed?.length && !isMembers) {
      const items = elFeed.querySelectorAll('.g-ago')
      const drift = driftSec()
      for (let i = 0; i < items.length && i < data.feed.length; i++) {
        items[i].textContent = agoStr(data.feed[i].ago + drift)
      }
    }
    raf = requestAnimationFrame(loop)
  }

  const start = () => {
    if (reduced) {
      draw(0)
      return
    }
    if (!raf) raf = requestAnimationFrame(loop)
  }

  const io = new IntersectionObserver(
    (entries) => {
      onScreen = entries.some((e) => e.isIntersecting)
      visible = onScreen && !document.hidden
      if (visible) start()
    },
    { threshold: 0.05 },
  )
  io.observe(wrap)

  const onVis = () => {
    visible = onScreen && !document.hidden
    if (visible) {
      start()
      if (!document.hidden) load()
    }
  }
  document.addEventListener('visibilitychange', onVis)

  let rt
  let lastW = innerWidth
  const onResize = () => {
    if (innerWidth === lastW) return
    lastW = innerWidth
    window.clearTimeout(rt)
    rt = window.setTimeout(() => {
      setup()
      if (reduced) draw(0)
    }, 200)
  }
  window.addEventListener('resize', onResize)

  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointercancel', release)
  canvas.addEventListener('pointerleave', onLeave)

  setup()
  // Face North America immediately — before the first fetch / spin frame.
  lon0 = HOME.lon
  lat0 = HOME.lat
  targetView = { ...HOME }
  draw(0)
  updatePanel()
  load()
  pollId = window.setInterval(load, pollMs)
  start()

  rootEl.__ocGlobe = {
    getView: () => ({ lon: lon0, lat: lat0, home: HOME, mode }),
    lookHome: () => {
      lon0 = HOME.lon
      lat0 = HOME.lat
      targetView = { ...HOME }
    },
  }

  return () => {
    cancelled = true
    if (pollId) window.clearInterval(pollId)
    io.disconnect()
    document.removeEventListener('visibilitychange', onVis)
    window.removeEventListener('resize', onResize)
    canvas.removeEventListener('pointerdown', onDown)
    canvas.removeEventListener('pointermove', onMove)
    canvas.removeEventListener('pointerup', onUp)
    canvas.removeEventListener('pointercancel', release)
    canvas.removeEventListener('pointerleave', onLeave)
    if (raf) cancelAnimationFrame(raf)
    tip?.remove()
  }
}
