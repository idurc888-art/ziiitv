import type { Channel } from '../types/channel'
import { SUPABASE_URL, ANON_KEY } from './supabaseClient'

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
    if (parts[0] === 'movie' && parts.length >= 4)   return { id: parts[3].split('.')[0], type: 'movie' }
    if (parts[0] === 'series' && parts.length >= 4)  return { id: parts[3], type: 'series' }
    return null
  } catch {
    return null
  }
}

// Enriquece os canais in-place: muta ch.tmdb diretamente nos objetos originais
export async function enrichChannelsInPlace(
  m3uUrl: string,
  channels: Channel[],
): Promise<void> {
  const creds = parseXtreamCreds(m3uUrl)
  if (!creds) return

  // Monta lista de itens a buscar (sem tmdb.backdrop existente)
  const items: Array<{ ch: Channel; id: string; type: 'movie' | 'series' }> = []
  for (const ch of channels) {
    if (ch.tmdb?.backdrop) continue
    const streamUrl = ch.streams?.[0]?.url
    if (!streamUrl) continue
    const parsed = extractStreamId(streamUrl)
    if (!parsed) continue
    items.push({ ch, ...parsed })
  }

  if (items.length === 0) return

  // Chama Edge Function em batches de 50
  const batchSize = 50
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/xtream-enrich`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': ANON_KEY,
          'Authorization': `Bearer ${ANON_KEY}`,
        },
        body: JSON.stringify({
          base_url: creds.base,
          username: creds.username,
          password: creds.password,
          items: batch.map(b => ({ id: b.id, type: b.type })),
        }),
      })
      if (!res.ok) continue

      const { results } = await res.json() as { results: Record<string, any> }
      for (const { ch, id, type } of batch) {
        const meta = results[id]
        if (!meta) continue
        ch.tmdb = {
          title:     ch.tmdb?.title || ch.name,
          year:      meta.year      || ch.tmdb?.year      || '',
          rating:    meta.rating    ?? ch.tmdb?.rating    ?? 0,
          overview:  meta.plot      || ch.tmdb?.overview  || '',
          poster:    ch.tmdb?.poster || ch.logo           || '',
          backdrop:  meta.backdrop  || ch.tmdb?.backdrop  || '',
          tmdbId:    meta.tmdb_id   ?? ch.tmdb?.tmdbId    ?? 0,
          mediaType: type === 'series' ? 'tv' : 'movie',
          trailerKey: '',
          ...(meta.cast     ? { cast:     meta.cast.split(',').map((s: string) => s.trim()) } : {}),
          ...(meta.director ? { director: meta.director } : {}),
        } as any
      }
    } catch (err) {
      console.warn('[XtreamEnricher] batch falhou (non-fatal):', err)
    }
  }
}
