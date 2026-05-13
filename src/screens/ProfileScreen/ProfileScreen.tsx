import { useEffect, useRef, useState, useCallback } from 'react'
import { useChannelsStore } from '../../store/channelsStore'
import { keyboardMaestro } from '../../services/keyboardManager'
import { getSavedLists, removeList, activateList, type SavedList } from '../../services/listStorage'

const USERS = [
  { id: 1, name: 'Zikualdo',  icon: '👽', color: '#ff006e' },
  { id: 2, name: 'Carneiro',  icon: '🛸', color: '#a855f7' },
  { id: 3, name: 'Convidado', icon: '👾', color: '#3b82f6' },
]

interface Props {
  onSelect: (userId: number) => void
  onEnterCode?: () => void
  onEnterWithoutList?: () => void
  onShowSetup?: () => void
}

// ─── Modo SEM LISTA — tela de boas-vindas com 2 opções ───────────────────────

function NoListScreen({
  focused,
  onFocus,
  onEnterWithoutList,
  onEnterCode,
  isLoadingList,
  progress,
}: {
  focused: number
  onFocus: (i: number) => void
  onEnterWithoutList: () => void
  onEnterCode: () => void
  isLoadingList: boolean
  progress: number
}) {
  const options = [
    {
      icon: '🏆',
      label: 'Entrar com Copa 2026',
      sub: 'Acesse jogos, grupos e artilheiros · sem lista',
      color: '#ff006e',
      action: onEnterWithoutList,
    },
    {
      icon: '🔑',
      label: 'Ativar lista com código',
      sub: 'Desbloqueie filmes, séries e TV ao Vivo',
      color: '#a855f7',
      action: onEnterCode,
    },
  ]

  return (
    <div style={{
      position: 'relative', zIndex: 10,
      display: 'flex', flexDirection: 'column',
      justifyContent: 'center',
      padding: '0 80px',
      gap: 0,
      minWidth: 520,
    }}>
      {/* Logo */}
      <div style={{ marginBottom: 48 }}>
        <div style={{
          fontFamily: "'Outfit', sans-serif",
          fontSize: 13, fontWeight: 400,
          letterSpacing: 4, textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.3)', marginBottom: 8,
        }}>
          bem-vindo ao
        </div>
        <div style={{
          fontFamily: "'Outfit', sans-serif",
          fontSize: 52, fontWeight: 900,
          color: '#ff006e',
          textShadow: '0 0 40px rgba(255,0,110,0.6)',
          letterSpacing: '-0.04em', textTransform: 'lowercase',
        }}>
          ziiiTV
        </div>
        <div style={{
          fontFamily: "'Outfit', sans-serif",
          fontSize: 18, fontWeight: 300,
          color: 'rgba(255,255,255,0.45)',
          marginTop: 8, letterSpacing: 0.5,
        }}>
          Como deseja continuar?
        </div>
      </div>

      {/* Opções */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {options.map((opt, i) => {
          const isFocused = focused === i
          return (
            <div
              key={i}
              onClick={opt.action}
              style={{
                display: 'flex', alignItems: 'center', gap: 20,
                padding: '20px 28px',
                borderRadius: 18,
                cursor: 'pointer',
                background: isFocused ? `${opt.color}16` : 'rgba(255,255,255,0.03)',
                border: isFocused ? `2px solid ${opt.color}` : '2px solid rgba(255,255,255,0.07)',
                boxShadow: isFocused ? `0 0 40px ${opt.color}30, 0 8px 32px rgba(0,0,0,0.5)` : 'none',
                transform: isFocused ? 'translateX(10px) scale(1.01)' : 'translateX(0) scale(1)',
                transition: 'all 280ms cubic-bezier(0.34,1.56,0.64,1)',
              }}
            >
              <div style={{
                width: 64, height: 64, borderRadius: 16,
                background: isFocused ? `${opt.color}22` : 'rgba(255,255,255,0.05)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 30, flexShrink: 0,
                boxShadow: isFocused ? `0 0 20px ${opt.color}44` : 'none',
                transition: 'all 200ms ease',
              }}>
                {opt.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontFamily: "'Outfit', sans-serif",
                  fontSize: 20, fontWeight: isFocused ? 700 : 500,
                  color: isFocused ? '#fff' : 'rgba(255,255,255,0.55)',
                  transition: 'all 200ms ease',
                }}>
                  {opt.label}
                </div>
                <div style={{
                  fontFamily: "'Outfit', sans-serif",
                  fontSize: 13, fontWeight: 400,
                  color: isFocused ? `${opt.color}cc` : 'rgba(255,255,255,0.25)',
                  marginTop: 3, transition: 'all 200ms ease',
                }}>
                  {opt.sub}
                </div>
              </div>
              {isFocused && (
                <div style={{ color: opt.color, fontSize: 22, fontWeight: 900, flexShrink: 0 }}>→</div>
              )}
            </div>
          )
        })}
      </div>

      {/* Loading da lista em background */}
      {isLoadingList && progress > 0 && (
        <div style={{ marginTop: 28, padding: '12px 20px', borderRadius: 10, background: 'rgba(255,0,110,0.06)', border: '1px solid rgba(255,0,110,0.15)' }}>
          <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 12, color: 'rgba(255,0,110,0.7)', marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
            <span>🛸 Carregando catálogo em segundo plano</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div style={{ width: '100%', height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(90deg, #ff006e, #a855f7)', transition: 'width 300ms ease' }} />
          </div>
        </div>
      )}

      {/* Hint */}
      <div style={{ marginTop: 24, fontFamily: "'Outfit', sans-serif", fontSize: 12, color: 'rgba(255,255,255,0.15)', letterSpacing: 2, textTransform: 'uppercase' }}>
        ↑ ↓ navegar · enter selecionar
      </div>
    </div>
  )
}

// ─── Modo COM LISTA — seleção de perfis (comportamento atual) ─────────────────

// ─── Overlay de gerenciamento de listas ──────────────────────────────────────

function ManageListsOverlay({
  activeCode,
  totalChannels,
  onClose,
  onAddNew,
  onActivate,
  onRemove,
}: {
  activeCode: string | null
  totalChannels: number
  onClose: () => void
  onAddNew: () => void
  onActivate: (code: string) => void
  onRemove: (code: string) => void
}) {
  const [lists, setLists]     = useState<SavedList[]>(() => getSavedLists())
  const [focusIdx, setFocusIdx] = useState(0)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const focusRef   = useRef(focusIdx)
  const confirmRef = useRef(confirmDel)
  focusRef.current   = focusIdx
  confirmRef.current = confirmDel

  // items = [...listas, 'add']
  const total = lists.length + 1
  const ADD_IDX = lists.length

  const handleEnter = useCallback((idx: number) => {
    if (idx === ADD_IDX) { onAddNew(); return }
    const item = lists[idx]
    if (!item) return
    if (confirmRef.current === item.code) {
      // confirmar remoção
      onRemove(item.code)
      setLists(getSavedLists())
      setConfirmDel(null)
      setFocusIdx(Math.max(0, idx - 1))
    } else if (item.code === activeCode) {
      // já ativa: pede confirmação de remoção
      setConfirmDel(item.code)
    } else {
      onActivate(item.code)
      onClose()
    }
  }, [lists, activeCode, ADD_IDX, onAddNew, onActivate, onRemove, onClose])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.keyCode === 40 || e.key === 'ArrowDown') { e.preventDefault(); setFocusIdx(f => Math.min(f + 1, total - 1)); setConfirmDel(null) }
      else if (e.keyCode === 38 || e.key === 'ArrowUp') { e.preventDefault(); setFocusIdx(f => Math.max(f - 1, 0)); setConfirmDel(null) }
      else if (e.keyCode === 13 || e.key === 'Enter')  { e.preventDefault(); handleEnter(focusRef.current) }
      else if (e.keyCode === 10009 || e.keyCode === 8) { e.preventDefault(); onClose() }
    }
    keyboardMaestro.subscribe('profiles:manage', onKey)
    return () => keyboardMaestro.unsubscribe('profiles:manage')
  }, [total, handleEnter, onClose])

  return (
    <div style={{ width: '100%' }}>
      <div style={{ width: 520 }}>

        <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 13, letterSpacing: 4, textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: 8 }}>
          gerenciar listas
        </div>
        <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 32, fontWeight: 900, color: '#ff006e', textShadow: '0 0 24px rgba(255,0,110,0.4)', marginBottom: 32 }}>
          Suas Listas
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {lists.map((item, idx) => {
            const isActive  = item.code === activeCode
            const isFocused = focusIdx === idx
            const isConfirm = confirmDel === item.code
            const color = isActive ? '#4ade80' : '#a855f7'

            return (
              <div key={item.code} onClick={() => handleEnter(idx)} style={{
                display: 'flex', alignItems: 'center', gap: 16,
                padding: '16px 20px', borderRadius: 14, cursor: 'pointer',
                background: isFocused ? (isConfirm ? 'rgba(239,68,68,0.12)' : `${color}12`) : 'rgba(255,255,255,0.03)',
                border: isFocused ? `2px solid ${isConfirm ? '#ef4444' : color}` : '2px solid rgba(255,255,255,0.07)',
                boxShadow: isFocused ? `0 0 28px ${isConfirm ? '#ef444444' : color + '33'}` : 'none',
                transform: isFocused ? 'translateX(8px)' : 'none',
                transition: 'all 220ms cubic-bezier(0.34,1.56,0.64,1)',
              }}>
                <span style={{ fontSize: 22 }}>{isConfirm ? '🗑' : isActive ? '✅' : '○'}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: 'monospace', fontSize: 20, fontWeight: 700, color: isFocused ? '#fff' : 'rgba(255,255,255,0.5)' }}>
                    {item.code}
                  </div>
                  <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 12, color: isConfirm ? '#ef4444' : isActive ? '#4ade80' : 'rgba(255,255,255,0.25)', marginTop: 2 }}>
                    {isConfirm
                      ? 'Pressione ENTER para confirmar remoção'
                      : isActive
                        ? `Ativa · ${totalChannels.toLocaleString()} canais`
                        : `Salva em ${new Date(item.savedAt).toLocaleDateString('pt-BR')}`
                    }
                  </div>
                </div>
                {isFocused && !isConfirm && (
                  <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 12, color, letterSpacing: 1 }}>
                    {isActive ? 'ENTER = remover' : 'ENTER = ativar'}
                  </div>
                )}
              </div>
            )
          })}

          {/* + Adicionar nova lista */}
          <div onClick={() => handleEnter(ADD_IDX)} style={{
            display: 'flex', alignItems: 'center', gap: 16,
            padding: '16px 20px', borderRadius: 14, cursor: 'pointer',
            background: focusIdx === ADD_IDX ? 'rgba(255,0,110,0.12)' : 'transparent',
            border: focusIdx === ADD_IDX ? '2px solid #ff006e' : '2px dashed rgba(255,255,255,0.12)',
            transform: focusIdx === ADD_IDX ? 'translateX(8px)' : 'none',
            transition: 'all 220ms cubic-bezier(0.34,1.56,0.64,1)',
          }}>
            <span style={{ fontSize: 22, color: '#ff006e' }}>＋</span>
            <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 18, fontWeight: 600, color: focusIdx === ADD_IDX ? '#fff' : 'rgba(255,255,255,0.35)' }}>
              Adicionar nova lista
            </div>
          </div>
        </div>

        <div style={{ marginTop: 28, fontFamily: "'Outfit', sans-serif", fontSize: 12, color: 'rgba(255,255,255,0.15)', letterSpacing: 2, textTransform: 'uppercase' }}>
          ↑ ↓ navegar · enter ação · voltar fechar
        </div>
      </div>
    </div>
  )
}

