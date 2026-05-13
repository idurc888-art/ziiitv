import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { type Channel } from '../../types/channel'
import { initPlayer, loadStream, destroyPlayer, selectPlayerBackend } from '../../services/playerService'
import { avplayStop, isAVPlayAvailable } from '../../services/avplayService'
import { playerManager } from '../../services/PlayerManager'
import { keyboardMaestro } from '../../services/keyboardManager'
import { expandManager } from '../../services/expandManager'
import { transitionStore } from '../../services/transitionStore'
import { saveWatchProgress, saveEpisodeProgress, markEpisodeWatched } from '../../services/historyService'
import { Logger } from '../../services/LoggerService'

const ACCENT      = '#ff006e'
const OSD_TIMEOUT = 5000
const DEBUG_KEYS  = false  // ★ PRODUÇÃO: false

const KEYS = {
  UP: 38, DOWN: 40, LEFT: 37, RIGHT: 39,
  OK: 13, BACK: 10009,
  PLAY: 415, PAUSE: 19, PLAY_PAUSE: 10252, STOP: 413,
  FF: 417, RW: 412,
  CH_UP: 427, CH_DOWN: 428,
  VOL_UP: 447, VOL_DOWN: 448, MUTE: 449,
  INFO: 457, EXIT: 10182,
  RED: 403, GREEN: 404, YELLOW: 405, BLUE: 406,
} as const

const CTRL = { PLAY: 0, RW: 1, FF: 2, SETTINGS: 3 } as const
const CTRL_COUNT = 4

type PlayerStatus = 'loading' | 'playing' | 'paused' | 'error'
type FocusZone   = 'timeline' | 'controls' | 'qualities' | 'none'

interface State {
  status:     PlayerStatus
  error:      string | null
  osdVisible: boolean
  focusZone:  FocusZone
  ctrlFocus:  number
  qualityIdx: number
  slowWarning: boolean
  debugKeys:  Array<{ code: number; key: string }>
}

type Action =
  | { type: 'SET_STATUS';   status: PlayerStatus; error?: string }
  | { type: 'SET_OSD';      visible: boolean }
  | { type: 'SET_FOCUS';    zone: FocusZone; ctrl?: number }
  | { type: 'CTRL_MOVE';    dir: 'left' | 'right' }
  | { type: 'QUALITY_MOVE'; dir: 'up' | 'down'; max: number }
  | { type: 'TOGGLE_QUALITIES' }
  | { type: 'SLOW_WARNING'; show: boolean }
  | { type: 'DEBUG_KEY';    code: number; key: string }

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'SET_STATUS':   return { ...s, status: a.status, error: a.error ?? s.error, slowWarning: false }
    case 'SET_OSD':      return { ...s, osdVisible: a.visible }
    case 'SET_FOCUS':    return { ...s, focusZone: a.zone, ctrlFocus: a.ctrl ?? s.ctrlFocus }
    case 'CTRL_MOVE':    return { ...s, ctrlFocus: a.dir === 'left' ? Math.max(0, s.ctrlFocus - 1) : Math.min(CTRL_COUNT - 1, s.ctrlFocus + 1) }
    case 'QUALITY_MOVE': return { ...s, qualityIdx: a.dir === 'up' ? Math.max(0, s.qualityIdx - 1) : Math.min(a.max - 1, s.qualityIdx + 1) }
    case 'TOGGLE_QUALITIES': return { ...s, focusZone: s.focusZone === 'qualities' ? 'controls' : 'qualities' }
    case 'SLOW_WARNING': return { ...s, slowWarning: a.show }
    case 'DEBUG_KEY':    return { ...s, debugKeys: [{ code: a.code, key: a.key }, ...s.debugKeys.slice(0, 7)] }
    default: return s
  }
}

const INITIAL: State = {
  status: 'loading', error: null,
  osdVisible: true, focusZone: 'controls', ctrlFocus: CTRL.PLAY,
  qualityIdx: 0,
  slowWarning: false,
  debugKeys: [],
}

const RETRY_DELAYS = [1000, 3000, 5000, 8000, 12000]
const MAX_RETRIES  = RETRY_DELAYS.length
const SLOW_TIMEOUT = 16000

interface Props {
  channel:        Channel
  onBack:         () => void
  onNextChannel?: () => void
  onPrevChannel?: () => void
  onShakaReady?:  (player: any) => void
  onReady?:       () => void
}

