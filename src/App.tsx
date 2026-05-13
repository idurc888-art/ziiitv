import React, { useEffect, useRef, useState, lazy, Suspense } from 'react'
import { useChannelsStore } from './store/channelsStore'
import { keyboardMaestro } from './services/keyboardManager'
import { expandManager } from './services/expandManager'
import { AuthService } from './services/authService'
import { Logger } from './services/LoggerService'
import { transitionStore } from './services/transitionStore'
import { playerManager } from './services/PlayerManager'
import { getTvSession } from './services/pairingService'

// Lazy load das telas pesadas
const DebugOverlay       = lazy(() => import('./components/DebugOverlay'))
const PlayerScreen       = lazy(() => import('./screens/PlayerScreen/PlayerScreen'))
const SplashScreen       = lazy(() => import('./screens/SplashScreen/SplashScreen'))
const ProfileScreen      = lazy(() => import('./screens/ProfileScreen/ProfileScreen'))
const HomeScreen         = lazy(() => import('./screens/HomeScreen/HomeScreen'))
const CodeEntryScreen    = lazy(() => import('./screens/CodeEntryScreen/CodeEntryScreen'))
const SetupScreen        = lazy(() => import('./screens/SetupScreen/SetupScreen'))
const SeriesDetailScreen = lazy(() => import('./screens/SeriesDetailScreen/SeriesDetailScreen'))
const TransitionOverlay  = lazy(() => import('./components/TransitionOverlay'))
const FullscreenOverlay  = lazy(() => import('./components/FullscreenOverlay'))

type AppScreen = 'splash' | 'setup' | 'profiles' | 'code-entry' | 'home'

function hasStoredPlaylist(): boolean {
  try {
    return !!(localStorage.getItem('ziiiTV_lastUrl') || localStorage.getItem('ziiiTV_lastCode'))
  } catch (_) { return false }
}

const SCREEN_KEY = 'ziiiTV_appScreen'

