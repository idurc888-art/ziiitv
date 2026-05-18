// Content Selector — Monta as rows de cada tela filtrando do ContentCatalog
// OTIMIZADO: retorna rows IMEDIATAMENTE com dados do cache TMDB (warmup).
// Não bloqueia mais em enrichBatch — a UI já renderiza e os dados TMDB
// preenchem conforme o warmup do ContentCatalog progride em background.
import type { Channel } from '../types/channel'
import type { TMDBResult } from './tmdbService'
import { ContentCatalog } from './contentCatalog'
import type { UICategory } from './categoryMapper'
import { getMostWatched, getGenreScores, getRecentlyWatched } from './historyService'
import { CatalogMatcher } from './catalogMatcher'
import { UnmatchedCatalog } from './unmatchedCatalog'
import { enrichBatch } from './tmdbService'
import { enrichChannelsInPlace } from './xtreamEnricher'

export type RowType = 'wide' | 'simple' | 'portrait' | 'grid'

export interface ContentRow {
  type: RowType
  title: string
  titleAccent: string
  channels: Channel[]
  tmdb: Map<string, TMDBResult | null>
}

export interface ScreenContent {
  heroChannels: Channel[]
  heroTmdb: Map<string, TMDBResult | null>
  rows: ContentRow[]
}

type NormalizedGroups = Record<UICategory, Channel[]>

