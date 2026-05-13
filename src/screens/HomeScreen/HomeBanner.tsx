import React from 'react'
import type { HeroSlide } from '../../components/HeroBanner'
import type { Channel } from '../../types/channel'
import type { FocusZone } from './homeTypes'

interface Props {
  slide: HeroSlide
  focusZone: FocusZone
  accent: string
  glow: string
  onPlay: (ch: Channel) => void
}

export default function HomeBanner({ slide, focusZone, accent, glow, onPlay }: Props) {
  return (
    <div style={{
      position: 'absolute',
      top: 0, left: 0, right: 0, bottom: 0,
      overflow: 'hidden',
      zIndex: 10,
      opacity: focusZone === 'content' ? 0 : 1,
      visibility: focusZone === 'content' ? 'hidden' : 'visible',
      transform: focusZone === 'content' ? 'translateY(-20%)' : 'translateY(0)',
      willChange: 'opacity, transform',
      transition: 'opacity 400ms ease-out, transform 400ms ease-out, visibility 400ms step-end',
      pointerEvents: focusZone === 'hero' ? 'auto' : 'none',
      border: focusZone === 'hero' ? '2px solid #ff006e' : '2px solid transparent',
      background: (window as any).tizen ? 'transparent' : '#0a0a12',
    }}>
      {/* Backdrop */}
      <img
        src={slide.backgroundImage}
        style={{
          position: 'absolute', top: 0, left: 0,
          width: '100%', height: '100%',
          objectFit: 'cover', objectPosition: 'center top',
          zIndex: 1,
        }}
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
      />

      {/* Gradientes */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 2, pointerEvents: 'none',
        background: [
          'linear-gradient(to right, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0.05) 100%)',
          'linear-gradient(to top, rgba(0,0,0,0.95) 0%, transparent 55%)',
        ].join(', '),
      }} />

      {/* Conteúdo */}
      <div style={{
        position: 'absolute',
        bottom: 160, left: 206,
        zIndex: 3,
        maxWidth: '40%',
        animation: 'fadeInHero 600ms cubic-bezier(0.22,1,0.36,1) 200ms both',
      }}>
        {slide.badge && (
          <div style={{
            display: 'inline-block',
            background: accent,
            color: '#fff',
            fontSize: 12, fontWeight: 800,
            letterSpacing: 3, textTransform: 'uppercase',
            padding: '5px 14px', borderRadius: 4,
            marginBottom: 22,
            fontFamily: '"Inter", sans-serif',
            boxShadow: `0 4px 20px ${glow}`,
          }}>{slide.badge}</div>
        )}

        <div style={{
          fontSize: 67, fontWeight: 900,
          lineHeight: 0.95,
          color: '#fff',
          fontFamily: '"Barlow Condensed", "Inter", sans-serif',
          letterSpacing: -0.5,
          textShadow: '0 4px 24px rgba(0,0,0,0.9)',
          marginBottom: 10,
        }}>{slide.title}</div>

        {slide.subtitle && (
          <div style={{
            fontSize: 16, fontWeight: 700,
            color: 'rgba(255,255,255,0.55)',
            fontFamily: '"Inter", sans-serif',
            letterSpacing: 4, textTransform: 'uppercase',
            marginBottom: 14,
          }}>{slide.subtitle}</div>
        )}

        <div style={{
          fontSize: 33, fontWeight: 300,
          color: 'rgba(255,255,255,0.7)',
          fontFamily: '"Inter", sans-serif',
          lineHeight: 1.65,
          marginBottom: 32,
          display: '-webkit-box' as any,
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical' as any,
          overflow: 'hidden',
        }}>{slide.description}</div>

        <div style={{ display: 'flex', gap: 16 }}>
          <div
            onClick={() => { if (slide.channel) onPlay(slide.channel) }}
            style={{
              padding: '14px 40px', borderRadius: 6,
              fontSize: 19, fontWeight: 700,
              fontFamily: '"Inter", sans-serif',
              background: '#fff', color: '#000',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 10,
              boxShadow: '0 4px 24px rgba(255,255,255,0.2)',
            }}
          >▶ Assistir</div>
          <div style={{
            padding: '14px 40px', borderRadius: 6,
            fontSize: 19, fontWeight: 700,
            fontFamily: '"Inter", sans-serif',
            background: 'rgba(80,80,82,0.55)', color: '#fff',
            border: '1.5px solid rgba(255,255,255,0.2)',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>+ Minha Lista</div>
        </div>
      </div>
    </div>
  )
}