function fmtMs(ms: number): string {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`
}

function maskStreamUrl(url: string): string {
  try {
    const u = new URL(url)
    return `${u.protocol}//${u.hostname}/***`
  } catch {
    const idx = url.indexOf('/', (url.indexOf('//') ?? -2) + 2)
    return idx > 0 ? url.substring(0, idx) + '/***' : url.substring(0, 60) + '...'
  }
}

function pickBestWatchStream(channel: Channel) {
  const fhd = channel.streams?.find(s =>
    s.quality === 'FHD' || s.label?.toUpperCase().includes('FHD')
  )
  const hd = channel.streams?.find(s =>
    s.quality === 'HD' || s.label?.toUpperCase().includes('HD')
  )
  return fhd || hd || channel.activeStream || channel.streams?.[0]
}

export default function PlayerScreen({ channel, onBack, onNextChannel, onPrevChannel, onShakaReady, onReady }: Props) {

  const [state, dispatch] = useReducer(reducer, INITIAL)
  const videoRef     = useRef<HTMLVideoElement>(null)
  const onBackRef    = useRef(onBack)
  const onNextRef    = useRef(onNextChannel)
  const onPrevRef    = useRef(onPrevChannel)
  onBackRef.current  = onBack
  onNextRef.current  = onNextChannel
  onPrevRef.current  = onPrevChannel

  const osdTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const slowTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stateRef      = useRef(state)
  stateRef.current    = state

  // ★ inFlightRef — impede callbacks AVPlay de dispararem após channel change/unmount
  const inFlightRef   = useRef(false)
  const retryCountRef = useRef(0)

  const [currentStream, setCurrentStream] = useState(() => pickBestWatchStream(channel))
  const [playPos, setPlayPos] = useState({ cur: 0, dur: 0 })
  
  useEffect(() => {
    setCurrentStream(pickBestWatchStream(channel))
  }, [channel])

  const streamUrl = currentStream?.url || (channel as any).url || ''
  const backend  = selectPlayerBackend(streamUrl)
  const isAVPlay = backend === 'avplay'

  // ─── Esconde TransitionOverlay imediatamente ao montar ────────────────────
  useEffect(() => {
    // Timeout de segurança: esconde overlay após 3s mesmo se player não responder
    const safetyTimer = setTimeout(() => transitionStore.hide(), 3000)
    return () => {
      clearTimeout(safetyTimer)
      transitionStore.hide()
    }
  }, [])
  const showOsd = useCallback(() => {
    dispatch({ type: 'SET_OSD', visible: true })
    if (osdTimerRef.current) clearTimeout(osdTimerRef.current)
    if (stateRef.current.status !== 'paused') {
      osdTimerRef.current = setTimeout(() => {
        dispatch({ type: 'SET_OSD', visible: false })
      }, OSD_TIMEOUT)
    }
  }, [])

  useEffect(() => {
    if (state.status === 'playing') {
      retryCountRef.current = 0
      dispatch({ type: 'SET_FOCUS', zone: 'controls', ctrl: CTRL.PLAY })
      showOsd()
      transitionStore.hide()
      onReady?.()
    }
    return () => { if (osdTimerRef.current) clearTimeout(osdTimerRef.current) }
  }, [state.status])

  // ─── Rastreamento de progresso (VOD apenas — live retorna duration 0) ───────
  useEffect(() => {
    if (state.status !== 'playing' || !isAVPlay) return
    const av = (window as any).webapis?.avplay
    if (!av) return

    let totalMs = 0
    try { totalMs = av.getDuration?.() || 0 } catch (_) {}
    // VOD: entre 1 min e 10h. Live streams retornam 0 ou > 10h.
    if (totalMs < 60000 || totalMs > 36000000) return

    // Detecta código do episódio na label da stream (ex: "S01E03")
    const epMatch = currentStream?.label?.match(/[Ss](\d+)[Ee](\d+)/)
    const epCode = epMatch
      ? `S${String(parseInt(epMatch[1])).padStart(2,'0')}E${String(parseInt(epMatch[2])).padStart(2,'0')}`
      : null

    const tick = setInterval(() => {
      try {
        const cur = av.getCurrentTime?.() || 0
        const pct = (cur / totalMs) * 100
        saveWatchProgress(channel.name, pct)
        if (epCode) {
          saveEpisodeProgress(channel.name, epCode, pct)
          if (pct > 90) markEpisodeWatched(channel.name, epCode)
        }
      } catch (_) {}
    }, 15000)

    return () => clearInterval(tick)
  }, [state.status, channel.name, isAVPlay, currentStream?.label])

  // ─── Poll AVPlay position para timeline real ───────────────────────────────
  useEffect(() => {
    if (state.status !== 'playing' || !isAVPlay) return
    const av = (window as any).webapis?.avplay
    if (!av) return
    const tick = setInterval(() => {
      try {
        setPlayPos({ cur: av.getCurrentTime?.() ?? 0, dur: av.getDuration?.() ?? 0 })
      } catch (_) {}
    }, 1000)
    return () => clearInterval(tick)
  }, [state.status, isAVPlay])

  // ─── Garante que o overlay não fica preso se o player for fechado ─────────
  useEffect(() => {
    return () => { transitionStore.hide() }
  }, [])

  // ─── Slow warning 12s ──────────────────────────────────────────────────────
  const startSlowTimer = useCallback(() => {
    if (slowTimerRef.current) clearTimeout(slowTimerRef.current)
    dispatch({ type: 'SLOW_WARNING', show: false })
    slowTimerRef.current = setTimeout(() => {
      if (stateRef.current.status === 'loading') {
        dispatch({ type: 'SLOW_WARNING', show: true })
      }
    }, SLOW_TIMEOUT)
  }, [])

  // ─── Retry handler ─────────────────────────────────────────────────────────
  const attemptRetry = useCallback((errorMsg: string) => {
    if (!inFlightRef.current) return
    const attempt = retryCountRef.current
    if (attempt >= MAX_RETRIES) {
      dispatch({ type: 'SET_STATUS', status: 'error', error: errorMsg })
      return
    }
    const delay = RETRY_DELAYS[attempt]
    retryCountRef.current = attempt + 1
    Logger.hw('RETRY', `Attempt ${attempt + 1}/${MAX_RETRIES} in ${delay}ms`)
    dispatch({ type: 'SET_STATUS', status: 'loading' })
    startSlowTimer()

    retryTimerRef.current = setTimeout(() => {
      if (!inFlightRef.current) return
      if (backend === 'avplay') {
        if (!isAVPlayAvailable()) { setTimeout(() => dispatch({ type: 'SET_STATUS', status: 'playing' }), 300); return }
        playerManager.requestFullscreenPlay(
          channel.name,
          streamUrl,
          () => { if (inFlightRef.current) dispatch({ type: 'SET_STATUS', status: 'playing' }) },
          (msg?: string) => { if (inFlightRef.current) attemptRetry(msg || 'Erro no player') }
        )
      } else {
        const video = videoRef.current
        if (!video) return
        destroyPlayer()
        initPlayer(video)
          .then(async (player: any) => {
            if (!inFlightRef.current) return
            onShakaReady?.(player)
            await loadStream(streamUrl)
            if (inFlightRef.current) dispatch({ type: 'SET_STATUS', status: 'playing' })
          })
          .catch((e: Error) => { if (inFlightRef.current) attemptRetry(e.message) })
      }
    }, delay)
  }, [streamUrl, backend, startSlowTimer])

  // ─── Retry manual (botão na tela de erro) ──────────────────────────────────
  const retryManual = useCallback(() => {
    retryCountRef.current = 0
    inFlightRef.current   = true
    attemptRetry(stateRef.current.error || 'Manual retry')
  }, [attemptRetry])

  // ─── Player lifecycle ──────────────────────────────────────────────────────
  useEffect(() => {
    inFlightRef.current   = true
    retryCountRef.current = 0
    dispatch({ type: 'SET_STATUS', status: 'loading' })
    startSlowTimer()

    if (backend === 'avplay') {
      if (!isAVPlayAvailable()) {
        setTimeout(() => { if (inFlightRef.current) dispatch({ type: 'SET_STATUS', status: 'playing' }) }, 300)
        return () => { inFlightRef.current = false; if (slowTimerRef.current) clearTimeout(slowTimerRef.current) }
      }

      // Se a instância já expandida (seamless) for do mesmo canal, ADOTA
      const isAdopted = expandManager.isSeamlessActive() && expandManager.getChannel()?.id === channel.id
      if (isAdopted) {
        if (inFlightRef.current) dispatch({ type: 'SET_STATUS', status: 'playing' })
      } else {
        // Usa PlayerManager unificado — adota preview se mesmo canal, ou toca do zero
        playerManager.requestFullscreenPlay(
          channel.name,
          streamUrl,
          () => { if (inFlightRef.current) dispatch({ type: 'SET_STATUS', status: 'playing' }) },
          (msg?: string) => { if (inFlightRef.current) attemptRetry(msg || 'Erro no player') }
        )
      }
      
      return () => {
        inFlightRef.current = false
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
        if (slowTimerRef.current)  clearTimeout(slowTimerRef.current)
        
        // Se formos devolver pro card num colapso seamless, NÃO MATE O PLAYER
        if (!expandManager.isSeamlessActive() || expandManager.getChannel()?.id !== channel.id) {
          avplayStop()
        }
      }
    }

    const video = videoRef.current
    if (!video) return
    initPlayer(video)
      .then(async (player: any) => {
        if (!inFlightRef.current) return
        onShakaReady?.(player)
        await loadStream(streamUrl)
        if (inFlightRef.current) dispatch({ type: 'SET_STATUS', status: 'playing' })
      })
      .catch((e: Error) => { if (inFlightRef.current) attemptRetry(e.message) })

    return () => {
      inFlightRef.current = false
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
      if (slowTimerRef.current)  clearTimeout(slowTimerRef.current)
      onShakaReady?.(null)
      destroyPlayer()
    }
  }, [streamUrl, backend])

  // ─── Teclado ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const avplay = (window as any).webapis?.avplay
    const tizen  = (window as any).tizen
    let lastT = 0

    const doToggle = () => {
      const s = stateRef.current
      if (s.status === 'playing') {
        try { avplay ? avplay.pause() : videoRef.current?.pause() } catch (_) {}
        dispatch({ type: 'SET_STATUS', status: 'paused' })
        if (osdTimerRef.current) clearTimeout(osdTimerRef.current)
        dispatch({ type: 'SET_OSD', visible: true })
      } else if (s.status === 'paused') {
        try { avplay ? avplay.play() : videoRef.current?.play() } catch (_) {}
        dispatch({ type: 'SET_STATUS', status: 'playing' })
        showOsd()
      }
    }

    const onKey = (e: KeyboardEvent) => {
      const now = Date.now()
      if (now - lastT < 100) return
      lastT = now
      if (DEBUG_KEYS) dispatch({ type: 'DEBUG_KEY', code: e.keyCode, key: e.key })
      showOsd()
      const s = stateRef.current
      switch (e.keyCode) {
        case KEYS.BACK: case 8:
          e.preventDefault()
          if (s.focusZone === 'qualities') dispatch({ type: 'TOGGLE_QUALITIES' })
          else onBackRef.current()
          return
        case KEYS.EXIT:                e.preventDefault(); try { tizen?.application?.getCurrentApplication().exit() } catch (_) {}; return
        case KEYS.CH_UP:               e.preventDefault(); onNextRef.current?.(); return
        case KEYS.CH_DOWN:             e.preventDefault(); onPrevRef.current?.(); return
        case KEYS.PLAY:                e.preventDefault(); try { avplay ? avplay.play()  : videoRef.current?.play()  } catch (_) {}; dispatch({ type: 'SET_STATUS', status: 'playing' }); return
        case KEYS.PAUSE:               e.preventDefault(); try { avplay ? avplay.pause() : videoRef.current?.pause() } catch (_) {}; dispatch({ type: 'SET_STATUS', status: 'paused' }); if (osdTimerRef.current) clearTimeout(osdTimerRef.current); dispatch({ type: 'SET_OSD', visible: true }); return
        case KEYS.PLAY_PAUSE: case KEYS.OK:
          e.preventDefault()
          if (s.osdVisible && s.focusZone === 'controls') {
            if (s.ctrlFocus === CTRL.SETTINGS) dispatch({ type: 'TOGGLE_QUALITIES' })
            else if (s.ctrlFocus === CTRL.RW)   { try { avplay?.jumpBackward(10000); videoRef.current && (videoRef.current.currentTime -= 10) } catch (_) {} }
            else if (s.ctrlFocus === CTRL.FF)   { try { avplay?.jumpForward(10000); videoRef.current && (videoRef.current.currentTime += 10) } catch (_) {} }
            else if (s.ctrlFocus === CTRL.PLAY) doToggle()
          } else if (s.osdVisible && s.focusZone === 'timeline') {
            // Em scrub mode via TIMELINE, se apertar OK a gente apenas pausa/play como conveniência
            doToggle()
          } else if (s.osdVisible && s.focusZone === 'qualities') {
            const selected = channel.streams[s.qualityIdx]
            if (selected && selected.url !== currentStream?.url) {
              setCurrentStream(selected)
              dispatch({ type: 'TOGGLE_QUALITIES' })
            } else {
              dispatch({ type: 'TOGGLE_QUALITIES' })
            }
          } else {
            dispatch({ type: 'SET_FOCUS', zone: 'controls', ctrl: CTRL.PLAY })
          }
          return
        case KEYS.FF: e.preventDefault(); try { avplay?.jumpForward(10000)  } catch (_) {}; return
        case KEYS.RW: e.preventDefault(); try { avplay?.jumpBackward(10000) } catch (_) {}; return
        case KEYS.DOWN:
          e.preventDefault()
          if (s.focusZone === 'qualities') dispatch({ type: 'QUALITY_MOVE', dir: 'down', max: (channel?.streams || []).length })
          else if (s.focusZone === 'timeline') dispatch({ type: 'SET_FOCUS', zone: 'controls' })
          else if (!s.osdVisible || s.focusZone === 'none') dispatch({ type: 'SET_FOCUS', zone: 'controls', ctrl: CTRL.PLAY })
          return
        case KEYS.UP:
          e.preventDefault()
          if (s.focusZone === 'qualities') dispatch({ type: 'QUALITY_MOVE', dir: 'up', max: (channel?.streams || []).length })
          else if (s.focusZone === 'controls') dispatch({ type: 'SET_FOCUS', zone: 'timeline' })
          else if (s.focusZone === 'timeline') dispatch({ type: 'TOGGLE_QUALITIES' })
          else if (!s.osdVisible || s.focusZone === 'none') {
            dispatch({ type: 'SET_OSD', visible: true })
            dispatch({ type: 'SET_FOCUS', zone: 'controls' })
          }
          return
        case KEYS.LEFT:
          e.preventDefault()
          if (s.focusZone === 'timeline') { try { avplay?.jumpBackward(10000); videoRef.current && (videoRef.current.currentTime -= 10) } catch (_) {} }
          else if (s.focusZone === 'controls') dispatch({ type: 'CTRL_MOVE', dir: 'left' })
          else dispatch({ type: 'SET_FOCUS', zone: 'controls', ctrl: CTRL.PLAY })
          return
        case KEYS.RIGHT:
          e.preventDefault()
          if (s.focusZone === 'timeline') { try { avplay?.jumpForward(10000); videoRef.current && (videoRef.current.currentTime += 10) } catch (_) {} }
          else if (s.focusZone === 'controls') dispatch({ type: 'CTRL_MOVE', dir: 'right' })
          else dispatch({ type: 'SET_FOCUS', zone: 'controls', ctrl: CTRL.PLAY })
          return
        case KEYS.INFO:
          e.preventDefault()
          dispatch({ type: 'SET_OSD', visible: !s.osdVisible })
          return
      }
    }
    keyboardMaestro.subscribe('player', onKey)
    return () => keyboardMaestro.unsubscribe('player')
  }, [])

  const { status, osdVisible, focusZone, ctrlFocus, slowWarning, debugKeys } = state

  const isLive = status !== 'playing'
    ? (!channel.tmdb && channel.mediaType !== 'movie' && channel.mediaType !== 'tv')
    : (playPos.dur === 0 || playPos.dur > 36_000_000)
  const progressPct = isLive ? 100 : (playPos.dur > 0 ? Math.min(100, (playPos.cur / playPos.dur) * 100) : 0)
  const timecodeLabel = isLive ? '● AO VIVO' : (status === 'playing' ? `${fmtMs(playPos.cur)} / ${fmtMs(playPos.dur)}` : '--:-- / --:--')

  return (
    <>
    {/* Container transparente — hole punch para AVPlay */}
    <div
      onClick={showOsd}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'transparent',
        color: '#fff',
        fontFamily: "'Outfit', 'Helvetica Neue', sans-serif",
        overflow: 'hidden',
      }}
    >
      {!isAVPlay && (
        <video
          ref={videoRef}
          id="shaka-player"
          autoPlay
          playsInline
          style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', display: 'block', zIndex: 1 }}
        />
      )}
    </div>

    {/* OSD via portal — renderizado direto no body, acima de tudo */}
    {createPortal(
      <>
      <div
        onClick={showOsd}
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          zIndex: 9990,
          pointerEvents: 'auto',
          color: '#fff',
          fontFamily: "'Outfit', 'Helvetica Neue', sans-serif",
        }}
      >
        {/* TOP BAR */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 160,
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.92) 0%, transparent 100%)',
          display: 'flex', alignItems: 'flex-start',
          padding: '32px 56px 0', gap: 20, zIndex: 11,
          transform: osdVisible ? 'translateY(0)' : 'translateY(-14px)',
          transition: 'opacity 350ms ease, transform 350ms ease',
        }}>
          <div style={{
            width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
            background: 'rgba(255,255,255,0.15)',
            border: '1px solid rgba(255,255,255,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22,
          }}>←</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.2, textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>
              {channel.name}
            </div>
            <div style={{ fontSize: 18, opacity: 0.55, marginTop: 4 }}>{channel.group}</div>
          </div>
          {isLive ? (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, alignSelf: 'center', flexShrink: 0,
              background: ACCENT, padding: '7px 18px', borderRadius: 6,
              fontSize: 18, fontWeight: 900, letterSpacing: 1.5,
            }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%', background: '#fff',
                animation: 'livePulse 1.5s ease-in-out infinite',
              }} />
              AO VIVO
            </div>
          ) : (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, alignSelf: 'center', flexShrink: 0,
              background: 'rgba(255,255,255,0.12)', padding: '7px 18px', borderRadius: 6,
              fontSize: 18, fontWeight: 700, letterSpacing: 1,
              border: '1px solid rgba(255,255,255,0.2)',
            }}>
              VOD
            </div>
          )}
        </div>

        {/* BOTTOM FLOATING PLAYER BAR (Estilo Screenshot) */}
        <div style={{
          position: 'absolute', bottom: 40, left: 56, right: 56, height: 130,
          background: 'rgba(20, 20, 24, 0.85)',
          border: `1px solid rgba(255, 0, 110, 0.4)`,
          borderRadius: 16,
          display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 32px', gap: 12,
          zIndex: 11,
          transform: osdVisible ? 'translateY(0)' : 'translateY(24px)',
          transition: 'opacity 350ms ease, transform 350ms ease',
          boxShadow: `0 12px 40px rgba(0,0,0,0.8), 0 0 25px rgba(255,0,110,0.25)`,
        }}>
          
          {/* ROW 1: TIMELINE */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 24, width: '100%', height: 40 }}>
            {/* Timeline Center */}
            <div 
              style={{ 
                flex: 1, height: '100%', display: 'flex', alignItems: 'center', position: 'relative',
                borderRadius: 8,
                outline: focusZone === 'timeline' ? `2px solid rgba(255,255,255,0.4)` : 'none',
                background: focusZone === 'timeline' ? 'rgba(255,0,110,0.1)' : 'transparent',
                padding: '0 16px',
                transition: 'all 200ms ease',
              }}
            >
              {/* Fundo da timeline */}
              <div style={{ width: '100%', height: 6, background: 'rgba(255,255,255,0.15)', borderRadius: 3, position: 'relative' }}>
                <div style={{
                  width: `${progressPct}%`, height: '100%', background: ACCENT, borderRadius: 3,
                  boxShadow: `0 0 16px ${ACCENT}`,
                  position: 'relative',
                  transition: 'width 800ms linear',
                }}>
                  {!isLive && (
                    <div style={{
                      position: 'absolute', right: -10, top: -7, width: 20, height: 20,
                      borderRadius: '50%', background: '#fff',
                      boxShadow: focusZone === 'timeline' ? `0 0 24px 6px ${ACCENT}` : `0 0 10px ${ACCENT}`,
                      transform: focusZone === 'timeline' ? 'scale(1.4)' : 'scale(1)',
                      transition: 'all 200ms ease'
                    }} />
                  )}
                </div>
              </div>
            </div>

            {/* Time code */}
            <div style={{ fontSize: 16, fontFamily: 'monospace', opacity: focusZone === 'timeline' ? 1 : 0.6, letterSpacing: 0.5, fontWeight: focusZone === 'timeline' ? 700 : 400, color: isLive ? ACCENT : (focusZone === 'timeline' ? '#fff' : '#aaa'), transition: 'all 200ms', whiteSpace: 'nowrap' }}>
              {timecodeLabel}
            </div>
          </div>

          {/* ROW 2: BUTTONS */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, width: '100%' }}>
            
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              {/* Play/Pause Toggle */}
              <div 
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 52, height: 52, borderRadius: '50%',
                  background: focusZone === 'controls' && ctrlFocus === CTRL.PLAY ? ACCENT : 'rgba(255,255,255,0.1)',
                  outline: focusZone === 'controls' && ctrlFocus === CTRL.PLAY ? `2px solid #fff` : 'none',
                  opacity: focusZone === 'controls' && ctrlFocus === CTRL.PLAY ? 1 : 0.6,
                  transform: focusZone === 'controls' && ctrlFocus === CTRL.PLAY ? 'scale(1.15)' : 'scale(1)',
                  transition: 'all 200ms ease',
                  boxShadow: focusZone === 'controls' && ctrlFocus === CTRL.PLAY ? `0 0 20px ${ACCENT}` : 'none',
                }}
              >
                {status === 'paused' ? (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 3 }}>
                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                  </svg>
                ) : (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="6" y="4" width="4" height="16"></rect>
                    <rect x="14" y="4" width="4" height="16"></rect>
                  </svg>
                )}
              </div>
              
              {/* Rewind */}
              <div 
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 48, height: 48, borderRadius: 8,
                  background: focusZone === 'controls' && ctrlFocus === CTRL.RW ? 'rgba(255,255,255,0.15)' : 'transparent',
                  outline: focusZone === 'controls' && ctrlFocus === CTRL.RW ? `2px solid ${ACCENT}` : 'none',
                  opacity: focusZone === 'controls' && ctrlFocus === CTRL.RW ? 1 : 0.6,
                  transform: focusZone === 'controls' && ctrlFocus === CTRL.RW ? 'scale(1.1)' : 'scale(1)',
                  transition: 'all 200ms ease'
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 19 2 12 11 5 11 19"></polygon>
                  <polygon points="22 19 13 12 22 5 22 19"></polygon>
                </svg>
              </div>

              {/* FastForward / Next */}
              <div 
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 48, height: 48, borderRadius: 8,
                  background: focusZone === 'controls' && ctrlFocus === CTRL.FF ? 'rgba(255,255,255,0.15)' : 'transparent',
                  outline: focusZone === 'controls' && ctrlFocus === CTRL.FF ? `2px solid ${ACCENT}` : 'none',
                  opacity: focusZone === 'controls' && ctrlFocus === CTRL.FF ? 1 : 0.6,
                  transform: focusZone === 'controls' && ctrlFocus === CTRL.FF ? 'scale(1.1)' : 'scale(1)',
                  transition: 'all 200ms ease'
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="13 19 22 12 13 5 13 19"></polygon>
                  <polygon points="2 19 11 12 2 5 2 19"></polygon>
                </svg>
              </div>
            </div>

            <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.2)', margin: '0 16px' }} />

            {/* Config/Logo SVG placeholder */}
            <div 
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 48, height: 48, borderRadius: 8,
                background: focusZone === 'controls' && ctrlFocus === CTRL.SETTINGS ? 'rgba(255,255,255,0.15)' : 'transparent',
                outline: focusZone === 'controls' && ctrlFocus === CTRL.SETTINGS ? `2px solid ${ACCENT}` : 'none',
                color: ACCENT,
                transform: focusZone === 'controls' && ctrlFocus === CTRL.SETTINGS ? 'scale(1.1)' : 'scale(1)',
                transition: 'all 200ms ease'
              }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 8px ${ACCENT})` }}>
                <path d="M12 2L15 8L21 9L16 14L18 21L12 17L6 21L8 14L3 9L9 8L12 2Z"></path>
              </svg>
            </div>
            
          </div>
        </div>
      </div>

      {/* QUALITIES MENU Overlay */}
      {osdVisible && focusZone === 'qualities' && (
        <div style={{
          position: 'absolute', right: 80, bottom: 140, zIndex: 100,
          background: 'rgba(0,0,0,0.85)', borderRadius: 16,
          border: '1px solid rgba(255,255,255,0.1)',
          padding: 24, minWidth: 320,
          display: 'flex', flexDirection: 'column', gap: 12,
          boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <div style={{ fontSize: 22, fontWeight: 700, opacity: 0.9, marginBottom: 8 }}>Qualidade</div>
          {(channel?.streams || []).map((stream, idx) => {
            const isFocused = state.qualityIdx === idx
            const isCurrent = stream === currentStream
            return (
              <div key={idx} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '16px 20px', borderRadius: 8,
                background: isFocused ? 'rgba(255,255,255,0.15)' : 'transparent',
                border: isFocused ? '2px solid white' : '2px solid transparent',
                transition: 'all 150ms',
                transform: isFocused ? 'scale(1.02)' : 'scale(1)',
                boxShadow: isFocused ? '0 0 15px rgba(255,255,255,0.2)' : 'none'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {isCurrent && <div style={{ width: 8, height: 8, borderRadius: '50%', background: ACCENT }} />}
                  <span style={{ fontSize: 22, fontWeight: isFocused ? 700 : 500, color: isFocused ? '#fff' : 'rgba(255,255,255,0.6)' }}>
                    {stream.label}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* LOADING — spinner + slow warning */}
      {status === 'loading' && (
        <div style={{
          position: 'absolute', top: 0, left: 0, bottom: 0, right: 0, zIndex: 5,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 20,
          background: 'transparent',
        }}>
          <div style={{
            width: 60, height: 60, borderRadius: '50%',
            border: '4px solid rgba(255,255,255,0.15)',
            borderTop: `4px solid ${ACCENT}`,
            animation: 'spin 0.8s linear infinite',
          }} />
          <div style={{ fontSize: 20, opacity: 0.7 }}>Conectando...</div>
          {slowWarning && (
            <div style={{
              marginTop: 12, fontSize: 18, color: '#fbbf24',
              background: 'rgba(251,191,36,0.1)',
              border: '1px solid rgba(251,191,36,0.3)',
              borderRadius: 8, padding: '10px 24px', textAlign: 'center',
            }}>
              ⏳ Demorando mais que o esperado...
            </div>
          )}
        </div>
      )}

      {/* ERRO — com botão tentar novamente */}
      {status === 'error' && (
        <div style={{
          position: 'absolute', top: 0, left: 0, bottom: 0, right: 0, zIndex: 20,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.92)', gap: 20,
        }}>
          <div style={{ fontSize: 60 }}>❌</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#ff6b6b' }}>
            {state.error ?? 'Erro ao carregar stream'}
          </div>
          <div style={{ fontSize: 18, opacity: 0.45, maxWidth: 800, textAlign: 'center' }}>
            {maskStreamUrl(streamUrl)}
          </div>
          <div style={{ fontSize: 18, opacity: 0.5, marginTop: 4 }}>
            Todas as {MAX_RETRIES} tentativas falharam
          </div>
          <div style={{ display: 'flex', gap: 20, marginTop: 24 }}>
            <div
              onClick={retryManual}
              style={{
                background: ACCENT, padding: '16px 48px', borderRadius: 8,
                fontSize: 20, fontWeight: 700, cursor: 'pointer',
              }}
            >
              🔄 Tentar Novamente
            </div>
            <div
              onClick={() => onBackRef.current()}
              style={{
                background: 'rgba(255,255,255,0.12)', padding: '16px 48px', borderRadius: 8,
                fontSize: 20, fontWeight: 700, cursor: 'pointer',
              }}
            >
              ← Voltar
            </div>
          </div>
          <div style={{ fontSize: 18, opacity: 0.35, marginTop: 8 }}>
            Pressione BACK para voltar
          </div>
        </div>
      )}

      {/* DEBUG HUD — apenas quando DEBUG_KEYS = true */}
      {DEBUG_KEYS && (
        <div style={{
          position: 'absolute', top: 24, right: 32, zIndex: 9999,
          background: 'rgba(0,0,0,0.88)', border: '2px solid rgba(255,220,0,0.6)',
          borderRadius: 12, padding: '14px 20px', minWidth: 250,
        }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: '#ffd700', marginBottom: 10 }}>🔍 DEBUG KEYS</div>
          {debugKeys.length === 0
            ? <div style={{ fontSize: 18, opacity: 0.45 }}>aperte qualquer botão...</div>
            : debugKeys.map((k, i) => (
              <div key={i} style={{ fontSize: 18, opacity: i === 0 ? 1 : 0.35, fontFamily: 'monospace', lineHeight: 1.8 }}>
                <b style={{ color: '#00ff88' }}>{k.code}</b>
                {k.key && k.key !== 'Unidentified' && <span style={{ color: '#88ccff', marginLeft: 8 }}>({k.key})</span>}
              </div>
            ))
          }
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes livePulse { 0%,100% { opacity:1; } 50% { opacity:0.25; } }
        * { scrollbar-width: none; }
        *::-webkit-scrollbar { display: none; }
      `}</style>
      </>,
      document.body
    )}
    </>
  )
}
