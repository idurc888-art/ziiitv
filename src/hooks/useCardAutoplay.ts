/**
 * useCardAutoplay — Hook para gatilhos de PlayerManager
 */

import { useEffect, useRef, useCallback, useState } from 'react'
import { playerManager } from '../services/PlayerManager'
import type { Stream, StreamQuality } from '../types/channel'

export type CardPlayState = 'idle' | 'loading' | 'buffering' | 'playing' | 'error'

export interface CardAutoplayState {
  playState: CardPlayState
  thumbnailOpacity: number
  videoOpacity: number
}

interface UseCardAutoplayOptions {
  cardId: string
  channelName: string
  streams: Stream[]
  focused: boolean
  isVOD: boolean
  cardRef: React.RefObject<HTMLElement | null>
  onStateChange?: (state: CardAutoplayState) => void
  onAutoExpand?: () => void
}

// Preview: prefere HD — sweet spot entre qualidade e velocidade de buffering
// Evita SD (ruim na TV) e 4K (lento para preview)
const PREVIEW_WEIGHT: Record<StreamQuality, number> = {
  'HD': 1, 'FHD': 2, 'SD': 3, '4K': 4, 'UNKNOWN': 5
}

// Fullscreen: melhor qualidade disponível (4K > FHD > HD > SD)
const FULLSCREEN_WEIGHT: Record<StreamQuality, number> = {
  '4K': 1, 'FHD': 2, 'HD': 3, 'SD': 4, 'UNKNOWN': 5
}

function pickPreviewStream(streams: Stream[]): Stream | null {
  if (!streams?.length) return null
  return [...streams].sort((a, b) =>
    (PREVIEW_WEIGHT[a.quality] ?? 5) - (PREVIEW_WEIGHT[b.quality] ?? 5)
  )[0]
}

function pickBestStream(streams: Stream[]): Stream | null {
  if (!streams?.length) return null
  return [...streams].sort((a, b) =>
    (FULLSCREEN_WEIGHT[a.quality] ?? 5) - (FULLSCREEN_WEIGHT[b.quality] ?? 5)
  )[0]
}

// INSET: margem interna do vídeo cancelada (0) para alinhar perfeitamente
// com o thumbnail de imagem (pediu: "tem que ficar exatamente igual").
const RECT_INSET = 0

function getCardRect(el: HTMLElement): { x: number; y: number; w: number; h: number } {
  const rect = el.getBoundingClientRect()
  return {
    x: Math.round(rect.left + RECT_INSET),
    y: Math.round(rect.top + RECT_INSET),
    w: Math.round(rect.width - RECT_INSET * 2),
    h: Math.round(rect.height - RECT_INSET * 2),
  }
}

export function useCardAutoplay({
  cardId,
  channelName,
  streams,
  focused,
  isVOD,
  cardRef,
  onStateChange,
  onAutoExpand,
}: UseCardAutoplayOptions): CardAutoplayState & { cancelling: boolean } {

  const IDLE: CardAutoplayState = { playState: 'idle', thumbnailOpacity: 1, videoOpacity: 0 }
  const [state, setReactState] = useState<CardAutoplayState>(IDLE)
  const [cancelling, setCancelling] = useState(false)
  const [restartTick, setRestartTick] = useState(0)
  const stateRef = useRef<CardAutoplayState>(IDLE)
  const mountedRef = useRef(true)
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reinicia preview quando player fullscreen fecha.
  // Se o player já está tocando no card (retorno via expand/collapse), não reinicia.
  useEffect(() => {
    if (!focused) return
    const handler = () => {
      if (playerManager.isPlaying()) return
      setRestartTick(t => t + 1)
    }
    window.addEventListener('ziiiTV:playerClosed', handler)
    return () => window.removeEventListener('ziiiTV:playerClosed', handler)
  }, [focused])

  const setState = useCallback((next: CardAutoplayState) => {
    if (stateRef.current.playState === next.playState &&
        stateRef.current.thumbnailOpacity === next.thumbnailOpacity &&
        stateRef.current.videoOpacity === next.videoOpacity) return
    stateRef.current = next
    setReactState(next)
    onStateChange?.(next)
  }, [onStateChange])

  const resetVisuals = () => {
    const hole = document.getElementById('autoplay-punch-hole')
    if (hole) hole.style.backgroundColor = '#000'
    const img = document.getElementById('autoplay-punch-img')
    if (img) { img.style.opacity = '1'; img.style.visibility = 'visible' }
  }

  useEffect(() => {
    if (previewTimerRef.current) { clearTimeout(previewTimerRef.current); previewTimerRef.current = null }

    if (!focused) {
      playerManager.cancelRequest()
      resetVisuals()
      setState(IDLE)
      return
    }

    playerManager.cancelRequest()
    resetVisuals()
    setState(IDLE)

    const previewStream = pickPreviewStream(streams)
    if (!previewStream) return
    const mainStream = pickBestStream(streams) || previewStream

    if (!playerManager.isAvailable()) {
      const timer = setTimeout(() => {
        if (mountedRef.current)
          setState({ playState: 'playing', thumbnailOpacity: 0, videoOpacity: 1 })
      }, 800)
      return () => clearTimeout(timer)
    }

    const getRectFn = () => cardRef.current
      ? getCardRect(cardRef.current)
      : { x: 0, y: 0, w: 1920, h: 1080 }

    // PlayerManager tem debounce interno de 800ms — getRectFn é chamada lá dentro,
    // bem após a animação do card terminar. Não há necessidade de delay adicional aqui.
    playerManager.requestPlay(channelName, previewStream.url, mainStream.url, getRectFn, {
      onLoading: () => {
        if (mountedRef.current)
          setState({ playState: 'loading', thumbnailOpacity: 1, videoOpacity: 0 })
      },
      onPlaying: () => {
        if (!mountedRef.current) return
        setState({ playState: 'playing', thumbnailOpacity: 1, videoOpacity: 1 })
        if (previewTimerRef.current) clearTimeout(previewTimerRef.current)
        previewTimerRef.current = setTimeout(() => {
          if (!mountedRef.current || stateRef.current.playState !== 'playing') return
          onAutoExpand?.()
        }, 60 * 1000)
      },
      onFirstFrameRendered: () => {
        if (!mountedRef.current) return
        setTimeout(() => {
          if (mountedRef.current)
            setState({ playState: 'playing', thumbnailOpacity: 0, videoOpacity: 1 })
        }, 500)
      },
      onError: () => {
        if (mountedRef.current)
          setState({ playState: 'error', thumbnailOpacity: 1, videoOpacity: 0 })
      },
      onCancelling: () => {
        if (!mountedRef.current) return
        setCancelling(true)
        setTimeout(() => { if (mountedRef.current) setCancelling(false) }, 200)
      },
    })

    return () => {
      playerManager.cancelRequest()
      if (previewTimerRef.current) { clearTimeout(previewTimerRef.current); previewTimerRef.current = null }
    }
  }, [focused, cardId, restartTick]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      mountedRef.current = false
      playerManager.cancelRequest()
    }
  }, [])

  return { ...state, cancelling }
}
