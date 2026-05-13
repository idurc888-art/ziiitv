import React from 'react'
import type { Channel } from '../types/channel'

interface Props {
  ci: number
  ch: Channel
  offset: number
  translateX: number
  topOffset: number
  width: number
  height: number
  borderRadius: number
  border: string
  isFocused: boolean
  isUnderCenter: boolean
  posterSrc: string
  onPlay: (ch: Channel) => void
  progressPct?: number
  lastEpisode?: string
  navDir?: 'left' | 'right' | 'up' | 'down'
  moveCount?: number
}

const SideCard = React.memo<Props>(
  function SideCard({ ch, offset, translateX, topOffset, width, height, borderRadius, border, isFocused, isUnderCenter, posterSrc, onPlay, progressPct = 0, lastEpisode, navDir = 'right', moveCount = 0 }) {
    const isFarEdge = offset <= -4 || offset >= 4
    const isEdge    = offset <= -4 || offset >= 5

    if (ch.isViewAll) {
      return (
        <div onClick={() => onPlay(ch)} style={{
          position: 'absolute', top: topOffset, width, height, zIndex: isUnderCenter ? 0 : 1,
          borderRadius, cursor: 'pointer', overflow: 'hidden',
          border, background: 'rgba(255,255,255,0.05)',
          transform: `translate3d(${translateX}px, 0px, 0px)`,
          opacity: isFocused ? 1 : 0.6,
          transition: isFocused && !isEdge ? 'transform 380ms cubic-bezier(0.25, 0.46, 0.45, 0.94)' : 'none',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16,
          outline: isUnderCenter ? '2px solid rgba(255,255,255,0.4)' : 'none',
        }}>
          <div style={{ fontSize: 48, opacity: 0.7 }}>▶</div>
          <div style={{
            fontSize: 18, fontWeight: 700, color: 'rgba(255,255,255,0.85)',
            textAlign: 'center', padding: '0 16px', lineHeight: 1.3,
          }}>Ver lista<br />inteira</div>
        </div>
      )
    }

    const isVertical = navDir === 'up' || navDir === 'down'
    const stagger = Math.max(0, (3 - Math.abs(offset)) * 60)

    return (
      <div onClick={() => onPlay(ch)} style={{
        position: 'absolute',
        top: topOffset,
        width, height,
        zIndex: isUnderCenter ? 0 : 1,
        borderRadius,
        cursor: 'pointer', overflow: 'hidden',
        border,
        background: '#111',
        transform: `translate3d(${translateX}px, 0px, 0px)`,
        opacity: isFocused ? 1 : 0.6,
        visibility: 'visible',
        transition: (isEdge || isVertical) ? 'none' : `transform ${moveCount > 2 ? 150 : 280}ms cubic-bezier(0.2, 0, 0, 1)`,
        willChange: 'transform',
        WebkitBackfaceVisibility: 'hidden' as any,
        animation: 'none',
      }}>
        <img
          key={`${ch.id}-${navDir}`}
          src={isFarEdge ? undefined : (posterSrc || undefined)}
          style={{
            position: 'absolute', left: '-4%', top: '-4%',
            width: '108%', height: '108%', objectFit: 'cover',
            zIndex: 1, display: isFarEdge ? 'none' : 'block',
            animation: isFocused ? `slotEnter-${navDir} 280ms cubic-bezier(0.25, 0.46, 0.45, 0.94) ${stagger}ms both` : 'none',
          }}
          loading="lazy"
          decoding="async"
        />

        {!isFarEdge && (offset < 0 || (!isFocused && offset >= 0)) && (
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.80)',
            zIndex: 2, pointerEvents: 'none',
          }} />
        )}

        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: '55%',
          background: 'linear-gradient(transparent, rgba(0,0,0,0.92))',
          zIndex: 3,
        }} />

        {!isFarEdge && (
          <div style={{
            position: 'absolute', bottom: progressPct > 0 ? 18 : 12,
            left: 10, right: 10,
            zIndex: 4, pointerEvents: 'none',
          }}>
            <div style={{
              fontSize: 13, fontWeight: 600,
              color: 'rgba(255,255,255,0.92)',
              fontFamily: '"Outfit", sans-serif',
              letterSpacing: 0.3,
              textShadow: '0 1px 6px rgba(0,0,0,0.9)',
              overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
              textAlign: 'center',
            }}>
              {ch.tmdb?.title || ch.name.replace(/[\[\]\{\}\(\)]/g, '').trim()}
            </div>
            {lastEpisode ? (
              <div style={{
                fontSize: 11, fontWeight: 700,
                color: '#E50914',
                fontFamily: '"Outfit", sans-serif',
                textAlign: 'center', marginTop: 3,
                letterSpacing: 0.4,
              }}>{lastEpisode} · Continuar</div>
            ) : ch.tmdb?.year && (
              <div style={{
                fontSize: 11, fontWeight: 400,
                color: 'rgba(255,255,255,0.45)',
                fontFamily: '"Outfit", sans-serif',
                textAlign: 'center', marginTop: 2,
              }}>{ch.tmdb.year}</div>
            )}
          </div>
        )}

        {progressPct > 0 && (
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: 4,
            background: 'rgba(255,255,255,0.18)', zIndex: 5,
          }}>
            <div style={{
              height: '100%', width: '100%',
              transform: `scaleX(${progressPct / 100})`,
              transformOrigin: 'left',
              background: '#E50914',
              borderRadius: '0 2px 0 0',
            }} />
          </div>
        )}
      </div>
    )
  },
  (prev, next) =>
    prev.ch.id      === next.ch.id      &&
    prev.translateX === next.translateX &&
    prev.topOffset  === next.topOffset  &&
    prev.isFocused  === next.isFocused  &&
    prev.isUnderCenter === next.isUnderCenter &&
    prev.progressPct   === next.progressPct   &&
    prev.lastEpisode   === next.lastEpisode   &&
    prev.navDir        === next.navDir        &&
    prev.moveCount     === next.moveCount     &&
    prev.posterSrc     === next.posterSrc
)

export default SideCard
