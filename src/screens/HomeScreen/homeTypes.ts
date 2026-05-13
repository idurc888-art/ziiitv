import type { UICategory } from '../../services/categoryMapper'
import type { Channel } from '../../types/channel'

export interface HomeScreenProps {
  groups: Record<UICategory, Channel[]>
  onPlay: (ch: Channel) => void
  onBack: () => void
}

export type FocusZone = 'sidebar' | 'topbar' | 'hero' | 'content'
export type DashboardView = 'home' | 'movies' | 'series' | 'live' | 'copa'
