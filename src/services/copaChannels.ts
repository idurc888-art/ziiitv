// Copa 2026 — Canais de transmissão ao vivo (lista estática)
// youtubeChannelId == channelId do youtubeService (UCxxxxxxx)

export interface CopaChannel {
  id: string
  name: string
  handle: string
  logo: string
  youtubeChannelId: string
  priority: number
  description: string
}

export const COPA_WATCH_CHANNELS: CopaChannel[] = [
  {
    id: 'cazetv',
    name: 'Cazé TV',
    handle: '@cazetv',
    logo: '📺',
    youtubeChannelId: 'UCpm5GK3HAHBiTatBdqpGSqA',
    priority: 1,
    description: 'Transmite todos os 104 jogos da Copa ao vivo',
  },
  {
    id: 'cbf',
    name: 'CBF Futebol',
    handle: '@CBFutebol',
    logo: '🇧🇷',
    youtubeChannelId: 'UCb3K6BFq2x_3Ug-F5cFBCCg',
    priority: 2,
    description: 'Canal oficial da Seleção Brasileira',
  },
  {
    id: 'conmebol',
    name: 'Conmebol TV',
    handle: '@CONMEBOLlive',
    logo: '🏆',
    youtubeChannelId: 'UCTBOzgUOhBKFJl9mN8lZCpA',
    priority: 3,
    description: 'Futebol sul-americano ao vivo',
  },
  {
    id: 'fifa',
    name: 'FIFA+',
    handle: '@FIFAPlus',
    logo: '🌍',
    youtubeChannelId: 'UCpcTrCXblq78Gn1KoTwD7YA',
    priority: 4,
    description: 'Canal oficial da FIFA',
  },
]

export function channelEmbedUrl(youtubeChannelId: string): string {
  return `https://www.youtube.com/embed/live_stream?channel=${youtubeChannelId}&autoplay=1`
}
