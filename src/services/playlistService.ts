import type { Channel } from '../types/channel'
import { CatalogMatcher } from './catalogMatcher'

export interface CacheEntry {
  data: Record<string, Channel[]>
  status: string
  loadedAt: number
  channelCount: number
  source: 'memory' | 'cache' | 'remote'
}

let loadId = 0
const loadedUrls = new Map<string, CacheEntry>()

/**
 * Carrega a playlist usando o motor unificado do CatalogMatcher.
 * Isso evita baixar o arquivo 2x e processar 2x.
 */
export async function loadPlaylist(url: string): Promise<Record<string, Channel[]>> {
  const id = ++loadId
  console.log(`[PlaylistService #${id}] start unificado`)

  // 1. Tenta RAM
  if (loadedUrls.has(url)) {
    console.log(`[PlaylistService #${id}] memory_hit`)
    return loadedUrls.get(url)!.data
  }

  // 2. Solicita o match (que já faz o download e parse streaming)
  // Nota: CatalogMatcher já lida com IndexedDB internamente
  const { matched, unmatched } = await CatalogMatcher.loadAndMatch(url)
  
  // 3. Agrupa por categoria para o "Modo Lista"
  const groups: Record<string, Channel[]> = {}
  
  // Inclui canais que deram match no catálogo
  matched.forEach(ch => {
    if (!groups[ch.group]) groups[ch.group] = []
    groups[ch.group].push(ch)
  })

  // Inclui canais que não deram match
  unmatched.forEach(ch => {
    if (!groups[ch.group]) groups[ch.group] = []
    groups[ch.group].push(ch)
  })

  const channelCount = matched.length + unmatched.length
  
  loadedUrls.set(url, {
    data: groups,
    status: 'ready',
    loadedAt: Date.now(),
    channelCount,
    source: 'remote' // Simplificado
  })

  console.log(`[PlaylistService #${id}] pronto: ${channelCount} canais`)
  return groups
}

export async function clearPlaylistCache(): Promise<void> {
  loadedUrls.clear()
}

