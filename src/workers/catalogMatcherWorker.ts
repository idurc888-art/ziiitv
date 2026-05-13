/**
 * catalogMatcherWorker — Inverted Index + Streaming Parse
 */

import { cleanChannelName, slugify, normalizeStreams, detectQuality } from '../services/streamNormalizer'
import { CANONICAL_CATALOG } from '../data/catalog'
import type { CanonicalTitle } from '../data/catalog'
import type { RawChannel } from '../types/channel'

// ─── Índice do catálogo ──────────────────────────────────────────────────
function buildCatalogIndex() {
  const exact = new Map<string, CanonicalTitle>()
  const alts  = new Map<string, CanonicalTitle>()

  for (const canonical of CANONICAL_CATALOG) {
    exact.set(canonical.slug, canonical)
    for (const alt of canonical.altTitles) {
      const altSlug = slugify(cleanChannelName(alt) || alt.toLowerCase())
      if (!exact.has(altSlug)) alts.set(altSlug, canonical)
    }
  }

  return { exact, alts }
}

function lookupWithSuffixTolerance(
  slug: string,
  exact: Map<string, CanonicalTitle>,
  alts: Map<string, CanonicalTitle>
): CanonicalTitle | undefined {
  let hit = exact.get(slug) ?? alts.get(slug)
  if (hit) return hit

  let currentSlug = slug
  for (let trim = 1; trim <= 3; trim++) {
    const lastDash = currentSlug.lastIndexOf('-')
    if (lastDash <= 0) break
    currentSlug = currentSlug.substring(0, lastDash)
    hit = exact.get(currentSlug) ?? alts.get(currentSlug)
    if (hit) return hit
  }
  return undefined
}

function parseExtinf(line: string): { name: string; logo: string; group: string } {
  const commaIdx = line.lastIndexOf(',')
  const name  = commaIdx >= 0 ? line.slice(commaIdx + 1).trim() : ''
  const attrs = commaIdx >= 0 ? line.slice(0, commaIdx) : line

  let logo  = ''
  let group = 'Sem categoria'

  let i = attrs.indexOf('tvg-logo="')
  if (i >= 0) {
    i += 10
    const end = attrs.indexOf('"', i)
    if (end >= 0) logo = attrs.slice(i, end)
  }

  i = attrs.indexOf('group-title="')
  if (i >= 0) {
    i += 13
    const end = attrs.indexOf('"', i)
    if (end >= 0) group = attrs.slice(i, end)
  }

  return { name, logo, group }
}

self.onmessage = async (e: MessageEvent<{ url: string }>) => {
  try {
    self.postMessage({ status: 'fetching', progress: 3, message: 'Conectando...' })

    const res = await fetch(e.data.url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const contentLength = parseInt(res.headers.get('content-length') || '0')
    const { exact, alts } = buildCatalogIndex()

    self.postMessage({ status: 'parsing', progress: 8, message: 'Lendo playlist...' })

    const matchedMap = new Map<string, { canonical: CanonicalTitle; score: number; raws: RawChannel[] }>()
    const unmatched: RawChannel[] = []

    let buffer = ''
    let currentExtinf = ''
    let bytesRead = 0
    let lastPct = -1

    const decoder = new TextDecoder()
    const reader = res.body!.getReader()

    const processLine = (raw: string) => {
      const line = raw.trim()
      if (!line) return

      if (line.startsWith('#EXTINF')) {
        currentExtinf = line
        return
      }
      if (line.startsWith('#')) return

      const url = line
      if (!currentExtinf) return
      const extinf = currentExtinf
      currentExtinf = ''

      const { name: rawName, logo, group } = parseExtinf(extinf)
      if (!rawName) return

      const cleanName = cleanChannelName(rawName)
      const slug = slugify(cleanName || '')
      const canonical = slug ? lookupWithSuffixTolerance(slug, exact, alts) : null

      if (canonical) {
        const key = canonical.slug
        if (!matchedMap.has(key)) {
          matchedMap.set(key, { 
            canonical, 
            score: exact.has(slug) ? 100 : alts.has(slug) ? 92 : 80, 
            raws: [] 
          })
        }
        matchedMap.get(key)!.raws.push({ name: rawName, url, logo, group })
      } else {
        unmatched.push({ name: rawName, url, logo, group })
      }
    }

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      bytesRead += value.byteLength
      buffer += decoder.decode(value, { stream: true })

      let start = 0
      let pos = 0
      while ((pos = buffer.indexOf('\n', start)) >= 0) {
        processLine(buffer.slice(start, pos))
        start = pos + 1
      }
      buffer = buffer.slice(start)

      if (contentLength > 0) {
        const pct = Math.floor((bytesRead / contentLength) * 100)
        if (pct >= lastPct + 10) {
          lastPct = pct
          self.postMessage({ status: 'matching', progress: 10 + Math.floor(pct * 0.7), message: `Lendo: ${pct}%` })
        }
      }
    }

    if (buffer.trim()) processLine(buffer)

    self.postMessage({ status: 'matching', progress: 85, message: 'Finalizando...' })

    const matched: any[] = []
    for (const { canonical, score, raws } of matchedMap.values()) {
      if (canonical.type === 'series') {
        const seenUrls = new Set<string>()
        const episodeStreams: any[] = []
        for (const raw of raws) {
          if (seenUrls.has(raw.url)) continue
          seenUrls.add(raw.url)
          const m = raw.name.match(/[STst](\d{1,2})\s*[Ee](\d{1,3})/)
          const label = m
            ? `S${m[1].padStart(2,'0')}E${m[2].padStart(2,'0')}`
            : raw.name
          episodeStreams.push({ url: raw.url, quality: detectQuality(raw.name), label })
        }
        episodeStreams.sort((a: any, b: any) => a.label.localeCompare(b.label))
        if (episodeStreams.length > 0) {
          const logoRaw = raws.find((r: RawChannel) => r.logo)
          matched.push({
            id: canonical.slug,
            name: canonical.title,
            logo: logoRaw?.logo || '',
            group: raws[0]?.group || '',
            streams: episodeStreams,
            activeStream: episodeStreams[0],
            variantCount: episodeStreams.length,
            canonical,
            matchScore: score,
          })
        }
      } else {
        const channels = normalizeStreams(raws)
        if (channels.length > 0) {
          matched.push({ ...channels[0], canonical, matchScore: score })
        }
      }
    }

    // Devolvemos unmatched como array bruto para não pesar a ponte de mensagem com normalização no Worker
    const finalUnmatched = normalizeStreams(unmatched)

    self.postMessage({
      status: 'done',
      progress: 100,
      message: `${matched.length} títulos encontrados`,
      matched,
      unmatched: finalUnmatched
    })

  } catch (err) {
    self.postMessage({
      status: 'error',
      progress: 0,
      message: err instanceof Error ? err.message : String(err)
    })
  }
}