function dedupByCanonical(channels: Channel[], minLength = 20, maxLength = 100): Channel[] {
  const seen = new Set<string>()
  let filtered = channels.filter(ch => {
    const key = (ch as any).canonical?.slug ?? ch.id
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, maxLength)
  
  if (filtered.length === 0) return filtered
  while (filtered.length < minLength) {
    filtered = [...filtered, ...filtered]
  }
  return filtered
}

// ─── Helpers ───────────────────────────────────────────
// Card especial "Ver Lista Inteira" — adicionado no final de cada row
function makeViewAllCard(label: string): Channel {
  return {
    id: `view-all-${label}`,
    name: `Ver tudo: ${label}`,
    logo: '',
    group: '',
    streams: [],
    activeStream: { url: '', quality: 'SD', label: 'SD' },
    variantCount: 0,
    isViewAll: true,
    viewAllLabel: label,
  }
}

function buildRows(rowsData: Partial<ContentRow>[]): ContentRow[] {
  return rowsData
    .filter(r => r.channels && r.channels.length > 0)
    .map(r => {
      const label = `${r.title || ''}${r.titleAccent || ''}`.trim()
      const channels = [...r.channels!, makeViewAllCard(label)]
      return {
        type: r.type as RowType,
        title: r.title || '',
        titleAccent: r.titleAccent || '',
        channels,
        tmdb: new Map()
      }
    })
}

// ─── Detecta canais com jogos do dia (distingue eventos de canais fixos) ───
function detectLiveGames(channels: Channel[]): Channel[] {
  // Nomes de canais fixos (não são eventos): nunca entrar na fileira de jogos
  const fixedChannels = /^(sportv|espn|premiere|pfc|band\s*sport|combate|ufc|motorsport|nba\s*tv)/i

  const gameSignals = [
    /\bao vivo\b/i,
    /\blive\b/i,
    /\bvs\.?\s+[A-Z]/,        // "Palmeiras vs Flamengo"
    /\bx\s+[A-ZÁÉÍÓÚÃ]/,      // "CRB x VITÓRIA"
    /\bjogo\b/i,
    /\bpartida\b/i,
    /\bmatch\b/i,
    /\bhoje\b/i,
    /\b\d{1,2}[hH]\d{0,2}\b/, // "19H", "21H30"
    /\bfinal\b/i,
    /\bplayoff\b/i,
    /\bsemifinal\b/i,
    /\blibertadores\b.*\b(jogo|live|ao vivo)/i,
    /\bcopa\b.*\b(jogo|live|final)/i,
  ]

  return channels.filter(ch => {
    if (fixedChannels.test(ch.name)) return false
    return gameSignals.some(p => p.test(ch.name))
  })
}

// ─── Extrai número do canal do nome (ex: "SporTV 2 HD" → 2) ───
function extractChannelNumber(name: string): number {
  // Tenta número no final (antes de sufixos de qualidade)
  const m = name.match(/\b(\d+)\s*(?:hd|fhd|4k|sd|uhd)?\s*$/i)
  if (m) return parseInt(m[1])
  // Qualquer número no nome
  const m2 = name.match(/\b(\d+)\b/)
  return m2 ? parseInt(m2[1]) : 999
}

// ─── Intercala e ordena dois arrays de canais por número ───
function mergeByNumber(a: Channel[], b: Channel[]): Channel[] {
  return [...a, ...b].sort((x, y) =>
    extractChannelNumber(x.name) - extractChannelNumber(y.name)
  )
}

// ─── Popula TMDB de canais com dados canônicos embutidos (zero API call) ───
function populateCanonicalTmdb(rows: ContentRow[]): void {
  for (const row of rows) {
    if (!row.tmdb) row.tmdb = new Map()
    for (const ch of row.channels) {
      const canonical = (ch as any).canonical
      if (canonical && !row.tmdb.has(ch.name)) {
        row.tmdb.set(ch.name, {
          title: canonical.title ?? ch.name,
          year: String(canonical.year ?? ''),
          rating: canonical.rating ?? 0,
          overview: canonical.overview ?? '',
          poster: canonical.poster ?? '',
          backdrop: canonical.backdrop ?? '',
          tmdbId: canonical.tmdbId ?? 0,
          mediaType: canonical.type === 'series' ? 'tv' : 'movie',
          trailerKey: '',
        } as any)
      } else if (ch.tmdb && !row.tmdb.has(ch.name)) {
        row.tmdb.set(ch.name, ch.tmdb)
      }
    }
  }
}

// Títulos pesados — excluídos do hero e das primeiras rows da home
const HEAVY_SLUGS = new Set([
  'o-iluminado', 'laranja-mecanica', 'seven-os-sete-crimes', 'scarface',
  'pulp-fiction', 'o-exterminador-do-futuro-2', 'o-silencio-dos-inocentes',
  '2001-odisseia-espaco', 'cidadao-kane', 'era-uma-vez-no-oeste',
  'o-assassino', 'assassino',
])

const HEAVY_GENRES = new Set(['Crime', 'Terror', 'Horror', 'Suspense', 'War', 'Guerra'])

function isHeavy(ch: Channel): boolean {
  const slug = (ch as any).canonical?.slug ?? ch.id
  if (HEAVY_SLUGS.has(slug)) return true
  const genres: string[] = (ch as any).canonical?.genres ?? ch.tmdb?.genres ?? []
  if (genres.length > 0 && genres.every(g => HEAVY_GENRES.has(g))) return true
  return false
}
const STREAMING_CONF = [
  { key: 'netflix',        emoji: '🔴', label: 'Netflix',        emojiSeries: '📺' },
  { key: 'hbo',            emoji: '🎭', label: 'Max',            emojiSeries: '🎪' },
  { key: 'disney',         emoji: '✨', label: 'Disney+',        emojiSeries: '🏰' },
  { key: 'amazon',         emoji: '📦', label: 'Prime Video',    emojiSeries: '📺' },
  { key: 'apple',          emoji: '🍎', label: 'Apple TV+',      emojiSeries: '📺' },
  { key: 'paramount',      emoji: '🏔️', label: 'Paramount+',     emojiSeries: '🎪' },
  { key: 'globoplay',      emoji: '🌐', label: 'Globoplay',      emojiSeries: '📺' },
  { key: 'star',           emoji: '⭐', label: 'Star+',          emojiSeries: '🎪' },
  { key: 'discovery',      emoji: '🌍', label: 'Discovery+',     emojiSeries: '🔬' },
  { key: 'crunchyroll',    emoji: '👺', label: 'Crunchyroll',    emojiSeries: '🏯' },
  { key: 'funimation',     emoji: '🎌', label: 'Funimation',     emojiSeries: '🏯' },
  { key: 'universal',      emoji: '🌍', label: 'Universal+',     emojiSeries: '📺' },
  { key: 'pluto',          emoji: '📡', label: 'Pluto TV',       emojiSeries: '📺' },
  { key: 'amc',            emoji: '🎬', label: 'AMC+',           emojiSeries: '📺' },
  { key: 'lionsgate',      emoji: '🦁', label: 'Lionsgate+',     emojiSeries: '📺' },
  { key: 'telecine',       emoji: '🎥', label: 'Telecine',       emojiSeries: '🎥' },
  { key: 'oldflix',        emoji: '📼', label: 'Oldflix',        emojiSeries: '📺' },
  { key: 'history',        emoji: '📜', label: 'History Play',   emojiSeries: '📺' },
  { key: 'looke',          emoji: '🎭', label: 'Looke',          emojiSeries: '📺' },
  { key: 'playplus',       emoji: '✝️', label: 'Play Plus',      emojiSeries: '📺' },
  { key: 'mercado',        emoji: '🛍️', label: 'Mercado Play',   emojiSeries: '📺' },
  { key: 'claro',          emoji: '📡', label: 'Claro TV+',      emojiSeries: '📺' },
  { key: 'sbt',            emoji: '📺', label: 'SBT',            emojiSeries: '📺' },
  { key: 'brasilparalelo', emoji: '🇧🇷', label: 'Brasil Paralelo',emojiSeries: '📺' },
] as const

function genreEmoji(label: string): string {
  const l = label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (/^acao|action|aventura/.test(l)) return '💥'
  if (/terror|horror/.test(l))         return '👻'
  if (/comédia|comedia|comedy/.test(l)) return '😂'
  if (/drama/.test(l))                 return '🎭'
  if (/4k/.test(l))                    return '🖥️'
  if (/lançament|lancament/.test(l))   return '🆕'
  if (/nacion/.test(l))                return '🇧🇷'
  if (/suspense|thriller/.test(l))     return '🔍'
  if (/ficc|sci.fi/.test(l))           return '🚀'
  if (/famil/.test(l))                 return '🧸'
  if (/marvel|dc\b|super.her/.test(l)) return '🦸'
  if (/crime/.test(l))                 return '🔫'
  if (/romance/.test(l))               return '💕'
  if (/document/.test(l))              return '🌍'
  if (/anim|anime/.test(l))            return '👺'
  if (/aventura/.test(l))              return '⚔️'
  if (/legend/.test(l))                return '🔤'
  if (/guerr/.test(l))                 return '🎖️'
  if (/histor/.test(l))                return '📜'
  if (/fantas/.test(l))                return '🧙'
  if (/infant/.test(l))                return '🧸'
  if (/music/.test(l))                 return '🎵'
  if (/biograf/.test(l))               return '📖'
  if (/mister/.test(l))                return '🕵️'
  if (/faroest|western/.test(l))       return '🤠'
  if (/natal/.test(l))                 return '🎄'
  if (/religi/.test(l))                return '✝️'
  return '🎬'
}

// ─── Creative Row Titles (Netflix-style) ──────────────────────────────────
function _norm(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
}

const CREATIVE_GENRES: Record<string, { title: string; titleAccent: string }> = {
  acao:                 { title: 'De tirar o ',    titleAccent: 'FÔLEGO'          },
  acaoeaventura:        { title: 'De tirar o ',    titleAccent: 'FÔLEGO'          },
  aventura:             { title: 'De tirar o ',    titleAccent: 'FÔLEGO'          },
  comedia:              { title: 'Dá pra rir ',    titleAccent: 'MUITO'           },
  drama:                { title: 'Emoções que ',   titleAccent: 'FICAM'           },
  romance:              { title: 'Para assistir ', titleAccent: 'DE MÃO DADA'    },
  terror:               { title: 'Quem tem medo ', titleAccent: 'TEM MEDO'        },
  horror:               { title: 'Quem tem medo ', titleAccent: 'TEM MEDO'        },
  suspense:             { title: 'Não pisca ',     titleAccent: 'NEM UM SEGUNDO'  },
  suspenseinvestigacao: { title: 'Não pisca ',     titleAccent: 'NEM UM SEGUNDO'  },
  thriller:             { title: 'Não pisca ',     titleAccent: 'NEM UM SEGUNDO'  },
  crime:                { title: 'Crimes que ',    titleAccent: 'PERTURBAM'       },
  policial:             { title: 'Crimes que ',    titleAccent: 'PERTURBAM'       },
  ficcao:               { title: 'O futuro ',      titleAccent: 'É AGORA'         },
  ficcaocientifica:     { title: 'O futuro ',      titleAccent: 'É AGORA'         },
  familia:              { title: 'Para toda a ',   titleAccent: 'FAMÍLIA'         },
  familiaanimacao:      { title: 'Para toda a ',   titleAccent: 'FAMÍLIA'         },
  animacao:             { title: 'Para toda a ',   titleAccent: 'FAMÍLIA'         },
  infantil:             { title: 'Para os ',       titleAccent: 'PEQUENOS'        },
  anime:                { title: 'Universo ',      titleAccent: 'ANIME'           },
  animes:               { title: 'Universo ',      titleAccent: 'ANIME'           },
  historico:            { title: 'Que moldou ',    titleAccent: 'O MUNDO'         },
  guerra:               { title: 'Batalhas que ',  titleAccent: 'DEFINIRAM TUDO'  },
  musical:              { title: 'A vida tem ',    titleAccent: 'TRILHA SONORA'   },
  inspiradores:         { title: 'Histórias que ', titleAccent: 'INSPIRAM'        },
  documentario:         { title: 'A vida real é ', titleAccent: 'MAIS LOUCA'      },
  documentarios:        { title: 'A vida real é ', titleAccent: 'MAIS LOUCA'      },
}

function creativeGenre(label: string): { title: string; titleAccent: string } {
  return CREATIVE_GENRES[_norm(label)] || { title: '', titleAccent: label }
}

type _StreamType = 'movie' | 'series'
const CREATIVE_STREAMING: Record<string, Record<_StreamType, { title: string; titleAccent: string }>> = {
  netflix:     { movie: { title: 'Do catálogo ',    titleAccent: 'NETFLIX'        }, series: { title: 'Séries ',         titleAccent: 'NETFLIX'        } },
  hbo:         { movie: { title: 'Cinema de ',      titleAccent: 'PRIMEIRA LINHA' }, series: { title: 'Todo mundo ',     titleAccent: 'ASSISTIU'       } },
  disney:      { movie: { title: 'A magia do ',     titleAccent: 'DISNEY+'        }, series: { title: 'Universo ',       titleAccent: 'DISNEY+'        } },
  amazon:      { movie: { title: 'Escolhas ',       titleAccent: 'PRIME VIDEO'    }, series: { title: 'Séries do ',      titleAccent: 'PRIME VIDEO'    } },
  apple:       { movie: { title: 'Premiado no ',    titleAccent: 'APPLE TV+'      }, series: { title: 'Exclusivo ',      titleAccent: 'APPLE TV+'      } },
  paramount:   { movie: { title: 'Clássicos da ',   titleAccent: 'PARAMOUNT+'     }, series: { title: 'Séries da ',      titleAccent: 'PARAMOUNT+'     } },
  globoplay:   { movie: { title: 'Cinema do ',      titleAccent: 'GLOBOPLAY'      }, series: { title: 'Séries do ',      titleAccent: 'GLOBOPLAY'      } },
  star:        { movie: { title: 'Estreias do ',    titleAccent: 'STAR+'          }, series: { title: 'Séries do ',      titleAccent: 'STAR+'          } },
  discovery:   { movie: { title: 'Descobertas do ', titleAccent: 'DISCOVERY+'     }, series: { title: 'Séries do ',      titleAccent: 'DISCOVERY+'     } },
  crunchyroll: { movie: { title: 'Filmes ',         titleAccent: 'CRUNCHYROLL'    }, series: { title: 'Animes ',         titleAccent: 'CRUNCHYROLL'    } },
  telecine:    { movie: { title: 'Cinema do ',      titleAccent: 'TELECINE'       }, series: { title: 'Séries do ',      titleAccent: 'TELECINE'       } },
  oldflix:     { movie: { title: 'Clássicos do ',   titleAccent: 'OLDFLIX'        }, series: { title: 'Séries do ',      titleAccent: 'OLDFLIX'        } },
  history:     { movie: { title: 'Histórias do ',   titleAccent: 'HISTORY PLAY'   }, series: { title: 'Séries do ',      titleAccent: 'HISTORY PLAY'   } },
}

function creativeStreaming(key: string, label: string, type: _StreamType): { title: string; titleAccent: string } {
  return CREATIVE_STREAMING[key]?.[type] || (
    type === 'movie'
      ? { title: `${label} `, titleAccent: 'Filmes' }
      : { title: `${label} `, titleAccent: 'Séries' }
  )
}

// ─── Personalized row: "Separado pra Você" ─────────────────────────────────
function buildPersonalizedRow(allChannels: Channel[], genreScores: Record<string, number>): ContentRow | null {
  const topGenres = Object.entries(genreScores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([g]) => g.toLowerCase())

  if (!topGenres.length) return null

  const picked: Channel[] = []
  const seen = new Set<string>()

  for (const genre of topGenres) {
    const matches = allChannels.filter(ch => {
      const genres: string[] = (ch as any).canonical?.genres || ch.tmdb?.genres || []
      return genres.some(g => {
        const gl = g.toLowerCase()
        return gl.includes(genre) || genre.includes(gl)
      })
    })
    for (const ch of matches.slice(0, 20)) {
      const key = (ch as any).canonical?.slug || ch.id
      if (!seen.has(key)) { seen.add(key); picked.push(ch) }
    }
  }

  if (picked.length < 5) return null

  for (let i = picked.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [picked[i], picked[j]] = [picked[j], picked[i]]
  }

  const channels = [...dedupByCanonical(picked), makeViewAllCard('Separado pra Você')]
  return { type: 'portrait', title: 'Separado ', titleAccent: 'PRA VOCÊ', channels, tmdb: new Map() }
}

// ─── Reorder rows by genre affinity ──────────────────────────────────────
function reorderByAffinity(rows: ContentRow[], genreScores: Record<string, number>): ContentRow[] {
  if (!Object.keys(genreScores).length) return rows

  const FIXED = /continuar|separado|4k ultra|ultra hd/i

  const fixed: ContentRow[] = []
  const sortable: ContentRow[] = []

  for (const row of rows) {
    const label = `${row.title} ${row.titleAccent}`
    if (FIXED.test(label)) fixed.push(row)
    else sortable.push(row)
  }

  const scored = sortable.map(row => {
    const label = _norm(`${row.title} ${row.titleAccent}`)
    let score = 0
    for (const [genre, count] of Object.entries(genreScores)) {
      if (label.includes(_norm(genre))) score += count
    }
    return { row, score }
  })

  scored.sort((a, b) => b.score - a.score)
  return [...fixed, ...scored.map(s => s.row)]
}

function buildHeroTmdb(heroChannels: Channel[]): Map<string, TMDBResult | null> {
  const heroTmdb = new Map<string, TMDBResult | null>()
  for (const ch of heroChannels) {
    if (ch.name === 'ziiiTV') {
      heroTmdb.set(ch.name, {
        title: 'ziiiTV', year: '2024', rating: 9.9,
        overview: 'Seu universo de entretenimento alienígena. Canais ao vivo, filmes e séries em ultra definições otimizadas.',
        poster: '', backdrop: '/banner-ziii.jpg',
        tmdbId: 0, mediaType: 'movie', trailerKey: '',
      })
    } else {
      heroTmdb.set(ch.name, ch.tmdb || null)
    }
  }
  return heroTmdb
}

// ─── Enrichment background (não bloqueia, atualiza em background) ───
async function backgroundEnrich(
  heroChannels: Channel[],
  rows: ContentRow[],
  heroTmdb: Map<string, TMDBResult | null>,
  onUpdate?: (heroTmdb: Map<string, TMDBResult | null>, rows: ContentRow[]) => void
): Promise<void> {
  try {
    const allChannels = [
      ...heroChannels,
      ...rows.flatMap(r => r.channels),
    ]
    const uniqueNames = Array.from(new Set(allChannels.map(ch => ch.name)))
    
    // Enriquecer: sem TMDB algum, ou com TMDB mas sem backdrop (ex: fileira 4K)
    const toEnrich = uniqueNames.filter(name => {
      const existing = allChannels.find(ch => ch.name === name)
      if (!existing?.tmdb) return true
      if (!existing.tmdb.backdrop) return true
      return false
    })
    
    if (toEnrich.length === 0) return
    
    // Enriquece até 100 canais em background (antes era 20 — insuficiente para listas grandes)
    const tmdbResults = await enrichBatch(toEnrich.slice(0, 100), 10, 300)

    for (const row of rows) {
      for (const ch of row.channels) {
        const tmdb = tmdbResults.get(ch.name) ?? ch.tmdb ?? null
        if (tmdb) row.tmdb.set(ch.name, tmdb)
      }
    }

    for (const ch of heroChannels) {
      if (ch.name === 'ziiiTV') continue
      const tmdb = tmdbResults.get(ch.name) ?? ch.tmdb ?? null
      if (tmdb) heroTmdb.set(ch.name, tmdb)
    }

    if (onUpdate) onUpdate(heroTmdb, rows)
  } catch (err) {
    console.warn('[ContentSelector] Background enrich error (non-fatal):', err)
  }
}

// ═══════════════════════════════════════════════════════════════════
// HOME — Página Principal (Otimizada: CatalogMatcher instantâneo)
// ═══════════════════════════════════════════════════════════════════
export async function buildHomeContent(
  _groups: NormalizedGroups,
  onContentUpdate?: (heroTmdb: Map<string, TMDBResult | null>, rows: ContentRow[]) => void
): Promise<ScreenContent> {
  const t0 = performance.now()

  // ─── 1. Dados instantâneos do CatalogMatcher (já matchou durante splash) ───
  const byStreaming = CatalogMatcher.getMatchedByStreaming()
  const hasMatcherData = Object.keys(byStreaming).length > 0

  let rows: ContentRow[] = []

  // ─── 2. Histórico: "Continuar Assistindo" ───
  const allChannelsMap = new Map<string, Channel>()
  for (const list of Object.values(_groups)) {
    for (const ch of list) allChannelsMap.set(ch.name, ch)
  }

  // Netflix: mostra apenas itens com progresso real (filmes 5–90%) ou séries em andamento
  const recentEntries = getRecentlyWatched(30)
  const continueEntries = recentEntries.filter(e =>
    (e.progressPct != null && e.progressPct > 5 && e.progressPct < 90) ||
    (e.lastEpisode != null)
  ).slice(0, 15)

  const continueChannels = continueEntries
    .map(h => {
      const ch = allChannelsMap.get(h.name)
      if (!ch) return null
      if (h.lastEpisode) return { ...ch, _lastEpisode: h.lastEpisode } as Channel
      return ch
    })
    .filter(Boolean) as Channel[]

  // "Continuar Assistindo" só aparece com histórico real (sem fallback de catálogo)
  if (continueChannels.length > 0) {
    rows.push({ type: 'wide' as const, title: 'Continuar ', titleAccent: 'Assistindo', channels: dedupByCanonical(continueChannels), tmdb: new Map() })
  }

  // ── Rows curadas do admin (xtream_group sections) ──
  for (const dr of ContentCatalog.getDirectRows()) {
    if (dr.channels.length < 1) continue
    rows.push({
      type: dr.contentType === 'live' ? 'simple' : 'portrait',
      title: '',
      titleAccent: dr.title,
      channels: dr.channels.slice(0, 500),
      tmdb: new Map(),
    })
  }

  // ── Fileira 4K: canais matchados (com TMDB completo) que têm stream 4K ──
  // Usa matched pois garantem backdrop landscape real. Fallback: não-matched sem imagem.
  const ultra4kKeys = new Set<string>()
  for (const [key] of UnmatchedCatalog.genreEntries()) {
    if (/4k|uhd/i.test(key)) ultra4kKeys.add(key)
  }

  const all4kMatched = Object.values(byStreaming)
    .flatMap(g => [...g.movies, ...g.series])
    .filter(ch => (ch as any).streams?.some((s: any) => s.quality === '4K'))
    .filter((ch, i, arr) => arr.findIndex(x => x.id === ch.id) === i)

  if (all4kMatched.length >= 3) {
    rows.push({ type: 'portrait' as const, title: '', titleAccent: '4K Ultra HD', channels: dedupByCanonical(all4kMatched).slice(0, 200), tmdb: new Map() })
  }

  // ── Top Animações — lista curada ──
  const TOP_ANIMATIONS = [
    'O Rei Leão','A Viagem de Chihiro','Shrek','Shrek 2','Shrek Terceiro',
    'Homem-Aranha: No Aranhaverso','Homem-Aranha: Através do Aranhaverso',
    'Pinóquio','Fantasia','A Bela e a Fera','Wall-E','Up: Altas Aventuras',
    'Divertida Mente','Divertida Mente 2','Monstros S.A.','Os Incríveis','Os Incríveis 2',
    'Ratatouille','Frozen: Uma Aventura Congelante','Frozen II',
    'Viva: A Vida é uma Festa','Lilo & Stitch','Encanto','Akira',
    'Meu Amigo Totoro','Princesa Mononoke','Como Treinar o Seu Dragão',
    'Como Treinar o Seu Dragão 3','Madagascar','Coraline e o Mundo Secreto',
    'Klaus','Gato de Botas 2','Toy Story 4','Carros','Carros 2','Carros 3',
    'Enrolados','Zootopia 2','Moana 2','Suzume','Luca','Lightyear',
    'A Noiva Cadáver','Dragon Ball Super Broly','Kung Fu Panda 4',
    'Aladdin','Branca de Neve','Ponyo - Uma Amizade que Veio do Mar',
    'Wish: O Poder dos Desejos','Kung Fu Panda: Lendas do Dragão Guerreiro',
  ]
  const normAnim = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9 ]/g,'').trim()
  const animSet = new Set(TOP_ANIMATIONS.map(normAnim))
  const allChannels = [...ContentCatalog.getPool('filmes'), ...Object.values(byStreaming).flatMap(g => [...g.movies, ...g.series])]
  const animChannels = allChannels.filter(ch => {
    const t = (ch as any).canonical?.title || ch.tmdb?.title || ch.name
    return animSet.has(normAnim(t))
  })
  const animDeduped = dedupByCanonical(animChannels)
  if (animDeduped.length >= 5) {
    rows.push({ type: 'portrait' as const, title: '', titleAccent: 'Top Animações', channels: animDeduped, tmdb: new Map() })
  }

  // ── Top Comédias — lista curada ──
  const TOP_COMEDIAS = [
    'Quanto Mais Quente Melhor','Tempos Modernos','Monty Python em Busca do Cálice Sagrado',
    'Apertem os Cintos... O Piloto Sumiu!','Feitiço do Tempo','Dr. Fantástico',
    'Se Beber, Não Case!','Annie Hall','O Grande Lebowski','Debi & Lóide',
    'Curtindo a Vida Adoidado','Os Caça-Fantasmas','Um Príncipe em Nova York',
    'Esqueceram de Mim','Meninas Malvadas','As Patricinhas de Beverly Hills',
    'O Mentiroso','Quem Vai Ficar com Mary?','American Pie','Austin Powers',
    'Edward Mãos de Tesoura','Forrest Gump','MIB: Homens de Preto',
    'Superbad: É Hoje','Trovão Tropical','Borat','Deadpool','Jojo Rabbit',
    'Entre Facas e Segredos','A Proposta','Ted','O Lobo de Wall Street',
    '21 Jump Street','Napoleon Dynamite','Game Night',
    'O Grande Ditador','Cantando na Chuva','Intocáveis',
    'O Fabuloso Destino de Amélie Poulain','Parasita','Relatos Selvagens',
    'O Auto da Compadecida','Minha Mãe é uma Peça','Cidade de Deus',
    'Snatch: Porcos e Diamantes','Uma Linda Mulher',
    '10 Coisas que Eu Odeio em Você','O Diário de Bridget Jones',
    'Simplesmente Amor','Notting Hill','Hitch: Conselheiro Amoroso',
    'Todo Mundo em Pânico','Zoolander','Idiocracia',
    'Scott Pilgrim Contra o Mundo','As Branquelas','Ace Ventura: Um Detetive Diferente',
    'O Máskara','Barbie','Sociedade dos Poetas Mortos','Missão Madrinha de Casamento',
    'Quase Irmãos','Família do Bagulho','A Escolha Perfeita',
    'South Park: Maior, Melhor e Sem Cortes','Spaceballs',
    'Corra que a Polícia Vem Aí!','Um Peixe Chamado Wanda',
    'Treze Homens e um Novo Segredo','Adeus, Lenin!',
    'Como se Fosse a Primeira Vez','Casamento Grego',
  ]
  const normStr = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9 ]/g,'').trim()
  const comSet = new Set(TOP_COMEDIAS.map(normStr))
  const comChannels = allChannels.filter(ch => {
    const t = (ch as any).canonical?.title || ch.tmdb?.title || ch.name
    return comSet.has(normStr(t))
  })
  const comDeduped = dedupByCanonical(comChannels)
  if (comDeduped.length >= 5) {
    rows.push({ type: 'portrait' as const, title: '', titleAccent: 'Top Comédias', channels: comDeduped, tmdb: new Map() })
  }

  // ── Legendados logo após 4K ──
  for (const [key, { label, channels }] of UnmatchedCatalog.genreEntries()) {
    if (!/leg/i.test(key)) continue
    if (channels.length < 3) continue
    rows.push({ type: 'portrait', title: '', titleAccent: label, channels: channels.slice(0, 200), tmdb: new Map() })
  }
  const legSeries = UnmatchedCatalog.getStreaming('series_leg')
  if (legSeries.length >= 3) rows.push({ type: 'portrait', title: '', titleAccent: 'Séries Legendadas', channels: legSeries.slice(0, 200), tmdb: new Map() })

  // Streamings: Filmes (matched) + Séries (matched + unmatched)
  for (const { key, label } of STREAMING_CONF) {
    const group = byStreaming[key] || { movies: [], series: [] }
    const unmatchedSeries = UnmatchedCatalog.getStreaming(key)

    if (group.movies.length >= 3) {
      rows.push({ type: 'portrait', ...creativeStreaming(key, label, 'movie'), channels: dedupByCanonical(group.movies), tmdb: new Map() })
    }
    const allSeries = dedupByCanonical([...group.series, ...unmatchedSeries])
    if (allSeries.length >= 3) {
      rows.push({ type: 'portrait', ...creativeStreaming(key, label, 'series'), channels: allSeries.slice(0, 200), tmdb: new Map() })
    }
  }

  // Gêneros de filmes do UnmatchedCatalog (exceto 4K, já adicionada no início)
  for (const [key, { label: genreLabel, channels: genreChannels }] of UnmatchedCatalog.genreEntries()) {
    if (ultra4kKeys.has(key)) continue
    if (/leg/i.test(key)) continue  // já adicionado após 4K
    if (genreChannels.length < 3) continue
    rows.push({ type: 'portrait', title: '', titleAccent: genreLabel, channels: genreChannels.slice(0, 200), tmdb: new Map() })
  }

  // Gêneros do catálogo matchado
  if (hasMatcherData) {
    const HOME_GENRES = [
      { label: 'Ação e Aventura',        keywords: /ação|acao|action|aventura|guerra|batalha/i },
      { label: 'Comédia',                keywords: /comédia|comedia|comedy|engraçad|humor|risada/i },
      { label: 'Drama',                  keywords: /drama|emocionante|redenção|superação/i },
      { label: 'Ficção Científica',       keywords: /ficção|ficcao|sci.fi|scifi|espaço|futuro|robô/i },
      { label: 'Família e Animação',      keywords: /família|familia|infantil|animação|animation|criança/i },
      { label: 'Suspense e Investigação', keywords: /suspense|thriller|mistério|investigação|detetive/i },
      { label: 'Animes',                 keywords: /anime|animê|manga|japonês/i },
    ]
    const allFiltered = [...ContentCatalog.getPool('filmes'), ...ContentCatalog.getPool('series')]
    const genreRowsMatched: Partial<ContentRow>[] = HOME_GENRES.map(({ label: gLabel, keywords }) => {
      const gChannels = allFiltered.filter(ch => {
        const canonical = (ch as any).canonical
        const text = canonical?.overview || ch.tmdb?.overview || ch.name
        return keywords.test(text)
      })
      return { type: 'portrait' as const, ...creativeGenre(gLabel), channels: dedupByCanonical(gChannels) }
    })
    rows.push(...buildRows(genreRowsMatched))
  }

  // Canais abertos / TV ao vivo
  const abertos = ContentCatalog.getPool('abertos')
  if (abertos.length > 4) {
    rows.push({ type: 'portrait' as const, title: 'TV ', titleAccent: 'ao Vivo', channels: dedupByCanonical(abertos), tmdb: new Map() })
  }

  // Fallback puro: nenhum dado disponível ainda (primeiro boot sem código)
  // Suprimido se há directRows curadas — evita duplicar conteúdo
  if (!hasMatcherData && !UnmatchedCatalog.ready && ContentCatalog.getDirectRows().length === 0) {
    ContentCatalog.resetUsed()
    const allFilmes = ContentCatalog.getPool('filmes')
    const allSeries = ContentCatalog.getPool('series')
    rows.push(...[
      { type: 'portrait' as const, title: 'Top ', titleAccent: 'Filmes',  channels: dedupByCanonical(allFilmes.slice(0, 100)),  tmdb: new Map() },
      { type: 'portrait' as const, title: 'Top ', titleAccent: 'Séries',  channels: dedupByCanonical(allSeries.slice(0, 100)),  tmdb: new Map() },
    ].filter(r => r.channels.length > 0))
  }

  // ─── Personalização ────────────────────────────────────────────────────────
  const genreScores = getGenreScores()
  if (Object.keys(genreScores).length > 0) {
    const allPooled = [
      ...ContentCatalog.getPool('filmes'),
      ...ContentCatalog.getPool('series'),
    ]
    const personalRow = buildPersonalizedRow(allPooled, genreScores)
    if (personalRow) {
      const insertAt = rows.findIndex(r => !/continuar/i.test(`${r.title} ${r.titleAccent}`)) + 1 || 1
      rows.splice(insertAt > 0 ? insertAt : 1, 0, personalRow)
    }
    rows = reorderByAffinity(rows, genreScores)
  }

  populateCanonicalTmdb(rows)

  // ─── 4. Hero section (dinâmico: melhores canais reais do catalog) ───
  let heroChannels: Channel[] = []

  if (hasMatcherData) {
    const streamingsOrder = ['netflix', 'hbo', 'disney', 'amazon', 'apple', 'paramount', 'globoplay']
    for (const s of streamingsOrder) {
      const group = byStreaming[s]
      if (!group) continue
      // Exclui títulos pesados do hero
      const best = [...group.movies, ...group.series].find(ch => !isHeavy(ch))
      if (best && !heroChannels.find(h => h.id === best.id)) {
        heroChannels.push(best)
        if (heroChannels.length >= 5) break
      }
    }
  }

  if (heroChannels.length < 3) {
    const extra = ContentCatalog.pickMix(['filmes', 'series'], 5 - heroChannels.length, 50)
    heroChannels = [...heroChannels, ...extra]
  }

  const heroTmdb = new Map<string, TMDBResult | null>()
  for (const ch of heroChannels) {
    const canonical = (ch as any).canonical
    if (canonical) {
      heroTmdb.set(ch.name, {
        title: canonical.title ?? ch.name,
        year: String(canonical.year ?? ''),
        rating: canonical.rating ?? 0,
        overview: canonical.overview ?? '',
        poster: canonical.poster ?? '',
        backdrop: canonical.backdrop ?? '',
        tmdbId: canonical.tmdbId ?? 0,
        mediaType: canonical.type === 'series' ? 'tv' : 'movie',
        trailerKey: '',
      })
    } else {
      heroTmdb.set(ch.name, ch.tmdb || null)
    }
  }

  // Enriquece hero + backdrops faltantes em background (sem bloquear)
  backgroundEnrich(heroChannels, rows, heroTmdb, onContentUpdate)

  // Enriquece directRows com backdrop + sinopse via Xtream player_api (sem bloquear)
  const xtreamUrl = ContentCatalog.getXtreamUrl()
  const directRowsData = ContentCatalog.getDirectRows()
  if (xtreamUrl && directRowsData.length > 0) {
    const toEnrich = directRowsData.flatMap(dr => dr.channels.slice(0, 10))
    enrichChannelsInPlace(xtreamUrl, toEnrich).then(() => {
      for (const row of rows) {
        for (const ch of row.channels) {
          if (ch.tmdb) row.tmdb.set(ch.name, ch.tmdb)
        }
      }
      for (const ch of heroChannels) {
        if (ch.tmdb) heroTmdb.set(ch.name, ch.tmdb)
      }
      if (onContentUpdate) onContentUpdate(heroTmdb, rows)
    }).catch(() => {})
  }

  return { heroChannels, heroTmdb, rows }
}


