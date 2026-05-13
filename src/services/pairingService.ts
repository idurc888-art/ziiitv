/**
 * pairingService.ts
 *
 * Fluxo enterprise:
 * 1. TV inicia → verifica tv_sessions por device_id
 * 2. Se sessão encontrada → retorna playlist direto (sem QR)
 * 3. Se não → cria pair_token → exibe QR
 * 4. Celular confirma → pair_token vira 'linked' + tv_sessions é criada/atualizada
 * 5. TV detecta via Realtime ou polling e carrega playlist
 */

import { SUPABASE_URL, ANON_KEY, SUPABASE_HEADERS } from './supabaseClient'

export interface PairToken {
  id: string
  token: string
  device_id: string
  device_name?: string
  device_model?: string
  status: 'pending' | 'linked' | 'expired'
  playlist_url?: string
  playlist_type?: 'm3u' | 'xtream'
  xtream_host?: string
  xtream_user?: string
  xtream_pass?: string
  user_id?: string
  created_at: string
  expires_at: string
  linked_at?: string
}

export interface TvSession {
  id: string
  device_id: string
  device_name?: string
  device_model?: string
  playlist_url?: string
  playlist_type?: 'm3u' | 'xtream'
  xtream_host?: string
  xtream_user?: string
  xtream_pass?: string
  user_id?: string
  last_seen_at: string
  created_at: string
  updated_at: string
}

const REST   = `${SUPABASE_URL}/rest/v1`
const SINGLE = 'application/vnd.pgrst.object+json'
const DEVICE_KEY = 'ziii_device_id'

// ─── Device Identity ──────────────────────────────────────────────────────────

export function getDeviceId(): string {
  try {
    const stored = localStorage.getItem(DEVICE_KEY)
    if (stored) return stored
  } catch (_) {}

  try {
    const info = (window as any).webapis?.productinfo
    if (info) {
      const duid = info.getDuid()
      try { localStorage.setItem(DEVICE_KEY, duid) } catch (_) {}
      return duid
    }
  } catch (_) {}

  const id = 'tv_' + Math.random().toString(36).substring(2, 18)
  try { localStorage.setItem(DEVICE_KEY, id) } catch (_) {}
  return id
}

export function getDeviceModel(): string {
  try {
    const info = (window as any).webapis?.productinfo
    if (info) return info.getModelCode() || 'Samsung TV'
  } catch (_) {}
  return 'Samsung TV'
}

// ─── tv_sessions ──────────────────────────────────────────────────────────────

/**
 * Busca sessão persistente da TV.
 * Se encontrada, atualiza last_seen_at silenciosamente.
 */
export async function getTvSession(): Promise<TvSession | null> {
  const deviceId = getDeviceId()
  try {
    const res = await fetch(
      `${REST}/tv_sessions?device_id=eq.${encodeURIComponent(deviceId)}&select=*`,
      {
        headers: {
          ...SUPABASE_HEADERS,
          Accept: SINGLE,
        },
      }
    )
    if (res.status === 406 || res.status === 404) return null
    if (!res.ok) return null
    const session = await res.json() as TvSession

    // Atualiza last_seen_at em background
    fetch(`${REST}/tv_sessions?device_id=eq.${encodeURIComponent(deviceId)}`, {
      method: 'PATCH',
      headers: { ...SUPABASE_HEADERS, Prefer: 'return=minimal' },
      body: JSON.stringify({ last_seen_at: new Date().toISOString() }),
    }).catch(() => {})

    return session
  } catch (_) {
    return null
  }
}

/**
 * Cria ou atualiza a tv_session com os dados da playlist.
 * Chamado pelo LinkPage (admin web) após o usuário confirmar.
 */
export async function upsertTvSession(
  deviceId: string,
  data: Partial<Pick<TvSession,
    'device_name' | 'device_model' |
    'playlist_url' | 'playlist_type' |
    'xtream_host' | 'xtream_user' | 'xtream_pass' |
    'user_id'
  >>
): Promise<TvSession | null> {
  try {
    const res = await fetch(`${REST}/tv_sessions`, {
      method: 'POST',
      headers: {
        ...SUPABASE_HEADERS,
        Prefer: 'return=representation,resolution=merge-duplicates',
        Accept: SINGLE,
      },
      body: JSON.stringify({
        device_id: deviceId,
        ...data,
        last_seen_at: new Date().toISOString(),
      }),
    })
    if (!res.ok) {
      console.error('[TvSession] Upsert falhou:', await res.text())
      return null
    }
    return await res.json() as TvSession
  } catch (e) {
    console.error('[TvSession] Falha de rede:', e)
    return null
  }
}

// ─── pair_tokens ──────────────────────────────────────────────────────────────

export async function createPairToken(): Promise<PairToken | null> {
  try {
    const res = await fetch(`${REST}/pair_tokens`, {
      method: 'POST',
      headers: {
        ...SUPABASE_HEADERS,
        Prefer: 'return=representation',
        Accept: SINGLE,
      },
      body: JSON.stringify({
        device_id:    getDeviceId(),
        device_model: getDeviceModel(),
        device_name:  getDeviceModel(),
        status: 'pending',
      }),
    })
    if (!res.ok) {
      console.error('[Pairing] Erro ao criar token:', await res.text())
      return null
    }
    return await res.json() as PairToken
  } catch (e) {
    console.error('[Pairing] Falha de rede ao criar token:', e)
    return null
  }
}

export async function checkPairStatus(token: string): Promise<PairToken | null> {
  try {
    const res = await fetch(
      `${REST}/pair_tokens?token=eq.${encodeURIComponent(token)}&select=*`,
      {
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${ANON_KEY}`,
          Accept: SINGLE,
        },
      }
    )
    if (!res.ok) return null
    return await res.json() as PairToken
  } catch (_) {
    return null
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function buildPairUrl(token: string): string {
  const base = import.meta.env.VITE_PAIR_URL || 'https://ziiitv-admin.vercel.app/link'
  return `${base}?token=${token}`
}

export function getSecondsRemaining(expires_at: string): number {
  return Math.max(0, Math.floor((new Date(expires_at).getTime() - Date.now()) / 1000))
}
