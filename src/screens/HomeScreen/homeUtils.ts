import type { ContentRow } from '../../services/contentSelector'

const STATE_KEY = 'ziiiTV_homeState'

export function tmdbImg(path: string | undefined | null, size = 'w342'): string | null {
  if (!path) return null
  if (path.startsWith('http')) return path
  if (path.startsWith('/')) return `https://image.tmdb.org/t/p/${size}${path}`
  return null
}

export function getAgeRating(genres?: string[]): string {
  if (!genres?.length) return '12+'
  const lower = genres.map(g => g.toLowerCase())
  if (lower.some(g =>
    g.includes('terror') || g.includes('horror') || g.includes('crime') ||
    g.includes('thriller') || g.includes('guerra') || g.includes('war')
  )) return '16+'
  if (lower.some(g =>
    g.includes('animação') || g.includes('animation') ||
    g.includes('família') || g.includes('family') ||
    g.includes('infantil') || g.includes('children')
  )) return 'Livre'
  return '12+'
}

export function saveNavState(data: {
  focusZone: string
  contentRow: number
  contentCols: number[]
  activeView: string
}): void {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(data)) } catch (_) {}
}

export function loadNavState(): {
  focusZone?: string
  contentRow?: number
  contentCols?: number[]
  activeView?: string
} | null {
  try { return JSON.parse(localStorage.getItem(STATE_KEY) || 'null') } catch (_) { return null }
}

export function buildInitialCols(rows: ContentRow[]): number[] {
  return rows.map(row => {
    const isContinue = /continuar/i.test(`${row.title} ${row.titleAccent}`)
    if (isContinue) return 0
    const max = Math.min(row.channels.length - 2, 8)
    return max > 0 ? Math.floor(Math.random() * max) : 0
  })
}
