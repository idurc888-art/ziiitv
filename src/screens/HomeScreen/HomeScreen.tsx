import React, { useEffect, useRef, useState } from 'react'
import { keyboardMaestro } from '../../services/keyboardManager'
import type { ContentRow, ScreenContent } from '../../services/contentSelector'
import type { TMDBResult } from '../../services/tmdbService'
import { enrichChannel } from '../../services/tmdbService'
import { expandManager } from '../../services/expandManager'
import { playerManager } from '../../services/PlayerManager'
import { avplayReleaseBusy } from '../../services/avplayService'
import { Logger } from '../../services/LoggerService'
import { loadingObserver } from '../../services/loadingObserver'
import { debugStore } from '../../components/DebugOverlay'
import AutoplayCard from '../../components/AutoplayCard'
import {
    buildHomeContent,
    buildFilmesContent,
    buildSeriesContent,
    buildTvContent
} from '../../services/contentSelector'
import { recordPlay, getWatchProgress, recordNavigation } from '../../services/historyService'
import { quickProbeUrl } from '../../services/streamHealthCheck'
import { mockHeroSlides, type HeroSlide } from '../../components/HeroBanner'
import CopaView from '../CopaScreen/CopaView'
import type { Channel, Stream } from '../../types/channel'
import { QUALITY_BADGE_COLOR } from '../../types/channel'
import { getSportsArtwork } from '../../services/sportsArtwork'
import type { HomeScreenProps as Props, FocusZone, DashboardView } from './homeTypes'
import {
    TEXT_MUTED, FOCUS_SCALE, FOCUS_DURATION, FOCUS_EASING, UNFOCUS_OPACITY,
    CATEGORY_ICONS, SIDEBAR_ICONS, TOPBAR_LINKS,
    getAvailableTopbarLinks, getAvailableSidebarIcons,
} from './homeConstants'
import { tmdbImg, getAgeRating, saveNavState, loadNavState, buildInitialCols } from './homeUtils'
import SideCard from '../../components/SideCard'
import HomeSidebar from './HomeSidebar'
import HomeTopBar from './HomeTopBar'
import HomeBanner from './HomeBanner'
import DetailOverlay from './DetailOverlay'

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

// Escala proporcional ao viewport — garante visual idêntico em 1280, 1366 e 1920px
// Base de design: 1920px. Cards de 317px nessa base.
// VW is now a reactive state inside the component — see `vw` below

