import { useEffect, useRef, useState } from 'react'
import { useChannelsStore } from './store/channelsStore'
import DebugOverlay from './components/DebugOverlay'
import PlayerScreen from './screens/PlayerScreen/PlayerScreen'
import SplashScreen from './screens/SplashScreen/SplashScreen'
import ProfileScreen from './screens/ProfileScreen/ProfileScreen'
import HomeScreen from './screens/HomeScreen/HomeScreen'
import SetupScreen from './screens/SetupScreen/SetupScreen'
import TransitionOverlay from './components/TransitionOverlay'
import FullscreenOverlay from './components/FullscreenOverlay'
import { keyboardMaestro } from './services/keyboardManager'
import { expandManager } from './services/expandManager'
import { AuthService } from './services/authService'
import { Logger } from './services/LoggerService'
import type { PairToken } from './services/pairingService'

// ★ FIX #3 — URL de teste nunca entra no bundle de produção
const TEST_M3U_URL = import.meta.env.DEV
  ? (import.meta.env.VITE_TEST_M3U_URL || '')
  : ''

type AppScreen = 'splash' | 'setup' | 'profiles' | 'home'

/** Retorna true se o usuário já tem uma playlist configurada */
function hasStoredPlaylist(): boolean {
  try {
    return !!(localStorage.getItem('ziiiTV_lastUrl') || localStorage.getItem('ziiiTV_lastCode'))
  } catch (_) {
    return false
  }
}

