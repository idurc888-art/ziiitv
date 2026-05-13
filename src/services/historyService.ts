// History Service — Histórico de reprodução local
// Armazena plays e timestamps em localStorage
// Desbloqueia: "Continuar Assistindo" e "Mais Vistos"
// Zero dependência externa

interface HistoryEntry {
  plays: number
  lastWatched: number   // timestamp ms
  duration?: number
  category?: string
  heroOffsetMs?: number
  progressPct?: number  // 1–98: posição percentual salva para barra de progresso
  lastEpisode?: string  // ex: "S01E03" — último episódio de uma série
}

const STORAGE_KEY = 'ziiiTV_history'
const MAX_ENTRIES = 200 // Limita para não estourar localStorage

// ─── Leitura ────────────────────────────────────────────────────────────────

function getAll(): Record<string, HistoryEntry> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

function saveAll(data: Record<string, HistoryEntry>): void {
  try {
    // Se passar do limite, remove os mais antigos
    const entries = Object.entries(data)
    if (entries.length > MAX_ENTRIES) {
      entries.sort((a, b) => b[1].lastWatched - a[1].lastWatched)
      const maxEntries = entries.slice(0, MAX_ENTRIES)
      data = {}
      for (const [key, val] of maxEntries) {
        data[key] = val
      }
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch (e) {
    console.warn('[History] Erro ao salvar:', e)
  }
}

// ─── API Pública ────────────────────────────────────────────────────────────

/**
 * Registra que o usuário assistiu este canal.
 * Incrementa plays e atualiza timestamp.
 */
export function recordPlay(channelName: string, category?: string): void {
  const all = getAll()
  const existing = all[channelName]

  all[channelName] = {
    plays: (existing?.plays || 0) + 1,
    lastWatched: Date.now(),
    category: category || existing?.category,
  }

  saveAll(all)
  console.log(`[History] recorded: "${channelName}" (${all[channelName].plays} plays)`)
}

/**
 * Retorna os últimos N canais assistidos, ordenados por mais recente.
 * Usado para "Continuar Assistindo".
 */
export function getRecentlyWatched(limit: number = 15): Array<{ name: string } & HistoryEntry> {
  const all = getAll()
  return Object.entries(all)
    .map(([name, entry]) => ({ name, ...entry }))
    .sort((a, b) => b.lastWatched - a.lastWatched)
    .slice(0, limit)
}

/**
 * Retorna os N canais mais assistidos, ordenados por plays desc.
 * Usado para "Mais Vistos" / "Top 10".
 */
export function getMostWatched(limit: number = 10): Array<{ name: string } & HistoryEntry> {
  const all = getAll()
  return Object.entries(all)
    .map(([name, entry]) => ({ name, ...entry }))
    .sort((a, b) => b.plays - a.plays)
    .slice(0, limit)
}

/**
 * Verifica se um canal já foi assistido.
 */
export function wasWatched(channelName: string): boolean {
  return !!getAll()[channelName]
}

export function clearHistory(): void {
  localStorage.removeItem(STORAGE_KEY)
  console.log('[History] cleared')
}

export function saveWatchProgress(channelName: string, progressPct: number): void {
  if (progressPct < 1 || progressPct > 98) return
  const all = getAll()
  const existing = all[channelName] || { plays: 0, lastWatched: Date.now() }
  all[channelName] = { ...existing, progressPct: Math.round(progressPct) }
  saveAll(all)
}

export function getWatchProgress(channelName: string): number {
  return getAll()[channelName]?.progressPct ?? 0
}

// ─── Genre Preference Tracking ─────────────────────────────────────────────
const GENRE_KEY = 'ziiiTV_genreScores'

export function recordNavigation(genres: string[]): void {
  try {
    const raw = localStorage.getItem(GENRE_KEY)
    const scores: Record<string, number> = raw ? JSON.parse(raw) : {}
    for (const g of genres) {
      if (g) scores[g] = (scores[g] || 0) + 1
    }
    localStorage.setItem(GENRE_KEY, JSON.stringify(scores))
  } catch {}
}

export function getGenreScores(): Record<string, number> {
  try {
    const raw = localStorage.getItem(GENRE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

// ─── Episode-level tracking ─────────────────────────────────────────────────

function epKey(channelName: string, code: string): string {
  return `${channelName}||ep||${code}`
}

export function saveEpisodeProgress(channelName: string, code: string, pct: number): void {
  if (pct < 1 || pct > 99) return
  const all = getAll()
  const key = epKey(channelName, code)
  const existing = all[key] || { plays: 0, lastWatched: Date.now() }
  all[key] = { ...existing, progressPct: Math.round(pct), lastWatched: Date.now() }
  // Atualiza entrada da série com lastEpisode
  const series = all[channelName] || { plays: 0, lastWatched: Date.now() }
  all[channelName] = { ...series, lastEpisode: code, lastWatched: Date.now() }
  saveAll(all)
}

export function getEpisodeProgress(channelName: string, code: string): number {
  return getAll()[epKey(channelName, code)]?.progressPct ?? 0
}

export function markEpisodeWatched(channelName: string, code: string): void {
  const all = getAll()
  const key = epKey(channelName, code)
  const existing = all[key] || { plays: 0, lastWatched: Date.now() }
  all[key] = { ...existing, progressPct: 99, plays: (existing.plays || 0) + 1, lastWatched: Date.now() }
  const series = all[channelName] || { plays: 0, lastWatched: Date.now() }
  all[channelName] = {
    ...series,
    lastEpisode: code,
    plays: (series.plays || 0) + 1,
    lastWatched: Date.now(),
  }
  saveAll(all)
}

export function getLastEpisode(channelName: string): string | null {
  return (getAll()[channelName] as any)?.lastEpisode ?? null
}

// ─── Hero / Card Preview Offset ─────────────────────────────────────────────

/**
 * Retorna o offset salvo para preview de hero/card.
 * Se nunca assistiu, retorna 0 (começa do início).
 */
export function getHeroOffset(channelName: string): number {
  const all = getAll()
  const entry = all[channelName]
  return entry?.heroOffsetMs ?? 0
}

/**
 * Salva o offset de preview para retomar na próxima visita.
 */
export function saveHeroOffset(channelName: string, offsetMs: number): void {
  const all = getAll()
  const existing = all[channelName]

  all[channelName] = {
    ...(existing || { plays: 0, lastWatched: Date.now() }),
    heroOffsetMs: offsetMs,
  }

  saveAll(all)
}
