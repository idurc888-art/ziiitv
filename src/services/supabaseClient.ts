const SUPABASE_URL = 'https://xkhlentrhydviqfgqdhv.supabase.co'
const ANON_KEY     = 'sb_publishable_WsHv-bt4db2K4OIMc27rhg_utxbni2S'

export async function getChannelsByCode(code: string): Promise<any[]> {
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
  return json.channels || []
}