export default function App() {
  const normalizedGroups  = useChannelsStore(s => s.normalizedGroups)
  const loadFromUrl       = useChannelsStore(s => s.loadFromUrl)
  const loadFromCode      = useChannelsStore(s => s.loadFromCode)
  const currentChannel    = useChannelsStore(s => s.currentChannel)
  const setCurrentChannel = useChannelsStore(s => s.setCurrentChannel)

  // Sempre começa em 'splash'; a lógica de boot decide para onde ir depois
  const [appScreen, setAppScreen] = useState<AppScreen>('splash')
  const [showDebug, setShowDebug] = useState(false)

  useEffect(() => {
    keyboardMaestro.init()
    return () => keyboardMaestro.destroy()
  }, [])

  useEffect(() => {
    const view = currentChannel ? 'player' : appScreen === 'profiles' ? 'profiles' : 'main'
    keyboardMaestro.setActiveView(view)
  }, [appScreen, currentChannel])

  // ─── Teclas Globais e BACK Handling ────────────────────────────────────────
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // 403 = Botão Vermelho (Red) na TV Samsung
      if (e.keyCode === 403 || e.key === 'r') {
        setShowDebug(prev => !prev)
      }

      const isBack = e.keyCode === 10009 || e.keyCode === 8 || e.key === 'Backspace'
      if (isBack) {
        if (expandManager.isExpanded()) {
          e.preventDefault()
          e.stopPropagation()
          expandManager.triggerCollapse()
          setCurrentChannel(null)
        }
      }
    }
    keyboardMaestro.subscribe('global:app', handleKey)
    return () => keyboardMaestro.unsubscribe('global:app')
  }, [])

  const shakaRef = useRef<any>(null)

  // ─── Boot: SplashScreen → decide fluxo após auth + playlist ──────────────
  useEffect(() => {
    const tStart = performance.now()

    Promise.all([
      AuthService.checkUserAuth(),
    ]).then(() => {
      const elapsed = performance.now() - tStart
      Logger.boot('AUTH_READY', `Auth pronto em ${elapsed.toFixed(0)}ms`)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Chamado pela SplashScreen ao terminar.
   * FIX #1 — Detecta se é primeiro uso (sem playlist) e redireciona para SetupScreen.
   */
  function handleSplashDone() {
    if (!hasStoredPlaylist()) {
      // Primeiro uso: sem playlist salva → SetupScreen (QR pairing)
      setAppScreen('setup')
      return
    }

    // Usuário já tem playlist — carrega em paralelo e vai pra profiles
    const lastCode = localStorage.getItem('ziiiTV_lastCode')
    const lastUrl  = localStorage.getItem('ziiiTV_lastUrl') || TEST_M3U_URL

    if (lastCode) {
      loadFromCode(lastCode).catch(console.error)
    } else if (lastUrl) {
      loadFromUrl(lastUrl).catch(console.error)
    }

    setAppScreen('profiles')
  }

  /**
   * Chamado pela SetupScreen quando o pairing é completado com sucesso.
   * FIX #1 — Recebe os dados do PairToken e inicia o carregamento da playlist.
   */
  function handleSetupComplete(data: PairToken) {
    if (data.playlist_type === 'xtream' && data.xtream_host && data.xtream_user && data.xtream_pass) {
      // Xtream: monta URL M3U a partir das credenciais
      const url = `${data.xtream_host}/get.php?username=${data.xtream_user}&password=${data.xtream_pass}&type=m3u_plus&output=ts`
      loadFromUrl(url).catch(console.error)
    } else if (data.playlist_url) {
      loadFromUrl(data.playlist_url).catch(console.error)
    }
    setAppScreen('profiles')
  }

  // ─── Samsung: pause/resume ao sair/voltar para o app ─────────────────────
  useEffect(() => {
    const handleVisibility = () => {
      const avplay = (window as any).webapis?.avplay

      if (document.visibilityState === 'hidden') {
        try { avplay?.pause() } catch (_) {}
        try {
          if (shakaRef.current) {
            const video = shakaRef.current.getMediaElement?.() as HTMLVideoElement | null
            if (video && !video.paused) video.pause()
          }
        } catch (_) {}
      } else if (document.visibilityState === 'visible') {
        try { avplay?.play() } catch (_) {}
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

  // ─── Roteamento: App Container Rígido (1920x1080) ─────────────────────────
  return (
    <div className="app-root" style={{ position: 'relative', width: 1920, height: 1080, overflow: 'hidden' }}>

      {currentChannel ? (
        <>
          <TransitionOverlay />
          {showDebug && <DebugOverlay />}
          <PlayerScreen
            channel={currentChannel}
            onShakaReady={(player) => { shakaRef.current = player }}
            onBack={() => {
              if (expandManager.isSeamlessActive() && expandManager.getChannel()?.id === currentChannel.id) {
                expandManager.triggerCollapse()
                setCurrentChannel(null)
                return
              }
              if (shakaRef.current) {
                try { shakaRef.current.destroy() } catch (_) {}
              }
              try {
                const av = (window as any).webapis?.avplay
                if (av) av.stop()
              } catch (_) {}
              shakaRef.current = null
              setCurrentChannel(null)
              document.body.focus()
            }}
          />
        </>
      ) : appScreen === 'splash' ? (
        <>
          {showDebug && <DebugOverlay />}
          <SplashScreen onDone={handleSplashDone} />
        </>
      ) : appScreen === 'setup' ? (
        // FIX #1 — SetupScreen integrada ao roteamento
        <>
          {showDebug && <DebugOverlay />}
          <SetupScreen onComplete={handleSetupComplete} />
        </>
      ) : appScreen === 'profiles' ? (
        <>
          <TransitionOverlay />
          {showDebug && <DebugOverlay />}
          <ProfileScreen onSelect={() => setAppScreen('home')} />
        </>
      ) : (
        <>
          <FullscreenOverlay onEnterPlayerMode={(ch) => setCurrentChannel(ch)} />
          <TransitionOverlay />
          {showDebug && <DebugOverlay />}
          <HomeScreen
            groups={normalizedGroups}
            onPlay={(ch) => setCurrentChannel(ch)}
            onBack={() => {
              const tizen = (window as any).tizen
              if (tizen?.application) {
                tizen.application.getCurrentApplication().exit()
              }
            }}
          />
        </>
      )}

    </div>
  )
}