// ─── Tela principal ────────────────────────────────────────────────────────────

export default function ProfileScreen({ onSelect, onEnterCode, onEnterWithoutList, onShowSetup }: Props) {
  const { status, progress, lastUrl, matchedChannels, unmatchedChannels, loadFromCode } = useChannelsStore()
  const isReady   = status === 'done'
  const isLoading = status === 'fetching' || status === 'parsing' || status === 'matching'
  const savedCode = localStorage.getItem('ziiiTV_lastCode')
  const hasListConfigured = !!savedCode
  const totalChannels = matchedChannels.length + unmatchedChannels.length

  const noListMode = !hasListConfigured

  // overlay de gerenciamento de listas
  const [manageMode, setManageMode] = useState(false)

  // LISTA = idx USERS.length, GERENCIAR = idx USERS.length + 1
  const totalItems = noListMode ? 2 : (onShowSetup ? USERS.length + 2 : USERS.length + 1)
  const MANAGE_IDX = USERS.length
  const TROCAR_IDX = USERS.length + 1

  const [focused, setFocused]   = useState(0)
  const [selecting, setSelecting] = useState(false)
  const focusedRef   = useRef(focused)
  const selectingRef = useRef(selecting)
  const manageModeRef = useRef(manageMode)
  focusedRef.current   = focused
  selectingRef.current = selecting
  manageModeRef.current = manageMode

  function handleSelect(idx: number) {
    if (selectingRef.current || manageModeRef.current) return

    if (noListMode) {
      if (idx === 0) { onEnterWithoutList?.(); return }
      if (idx === 1) { onEnterCode?.();        return }
      return
    }

    if (idx === MANAGE_IDX) { setManageMode(true); return }
    if (idx === TROCAR_IDX) { onShowSetup?.(); return }

    setSelecting(true)
    setFocused(idx)
    setTimeout(() => onSelect(USERS[idx].id), 500)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (selectingRef.current || manageModeRef.current) return
      if (e.keyCode === 40 || e.key === 'ArrowDown') { e.preventDefault(); setFocused(f => Math.min(f + 1, totalItems - 1)) }
      else if (e.keyCode === 38 || e.key === 'ArrowUp') { e.preventDefault(); setFocused(f => Math.max(f - 1, 0)) }
      else if (e.keyCode === 13 || e.key === 'Enter')  { e.preventDefault(); handleSelect(focusedRef.current) }
    }
    keyboardMaestro.subscribe('profiles:main', onKey)
    return () => keyboardMaestro.unsubscribe('profiles:main')
  }, [totalItems, noListMode]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{
      position: 'fixed', inset: 0,
      width: '100vw', height: '100vh',
      background: '#000',
      display: 'flex',
      overflow: 'hidden',
    }}>
      {/* Imagem de fundo */}
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
      {/* Gradiente overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(90deg, rgba(0,0,0,0.97) 0%, rgba(0,0,0,0.85) 40%, rgba(0,0,0,0.2) 100%)',
      }} />

      {/* ── Modo SEM lista ─────────────────────────────────── */}
      {noListMode && (
        <NoListScreen
          focused={focused}
          onFocus={setFocused}
          onEnterWithoutList={() => onEnterWithoutList?.()}
          onEnterCode={() => onEnterCode?.()}
          isLoadingList={isLoading}
          progress={progress}
        />
      )}

      {/* ── Modo COM lista ─────────────────────────────────── */}
      {!noListMode && (
        <div style={{
          position: 'relative', zIndex: 10,
          display: 'flex', flexDirection: 'column',
          justifyContent: 'center',
          padding: '0 80px',
          gap: 12,
          minWidth: 480,
        }}>
          {/* Gerenciar listas — renderiza no mesmo container (sem overlay absoluto) */}
          {manageMode && (
            <ManageListsOverlay
              activeCode={savedCode}
              totalChannels={totalChannels}
              onClose={() => setManageMode(false)}
              onAddNew={() => { setManageMode(false); onShowSetup?.() }}
              onActivate={(code) => {
                activateList(code)
                loadFromCode(code).catch(() => {})
              }}
              onRemove={(code) => {
                removeList(code)
                const newActive = localStorage.getItem('ziiiTV_lastCode')
                if (newActive) loadFromCode(newActive).catch(() => {})
              }}
            />
          )}
          {!manageMode && (<>
          {/* Header */}
          <div style={{ marginBottom: 40 }}>
            <div style={{
              fontFamily: "'Outfit', sans-serif", fontSize: 13, fontWeight: 400,
              letterSpacing: 4, textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.3)', marginBottom: 8,
            }}>
              quem está assistindo?
            </div>
            <div style={{
              fontFamily: "'Outfit', sans-serif", fontSize: 40, fontWeight: 900,
              color: '#ff006e', textShadow: '0 0 30px rgba(255,0,110,0.5)',
              letterSpacing: '-0.03em', textTransform: 'lowercase',
            }}>
              ziiiTV
            </div>
          </div>

          {/* Badge de lista ativa */}
          <div style={{
            marginBottom: 20,
            padding: '10px 16px', borderRadius: 10,
            background: isReady ? 'rgba(74,222,128,0.08)' : 'rgba(255,0,110,0.06)',
            border: isReady ? '1px solid rgba(74,222,128,0.3)' : '1px solid rgba(255,0,110,0.2)',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ fontSize: 16 }}>{isReady ? '✅' : '🛸'}</span>
            <div style={{ flex: 1 }}>
              {isReady ? (
                <>
                  <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 12, fontWeight: 700, color: '#4ade80', letterSpacing: 1, textTransform: 'uppercase' }}>
                    Lista ativa · {totalChannels.toLocaleString()} canais
                  </div>
                  <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
                    {savedCode ? `Código: ${savedCode}` : lastUrl ? (lastUrl.length > 50 ? lastUrl.slice(0, 50) + '…' : lastUrl) : '—'}
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 12, fontWeight: 600, color: '#ff006e', letterSpacing: 1 }}>
                    Carregando catálogo... {progress > 0 ? `${Math.round(progress)}%` : ''}
                  </div>
                  <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
                    Você já pode entrar — o conteúdo carrega em segundo plano
                  </div>
                </>
              )}
            </div>
            {!isReady && progress > 0 && (
              <div style={{ marginLeft: 'auto', width: 60, height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden', flexShrink: 0 }}>
                <div style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(90deg, #ff006e, #a855f7)', transition: 'width 300ms ease' }} />
              </div>
            )}
          </div>

          {/* Perfis */}
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
                  width: 64, height: 64, borderRadius: 14,
                  background: isFocused ? `${user.color}22` : 'rgba(255,255,255,0.05)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 32, flexShrink: 0,
                }}>
                  {user.icon}
                </div>
                <div>
                  <div style={{
                    fontFamily: "'Outfit', sans-serif", fontSize: 22,
                    fontWeight: isFocused ? 700 : 400,
                    color: isFocused ? '#fff' : 'rgba(255,255,255,0.5)',
                    transition: 'all 200ms ease',
                  }}>
                    {user.name}
                  </div>
                  {isFocused && (
                    <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 12, color: user.color, letterSpacing: 2, textTransform: 'uppercase', marginTop: 2 }}>
                      pressione enter
                    </div>
                  )}
                </div>
                {isFocused && (
                  <div style={{ marginLeft: 'auto', color: user.color, fontSize: 20, fontWeight: 900 }}>→</div>
                )}
              </div>
            )
          })}

          {/* Gerenciar listas */}
          <div onClick={() => handleSelect(MANAGE_IDX)} style={{
            marginTop: 8, padding: '12px 24px', borderRadius: 12, cursor: 'pointer',
            background: focused === MANAGE_IDX ? 'rgba(255,0,110,0.12)' : 'transparent',
            border: focused === MANAGE_IDX ? '1px solid rgba(255,0,110,0.5)' : '1px solid rgba(255,255,255,0.06)',
            display: 'flex', alignItems: 'center', gap: 12, transition: 'all 200ms ease',
          }}>
            <span style={{ fontSize: 18 }}>📋</span>
            <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 14, fontWeight: 500, color: focused === MANAGE_IDX ? '#ff006e' : 'rgba(255,255,255,0.25)' }}>
              Gerenciar listas
            </div>
            {focused === MANAGE_IDX && <span style={{ marginLeft: 'auto', color: '#ff006e', fontSize: 16 }}>→</span>}
          </div>

          {/* Adicionar nova lista via QR */}
          {onShowSetup && (
            <div onClick={() => handleSelect(TROCAR_IDX)} style={{
              padding: '12px 24px', borderRadius: 12, cursor: 'pointer',
              background: focused === TROCAR_IDX ? 'rgba(168,85,247,0.12)' : 'transparent',
              border: focused === TROCAR_IDX ? '1px solid rgba(168,85,247,0.5)' : '1px solid rgba(255,255,255,0.06)',
              display: 'flex', alignItems: 'center', gap: 12, transition: 'all 200ms ease',
            }}>
              <span style={{ fontSize: 18 }}>📱</span>
              <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 14, fontWeight: 500, color: focused === TROCAR_IDX ? '#a855f7' : 'rgba(255,255,255,0.25)' }}>
                Adicionar nova lista · QR Code
              </div>
              {focused === TROCAR_IDX && <span style={{ marginLeft: 'auto', color: '#a855f7', fontSize: 16 }}>→</span>}
            </div>
          )}

          {/* Hint */}
          <div style={{ marginTop: 16, fontFamily: "'Outfit', sans-serif", fontSize: 12, color: 'rgba(255,255,255,0.15)', letterSpacing: 2, textTransform: 'uppercase' }}>
            ↑ ↓ navegar · enter selecionar
          </div>
          </>)}
        </div>
      )}
    </div>
  )
}
