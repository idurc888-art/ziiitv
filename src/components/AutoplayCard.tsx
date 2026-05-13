import React, { useRef, useState, useEffect } from 'react'
import { useCardAutoplay } from '../hooks/useCardAutoplay'
import { useSeamlessExpand } from '../hooks/useSeamlessExpand'
import type { Channel } from '../types/channel'
import { playerManager } from '../services/PlayerManager'

interface Props {
  channel: Channel
  isFocused: boolean
  onClick?: () => void
  width: number
  height: number
  left: number
  top: number
  zIndex: number
  borderRadius: number
  focusBorder: string
  backdropSrc: string | null
  children?: React.ReactNode
  watchProgress?: number            // 1-98: barra de progresso salva
  onPlayingChange?: (playing: boolean) => void  // cinema mode
  navDir?: 'left' | 'right' | 'up' | 'down'
}

const FOCUS_DURATION = 300
const FOCUS_EASING = 'cubic-bezier(0.4, 0, 0.2, 1)'

export default function AutoplayCard({
  channel, isFocused, onClick,
  width, height, left, top, zIndex,
  borderRadius, focusBorder, backdropSrc, children,
  watchProgress = 0, onPlayingChange, navDir = 'right',
}: Props) {

  const cardRef = useRef<HTMLDivElement>(null)

  const { thumbnailOpacity, playState, cancelling } = useCardAutoplay({
    cardId: channel.id,
    channelName: channel.name,
    streams: channel.streams || [],
    focused: isFocused,
    // VOD = tem tmdb OU url é .mp4 OU mediaType é movie/tv
    isVOD: !!channel.tmdb || channel.mediaType === 'movie' || channel.mediaType === 'tv'
      || (channel.activeStream?.url || '').includes('/movie/'),
    cardRef,
    onStateChange: (s) => { onPlayingChange?.(s.playState === 'playing') },
    onAutoExpand: () => {
      // Após 1min de preview → fullscreen automático
      if (cardRef.current && isFocused) {
        expand(channel, cardRef.current)
      }
    },
  })

  const isPlaying = playState === 'playing'
  const isPreparing = playState === 'loading' || playState === 'buffering'

  // ── Transição suave: guarda src anterior para fade-out antes do re-mount ──
  const [displaySrc, setDisplaySrc] = useState(backdropSrc)
  const [imgKey, setImgKey] = useState(`${channel.id}-${navDir}`)

  useEffect(() => {
    if (backdropSrc === displaySrc) return
    setDisplaySrc(backdropSrc)
    setImgKey(`${channel.id}-${navDir}-${Date.now()}`)
  }, [backdropSrc, channel.id, navDir]) // eslint-disable-line react-hooks/exhaustive-deps

  // Para o SeamlessExpand, usamos o ID global injetado pelo PlayerManager
  const { expand } = useSeamlessExpand({ 
    cardId: channel.id, 
    objectId: playerManager.getGlobalObjectId() 
  })

  // NOTA: O listener de Enter foi REMOVIDO daqui.
  // O controle do D-pad é 100% centralizado via keyboardMaestro (Vanilla JS puro).
  // Zero listeners React duplicados = Zero Input Lag.

  // Expõe handleAction via ref para que o HomeScreen possa invocar a expansão
  const handleAction = () => {
    if (onClick) onClick()
    if (cardRef.current && isFocused) {
      expand(channel, cardRef.current)
    }
  }

  return (
    <div
      ref={cardRef}
      onClick={handleAction}
      style={{
        position: 'absolute',
        left, top,
        width, height, zIndex,
        // Sem borderRadius no wrapper — a máscara interna controla o clip
        borderRadius: 0,
        cursor: 'pointer',
        // overflow: visible para o outline e os children (badges/botões) não serem cortados
        overflow: 'visible',
        outline: isFocused ? focusBorder : '2px solid transparent',
        outlineOffset: '0px',
        border: 'none',
        opacity: isFocused ? 1 : 0,
        pointerEvents: isFocused ? 'auto' : 'none',
        transition: `opacity ${FOCUS_DURATION}ms ${FOCUS_EASING}`,
        boxShadow: 'none',
        transform: 'none',
      }}
    >
      {/* ══ MÁSCARA ÚNICA ══════════════════════════════════════════════════
          Tudo que é visual fica AQUI DENTRO.
          overflow:hidden + borderRadius:0 = máscara quadrada travada.
          10px de inset = margem interna uniforme.
          Nenhuma transição de thumbnail/vídeo escapa desta caixa.
      ══════════════════════════════════════════════════════════════════════ */}
      <div style={{
        position: 'absolute',
        top: 10, left: 10, right: 10, bottom: 10,
        borderRadius: borderRadius,
        overflow: 'hidden',       // ← o clipe acontece AQUI, numa só camada
        zIndex: 1,
      }}>
        {/* Fundo hole-punch para AVPlay (Tizen) */}
        <div
          id="autoplay-punch-hole"
          style={{
            position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
            backgroundColor: thumbnailOpacity < 1 ? 'transparent' : 'rgba(10,10,15,1)',
            transition: 'background-color 600ms ease',
            zIndex: 0,
          }}
        />

        {/* Thumbnail — imagem de poster/backdrop */}
        <img
          id="autoplay-punch-img"
          key={imgKey}
          src={displaySrc || undefined}
          style={{
            position: 'absolute', left: '-4%', top: '-4%',
            width: '108%', height: '108%',
            objectFit: 'cover',
            objectPosition: 'center top',
            display: 'block',
            opacity: thumbnailOpacity,
            visibility: thumbnailOpacity === 0 ? 'hidden' : 'visible',
            transform: isPreparing ? 'scale(1.08)' : 'scale(1.0)',
            transition: isPreparing
              ? 'transform 6s linear, opacity 600ms ease-out'
              : 'opacity 600ms ease-out',
            animation: `slotEnter-${navDir} 400ms cubic-bezier(0.16, 1, 0.3, 1) both`,
            zIndex: 1,
          }}
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
        />

        {/* Gradientes de legibilidade */}
        <div style={{
          position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
          backgroundImage: isPlaying
            ? 'linear-gradient(to top, rgba(0,0,0,0.98) 0%, rgba(0,0,0,0.6) 40%, rgba(0,0,0,0) 80%), linear-gradient(to right, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0) 100%)'
            : 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.5) 40%, rgba(0,0,0,0) 80%), linear-gradient(to right, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0) 100%)',
          zIndex: 2,
          transition: 'opacity 300ms ease',
          pointerEvents: 'none',
        }} />

        {/* Barra de progresso — linha fina no rodapé */}
        {watchProgress > 0 && (
          <div style={{
            position: 'absolute', bottom: 0, left: 0,
            width: '100%', height: 3,
            background: 'rgba(255,255,255,0.2)', zIndex: 3,
          }}>
            <div style={{
              height: '100%', width: `${watchProgress}%`,
              background: '#E50914', borderRadius: '0 2px 0 0',
            }} />
          </div>
        )}
      </div>

      {/* Flash Shield — cobre tela toda ao cancelar AVPlay (fora da máscara).
          zIndex 9997: abaixo do TransitionOverlay (9998) para que a transição
          de play apareça por cima do shield quando ambos estão ativos. */}
      <div style={{
        position: 'fixed',
        top: 0, right: 0, bottom: 0, left: 0,
        background: '#000',
        zIndex: 9997,
        pointerEvents: 'none',
        opacity: cancelling ? 1 : 0,
        transition: cancelling ? 'none' : 'opacity 220ms ease-out',
      }} />

      {/* Camada de filhos — badges, botões, textos. Overflow visible, nunca clipado */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 30, pointerEvents: 'none', overflow: 'visible',
      }}>
        {children}
      </div>
    </div>
  )
}
