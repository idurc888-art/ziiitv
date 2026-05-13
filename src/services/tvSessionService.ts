/**
 * tvSessionService.ts
 *
 * Orquestra o fluxo de inicialização da TV:
 *
 * 1. Verifica se existe tv_session para este device_id
 *    → SIM: retorna playlist salva (boot instantâneo, sem QR)
 *    → NÃO: inicia pairing flow (QR code)
 *
 * 2. Durante pairing, escuta via Realtime (postgres_changes) ou polling
 *    para detectar quando o usuário vincula no celular.
 *
 * 3. Ao detectar status 'linked' no pair_token:
 *    → Cria tv_session com os dados recebidos
 *    → Retorna playlist para o app carregar
 */

import {
  getDeviceId,
  getDeviceModel,
  getTvSession,
  upsertTvSession,
  createPairToken,
  checkPairStatus,
  buildPairUrl,
  getSecondsRemaining,
  type PairToken,
  type TvSession,
} from './pairingService'

export type SessionResult =
  | { type: 'session';  session: TvSession }
  | { type: 'pairing';  token: PairToken; qrUrl: string }
  | { type: 'error';    message: string }

export type PairingLinkedResult = {
  session: TvSession
  pairToken: PairToken
}

/**
 * Ponto de entrada principal.
 * Chamado no boot do app Tizen.
 */
export async function initTvSession(): Promise<SessionResult> {
  // 1. Tenta carregar sessão persistente
  const existing = await getTvSession()
  if (existing?.playlist_url || existing?.xtream_host) {
    console.log('[TvSession] Sessão encontrada, boot direto.')
    return { type: 'session', session: existing }
  }

  // 2. Nenhuma sessão — inicia pairing
  console.log('[TvSession] Sem sessão. Iniciando pairing...')
  const token = await createPairToken()
  if (!token) {
    return { type: 'error', message: 'Falha ao criar token de pairing. Verifique a conexão.' }
  }

  const qrUrl = buildPairUrl(token.token)
  console.log('[TvSession] Token criado:', token.token, '| QR URL:', qrUrl)

  return { type: 'pairing', token, qrUrl }
}

/**
 * Polling: aguarda pair_token ser vinculado.
 * Chame após initTvSession() retornar { type: 'pairing' }.
 *
 * @param token     O token retornado por initTvSession
 * @param onLinked  Callback chamado com os dados quando vinculado
 * @param onExpired Callback chamado quando o token expira
 * @param onTick    Callback opcional com segundos restantes (para countdown na UI)
 * @returns         Função para cancelar o polling
 */
export function waitForPairing(
  token: PairToken,
  onLinked:  (result: PairingLinkedResult) => void,
  onExpired: () => void,
  onTick?:   (secondsLeft: number) => void
): () => void {
  let cancelled = false
  const INTERVAL = 3000 // 3 segundos

  const poll = async () => {
    if (cancelled) return

    const secondsLeft = getSecondsRemaining(token.expires_at)
    onTick?.(secondsLeft)

    if (secondsLeft <= 0) {
      console.log('[TvSession] Token expirado.')
      onExpired()
      return
    }

    const status = await checkPairStatus(token.token)

    if (status?.status === 'linked') {
      console.log('[TvSession] Vinculado! Criando tv_session...')

      // Persiste sessão para próximos boots
      const session = await upsertTvSession(status.device_id, {
        device_name:   status.device_name  || getDeviceModel(),
        device_model:  status.device_model || getDeviceModel(),
        playlist_url:  status.playlist_url,
        playlist_type: status.playlist_type,
        xtream_host:   status.xtream_host,
        xtream_user:   status.xtream_user,
        xtream_pass:   status.xtream_pass,
        user_id:       status.user_id,
      })

      if (session) {
        onLinked({ session, pairToken: status })
      } else {
        console.error('[TvSession] Falha ao persistir sessão após pairing.')
      }
      return
    }

    if (!cancelled) {
      setTimeout(poll, INTERVAL)
    }
  }

  // Inicia polling
  setTimeout(poll, INTERVAL)

  // Retorna função de cancelamento
  return () => { cancelled = true }
}

/**
 * Limpa a sessão local (desvincula a TV).
 * Útil para botão "Desvincular" nas configurações.
 */
export async function clearTvSession(): Promise<void> {
  const deviceId = getDeviceId()
  try {
    await fetch(
      `${import.meta.env.VITE_SUPABASE_URL || ''}/rest/v1/tv_sessions?device_id=eq.${encodeURIComponent(deviceId)}`,
      {
        method: 'DELETE',
        headers: {
          apikey:        import.meta.env.VITE_SUPABASE_ANON_KEY || '',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY || ''}`,
        },
      }
    )
  } catch (e) {
    console.error('[TvSession] Falha ao limpar sessão:', e)
  }
  try { localStorage.removeItem('ziii_device_id') } catch (_) {}
  console.log('[TvSession] Sessão removida.')
}