// ─── Helper: monta fileira "Continuar Assistindo" filtrada por tipo ────────────
function buildContinueRow(
  _groups: NormalizedGroups,
  typeFilter: 'movie' | 'series' | 'all'
): ContentRow | null {
  const allChannelsMap = new Map<string, Channel>()
  for (const list of Object.values(_groups)) {
    for (const ch of list) allChannelsMap.set(ch.name, ch)
  }

  const recentEntries = getRecentlyWatched(30)
  const continueEntries = recentEntries.filter(e =>
    (e.progressPct != null && e.progressPct > 5 && e.progressPct < 90) ||
    (e.lastEpisode != null)
  )

  const channels = continueEntries
    .map(h => {
      const ch = allChannelsMap.get(h.name)
      if (!ch) return null
      const canonicalType = (ch as any).canonical?.type as string | undefined
      const isSeries = !!h.lastEpisode || canonicalType === 'series'
      if (typeFilter === 'movie' && isSeries) return null
      if (typeFilter === 'series' && !isSeries) return null
      return h.lastEpisode ? { ...ch, _lastEpisode: h.lastEpisode } as Channel : ch
    })
    .filter(Boolean)
    .slice(0, 15) as Channel[]

  if (channels.length === 0) return null

  return {
    type: 'wide' as const,
    title: 'Continuar ',
    titleAccent: 'Assistindo',
    channels,
    tmdb: new Map(),
  }
}

