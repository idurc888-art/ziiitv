/**
 * PlayerManager — Singleton Player externo (estilo Netflix)
 * Gerencia a instância global do AVPlay fora do ciclo de vida do React.
 * 
 * ARQUITETURA:
 * - isAVPlayBusy (Booleano Síncrono) para prevenir PLAYER_ERROR_INVALID_STATE (code: 11)
 * - Cancelamento fire-and-forget: sem promises bloqueando o event-loop!
 * - O <object> AVPlay NUNCA é movido no DOM (zero recomposição Chromium)
 */

import { Logger } from './LoggerService'
import { saveWatchProgress, saveHeroOffset, getHeroOffset } from './historyService'

type PlayerState = 'IDLE' | 'OPENING' | 'PREPARING' | 'READY' | 'PLAYING' | 'STOPPING'

let isAVPlayBusy = false

export function safeRelease(avplay: any) {
  if (!avplay) return
  try { avplay.stop() } catch (_) {}
  try { avplay.close() } catch (_) {}
  isAVPlayBusy = false
}

function getGoldenOffset(url: string): number {
  if (/\/(live|lives|ao-vivo)\//i.test(url)) return 0
  if (/\/series\//i.test(url)) return 90000
  if (/\/movie\//i.test(url)) return 240000
  return 120000
}

function getStreamType(url: string): 'hls' | 'dash' | 'mp4' | 'ts' | 'unknown' {
  if (url.includes('.m3u8')) return 'hls'
  if (url.includes('.mpd'))  return 'dash'
  if (url.includes('.mp4'))  return 'mp4'
  if (url.includes('.ts'))   return 'ts'
  return 'unknown'
}

class PlayerManager {
  private currentUrl: string | null = null
  private currentChannelName: string = ''
  private state: PlayerState = 'IDLE'
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private FOCUS_DELAY = 800
  private avObject: HTMLObjectElement | null = null
  private GLOBAL_OBJECT_ID = 'avplay-global-preview'
  private manifestCache = new Map<string, Promise<any>>()
  private cancellingCallback: (() => void) | null = null
  private skipSeekOnReady = false
  private prepareGeneration = 0  // incrementa a cada executePlay — invalida callbacks antigos

  constructor() {}

  public init(): void {
    if (this.avObject || typeof window === 'undefined') return
    
    this.avObject = document.createElement('object')
    this.avObject.id = this.GLOBAL_OBJECT_ID
    this.avObject.type = 'application/avplayer'
    // Âncora fixa no body: o setDisplayRect() posiciona a layer de hardware em cima disso.
    // NÃO mover este elemento — qualquer reflow pode dessincronizar o chip de vídeo.
    this.avObject.style.position = 'fixed'
    this.avObject.style.left = '0px'
    this.avObject.style.top = '0px'
    this.avObject.style.width = '1px'
    this.avObject.style.height = '1px'
    this.avObject.style.zIndex = '0'
    this.avObject.style.background = 'transparent'
    this.avObject.style.pointerEvents = 'none'
    document.body.appendChild(this.avObject)
    
    Logger.hw('INIT', 'Motor de vídeo inicializado (DOM Object criado)')
  }

  private getAV(): any {
    return (window as any).webapis?.avplay || null
  }

  public isAvailable(): boolean { return !!this.getAV() }
  public isPlaying(): boolean { return this.state === 'PLAYING' }
  public getCurrentChannelName(): string { return this.currentChannelName }
  public getCurrentUrl(): string | null { return this.currentUrl }
  public getGlobalObjectId(): string { return this.GLOBAL_OBJECT_ID }
  public saveCardRect(_rect: { x: number; y: number; w: number; h: number }): void {}
  public getStartMs(): number {
    const saved = getHeroOffset(this.currentChannelName)
    return saved > 15000 ? saved - 10000 : getGoldenOffset(this.currentUrl || '')
  }

  public prefetchManifest(url: string): void {
    if (!url || this.manifestCache.has(url)) return
    if (!/\.(m3u8|mpd)(\?|$)/i.test(url)) return  // TS direto não tem manifesto — evita TCP leak
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    const p = fetch(url, { signal: controller.signal })
      .then(() => clearTimeout(timeout))
      .catch(() => { clearTimeout(timeout); this.manifestCache.delete(url) })
    this.manifestCache.set(url, p)
  }

  // ─── Interface Pública Fire-and-Forget ────────────────────────────────

  public requestPlay(
    channelName: string,
    previewUrl: string,
    _mainUrl: string,
    getRectFn: () => { x: number; y: number; w: number; h: number },
    callbacks: {
      onPlaying: () => void
      onFirstFrameRendered: () => void
      onLoading: () => void
      onError: () => void
      onCancelling?: () => void
    },
    _opts?: { seekToMs?: number }
  ): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }

    this.currentUrl = previewUrl
    this.currentChannelName = channelName
    this.cancellingCallback = callbacks.onCancelling || null

    this.debounceTimer = setTimeout(() => {
      // Fix Tizen jump via requestAnimationFrame
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (this.currentUrl !== previewUrl) return
          const rect = getRectFn()
          callbacks.onLoading()
          this.executePlay(previewUrl, rect, callbacks)
        })
      })
    }, this.FOCUS_DELAY)
  }

  private executePlay(
    url: string,
    rect: { x: number; y: number; w: number; h: number },
    callbacks: {
      onPlaying: () => void
      onFirstFrameRendered: () => void
      onError: () => void
    }
  ): void {
    const av = this.getAV()
    if (!av) return
    if (this.currentUrl !== url) return

    if (isAVPlayBusy) {
      Logger.hw('QUEUE', 'Player ocupado, abortando silenciosamente.')
      callbacks.onError()
      return
    }

    this.state = 'OPENING'
    isAVPlayBusy = true
    
    // Assegura estado limpo atômico (Sem async/await que trave CPU)
    try { av.stop() } catch (_) {}
    try { av.close() } catch (_) {}

    Logger.hw('STATE', `OPENING url=${url.substring(0, 60)}...`)
    
    try {
      av.open(url)
    } catch (e: any) {
      isAVPlayBusy = false
      this.state = 'IDLE'
      callbacks.onError()
      return
    }

    try { av.setStreamingProperty('INITIAL_BUFFER', '4000') } catch (_) {}
    try { av.setStreamingProperty('PENDING_BUFFER', '8000') } catch (_) {}
    try { av.setVolume(0) } catch (_) {}

    this.state = 'PREPARING'
    let isFirstFrameFired = false
    let lastTimeUpdate = 0
    const startMs = this.getStartMs()
    const streamType = getStreamType(url)

    // HLS: START_POSITION antes do prepare → sem seekTo depois
    if (streamType === 'hls' && startMs > 0) {
      try { av.setStreamingProperty('START_POSITION', String(startMs)) } catch (_) {}
      this.skipSeekOnReady = true
    } else {
      this.skipSeekOnReady = false
    }

    try {
      av.setListener({
        onbufferingstart: () => {},
        onbufferingcomplete: () => {
          if (this.currentUrl !== url) return
          try { av.setVolume(40) } catch (_) {}
          callbacks.onPlaying()
        },
        onstreamcompleted: () => {
          // Stream terminou naturalmente — libera recursos nativos no próximo tick
          // (mesma razão do onerror: evita re-entrância no binding WebKit)
          this.state = 'IDLE'
          setTimeout(() => safeRelease(av), 0)
        },
        oncurrentplaytime: (time: number) => {
          if (time - lastTimeUpdate < 1000) return
          lastTimeUpdate = time
          
          if (time > 100 && !isFirstFrameFired && this.state === 'PLAYING') {
            isFirstFrameFired = true
            callbacks.onFirstFrameRendered()
          }

          // Salva progresso a cada 15s
          if (time % 15000 < 1000) {
            const duration = (() => { try { return av.getDuration() } catch { return 0 } })()
            if (duration > 0) {
              const pct = (time / duration) * 100
              saveWatchProgress(this.currentChannelName, pct)
            }
          }
        },
        onevent: () => {},
        onerror: () => {
          // Tizen Bug Fix: chamar av.stop()/close() sincronamente dentro de um
          // callback AVPlay causa re-entrância no binding nativo → crash + app fecha.
          // Deferindo para o próximo tick, o callback nativo retorna antes do release.
          this.state = 'IDLE'
          setTimeout(() => {
            safeRelease(av)
            callbacks.onError()
          }, 0)
        },
      })
    } catch (_) {}

    try {
      let prepareSettled = false
      const myGeneration = ++this.prepareGeneration
      const prepareTimeout = setTimeout(() => {
        if (prepareSettled || this.prepareGeneration !== myGeneration) return
        prepareSettled = true
        Logger.hw('TIMEOUT', `prepareAsync sem resposta em 16s — ${url.substring(0, 60)}`)
        safeRelease(av)
        this.state = 'IDLE'
        callbacks.onError()
      }, 16000)

      av.prepareAsync(
        () => {
          if (prepareSettled || this.prepareGeneration !== myGeneration) {
            clearTimeout(prepareTimeout)
            return
          }
          clearTimeout(prepareTimeout)
          if (prepareSettled || this.currentUrl !== url) {
            safeRelease(av)
            this.state = 'IDLE'
            return
          }
          prepareSettled = true
          this.state = 'READY'
          
          try {
            // TIZEN: setDisplayRect() posiciona a layer de hardware.
            // Para não sofrer Webkit clipping em TVs antigas, o DOM object deve acompanhar os bounds também.
            if (this.avObject) {
              this.avObject.style.left = `${rect.x}px`
              this.avObject.style.top = `${rect.y}px`
              this.avObject.style.width = `${rect.w}px`
              this.avObject.style.height = `${rect.h}px`
            }
            av.setDisplayRect(rect.x, rect.y, rect.w, rect.h)
            this.lastPlayRect = { ...rect }
            try { av.setDisplayMethod('PLAYER_EXTERNAL_OUTPUT_MODE_NONE') } catch (_) {}
          } catch (e) {
            safeRelease(av)
            this.state = 'IDLE'
            return
          }

          try {
            // Fallback 500ms: dispara onFirstFrameRendered se oncurrentplaytime não veio
            setTimeout(() => {
              if (this.state === 'PLAYING' && !isFirstFrameFired) {
                isFirstFrameFired = true
                callbacks.onFirstFrameRendered()
              }
            }, 500)

            if (!this.skipSeekOnReady && startMs > 0) {
              av.seekTo(
                startMs,
                () => {
                  console.log('[AVPlay] seekTo OK:', startMs)
                  av.play()
                  this.state = 'PLAYING'
                  isAVPlayBusy = false
                },
                () => {
                  av.play()
                  this.state = 'PLAYING'
                  isAVPlayBusy = false
                }
              )
              return
            }

            av.play()
            this.state = 'PLAYING'
            isAVPlayBusy = false
          } catch (e) {
            safeRelease(av)
            this.state = 'IDLE'
            callbacks.onError()
          }
        },
        () => {
          clearTimeout(prepareTimeout)
          if (prepareSettled || this.prepareGeneration !== myGeneration) return
          prepareSettled = true
          safeRelease(av)
          this.state = 'IDLE'
          callbacks.onError()
        }
      )
    } catch (e) {
      safeRelease(av)
      this.state = 'IDLE'
      callbacks.onError()
    }
  }

  // ─── Hardware-Accelerated Seamless Fullscreen ────────────────────────────

  private savedRect: { x: number; y: number; w: number; h: number } | null = null
  private lastPlayRect: { x: number; y: number; w: number; h: number } | null = null

  // upgradeUrl: melhor qualidade disponível (4K/FHD) — se diferente do preview (HD),
  // expande imediatamente e troca a stream em background após 600ms.
  public expandToFullscreen(upgradeUrl?: string): void {
    const av = this.getAV()
    if (!av || (this.state !== 'READY' && this.state !== 'PLAYING')) return

    this.savedRect = this.lastPlayRect ? { ...this.lastPlayRect } : null

    // Passo 1: expande o stream atual imediatamente (sem preto)
    try { av.setVolume(100) } catch (_) {}
    try {
      if (this.avObject) {
        this.avObject.style.left = '0px'
        this.avObject.style.top = '0px'
        this.avObject.style.width = '1920px'
        this.avObject.style.height = '1080px'
      }
      av.setDisplayRect(0, 0, 1920, 1080)
    } catch (_) {}

    // Passo 2: se existir qualidade superior (4K/FHD), troca em background
    // O preto da troca fica oculto durante os primeiros 600ms da animação de expand
    if (upgradeUrl && upgradeUrl !== this.currentUrl) {
      setTimeout(() => {
        if (this.state !== 'PLAYING') return
        this.currentUrl = upgradeUrl
        this.executePlay(upgradeUrl, { x: 0, y: 0, w: 1920, h: 1080 }, {
          onPlaying: () => { try { av.setVolume(100) } catch (_) {} },
          onFirstFrameRendered: () => {},
          onError: () => {},
        })
      }, 600)
    }
  }

  public shrinkToCard(): boolean {
    if (this.state !== 'PLAYING' || !this.lastPlayRect) return false
    // Usa o lastPlayRect como savedRect se não tiver savedRect
    if (!this.savedRect) this.savedRect = { ...this.lastPlayRect }
    this.collapseToCard()
    return true
  }

  public collapseToCard(): void {
    const av = this.getAV()
    if (!av || this.state !== 'PLAYING' || !this.savedRect) return

    // Restaura zIndex para preview no card
    if (this.avObject) this.avObject.style.zIndex = '0'

    try { av.setVolume(40) } catch (_) {}
    try {
      if (this.avObject) {
        this.avObject.style.left = `${this.savedRect.x}px`
        this.avObject.style.top = `${this.savedRect.y}px`
        this.avObject.style.width = `${this.savedRect.w}px`
        this.avObject.style.height = `${this.savedRect.h}px`
      }
      av.setDisplayRect(this.savedRect.x, this.savedRect.y, this.savedRect.w, this.savedRect.h)
    } catch (_) {}
    this.savedRect = null
  }

  public cancelRequest(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    const av = this.getAV()
    if (av && (this.state === 'PLAYING' || this.state === 'READY') && this.currentChannelName) {
      try {
        const t = av.getCurrentTime()
        if (t > 5000) {
          saveHeroOffset(this.currentChannelName, t)
          console.log('[History] heroOffset salvo:', this.currentChannelName, t)
        }
      } catch (_) {}
    }

    // Overlay preto cobre o último frame visível antes do safeRelease
    if (this.cancellingCallback && this.state === 'PLAYING') {
      this.cancellingCallback()
      this.currentUrl = null
      setTimeout(() => this._doCancel(av), 150)
      return
    }

    this.currentUrl = null
    this._doCancel(av)
  }

  private _doCancel(av: any): void {
    if (this.currentUrl !== null) return
    if (av && this.state !== 'IDLE') {
      safeRelease(av)
      this.state = 'IDLE'
      try { av.setDisplayRect(-1000, -1000, 1, 1) } catch (_) {}
    }
    if (this.avObject) {
      this.avObject.style.left = '-1000px'
      this.avObject.style.top = '-1000px'
      this.avObject.style.width = '1px'
      this.avObject.style.height = '1px'
    }
    this.cancellingCallback = null
  }

  // ─── Fullscreen unificado para PlayerScreen ──────────────────────────────
  // Se o preview já está tocando o mesmo canal → expande sem reiniciar
  // Se não → toca do zero em fullscreen
  public requestFullscreenPlay(
    channelName: string,
    url: string,
    onPlaying: () => void,
    onError: () => void
  ): void {
    const av = this.getAV()
    if (!av) { onError(); return }

    const cleanUrl = url.split('#')[0]
    const sameChannel = this.currentChannelName === channelName &&
      (this.state === 'PLAYING' || this.state === 'READY')

    if (sameChannel) {
      Logger.hw('FULLSCREEN', `Adotando preview: ${channelName}`)
      if (this.debounceTimer) { clearTimeout(this.debounceTimer); this.debounceTimer = null }
      try { av.setVolume(100) } catch (_) {}
      if (this.avObject) {
        this.avObject.style.left = '0px'
        this.avObject.style.top = '0px'
        this.avObject.style.width = '1920px'
        this.avObject.style.height = '1080px'
      }
      try { av.setDisplayRect(0, 0, 1920, 1080) } catch (_) {}
      onPlaying()
      return
    }

    // Não está tocando — cancela preview e toca do zero em fullscreen
    Logger.hw('FULLSCREEN', `Novo play fullscreen: ${channelName}`)
    if (this.debounceTimer) { clearTimeout(this.debounceTimer); this.debounceTimer = null }
    if (isAVPlayBusy) { safeRelease(av) }

    this.currentUrl = cleanUrl
    this.currentChannelName = channelName
    this.skipSeekOnReady = true

    this.executePlay(cleanUrl, { x: 0, y: 0, w: 1920, h: 1080 }, {
      onPlaying,
      onFirstFrameRendered: onPlaying,
      onError,
    })
  }
}

export const playerManager = new PlayerManager()
