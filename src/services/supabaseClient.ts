export const SUPABASE_URL = 'https://xkhlentrhydviqfgqdhv.supabase.co'
export const ANON_KEY     = 'sb_publishable_WsHv-bt4db2K4OIMc27rhg_utxbni2S'
export const SUPABASE_HEADERS = {
  'apikey': ANON_KEY,
  'Authorization': `Bearer ${ANON_KEY}`,
  'Content-Type': 'application/json',
}

export type CodeResult =
  | { type: 'channels'; channels: any[] }
  | { type: 'xtream';   url: string }

export async function getChannelsByCode(code: string): Promise<CodeResult> {
  const res = await fetch(
    `${SUPABASE_URL}/functions/v1/get-channels?code=${encodeURIComponent(code)}`,
    {
      headers: {
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${ANON_KEY}`,
      },
    }
  )
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || 'Código inválido')
  if (json.xtream && json.m3u_url) return { type: 'xtream', url: json.m3u_url }
  return { type: 'channels', channels: json.channels || [] }
}
