import React from 'react'
import type { DashboardView } from './homeTypes'

export const TEXT_MUTED = '#a0a0a0'

export const FOCUS_SCALE = 1.08
export const FOCUS_DURATION = 0
export const FOCUS_EASING = 'linear'
export const UNFOCUS_OPACITY = 0.85

export const SIDEBAR_ICONS: Array<{ svg: React.ReactNode; label: string; action?: string }> = [
  {
    svg: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>,
    label: 'Início',
  },
  {
    svg: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14" /><rect x="3" y="6" width="12" height="12" rx="2" /></svg>,
    label: 'Filmes',
  },
  {
    svg: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></svg>,
    label: 'Séries',
  },
  {
    svg: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="2" /><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" /></svg>,
    label: 'TV ao Vivo',
  },
  {
    svg: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 010-5H6" /><path d="M18 9h1.5a2.5 2.5 0 000-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0012 0V2z" /></svg>,
    label: 'COPA',
  },
  {
    svg: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>,
    label: 'Gerenciar Lista',
    action: 'manage-list',
  },
  {
    svg: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" /></svg>,
    label: 'Perfil',
  },
]

export const TOPBAR_LINKS: Array<{ label: string; view: DashboardView }> = [
  { label: 'INICIO', view: 'home' },
  { label: 'filmes', view: 'movies' },
  { label: 'séries', view: 'series' },
  { label: 'tv ao vivo', view: 'live' },
  { label: '🏆 copa', view: 'copa' },
]

// Links disponíveis conforme existência de canais na lista
export function getAvailableTopbarLinks(hasChannels: boolean): Array<{ label: string; view: DashboardView }> {
  if (hasChannels) return TOPBAR_LINKS
  // Sem lista: só Copa
  return [{ label: '🏆 copa 2026', view: 'copa' }]
}

// Sidebar sempre completo — app é IPTV player puro, sem lista vai para SetupScreen
export function getAvailableSidebarIcons(): Array<{ svg: React.ReactNode; label: string; action?: string }> {
  return SIDEBAR_ICONS
}


export const CATEGORY_ICONS: Record<string, { emoji: string; color: string }> = {
  filmes:        { emoji: '🎬', color: '#a78bfa' },
  series:        { emoji: '📺', color: '#60a5fa' },
  esportes:      { emoji: '⚽', color: '#4ade80' },
  infantil:      { emoji: '🧸', color: '#f472b6' },
  abertos:       { emoji: '📡', color: '#60a5fa' },
  documentarios: { emoji: '🌍', color: '#34d399' },
  noticias:      { emoji: '📰', color: '#94a3b8' },
  outros:        { emoji: '🔥', color: '#ff6b35' },
  'Top Filmes':  { emoji: '⭐', color: '#fbbf24' },
  'Top Séries':  { emoji: '🏆', color: '#fbbf24' },
  'Lançamentos': { emoji: '🆕', color: '#fb7185' },
  'Comédias':    { emoji: '😂', color: '#fcd34d' },
  'Variados':    { emoji: '🍕', color: '#a78bfa' },
  '4K & UHD':   { emoji: '🖥️', color: '#818cf8' },
  'Ação':        { emoji: '💥', color: '#f87171' },
  'Terror':      { emoji: '👻', color: '#9ca3af' },
  'Nacionais':   { emoji: '🇧🇷', color: '#4ade80' },
  'Drama':       { emoji: '🎭', color: '#a78bfa' },
  'Animes':      { emoji: '👺', color: '#f472b6' },
  'Infantil':    { emoji: '🧸', color: '#f472b6' },
}
