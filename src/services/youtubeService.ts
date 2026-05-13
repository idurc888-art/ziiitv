// YouTube Service — Canais curados para a aba COPA
// Embedável via IFrame oficial do YouTube (sem necessidade de API key para assistir)
// API key opcional: habilita detecção de live status em tempo real

export interface YTChannel {
  id: string
  name: string
  channelId: string   // UCxxxxxxx — ID do canal YouTube
  handle: string      // @handle para exibição
  description: string
  category: 'futebol' | 'basquete' | 'multi' | 'lutas' | 'olimpico'
  emoji: string
  color: string
  liveVideoId?: string // preenchido pelo checkLive() ou manualmente
}

// ─── Canais curados (verifique/atualize os channelId pelo YouTube Studio) ─────
export const COPA_CHANNELS: YTChannel[] = [
  // ── Futebol ──────────────────────────────────────────────────────────────
  {
    id: 'cazetv',
    name: 'Cazé TV',
    channelId: 'UCpm5GK3HAHBiTatBdqpGSqA',
    handle: '@cazetv',
    description: 'Libertadores · Premier League · Copa do Brasil',
    category: 'futebol',
    emoji: '⚽',
    color: '#00c9ff',
  },
  {
    id: 'cbf',
    name: 'CBF Futebol',
    channelId: 'UCb3K6BFq2x_3Ug-F5cFBCCg',
    handle: '@CBFutebol',
    description: 'Seleção Brasileira · Oficial',
    category: 'futebol',
    emoji: '🇧🇷',
    color: '#f5d020',
  },
  {
    id: 'conmebol',
    name: 'Conmebol TV',
    channelId: 'UCTBOzgUOhBKFJl9mN8lZCpA',
    handle: '@CONMEBOLlive',
    description: 'Libertadores · Copa Sudamericana',
    category: 'futebol',
    emoji: '🏆',
    color: '#e8d44d',
  },
  {
    id: 'fifatv',
    name: 'FIFA+',
    channelId: 'UCpcTrCXblq78Gn1KoTwD7YA',
    handle: '@FIFAPlus',
    description: 'Copa do Mundo · Documentários · Archivos históricos',
    category: 'futebol',
    emoji: '🌍',
    color: '#4facfe',
  },
  {
    id: 'espnbrasil',
    name: 'ESPN Brasil',
    channelId: 'UCgIAFlV0lL96T9KL4W01Q7Q',
    handle: '@ESPNBrasil',
    description: 'NFL · Futebol · Basquete · Análises',
    category: 'multi',
    emoji: '📡',
    color: '#e8512a',
  },
  // ── Basquete ─────────────────────────────────────────────────────────────
  {
    id: 'nbabrasil',
    name: 'NBA Brasil',
    channelId: 'UCEjOSbbaOfgnfRODEL7fURg',
    handle: '@NBABrasil',
    description: 'NBA · G-League · Melhores momentos em PT-BR',
    category: 'basquete',
    emoji: '🏀',
    color: '#c8522b',
  },
  {
    id: 'nba',
    name: 'NBA',
    channelId: 'UCWJ2lWNubArHWmf3FIHbfcQ',
    handle: '@NBA',
    description: 'Canal oficial da NBA com jogos ao vivo',
    category: 'basquete',
    emoji: '🏀',
    color: '#1d428a',
  },
  // ── Lutas ────────────────────────────────────────────────────────────────
  {
    id: 'ufcbrasil',
    name: 'UFC Brasil',
    channelId: 'UCvgfXK4nTYKuFg5gLtMIHGg',
    handle: '@UFCBrasil',
    description: 'UFC · Análises · Shorts · Melhores lutas',
    category: 'lutas',
    emoji: '🥊',
    color: '#d4212f',
  },
  // ── Multi / Esportes ─────────────────────────────────────────────────────
  {
    id: 'sportcenter',
    name: 'SportsCenter BR',
    channelId: 'UCYCTHudOgFsQBFIjRgd3Y7A',
    handle: '@SportsCenter',
    description: 'Resumos · Análises · NFL · NBA · Futebol',
    category: 'multi',
    emoji: '🎯',
    color: '#ff6b35',
  },
  {
    id: 'canalolimpico',
    name: 'Canal Olímpico',
    channelId: 'UCwqO-nNB9mIBmKpXGmjYwNA',
    handle: '@CanalOlimpico',
    description: 'Jogos Olímpicos · Esportes · Cobertura oficial',
    category: 'olimpico',
    emoji: '🥇',
    color: '#0081c8',
  },
]

export const CATEGORY_LABELS: Record<YTChannel['category'], string> = {
  futebol:   '⚽ Futebol',
  basquete:  '🏀 Basquete',
  lutas:     '🥊 Lutas',
  multi:     '📡 Esportes',
  olimpico:  '🥇 Olímpico',
}

// ─── YouTube IFrame URLs ──────────────────────────────────────────────────────

export function embedUrl(videoId: string): string {
  return `https://www.youtube.com/embed/${videoId}?autoplay=1&controls=1&rel=0&iv_load_policy=3&modestbranding=1`
}

export function channelEmbedUrl(channelId: string): string {
  // Abre o canal direto — YouTube redireciona para a live se houver
  return `https://www.youtube.com/embed/live_stream?channel=${channelId}&autoplay=1`
}

// ─── Live Detection (requer YouTube Data API v3 key) ─────────────────────────
// Configure em: https://console.cloud.google.com → APIs & Services → YouTube Data API v3
// Após criar, cole abaixo ou defina VITE_YOUTUBE_API_KEY no .env
const YT_API_KEY: string =
  (typeof import.meta !== 'undefined' ? (import.meta as any).env?.VITE_YOUTUBE_API_KEY : undefined)
  ?? ''

export interface LiveStatus {
  channelId: string
  videoId: string | null
  title: string
  isLive: boolean
  viewerCount?: number
  thumbnail?: string
}

export async function checkLive(channelId: string): Promise<LiveStatus> {
  if (!YT_API_KEY) return { channelId, videoId: null, title: '', isLive: false }

  try {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&eventType=live&type=video&key=${YT_API_KEY}`
    const res = await fetch(url)
    if (!res.ok) return { channelId, videoId: null, title: '', isLive: false }

    const data = await res.json()
    const item = data.items?.[0]
    if (!item) return { channelId, videoId: null, title: '', isLive: false }

    const videoId = item.id?.videoId || null
    const title = item.snippet?.title || ''
    const thumbnail = item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.default?.url || ''

    return { channelId, videoId, title, isLive: !!videoId, thumbnail }
  } catch {
    return { channelId, videoId: null, title: '', isLive: false }
  }
}

export async function checkAllLive(): Promise<Map<string, LiveStatus>> {
  const results = new Map<string, LiveStatus>()
  if (!YT_API_KEY) return results

  await Promise.allSettled(
    COPA_CHANNELS.map(async (ch) => {
      const status = await checkLive(ch.channelId)
      results.set(ch.id, status)
    })
  )
  return results
}
