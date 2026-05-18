import * as db from './dbClient'
import type { Channel } from '../types/channel'
import type { CanonicalTitle } from '../data/catalog'
import { cleanChannelName, slugify, normalizeStreams, detectQuality } from './streamNormalizer'
import { CANONICAL_CATALOG } from '../data/catalog'

export type MatchStatus = 'idle' | 'fetching' | 'parsing' | 'matching' | 'done' | 'error'

export interface MatchedChannel extends Channel {
  canonical: CanonicalTitle
  matchScore: number
}

export interface RawCatalogEntry {
  name:          string
  logo_url:      string
  group_title:   string
  content_type:  'live' | 'movie' | 'series'
  stream_id:     string
  episode_count: number
}

export interface MatchResult {
  matched:        MatchedChannel[]
  unmatched:      Channel[]
  catalogEntries: RawCatalogEntry[]
}

// ─── XHR helper: Chromium 63 (Tizen 5.0) compatível ────────────────────────
// fetch() + res.body.getReader() NÃO é confiável no Chromium 63.
// XMLHttpRequest é suportado desde o Chrome 8 — garantido funcionar na TV.
function xhrFetch(url: string, onProgress?: (received: number, total: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('GET', url, true)
    xhr.timeout = 360000 // 6 minutos

    xhr.onprogress = () => {
      if (onProgress) {
        const cl = parseInt(xhr.getResponseHeader('content-length') || '0')
        onProgress(xhr.responseText.length, cl)
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.responseText)
      } else {
        reject(new Error(`HTTP ${xhr.status}`))
      }
    }

    xhr.onerror  = () => reject(new Error('Erro de rede (XHR)'))
    xhr.ontimeout = () => reject(new Error('Timeout ao baixar playlist'))

    xhr.send()
  })
}

class CatalogMatcherClass {
  private worker: Worker | null = null
  public  lastCatalogEntries: RawCatalogEntry[] | null = null
  private matchedByStreaming = new Map<string, { movies: MatchedChannel[]; series: MatchedChannel[] }>()
  private memoryCache = new Map<string, { matched: MatchedChannel[], unmatched: Channel[], timestamp: number, contentLength?: number }>()

  public onProgress?: (status: MatchStatus, progress: number, message: string) => void
  public onSilentUpdateReady?: (url: string, matched: MatchedChannel[], unmatched: Channel[]) => void

  async loadAndMatch(url: string): Promise<MatchResult> {
    // L1: RAM
    const l1 = this.memoryCache.get(url)
    if (l1) {
      if (this.isCacheExpired(l1.timestamp)) {
        console.log('[SWR] L1 expirado — revalidando em background')
        this.backgroundRevalidate(url, l1.contentLength)
      }
      this.indexByStreaming(l1.matched)
      this.onProgress?.('done', 100, 'Carregado da memória!')
      return { matched: l1.matched, unmatched: l1.unmatched, catalogEntries: [] }
    }

    // L3: IndexedDB
    try {
      const cached = await db.get(url)
      if (cached) {
        this.memoryCache.set(url, cached)
        if (this.isCacheExpired(cached.timestamp)) {
          console.log('[SWR] L3 expirado — revalidando em background')
          this.backgroundRevalidate(url, cached.contentLength)
        }
        this.indexByStreaming(cached.matched)
        this.onProgress?.('done', 100, 'Carregado do cache!')
        return { matched: cached.matched, unmatched: cached.unmatched, catalogEntries: [] }
      }
    } catch (e) {
      console.warn('[CatalogMatcher] Erro ao ler cache:', e)
    }

    // Cold Start: tenta Worker (desktop); Tizen cai no fallback imediatamente
    const workerResult = await this.tryWorkerWithTimeout(url, 180000)
    if (workerResult) return workerResult

    console.warn('[CatalogMatcher] Worker falhou — usando main thread (XHR)')
    return this.loadInMainThread(url)
  }

  // ─── SWR: Usa HEAD para checar tamanho sem baixar tudo de novo ───────────
  private async backgroundRevalidate(url: string, lastLength?: number) {
    try {
      // HEAD request para checar content-length sem baixar o arquivo
      let newLength = 0
      try {
        const head = await fetch(url, { method: 'HEAD' })
        newLength = parseInt(head.headers.get('content-length') || '0')
      } catch {
        // Se HEAD não funcionar, assume que mudou e reprocessa
        newLength = -1
      }

      if (newLength > 0 && lastLength && newLength === lastLength) {
        console.log(`[SWR] Playlist intocada (${newLength} bytes). Renovando TTL.`)
        const cached = await db.get(url)
        if (cached) {
          cached.timestamp = Date.now()
          await db.put(url, cached)
          this.memoryCache.set(url, cached)
        }
        return
      }

      console.log(`[SWR] Diff detectado (${lastLength} → ${newLength}). Reprocessando silenciosamente...`)
      const data = await this.loadInMainThread(url)
      this.onSilentUpdateReady?.(url, data.matched, data.unmatched)
    } catch (e) {
      console.warn('[SWR] Falha na revalidação:', e)
    }
  }

