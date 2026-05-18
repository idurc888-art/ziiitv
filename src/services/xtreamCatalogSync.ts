import { SUPABASE_URL, ANON_KEY } from './supabaseClient'
import type { RawCatalogEntry } from './catalogMatcher'

const BATCH_SIZE = 1500

export async function syncXtreamCatalog(
  entries: RawCatalogEntry[],
  code: string
): Promise<void> {
  if (entries.length === 0) return

  console.log(`[XtreamSync] ${entries.length} entradas únicas — enviando para o banco...`)

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch   = entries.slice(i, i + BATCH_SIZE)
    const replace = i === 0 // primeira batch apaga catálogo anterior

    try {
      const mapped = batch.map(e => ({
        content_type:  e.content_type,
        name:          e.name,
        logo_url:      e.logo_url,
        group_title:   e.group_title,
        stream_id:     e.stream_id,
        episode_count: e.episode_count,
      }))
      await fetch(`${SUPABASE_URL}/functions/v1/sync-playlist-content`, {
        method: 'POST',
        headers: {
          'apikey':        ANON_KEY,
          'Authorization': `Bearer ${ANON_KEY}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({ code, entries: mapped, replace }),
      })
    } catch (e) {
      console.warn('[XtreamSync] Batch falhou (non-fatal):', e)
    }
  }

  console.log('[XtreamSync] Sync concluído.')
}
