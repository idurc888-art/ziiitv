import React from 'react'
import type { Channel } from '../../types/channel'
import { QUALITY_BADGE_COLOR } from '../../types/channel'

interface Props {
  channel: Channel
  btnFocus: number
  accent: string
  glow: string
  onClose: () => void
  onPlay: (ch: Channel) => void
}

export default function DetailOverlay({ channel, btnFocus, accent, glow, onClose, onPlay }: Props) {
  const tmdb = channel.tmdb

  return (
    <div style={{
      position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 500,
      background: 'rgba(0,0,0,0.88)',
      display: 'flex', alignItems: 'center',
      animation: 'fadeInDetail 180ms ease-out',
    }}>
      {(tmdb?.backdropFull || tmdb?.backdrop) && (
        <img src={tmdb?.backdropFull || tmdb?.backdrop} style={{
          position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
          width: '100%', height: '100%',
          objectFit: 'cover', opacity: 0.18, zIndex: 0,
          filter: 'blur(12px)', transform: 'scale(1.05)',
        }} />
      )}

      <div style={{
        position: 'relative', zIndex: 1,
        display: 'flex', alignItems: 'center',
        padding: '0 140px', gap: 80, width: '100%',
      }}>
        <img
          src={tmdb?.posterFull || tmdb?.poster || channel.logo || undefined}
          style={{
            width: 300, height: 450, objectFit: 'cover', flexShrink: 0,
            borderRadius: 14,
            boxShadow: '0 32px 80px rgba(0,0,0,0.85)',
          }}
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
        />

        <div style={{ flex: 1, color: '#fff', maxWidth: 1100 }}>
          <div style={{
            fontSize: 52, fontWeight: 900, lineHeight: 1.1, marginBottom: 20,
            textShadow: '0 4px 16px rgba(0,0,0,0.6)',
            fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
          }}>
            {tmdb?.title || channel.name}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 22, fontSize: 22, color: 'rgba(255,255,255,0.65)' }}>
            {tmdb?.year && <span style={{ fontWeight: 600 }}>{tmdb.year}</span>}
            {(tmdb?.rating ?? 0) > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: '#fbbf24' }}>★</span>
                {tmdb!.rating.toFixed(1)}
              </span>
            )}
            <span style={{
              background: QUALITY_BADGE_COLOR[channel.activeStream.quality],
              color: '#fff', fontSize: 15, fontWeight: 800,
              padding: '3px 12px', borderRadius: 5, letterSpacing: 0.5,
            }}>
              {channel.activeStream.quality}
            </span>
          </div>

          {(tmdb?.genres?.length ?? 0) > 0 && (
            <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
              {tmdb!.genres!.slice(0, 4).map(g => (
                <span key={g} style={{
                  background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.85)',
                  fontSize: 18, padding: '5px 16px', borderRadius: 20,
                  border: '1px solid rgba(255,255,255,0.15)',
                }}>{g}</span>
              ))}
            </div>
          )}

          {tmdb?.overview && (
            <div style={{
              fontSize: 21, lineHeight: 1.65, color: 'rgba(255,255,255,0.8)',
              marginBottom: 48,
              display: '-webkit-box' as any,
              WebkitLineClamp: 4,
              WebkitBoxOrient: 'vertical' as any,
              overflow: 'hidden',
            }}>
              {tmdb.overview}
            </div>
          )}

          <div style={{ display: 'flex', gap: 20 }}>
            {[
              { label: '▶  Assistir', idx: 0, primary: true },
              { label: '← Fechar',    idx: 1, primary: false },
            ].map(({ label, idx, primary }) => {
              const focused = btnFocus === idx
              return (
                <div
                  key={idx}
                  onClick={() => { idx === 0 ? onPlay(channel) : onClose() }}
                  style={{
                    padding: '18px 52px', borderRadius: 8,
                    fontSize: 22, fontWeight: 700, cursor: 'pointer',
                    background: focused
                      ? (primary ? accent : 'rgba(255,255,255,0.22)')
                      : (primary ? 'rgba(229,9,20,0.25)' : 'rgba(255,255,255,0.07)'),
                    border: `2px solid ${focused ? (primary ? accent : 'rgba(255,255,255,0.55)') : 'rgba(255,255,255,0.18)'}`,
                    color: '#fff',
                    transform: focused ? 'scale(1.06)' : 'scale(1)',
                    transition: 'all 150ms ease',
                    boxShadow: focused && primary ? `0 0 36px ${glow}` : 'none',
                  }}
                >{label}</div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
