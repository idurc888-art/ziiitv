import React, { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { useChannelsStore } from '../../store/channelsStore'
import { keyboardMaestro } from '../../services/keyboardManager'
import { usePairing } from '../../hooks/usePairing'
import { getDeviceId } from '../../services/pairingService'
import { SUPABASE_URL, ANON_KEY } from '../../services/supabaseClient'
import type { PairToken } from '../../services/pairingService'

const USERS = [
  { id: 1, name: 'Zikualdo',  icon: '👽', color: '#ff006e' },
  { id: 2, name: 'Carneiro',  icon: '🛸', color: '#a855f7' },
  { id: 3, name: 'Convidado', icon: '👾', color: '#3b82f6' },
]

interface Props {
  onSelect: (userId: number) => void
  onEnterCode?: () => void
  onPaired?: (data: PairToken) => void
}

export default function ProfileScreen({ onSelect, onEnterCode, onPaired }: Props) {
  const totalItems = onEnterCode ? USERS.length + 1 : USERS.length
  const [focused, setFocused] = useState(0)
  const [selecting, setSelecting] = useState(false)
  const focusedRef = useRef(focused)
  const selectingRef = useRef(selecting)
  focusedRef.current = focused
  selectingRef.current = selecting

  const { status, progress } = useChannelsStore()
  const isReady = status === 'done'

  const { state: pairState, qrUrl, token, secondsLeft, pairData, refresh } = usePairing()
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!qrUrl || !canvasRef.current) return
    QRCode.toCanvas(canvasRef.current, qrUrl, {
      width: 220, margin: 2,
      color: { dark: '#0a0a0f', light: '#ffffff' },
    }).catch(() => {})
  }, [qrUrl])

  useEffect(() => {
    if (pairState === 'linked' && pairData && onPaired) {
      onPaired(pairData)
    }
  }, [pairState, pairData])

  const [hasPlaylist, setHasPlaylist] = useState(() => {
    try { return !!(localStorage.getItem('ziiiTV_lastUrl') || localStorage.getItem('ziiiTV_lastCode')) }
    catch (_) { return false }
  })

  async function handleDeleteList() {
    // Chama Edge Function para deletar tudo do banco (channels, playlists, tv_sessions, pair_tokens)
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/delete-device-data`, {
        method: 'POST',
        headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: getDeviceId() }),
      })
    } catch (_) {}

    // Limpa localStorage
    try {
      localStorage.removeItem('ziiiTV_lastUrl')
      localStorage.removeItem('ziiiTV_lastCode')
    } catch (_) {}

    setHasPlaylist(false)
    window.location.reload()
  }

  const min = Math.floor(secondsLeft / 60)
  const sec = secondsLeft % 60
  const urgent = secondsLeft < 60

  function handleSelect(idx: number) {
    if (selectingRef.current) return
    if (onEnterCode && idx === USERS.length) {
      onEnterCode()
      return
    }
    setSelecting(true)
    setFocused(idx)
    setTimeout(() => onSelect(USERS[idx].id), 500)
  }

  // focused === -1 → delete button no painel direito
  const focusedIsDelete = focused === -1

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (selectingRef.current) return
      if (e.key === 'ArrowDown' || e.keyCode === 40) {
        e.preventDefault()
        if (focusedRef.current === -1) return // já no delete, não desce mais
        setFocused(f => Math.min(f + 1, totalItems - 1))
      } else if (e.key === 'ArrowUp' || e.keyCode === 38) {
        e.preventDefault()
        if (focusedRef.current === -1) { setFocused(0); return }
        setFocused(f => Math.max(f - 1, 0))
      } else if (e.key === 'ArrowRight' || e.keyCode === 39) {
        e.preventDefault()
        if (hasPlaylist && focusedRef.current !== -1) setFocused(-1)
      } else if (e.key === 'ArrowLeft' || e.keyCode === 37) {
        e.preventDefault()
        if (focusedRef.current === -1) setFocused(0)
      } else if (e.key === 'Enter' || e.keyCode === 13) {
        e.preventDefault()
        if (focusedRef.current === -1) { handleDeleteList(); return }
        handleSelect(focusedRef.current)
      }
    }
    keyboardMaestro.subscribe('profiles:main', onKey)
    return () => keyboardMaestro.unsubscribe('profiles:main')
  }, [totalItems, hasPlaylist])

  return (
    <div style={{
      position: 'fixed', inset: 0,
      width: '100vw', height: '100vh',
      background: '#000',
      display: 'flex',
      overflow: 'hidden',
    }}>
      {/* Fundo alien */}
      <img
        src="hero-alien-opt.jpg"
        alt=""
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          objectFit: 'cover', objectPosition: 'center top',
          opacity: 0.25,
        }}
      />

      {/* Gradiente lateral — escurece à esquerda para os perfis */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(90deg, rgba(0,0,0,0.97) 0%, rgba(0,0,0,0.82) 45%, rgba(0,0,0,0.3) 75%, rgba(0,0,0,0.7) 100%)',
      }} />

      {/* ─── PAINEL ESQUERDO — Perfis ─── */}
      <div style={{
        position: 'relative', zIndex: 10,
        display: 'flex', flexDirection: 'column',
        justifyContent: 'center',
        padding: '0 80px',
        gap: 12,
        minWidth: 480,
      }}>
        {/* Header */}
        <div style={{ marginBottom: 40 }}>
          <div style={{
            fontFamily: "'Outfit', sans-serif",
            fontSize: 13, fontWeight: 400, letterSpacing: 4,
            textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: 8,
          }}>
            quem está assistindo?
          </div>
          <div style={{
            fontFamily: "'Outfit', sans-serif",
            fontSize: 40, fontWeight: 900, color: '#ff006e',
            textShadow: '0 0 30px rgba(255,0,110,0.5)',
            letterSpacing: '-0.03em', textTransform: 'lowercase',
          }}>
            ziiiTV
          </div>
        </div>

        {/* Lista de perfis */}
        {USERS.map((user, idx) => {
          const isFocused = focused === idx
          return (
            <div
              key={user.id}
              onClick={() => handleSelect(idx)}
              style={{
                display: 'flex', alignItems: 'center', gap: 20,
                padding: '16px 24px', borderRadius: 16, cursor: 'pointer',
                background: isFocused ? `${user.color}18` : 'rgba(255,255,255,0.03)',
                border: isFocused ? `2px solid ${user.color}` : '2px solid rgba(255,255,255,0.06)',
                boxShadow: isFocused ? `0 0 30px ${user.color}33` : 'none',
                transform: isFocused ? 'translateX(8px)' : 'translateX(0)',
                transition: 'all 250ms cubic-bezier(0.34,1.56,0.64,1)',
              }}
            >
              <div style={{
                width: 64, height: 64, borderRadius: 14, flexShrink: 0,
                background: isFocused ? `${user.color}22` : 'rgba(255,255,255,0.05)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32,
              }}>
                {user.icon}
              </div>
              <div>
                <div style={{
                  fontFamily: "'Outfit', sans-serif",
                  fontSize: 22, fontWeight: isFocused ? 700 : 400,
                  color: isFocused ? '#fff' : 'rgba(255,255,255,0.5)',
                  transition: 'all 200ms ease',
                }}>
                  {user.name}
                </div>
                {isFocused && (
                  <div style={{
                    fontFamily: "'Outfit', sans-serif",
                    fontSize: 12, color: user.color, letterSpacing: 2,
                    textTransform: 'uppercase', marginTop: 2,
                  }}>
                    pressione enter
                  </div>
                )}
              </div>
              {isFocused && (
                <div style={{ marginLeft: 'auto', color: user.color, fontSize: 20, fontWeight: 900 }}>
                  →
                </div>
              )}
            </div>
          )
        })}

        {/* Opção: digitar código manualmente */}
        {onEnterCode && (
          <div
            onClick={() => handleSelect(USERS.length)}
            style={{
              display: 'flex', alignItems: 'center', gap: 20,
              padding: '14px 24px', borderRadius: 16, cursor: 'pointer',
              marginTop: 8,
              background: focused === USERS.length ? 'rgba(168,85,247,0.12)' : 'rgba(255,255,255,0.02)',
              border: focused === USERS.length ? '2px solid rgba(168,85,247,0.7)' : '2px solid rgba(255,255,255,0.05)',
              boxShadow: focused === USERS.length ? '0 0 30px rgba(168,85,247,0.2)' : 'none',
              transform: focused === USERS.length ? 'translateX(8px)' : 'translateX(0)',
              transition: 'all 250ms cubic-bezier(0.34,1.56,0.64,1)',
            }}
          >
            <div style={{
              width: 64, height: 64, borderRadius: 14, flexShrink: 0,
              background: focused === USERS.length ? 'rgba(168,85,247,0.15)' : 'rgba(255,255,255,0.04)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28,
            }}>
              🔑
            </div>
            <div>
              <div style={{
                fontFamily: "'Outfit', sans-serif",
                fontSize: 20, fontWeight: focused === USERS.length ? 700 : 400,
                color: focused === USERS.length ? '#fff' : 'rgba(255,255,255,0.4)',
                transition: 'all 200ms ease',
              }}>
                Digitar código
              </div>
              {focused === USERS.length && (
                <div style={{
                  fontFamily: "'Outfit', sans-serif",
                  fontSize: 12, color: 'rgba(168,85,247,0.9)', letterSpacing: 2,
                  textTransform: 'uppercase', marginTop: 2,
                }}>
                  pressione enter
                </div>
              )}
            </div>
            {focused === USERS.length && (
              <div style={{ marginLeft: 'auto', color: 'rgba(168,85,247,0.9)', fontSize: 20, fontWeight: 900 }}>
                →
              </div>
            )}
          </div>
        )}

        {/* Loading indicator */}
        {!isReady && progress > 0 && (
          <div style={{
            marginTop: 16, padding: '12px 20px', borderRadius: 10,
            background: 'rgba(255,0,110,0.06)', border: '1px solid rgba(255,0,110,0.15)',
          }}>
            <div style={{
              fontFamily: "'Outfit', sans-serif", fontSize: 12,
              color: 'rgba(255,0,110,0.7)', marginBottom: 6,
              display: 'flex', justifyContent: 'space-between',
            }}>
              <span>🛸 Carregando catálogo</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div style={{
              width: '100%', height: 3,
              background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden',
            }}>
              <div style={{
                width: `${progress}%`, height: '100%',
                background: 'linear-gradient(90deg, #ff006e, #a855f7)',
                transition: 'width 300ms ease',
              }} />
            </div>
          </div>
        )}

        {/* Hint */}
        <div style={{
          marginTop: 24, fontFamily: "'Outfit', sans-serif",
          fontSize: 12, color: 'rgba(255,255,255,0.15)',
          letterSpacing: 2, textTransform: 'uppercase',
        }}>
          ↑ ↓ navegar · enter selecionar · → deletar lista
        </div>
      </div>

      {/* ─── PAINEL DIREITO — QR Code ─── */}
      <div style={{
        position: 'absolute', right: 120, top: '50%',
        transform: 'translateY(-50%)',
        zIndex: 10,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20,
      }}>
        {/* Badge lista */}
        <div style={{
          padding: '8px 20px', borderRadius: 100,
          background: hasPlaylist ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.06)',
          border: hasPlaylist ? '1px solid rgba(34,197,94,0.35)' : '1px solid rgba(255,255,255,0.12)',
          fontFamily: "'Outfit', sans-serif",
          fontSize: 13, fontWeight: 600,
          color: hasPlaylist ? '#4ade80' : 'rgba(255,255,255,0.4)',
          letterSpacing: 1,
        }}>
          {hasPlaylist ? '✓  Lista ativa' : '⚡  Sem lista carregada'}
        </div>

        {/* QR Code ou estados */}
        {pairState === 'loading' && (
          <div style={{
            width: 220, height: 220, borderRadius: 20,
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: '50%',
              border: '3px solid rgba(255,255,255,0.1)',
              borderTop: '3px solid #ff006e',
              animation: 'qr-spin 0.8s linear infinite',
            }} />
          </div>
        )}

        {(pairState === 'ready') && (
          <div style={{
            background: '#fff', borderRadius: 20, padding: 16,
            boxShadow: '0 0 60px rgba(255,0,110,0.25), 0 0 120px rgba(255,0,110,0.1)',
          }}>
            <canvas ref={canvasRef} style={{ display: 'block' }} />
          </div>
        )}

        {pairState === 'linked' && (
          <div style={{
            width: 220, height: 220, borderRadius: 20,
            background: 'rgba(34,197,94,0.08)', border: '2px solid rgba(34,197,94,0.4)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 12,
          }}>
            <div style={{ fontSize: 48, color: '#4ade80' }}>✓</div>
            <div style={{
              fontFamily: "'Outfit', sans-serif", fontSize: 14,
              color: '#4ade80', fontWeight: 600, textAlign: 'center',
            }}>
              Lista vinculada!
            </div>
          </div>
        )}

        {(pairState === 'expired' || pairState === 'error') && (
          <div
            onClick={refresh}
            style={{
              width: 220, height: 220, borderRadius: 20,
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 12,
              cursor: 'pointer',
            }}
          >
            <div style={{ fontSize: 36 }}>{pairState === 'expired' ? '⏳' : '📡'}</div>
            <div style={{
              fontFamily: "'Outfit', sans-serif", fontSize: 13,
              color: 'rgba(255,255,255,0.5)', textAlign: 'center', lineHeight: 1.4,
            }}>
              {pairState === 'expired' ? 'Expirado' : 'Sem conexão'}
              <br />
              <span style={{ color: '#ff006e' }}>Clique para renovar</span>
            </div>
          </div>
        )}

        {/* Label */}
        <div style={{
          textAlign: 'center',
          fontFamily: "'Outfit', sans-serif", fontSize: 14,
          color: 'rgba(255,255,255,0.45)', lineHeight: 1.5,
        }}>
          Escaneie com o celular<br />para vincular sua lista
        </div>

        {/* Token e timer */}
        {token && pairState === 'ready' && (
          <div style={{
            background: 'rgba(255,0,110,0.08)',
            border: '1px solid rgba(255,0,110,0.2)',
            borderRadius: 10, padding: '10px 18px',
            textAlign: 'center',
          }}>
            <div style={{
              fontFamily: 'monospace', fontSize: 12,
              color: 'rgba(255,255,255,0.4)',
            }}>
              ziiitv-admin.vercel.app/link?token=
            </div>
            <div style={{
              fontFamily: 'monospace', fontSize: 15,
              color: '#ff006e', fontWeight: 700, marginTop: 2,
            }}>
              {token}
            </div>
            <div style={{
              fontFamily: "'Outfit', sans-serif", fontSize: 12,
              color: urgent ? '#ff6b6b' : 'rgba(255,255,255,0.25)',
              marginTop: 6, fontWeight: urgent ? 600 : 400,
            }}>
              {urgent ? '⚠️ ' : '⏱ '}Expira em {min}:{String(sec).padStart(2, '0')}
            </div>
          </div>
        )}

        {/* Botão deletar lista — dentro do painel direito, navegável pelo controle */}
        {hasPlaylist && (
          <button
            onClick={handleDeleteList}
            style={{
              background: focusedIsDelete ? 'rgba(255,50,50,0.25)' : 'rgba(255,50,50,0.08)',
              border: focusedIsDelete ? '2px solid rgba(255,80,80,0.7)' : '1px solid rgba(255,50,50,0.25)',
              borderRadius: 10, padding: '10px 24px',
              fontSize: 13, fontWeight: 600,
              color: focusedIsDelete ? '#ff8080' : 'rgba(255,100,100,0.6)',
              cursor: 'pointer', fontFamily: "'Outfit', sans-serif",
              transition: 'all 150ms',
              outline: 'none',
              boxShadow: focusedIsDelete ? '0 0 0 2px rgba(255,80,80,0.3)' : 'none',
            }}
          >
            🗑  Deletar lista
          </button>
        )}
      </div>

      <style>{`
        @keyframes qr-spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
