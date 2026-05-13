// unmatchedCatalog.ts — conteúdo sem canonical_id, organizado por streaming e gênero
// Alimentado por channelsStore.loadFromCode, consumido por contentSelector

import type { Channel } from '../types/channel'

interface GenreEntry {
  label: string    // texto legível, ex: "Ação", "Terror"
  channels: Channel[]
}

class UnmatchedCatalogClass {
  private _byStreaming = new Map<string, Channel[]>()
  private _byGenre     = new Map<string, GenreEntry>()
  private _ready       = false

  inject(
    streamingRows: Record<string, Channel[]>,
    genreRows:     Record<string, GenreEntry>,
  ): void {
    this._byStreaming.clear()
    this._byGenre.clear()
    for (const [k, v] of Object.entries(streamingRows)) this._byStreaming.set(k, v)
    for (const [k, v] of Object.entries(genreRows))     this._byGenre.set(k, v)
    this._ready = true
    console.log(
      `[UnmatchedCatalog] ${this._byStreaming.size} streamings, ` +
      `${this._byGenre.size} gêneros de filmes`
    )
  }

  getStreaming(key: string): Channel[] { return this._byStreaming.get(key) ?? [] }
  getGenre(key: string):     Channel[] { return this._byGenre.get(key)?.channels ?? [] }

  streamingEntries(): [string, Channel[]][]       { return Array.from(this._byStreaming.entries()) }
  genreEntries():     [string, GenreEntry][]       { return Array.from(this._byGenre.entries()) }

  get ready(): boolean { return this._ready }
  get totalChannels(): number {
    const s = Array.from(this._byStreaming.values()).reduce((a, v) => a + v.length, 0)
    const g = Array.from(this._byGenre.values()).reduce((a, v) => a + v.channels.length, 0)
    return s + g
  }

  reset(): void {
    this._byStreaming.clear()
    this._byGenre.clear()
    this._ready = false
  }
}

export const UnmatchedCatalog = new UnmatchedCatalogClass()