  // ─── Worker (desktop Chrome) com timeout ────────────────────────────────
  private tryWorkerWithTimeout(url: string, timeoutMs: number): Promise<MatchResult | null> {
    return new Promise((resolve) => {
      let settled = false
      const settle = (val: MatchResult | null) => {
        if (settled) return
        settled = true
        resolve(val)
      }

      const timer = setTimeout(() => {
        console.warn('[CatalogMatcher] Worker timeout após', timeoutMs, 'ms')
        try { this.worker?.terminate() } catch (_) {}
        this.worker = null
        settle(null)
      }, timeoutMs)

      try {
        this.worker = new Worker(
          new URL('../workers/catalogMatcherWorker.ts', import.meta.url),
          { type: 'module' }
        )

        this.worker.onmessage = async (e: MessageEvent) => {
          const { status, progress, message, matched, unmatched } = e.data
          this.onProgress?.(status, progress, message || '')

          if (status === 'done') {
            clearTimeout(timer)
            this.indexByStreaming(matched)
            try { await db.put(url, { matched, unmatched, timestamp: Date.now() }) } catch (_) {}
            try { this.worker?.terminate() } catch (_) {}
            this.worker = null
            settle({ matched, unmatched, catalogEntries: [] })
          }
          if (status === 'error') {
            clearTimeout(timer)
            try { this.worker?.terminate() } catch (_) {}
            this.worker = null
            settle(null)
          }
        }

        this.worker.onerror = () => {
          console.warn('[CatalogMatcher] Worker onerror (type:module não suportado no Tizen)')
          clearTimeout(timer)
          try { this.worker?.terminate() } catch (_) {}
          this.worker = null
          settle(null)
        }

        this.worker.postMessage({ url })
      } catch (err) {
        console.warn('[CatalogMatcher] Falha ao criar Worker:', err)
        clearTimeout(timer)
        settle(null)
      }
    })
  }