// ═══════════════════════════════════════════════════════════════════
// FILMES
// ═══════════════════════════════════════════════════════════════════
export async function buildFilmesContent(_groups: NormalizedGroups): Promise<ScreenContent> {
  ContentCatalog.resetUsed()

  const byStreaming = CatalogMatcher.getMatchedByStreaming()
  const hasMatcherData = Object.keys(byStreaming).length > 0

  // Todos os filmes matched (têm canonical.overview para filtrar por gênero)
  const allMatchedFilmes = Object.values(byStreaming).flatMap(g => g.movies)
  // Fallback: pool do ContentCatalog
  const allFilmes = allMatchedFilmes.length > 0 ? allMatchedFilmes : ContentCatalog.getPool('filmes')

  // ─── 1. Rows por streaming ───
  const streamingRows: Partial<ContentRow>[] = []
  if (hasMatcherData) {
    for (const { key, label } of STREAMING_CONF) {
      const group = byStreaming[key]
      if (!group || group.movies.length < 3) continue
      streamingRows.push({ type: 'portrait', ...creativeStreaming(key, label, 'movie'), channels: dedupByCanonical(group.movies) })
    }
  }

  // ─── 2. Rows por gênero — filtra pelo overview canônico ───
  const GENRE_ROWS = [
    { label: 'Ação',         keywords: /ação|acao|action|aventura|guerra|batalha/i },
    { label: 'Comédia',      keywords: /comédia|comedia|comedy|engraçad|humor|risada/i },
    { label: 'Drama',        keywords: /drama|emocionante|redenção|superação/i },
    { label: 'Romance',      keywords: /romance|romântico|amor|apaixon|casamento/i },
    { label: 'Ficção',       keywords: /ficção|ficcao|sci.fi|scifi|espaço|futuro|robô/i },
    { label: 'Família',      keywords: /família|familia|infantil|animação|animation|criança|menino|menina/i },
    { label: 'Suspense',     keywords: /suspense|thriller|mistério|investigação|detetive|assassin/i },
    { label: 'Histórico',    keywords: /históric|histori|guerra|época|século|imperial|medieval/i },
    { label: 'Musical',      keywords: /musical|música|canção|dança|trilha/i },
    { label: 'Inspiradores', keywords: /inspirador|superação|sonho|conquista|vitória|campeão/i },
  ]

  const genreRows: Partial<ContentRow>[] = GENRE_ROWS.map(({ label, keywords }) => {
    const channels = allFilmes.filter(ch => {
      const canonical = (ch as any).canonical
      const text = canonical?.overview || ch.tmdb?.overview || ch.name
      return keywords.test(text)
    })
    return { type: 'portrait' as const, ...creativeGenre(label), channels: dedupByCanonical(channels) }
  })

  const continueRow = buildContinueRow(_groups, 'movie')

  // ─── 3. Gêneros do UnmatchedCatalog (filmes da lista sem match TMDB) ───
  const unmatchedGenreRows: Partial<ContentRow>[] = []
  for (const [key, { label: genreLabel, channels: genreChannels }] of UnmatchedCatalog.genreEntries()) {
    if (/leg/i.test(key)) continue // legendados já aparecem separado
    if (genreChannels.length < 3) continue
    unmatchedGenreRows.push({ type: 'portrait' as const, title: '', titleAccent: genreLabel, channels: genreChannels.slice(0, 500) })
  }

  const rows = buildRows([...streamingRows, ...genreRows, ...unmatchedGenreRows])
  if (continueRow) rows.unshift(continueRow)

  // ── Rows curadas (Top Animações e Top Comédias) ──
  const normCurated = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9 ]/g,'').trim()
  const allFilmesPool = [...allFilmes, ...Object.values(byStreaming).flatMap(g => g.movies)]

  const TOP_ANIM = ['O Rei Leão','A Viagem de Chihiro','Shrek','Shrek 2','Shrek Terceiro','Homem-Aranha: No Aranhaverso','Homem-Aranha: Através do Aranhaverso','Pinóquio','Fantasia','A Bela e a Fera','Wall-E','Up: Altas Aventuras','Divertida Mente','Divertida Mente 2','Monstros S.A.','Os Incríveis','Os Incríveis 2','Ratatouille','Frozen: Uma Aventura Congelante','Frozen II','Viva: A Vida é uma Festa','Lilo & Stitch','Encanto','Akira','Meu Amigo Totoro','Princesa Mononoke','Como Treinar o Seu Dragão','Como Treinar o Seu Dragão 3','Madagascar','Coraline e o Mundo Secreto','Klaus','Gato de Botas 2','Toy Story 4','Carros','Carros 2','Carros 3','Enrolados','Zootopia 2','Moana 2','Suzume','Luca','Lightyear','A Noiva Cadáver','Dragon Ball Super Broly','Kung Fu Panda 4','Aladdin','Branca de Neve','Ponyo - Uma Amizade que Veio do Mar','Wish: O Poder dos Desejos']
  const TOP_COM = ['Tempos Modernos','Feitiço do Tempo','Curtindo a Vida Adoidado','Os Caça-Fantasmas','Um Príncipe em Nova York','Esqueceram de Mim','Meninas Malvadas','As Patricinhas de Beverly Hills','O Mentiroso','Forrest Gump','Jojo Rabbit','Entre Facas e Segredos','O Lobo de Wall Street','Cantando na Chuva','Intocáveis','O Fabuloso Destino de Amélie Poulain','O Auto da Compadecida','Minha Mãe é uma Peça','10 Coisas que Eu Odeio em Você','Hitch: Conselheiro Amoroso','Todo Mundo em Pânico','Zoolander','Scott Pilgrim Contra o Mundo','O Máskara','Barbie','Sociedade dos Poetas Mortos','Missão Madrinha de Casamento','Quase Irmãos','Família do Bagulho','South Park: Maior, Melhor e Sem Cortes','Spaceballs','Corra que a Polícia Vem Aí!','Um Peixe Chamado Wanda','Treze Homens e um Novo Segredo','Adeus, Lenin!','Como se Fosse a Primeira Vez','Casamento Grego']

  const animSet = new Set(TOP_ANIM.map(normCurated))
  const comSet2 = new Set(TOP_COM.map(normCurated))
  const animChs = dedupByCanonical(allFilmesPool.filter(ch => animSet.has(normCurated((ch as any).canonical?.title || ch.tmdb?.title || ch.name))))
  const comChs = dedupByCanonical(allFilmesPool.filter(ch => comSet2.has(normCurated((ch as any).canonical?.title || ch.tmdb?.title || ch.name))))
  if (animChs.length >= 5) rows.splice(1, 0, { type: 'portrait', title: '', titleAccent: 'Top Animações', channels: animChs, tmdb: new Map() })
  if (comChs.length >= 5) rows.splice(animChs.length >= 5 ? 2 : 1, 0, { type: 'portrait', title: '', titleAccent: 'Top Comédias', channels: comChs, tmdb: new Map() })

  populateCanonicalTmdb(rows)

  const heroChannels = (continueRow?.channels ?? rows[0]?.channels.filter(c => !c.isViewAll) ?? allFilmes).slice(0, 5)
  const heroTmdb = buildHeroTmdb(heroChannels)

  return { heroChannels, heroTmdb, rows }
}

