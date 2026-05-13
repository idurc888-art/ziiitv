/**
 * PlayerManager — Singleton Player externo (estilo Netflix)
 * Gerencia a instância global do AVPlay fora do ciclo de vida do React.
 *
 * ARQUITETURA:
 * - isAVPlayBusy (Booleano Síncrono) — ÚNICA fonte de verdade para estado hardware
 * - FIX #2: avplayService.ts foi esvaziado; este é o único gestor de estado
 * - Cancelamento fire-and-forget: sem promises bloqueando o event-loop!
 * - O <object> AVPlay NUNCA é movido no DOM (zero recomposição Chromium)
 */

import { Logger } from './LoggerService'

type PlayerState = 'IDLE' | 'OPENING' | 'PREPARING' | 'READY' | 'PLAYING' | 'STOPPING'

// ★ ÚNICA variável isAVPlayBusy em todo o projeto
let isAVPlayBusy = false

export function safeRelease(avplay: any) {
  if (!avplay) return
  try { avplay.stop() } catch (_) {}
  try { avplay.close() } catch (_) {}
  isAVPlayBusy = false
}

class PlayerManager {
  private currentUrl: string | null = null
  private state: PlayerState = 'IDLE'
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private FOCUS_DELAY = 1500
  private avObject: HTMLObjectElement | null = null
  private GLOBAL_OBJECT_ID = 'avplay-global-preview'
  private manifestCache = new Map<string, Promise<any>>()

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
  public getCurrentUrl(): string | null { return this.currentUrl }
  public getGlobalObjectId(): string { return this.GLOBAL_OBJECT_ID }

  /** Chamado por avplayService.avplayStop() para manter estado sincronizado */
  public notifyExternalStop(): void {
    isAVPlayBusy = false
    this.state = 'IDLE'
    this.currentUrl = null
  }

  public prefetchManifest(url: string): void {
    if (!url || this.manifestCache.has(url)) return
    const p = fetch(url).then(() => {}).catch(() => { this.manifestCache.delete(url) })
    this.manifestCache.set(url, p)
  }

  // ─── Interface Pública Fire-and-Forget ────────────────────────────────

  public requestPlay(
    previewUrl: string,
    _mainUrl: string,
    getRectFn: () => { x: number; y: number; w: number; h: number },
    callbacks: {
      onPlaying: () => void
      onFirstFrameRendered: () => void
      onLoading: () => void
      onError: () => void
    }
  ): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }

    this.currentUrl = previewUrl

    this.debounceTimer = setTimeout(() => {
      const rect = getRectFn()
      callbacks.onLoading()
      this.executePlay(previewUrl, rect, callbacks)
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

    try { av.stop() } catch (_) {}
    try { av.close() } catch (_) {}

    Logger.hw('STATE', `OPENING url=${url.substring(0, 60)}...`)

    try {
      av.open(url)

      av.setDisplayRect(rect.x, rect.y, rect.w, rect.h)
      try { av.setDisplayMethod('PLAYER_EXTERNAL_OUTPUT_MODE_NONE') } catch (_) {}

      this.state = 'PREPARING'

      av.setListener({
        onbufferingstart: () => {},
        onbufferingcomplete: () => {
          if (this.currentUrl !== url) return
          callbacks.onPlaying()
          this.state = 'PLAYING'
          isAVPlayBusy = false
        },
        onstreamcompleted: () => {
          try { av.seekTo(0); av.play() } catch (_) {}
        },
        oncurrentplaytime: () => {},
        onevent: () => {},
        onerror: (msg: string) => {
          Logger.hw('ERROR', `AVPlay error: ${msg}`)
          isAVPlayBusy = false
          this.state = 'IDLE'
          callbacks.onError()
        },
      })

      av.prepareAsync(
        () => {
          if (this.currentUrl !== url) {
            try { av.stop(); av.close() } catch (_) {}
            isAVPlayBusy = false
            this.state = 'IDLE'
            return
          }
          try {
            av.play()
            callbacks.onFirstFrameRendered()
          } catch (e) {
            isAVPlayBusy = false
            this.state = 'IDLE'
            callbacks.onError()
          }
        },
        () => {
          isAVPlayBusy = false
          this.state = 'IDLE'
          callbacks.onError()
        }
      )
    } catch (e: any) {
      Logger.hw('EXCEPTION', e?.message ?? String(e))
      isAVPlayBusy = false
      this.state = 'IDLE'
      callbacks.onError()
    }
  }

  /**
   * Toca em tela cheia (fullscreen) — usado pelo PlayerScreen.
   * Adota o preview se a mesma URL já está no hardware.
   */
  public requestFullscreenPlay(
    _channelName: string,
    url: string,
    onSuccess: () => void,
    onError: (msg?: string) => void
  ): void {
    const av = this.getAV()
    if (!av) {
      Logger.hw('DEV', 'AVPlay indisponível — modo dev simulado')
      setTimeout(onSuccess, 300)
      return
    }

    // Se o mesmo URL já está em PLAYING (preview do card), só expande o rect
    if (this.state === 'PLAYING' && this.currentUrl === url) {
      try {
        av.setDisplayRect(0, 0, 1920, 1080)
        Logger.hw('ADOPT', 'Preview adotado → fullscreen')
        onSuccess()
        return
      } catch (_) {}
    }

    // Para qualquer coisa anterior
    if (isAVPlayBusy) {
      try { av.stop() } catch (_) {}
      try { av.close() } catch (_) {}
      isAVPlayBusy = false
    }

    isAVPlayBusy = true
    this.state = 'OPENING'
    this.currentUrl = url

    try { av.stop() } catch (_) {}
    try { av.close() } catch (_) {}

    try {
      av.open(url)
      av.setDisplayRect(0, 0, 1920, 1080)
      try { av.setDisplayMethod('PLAYER_EXTERNAL_OUTPUT_MODE_NONE') } catch (_) {}

      av.setListener({
        onbufferingstart: () => {},
        onbufferingcomplete: () => {},
        onstreamcompleted: () => {},
        oncurrentplaytime: () => {},
        onevent: () => {},
        onerror: (msg: string) => {
          isAVPlayBusy = false
          this.state = 'IDLE'
          onError(msg)
        },
      })

      av.prepareAsync(
        () => {
          if (this.currentUrl !== url) {
            try { av.stop(); av.close() } catch (_) {}
            isAVPlayBusy = false
            this.state = 'IDLE'
            return
          }
          try {
            av.play()
            this.state = 'PLAYING'
            isAVPlayBusy = false
            onSuccess()
          } catch (e: any) {
            isAVPlayBusy = false
            this.state = 'IDLE'
            onError(e?.message)
          }
        },
        (err: any) => {
          isAVPlayBusy = false
          this.state = 'IDLE'
          onError(typeof err === 'string' ? err : 'prepareAsync falhou')
        }
      )
    } catch (e: any) {
      isAVPlayBusy = false
      this.state = 'IDLE'
      onError(e?.message ?? String(e))
    }
  }

  public cancelRequest(): void { this.requestStop() }

  public requestStop(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    this.currentUrl = null
    const av = this.getAV()
    if (!av) return
    try { av.stop() } catch (_) {}
    try { av.close() } catch (_) {}
    isAVPlayBusy = false
    this.state = 'IDLE'
  }
}

export const playerManager = new PlayerManager()