  // ─── Main Thread: XHR + indexOf sem split() + yield a cada 3k linhas ────
  private async loadInMainThread(url: string): Promise<MatchResult> {
    this.onProgress?.('fetching', 5, 'Conectando ao servidor...')

    // Índice O(1) do catálogo (~400 entradas — instantâneo)
    const exactIdx = new Map<string, CanonicalTitle>()
    const altIdx   = new Map<string, CanonicalTitle>()
    for (const canonical of CANONICAL_CATALOG) {
      exactIdx.set(canonical.slug, canonical)
      for (const alt of canonical.altTitles) {
        const s = slugify(cleanChannelName(alt) || alt.toLowerCase())
        if (!exactIdx.has(s)) altIdx.set(s, canonical)
      }
    }

    // XHR: download com progresso (Chromium 63 safe)
    const text = await xhrFetch(url, (received, total) => {
      if (total > 0) {
        const pct = Math.floor((received / total) * 55)
        this.onProgress?.('fetching', 10 + pct, `Recebendo playlist... ${10 + pct}%`)
      } else {
        this.onProgress?.('fetching', 20, 'Recebendo playlist...')
      }
    })

    this.onProgress?.('parsing', 67, 'Processando canais...')

    // ── Parse sem split('\n') ─────────────────────────────────────────────
    // split() cria um array de 280k strings → ~50MB extras na RAM.
    // indexOf() + slice() processa uma linha por vez sem alocar o array todo.
    const matchedMap  = new Map<string, { canonical: CanonicalTitle; score: number; raws: any[] }>()
    const catalogMap  = new Map<string, RawCatalogEntry>()
    const unmatchedMap = new Map<string, { cType: 'live'|'movie'|'series'; name: string; logo: string; group: string; raws: { name: string; url: string; logo: string; group: string }[] }>()
    let currentExtinf = ''
    let cursor = 0
    let linesSinceYield = 0
    const BATCH = 3000 // yield a cada 3k linhas (~10ms no Tizen)

    while (cursor < text.length) {
      const nl = text.indexOf('\n', cursor)
      const end = nl >= 0 ? nl : text.length
      const line = text.slice(cursor, end).trim()
      cursor = nl >= 0 ? nl + 1 : text.length

      if (line && !line.startsWith('#EXTM3U')) {
        if (line.startsWith('#EXTINF')) {
          currentExtinf = line
        } else if (!line.startsWith('#') && currentExtinf) {
          const extinf = currentExtinf
          currentExtinf = ''

          const commaIdx = extinf.lastIndexOf(',')
          const rawName = commaIdx >= 0 ? extinf.slice(commaIdx + 1).trim() : ''
          if (rawName) {
            const logoM  = extinf.match(/tvg-logo="([^"]*)"/)
            const groupM = extinf.match(/group-title="([^"]*)"/)
            const logo   = logoM?.[1]  || ''
            const group  = groupM?.[1] || 'Sem categoria'

            // ── Catalog collection + Unmatched: captura TODAS as entradas Xtream ──
            const cType = line.includes('/live/')   ? 'live'
                        : line.includes('/movie/')  ? 'movie'
                        : line.includes('/series/') ? 'series'
                        : null
            const sidM = cType ? line.match(/\/(\d+)\.[a-z0-9]+$/i) : null
            const dName = cType === 'series'
              ? rawName.replace(/[Ss]\d{1,2}\s*[Ee]\d{1,3}.*/g, '').replace(/\s*[-–]\s*$/, '').trim() || rawName
              : rawName

            if (cType) {
              const cKey = `${cType}:${dName.toLowerCase()}`
              if (catalogMap.has(cKey)) {
                if (cType === 'series') catalogMap.get(cKey)!.episode_count++
              } else {
                catalogMap.set(cKey, {
                  name: dName, logo_url: logo, group_title: group,
                  content_type: cType, stream_id: sidM?.[1] || '', episode_count: 1,
                })
              }
            }

            // ── CANONICAL match (títulos curados com TMDB) ────────────────
            const cleanName = cleanChannelName(rawName)
            if (cleanName && cleanName.length >= 2) {
              const slug = slugify(cleanName)
              let canonical = exactIdx.get(slug) ?? altIdx.get(slug)

              if (!canonical) {
                let cur = slug
                for (let t = 1; t <= 3; t++) {
                  const d = cur.lastIndexOf('-')
                  if (d <= 0) break
                  cur = cur.substring(0, d)
                  canonical = exactIdx.get(cur) ?? altIdx.get(cur)
                  if (canonical) break
                }
              }

              if (canonical) {
                const raw = { name: rawName, url: line, logo, group }
                const key = canonical.slug
                if (!matchedMap.has(key)) {
                  matchedMap.set(key, {
                    canonical,
                    score: exactIdx.has(slug) ? 100 : altIdx.has(slug) ? 92 : 80,
                    raws: [],
                  })
                }
                matchedMap.get(key)!.raws.push(raw)
              } else if (cType && unmatchedMap.size < 20000) {
                // Entrada Xtream sem match canonical → coleta para modo raw
                const uKey = `${cType}:${dName.toLowerCase()}`
                if (!unmatchedMap.has(uKey)) {
                  unmatchedMap.set(uKey, { cType, name: dName, logo, group, raws: [] })
                }
                const uEntry = unmatchedMap.get(uKey)!
                if (uEntry.raws.length < 20) {
                  uEntry.raws.push({ name: rawName, url: line, logo, group })
                }
              }
            }
          }
        }
      }