// ═══════════════════════════════════════════════════════════════════
// SÉRIES
// ═══════════════════════════════════════════════════════════════════
export async function buildSeriesContent(_groups: NormalizedGroups): Promise<ScreenContent> {
  ContentCatalog.resetUsed()

  const byStreaming = CatalogMatcher.getMatchedByStreaming()
  const hasMatcherData = Object.keys(byStreaming).length > 0

  const allMatchedSeries = Object.values(byStreaming).flatMap(g => g.series)
  const allSeries = allMatchedSeries.length > 0 ? allMatchedSeries : ContentCatalog.getPool('series')

  // ─── 1. Rows por streaming ───
  const streamingRows: Partial<ContentRow>[] = []
  if (hasMatcherData) {
    for (const { key, label } of STREAMING_CONF) {
      const group = byStreaming[key]
      if (!group || group.series.length < 3) continue
      streamingRows.push({ type: 'portrait', ...creativeStreaming(key, label, 'series'), channels: dedupByCanonical(group.series) })
    }
  }

  // ─── 2. Rows por gênero ───
  const GENRE_ROWS = [
    { label: 'Ação',         keywords: /ação|acao|action|aventura|batalha/i },
    { label: 'Comédia',      keywords: /comédia|comedia|comedy|engraçad|humor/i },
    { label: 'Drama',        keywords: /drama|emocionante|redenção/i },
    { label: 'Romance',      keywords: /romance|romântico|amor|apaixon/i },
    { label: 'Ficção',       keywords: /ficção|ficcao|sci.fi|scifi|espaço|futuro/i },
    { label: 'Família',      keywords: /família|familia|infantil|animação|criança/i },
    { label: 'Crime',        keywords: /crime|policial|thriller|detetive|assassin/i },
    { label: 'Anime',        keywords: /anime|animê|manga|japonês/i },
    { label: 'Inspiradores', keywords: /inspirador|superação|sonho|conquista/i },
  ]

  const genreRows: Partial<ContentRow>[] = GENRE_ROWS.map(({ label, keywords }) => {
    const channels = allSeries.filter(ch => {
      const canonical = (ch as any).canonical
      const text = canonical?.overview || ch.tmdb?.overview || ch.name
      return keywords.test(text)
    })
    return { type: 'portrait' as const, ...creativeGenre(label), channels: dedupByCanonical(channels) }
  })

  const continueRow = buildContinueRow(_groups, 'series')
  const rows = buildRows([...streamingRows, ...genreRows])
  if (continueRow) rows.unshift(continueRow)
  populateCanonicalTmdb(rows)

  const heroChannels = (continueRow?.channels ?? rows[0]?.channels.filter(c => !c.isViewAll) ?? allSeries).slice(0, 5)
  const heroTmdb = buildHeroTmdb(heroChannels)

  return { heroChannels, heroTmdb, rows }
}