export default function HomeScreen({ groups, onPlay, onBack, initialView }: Props) {
    const hasChannels = Object.keys(groups ?? {}).length > 0
    const saved = useRef(loadNavState()).current
    const [focusZone, setFocusZone] = useState<FocusZone>('topbar')
    const [sidebarIdx, setSidebarIdx] = useState(0)
    const [topbarIdx, setTopbarIdx] = useState(0)
    const [contentRow, setContentRow] = useState(saved?.contentRow ?? 0)
    // Posição de scroll por aba — persiste dentro da sessão ao trocar de view
    const contentRowPerView = useRef<Partial<Record<DashboardView, number>>>({ home: saved?.contentRow ?? 0 })
    const [contentCols, setContentCols] = useState<number[]>([])
    const [showExit, setShowExit] = useState(false)
    const [exitFocus, setExitFocus] = useState(0)
    // initialView: Copa quando entra sem lista; 'home' caso padrão
    const [activeView, setActiveView] = useState<DashboardView>(initialView ?? 'home')
    const [isLoadingContent, setIsLoadingContent] = useState(false)
    const [content, setContent] = useState<ScreenContent | null>(null)
    const [heroSlides, setHeroSlides] = useState<HeroSlide[]>(mockHeroSlides)

    // ─── Detail Overlay (filmes/séries sem preview rodando) ───────────────
    const [detailChannel, setDetailChannel] = useState<Channel | null>(null)
    const [detailBtnFocus, setDetailBtnFocus] = useState(0)
    const detailChannelRef = useRef<Channel | null>(null)
    const detailBtnFocusRef = useRef(0)

    // ─── Cinema Mode (escurece cards ao redor quando preview roda) ─────────
    const [cinemaMode, setCinemaMode] = useState(false)
    const cinemaModeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const navDirRef = useRef<'left' | 'right' | 'up' | 'down'>('right')
    const moveCountRef = useRef(0)
    const [navTick, setNavTick] = useState(0)

    const activateCinemaMode = () => {
        if (cinemaModeTimerRef.current) clearTimeout(cinemaModeTimerRef.current)
        cinemaModeTimerRef.current = setTimeout(() => {
            setCinemaMode(true)
            Logger.nav('CINEMA_ON', 'overlay ativado após 1500ms')
        }, 1500)
    }
    const deactivateCinemaMode = () => {
        if (cinemaModeTimerRef.current) { clearTimeout(cinemaModeTimerRef.current); cinemaModeTimerRef.current = null }
        setCinemaMode(false)
        Logger.nav('CINEMA_OFF', 'overlay desativado')
    }
    useEffect(() => () => { if (cinemaModeTimerRef.current) clearTimeout(cinemaModeTimerRef.current) }, [])

    // Derivado de content (precisa estar antes dos useEffect que o usam)
    const rows: ContentRow[] = (content?.rows || []).filter(r => r.type !== 'grid')

    // ─── Genre tracking: registra gênero do card focado após 1.5s parado ──
    useEffect(() => {
        if (focusZone !== 'content' || !content) return
        const col = contentCols[contentRow] ?? 0
        const ch = rows[contentRow]?.channels[col]
        if (!ch || ch.isViewAll) return
        const timer = setTimeout(() => {
            const genres: string[] = (ch as any).canonical?.genres || ch.tmdb?.genres || []
            if (genres.length > 0) recordNavigation(genres)
        }, 1500)
        return () => clearTimeout(timer)
    }, [contentRow, contentCols, focusZone])

    // Cor dinâmica: verde para TV ao vivo, rosa para o resto
    const ACCENT = activeView === 'live' ? '#10b981' : '#ff006e'
    const GLOW = activeView === 'live' ? 'rgba(16, 185, 129, 0.4)' : 'rgba(255, 0, 110, 0.4)'
    const FOCUS_BORDER = `3px solid ${ACCENT}`

    // App é IPTV player puro — topbar sempre completo
    const availableTopbarLinks = getAvailableTopbarLinks(true)


    // ─── Display toggle para liberar RAM durante o fullscreen ────────────
    const [homeVisible, setHomeVisible] = useState(true)
    useEffect(() => {
        const unsub = expandManager.registerDisplayCallback((visible) => {
            setHomeVisible(visible)
        })
        return () => { unsub() }
    }, [])

    // ─── Block Rendering Progressivo (Tizen-safe) ──────────────────────
    // Bloco 1: Hero + primeiras 3 rows (instantâneo)
    // Bloco 2: Rows 4-8 (após 500ms de idle)
    // Bloco 3: Restante (on-demand conforme usuário navega)
    const [maxRenderedRow, setMaxRenderedRow] = useState(3)

    // Bloco 2: carrega automaticamente após UI estabilizar
    useEffect(() => {
        if (!isLoadingContent && content && content.rows.length > 3 && maxRenderedRow <= 3) {
            const timer = setTimeout(() => {
                setMaxRenderedRow(Math.min(8, content.rows.length))
            }, 500)
            return () => clearTimeout(timer)
        }
    }, [isLoadingContent, content, maxRenderedRow])

    // Bloco 3: carrega restante após 3s ou se o usuário chegar perto
    useEffect(() => {
        if (!isLoadingContent && content && content.rows.length > 8 && maxRenderedRow >= 4 && maxRenderedRow < content.rows.length) {
            const timer = setTimeout(() => {
                setMaxRenderedRow(content.rows.length)
            }, 3000)
            return () => clearTimeout(timer)
        }
    }, [isLoadingContent, content, maxRenderedRow])

    // Salva posição de contentRow por view para restaurar ao trocar de aba
    useEffect(() => {
        contentRowPerView.current[activeView] = contentRow
    }, [contentRow, activeView])

    // ─── Preload de imagens adjacentes (±3 cards) ─────────────────────
    // Garante que os posters já estejam no cache do browser antes do usuário chegar
    useEffect(() => {
        if (focusZone !== 'content' || !rows[contentRow]) return
        const row = rows[contentRow]
        const col = contentCols[contentRow] || 0
        const total = row.channels.length
        if (total === 0) return

        for (let offset = -3; offset <= 3; offset++) {
            if (offset === 0) continue
            const idx = ((col + offset) % total + total) % total
            const ch = row.channels[idx]
            if (!ch) continue
            const t = row.tmdb?.get(ch.name) || ch.tmdb
            const sart = getSportsArtwork(ch.name)
            const src = sart?.poster || tmdbImg(t?.poster, 'w342') || tmdbImg(t?.backdrop, 'w342') || ch.logo
            if (src) { const img = new Image(); img.src = src }

            // PRELOAD ADICIONAL (Prevenção de Quadrado Preto no AutoPlayCard)
            // O central usa w780 nas imagens do TMDB, então pre-loadamos isso ativamente 
            // para os 3 canais irmãos mais próximos!
            if (Math.abs(offset) <= 2) {
                const backSrc = sart?.backdrop || tmdbImg(t?.backdrop, 'w780') || src
                if (backSrc) { const bimg = new Image(); bimg.src = backSrc }
            }
        }
    }, [contentRow, contentCols, focusZone, rows])

    // ─── Responsive viewport scale (base 1920px) ───────────────────────
    const [vw, setVw] = useState(() =>
        typeof window !== 'undefined' ? window.innerWidth / 1920 : 1
    )
    useEffect(() => {
        const onResize = () => setVw(window.innerWidth / 1920)
        window.addEventListener('resize', onResize)
        return () => window.removeEventListener('resize', onResize)
    }, [])

    // ─── Auto-redirect removido: sem canais = spinner na Home (não vai pra Copa) ────

    // ─── Content cache per view (troca de aba instantânea) ──────────────
    const contentCache = useRef<Partial<Record<DashboardView, ScreenContent>>>({})

    // ─── Load content ──────────────────────────────────────────────────────
    useEffect(() => {
        let cancelled = false

        // Sem canais ainda: aguarda groups popular (não cacheia resultado vazio)
        const groupCount = Object.keys(groups ?? {}).length
        if (groupCount === 0 && activeView !== 'copa') {
            setIsLoadingContent(false)
            return
        }

        // Cache hit: retorna instantâneo (só aceita cache com rows reais)
        const cached = contentCache.current[activeView]
        if (cached && cached.rows.length > 0) {
            setContent(cached)
            setIsLoadingContent(false)
            setContentRow(contentRowPerView.current[activeView] ?? 0)
            setMaxRenderedRow(3)
            setContentCols(prev => {
                if (prev.length === cached.rows.length) return prev
                return buildInitialCols(cached.rows)
            })
            setHeroSlides(buildHeroSlidesFromData(cached, activeView))
            return
        }

        setIsLoadingContent(true)
        const load = async () => {
            loadingObserver.lock()
            try {
                let data: ScreenContent
                const t0 = performance.now()
                switch (activeView) {
                    case 'movies': data = await buildFilmesContent(groups); break
                    case 'series': data = await buildSeriesContent(groups); break
                    case 'live': data = await buildTvContent(groups); break
                    case 'copa': data = { heroChannels: [], heroTmdb: new Map(), rows: [] }; break
                    default: data = await buildHomeContent(groups, (updHero, updRows) => {
                        if (!cancelled) setContent(prev => prev ? { ...prev, heroTmdb: updHero, rows: updRows } : prev)
                    }); break
                }
                Logger.boot('BUILD_CONTENT', `${activeView} em ${(performance.now() - t0).toFixed(1)}ms, ${data.rows.length} rows`)
                if (!cancelled) {
                    playerManager.init()
                    if (data.rows.length > 0) contentCache.current[activeView] = data
                    setContent(data)
                    setIsLoadingContent(false)
                    setContentRow(contentRowPerView.current[activeView] ?? 0)
                    setMaxRenderedRow(3)
                    setContentCols(prev => {
                        if (prev.length === data.rows.length) return prev
                        return buildInitialCols(data.rows)
                    })
                    setHeroSlides(buildHeroSlidesFromData(data, activeView))
                }
            } finally {
                loadingObserver.unlock()
            }
        }
        load()
        return () => { cancelled = true }
    }, [groups, activeView])

    // ─── Helper: build hero slides from ScreenContent ─────────────────────
    function buildHeroSlidesFromData(data: ScreenContent, view: DashboardView): HeroSlide[] {
        if (view === 'home') {
            return data.heroChannels.map((ch, idx) => {
                const tmdb = data.heroTmdb.get(ch.name)
                return {
                    id: `home-${idx}`,
                    title: tmdb?.title || ch.name,
                    subtitle: ch.group || 'destaque',
                    description: tmdb?.overview || `Assista ${ch.name} com a melhor qualidade na ziiiTV.`,
                    badge: 'Em destaque',
                    backgroundImage: tmdbImg(tmdb?.backdrop, 'w1280') || ch.logo || `https://picsum.photos/1920/1080?random=${idx + 300}`,
                    type: 'channel' as const,
                    channel: ch,
                }
            })
        } else if (view === 'live') {
            return data.heroChannels.map((ch, idx) => ({
                id: `slide-${idx}`,
                title: ch.name,
                subtitle: ch.group,
                description: `Assista ${ch.name} ao vivo na ziiiTV.`,
                badge: 'Ao Vivo',
                backgroundImage: ch.logo || `https://picsum.photos/1920/1080?random=${idx + 100}`,
                type: 'live' as const,
                channel: ch
            }))
        } else {
            return data.heroChannels.map((ch, idx) => {
                const tmdb = data.heroTmdb.get(ch.name)
                return {
                    id: `slide-${idx}`,
                    title: tmdb?.title || ch.name,
                    subtitle: view === 'movies' ? 'Filme' : 'Série',
                    description: tmdb?.overview || `Assista ${ch.name} com a melhor qualidade.`,
                    badge: 'Destaque',
                    backgroundImage: tmdbImg(tmdb?.backdrop, 'w1280') || `https://picsum.photos/1920/1080?random=${idx + 200}`,
                    type: view === 'movies' ? 'movie' as const : 'series' as const,
                    tmdbId: tmdb?.tmdbId || undefined,
                    channel: ch
                }
            })
        }
    }

    // ─── Banner Autoplay ──────────────────────────────────────────────────────
    // DESATIVADO: requestPlay() com live HLS fullscreen + cancel mid-prepare
    // corrompe o decoder HW no Tizen 5 (todos os plays seguintes falham com INVALID_STATE).
    // TODO: reimplementar com stream VOD curto (trailer MP4) ou <video> separado.


    const [liveTmdbData, setLiveTmdbData] = useState<Record<string, TMDBResult | null>>({})
    const [debouncedPreview, setDebouncedPreview] = useState<Channel | null>(null)

    const previewChannel = (focusZone === 'content' && rows[contentRow])
        ? rows[contentRow].channels[contentCols[contentRow]] || null
        : null

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedPreview(previewChannel), 250)
        return () => clearTimeout(timer)
    }, [previewChannel])

    useEffect(() => {
        let cancelled = false
        if (debouncedPreview) {
            const name = debouncedPreview.name
            if (liveTmdbData[name] === undefined && !rows[contentRow]?.tmdb?.has(name)) {
                enrichChannel(name).then(res => {
                    if (!cancelled) setLiveTmdbData(prev => ({ ...prev, [name]: res }))
                })
            }
        }
        return () => { cancelled = true }
    }, [debouncedPreview, contentRow, rows, liveTmdbData])

    // ─── Manifest Pre-Warming (Hardware Shielding) ──────────────────────────
    useEffect(() => {
        if (focusZone !== 'content' || !rows[contentRow]) return

        const col = contentCols[contentRow]
        const channels = rows[contentRow].channels

        // Encontra a stream SD
        const getSDStream = (ch: Channel) => {
            if (!ch?.streams?.length) return null
            return [...ch.streams].sort((a, b) => {
                const Q: Record<string, number> = { 'SD': 1, 'HD': 2, 'FHD': 3, '4K': 4 }
                return (Q[a.quality] || 5) - (Q[b.quality] || 5)
            })[0]?.url
        }

        const prevUrl = getSDStream(channels[col - 1])
        const nextUrl = getSDStream(channels[col + 1])

        if (prevUrl) playerManager.prefetchManifest(prevUrl)
        if (nextUrl) playerManager.prefetchManifest(nextUrl)
    }, [focusZone, contentRow, contentCols, rows])

    // Pesos de qualidade para seleção de stream no play final (4K > FHD > HD > SD)
    const PLAY_QUALITY: Record<string, number> = { '4K': 1, 'FHD': 2, 'HD': 3, 'SD': 4, 'UNKNOWN': 5 }
    function sortedByQuality(streams: Stream[]): Stream[] {
        return [...streams].sort((a, b) => (PLAY_QUALITY[a.quality] ?? 5) - (PLAY_QUALITY[b.quality] ?? 5))
    }

    // ─── Probe em background: verifica stream ao focar card ───────────────
    // Resultado fica em cache para ser consultado no onPlay — sem bloquear o D-pad.
    const probeCacheRef = useRef<Record<string, boolean>>({})

    const focusedColIdx = contentCols[contentRow] ?? 0
    useEffect(() => {
        if (focusZone !== 'content') return
        const row = rows[contentRow]
        if (!row || row.type === 'grid') return
        const ch = row.channels[focusedColIdx]
        if (!ch || ch.id in probeCacheRef.current) return
        const bestUrl = sortedByQuality(ch.streams)[0]?.url || ch.activeStream?.url
        if (bestUrl) quickProbeUrl(bestUrl).then(ok => { probeCacheRef.current[ch.id] = ok })
    }, [focusZone, contentRow, focusedColIdx, rows])

    // cancelRequest() obrigatório: a HomeScreen fica CSS-hidden (não unmountada), então
    // o debounce timer do AVPlay preview continuaria rodando sem esse cancel explícito.
    // Sempre seleciona a melhor qualidade disponível. Se o probe marcou a melhor como morta,
    // cai para a próxima na ordem de qualidade.
    function handlePlay(ch: Channel) {
        keyboardMaestro.setActiveView('player') // imediato — não espera React re-render
        // Só cancela o preview se NÃO é o mesmo canal — preserva o stream para adoção no fullscreen
        if (playerManager.getCurrentChannelName() !== ch.name) {
            playerManager.cancelRequest()
            avplayReleaseBusy()
        }
        // Salva rect do card central para shrinkToCard() funcionar ao voltar
        const vw = window.innerWidth / 1920
        const CARD_H = Math.round(475 * 1.10 * vw)
        const CENTRAL_H_val = Math.round(CARD_H * 1.15) + 40
        const CENTRAL_W_val = Math.round(CENTRAL_H_val * 1.77)
        const cLeft = Math.floor((window.innerWidth - CENTRAL_W_val) / 2) - Math.floor(window.innerWidth * 0.10)
        const TITLE_AREA_val = Math.round(65 * vw)
        playerManager.saveCardRect({ x: cLeft, y: TITLE_AREA_val, w: CENTRAL_W_val, h: CENTRAL_H_val })
        const sorted = sortedByQuality(ch.streams)
        const cachedOk = probeCacheRef.current[ch.id]
        const bestStream = (cachedOk === false ? sorted[1] : sorted[0]) || ch.activeStream
        if (!bestStream) { onPlay(ch); return }
        if (cachedOk === false && sorted.length > 1) {
            Logger.nav('PLAY_FALLBACK', `${ch.name} | ${bestStream.quality} | ${bestStream.url?.slice(0, 60)}`)
        } else {
            Logger.nav('PLAY', `${ch.name} | ${bestStream.quality} | ${bestStream.url?.slice(0, 60)}`)
        }
        onPlay({ ...ch, activeStream: bestStream })
    }

    // ─── Refs ─────────────────────────────────────────────────────────────
    const focusZoneRef = useRef(focusZone)
    const sidebarRef = useRef(sidebarIdx)
    const topbarRef = useRef(topbarIdx)
    const contentRowRef = useRef(contentRow)
    const contentColsRef = useRef(contentCols)
    const rowsRef = useRef(rows)
    const showExitRef = useRef(showExit)
    const exitFocusRef = useRef(exitFocus)

    focusZoneRef.current = focusZone
    sidebarRef.current = sidebarIdx
    topbarRef.current = topbarIdx
    contentRowRef.current = contentRow
    contentColsRef.current = contentCols
    rowsRef.current = rows
    showExitRef.current = showExit
    exitFocusRef.current = exitFocus

    // ─── Navegação Vertical Estática (Zero Layout Shift via GPU + Vanilla JS Bypass) ───
    // O translateY é aplicado DIRETAMENTE no DOM via Vanilla JS.
    // Isso evita que o React re-renderize 1300 linhas de código a cada toque no D-pad.
    const rowRefs = useRef<(HTMLDivElement | null)[]>([])
    const rowsWrapRef = useRef<HTMLDivElement | null>(null)
    const prevFocusZoneRef = useRef<string>('topbar')
    const [scrollTick, setScrollTick] = useState(0)

    // Quando player fecha (PlayerScreen ou expand), força re-scroll e garante focusZone = 'content'
    useEffect(() => {
        const handler = () => {
            setScrollTick(t => t + 1)
            setFocusZone('content')
        }
        window.addEventListener('ziiiTV:playerClosed', handler)
        return () => window.removeEventListener('ziiiTV:playerClosed', handler)
    }, [])

    // Quando expand colapsa direto (sem PlayerScreen), também re-foca na grid
    useEffect(() => {
        let mounted = false
        const unsub = expandManager.subscribe((state) => {
            if (!mounted) { mounted = true; return } // ignora disparo inicial do subscribe
            if (state === 'idle') {
                setFocusZone('content')
                setScrollTick(t => t + 1)
            }
        })
        return () => { unsub() }
    }, [])

    useEffect(() => {
        if (!rowsWrapRef.current) return
        const vh = window.innerHeight

        if (focusZone !== 'content') {
            prevFocusZoneRef.current = focusZone
            rowsWrapRef.current.style.transition = 'transform 500ms cubic-bezier(0.2,0,0,1)'
            rowsWrapRef.current.style.transform = `translate3d(0, ${vh * 0.7}px, 0)`
            return
        }
        const comingFromBanner = prevFocusZoneRef.current !== 'content'
        prevFocusZoneRef.current = 'content'
        const row = rowRefs.current[contentRow]
        if (row) {
            const rowTop = row.offsetTop
            const targetScroll = rowTop - 105
            Logger.nav('SCROLL', `row ${contentRow} | rowTop=${rowTop} targetScroll=${targetScroll}`)
            rowsWrapRef.current.style.transition = comingFromBanner ? 'transform 500ms cubic-bezier(0.2,0,0,1)' : 'none'
            rowsWrapRef.current.style.transform = `translate3d(0, -${targetScroll}px, 0)`
        }
    }, [contentRow, focusZone, scrollTick])

    // LEVEZA E LIMPEZA: Log de Memory Flush ao sair da Home
    useEffect(() => {
        return () => {
            Logger.mem('FLUSH', 'HomeScreen unmounted - RAM liberada forçadamente pelo React')
        }
    }, [])

    // ─── D-pad Navigation ────────────────────────────────────────────────
    const lastTRef = useRef(0)

    const onKey = (e: KeyboardEvent) => {
        const now = Date.now()
        if (now - lastTRef.current < 200) return
        lastTRef.current = now

        // Se o expand está ativo (fullscreen via AVPlay), o App.tsx cuida de tudo via 'global:app'.
        // A HomeScreen não deve interferir — evita setFocusZone('topbar') no Back e cancelRequest nas setas.
        if (expandManager.isSeamlessActive()) return

        // BUG 1 FIX: Navegação cancela autoplay, mas Enter NÃO cancela (ele expande para fullscreen).
        // O cancelamento é fire-and-forget: limpa o debounce mas não para o vídeo se já estiver tocando.
        const isNavKey = e.keyCode === 37 || e.keyCode === 38 || e.keyCode === 39 || e.keyCode === 40
        if (focusZoneRef.current === 'content' && isNavKey) {
            playerManager.cancelRequest()
            deactivateCinemaMode()
        }

        // Detail overlay captura teclado exclusivamente enquanto aberto
        if (detailChannelRef.current) {
            e.preventDefault()
            const isOk = e.key === 'Enter' || e.keyCode === 13
            const isBack = e.keyCode === 10009 || e.keyCode === 8 || e.key === 'Backspace'
            const isLR = e.keyCode === 37 || e.keyCode === 39 || e.key === 'ArrowLeft' || e.key === 'ArrowRight'
            if (isBack) {
                setDetailChannel(null); detailChannelRef.current = null
            } else if (isLR) {
                const next = detailBtnFocusRef.current === 0 ? 1 : 0
                setDetailBtnFocus(next); detailBtnFocusRef.current = next
            } else if (isOk) {
                const ch = detailChannelRef.current
                setDetailChannel(null); detailChannelRef.current = null
                if (detailBtnFocusRef.current === 0) { recordPlay(ch.name, ch.group); handlePlay(ch) }
            }
            return
        }

        if (showExitRef.current) {
            if (e.key === 'ArrowLeft' || e.keyCode === 37) { e.preventDefault(); setExitFocus(0) }
            else if (e.key === 'ArrowRight' || e.keyCode === 39) { e.preventDefault(); setExitFocus(1) }
            else if (e.key === 'Enter' || e.keyCode === 13) {
                e.preventDefault()
                if (exitFocusRef.current === 1) onBack()
                else setShowExit(false)
            }
            else if (e.keyCode === 10009 || e.keyCode === 8 || e.key === 'Backspace') {
                e.preventDefault(); setShowExit(false)
            }
            return
        }

        const zone = focusZoneRef.current
        const rw = contentRowRef.current
        const cols = contentColsRef.current
        // Leitura atômica via Zustand fora do ciclo de renderização
        // Instante milissegundos bypass React (usamos o Zustand via dispatch se necessário)
        const allRows = rowsRef.current

        // EXIT — fecha o app imediatamente (obrigatório Samsung)
        if (e.keyCode === 10182) {
            e.preventDefault()
            const tizen = (window as any).tizen
            if (tizen?.application) tizen.application.getCurrentApplication().exit()
            return
        }

        if (e.keyCode === 10009 || e.keyCode === 8 || e.key === 'Backspace') {
            e.preventDefault()
            if (zone === 'sidebar' || zone === 'topbar') { setShowExit(true); setExitFocus(0) }
            else if (zone === 'content') { setFocusZone('topbar') }
            return
        }

        if (e.key === 'Enter' || e.keyCode === 13) {
            e.preventDefault()
            if (zone === 'sidebar') {
                const SIDEBAR_VIEWS: (DashboardView | 'manage-list' | null)[] = ['home', 'movies', 'series', 'live', 'copa', 'manage-list', null]
                const view = SIDEBAR_VIEWS[sidebarRef.current]
                if (view === 'manage-list') {
                    // Remove lista e volta para setup
                    localStorage.removeItem('ziiiTV_lastCode')
                    window.location.reload()
                    return
                }
                if (view) setActiveView(view as DashboardView)
                setFocusZone('topbar')
                return
            }
            if (zone === 'topbar') {
                const item = TOPBAR_LINKS[topbarRef.current]
                if (item?.view) setActiveView(item.view)
                return
            }
            if (zone === 'content') {
                const row = allRows[rw]
                if (row) {
                    if (row.type === 'grid') {
                        const cat = row.channels[cols[rw]]
                        const viewMap: Record<string, DashboardView> = {
                            filmes: 'movies', series: 'series', 'tv ao vivo': 'live',
                            abertos: 'live', esportes: 'live'
                        }
                        setActiveView(viewMap[cat.name.toLowerCase()] || 'home')
                    } else {
                        const ch = row.channels[cols[rw]]
                        if (ch) {
                            // Se o PlayerManager está tocando, dispara expansão fullscreen diretamente
                            if (playerManager.isPlaying()) {
                                playerManager.expandToFullscreen()
                                expandManager.triggerExpand(ch, { x: 0, y: 0, w: 1920, h: 1080 }, 'avplay-global-preview', () => {
                                    playerManager.collapseToCard()
                                    expandManager.markCollapsing()
                                    setTimeout(() => expandManager.markIdle(), 50)
                                })
                                expandManager.markFullscreen()
                                return
                            }
                            // Filme/série sem preview → abre Detail. Live TV → play direto.
                            if (ch.tmdb) {
                                setDetailChannel(ch); detailChannelRef.current = ch
                                setDetailBtnFocus(0); detailBtnFocusRef.current = 0
                            } else {
                                recordPlay(ch.name, ch.group); handlePlay(ch)
                            }
                        }
                    }
                }
            }
            return
        }

        const isDown = e.key === 'ArrowDown' || e.keyCode === 40
        const isUp = e.key === 'ArrowUp' || e.keyCode === 38
        const isRight = e.key === 'ArrowRight' || e.keyCode === 39
        const isLeft = e.key === 'ArrowLeft' || e.keyCode === 37

        if (!(isDown || isUp || isRight || isLeft)) return
        e.preventDefault()

        if (zone === 'sidebar') {
            if (isDown) setSidebarIdx(i => Math.min(i + 1, SIDEBAR_ICONS.length - 1))
            else if (isUp) setSidebarIdx(i => Math.max(i - 1, 0))
            else if (isRight) setFocusZone('topbar')
            return
        }

        if (zone === 'topbar') {
            if (isRight) {
                if (topbarRef.current >= TOPBAR_LINKS.length - 1) {
                    debugStore.toggle()
                } else {
                    setTopbarIdx(i => Math.min(i + 1, TOPBAR_LINKS.length - 1))
                }
            } else if (isLeft) {
                if (topbarRef.current <= 0) setFocusZone('sidebar')
                else setTopbarIdx(i => Math.max(i - 1, 0))
            }
            else if (isDown) { setFocusZone('content'); setContentRow(0) }
            return
        }

        if (zone === 'hero') {
            // Fallback: se o focus ainda tentar cair aqui por erro de cache, mande-o para a grid
            setFocusZone('content')
            return
        }

        if (zone === 'content') {
            const rowData = allRows[rw]
            const isGrid = rowData?.type === 'grid'
            const c = cols[rw]

            if (isDown) {
                navDirRef.current = 'down'
                moveCountRef.current++
                setNavTick(t => t + 1)
                if (isGrid && c < 4 && rowData.channels.length > c + 4) {
                    const next = [...cols]; next[rw] = c + 4; setContentCols(next)
                } else if (rw < allRows.length - 1) {
                    const nextRow = rw + 1
                    setContentRow(nextRow)
                    Logger.nav('ROW_DOWN', `row ${rw} → ${nextRow} | ${allRows[nextRow]?.title || ''}`)
                    if (nextRow >= maxRenderedRow - 1) {
                        setMaxRenderedRow(prev => Math.min(prev + 2, allRows.length))
                    }
                }
            } else if (isUp) {
                navDirRef.current = 'up'
                moveCountRef.current++
                setNavTick(t => t + 1)
                if (isGrid && c >= 4) {
                    const next = [...cols]; next[rw] = c - 4; setContentCols(next)
                } else if (rw === 0) {
                    setFocusZone('topbar')
                    Logger.nav('ZONE', 'content → topbar')
                } else {
                    setContentRow(rw - 1)
                    Logger.nav('ROW_UP', `row ${rw} → ${rw - 1} | ${allRows[rw - 1]?.title || ''}`)
                }
            } else if (isRight) {
                navDirRef.current = 'right'
                moveCountRef.current++
                setNavTick(t => t + 1)
                if (isGrid && (c === 3 || c === 7)) return
                const maxCol = (rowData?.channels.length || 1) - 1
                const next = [...cols]
                next[rw] = c >= maxCol ? 0 : c + 1
                setContentCols(next)
                Logger.nav('COL_RIGHT', `row ${rw} col ${c} → ${next[rw]} | ${rowData?.channels[next[rw]]?.name || ''}`)
            } else if (isLeft) {
                navDirRef.current = 'left'
                moveCountRef.current++
                setNavTick(t => t + 1)
                if (isGrid && (c === 0 || c === 4)) { /* Bloqueado */ }
                else {
                    const maxCol = (rowData?.channels.length || 1) - 1
                    const next = [...cols]
                    next[rw] = c <= 0 ? maxCol : c - 1
                    setContentCols(next)
                    Logger.nav('COL_LEFT', `row ${rw} col ${c} → ${next[rw]} | ${rowData?.channels[next[rw]]?.name || ''}`)
                }
            }
            return
        }
    }

    const handlerRef = useRef(onKey)
    handlerRef.current = onKey

    useEffect(() => {
        keyboardMaestro.subscribe('main', (e) => handlerRef.current(e))
        return () => keyboardMaestro.unsubscribe('main')
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    // ─── Persist ─────────────────────────────────────────────────────────
    useEffect(() => {
        saveNavState({ focusZone, contentRow, contentCols, activeView })
    }, [focusZone, contentRow, contentCols, activeView])

    // ═══════════════════════════════════════════════════════════════════════
    // RENDER
    return (<>
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            // TIZEN HOLE PUNCH: O container raiz DEVE ser transparent.
            // O AVPlay renderiza como layer de hardware ABAIXO do HTML.
            // Qualquer background sólido aqui tamparia 100% do vídeo.
            // Cada seção que precisar de fundo preto tem seu próprio background localizado.
            background: (window as any).tizen ? 'transparent' : '#0a0a12',
            color: '#fff',
            fontFamily: "'Outfit', sans-serif",
            overflow: 'visible',
            opacity: homeVisible ? 1 : 0,
        }}>


            {/* ── SIDEBAR — oculta sem canais, pois não há conteuúdo ───── */}
            {hasChannels && <HomeSidebar focusZone={focusZone} sidebarIdx={sidebarIdx} accent={ACCENT} />}

            {/* ── CORPO PRINCIPAL (tela inteira) ───────────────────────────────── */}
            <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                overflow: 'hidden',
            }}>
                {/* ── TOPBAR ───────────────────────────────────────────────────────── */}
                <HomeTopBar focusZone={focusZone} topbarIdx={topbarIdx} activeView={activeView} accent={ACCENT} links={availableTopbarLinks} />


                {/* ── BANNER ───────────────────────────────────────────────────────── */}
                {heroSlides[0] && (
                    <HomeBanner slide={heroSlides[0]} focusZone={focusZone} accent={ACCENT} glow={GLOW} onPlay={onPlay} />
                )}

                {/* ROWS — scroll próprio, por cima do background */}
                {rows.length === 0 && !isLoadingContent && activeView !== 'copa' && focusZone === 'content' ? (
                    <div style={{
                        position: 'absolute',
                        top: '50%', left: '50%',
                        transform: 'translate(-50%, -50%)',
                        color: '#fff',
                        fontSize: 24,
                        textAlign: 'center',
                        zIndex: 100
                    }}>
                        <div style={{
                            width: 36,
                            height: 36,
                            margin: '0 auto 18px',
                            borderRadius: '50%',
                            border: '3px solid rgba(255,255,255,0.22)',
                            borderTopColor: ACCENT,
                            animation: 'spin 800ms linear infinite',
                        }} />
                        <div>Carregando conteúdo...</div>
                        <div style={{ fontSize: 16, color: '#888', marginTop: 12 }}>
                            {Object.keys(groups).length === 0 ? 'Aguardando playlist...' : 'Processando canais...'}
                        </div>
                    </div>
                ) : null}
                <div
                    id="scroll-viewport"
                    style={{
                        position: 'absolute',
                        top: 0, left: 0, right: 0, bottom: 0,
                        overflow: 'hidden', // Tizen Hardware Otimization: ZERO NATIVE SCROLL
                        zIndex: 15,
                        pointerEvents: focusZone === 'content' ? 'auto' : 'none',
                    }}
                >
                    <div
                        ref={rowsWrapRef}
                        style={{
                            paddingTop: '80px',
                            transition: 'none',
                            willChange: 'transform',
                            opacity: 1,
                            background: 'transparent',
                        }}
                    >
                        {/* Gradiente apenas nas bordas - NAO cobre a area central onde o card fica */}
                        <div style={{
                            position: 'fixed', top: 0, left: 0, right: 0, height: '15%', pointerEvents: 'none', zIndex: 200,
                            background: 'linear-gradient(to bottom, #000 0%, transparent 100%)',
                            opacity: focusZone === 'content' ? 0.7 : 0,
                        }} />
                        <div style={{
                            position: 'fixed', bottom: 0, left: 0, right: 0, height: '15%', pointerEvents: 'none', zIndex: 200,
                            background: 'linear-gradient(to top, #000 0%, transparent 100%)',
                            opacity: focusZone === 'content' ? 0.7 : 0,
                        }} />

                        {/* ESPAÇADOR VIRTUAL ESTÁTICO: Mantém o eixo Y inabalável 
              Isso garante que TODA a home tenha o efeito "Preso" (slot machine instantâneo)
              que antes só acontecia após a linha 4. */}
                        {(() => {
                            const missingTopRows = Math.max(0, 3 - contentRow)
                            if (missingTopRows > 0) {
                                const unFocusedRowHeight = Math.round(475 * 1.10 * vw) + 60
                                return <div style={{ height: missingTopRows * unFocusedRowHeight }} />
                            }
                            return null
                        })()}

                        {rows.map((row, rowIdx) => {
                            // ★ Virtualização Real de DOM: só renderiza rows próximas do foco
                            if (Math.abs(contentRow - rowIdx) > 3) {
                                return null
                            }

                            const isRowFocused = focusZone === 'content' && contentRow === rowIdx
                            // Espaço mínimo para descrição + máxima prévia da próxima row
                            const extraPadding = isRowFocused ? 0 : 0

                            return (
                                <div
                                    ref={el => { rowRefs.current[rowIdx] = el }}
                                    key={rowIdx}
                                    style={{
                                        padding: '24px 0',
                                        paddingBottom: `${24 + extraPadding}px`,
                                        overflow: 'visible',
                                        // Extrema compactação vertical pedida
                                        paddingTop: rowIdx === 0 ? '0px' : '20px'
                                    }}
                                >
                                    {/* ── Título da fileira ─────────────────────────────── */}
                                    {(row.title || row.titleAccent) && (
                                        <div style={{
                                            padding: '0 80px',
                                            marginBottom: 14,
                                            display: 'flex', alignItems: 'baseline', gap: 7,
                                        }}>
                                            {row.title?.trim() && (
                                                <span style={{
                                                    fontSize: 20, fontWeight: 400,
                                                    color: 'rgba(255,255,255,0.42)',
                                                    fontFamily: '"Outfit", sans-serif',
                                                    letterSpacing: 0.3,
                                                }}>{row.title.trim()}</span>
                                            )}
                                            {row.titleAccent?.trim() && (
                                                <span style={{
                                                    fontSize: 20, fontWeight: 800,
                                                    color: '#fff',
                                                    fontFamily: '"Outfit", sans-serif',
                                                    letterSpacing: 0.5,
                                                    textTransform: 'uppercase',
                                                }}>{row.titleAccent.trim()}</span>
                                            )}
                                        </div>
                                    )}

                                    {row.type === 'grid' ? (
                                        <div style={{
                                            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
                                            gap: 24, padding: '0 80px',
                                        }}>
                                            {row.channels.slice(0, 8).map((cat, ci) => {
                                                const focused = focusZone === 'content' && contentRow === rowIdx && contentCols[rowIdx] === ci
                                                const info = CATEGORY_ICONS[cat.name] || { emoji: '📂', color: '#888' }
                                                return (
                                                    <div key={ci} style={{
                                                        height: 140,
                                                        background: focused ? ACCENT : 'rgba(255,255,255,0.03)',
                                                        border: focused ? `1px solid ${ACCENT}` : '1px dashed rgba(255,255,255,0.1)',
                                                        borderRadius: 24,
                                                        display: 'flex', flexDirection: 'column',
                                                        alignItems: 'center', justifyContent: 'center', gap: 12,
                                                        fontSize: 18, fontWeight: 700, textTransform: 'lowercase',
                                                        transformOrigin: 'center center',
                                                        willChange: focused ? 'transform' : 'auto',
                                                        transform: focused ? `scale(${FOCUS_SCALE}) translateY(-8px)` : 'scale(1) translateY(0)',
                                                        boxShadow: focused ? `0 8px 32px rgba(0,0,0,0.55)` : 'none',
                                                        zIndex: focused ? 10 : 0,
                                                        opacity: focused ? 1 : UNFOCUS_OPACITY,
                                                        transition: `transform ${FOCUS_DURATION}ms ${FOCUS_EASING}, box-shadow ${FOCUS_DURATION}ms ${FOCUS_EASING}, opacity ${FOCUS_DURATION}ms ${FOCUS_EASING}`,
                                                        cursor: 'pointer',
                                                    }}>
                                                        <span style={{ fontSize: 28 }}>{info.emoji}</span>
                                                        <span>{cat.name}</span>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    ) : (() => {
                                        // ═══════════════════════════════════════════════════════════════
                                        // LAYOUT TELVIX — Card Central FIXO + Laterais deslizam por trás
                                        // ═══════════════════════════════════════════════════════════════
                                        // REGRA DE OURO: O Card Central NUNCA muda de posição.
                                        // Ele é ancorado em left:50%, translateX(-50%) — INABALÁVEL.
                                        // Os cards laterais é que se movem via translate3d passando
                                        // POR TRÁS do central (z-index inferior).
                                        // ═══════════════════════════════════════════════════════════════
                                        // CARDS LATERAIS (Retrato)
                                        const CARD_W = Math.round(317 * 1.10 * vw)
                                        const CARD_H = Math.round(475 * 1.10 * vw)
                                        // CARD CENTRAL (Cinema 16:9 - Maior por Inteira)
                                        // Usando uma base de altura maior que os laterais (+15%), e largura mantendo a proporção de cinema (~16:9)
                                        const CENTRAL_H = Math.round(CARD_H * 1.15) + 40
                                        const CENTRAL_W = Math.round(CENTRAL_H * 1.77) // 16:9 widescreen ratio

                                        const GAP = Math.round(16 * vw)
                                        const SIDE_GAP = Math.round(24 * vw)
                                        const isRowFocused = focusZone === 'content' && contentRow === rowIdx
                                        const isAbove = rowIdx < contentRow
                                        const TOP_PAD = isRowFocused ? 0 : isAbove ? Math.round(-115 * vw) : Math.round(55 * vw)
                                        const TITLE_AREA = Math.round(10 * vw)
                                        const DESC_AREA = Math.round(80 * vw)
                                        const LATERAL_TOP_OFFSET = (isRowFocused ? TITLE_AREA : TOP_PAD) + Math.round((CENTRAL_H - CARD_H) / 2)
                                        const focusedIndex = contentCols[rowIdx] || 0
                                        const isVirtualRow = Math.abs(contentRow - rowIdx) <= 2

                                        if (!isVirtualRow) return <div style={{ height: CENTRAL_H + 40 }} />

                                        // ── Dados do card central ────────────────────────
                                        const fch = row.channels[focusedIndex]
                                        const fT = row.tmdb?.get(fch?.name || '') || fch?.tmdb
                                        const fCanon = (fch as any)?.canonical
                                        const fSportsArt = getSportsArtwork(fch?.name || '')
                                        const fPosterSrc = fSportsArt?.poster || tmdbImg(fT?.poster, 'w342') || fCanon?.poster || fch?.logo || null
                                        // Card central: apenas backdrops landscape — nunca logo M3U (vertical)
                                        const fBackdropSrc = fSportsArt?.backdrop || tmdbImg(fT?.backdrop, 'w780') || fCanon?.backdrop || null
                                        const fQuality = fch?.activeStream?.quality || 'SD'
                                        const fOverview = fT?.overview || fCanon?.overview || ''

                                        const centralLeft = Math.floor((window.innerWidth - CENTRAL_W) / 2) - Math.floor(window.innerWidth * 0.10)
                                        const uniformCenterLeft = Math.floor((window.innerWidth - CARD_W) / 2) - Math.floor(window.innerWidth * 0.10)

                                        return (
                                            <div style={{
                                                position: 'relative', width: '100%',
                                                height: isRowFocused ? TITLE_AREA + CENTRAL_H + DESC_AREA : CARD_H + Math.round(10 * vw),
                                                overflow: 'visible',
                                                // ZERO ANIMAÇÃO NO HEIGHT DA FILEIRA. Muda de fileira = estica/encolhe IMEDIATAMENTE (Zero Layout Shift)
                                                transition: 'none',
                                            }}>

                                                {(() => {
                                                    const total = row.channels.length
                                                    const slots: Array<{ ch: typeof row.channels[0]; ci: number; offset: number }> = []
                                                    for (let offset = -4; offset <= 5; offset++) {
                                                        const ci = ((focusedIndex + offset) % total + total) % total
                                                        if (offset !== 0 && slots.some(s => s.ci === ci)) continue
                                                        slots.push({ ch: row.channels[ci], ci, offset })
                                                    }
                                                    return slots.map(({ ch, ci, offset }) => {
                                                        if (isRowFocused && offset === 0) return null
                                                        const isUnderCenter = isRowFocused && offset === 0

                                                        let translateX: number
                                                        if (isRowFocused) {
                                                            if (offset < 0) {
                                                                translateX = centralLeft - SIDE_GAP - (-offset) * (CARD_W + GAP) + GAP
                                                            } else if (offset > 0) {
                                                                translateX = centralLeft + CENTRAL_W + SIDE_GAP + (offset - 1) * (CARD_W + GAP)
                                                            } else {
                                                                // Center of the big card slot
                                                                translateX = centralLeft + Math.floor((CENTRAL_W - CARD_W) / 2)
                                                            }
                                                        } else {
                                                            translateX = uniformCenterLeft + (offset * (CARD_W + GAP))
                                                        }
                                                        const activeTopOffset = isRowFocused ? LATERAL_TOP_OFFSET : TOP_PAD

                                                        const t = row.tmdb?.get(ch.name) || ch.tmdb
                                                        const sportsArt = getSportsArtwork(ch.name)
                                                        const posterSrc = sportsArt?.poster || tmdbImg(t?.poster, 'w342') || ch.logo || ''
                                                        const isContinueRow = row.title?.includes('Assistindo') ?? false
                                                        const progress = isContinueRow ? getWatchProgress(ch.name) : 0
                                                        const lastEp = isContinueRow ? (ch as any)._lastEpisode as string | undefined : undefined

                                                        return (
                                                            <SideCard
                                                                key={`pool-${rowIdx}-${offset}`}
                                                                ci={ci}
                                                                ch={ch}
                                                                offset={offset}
                                                                translateX={translateX}
                                                                topOffset={activeTopOffset}
                                                                width={CARD_W}
                                                                height={CARD_H}
                                                                borderRadius={Math.round(8 * vw)}
                                                                border="1px solid rgba(255,255,255,0.08)"
                                                                isFocused={isRowFocused}
                                                                isUnderCenter={isUnderCenter}
                                                                posterSrc={posterSrc}
                                                                onPlay={onPlay}
                                                                progressPct={progress}
                                                                lastEpisode={lastEp}
                                                                navDir={isRowFocused ? navDirRef.current : 'right'}
                                                                moveCount={isRowFocused ? navTick : 0}
                                                            />
                                                        )
                                                    })
                                                })()}

                                                {/* Cinema Mode — escurece tela toda quando preview toca */}
                                                {isRowFocused && (
                                                    <div style={{
                                                        position: 'fixed',
                                                        top: 0, left: 0, right: 0, bottom: 0,
                                                        background: 'rgba(0,0,0,0.65)',
                                                        zIndex: 9,
                                                        pointerEvents: 'none',
                                                        opacity: cinemaMode ? 1 : 0,
                                                        transition: 'opacity 600ms ease',
                                                    }} />
                                                )}

                                                {/* CARD CENTRAL — Apenas visível na linha focada */}
                                                {fch && isRowFocused && (
                                                    <AutoplayCard
                                                        channel={fch}
                                                        isFocused={true}
                                                        onClick={() => {
                                                            if (fch.tmdb && !playerManager.isPlaying()) {
                                                                setDetailChannel(fch); detailChannelRef.current = fch
                                                                setDetailBtnFocus(0); detailBtnFocusRef.current = 0
                                                            } else {
                                                                recordPlay(fch.name, fch.group); handlePlay(fch)
                                                            }
                                                        }}
                                                        width={CENTRAL_W}
                                                        height={CENTRAL_H}
                                                        left={centralLeft}
                                                        top={TITLE_AREA}
                                                        zIndex={10}
                                                        borderRadius={Math.round(8 * vw)}
                                                        focusBorder={FOCUS_BORDER}
                                                        navDir={navDirRef.current}
                                                        backdropSrc={fBackdropSrc || null}
                                                        watchProgress={getWatchProgress(fch.name)}
                                                        onPlayingChange={(playing) => { if (playing) activateCinemaMode(); else deactivateCinemaMode() }}
                                                    >
                                                        {/* TOP RIGHT: badges — frosted glass */}
                                                        <div style={{
                                                            position: 'absolute', top: Math.round(24 * vw), right: Math.round(24 * vw),
                                                            zIndex: 20, display: 'flex', alignItems: 'center', gap: Math.round(10 * vw),
                                                            pointerEvents: 'none',
                                                        }}>
                                                            {fT?.year && (
                                                                <div style={{
                                                                    background: 'rgba(255,255,255,0.15)',
                                                                    backdropFilter: 'blur(20px)',
                                                                    WebkitBackdropFilter: 'blur(20px)',
                                                                    border: '1.5px solid rgba(255,255,255,0.35)',
                                                                    color: '#fff',
                                                                    fontSize: Math.round(22 * vw), fontWeight: 800,
                                                                    padding: `${Math.round(8 * vw)}px ${Math.round(20 * vw)}px`,
                                                                    borderRadius: 8,
                                                                    fontFamily: '"Outfit", sans-serif',
                                                                    textShadow: '0 1px 6px rgba(0,0,0,0.9)',
                                                                    boxShadow: '0 4px 24px rgba(0,0,0,0.25)',
                                                                }}>{fT.year}</div>
                                                            )}
                                                            {fQuality !== 'SD' && (
                                                                <div style={{
                                                                    background: 'rgba(255,255,255,0.15)',
                                                                    backdropFilter: 'blur(20px)',
                                                                    WebkitBackdropFilter: 'blur(20px)',
                                                                    border: '1.5px solid rgba(255,255,255,0.35)',
                                                                    color: '#fff',
                                                                    fontSize: Math.round(22 * vw), fontWeight: 800,
                                                                    padding: `${Math.round(8 * vw)}px ${Math.round(20 * vw)}px`,
                                                                    borderRadius: 8, letterSpacing: 1,
                                                                    fontFamily: '"Outfit", sans-serif',
                                                                    textShadow: '0 1px 6px rgba(0,0,0,0.9)',
                                                                    boxShadow: '0 4px 24px rgba(0,0,0,0.25)',
                                                                }}>{fQuality}</div>
                                                            )}
                                                            <div style={{
                                                                background: 'rgba(255,255,255,0.15)',
                                                                backdropFilter: 'blur(20px)',
                                                                WebkitBackdropFilter: 'blur(20px)',
                                                                border: '1.5px solid rgba(255,255,255,0.35)',
                                                                color: '#fff',
                                                                fontSize: Math.round(22 * vw), fontWeight: 800,
                                                                padding: `${Math.round(8 * vw)}px ${Math.round(20 * vw)}px`,
                                                                borderRadius: 8,
                                                                fontFamily: '"Outfit", sans-serif',
                                                                textShadow: '0 1px 6px rgba(0,0,0,0.9)',
                                                                boxShadow: '0 4px 24px rgba(0,0,0,0.25)',
                                                            }}>{fT?.ageRating || getAgeRating(fT?.genres)}</div>
                                                        </div>
                                                    </AutoplayCard>
                                                )}

                                                {/* ─── STREAMING INFO PANEL ─────────────────────────────────
                                                    Quadrado (ícone) + Retângulo (nome) à direita do card.
                                                    Posicionado no espaço entre o card e a borda direita da tela.
                                                ────────────────────────────────────────────────────────── */}
                                                {fch && isRowFocused && !row.title.includes('Continuar') && (() => {
                                                    const ICON_BOX = Math.round(156 * vw)
                                                    const ICON_H = Math.round(88 * vw)
                                                    const RECT_H = Math.round(56 * vw)
                                                    const RECT_W = CARD_W - 13
                                                    // Alinhado com o card da direita
                                                    const rectLeft = centralLeft + CENTRAL_W + SIDE_GAP + 38
                                                    const titleY = TITLE_AREA - Math.round(56 * vw) - Math.round(70 * vw)
                                                    const panelTopY = Math.round(-100 * vw)

                                                    // Busca cor pelo TÍTULO COMPLETO (title + titleAccent)
                                                    const lower = `${row.title || ''} ${row.titleAccent || ''}`.toLowerCase()
                                                    const catInfo = CATEGORY_ICONS[(fch.group || '').toLowerCase()] || { emoji: '📺', color: '#60a5fa' }

                                                    const STREAMING_COLORS: Record<string, [string, string]> = {
                                                        netflix:   ['#e50914', 'rgba(229,9,20,0.5)'],
                                                        amazon:    ['#00a8e1', 'rgba(0,168,225,0.5)'],
                                                        prime:     ['#00a8e1', 'rgba(0,168,225,0.5)'],
                                                        disney:    ['#113ccf', 'rgba(17,60,207,0.5)'],
                                                        max:       ['#0064ff', 'rgba(0,100,255,0.5)'],
                                                        hbo:       ['#0064ff', 'rgba(0,100,255,0.5)'],
                                                        apple:     ['#a1a1a6', 'rgba(255,255,255,0.3)'],
                                                        youtube:   ['#ff0000', 'rgba(255,0,0,0.4)'],
                                                        paramount: ['#0164ff', 'rgba(1,100,255,0.5)'],
                                                        globo:     ['#ff6b00', 'rgba(255,107,0,0.5)'],
                                                        star:      ['#032541', 'rgba(3,37,65,0.5)'],
                                                    }
                                                    const colorKey = Object.keys(STREAMING_COLORS).find(k => lower.includes(k))
                                                    const [accentColor, glowColor] = colorKey
                                                        ? STREAMING_COLORS[colorKey]
                                                        : [ACCENT, 'rgba(255,0,110,0.5)']

                                                    // Label completo: "Netflix Filmes", "Ação", "TV ao Vivo" etc.
                                                    const fullLabel = [row.title?.trim(), row.titleAccent?.trim()].filter(Boolean).join(' ')
                                                    const streamingLabel = fullLabel || (fch.group || 'Streaming').replace(/_/g, ' ')

                                                    return (
                                                        <div
                                                            key={`sp-${fch.id}`}
                                                            style={{
                                                                position: 'absolute',
                                                                right: Math.round(36 * vw),
                                                                top: panelTopY,
                                                                zIndex: 20,
                                                                pointerEvents: 'none',
                                                                display: 'flex',
                                                                flexDirection: 'column',
                                                                alignItems: 'center',
                                                                gap: Math.round(10 * vw),
                                                                opacity: 1,
                                                            }}
                                                        >
                                                            {/* ── Badge estilizado — dinâmico, sem logos de terceiros ── */}
                                                            <div style={{
                                                                minWidth: ICON_BOX,
                                                                height: ICON_H,
                                                                borderRadius: Math.round(14 * vw),
                                                                background: `linear-gradient(135deg, rgba(0,0,0,0.7) 0%, rgba(20,20,25,0.85) 100%)`,
                                                                backdropFilter: 'blur(12px)',
                                                                WebkitBackdropFilter: 'blur(12px)',
                                                                border: `1.5px solid ${accentColor}44`,
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                padding: `0 ${Math.round(24 * vw)}px`,
                                                                gap: Math.round(10 * vw),
                                                                overflow: 'hidden',
                                                                flexShrink: 0,
                                                                boxShadow: `0 0 30px 6px ${glowColor}, inset 0 1px 0 rgba(255,255,255,0.08)`,
                                                            }}>
                                                                {/* Nome da streaming — texto puro */}
                                                                <span style={{
                                                                    fontFamily: '"Outfit", sans-serif',
                                                                    fontSize: Math.round(20 * vw),
                                                                    fontWeight: 800,
                                                                    color: accentColor,
                                                                    letterSpacing: Math.round(2 * vw),
                                                                    textTransform: 'uppercase',
                                                                    textShadow: `0 0 12px ${glowColor}, 0 0 4px ${accentColor}88`,
                                                                    whiteSpace: 'nowrap',
                                                                }}>
                                                                    {streamingLabel}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    )
                                                })()}

                                                {/* TÍTULO EXTERNO — acima do card, some no cinema mode */}
                                                {fch && isRowFocused && (() => {
                                                    const _anim = navDirRef.current === 'left' ? 'slideFromLeft'
                                                        : navDirRef.current === 'right' ? 'slideFromRight'
                                                            : navDirRef.current === 'up' ? 'slideFromTop' : 'slideFromBottom'

                                                    // Detecta tipo de conteúdo — verifica channel, tmdb e group
                                                    const _mt = fch.mediaType || fT?.mediaType
                                                    const contentType =
                                                        (fch.group === 'esportes' || fch.group === 'abertos') ? 'TV AO VIVO'
                                                        : (_mt === 'tv' || fch.group === 'series') ? 'SÉRIE'
                                                        : 'FILME'

                                                    const genres = fT?.genres?.length ? fT.genres : []

                                                    return (
                                                        <div key={`xt-${fch.id}`} style={{
                                                            position: 'absolute',
                                                            left: centralLeft + Math.round(28 * vw),
                                                            bottom: DESC_AREA + Math.round(28 * vw),
                                                            maxWidth: Math.round(window.innerWidth * 0.65),
                                                            zIndex: 15, pointerEvents: 'none',
                                                            animation: `${_anim} 280ms cubic-bezier(0.2,0,0.3,1) both`,
                                                            opacity: cinemaMode ? 0 : 1,
                                                            transition: 'opacity 700ms ease',
                                                        }}>
                                                            <div style={{
                                                                fontSize: Math.round(18 * vw),
                                                                fontWeight: 600,
                                                                color: 'rgba(255,255,255,0.55)',
                                                                fontFamily: '"Outfit", sans-serif',
                                                                letterSpacing: 2,
                                                                textTransform: 'uppercase',
                                                                marginBottom: Math.round(6 * vw),
                                                                textAlign: 'left',
                                                            }}>
                                                                {contentType}
                                                            </div>

                                                            <div style={{
                                                                fontSize: Math.round(56 * vw), fontWeight: 800, lineHeight: 0.95,
                                                                color: '#fff',
                                                                fontFamily: '"Barlow Condensed", "Outfit", sans-serif',
                                                                letterSpacing: 1,
                                                                textAlign: 'left',
                                                                textShadow: '0 2px 14px rgba(0,0,0,0.6), 0 4px 48px rgba(0,0,0,0.5)',
                                                                wordWrap: 'break-word',
                                                                whiteSpace: 'normal',
                                                                marginBottom: Math.round(10 * vw),
                                                            }}>
                                                                {fT?.title || fch.name.replace(/[\[\]\{\}\(\)]/g, '').trim()}
                                                            </div>

                                                            {/* Duração · Nota */}
                                                            {(fT?.runtime || fT?.rating) && (
                                                                <div style={{
                                                                    display: 'flex', alignItems: 'center',
                                                                    gap: Math.round(10 * vw),
                                                                    marginBottom: Math.round(8 * vw),
                                                                    fontSize: Math.round(17 * vw), fontWeight: 500,
                                                                    color: 'rgba(255,255,255,0.65)',
                                                                    fontFamily: '"Outfit", sans-serif',
                                                                    letterSpacing: 0.3,
                                                                }}>
                                                                    {fT?.runtime && <span>{fT.runtime} min</span>}
                                                                    {fT?.runtime && fT?.rating && <span style={{ opacity: 0.4 }}>•</span>}
                                                                    {fT?.rating && <span>★ {fT.rating.toFixed(1)}</span>}
                                                                </div>
                                                            )}

                                                            {/* Diretor */}
                                                            {fT?.director && (
                                                                <div style={{
                                                                    fontSize: Math.round(16 * vw), fontWeight: 500,
                                                                    color: 'rgba(255,255,255,0.5)',
                                                                    fontFamily: '"Outfit", sans-serif',
                                                                    marginBottom: Math.round(6 * vw),
                                                                    letterSpacing: 0.2,
                                                                }}>
                                                                    Dir. {fT.director}
                                                                </div>
                                                            )}

                                                            {/* Elenco */}
                                                            {fT?.cast && fT.cast.length > 0 && (
                                                                <div style={{
                                                                    fontSize: Math.round(15 * vw), fontWeight: 400,
                                                                    color: 'rgba(255,255,255,0.38)',
                                                                    fontFamily: '"Outfit", sans-serif',
                                                                    marginBottom: Math.round(12 * vw),
                                                                    letterSpacing: 0.2,
                                                                    whiteSpace: 'nowrap',
                                                                    overflow: 'hidden',
                                                                    textOverflow: 'ellipsis',
                                                                }}>
                                                                    Com: {fT.cast.slice(0, 3).join(' · ')}
                                                                </div>
                                                            )}

                                                            {/* Gêneros — todas as categorias */}
                                                            <div style={{
                                                                display: 'flex', flexWrap: 'wrap',
                                                                gap: Math.round(8 * vw),
                                                            }}>
                                                                {genres.map((g, i) => (
                                                                    <div key={i} style={{
                                                                        background: 'rgba(255,255,255,0.15)',
                                                                        backdropFilter: 'blur(20px)',
                                                                        WebkitBackdropFilter: 'blur(20px)',
                                                                        border: '1px solid rgba(255,255,255,0.28)',
                                                                        color: 'rgba(255,255,255,0.9)',
                                                                        fontSize: Math.round(15 * vw), fontWeight: 600,
                                                                        padding: `${Math.round(4 * vw)}px ${Math.round(14 * vw)}px`,
                                                                        borderRadius: 40, letterSpacing: 0.8,
                                                                        textTransform: 'uppercase',
                                                                        fontFamily: '"Outfit", sans-serif',
                                                                        textShadow: '0 1px 4px rgba(0,0,0,0.8)',
                                                                        whiteSpace: 'nowrap',
                                                                    }}>{g}</div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )
                                                })()}

                                                {/* DESCRIÇÃO EXTERNA — abaixo do card, espaçamento assimétrico Apple */}
                                                {fch && isRowFocused && fOverview && (() => {
                                                    const _anim = navDirRef.current === 'left' ? 'slideFromLeft'
                                                        : navDirRef.current === 'right' ? 'slideFromRight'
                                                            : navDirRef.current === 'up' ? 'slideFromTop' : 'slideFromBottom'
                                                    return (
                                                        <div key={`xd-${fch.id}`} style={{
                                                            position: 'absolute',
                                                            left: centralLeft,
                                                            top: TITLE_AREA + CENTRAL_H + Math.round(15 * vw),
                                                            width: CENTRAL_W,
                                                            zIndex: 15, pointerEvents: 'none',
                                                            animation: `${_anim} 320ms 40ms cubic-bezier(0.2,0,0.3,1) both`,
                                                            opacity: cinemaMode ? 0 : 1,
                                                            transition: 'opacity 700ms ease',
                                                        }}>
                                                            <div style={{
                                                                fontSize: Math.round(24 * vw),
                                                                color: 'rgba(255,255,255,0.5)',
                                                                lineHeight: 1.6,
                                                                textAlign: 'left',
                                                                display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
                                                                overflow: 'hidden',
                                                                fontFamily: '"Outfit", sans-serif',
                                                                fontWeight: 300,
                                                                letterSpacing: 0.3,
                                                            }}>
                                                                {fOverview}
                                                            </div>
                                                        </div>
                                                    )
                                                })()}

                                            </div>
                                        )
                                    })()}

                                    {/* Espaço abaixo dos cards */}
                                </div>
                            )
                        })}
                        {/* Espaço morto para o footer de paginação */}
                        <div style={{ height: 400 }} />
                        {/* Fechamento do bloco `rowsWrapRef` manipulado via GPU */}
                    </div>
                </div>

                {/* COPA VIEW */}
                {activeView === 'copa' && !isLoadingContent && (
                    <div style={{ position: 'absolute', inset: 0, zIndex: 50 }}>
                        <CopaView vw={vw} onBack={() => setActiveView('home')} />
                    </div>
                )}

                {/* SKELETON SHIMMER LOADING */}
                {isLoadingContent && focusZone === 'content' && (
                    <div style={{
                        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.92)', zIndex: 80, padding: '120px 80px 0',
                    }}>
                        <div style={{
                            width: 42,
                            height: 42,
                            margin: '0 auto 26px',
                            borderRadius: '50%',
                            border: '3px solid rgba(255,255,255,0.2)',
                            borderTopColor: ACCENT,
                            animation: 'spin 800ms linear infinite',
                        }} />
                        {[0, 1, 2].map(r => (
                            <div key={r} style={{ marginBottom: 48 }}>
                                <div style={{
                                    width: 220, height: 22, borderRadius: 6,
                                    background: 'rgba(255,255,255,0.06)', marginBottom: 20,
                                    animation: 'shimmer 1.8s ease-in-out infinite',
                                }} />
                                <div style={{ display: 'flex' }}>
                                    {[0, 1, 2, 3, 4, 5].map(c => (
                                        <div key={c} style={{
                                            width: 317, height: 475, borderRadius: 8, flexShrink: 0,
                                            background: 'linear-gradient(110deg, rgba(255,255,255,0.04) 30%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 70%)',
                                            backgroundSize: '300% 100%',
                                            animation: 'shimmer 1.8s ease-in-out infinite',
                                            animationDelay: `${c * 120}ms`,
                                        }} />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* EXIT DIALOG */}
                {showExit && (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.85)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        zIndex: 9999,
                    }}>
                        <div style={{
                            background: 'linear-gradient(135deg, #1a1a1a 0%, #0f0f0f 100%)',
                            border: `2px solid rgba(255,0,110,0.3)`, borderRadius: 16,
                            padding: '60px 80px', textAlign: 'center', maxWidth: 600,
                            boxShadow: `0 0 60px ${GLOW}`,
                        }}>
                            <div style={{ fontSize: 40, fontWeight: 700, marginBottom: 12 }}>
                                sair do <span style={{ color: ACCENT }}>ziiiTV</span>?
                            </div>
                            <div style={{ fontSize: 18, color: TEXT_MUTED, marginBottom: 40 }}>tem certeza que deseja sair?</div>
                            <div style={{ display: 'flex', justifyContent: 'center' }}>
                                {['cancelar', 'sair'].map((label, i) => {
                                    const f = exitFocus === i
                                    return (
                                        <div key={i} style={{
                                            background: i === 1 ? (f ? ACCENT : 'rgba(255,0,110,0.3)') : (f ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)'),
                                            padding: '16px 48px', borderRadius: 100, fontSize: 22,
                                            fontWeight: 700, cursor: 'pointer', textTransform: 'lowercase',
                                            border: f ? `3px solid ${ACCENT}` : '3px solid transparent',
                                            transform: f ? 'scale(1.08)' : 'scale(1)',
                                            boxShadow: f ? `0 0 24px ${GLOW}` : 'none',
                                            transition: 'all 200ms',
                                        }}>{label}</div>
                                    )
                                })}
                            </div>
                        </div>
                    </div>
                )}

                <style>{`
            @keyframes fadeInHero {
              from { opacity: 0; transform: translateY(12px); }
              to   { opacity: 1; transform: translateY(0);    }
            }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes shimmer {
          0%   { background-position:  200% 0; }
          100% { background-position: -200% 0; }
        }
        *::-webkit-scrollbar { display: none; }
        * { scrollbar-width: none; }
        @keyframes fadeInDetail {
          from { opacity: 0; transform: scale(0.97); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes slotEnter-right  { from { transform: translateX(6%);  opacity: 0.7 } to { transform: translateX(0); opacity: 1 } }
        @keyframes slotEnter-left   { from { transform: translateX(-6%); opacity: 0.7 } to { transform: translateX(0); opacity: 1 } }
        @keyframes slotEnter-down   { from { transform: translateY(3%);  opacity: 0.5 } to { transform: translateY(0); opacity: 1 } }
        @keyframes slotEnter-up     { from { transform: translateY(-3%); opacity: 0.5 } to { transform: translateY(0); opacity: 1 } }
        @keyframes fadeIn           { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slotEnter-down-card { from { margin-top: 30px; opacity: 0.5 } to { margin-top: 0; opacity: 1 } }
        @keyframes slotEnter-up-card   { from { margin-top: -30px; opacity: 0.5 } to { margin-top: 0; opacity: 1 } }
        @keyframes alienPeek        { from { opacity: 0; transform: translateX(30px) } to { opacity: 0.9; transform: translateX(0) } }
          `}</style>
            </div>

            {/* ─── Detail Overlay — filmes/séries antes do preview iniciar ─── */}
            {detailChannel && (
                <DetailOverlay
                    channel={detailChannel}
                    btnFocus={detailBtnFocus}
                    accent={ACCENT}
                    glow={GLOW}
                    onClose={() => { setDetailChannel(null); detailChannelRef.current = null }}
                    onPlay={(ch) => {
                        setDetailChannel(null); detailChannelRef.current = null
                        recordPlay(ch.name, ch.group); handlePlay(ch)
                    }}
                />
            )}
        </div>

        {/* Alien — sempre visível no canto superior esquerdo */}
        <img
            src="./alien-peek.png"
            style={{
                position: 'fixed',
                top: focusZone === 'sidebar' ? -129 : -86,
                left: focusZone === 'sidebar' ? 94 : -187,
                width: focusZone === 'sidebar' ? 454 : 390,
                height: focusZone === 'sidebar' ? 454 : 390,
                zIndex: 9999,
                pointerEvents: 'none',
                transition: 'all 300ms cubic-bezier(0.2, 0, 0, 1)',
                transform: 'translate3d(0,0,0)',
            }}
        />
    </>)
}