      // Yield: libera a thread principal a cada BATCH linhas
      linesSinceYield++
      if (linesSinceYield >= BATCH) {
        linesSinceYield = 0
        const pct = Math.floor((cursor / text.length) * 22)
        this.onProgress?.('matching', 67 + pct, `${matchedMap.size} títulos encontrados...`)
        await new Promise<void>(r => setTimeout(r, 0))
      }
    }

    this.onProgress?.('matching', 91, `Normalizando ${matchedMap.size} títulos...`)

    const matched: MatchedChannel[] = []
    for (const { canonical, score, raws } of matchedMap.values()) {
      if (canonical.type === 'series') {
        const seenUrls = new Set<string>()
        const episodeStreams: import('../types/channel').Stream[] = []
        for (const raw of raws) {
          if (seenUrls.has(raw.url)) continue
          seenUrls.add(raw.url)
          const m = raw.name.match(/[STst](\d{1,2})\s*[Ee](\d{1,3})/)
          const label = m
            ? `S${m[1].padStart(2,'0')}E${m[2].padStart(2,'0')}`
            : raw.name
          episodeStreams.push({ url: raw.url, quality: detectQuality(raw.name), label })
        }
        episodeStreams.sort((a, b) => a.label.localeCompare(b.label))
        if (episodeStreams.length > 0) {
          const logoRaw = raws.find(r => r.logo)
          matched.push({
            id: canonical.slug,
            name: canonical.title,
            logo: logoRaw?.logo || '',
            group: raws[0]?.group || '',
            streams: episodeStreams,
            activeStream: episodeStreams[0],
            variantCount: episodeStreams.length,
            canonical: canonical as CanonicalTitle,
            matchScore: score,
          })
        }
      } else {
        const channels = normalizeStreams(raws)
        if (channels.length > 0) {
          matched.push({ ...channels[0], canonical: canonical as CanonicalTitle, matchScore: score })
        }
      }
    }

    // ── Constrói unmatched Channel[] a partir do unmatchedMap ────────────
    const unmatched: Channel[] = []
    for (const entry of unmatchedMap.values()) {
      if (entry.cType === 'series') {
        const seenUrls = new Set<string>()
        const episodeStreams: import('../types/channel').Stream[] = []
        for (const raw of entry.raws) {
          if (seenUrls.has(raw.url)) continue
          seenUrls.add(raw.url)
          const m = raw.name.match(/[STst](\d{1,2})\s*[Ee](\d{1,3})/)
          const label = m ? `S${m[1].padStart(2,'0')}E${m[2].padStart(2,'0')}` : raw.name
          episodeStreams.push({ url: raw.url, quality: detectQuality(raw.name), label })
        }
        episodeStreams.sort((a, b) => a.label.localeCompare(b.label))
        if (episodeStreams.length > 0) {
          unmatched.push({
            id: slugify(entry.name) || entry.name.slice(0, 50),
            name: entry.name,
            logo: entry.logo,
            group: entry.group,
            streams: episodeStreams,
            activeStream: episodeStreams[0],
            variantCount: episodeStreams.length,
          })
        }
      } else {
        const channels = normalizeStreams(entry.raws)
        if (channels.length > 0) unmatched.push(channels[0])
      }
    }

    const catalogEntries = Array.from(catalogMap.values())
    this.lastCatalogEntries = catalogEntries
    this.onProgress?.('done', 100, `${matched.length} matched · ${unmatched.length} raw`)
    this.indexByStreaming(matched)

    try {
      await db.put(url, { matched, unmatched: [], timestamp: Date.now(), contentLength: text.length })
      console.log('[CatalogMatcher] Cache salvo com sucesso')
    } catch (dbErr) {
      console.error('[CatalogMatcher] Erro ao salvar cache:', dbErr)
    }

    return { matched, unmatched, catalogEntries }
  }

  private indexByStreaming(matched: MatchedChannel[]) {
    this.matchedByStreaming.clear()
    const bestBySlug = new Map<string, MatchedChannel>()
    for (const item of matched) {
      const existing = bestBySlug.get(item.canonical.slug)
      if (!existing || item.matchScore > existing.matchScore) {
        bestBySlug.set(item.canonical.slug, item)
      }
    }
    for (const item of bestBySlug.values()) {
      const streaming = item.canonical.streaming
      if (!this.matchedByStreaming.has(streaming)) {
        this.matchedByStreaming.set(streaming, { movies: [], series: [] })
      }
      const group = this.matchedByStreaming.get(streaming)!
      if (item.canonical.type === 'movie') group.movies.push(item)
      else group.series.push(item)
    }
  }

  getMatchedByStreaming() {
    const result: Record<string, { movies: MatchedChannel[]; series: MatchedChannel[] }> = {}
    for (const [key, val] of this.matchedByStreaming.entries()) result[key] = val
    return result
  }

  // Injeta canais já matched (ex: vindos do Supabase via loadFromCode)
  injectMatched(matched: MatchedChannel[]) {
    this.indexByStreaming(matched)
  }

  private isCacheExpired(timestamp: number): boolean {
    return (Date.now() - timestamp) > 7 * 24 * 60 * 60 * 1000 // 7 dias
  }

  reset() {
    try { this.worker?.terminate() } catch (_) {}
    this.worker = null
    this.matchedByStreaming.clear()
    this.memoryCache.clear()
    this.lastCatalogEntries = null
  }
}

export const CatalogMatcher = new CatalogMatcherClass()