export default function App() {
  const normalizedGroups  = useChannelsStore(s => s.normalizedGroups)
  const loadFromUrl       = useChannelsStore(s => s.loadFromUrl)
  const loadFromCode      = useChannelsStore(s => s.loadFromCode)
  const currentChannel    = useChannelsStore(s => s.currentChannel)
  const setCurrentChannel = useChannelsStore(s => s.setCurrentChannel)

  const [codeError, setCodeError] = useState<string | null>(null)
  const [codeLoading, setCodeLoading] = useState(false)
  const [seriesChannel, setSeriesChannel] = useState<any | null>(null)
  const [seriesSimilar, setSeriesSimilar] = useState<any[]>([])

  // Força SplashScreen -> ProfileScreen -> HomeScreen em toda inicialização
  const [appScreen, setAppScreen] = useState<AppScreen>('splash')
  const [showDebug, setShowDebug] = useState(false)

  useEffect(() => {
    keyboardMaestro.init()
    return () => keyboardMaestro.destroy()
  }, [])

  useEffect(() => {
    const view = currentChannel 
      ? 'player' 
      : seriesChannel
        ? 'series-detail'
        : appScreen === 'profiles' 
          ? 'profiles' 
          : appScreen === 'code-entry'
            ? 'code-entry'
            : 'main'
    keyboardMaestro.setActiveView(view)
  }, [appScreen, currentChannel, seriesChannel])

  // ─── Teclas Globais e BACK Handling ────────────────────────────────────────
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // 403 = Botão Vermelho (Red) na TV Samsung
      if (e.keyCode === 403 || e.key === 'r') {
        setShowDebug(prev => !prev)
      }

      // ─── Zap de Canal (427=CH+, 428=CH-) ─────────────────────────────
      // Funciona em qualquer tela — troca canal ao vivo diretamente
      if (e.keyCode === 427 || e.keyCode === 428) {
        e.preventDefault()
        const allGroups = useChannelsStore.getState().normalizedGroups || {}
        const all = Object.values(allGroups).flat()
        if (all.length === 0) return
        const cur = useChannelsStore.getState().currentChannel
        const idx = cur ? all.findIndex(c => c.id === cur.id) : -1
        const next = e.keyCode === 427
          ? all[(idx + 1) % all.length]
          : all[(idx - 1 + all.length) % all.length]
        if (next) {
          transitionStore.show('', '')
          useChannelsStore.getState().setCurrentChannel(next)
        }
        return
      }

      // Interceptação global do BACK para Collapse de tela
      const isBack = e.keyCode === 10009 || e.keyCode === 8 || e.key === 'Backspace'
      if (isBack) {
        if (expandManager.isExpanded()) {
          e.preventDefault()
          e.stopPropagation()
          expandManager.triggerCollapse()
          setCurrentChannel(null)
          keyboardMaestro.setActiveView('main')
          window.dispatchEvent(new CustomEvent('ziiiTV:playerClosed'))
        }
      }
    }
    keyboardMaestro.subscribe('global:app', handleKey)
    return () => keyboardMaestro.unsubscribe('global:app')
  }, [])

  // ref para o player Shaka ativo (preenchido pelo PlayerScreen via callback)
  const shakaRef = useRef<any>(null)

  // ─── Boot: inicia playlist em background durante splash ───────────────────
  useEffect(() => {
    const tStart = performance.now()
    const savedCode = localStorage.getItem('ziiiTV_lastCode')
    const savedUrl  = localStorage.getItem('ziiiTV_lastUrl')

    const loadPromise: Promise<void> = savedCode
      ? loadFromCode(savedCode).catch(() => Promise.resolve())
      : savedUrl
        ? loadFromUrl(savedUrl).catch(() => Promise.resolve())
        : getTvSession().then(session => {
            if (session?.playlist_url) {
              try { localStorage.setItem('ziiiTV_lastUrl', session.playlist_url) } catch(_) {}
              return loadFromUrl(session.playlist_url).catch(() => Promise.resolve())
            }
          }).catch(() => Promise.resolve()) as Promise<void>

    Promise.all([
      AuthService.checkUserAuth(),
      loadPromise,
    ]).then(() => {
      const elapsed = performance.now() - tStart
      Logger.boot('SYSTEM_READY', `Sistema pronto em ${elapsed.toFixed(0)}ms`)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // TMDB warmup agora é disparado dentro do store (loadFromUrl) após status 'ready'
  // Removido daqui para evitar duplo-processamento

  // ─── Samsung: pause/resume ao sair/voltar para o app ─────────────────────
  useEffect(() => {
    const handleVisibility = () => {
      const avplay = (window as any).webapis?.avplay

      if (document.visibilityState === 'hidden') {
        // AVPlay (streams TS)
        try { avplay?.pause() } catch (_) {}
        // Shaka (streams HLS/DASH)
        try {
          if (shakaRef.current) {
            const video = shakaRef.current.getMediaElement?.() as HTMLVideoElement | null
            if (video && !video.paused) video.pause()
          }
        } catch (_) {}

      } else if (document.visibilityState === 'visible') {
        // AVPlay
        try { avplay?.play() } catch (_) {}
        // Shaka
        try {
          if (shakaRef.current) {
            const video = shakaRef.current.getMediaElement?.() as HTMLVideoElement | null
            if (video && video.paused) video.play().catch(() => {})
          }
        } catch (_) {}
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  // ─── Persistir tela ativa para restore ─────────────────────────────────────
  useEffect(() => {
    try { localStorage.setItem(SCREEN_KEY, appScreen) } catch(_) {}
  }, [appScreen])


  // ─── Roteamento: App Container Rígido (1920x1080) ─────────────────────────
  return (
    <div className="app-root" style={{ position: 'relative', width: 1920, height: 1080, overflow: 'hidden' }}>
      <Suspense fallback={<div style={{ background: '#000', width: 1920, height: 1080 }} />}>
        {appScreen === 'splash' ? (
          <>
            {showDebug && <DebugOverlay />}
            <SplashScreen onDone={() => {
              if (!hasStoredPlaylist()) {
                setAppScreen('setup')
              } else {
                const lastCode = localStorage.getItem('ziiiTV_lastCode')
                const lastUrl  = localStorage.getItem('ziiiTV_lastUrl')
                if (lastCode) loadFromCode(lastCode).catch(() => {})
                else if (lastUrl) loadFromUrl(lastUrl).catch(() => {})
                setAppScreen('profiles')
              }
            }} />
          </>
        ) : appScreen === 'setup' ? (
          <>
            {showDebug && <DebugOverlay />}
            <SetupScreen onComplete={(data: any) => {
              let resolvedUrl = ''
              if (data.playlist_type === 'xtream' && data.xtream_host && data.xtream_user && data.xtream_pass) {
                resolvedUrl = `${data.xtream_host}/get.php?username=${data.xtream_user}&password=${data.xtream_pass}&type=m3u_plus&output=ts`
              } else if (data.playlist_url) {
                resolvedUrl = data.playlist_url
              }
              if (resolvedUrl) {
                // Persiste imediatamente — garante que próximo boot não volta ao SetupScreen
                try { localStorage.setItem('ziiiTV_lastUrl', resolvedUrl) } catch(_) {}
                loadFromUrl(resolvedUrl).catch(() => {})
              }
              setAppScreen('profiles')
            }} />
          </>
        ) : appScreen === 'profiles' ? (
          <>
            {showDebug && <DebugOverlay />}
            <ProfileScreen
              onSelect={() => setAppScreen('home')}
              onEnterCode={() => { setCodeError(null); setAppScreen('code-entry') }}
            />
          </>
        ) : appScreen === 'code-entry' ? (
          <CodeEntryScreen
            loading={codeLoading}
            error={codeError}
            onBack={() => setAppScreen('profiles')}
            onConfirm={async (code) => {
              setCodeLoading(true)
              setCodeError(null)
              try {
                await loadFromCode(code)
                setAppScreen('home')
              } catch (err: any) {
                setCodeError(err.message || 'Código inválido')
              } finally {
                setCodeLoading(false)
              }
            }}
          />
        ) : (
          <>
            {/* SeriesDetailScreen: sobrepõe a Home quando série selecionada */}
            {seriesChannel && (
              <SeriesDetailScreen
                channel={seriesChannel}
                similar={seriesSimilar}
                onBack={() => { setSeriesChannel(null); setSeriesSimilar([]) }}
                onPlay={(url, label) => {
                  const ch = {
                    ...seriesChannel,
                    activeStream: { url, quality: 'UNKNOWN' as const, label },
                    streams: [{ url, quality: 'UNKNOWN' as const, label }],
                  }
                  setSeriesChannel(null)
                  setCurrentChannel(ch)
                }}
              />
            )}

            {/* HomeScreen: montada uma vez, CSS-hidden quando o player está ativo. */}
            <div style={{
              display: (currentChannel || seriesChannel) ? 'none' : 'block',
              pointerEvents: (currentChannel || seriesChannel) ? 'none' : 'auto',
            }}>
              <FullscreenOverlay onEnterPlayerMode={(ch) => setCurrentChannel(ch)} />
              <HomeScreen
                groups={normalizedGroups}
                onPlay={(ch) => {
                  // Série com episódios → abre SeriesDetailScreen
                  const isSeries = (ch as any).canonical?.type === 'series'
                  const hasEpisodes = ch.streams?.some(s => /S\d+E\d+/i.test(s.label))
                  if (isSeries && hasEpisodes) {
                    const streaming = (ch as any).canonical?.streaming
                    const allChannels = Object.values(normalizedGroups || {}).flat()
                    const similar = allChannels
                      .filter((c: any) => {
                        const canon = c.canonical
                        if (!canon || c.id === ch.id) return false
                        const hasPoster = !!(canon.poster || canon.backdrop)
                        if (!hasPoster) return false
                        if (streaming && streaming !== 'unknown' && canon.streaming === streaming) return true
                        return canon.type === 'series'
                      })
                      .sort((a: any, b: any) => (b.canonical?.rating || 0) - (a.canonical?.rating || 0))
                      .slice(0, 12)
                    setSeriesSimilar(similar)
                    setSeriesChannel(ch)
                    return
                  }
                  const backdrop = ch.tmdb?.backdrop || ch.logo || ''
                  const img = backdrop.startsWith('http') ? backdrop : backdrop ? `https://image.tmdb.org/t/p/w780${backdrop}` : ''
                  transitionStore.show(img, 'Carregando...')
                  setCurrentChannel(ch)
                }}
                onBack={() => {
                  const tizen = (window as any).tizen
                  if (tizen?.application) {
                    tizen.application.getCurrentApplication().exit()
                  }
                }}
              />
            </div>

            {/* TransitionOverlay e DebugOverlay ficam fora do wrapper — visíveis em todos os estados */}
            <TransitionOverlay />
            {showDebug && <DebugOverlay />}

            {/* PlayerScreen: montado sobre a HomeScreen quando canal selecionado */}
            {currentChannel && (
              <PlayerScreen
                channel={currentChannel}
                onShakaReady={(player) => { shakaRef.current = player }}
                onReady={() => transitionStore.hide()}
                onBack={() => {
                  if (expandManager.isSeamlessActive() && expandManager.getChannel()?.id === currentChannel.id) {
                    expandManager.triggerCollapse()
                    setCurrentChannel(null)
                    keyboardMaestro.setActiveView('main')
                    window.dispatchEvent(new CustomEvent('ziiiTV:playerClosed'))
                    document.body.focus()
                    return
                  }
                  // Tenta shrink back para o card (retoma preview)
                  const shrunk = playerManager.shrinkToCard()
                  if (shakaRef.current) {
                    try { shakaRef.current.destroy() } catch(_) {}
                    shakaRef.current = null
                  }
                  if (!shrunk) {
                    try { const av = (window as any).webapis?.avplay; if (av) av.stop() } catch(_) {}
                  }
                  setCurrentChannel(null)
                  keyboardMaestro.setActiveView('main')
                  // Força re-scroll para a row focada após fechar o player
                  window.dispatchEvent(new CustomEvent('ziiiTV:playerClosed'))
                  document.body.focus()
                }}
              />
            )}
          </>
        )}
      </Suspense>
    </div>
  )
}
