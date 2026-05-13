import React, { useEffect, useRef, useState } from 'react'
import { keyboardMaestro } from '../../services/keyboardManager'

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_LEN = 4

interface Props {
  onConfirm: (code: string) => void
  onBack: () => void
  loading?: boolean
  error?: string | null
}

export default function CodeEntryScreen({ onConfirm, onBack, loading, error }: Props) {
  const [slots, setSlots] = useState<number[]>([0, 0, 0, 0])
  const [cursor, setCursor] = useState(0)
  const cursorRef = useRef(cursor)
  const slotsRef  = useRef(slots)
  cursorRef.current = cursor
  slotsRef.current  = slots

  const code = `ZIII-${slots.map(i => CHARS[i]).join('')}`

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (loading) return

      if (e.key === 'ArrowUp' || e.keyCode === 38) {
        e.preventDefault()
        const c = cursorRef.current
        setSlots(s => { const n = [...s]; n[c] = (n[c] - 1 + CHARS.length) % CHARS.length; return n })
      } else if (e.key === 'ArrowDown' || e.keyCode === 40) {
        e.preventDefault()
        const c = cursorRef.current
        setSlots(s => { const n = [...s]; n[c] = (n[c] + 1) % CHARS.length; return n })
      } else if (e.key === 'ArrowRight' || e.keyCode === 39) {
        e.preventDefault()
        setCursor(c => Math.min(c + 1, CODE_LEN - 1))
      } else if (e.key === 'ArrowLeft' || e.keyCode === 37) {
        e.preventDefault()
        setCursor(c => Math.max(c - 1, 0))
      } else if (e.key === 'Enter' || e.keyCode === 13) {
        e.preventDefault()
        onConfirm(`ZIII-${slotsRef.current.map(i => CHARS[i]).join('')}`)
      } else if (e.key === 'Backspace' || e.keyCode === 8 || e.keyCode === 10009) {
        e.preventDefault()
        onBack()
      }
    }

    keyboardMaestro.subscribe('code-entry', onKey)
    return () => keyboardMaestro.unsubscribe('code-entry')
  }, [loading, onConfirm, onBack])

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: 1920,
      height: 1080,
      background: '#000',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 48,
    }}>
      {/* Background */}
      <img
        src="hero-alien-opt.jpg"
        alt=""
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.15 }}
      />
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at center, transparent 0%, rgba(0,0,0,0.85) 100%)',
      }} />

      <div style={{ position: 'relative', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 40 }}>

        {/* Logo */}
        <div style={{
          fontFamily: "'Outfit', sans-serif",
          fontSize: 48, fontWeight: 900, letterSpacing: '-0.04em',
          color: '#ff006e',
          textShadow: '0 0 30px rgba(255,0,110,0.7)',
        }}>
          ziiiTV
        </div>

        {/* Instrução */}
        <div style={{
          fontFamily: "'Outfit', sans-serif",
          fontSize: 22, fontWeight: 400,
          color: 'rgba(255,255,255,0.7)',
          letterSpacing: 1,
          textAlign: 'center',
        }}>
          Digite o código gerado no painel admin
        </div>

        {/* Slots de código */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Prefixo fixo */}
          <div style={{
            fontFamily: 'monospace', fontSize: 52, fontWeight: 700,
            color: 'rgba(255,255,255,0.3)',
            letterSpacing: 4,
          }}>
            ZIII -
          </div>

          {/* 4 slots editáveis */}
          {slots.map((charIdx, i) => {
            const isFocused = cursor === i
            return (
              <div key={i} style={{
                width: 72, height: 90,
                borderRadius: 16,
                border: isFocused ? '3px solid #ff006e' : '2px solid rgba(255,255,255,0.15)',
                background: isFocused ? 'rgba(255,0,110,0.12)' : 'rgba(255,255,255,0.04)',
                boxShadow: isFocused ? '0 0 24px rgba(255,0,110,0.4)' : 'none',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                gap: 4,
                transition: 'all 200ms ease',
              }}>
                {/* Char acima */}
                <div style={{
                  fontFamily: 'monospace', fontSize: 16,
                  color: 'rgba(255,255,255,0.2)',
                  userSelect: 'none',
                }}>
                  {CHARS[(charIdx - 1 + CHARS.length) % CHARS.length]}
                </div>

                {/* Char atual */}
                <div style={{
                  fontFamily: 'monospace', fontSize: 40, fontWeight: 700,
                  color: isFocused ? '#ff006e' : '#fff',
                  transition: 'color 150ms ease',
                }}>
                  {CHARS[charIdx]}
                </div>

                {/* Char abaixo */}
                <div style={{
                  fontFamily: 'monospace', fontSize: 16,
                  color: 'rgba(255,255,255,0.2)',
                  userSelect: 'none',
                }}>
                  {CHARS[(charIdx + 1) % CHARS.length]}
                </div>
              </div>
            )
          })}
        </div>

        {/* Código completo */}
        <div style={{
          fontFamily: 'monospace', fontSize: 28, fontWeight: 600,
          color: 'rgba(255,255,255,0.4)',
          letterSpacing: 6,
        }}>
          {code}
        </div>

        {/* Erro */}
        {error && (
          <div style={{
            padding: '12px 24px',
            borderRadius: 12,
            background: 'rgba(255,50,50,0.15)',
            border: '1px solid rgba(255,50,50,0.4)',
            color: '#ff6b6b',
            fontFamily: "'Outfit', sans-serif",
            fontSize: 16,
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{
            fontFamily: "'Outfit', sans-serif", fontSize: 18,
            color: '#ff006e',
            animation: 'pulse 1s infinite',
          }}>
            🛸 Ativando lista...
          </div>
        )}

        {/* Hints */}
        {!loading && (
          <div style={{
            fontFamily: "'Outfit', sans-serif",
            fontSize: 14, color: 'rgba(255,255,255,0.2)',
            letterSpacing: 2, textTransform: 'uppercase',
            textAlign: 'center', lineHeight: 2,
          }}>
            ↑ ↓ mudar letra · ← → mover · enter confirmar · voltar cancelar
          </div>
        )}
      </div>

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  )
}