// ═══════════════════════════════════════════════════════════════════
// TV AO VIVO
// ═══════════════════════════════════════════════════════════════════
export async function buildTvContent(groups: NormalizedGroups): Promise<ScreenContent> {
  const t0 = performance.now()
  ContentCatalog.resetUsed()

  // Busca canais ao vivo de todas as fontes possíveis
  const allLive = [
    ...(groups['esportes'] || []),
    ...(groups['abertos'] || []),
    ...(groups['outros'] || []),
  ].filter(ch => {
    const n = ch.name.toLowerCase()
    const g = (ch.group || '').toLowerCase()
    return /espn|sportv|premiere|pfc|paramount|combate|ufc|nba|nfl|futebol|esporte|sport/i.test(n + g)
  })

  const sortByNumber = (chs: Channel[]) =>
    [...chs].sort((a, b) => extractChannelNumber(a.name) - extractChannelNumber(b.name))

  const espn      = sortByNumber(allLive.filter(ch => /\bespn\b/i.test(ch.name)))
  const sportv    = sortByNumber(allLive.filter(ch => /\bspo?rtv\b/i.test(ch.name)))
  const premiere  = sortByNumber(allLive.filter(ch => /\bpremiere\b|\bpfc\b/i.test(ch.name)))
  const paramount = allLive.filter(ch => /paramount/i.test(ch.name))
  const outros    = allLive.filter(ch => 
    !/espn|sportv|premiere|pfc|paramount/i.test(ch.name)
  )

  const rowDefs = [
    { title: 'ESPN',        channels: espn },
    { title: 'SporTV',      channels: sportv },
    { title: 'Premiere',    channels: premiere },
    { title: 'Paramount+',  channels: paramount },
    { title: 'Esportes',    channels: outros },
  ].filter(r => r.channels.length > 0)

  const rows = buildRows(rowDefs.map(r => ({
    type: 'simple' as const,
    title: r.title,
    titleAccent: '',
    channels: r.channels,
  })))

  const heroChannels = [
    ...premiere.slice(0, 2),
    ...espn.slice(0, 2),
    ...sportv.slice(0, 1),
  ]
  const heroTmdb = buildHeroTmdb(heroChannels)
  populateCanonicalTmdb(rows)

  return { heroChannels, heroTmdb, rows }
}
