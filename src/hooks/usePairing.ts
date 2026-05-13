/**
 * usePairing.ts
 *
 * FIX #4 — Substitui polling REST (200 requests/sessão) por Supabase Realtime (WebSocket).
 * A TV recebe o evento UPDATE em <1s após o celular confirmar o pairing.
 * Mantém polling como fallback caso o canal Realtime não conecte em 5s.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  createPairToken,
  checkPairStatus,
  buildPairUrl,
  getSecondsRemaining,
} from '../services/pairingService'
import { SUPABASE_URL, ANON_KEY } from '../services/supabaseClient'
import type { PairToken } from '../services/pairingService'

export type PairingState = 'loading' | 'ready' | 'linked' | 'expired' | 'error'

export interface UsePairingResult {
  state: PairingState
  token: string | null
  qrUrl: string | null
  pairData: PairToken | null
  secondsLeft: number
  refresh: () => void
}

// Polling sempre ativo — Tizen WS conecta mas não entrega eventos Postgres
const POLL_MS = 4000

/** Cria um canal Supabase Realtime via WebSocket nativo (sem SDK, compatível com Tizen) */
function createRealtimeChannel(
  table: string,
  filter: string,
  onUpdate: (row: any) => void
): WebSocket | null {
  try {
    const wsUrl = SUPABASE_URL
      .replace('https://', 'wss://')
      .replace('http://', 'ws://')
    const ws = new WebSocket(`${wsUrl}/realtime/v1/websocket?apikey=${ANON_KEY}&vsn=1.0.0`)

    ws.onopen = () => {
      // Subscreve ao canal postgres_changes
      ws.send(JSON.stringify({
        topic: `realtime:public:${table}`,
        event: 'phx_join',
        payload: {
          config: {
            broadcast: { self: false },
            presence: { key: '' },
            postgres_changes: [{
              event: 'UPDATE',
              schema: 'public',
              table,
              filter,
            }],
          },
        },
        ref: '1',
      }))
    }

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.event === 'postgres_changes' && msg.payload?.data?.type === 'UPDATE') {
          onUpdate(msg.payload.data.record)
        }
      } catch (_) {}
    }

    return ws
  } catch (_) {
    return null
  }
}

export function usePairing(): UsePairingResult {
  const [state, setState]       = useState<PairingState>('loading')
  const [pairData, setPairData] = useState<PairToken | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(600)

  const pollRef      = useRef<ReturnType<typeof setInterval> | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const wsRef        = useRef<WebSocket | null>(null)

  const clearAll = () => {
    if (pollRef.current)      clearInterval(pollRef.current)
    if (countdownRef.current) clearInterval(countdownRef.current)
    if (wsRef.current) {
      try { wsRef.current.close() } catch (_) {}
      wsRef.current = null
    }
  }

  const startPairing = useCallback(async () => {
    clearAll()
    setState('loading')
    setPairData(null)

    const token = await createPairToken()
    if (!token) {
      setState('error')
      return
    }

    setPairData(token)
    setState('ready')
    setSecondsLeft(getSecondsRemaining(token.expires_at))

    // ── Countdown visual ──────────────────────────────────────────────────
    countdownRef.current = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          clearAll()
          setState('expired')
          return 0
        }
        return prev - 1
      })
    }, 1000)

    // ── Handler de vinculação (compartilhado Realtime + polling) ──────────
    const handleLinked = (row: PairToken) => {
      if (row.status === 'linked') {
        clearAll()
        setPairData(row)
        setState('linked')
      } else if (row.status === 'expired') {
        clearAll()
        setState('expired')
      }
    }

    // ── Realtime: fast-path, não confiável no Tizen ───────────────────────
    wsRef.current = createRealtimeChannel('pair_tokens', `token=eq.${token.token}`, handleLinked)

    // ── Polling: sempre ativo desde o início (garante detecção no Tizen) ──
    pollRef.current = setInterval(async () => {
      const status = await checkPairStatus(token.token)
      if (status) handleLinked(status)
    }, POLL_MS)

  }, [])

  useEffect(() => {
    startPairing()
    return clearAll
  }, [startPairing])

  return {
    state,
    token:       pairData?.token ?? null,
    qrUrl:       pairData ? buildPairUrl(pairData.token) : null,
    pairData,
    secondsLeft,
    refresh:     startPairing,
  }
}
