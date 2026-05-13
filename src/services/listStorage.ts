export interface SavedList {
  code: string
  savedAt: string
  channelCount?: number
}

const KEY = 'ziiiTV_savedLists'

export function getSavedLists(): SavedList[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') } catch { return [] }
}

export function saveList(code: string, channelCount?: number): void {
  const lists = getSavedLists().filter(l => l.code !== code)
  lists.unshift({ code, savedAt: new Date().toISOString(), channelCount })
  localStorage.setItem(KEY, JSON.stringify(lists))
  localStorage.setItem('ziiiTV_lastCode', code)
}

export function removeList(code: string): void {
  const lists = getSavedLists().filter(l => l.code !== code)
  localStorage.setItem(KEY, JSON.stringify(lists))
  const active = localStorage.getItem('ziiiTV_lastCode')
  if (active === code) {
    const next = lists[0]?.code ?? null
    if (next) localStorage.setItem('ziiiTV_lastCode', next)
    else      localStorage.removeItem('ziiiTV_lastCode')
  }
}

export function activateList(code: string): void {
  localStorage.setItem('ziiiTV_lastCode', code)
}
