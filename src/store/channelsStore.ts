import { create } from 'zustand'
import type { Channel, StreamQuality } from '../types/channel'
import { mockGroups } from '../data/mockChannels'
import { CatalogMatcher, type MatchStatus, type MatchedChannel } from '../services/catalogMatcher'
import { normalizeGroups, type UICategory } from '../services/categoryMapper'
import { ContentCatalog } from '../services/contentCatalog'
import { UnmatchedCatalog } from '../services/unmatchedCatalog'
import { Logger } from '../services/LoggerService'
import * as db from '../services/dbClient'
import { getChannelsByCode } from '../services/supabaseClient'
import { preloadBatched } from '../services/imagePreloader'
import { syncXtreamCatalog } from '../services/xtreamCatalogSync'

// Slugifica uma string para usar como chave (sem deps externas)
function slugKey(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

type LoadStatus = MatchStatus | 'idle' | 'ready'
type BootStatus = 'cold' | 'warming' | 'warm'

interface ChannelsState {
  // Dados do novo pipeline (CatalogMatcher)
  matchedChannels: MatchedChannel[]
  unmatchedChannels: Channel[]
  
  // Dados normalizados (pipeline nível 2 — UI consome isto)
  normalizedGroups: Record<UICategory, Channel[]>

  currentChannel: Channel | null
  status: LoadStatus
  bootStatus: BootStatus
  progress: number
  progressMessage: string
  error: string | null
  lastUrl: string | null

  setCurrentChannel: (ch: Channel | null) => void
  loadMock: () => void
  loadFromUrl: (url: string) => Promise<void>
  loadFromCode: (code: string) => Promise<void>
  silentUpdate: (url: string, matched: MatchedChannel[], unmatched: Channel[]) => void
  clearCache: () => Promise<void>
}

const EMPTY_NORMALIZED: Record<UICategory, Channel[]> = {
  filmes: [], series: [], esportes: [], infantil: [],
  abertos: [], documentarios: [], noticias: [], outros: [],
}

export const useChannelsStore = create<ChannelsState>((set, get) => ({
  matchedChannels: [],
  unmatchedChannels: [],
  normalizedGroups: { ...EMPTY_NORMALIZED },
  currentChannel: null,
  status: 'idle',
  bootStatus: 'cold',
  progress: 0,
  progressMessage: '',
  error: null,
  lastUrl: null,
  
  setCurrentChannel: (ch) => set({ currentChannel: ch }),
  
  loadMock: () => set({ 
    normalizedGroups: normalizeGroups(mockGroups),
    status: 'ready', 
    bootStatus: 'warm',
    progress: 100,
    progressMessage: 'Mock carregado',
    error: null,
    lastUrl: null
  }),
  
  loadFromUrl: async (url) => {
    const state = get()
    
    // Previne reprocessamento da mesma URL na memória
    if (state.lastUrl === url && state.status === 'done') {
      return
    }

    // Previne execução simultânea (in-flight)
    if (state.status === 'fetching' || state.status === 'parsing' || state.status === 'matching') {
      return
    }
    
    set({ 
      status: 'fetching', 
      bootStatus: 'warming',
      progress: 0, 
      progressMessage: 'Iniciando...', 
      error: null,
      lastUrl: url 
    })
    
    try {
      // Pluga o callback de progresso para atualizar o Zustand em tempo real
      CatalogMatcher.onProgress = (status, progress, message) => {
        set({ status, progress, progressMessage: message })
      }
      // Pluga o callback SWR para hidratar o catálogo em background sem loaders
      CatalogMatcher.onSilentUpdateReady = (u, m, um) => {
        get().silentUpdate(u, m, um)
      }
      
      // Dispara o motor de match (Worker faz tudo: fetch + parse + match)
      const { matched, unmatched } = await CatalogMatcher.loadAndMatch(url)

      // Converte matched[] para formato que a UI espera (grupos por categoria)
      // Temporariamente usa o group original até refatorarmos o ContentSelector
      const groupsByCategory: Record<string, Channel[]> = {}
      
      for (const ch of matched) {
        // Usa tipo de mídia para classificar corretamente nas categorias da UI
        const cat = ch.canonical.type === 'movie' ? 'filmes' : 'series'
        if (!groupsByCategory[cat]) groupsByCategory[cat] = []
        groupsByCategory[cat].push(ch)
      }

      // Adiciona unmatched também (classificados pelo group-title da M3U)
      for (const ch of unmatched) {
        if (!groupsByCategory[ch.group]) groupsByCategory[ch.group] = []
        groupsByCategory[ch.group].push(ch)
      }
      
      // Normaliza para as 8 categorias da UI
      const normalizedGroups = normalizeGroups(groupsByCategory)
      
      // Inicializa catálogo ANTES de atualizar estado React
      ContentCatalog.init(normalizedGroups)

      // Coleta todas as URLs de imagens
      const allUrls: string[] = []
      for (const group of Object.values(normalizedGroups)) {
        for (const ch of group) {
           const t = (ch as any).canonical || ch.tmdb
           const rawP = t?.poster
           const p = rawP ? (rawP.startsWith('http') ? rawP : `https://image.tmdb.org/t/p/w342${rawP}`) : ch.logo
           const rawB = t?.backdrop
           const b = rawB ? (rawB.startsWith('http') ? rawB : `https://image.tmdb.org/t/p/w780${rawB}`) : null
           if (p) allUrls.push(p)
           if (b) allUrls.push(b)
        }
      }

      // Persiste a URL para a próxima sessão
      localStorage.setItem('ziiiTV_lastUrl', url)

      // Libera UI IMEDIATAMENTE — imagens carregam em batches progressivos em paralelo
      set({
        matchedChannels: matched,
        unmatchedChannels: unmatched,
        normalizedGroups,
        status: 'done',
        bootStatus: 'warm',
        progress: 100,
        progressMessage: 'Concluído',
        error: null
      })
      Logger.boot('M3U_TOTAL', `Match de ${matched.length} canais concluído em ${Logger.getTTI().toFixed(0)}ms`)

      // Batches de 10 imagens a cada 150ms — usuário vê thumbs aparecendo progressivamente
      preloadBatched(allUrls)

      // TMDB warmup em background (NÃO bloqueante) — só para unmatched

      ContentCatalog.warmup().catch(err => {
        console.warn('[Store] TMDB warmup error (non-fatal):', err)
      })
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      console.error('[Store] Falha crítica no pipeline M3U:', error)
      set({ 
        status: 'error', 
        progress: 0, 
        progressMessage: errorMsg,
        error: errorMsg
      })
    }
  },

  loadFromCode: async (code) => {
    set({ status: 'fetching', bootStatus: 'warming', progress: 0, progressMessage: 'Ativando lista...', error: null, lastUrl: null })
    try {
      const result = await getChannelsByCode(code)

      if (result.type === 'xtream') {
        set({ status: 'idle' })
        await get().loadFromUrl(result.url)
        // Sync em background — não bloqueia a UI
        const entries = CatalogMatcher.lastCatalogEntries
        if (entries && entries.length > 0) {
          syncXtreamCatalog(entries, code).catch(e =>
            console.warn('[Store] Sync catálogo Xtream falhou (non-fatal):', e)
          )
        }
        return
      }

      const rows = result.channels
      set({ progress: 60, progressMessage: 'Convertendo canais...' })

      const VALID_Q = new Set<string>(['4K', 'FHD', 'HD', 'SD', 'UNKNOWN'])

      const matchedMap = new Map<string, MatchedChannel>()

      for (const row of rows) {
        const ct = row.canonical_titles
        if (!ct) continue

        const streams = (row.streams || []).map((s: any) => ({
          url: s.u,
          quality: (VALID_Q.has(s.q) ? s.q : 'UNKNOWN') as StreamQuality,
          label: s.q,
        }))
        if (!streams.length) continue

        const canonicalId = row.canonical_id || row.id

        if (matchedMap.has(canonicalId)) {
          // O canal já existe (ex: outra qualidade de vídeo), apenas empilha as URIs nele!
          const existing = matchedMap.get(canonicalId)!
          
          // Previne streams com a mesma exata URL
          for (const s of streams) {
            if (!existing.streams.some(es => es.url === s.url)) {
              existing.streams.push(s)
            }
          }
          
          // Reordena do melhor pro pior
          const score = { '4K': 5, 'FHD': 4, 'HD': 3, 'SD': 2, 'UNKNOWN': 1 }
          existing.streams.sort((a, b) => score[b.quality] - score[a.quality])
          existing.activeStream = existing.streams[0]
          existing.variantCount = existing.streams.length
        } else {
          // Primeiro registro deste filme/série
          const poster   = ct.poster   ? (ct.poster.startsWith('http')   ? ct.poster   : `https://image.tmdb.org/t/p/w342${ct.poster}`)   : undefined
          const backdrop = ct.backdrop ? (ct.backdrop.startsWith('http') ? ct.backdrop : `https://image.tmdb.org/t/p/w780${ct.backdrop}`) : undefined

          const canonical = {
            id: canonicalId,
            slug: ct.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
            title: ct.title,
            altTitles: [],
            type: (ct.type || 'movie') as 'movie' | 'series',
            streaming: ct.streaming || 'unknown',
            matchHints: [],
            tmdbId: ct.tmdb_id,
            year: ct.year,
            rating: ct.rating,
            overview: ct.overview,
            poster,
            backdrop,
          }

          // Ordena antes de criar
          const score = { '4K': 5, 'FHD': 4, 'HD': 3, 'SD': 2, 'UNKNOWN': 1 }
          streams.sort((a: any, b: any) => score[b.quality as keyof typeof score] - score[a.quality as keyof typeof score])

          matchedMap.set(canonicalId, {
            id: canonicalId,
            name: ct.title,
            logo: poster || row.logo_url || '',
            group: ct.type === 'movie' ? 'filmes' : 'series',
            streams,
            activeStream: streams[0],
            variantCount: streams.length,
            matchScore: 100,
            canonical,
            tmdb: {
              ...canonical,
              mediaType: ct.type === 'series' ? 'tv' : 'movie',
              trailerKey: ct.trailer_url || '',
              genres: ct.genres || undefined,
              cast: ct.castinfo
                ? (ct.castinfo as any[]).map((c: any) => typeof c === 'string' ? c : c.name).filter(Boolean)
                : undefined,
              director: ct.director || undefined,
              ageRating: ct.age_rating || undefined,
              runtime: ct.duration || undefined,
            }
          } as MatchedChannel)
        }
      }

      const matched = Array.from(matchedMap.values())

      // Lookup normalizado: permite que canais sem canonical_id (ex: fileiras 4K, gênero)
      // herdem dados TMDB de um canal matchado com o mesmo título base
      const normalizeForLookup = (name: string) =>
        name.toLowerCase()
          .replace(/\s*[\[\(][^\]\)]*[\]\)]/g, '')
          .replace(/\b(4k|fhd|uhd|hd|sd|hevc|x265|h264|bluray|remux|hdtv|webrip|web[-.]?dl|dual|legendado|dublado|nacional|extended|directors cut|unrated|remastered)\b/gi, '')
          .replace(/[^a-z0-9]+/g, ' ')
          .trim()

      const matchedByNormTitle = new Map<string, MatchedChannel>()
      for (const mc of matchedMap.values()) {
        const norm = normalizeForLookup(mc.name)
        if (norm) matchedByNormTitle.set(norm, mc)
      }

      // ── Canais de TV ao vivo ─────────────────────────────────────────────
      const liveChannels: Channel[] = rows
        .filter((row: any) => row.content_type === 'live' && !row.canonical_id)
        .map((row: any) => {
          const streams = (row.streams || []).map((s: any) => ({
            url: s.u, quality: 'UNKNOWN' as any, label: s.q || 'AO VIVO',
          }))
          return {
            id: row.id,
            name: row.name,
            logo: row.logo_url || '',
            group: 'esportes',
            streams,
            activeStream: streams[0] || { url: '', quality: 'UNKNOWN', label: '' },
            variantCount: streams.length,
            matchScore: 0,
            canonical: null as any,
          } as any
        })

      // ── Conteúdo não-matchado: séries por streaming, filmes por gênero ───
      const MAX_PER_BUCKET = 1000
      const streamingRows: Record<string, Channel[]> = {}
      const genreRows: Record<string, { label: string; channels: Channel[] }> = {}

      for (const row of rows) {
        if (row.canonical_id || row.content_type === 'live') continue

        const rowStreams = (row.streams || []).map((s: any) => ({
          url: s.u,
          quality: (VALID_Q.has(s.q) ? s.q : 'UNKNOWN') as StreamQuality,
          label: s.q || row.name,
        }))
        if (!rowStreams.length) continue

        const ch: Channel = {
          id: row.id,
          name: row.name,
          logo: row.logo_url || '',
          group: row.streaming || row.group_name || 'outros',
          streams: rowStreams,
          activeStream: rowStreams[0],
          variantCount: rowStreams.length,
        }

        // Herda dados TMDB do canal matchado com título equivalente (ex: "Duna 4K" → "Duna")
        const normName = normalizeForLookup(row.name)
        const matchedRef = normName ? matchedByNormTitle.get(normName) : undefined
        if (matchedRef) {
          ;(ch as any).canonical = matchedRef.canonical
          ch.tmdb = matchedRef.tmdb as any
          if (!ch.logo) ch.logo = matchedRef.logo
        }

        if (row.streaming) {
          if (!streamingRows[row.streaming]) streamingRows[row.streaming] = []
          if (streamingRows[row.streaming].length < MAX_PER_BUCKET) {
            streamingRows[row.streaming].push(ch)
          }
        } else if (row.group_name) {
          const pipeIdx = row.group_name.lastIndexOf('|')
          if (pipeIdx < 0) continue
          const rawLabel = row.group_name.slice(pipeIdx + 1).trim()
          if (!rawLabel || /^legend/i.test(rawLabel)) continue
          const key = slugKey(rawLabel)
          if (!genreRows[key]) genreRows[key] = { label: rawLabel, channels: [] }
          if (genreRows[key].channels.length < MAX_PER_BUCKET) {
            genreRows[key].channels.push(ch)
          }
        }
      }

      UnmatchedCatalog.inject(streamingRows, genreRows)

      // ── Grupos para ContentCatalog ────────────────────────────────────────
      const groupsByCategory: Record<string, Channel[]> = {}
      for (const ch of matched) {
        if (!groupsByCategory[ch.group]) groupsByCategory[ch.group] = []
        groupsByCategory[ch.group].push(ch)
      }
      if (liveChannels.length > 0) {
        groupsByCategory['esportes'] = liveChannels
      }

      const normalizedGroups = normalizeGroups(groupsByCategory)
      ContentCatalog.init(normalizedGroups)

      // Alimenta o CatalogMatcher para que contentSelector use byStreaming
      CatalogMatcher.injectMatched(matched)

      localStorage.setItem('ziiiTV_lastCode', code)
      localStorage.removeItem('ziiiTV_lastUrl')

      set({
        matchedChannels: matched,
        unmatchedChannels: [],
        normalizedGroups,
        status: 'done',
        bootStatus: 'warm',
        progress: 100,
        progressMessage: `${matched.length} canais carregados`,
        error: null,
        lastUrl: null,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      set({ status: 'error', progress: 0, progressMessage: msg, error: msg })
      throw err
    }
  },

  silentUpdate: (url, matched, unmatched) => {
    const groupsByCategory: Record<string, Channel[]> = {}

    for (const ch of matched) {
      const cat = ch.canonical.type === 'movie' ? 'filmes' : 'series'
      if (!groupsByCategory[cat]) groupsByCategory[cat] = []
      groupsByCategory[cat].push(ch)
    }
    for (const ch of unmatched) {
      if (!groupsByCategory[ch.group]) groupsByCategory[ch.group] = []
      groupsByCategory[ch.group].push(ch)
    }

    const normalizedGroups = normalizeGroups(groupsByCategory)
    ContentCatalog.init(normalizedGroups)

    set({
      matchedChannels: matched,
      unmatchedChannels: unmatched,
      normalizedGroups,
      lastUrl: url
    })
    // Sem alterar status nem bootStatus para não disparar Spinners
  },
  
  clearCache: async () => {
    CatalogMatcher.reset()
    UnmatchedCatalog.reset()
    await db.clear()
    localStorage.removeItem('ziiiTV_lastUrl')
    set({ 
      matchedChannels: [],
      unmatchedChannels: [],
      normalizedGroups: { ...EMPTY_NORMALIZED },
      currentChannel: null, 
      status: 'idle', 
      bootStatus: 'cold',
      progress: 0,
      progressMessage: '',
      error: null,
      lastUrl: null
    })
  },
}))
