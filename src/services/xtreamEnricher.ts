import type { Channel } from '../types/channel'

export function parseXtreamCreds(m3uUrl: string): { base: string; username: string; password: string } | null {
  try {
    const u = new URL(m3uUrl)
    const username = u.searchParams.get('username')
    const password = u.searchParams.get('password')
    if (!username || !password) return null
    return { base: u.origin, username, password }
  } catch {
    return null
  }
}

function extractStreamId(streamUrl: string): { id: string; type: 'movie' | 'series' } | null {
  try {
    const u = new URL(streamUrl)
    const parts = u.pathname.split('/').filter(Boolean)
    if (parts[0] === 'movie'  && parts.length >= 4) return { id: parts[3].split('.')[0], type: 'movie' }
    if (parts[0] === 'series' && parts.length >= 4) return { id: parts[3], type: 'series' }
    return null
  } catch {
    return null
  }
}

function resolveBackdrop(raw: any): string | null {
  const val = Array.isArray(raw) ? raw[0] : raw
  if (!val || typeof val !== 'string') return null
  return val.startsWith('http') ? val : `https://image.tmdb.org/t/p/w780${val}`
}

async function fetchMeta(
  base: string, username: string, password: string,
  id: string, type: 'movie' | 'series'
): Promise<any> {
  const action = type === 'series' ? `get_series_info&series_id=${id}` : `get_vod_info&vod_id=${id}`
  const url = `${base}/player_api.php?username=${username}&password=${password}&action=${action}`
  const res = await fetch(url)
  if (!res.ok) return null
  const data = await res.json()
  return data?.info ?? null
}

// Enriquece canais in-place chamando o player_api.php do Xtream diretamente
// (sem Edge Function — a TV tem acesso direto ao servidor Xtream)
export async function enrichChannelsInPlace(
  m3uUrl: string,
  channels: Channel[],
): Promise<void> {
  const creds = parseXtreamCreds(m3uUrl)
  if (!creds) return

  const items = channels
    .filter(ch => !ch.tmdb?.backdrop && ch.streams?.[0]?.url)
    .map(ch => ({ ch, parsed: extractStreamId(ch.streams[0].url) }))
    .filter(x => x.parsed !== null) as Array<{ ch: Channel; parsed: { id: string; type: 'movie' | 'series' } }>

  if (items.length === 0) return

  // Processa em paralelo por chunks de 5 para não sobrecarregar o servidor Xtream
  const chunkSize = 5
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize)
    await Promise.allSettled(chunk.map(async ({ ch, parsed }) => {
      try {
        const info = await fetchMeta(creds.base, creds.username, creds.password, parsed.id, parsed.type)
        if (!info) return
        ch.tmdb = {
          title:     ch.tmdb?.title || ch.name,
          year:      String(info.release_date ?? info.releasedate ?? '').slice(0, 4) || ch.tmdb?.year || '',
          rating:    info.rating    ? parseFloat(String(info.rating)) : (ch.tmdb?.rating ?? 0),
          overview:  info.plot      || info.description || ch.tmdb?.overview || '',
          poster:    ch.tmdb?.poster || ch.logo || '',
          backdrop:  resolveBackdrop(info.backdrop_path) || ch.tmdb?.backdrop || '',
          tmdbId:    info.tmdb_id   ? parseInt(String(info.tmdb_id)) : (ch.tmdb?.tmdbId ?? 0),
          mediaType: parsed.type === 'series' ? 'tv' : 'movie',
          trailerKey: '',
          ...(info.cast     ? { cast:     String(info.cast).split(',').map((s: string) => s.trim()) } : {}),
          ...(info.director ? { director: String(info.director) } : {}),
        } as any
      } catch {
        // non-fatal
      }
    }))
  }
}
